"""Endpoint management API routes."""

from fastapi import APIRouter, HTTPException

from app.db import graph_store
from app.models import (
    Endpoint,
    EndpointCreate,
    EndpointsResponse,
    EndpointUpdate,
)

router = APIRouter()


# ==================== Endpoint Management ====================


@router.get("/workflows/{workflow_id}/endpoints")
async def list_endpoints(workflow_id: str) -> EndpointsResponse:
    """List all endpoints for a workflow."""
    # Verify workflow exists
    workflow = await graph_store.get_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    endpoints, total = await graph_store.list_endpoints(workflow_id)
    return EndpointsResponse(endpoints=endpoints, total=total)


@router.post("/workflows/{workflow_id}/endpoints")
async def create_endpoint(workflow_id: str, endpoint: EndpointCreate) -> Endpoint:
    """Create a new endpoint for a workflow."""
    # Verify workflow exists
    workflow = await graph_store.get_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Check if slug already exists
    existing = await graph_store.get_endpoint_by_slug(workflow_id, endpoint.slug)
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail=f"Endpoint with slug '{endpoint.slug}' already exists",
        )

    return await graph_store.create_endpoint(workflow_id, endpoint)


@router.get("/workflows/{workflow_id}/endpoints/{endpoint_id}")
async def get_endpoint(workflow_id: str, endpoint_id: str) -> Endpoint:
    """Get an endpoint by ID (includes learned_skill_md)."""
    endpoint = await graph_store.get_endpoint(workflow_id, endpoint_id)
    if endpoint is None:
        raise HTTPException(status_code=404, detail="Endpoint not found")
    return endpoint


@router.put("/workflows/{workflow_id}/endpoints/{endpoint_id}")
async def update_endpoint(
    workflow_id: str, endpoint_id: str, update: EndpointUpdate
) -> Endpoint:
    """Update an endpoint configuration."""
    endpoint = await graph_store.update_endpoint(workflow_id, endpoint_id, update)
    if endpoint is None:
        raise HTTPException(status_code=404, detail="Endpoint not found")
    return endpoint


@router.delete("/workflows/{workflow_id}/endpoints/{endpoint_id}")
async def delete_endpoint(workflow_id: str, endpoint_id: str) -> dict:
    """Delete an endpoint."""
    deleted = await graph_store.delete_endpoint(workflow_id, endpoint_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Endpoint not found")
    return {"deleted": True}


@router.post("/workflows/{workflow_id}/endpoints/{endpoint_id}/reset-learning")
async def reset_endpoint_learning(workflow_id: str, endpoint_id: str) -> Endpoint:
    """Clear learned assets from an endpoint."""
    endpoint = await graph_store.reset_endpoint_learning(workflow_id, endpoint_id)
    if endpoint is None:
        raise HTTPException(status_code=404, detail="Endpoint not found")
    return endpoint
