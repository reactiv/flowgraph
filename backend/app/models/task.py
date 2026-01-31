"""Pydantic models for Task Execution Engine.

Tasks represent expected deltas (changes) to the workflow graph.
TaskSets organize tasks into DAGs with dependencies and conditions.
"""

from enum import Enum
from typing import Annotated, Any, Literal

from pydantic import BaseModel, Discriminator, Tag
from pydantic import Field as PydanticField

# =============================================================================
# Enums
# =============================================================================


class DeltaType(str, Enum):
    """Types of expected changes a task can represent."""

    CREATE_NODE = "create_node"
    UPDATE_NODE_STATUS = "update_node_status"
    UPDATE_NODE_FIELD = "update_node_field"
    CREATE_EDGE = "create_edge"
    COMPOUND = "compound"


class TaskStatus(str, Enum):
    """Status of a task instance."""

    PENDING = "pending"  # Dependencies not met
    AVAILABLE = "available"  # Ready to be worked on
    IN_PROGRESS = "in_progress"  # Someone is working on it
    COMPLETED = "completed"  # Expected delta achieved
    SKIPPED = "skipped"  # Skipped due to condition
    BLOCKED = "blocked"  # Dependencies failed/skipped


class AssigneeType(str, Enum):
    """Type of assignee for a task."""

    USER = "user"
    AGENT = "agent"
    UNASSIGNED = "unassigned"


class ConditionType(str, Enum):
    """Types of conditions for task availability."""

    NODE_STATUS = "node_status"
    FIELD_VALUE = "field_value"
    EDGE_EXISTS = "edge_exists"
    EXPRESSION = "expression"


class NodeReferenceType(str, Enum):
    """Types of node references."""

    ID = "id"  # Direct node ID
    TASK_OUTPUT = "task_output"  # Reference to another task's output node
    QUERY = "query"  # Query-based lookup
    STEP_OUTPUT = "step_output"  # Reference to earlier step in same compound delta


# =============================================================================
# Node Reference - How to identify a node in task definitions
# =============================================================================


class NodeReference(BaseModel):
    """Reference to a node - can be by ID, by task output, by query, or by step output.

    This allows tasks to reference nodes that:
    - Already exist (by ID)
    - Will be created by a previous task (task_output)
    - Match certain criteria (query)
    - Were created by an earlier step in the same compound delta (step_output)
    """

    type: NodeReferenceType
    # For type="id": the actual node ID
    node_id: str | None = PydanticField(default=None, alias="nodeId")
    # For type="task_output": reference to another task's created node
    task_id: str | None = PydanticField(default=None, alias="taskId")
    output_key: str | None = PydanticField(default=None, alias="outputKey")
    # For type="query": find node by criteria
    node_type: str | None = PydanticField(default=None, alias="nodeType")
    query_filters: dict[str, Any] | None = PydanticField(
        default=None, alias="queryFilters"
    )
    # For type="step_output": reference to earlier step in same compound delta
    step_key: str | None = PydanticField(default=None, alias="stepKey")

    model_config = {"populate_by_name": True}

    @classmethod
    def by_id(cls, node_id: str) -> "NodeReference":
        """Create a reference to a node by its ID."""
        return cls(type=NodeReferenceType.ID, node_id=node_id)

    @classmethod
    def by_task_output(cls, task_id: str, output_key: str | None = None) -> "NodeReference":
        """Create a reference to a node created by another task."""
        return cls(
            type=NodeReferenceType.TASK_OUTPUT, task_id=task_id, output_key=output_key
        )

    @classmethod
    def by_query(
        cls, node_type: str, filters: dict[str, Any] | None = None
    ) -> "NodeReference":
        """Create a reference to a node by query."""
        return cls(
            type=NodeReferenceType.QUERY, node_type=node_type, query_filters=filters
        )

    @classmethod
    def by_step_output(cls, step_key: str) -> "NodeReference":
        """Create a reference to a node created by an earlier step in the same compound delta."""
        return cls(type=NodeReferenceType.STEP_OUTPUT, step_key=step_key)


# =============================================================================
# Task Deltas - The expected changes
# =============================================================================


def _get_delta_discriminator(v: Any) -> str:
    """Discriminator function for TaskDelta union."""
    if isinstance(v, dict):
        return v.get("deltaType", v.get("delta_type", "create_node"))
    return getattr(v, "delta_type", "create_node")


