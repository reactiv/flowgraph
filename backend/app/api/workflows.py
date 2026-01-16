"""Workflow API routes."""

import asyncio
import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.db import graph_store
from app.llm import (
    DataGenerator,
    NodeSuggestionGenerator,
    SchemaGenerationOptions,
    SchemaGenerator,
    SchemaValidationResult,
    SeedConfig,
    ViewGenerator,
)
from app.models import (
    Edge,
    EdgeCreate,
    Event,
    Node,
    NodeCreate,
    NodeUpdate,
    SuggestionRequest,
    SuggestionResponse,
    WorkflowDefinition,
)
from app.models.workflow import (
    ViewTemplate,
    ViewTemplateCreate,
    ViewTemplateUpdate,
    WorkflowSummary,
)

router = APIRouter()

TEMPLATES_DIR = Path(__file__).parent.parent.parent / "templates"


class CreateFromTemplateRequest(BaseModel):
    """Request to create a workflow from a template."""

    template_id: str


class CreateFromLanguageRequest(BaseModel):
    """Request to create a workflow schema from natural language."""

    description: str
    options: SchemaGenerationOptions | None = None


class CreateFromLanguageResponse(BaseModel):
    """Response with generated schema and validation results."""

    definition: WorkflowDefinition
    validation: SchemaValidationResult
    view_templates: list[ViewTemplateCreate] = []


class NodesResponse(BaseModel):
    """Response for node list queries."""

    nodes: list[Node]
    total: int
    limit: int
    offset: int


# ==================== Workflows ====================


@router.get("/workflows")
async def list_workflows() -> list[WorkflowSummary]:
    """List all workflows."""
    return await graph_store.list_workflows()


@router.post("/workflows/from-template")
async def create_from_template(request: CreateFromTemplateRequest) -> WorkflowSummary:
    """Create a new workflow from a template."""
    template_file = TEMPLATES_DIR / f"{request.template_id}.workflow.json"

    if not template_file.exists():
        raise HTTPException(
            status_code=404, detail=f"Template '{request.template_id}' not found"
        )

    with open(template_file) as f:
        data = json.load(f)

    definition = WorkflowDefinition.model_validate(data)
    return await graph_store.create_workflow(definition)


