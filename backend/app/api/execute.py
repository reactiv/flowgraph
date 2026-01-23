"""Dynamic endpoint execution routes (/x/)."""

import json

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from app.db import graph_store
from app.models import EndpointExecuteRequest, EndpointExecuteResponse
from app.models.endpoint import ApplyPreviewRequest, ApplyPreviewResponse
from app.services.endpoint_executor import EndpointExecutor

router = APIRouter()

# Global executor instance
_executor: EndpointExecutor | None = None


def get_executor() -> EndpointExecutor:
    """Get or create the endpoint executor."""
    global _executor
    if _executor is None:
        _executor = EndpointExecutor()
    return _executor


# ==================== Dynamic Endpoint Execution ====================


@router.api_route(
    "/x/{workflow_id}/{slug}",
    methods=["GET", "POST", "PUT", "DELETE"],
)
async def execute_endpoint(
    workflow_id: str,
    slug: str,
    request: Request,
    learn: bool = Query(False, description="Run in learn mode to generate/update SKILL.md"),
) -> EndpointExecuteResponse:
    """Execute a workflow endpoint.

    Supports all HTTP methods (GET, POST, PUT, DELETE).
    The endpoint must be configured with the matching http_method.

    Query params:
        learn: If true, runs full transformer and saves learned SKILL.md
    """
    # Verify workflow exists
    workflow = await graph_store.get_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Get endpoint by slug
    endpoint = await graph_store.get_endpoint_by_slug(workflow_id, slug)
    if endpoint is None:
        raise HTTPException(
            status_code=404, detail=f"Endpoint '{slug}' not found"
        )

    # Verify HTTP method matches
    if endpoint.http_method != request.method:
        raise HTTPException(
            status_code=405,
            detail=f"Endpoint '{slug}' requires {endpoint.http_method}, got {request.method}",
        )

    # Get input data from request body
    input_data: dict | list | str | None = None
    if request.method in ["POST", "PUT"]:
        try:
            body = await request.body()
            if body:
                input_data = json.loads(body)
        except json.JSONDecodeError:
            # Accept raw text as input
            input_data = body.decode("utf-8") if body else None
    elif request.method == "GET":
        # For GET, use query params as input
        query_params = dict(request.query_params)
        query_params.pop("learn", None)  # Remove our own param
        if query_params:
            input_data = query_params
    elif request.method == "DELETE":
        # For DELETE, check for body or query params
        try:
            body = await request.body()
            if body:
                input_data = json.loads(body)
        except (json.JSONDecodeError, Exception):
            query_params = dict(request.query_params)
            query_params.pop("learn", None)
            if query_params:
                input_data = query_params

    # Execute
    executor = get_executor()
    return await executor.execute(endpoint, workflow, input_data, learn=learn)


@router.post("/x/{workflow_id}/{slug}/stream")
async def execute_endpoint_stream(
    workflow_id: str,
    slug: str,
    body: EndpointExecuteRequest,
) -> StreamingResponse:
    """Execute a workflow endpoint with SSE streaming.

    Returns Server-Sent Events for real-time progress updates.
    Useful for learn mode where the transformer takes longer.

    Events:
        - phase: Execution phase change
        - tool_call: Transformer calling a tool
        - tool_result: Tool execution result
        - validation: Schema validation result
        - skill_saved: SKILL.md was saved
        - complete: Execution complete
        - error: Error occurred
    """
    # Verify workflow exists
    workflow = await graph_store.get_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Get endpoint by slug
    endpoint = await graph_store.get_endpoint_by_slug(workflow_id, slug)
    if endpoint is None:
        raise HTTPException(
            status_code=404, detail=f"Endpoint '{slug}' not found"
        )

    executor = get_executor()

    async def event_generator():
        """Generate SSE events from endpoint execution."""
        async for event in executor.execute_with_events(
            endpoint, workflow, body.input_data, learn=body.learn, apply=body.apply
        ):
            event_type = event.get("event", "message")

            # Skip keepalive events in SSE (client handles reconnection)
            if event_type == "keepalive":
                yield ": keepalive\n\n"
                continue

            # Format as SSE
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/x/{workflow_id}/{slug}/apply")
async def apply_endpoint_preview(
    workflow_id: str,
    slug: str,
    body: ApplyPreviewRequest,
) -> ApplyPreviewResponse:
    """Apply a previously previewed endpoint result.

    When an endpoint is executed with apply=False, it returns a transform_result
    that can be reviewed before applying. This endpoint applies that result.

    Args:
        workflow_id: The workflow ID.
        slug: The endpoint slug.
        body: Contains the transform_result to apply.

    Returns:
        ApplyPreviewResponse with applied changes counts.
    """
    # Verify workflow exists
    workflow = await graph_store.get_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Get endpoint by slug
    endpoint = await graph_store.get_endpoint_by_slug(workflow_id, slug)
    if endpoint is None:
        raise HTTPException(
            status_code=404, detail=f"Endpoint '{slug}' not found"
        )

    executor = get_executor()
    result = await executor.apply_preview(
        endpoint, workflow_id, body.transform_result, body.match_result
    )

    return ApplyPreviewResponse(
        success=True,
        nodes_created=result.get("nodes_created", 0),
        nodes_updated=result.get("nodes_updated", 0),
        nodes_deleted=result.get("nodes_deleted", 0),
        edges_created=result.get("edges_created", 0),
    )