def _get_atomic_delta_discriminator(v: Any) -> str:
    """Discriminator function for AtomicDelta union (excludes compound)."""
    if isinstance(v, dict):
        return v.get("deltaType", v.get("delta_type", "create_node"))
    return getattr(v, "delta_type", "create_node")


class CreateNodeDelta(BaseModel):
    """Expected delta: create a node of a specific type."""

    delta_type: Literal["create_node"] = PydanticField(
        default="create_node", alias="deltaType"
    )
    node_type: str = PydanticField(alias="nodeType")
    # Initial field values (can include template expressions)
    initial_values: dict[str, Any] = PydanticField(
        default_factory=dict, alias="initialValues"
    )
    # Initial status (uses state machine initial if not specified)
    initial_status: str | None = PydanticField(default=None, alias="initialStatus")

    model_config = {"populate_by_name": True}


class UpdateNodeStatusDelta(BaseModel):
    """Expected delta: transition a node to a specific status."""

    delta_type: Literal["update_node_status"] = PydanticField(
        default="update_node_status", alias="deltaType"
    )
    target_node: NodeReference = PydanticField(alias="targetNode")
    # Optional: constrain valid source statuses
    from_status: str | list[str] | None = PydanticField(default=None, alias="fromStatus")
    to_status: str = PydanticField(alias="toStatus")

    model_config = {"populate_by_name": True}


class UpdateNodeFieldDelta(BaseModel):
    """Expected delta: update a field on a node."""

    delta_type: Literal["update_node_field"] = PydanticField(
        default="update_node_field", alias="deltaType"
    )
    target_node: NodeReference = PydanticField(alias="targetNode")
    field_key: str = PydanticField(alias="fieldKey")
    # Expected value (optional - if None, just check that field has some value)
    expected_value: Any | None = PydanticField(default=None, alias="expectedValue")

    model_config = {"populate_by_name": True}


class CreateEdgeDelta(BaseModel):
    """Expected delta: create an edge between nodes."""

    delta_type: Literal["create_edge"] = PydanticField(
        default="create_edge", alias="deltaType"
    )
    edge_type: str = PydanticField(alias="edgeType")
    from_node: NodeReference = PydanticField(alias="fromNode")
    to_node: NodeReference = PydanticField(alias="toNode")

    model_config = {"populate_by_name": True}


# Union type for atomic deltas (everything except compound)
AtomicDelta = Annotated[
    Annotated[CreateNodeDelta, Tag("create_node")]
    | Annotated[UpdateNodeStatusDelta, Tag("update_node_status")]
    | Annotated[UpdateNodeFieldDelta, Tag("update_node_field")]
    | Annotated[CreateEdgeDelta, Tag("create_edge")],
    Discriminator(_get_atomic_delta_discriminator),
]


class CompoundDeltaStep(BaseModel):
    """A single step within a CompoundDelta."""

    key: str  # Unique identifier for this step (for step_output references)
    delta: AtomicDelta  # The actual delta to apply
    label: str | None = None  # Optional human-readable label for UI

    model_config = {"populate_by_name": True}


class CompoundDelta(BaseModel):
    """A compound delta that bundles multiple operations into one task.

    When completed:
    - All steps execute atomically in sequence
    - Steps can reference nodes created by earlier steps via step_output references
    - The completion dialog collects all required inputs across all create_node steps
    """

    delta_type: Literal["compound"] = PydanticField(
        default="compound", alias="deltaType"
    )
    steps: list[CompoundDeltaStep]
    # Optional: output_step_key specifies which step's output becomes the task's output_node_id
    output_step_key: str | None = PydanticField(default=None, alias="outputStepKey")

    model_config = {"populate_by_name": True}


# Union type for all deltas with discriminator (includes compound)
TaskDelta = Annotated[
    Annotated[CreateNodeDelta, Tag("create_node")]
    | Annotated[UpdateNodeStatusDelta, Tag("update_node_status")]
    | Annotated[UpdateNodeFieldDelta, Tag("update_node_field")]
    | Annotated[CreateEdgeDelta, Tag("create_edge")]
    | Annotated[CompoundDelta, Tag("compound")],
    Discriminator(_get_delta_discriminator),
]


# =============================================================================
# Task Conditions - For branching logic
# =============================================================================


