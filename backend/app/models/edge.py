"""Pydantic models for Edge instances."""

from typing import Any

from pydantic import BaseModel, Field


class EdgeCreate(BaseModel):
    """Request model for creating an edge."""

    type: str
    from_node_id: str
    to_node_id: str
    properties: dict[str, Any] = Field(default_factory=dict)


class Edge(BaseModel):
    """An edge instance in the workflow."""

    id: str
    workflow_id: str
    type: str
    from_node_id: str
    to_node_id: str
    properties: dict[str, Any] = Field(default_factory=dict)
    created_at: str
