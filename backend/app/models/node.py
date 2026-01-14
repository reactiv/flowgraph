"""Pydantic models for Node instances."""

from typing import Any

from pydantic import BaseModel, Field


class NodeCreate(BaseModel):
    """Request model for creating a node."""

    type: str
    title: str
    status: str | None = None
    properties: dict[str, Any] = Field(default_factory=dict)


class NodeUpdate(BaseModel):
    """Request model for updating a node."""

    title: str | None = None
    status: str | None = None
    properties: dict[str, Any] | None = None


class Node(BaseModel):
    """A node instance in the workflow."""

    id: str
    workflow_id: str
    type: str
    title: str
    status: str | None = None
    properties: dict[str, Any] = Field(default_factory=dict)
    created_at: str
    updated_at: str


class NodeWithNeighbors(BaseModel):
    """A node with its neighboring nodes and edges."""

    node: Node
    incoming_edges: list["EdgeSummary"] = []
    outgoing_edges: list["EdgeSummary"] = []


class EdgeSummary(BaseModel):
    """Summary of an edge for neighbor queries."""

    id: str
    type: str
    node: Node  # The connected node


NodeWithNeighbors.model_rebuild()
