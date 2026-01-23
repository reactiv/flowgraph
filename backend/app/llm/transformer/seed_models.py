"""Models for generating workflow seed data via the transformer.

These models match the structure expected by data_generator.py for insertion.
"""

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class NodeIntent(str, Enum):
    """Intent for how a seed node should be processed.

    CREATE: Always create a new node (default behavior)
    UPDATE: Update an existing node (requires existing_node_id)
    """

    CREATE = "create"
    UPDATE = "update"


class SeedNode(BaseModel):
    """A node to be inserted into a workflow.

    Uses temp_id for cross-referencing with edges before DB insertion.
    """

    temp_id: str = Field(description="Temporary ID for edge references (e.g., 'node_1')")
    node_type: str = Field(description="The node type from WorkflowDefinition")
    title: str = Field(description="Display title for the node")
    status: str | None = Field(default=None, description="Status value if states are enabled")
    properties: dict[str, Any] = Field(
        default_factory=dict,
        description="Field values matching the node type's field definitions",
    )
    intent: NodeIntent = Field(
        default=NodeIntent.CREATE,
        description="Intent: 'create' for new nodes, 'update' for existing nodes",
    )
    existing_node_id: str | None = Field(
        default=None,
        description="For UPDATE intent: the ID of the existing node to update",
    )


class SeedEdge(BaseModel):
    """An edge to be inserted into a workflow.

    References nodes by temp_id which are resolved to actual IDs during insertion.
    """

    edge_type: str = Field(description="The edge type from WorkflowDefinition")
    from_temp_id: str = Field(description="temp_id of the source node")
    to_temp_id: str = Field(description="temp_id of the target node")
    properties: dict[str, Any] = Field(default_factory=dict)


class SeedData(BaseModel):
    """Complete seed data for a workflow.

    Generate this model to create data that can be inserted via the API.
    """

    nodes: list[SeedNode] = Field(description="Nodes to create")
    edges: list[SeedEdge] = Field(description="Edges to create (reference nodes by temp_id)")