class TaskCondition(BaseModel):
    """Condition for task availability or branching.

    Conditions are evaluated when determining if a task is available.
    If the condition evaluates to False, the task is skipped.
    """

    type: ConditionType
    # For node_status: check if a node is in a specific status
    node_ref: NodeReference | None = PydanticField(default=None, alias="nodeRef")
    expected_status: str | list[str] | None = PydanticField(
        default=None, alias="expectedStatus"
    )
    # For field_value: check field against a value
    field_key: str | None = PydanticField(default=None, alias="fieldKey")
    expected_value: Any | None = PydanticField(default=None, alias="expectedValue")
    operator: str = "eq"  # eq, neq, in, notin, gt, lt, contains, etc.
    # For edge_exists: check if edge exists
    edge_type: str | None = PydanticField(default=None, alias="edgeType")
    from_node: NodeReference | None = PydanticField(default=None, alias="fromNode")
    to_node: NodeReference | None = PydanticField(default=None, alias="toNode")
    # For expression: CEL or similar expression language
    expression: str | None = None

    model_config = {"populate_by_name": True}

    @classmethod
    def node_has_status(
        cls, node_ref: NodeReference, status: str | list[str]
    ) -> "TaskCondition":
        """Create a condition checking node status."""
        return cls(
            type=ConditionType.NODE_STATUS,
            node_ref=node_ref,
            expected_status=status,
        )

    @classmethod
    def field_equals(
        cls, node_ref: NodeReference, field_key: str, value: Any
    ) -> "TaskCondition":
        """Create a condition checking a field value."""
        return cls(
            type=ConditionType.FIELD_VALUE,
            node_ref=node_ref,
            field_key=field_key,
            expected_value=value,
            operator="eq",
        )

    @classmethod
    def edge_exists(
        cls, edge_type: str, from_node: NodeReference, to_node: NodeReference
    ) -> "TaskCondition":
        """Create a condition checking edge existence."""
        return cls(
            type=ConditionType.EDGE_EXISTS,
            edge_type=edge_type,
            from_node=from_node,
            to_node=to_node,
        )


# =============================================================================
# Task Assignment
# =============================================================================


class TaskAssignment(BaseModel):
    """Assignment of a task to a user or agent."""

    assignee_type: AssigneeType = PydanticField(alias="assigneeType")
    assignee_id: str | None = PydanticField(default=None, alias="assigneeId")
    assigned_at: str | None = PydanticField(default=None, alias="assignedAt")
    assigned_by: str | None = PydanticField(default=None, alias="assignedBy")

    model_config = {"populate_by_name": True}


# =============================================================================
# Task Definition - The template
# =============================================================================


class TaskDefinition(BaseModel):
    """Definition of a single task within a TaskSet.

    A task definition describes:
    - What change (delta) is expected
    - What tasks must complete first (dependencies)
    - What conditions must be met (condition)
    - Who should work on it (default_assignee_type)
    - What node it creates (output_node_key)
    """

    id: str
    name: str
    description: str | None = None
    # What change this task expects
    delta: TaskDelta
    # Dependencies: task IDs that must complete before this task is available
    depends_on: list[str] = PydanticField(default_factory=list, alias="dependsOn")
    # Condition for this task to be available (in addition to dependencies)
    condition: TaskCondition | None = None
    # Default assignment (can be overridden at instance level)
    default_assignee_type: AssigneeType = PydanticField(
        default=AssigneeType.UNASSIGNED, alias="defaultAssigneeType"
    )
    # UI hints for task display
    ui_hints: dict[str, Any] = PydanticField(default_factory=dict, alias="uiHints")
    # Output: tasks can declare outputs that other tasks reference
    output_node_key: str | None = PydanticField(default=None, alias="outputNodeKey")

    model_config = {"populate_by_name": True}


# =============================================================================
# TaskSet Definition - The DAG Template
# =============================================================================


class TaskSetDefinition(BaseModel):
    """Definition of a complete task DAG (workflow template).

    A TaskSet defines a reusable workflow pattern with:
    - Multiple tasks organized as a DAG
    - Entry points (no dependencies)
    - Terminal tasks (no dependents)
    - Optional root node type anchor
    """

    id: str
    name: str
    description: str | None = None
    version: int = 1
    # Root context: what node type this TaskSet operates on
    root_node_type: str | None = PydanticField(default=None, alias="rootNodeType")
    # All tasks in this set
    tasks: list[TaskDefinition]
    # Entry tasks (no dependencies) - computed if not specified
    entry_task_ids: list[str] | None = PydanticField(default=None, alias="entryTaskIds")
    # Terminal tasks (no dependents) - computed if not specified
    terminal_task_ids: list[str] | None = PydanticField(
        default=None, alias="terminalTaskIds"
    )
    # Metadata
    tags: list[str] = []
    created_at: str | None = PydanticField(default=None, alias="createdAt")
    updated_at: str | None = PydanticField(default=None, alias="updatedAt")

    model_config = {"populate_by_name": True}

    def get_task(self, task_id: str) -> TaskDefinition | None:
        """Get a task definition by ID."""
        for task in self.tasks:
            if task.id == task_id:
                return task
        return None

    def get_entry_tasks(self) -> list[TaskDefinition]:
        """Get tasks with no dependencies (entry points)."""
        if self.entry_task_ids:
            return [t for t in self.tasks if t.id in self.entry_task_ids]
        return [t for t in self.tasks if not t.depends_on]

    def get_dependents(self, task_id: str) -> list[TaskDefinition]:
        """Get tasks that depend on the given task."""
        return [t for t in self.tasks if task_id in t.depends_on]


