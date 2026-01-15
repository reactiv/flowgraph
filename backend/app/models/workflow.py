"""Pydantic models for WorkflowDefinition (the schema graph)."""

from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, model_validator
from pydantic import Field as PydanticField


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

    @model_validator(mode="after")
    def inject_status_field(self) -> "NodeType":
        """Inject 'status' as a first-class field when states are enabled."""
        if self.states and self.states.enabled:
            # Check if status field already exists
            has_status = any(f.key == "status" for f in self.fields)
            if not has_status:
                status_field = Field(
                    key="status",
                    label="Status",
                    kind=FieldKind.ENUM,
                    required=True,
                    values=self.states.values,
                    default=self.states.initial,
                )
                self.fields.append(status_field)
        return self


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


# ==================== View Template Models ====================


class ViewStyle(str, Enum):
    """Available component styles for rendering nodes."""

    KANBAN = "kanban"
    CARDS = "cards"
    TREE = "tree"
    TIMELINE = "timeline"
    TABLE = "table"


class CardTemplate(BaseModel):
    """Configuration for how to render a node card."""

    title_field: str | None = PydanticField(default=None, alias="titleField")
    subtitle_field: str | None = PydanticField(default=None, alias="subtitleField")
    status_field: str | None = PydanticField(default=None, alias="statusField")
    body_fields: list[str] = PydanticField(default=[], alias="bodyFields")
    show_inline_children: bool = PydanticField(default=False, alias="showInlineChildren")
    status_colors: dict[str, str] | None = PydanticField(default=None, alias="statusColors")

    model_config = {"populate_by_name": True}


class KanbanConfig(BaseModel):
    """Configuration for Kanban-style view."""

    group_by_field: str = PydanticField(alias="groupByField")
    column_order: list[str] | None = PydanticField(default=None, alias="columnOrder")
    column_colors: dict[str, str] | None = PydanticField(default=None, alias="columnColors")
    allow_drag: bool = PydanticField(default=True, alias="allowDrag")
    allowed_transitions: dict[str, list[str]] | None = PydanticField(
        default=None, alias="allowedTransitions"
    )
    card_template: CardTemplate | None = PydanticField(default=None, alias="cardTemplate")
    show_counts: bool = PydanticField(default=True, alias="showCounts")
    show_empty_columns: bool = PydanticField(default=True, alias="showEmptyColumns")

    model_config = {"populate_by_name": True}


class CardsConfig(BaseModel):
    """Configuration for Cards-style view."""

    layout: Literal["grid", "list", "single", "inline-chips"] = "grid"
    columns: int | None = None
    card_template: CardTemplate | None = PydanticField(default=None, alias="cardTemplate")

    model_config = {"populate_by_name": True}


class TreeConfig(BaseModel):
    """Configuration for Tree-style view."""

    parent_field: str | None = PydanticField(default=None, alias="parentField")
    expandable: bool = True
    show_depth_lines: bool = PydanticField(default=True, alias="showDepthLines")
    card_template: CardTemplate | None = PydanticField(default=None, alias="cardTemplate")

    model_config = {"populate_by_name": True}


class TimelineConfig(BaseModel):
    """Configuration for Timeline-style view."""

    date_field: str = PydanticField(alias="dateField")
    granularity: Literal["day", "week", "month"] = "day"
    group_by_field: str | None = PydanticField(default=None, alias="groupByField")
    show_connectors: bool = PydanticField(default=True, alias="showConnectors")
    card_template: CardTemplate | None = PydanticField(default=None, alias="cardTemplate")

    model_config = {"populate_by_name": True}


class TableConfig(BaseModel):
    """Configuration for Table-style view."""

    columns: list[str] = []
    sortable: bool = True
    selectable: bool = False
    status_colors: dict[str, str] | None = PydanticField(default=None, alias="statusColors")

    model_config = {"populate_by_name": True}


class ActionConfig(BaseModel):
    """Configuration for an action available in a view."""

    id: str
    label: str
    icon: str | None = None
    action: Literal["create-linked", "update-status", "navigate", "custom"]
    params: dict[str, Any] | None = None

    model_config = {"populate_by_name": True}


class FilterConfig(BaseModel):
    """Configuration for a filter in a view."""

    field: str
    label: str
    filter_type: Literal["select", "multiselect", "date-range", "search"] = PydanticField(
        alias="type"
    )

    model_config = {"populate_by_name": True}


class EdgeTraversal(BaseModel):
    """Configuration for traversing an edge type in a view template."""

    edge_type: str = PydanticField(alias="edgeType")
    direction: Literal["outgoing", "incoming"]
    target_type: str = PydanticField(alias="targetType")
    required: bool = False

    model_config = {"populate_by_name": True}


class LevelConfig(BaseModel):
    """Configuration for how to render a node type level in a view."""

    style: ViewStyle
    style_config: KanbanConfig | CardsConfig | TreeConfig | TimelineConfig | TableConfig = (
        PydanticField(alias="styleConfig")
    )
    inline_children: list[str] = PydanticField(default=[], alias="inlineChildren")
    expanded_by_default: bool = PydanticField(default=False, alias="expandedByDefault")
    actions: list[ActionConfig] = []

    model_config = {"populate_by_name": True}


class ViewTemplate(BaseModel):
    """A declarative view template for rendering workflow subgraphs."""

    id: str
    name: str
    description: str | None = None
    icon: str | None = None
    root_type: str = PydanticField(alias="rootType")
    edges: list[EdgeTraversal] = []
    levels: dict[str, LevelConfig] = {}
    filters: list[FilterConfig] = []

    model_config = {"populate_by_name": True}


class ViewTemplateCreate(BaseModel):
    """Request model for creating a new view template."""

    name: str
    description: str | None = None
    icon: str | None = None
    root_type: str = PydanticField(alias="rootType")
    edges: list[EdgeTraversal] = []
    levels: dict[str, LevelConfig] = {}
    filters: list[FilterConfig] = []

    model_config = {"populate_by_name": True}


class ViewTemplateUpdate(BaseModel):
    """Request model for updating an existing view template (partial updates)."""

    name: str | None = None
    description: str | None = None
    icon: str | None = None

    model_config = {"populate_by_name": True}


class WorkflowDefinition(BaseModel):
    """The complete workflow definition (schema graph)."""

    workflow_id: str = PydanticField(alias="workflowId")
    name: str
    description: str = ""
    node_types: list[NodeType] = PydanticField(alias="nodeTypes")
    edge_types: list[EdgeType] = PydanticField(alias="edgeTypes")
    rules: list[Rule] = []
    view_templates: list[ViewTemplate] = PydanticField(default=[], alias="viewTemplates")

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
