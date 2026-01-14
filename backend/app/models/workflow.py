"""Pydantic models for WorkflowDefinition (the schema graph)."""

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field as PydanticField


class FieldKind(str, Enum):
    """Supported field types in workflow definitions."""

    STRING = "string"
    NUMBER = "number"
    DATETIME = "datetime"
    ENUM = "enum"
    PERSON = "person"
    JSON = "json"
    TAG_ARRAY = "tag[]"
    FILE_ARRAY = "file[]"


class Field(BaseModel):
    """A field definition within a node type."""

    key: str
    label: str
    kind: FieldKind
    required: bool = False
    unique: bool = False
    values: list[str] | None = None  # For enum fields
    default: Any | None = None


class StateTransition(BaseModel):
    """A valid state transition."""

    from_state: str = PydanticField(alias="from")
    to_state: str = PydanticField(alias="to")

    model_config = {"populate_by_name": True}


class NodeState(BaseModel):
    """State machine configuration for a node type."""

    enabled: bool = True
    initial: str
    values: list[str]
    transitions: list[StateTransition] = []


class UIHints(BaseModel):
    """UI configuration hints for a node type."""

    default_views: list[str] = PydanticField(
        default=["list", "detail", "graph"], alias="defaultViews"
    )
    primary_sections: list[str] = PydanticField(
        default=["summary", "relationships", "events"], alias="primarySections"
    )
    list_columns: list[str] = PydanticField(default=[], alias="listColumns")
    quick_actions: list[str] = PydanticField(default=[], alias="quickActions")

    model_config = {"populate_by_name": True}


class NodeType(BaseModel):
    """A node type definition in the workflow schema."""

    type: str
    display_name: str = PydanticField(alias="displayName")
    title_field: str = PydanticField(alias="titleField")
    subtitle_field: str | None = PydanticField(default=None, alias="subtitleField")
    fields: list[Field]
    states: NodeState | None = None
    ui: UIHints = UIHints()

    model_config = {"populate_by_name": True}


class EdgeType(BaseModel):
    """An edge type definition in the workflow schema."""

    type: str
    display_name: str = PydanticField(alias="displayName")
    from_type: str = PydanticField(alias="from")
    to_type: str = PydanticField(alias="to")
    direction: str = "out"

    model_config = {"populate_by_name": True}


class RuleCondition(BaseModel):
    """Condition for when a rule applies."""

    node_type: str = PydanticField(alias="nodeType")
    transition_to: str | None = PydanticField(default=None, alias="transitionTo")

    model_config = {"populate_by_name": True}


class EdgeRequirement(BaseModel):
    """Edge requirement for a rule."""

    edge_type: str = PydanticField(alias="edgeType")
    min_count: int = PydanticField(default=1, alias="minCount")

    model_config = {"populate_by_name": True}


class Rule(BaseModel):
    """A business rule/constraint in the workflow."""

    id: str
    when: RuleCondition
    require_edges: list[EdgeRequirement] = PydanticField(default=[], alias="requireEdges")
    message: str

    model_config = {"populate_by_name": True}


class WorkflowDefinition(BaseModel):
    """The complete workflow definition (schema graph)."""

    workflow_id: str = PydanticField(alias="workflowId")
    name: str
    description: str = ""
    node_types: list[NodeType] = PydanticField(alias="nodeTypes")
    edge_types: list[EdgeType] = PydanticField(alias="edgeTypes")
    rules: list[Rule] = []

    model_config = {"populate_by_name": True}


class WorkflowSummary(BaseModel):
    """Summary of a workflow for listing."""

    id: str
    name: str
    description: str
    version: int
    node_type_count: int
    edge_type_count: int
    created_at: str
    updated_at: str