class TaskSetDefinitionCreate(BaseModel):
    """Request model for creating a TaskSet definition."""

    name: str
    description: str | None = None
    root_node_type: str | None = PydanticField(default=None, alias="rootNodeType")
    tasks: list[TaskDefinition]
    tags: list[str] = []

    model_config = {"populate_by_name": True}


# =============================================================================
# Task Instance - Runtime State
# =============================================================================


class TaskInstance(BaseModel):
    """Runtime instance of a task being executed.

    Tracks the actual progress of a task within a TaskSetInstance.
    """

    id: str
    task_set_instance_id: str = PydanticField(alias="taskSetInstanceId")
    task_definition_id: str = PydanticField(alias="taskDefinitionId")
    status: TaskStatus
    # Assignment
    assignment: TaskAssignment | None = None
    # Progress tracking
    started_at: str | None = PydanticField(default=None, alias="startedAt")
    completed_at: str | None = PydanticField(default=None, alias="completedAt")
    # Output: the node created/affected by this task (if applicable)
    output_node_id: str | None = PydanticField(default=None, alias="outputNodeId")
    # Notes or comments
    notes: str | None = None

    model_config = {"populate_by_name": True}


class TaskSetInstanceStatus(str, Enum):
    """Status of a TaskSet instance."""

    ACTIVE = "active"
    COMPLETED = "completed"
    PAUSED = "paused"
    CANCELLED = "cancelled"


class TaskSetInstance(BaseModel):
    """Runtime instance of a TaskSet being executed.

    Tracks overall progress of a workflow execution.
    """

    id: str
    workflow_id: str = PydanticField(alias="workflowId")
    task_set_definition_id: str = PydanticField(alias="taskSetDefinitionId")
    # Optional: root node this instance is anchored to
    root_node_id: str | None = PydanticField(default=None, alias="rootNodeId")
    # Overall status
    status: TaskSetInstanceStatus
    # All task instances
    task_instances: list[TaskInstance] = PydanticField(
        default_factory=list, alias="taskInstances"
    )
    # Progress summary (computed)
    total_tasks: int = PydanticField(default=0, alias="totalTasks")
    completed_tasks: int = PydanticField(default=0, alias="completedTasks")
    available_tasks: int = PydanticField(default=0, alias="availableTasks")
    # Timestamps
    created_at: str = PydanticField(alias="createdAt")
    updated_at: str = PydanticField(alias="updatedAt")

    model_config = {"populate_by_name": True}

    def get_task_instance(self, task_def_id: str) -> TaskInstance | None:
        """Get a task instance by its definition ID."""
        for ti in self.task_instances:
            if ti.task_definition_id == task_def_id:
                return ti
        return None


class TaskSetInstanceCreate(BaseModel):
    """Request model for starting a TaskSet instance."""

    task_set_definition_id: str = PydanticField(alias="taskSetDefinitionId")
    root_node_id: str | None = PydanticField(default=None, alias="rootNodeId")

    model_config = {"populate_by_name": True}


# =============================================================================
# Evaluation Results
# =============================================================================


class TaskEvaluationResult(BaseModel):
    """Result of evaluating a single task's completion status."""

    completed: bool
    matched_node_id: str | None = PydanticField(default=None, alias="matchedNodeId")
    matched_edge_id: str | None = PydanticField(default=None, alias="matchedEdgeId")
    confidence: float = 1.0
    blocked: bool = False
    error: str | None = None

    model_config = {"populate_by_name": True}


class ConditionEvaluationResult(BaseModel):
    """Result of evaluating a task condition."""

    satisfied: bool
    reason: str | None = None

    model_config = {"populate_by_name": True}