@router.post("/workflows/from-language")
async def create_from_language(
    request: CreateFromLanguageRequest,
) -> CreateFromLanguageResponse:
    """Generate a workflow schema from natural language description.

    This uses Claude to interpret the description and generate a WorkflowDefinition.
    The generated schema is returned for preview but NOT saved.
    Call POST /workflows/from-definition to save the schema.
    """
    try:
        generator = SchemaGenerator()
    except ValueError as e:
        raise HTTPException(
            status_code=500,
            detail=f"LLM client not configured: {e}. Set ANTHROPIC_API_KEY.",
        )

    options = request.options or SchemaGenerationOptions()

    try:
        definition, validation = await generator.generate_schema(
            request.description, options
        )

        # Generate view templates based on the schema and original description
        view_generator = ViewGenerator()
        view_templates = await view_generator.generate_views_from_description(
            request.description, definition
        )

        return CreateFromLanguageResponse(
            definition=definition,
            validation=validation,
            view_templates=view_templates,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/workflows/from-definition")
async def create_from_definition(definition: WorkflowDefinition) -> WorkflowSummary:
    """Create a workflow from a validated WorkflowDefinition.

    Use this after previewing a schema generated from language.
    """
    return await graph_store.create_workflow(definition)


@router.get("/workflows/{workflow_id}")
async def get_workflow(workflow_id: str) -> WorkflowDefinition:
    """Get a workflow definition."""
    workflow = await graph_store.get_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return workflow


@router.delete("/workflows/{workflow_id}")
async def delete_workflow(workflow_id: str) -> dict[str, bool]:
    """Delete a workflow."""
    deleted = await graph_store.delete_workflow(workflow_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return {"deleted": True}


# ==================== Nodes ====================


@router.get("/workflows/{workflow_id}/nodes")
async def list_nodes(
    workflow_id: str,
    type: str | None = Query(None, description="Filter by node type"),
    status: str | None = Query(None, description="Filter by status"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
) -> NodesResponse:
    """List nodes in a workflow with optional filters."""
    # Verify workflow exists
    workflow = await graph_store.get_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    nodes, total = await graph_store.query_nodes(
        workflow_id, node_type=type, status=status, limit=limit, offset=offset
    )
    return NodesResponse(nodes=nodes, total=total, limit=limit, offset=offset)


@router.post("/workflows/{workflow_id}/nodes")
async def create_node(workflow_id: str, node: NodeCreate) -> Node:
    """Create a new node in a workflow."""
    # Verify workflow exists
    workflow = await graph_store.get_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    return await graph_store.create_node(workflow_id, node)


@router.get("/workflows/{workflow_id}/nodes/{node_id}")
async def get_node(workflow_id: str, node_id: str) -> Node:
    """Get a specific node."""
    node = await graph_store.get_node(workflow_id, node_id)
    if node is None:
        raise HTTPException(status_code=404, detail="Node not found")
    return node


@router.patch("/workflows/{workflow_id}/nodes/{node_id}")
async def update_node(workflow_id: str, node_id: str, update: NodeUpdate) -> Node:
    """Update a node."""
    node = await graph_store.update_node(workflow_id, node_id, update)
    if node is None:
        raise HTTPException(status_code=404, detail="Node not found")
    return node


@router.delete("/workflows/{workflow_id}/nodes/{node_id}")
async def delete_node(workflow_id: str, node_id: str) -> dict[str, bool]:
    """Delete a node."""
    deleted = await graph_store.delete_node(workflow_id, node_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Node not found")
    return {"deleted": True}


@router.get("/workflows/{workflow_id}/nodes/{node_id}/neighbors")
async def get_neighbors(
    workflow_id: str,
    node_id: str,
    depth: int = Query(1, ge=1, le=3),
    edge_types: str | None = Query(None, description="Comma-separated edge types"),
) -> dict[str, Any]:
    """Get neighboring nodes and edges."""
    # Verify node exists
    node = await graph_store.get_node(workflow_id, node_id)
    if node is None:
        raise HTTPException(status_code=404, detail="Node not found")

    edge_type_list = edge_types.split(",") if edge_types else None
    return await graph_store.get_neighbors(
        workflow_id, node_id, depth=depth, edge_types=edge_type_list
    )


@router.post("/workflows/{workflow_id}/nodes/{node_id}/suggest")
async def suggest_node(
    workflow_id: str,
    node_id: str,
    request: SuggestionRequest,
) -> SuggestionResponse:
    """Suggest a new node to link to the specified node.

    Uses LLM to generate a contextually appropriate node based on:
    - The source node's properties and status
    - Connected nodes for context
    - Similar nodes of the target type as examples
    - The workflow schema

    The direction parameter specifies the edge direction relative to the source node:
    - "outgoing": source → suggested (e.g., Sample → Analysis)
    - "incoming": suggested → source (e.g., ExperimentPlan → Hypothesis)

    The generated node is returned for preview but NOT created.
    Call POST /nodes to create the node, then POST /edges to create the edge.
    """
    # Verify node exists
    node = await graph_store.get_node(workflow_id, node_id)
    if node is None:
        raise HTTPException(status_code=404, detail="Node not found")

    # Verify edge type exists in workflow
    workflow = await graph_store.get_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    valid_edge_types = {et.type for et in workflow.edge_types}
    if request.edge_type not in valid_edge_types:
        raise HTTPException(
            status_code=400,
            detail=f"Edge type '{request.edge_type}' not found in workflow schema",
        )

    try:
        generator = NodeSuggestionGenerator(graph_store=graph_store)
    except ValueError as e:
        raise HTTPException(
            status_code=500,
            detail=f"LLM client not configured: {e}. Set ANTHROPIC_API_KEY.",
        )

    try:
        return await generator.suggest_node(
            workflow_id=workflow_id,
            source_node_id=node_id,
            edge_type=request.edge_type,
            direction=request.direction,
            options=request.options,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ==================== Edges ====================


@router.post("/workflows/{workflow_id}/edges")
async def create_edge(workflow_id: str, edge: EdgeCreate) -> Edge:
    """Create a new edge between nodes."""
    # Verify workflow exists
    workflow = await graph_store.get_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Verify both nodes exist
    from_node = await graph_store.get_node(workflow_id, edge.from_node_id)
    if from_node is None:
        raise HTTPException(status_code=404, detail="From node not found")

    to_node = await graph_store.get_node(workflow_id, edge.to_node_id)
    if to_node is None:
        raise HTTPException(status_code=404, detail="To node not found")

    return await graph_store.create_edge(workflow_id, edge)


@router.delete("/workflows/{workflow_id}/edges/{edge_id}")
async def delete_edge(workflow_id: str, edge_id: str) -> dict[str, bool]:
    """Delete an edge."""
    deleted = await graph_store.delete_edge(workflow_id, edge_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Edge not found")
    return {"deleted": True}


# ==================== Views ====================


@router.get("/workflows/{workflow_id}/views")
async def list_views(workflow_id: str) -> list[ViewTemplate]:
    """List all view templates for a workflow."""
    # Verify workflow exists
    workflow = await graph_store.get_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    return await graph_store.list_view_templates(workflow_id)


@router.post("/workflows/{workflow_id}/views")
async def create_view(workflow_id: str, view: ViewTemplateCreate) -> ViewTemplate:
    """Create a new view template."""
    # Verify workflow exists
    workflow = await graph_store.get_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Validate rootType exists in workflow
    valid_node_types = {nt.type for nt in workflow.node_types}
    if view.root_type not in valid_node_types:
        raise HTTPException(
            status_code=400,
            detail=f"rootType '{view.root_type}' not found in workflow node types",
        )

    result = await graph_store.add_view_template(workflow_id, view)
    if result is None:
        raise HTTPException(status_code=500, detail="Failed to create view")
    return result


@router.get("/workflows/{workflow_id}/views/{view_id}")
async def get_view_subgraph(
    workflow_id: str,
    view_id: str,
    root_node_id: str | None = Query(None, description="Optional root node ID"),
) -> dict[str, Any]:
    """Get a subgraph traversed according to a view template configuration."""
    # Get workflow definition
    workflow = await graph_store.get_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Find the view template
    template = None
    for vt in workflow.view_templates:
        if vt.id == view_id:
            template = vt
            break

    if template is None:
        raise HTTPException(
            status_code=404, detail=f"View template '{view_id}' not found"
        )

    # Traverse the graph according to the template
    return await graph_store.traverse_view_template(
        workflow_id, template, root_node_id
    )


@router.put("/workflows/{workflow_id}/views/{view_id}")
async def update_view(
    workflow_id: str, view_id: str, update: ViewTemplateUpdate
) -> ViewTemplate:
    """Update a view template."""
    result = await graph_store.update_view_template(workflow_id, view_id, update)
    if result is None:
        raise HTTPException(status_code=404, detail="View template not found")
    return result


@router.delete("/workflows/{workflow_id}/views/{view_id}")
async def delete_view(workflow_id: str, view_id: str) -> dict[str, bool]:
    """Delete a view template."""
    deleted = await graph_store.delete_view_template(workflow_id, view_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="View template not found")
    return {"deleted": True}


class GenerateViewRequest(BaseModel):
    """Request to generate a view from natural language."""

    description: str


@router.post("/workflows/{workflow_id}/views/generate")
async def generate_view(
    workflow_id: str, request: GenerateViewRequest
) -> ViewTemplateCreate:
    """Generate a view template from natural language description.

    This uses Claude to interpret the description and generate a view template.
    The generated template is returned but NOT saved - call POST /views to save it.
    """
    # Get workflow definition for schema context
    workflow = await graph_store.get_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    try:
        generator = ViewGenerator()
    except ValueError as e:
        raise HTTPException(
            status_code=500,
            detail=f"LLM client not configured: {e}. Set ANTHROPIC_API_KEY.",
        )

    try:
        result = await generator.generate_view(request.description, workflow)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ==================== Events ====================


@router.get("/workflows/{workflow_id}/events")
async def list_events(
    workflow_id: str,
    node_id: str | None = Query(None, description="Filter by subject node"),
    event_type: str | None = Query(None, description="Filter by event type"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
) -> list[Event]:
    """List events for a workflow."""
    # Verify workflow exists
    workflow = await graph_store.get_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    return await graph_store.get_events(
        workflow_id,
        subject_node_id=node_id,
        event_type=event_type,
        limit=limit,
        offset=offset,
    )


# ==================== Seeding ====================


@router.post("/workflows/{workflow_id}/reset")
async def reset_workflow(workflow_id: str) -> dict[str, bool]:
    """Reset a workflow by deleting all nodes, edges, and events."""
    # Verify workflow exists
    workflow = await graph_store.get_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    await graph_store.reset_workflow(workflow_id)
    return {"reset": True}


class SeedRequest(BaseModel):
    """Request to seed a workflow with demo data."""

    scale: str = "small"  # small, medium, large


@router.post("/workflows/{workflow_id}/seed")
async def seed_workflow(workflow_id: str, request: SeedRequest) -> dict[str, Any]:
    """Seed a workflow with demo data using LLM-powered generation."""
    # Verify workflow exists
    workflow = await graph_store.get_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Create the data generator and seed the workflow
    try:
        generator = DataGenerator(graph_store)
    except ValueError as e:
        raise HTTPException(
            status_code=500,
            detail=f"LLM client not configured: {e}. Set ANTHROPIC_API_KEY environment variable.",
        )

    config = SeedConfig(scale=request.scale)
    result = await generator.seed_workflow(workflow_id, workflow, config)
    return result


@router.get("/workflows/{workflow_id}/seed/stream")
async def seed_workflow_stream(
    workflow_id: str,
    scale: str = Query("small", description="Scale: small, medium, or large"),
) -> StreamingResponse:
    """Seed a workflow with SSE progress updates.

    This endpoint streams progress events as Server-Sent Events (SSE),
    providing real-time feedback during the long-running seeding process.

    Events are sent in the format:
        data: {"phase": "scenarios", "current": 1, "total": 3, "message": "..."}

    The final event will have phase="complete" and include the full result.
    """
    # Verify workflow exists
    workflow = await graph_store.get_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Validate scale
    if scale not in ("small", "medium", "large"):
        raise HTTPException(status_code=400, detail="Invalid scale. Use small, medium, or large.")

    # Create the data generator
    try:
        generator = DataGenerator(graph_store)
    except ValueError as e:
        raise HTTPException(
            status_code=500,
            detail=f"LLM client not configured: {e}. Set ANTHROPIC_API_KEY environment variable.",
        )

    async def event_generator():
        """Generate SSE events during seeding."""
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()

        async def progress_callback(progress: dict[str, Any]) -> None:
            """Put progress events into the queue."""
            await queue.put(progress)

        # Start seeding in a background task
        config = SeedConfig(scale=scale)
        task = asyncio.create_task(
            generator.seed_workflow(workflow_id, workflow, config, on_progress=progress_callback)
        )

        # Stream progress events
        while not task.done():
            try:
                # Wait for next progress event with timeout
                event = await asyncio.wait_for(queue.get(), timeout=1.0)
                yield f"data: {json.dumps(event)}\n\n"
            except TimeoutError:
                # Send keepalive comment to prevent connection timeout
                yield ": keepalive\n\n"

        # Drain any remaining events in the queue
        while not queue.empty():
            try:
                event = queue.get_nowait()
                yield f"data: {json.dumps(event)}\n\n"
            except asyncio.QueueEmpty:
                break

        # Get the final result
        try:
            result = await task
            final_event = {**result, "phase": "complete"}
            yield f"data: {json.dumps(final_event)}\n\n"
        except Exception as e:
            error_event = {"phase": "error", "message": str(e)}
            yield f"data: {json.dumps(error_event)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )
