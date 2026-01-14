"""Workflow API routes."""

import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.db import graph_store
from app.llm import DataGenerator, SeedConfig
from app.models import (
    Edge,
    EdgeCreate,
    Event,
    Node,
    NodeCreate,
    NodeUpdate,
    WorkflowDefinition,
)
from app.models.workflow import WorkflowSummary

router = APIRouter()

TEMPLATES_DIR = Path(__file__).parent.parent.parent / "templates"


class CreateFromTemplateRequest(BaseModel):
    """Request to create a workflow from a template."""

    template_id: str


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
    """Seed a workflow with demo data using AI-powered generation.

    Generates realistic nodes and edges based on the workflow schema.
    Uses Claude to generate summaries and descriptions when available,
    falls back to rule-based generation otherwise.
    """
    # Verify workflow exists
    workflow = await graph_store.get_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Validate scale
    if request.scale not in ["small", "medium", "large"]:
        raise HTTPException(
            status_code=400,
            detail="Invalid scale. Must be 'small', 'medium', or 'large'",
        )

    # Create generator and seed the workflow
    generator = DataGenerator(graph_store)
    config = SeedConfig(scale=request.scale)

    try:
        result = await generator.seed_workflow(workflow_id, workflow, config)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to seed workflow: {str(e)}",
        )
