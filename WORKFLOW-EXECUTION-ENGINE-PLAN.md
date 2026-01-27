# Workflow Execution Engine Plan

## Overview

Transform the existing graph-based workflow system into a fully-fledged **workflow execution engine** where:

- **Tasks** are defined as expected deltas (changes) to the graph
- **Task DAGs** define decision flows with branching and dependencies
- **Progress tracking** shows workflow state and next steps at a glance
- **Assignments** enable both human and agent-based task execution
- **Multiple task sets** can run concurrently on the same context graph

---

## Core Concepts

### Current Architecture (Two Graphs)

```
┌─────────────────────────────────┐    ┌─────────────────────────────────┐
│     Schema Graph                │    │     Instance Graph               │
│   (WorkflowDefinition)          │    │   (Runtime Data)                 │
├─────────────────────────────────┤    ├─────────────────────────────────┤
│ • NodeTypes + fields + states   │    │ • Nodes (actual data)            │
│ • EdgeTypes (relationships)     │    │ • Edges (relationships)          │
│ • Rules (transition guards)     │    │ • Events (audit trail)           │
│ • ViewTemplates (UI rendering)  │    │                                  │
└─────────────────────────────────┘    └─────────────────────────────────┘
```

### Proposed: Add Execution Graph (Third Graph)

```
┌─────────────────────────────────┐
│     Execution Graph             │
│   (Task Orchestration)          │
├─────────────────────────────────┤
│ • TaskTemplates (expected Δ)    │  ← Schema layer: what should happen
│ • TaskFlows (DAGs of tasks)     │
│ • TaskInstances (runtime state) │  ← Instance layer: what has happened
│ • Assignments (who/what does it)│
└─────────────────────────────────┘
```

---

## Data Model

### 1. TaskTemplate (Schema)

A **TaskTemplate** defines what graph change constitutes completion of a task.

```python
class ExpectedDelta(BaseModel):
    """Defines what change is expected to complete a task."""

    delta_type: Literal["create_node", "update_status", "create_edge", "update_field"]

    # For create_node
    node_type: str | None = None

    # For update_status
    target_node_ref: str | None = None  # "$context", "$parent", or node selector
    from_status: str | list[str] | None = None  # Optional: require starting status
    to_status: str | list[str] | None = None    # Required status(es) to reach

    # For create_edge
    edge_type: str | None = None
    from_ref: str | None = None  # Node reference for edge source
    to_ref: str | None = None    # Node reference for edge target

    # For update_field
    field_key: str | None = None
    field_value: Any | None = None  # Optional: specific required value


class TaskTemplate(BaseModel):
    """Template defining a task and its completion criteria."""

    id: str
    name: str
    description: str | None = None

    # What graph change completes this task
    expected_delta: ExpectedDelta

    # Optional: multiple deltas must ALL occur (conjunction)
    expected_deltas: list[ExpectedDelta] = []

    # Completion type
    completion_mode: Literal["manual", "auto_detect", "agent"] = "auto_detect"

    # Assignment defaults
    default_assignee_type: Literal["person", "agent", "unassigned"] = "unassigned"
    default_assignee: str | None = None

    # Agent configuration (if agent-completable)
    agent_config: AgentConfig | None = None

    # UI hints
    ui: TaskUIHints = TaskUIHints()
```

### 2. TaskFlow (DAG Definition)

A **TaskFlow** defines the DAG of tasks with dependencies and branches.

```python
class TaskDependency(BaseModel):
    """Defines dependency from one task to another."""

    from_task_id: str
    to_task_id: str
    condition: BranchCondition | None = None  # Optional conditional execution


class BranchCondition(BaseModel):
    """Condition for conditional task execution (branching)."""

    # Condition based on prior task result
    when_status: str | None = None  # e.g., "approved", "rejected"

    # Condition based on node state
    when_node_status: str | None = None
    when_node_ref: str | None = None

    # Custom expression (future)
    expression: str | None = None


class TaskFlowNode(BaseModel):
    """A node in the task flow DAG."""

    task_template_id: str

    # Positioning in DAG
    x: float = 0  # For visualization
    y: float = 0

    # Overrides for this instance
    name_override: str | None = None
    assignee_override: str | None = None


class TaskFlow(BaseModel):
    """A DAG defining a complete workflow of tasks."""

    id: str
    name: str
    description: str | None = None

    # The context this flow operates on
    context_node_type: str  # e.g., "Hypothesis" - the anchor node

    # DAG structure
    tasks: list[TaskFlowNode]
    dependencies: list[TaskDependency]

    # Entry points (tasks with no incoming dependencies)
    # Computed from dependencies, or explicitly marked
    entry_task_ids: list[str] = []

    # Terminal conditions
    terminal_task_ids: list[str] = []  # Tasks that end the flow

    # Flow metadata
    version: int = 1
    created_at: str
    updated_at: str
```

### 3. TaskFlowInstance (Runtime)

A **TaskFlowInstance** tracks the execution of a TaskFlow on a specific context node.

```python
class TaskStatus(str, Enum):
    """Status of a task instance."""

    PENDING = "pending"          # Not yet activatable
    READY = "ready"              # Dependencies met, can start
    IN_PROGRESS = "in_progress"  # Currently being worked on
    COMPLETED = "completed"      # Successfully finished
    SKIPPED = "skipped"          # Skipped due to branch condition
    BLOCKED = "blocked"          # Blocked by failed dependency
    FAILED = "failed"            # Failed execution


class TaskInstance(BaseModel):
    """Runtime state of a single task."""

    id: str
    task_template_id: str
    task_flow_instance_id: str

    status: TaskStatus = TaskStatus.PENDING

    # Assignment
    assignee_type: Literal["person", "agent", "unassigned"]
    assignee_id: str | None = None
    assigned_at: str | None = None

    # Timing
    started_at: str | None = None
    completed_at: str | None = None

    # Result (for branching decisions)
    result: str | None = None  # e.g., "approved", "rejected"
    result_data: dict[str, Any] = {}

    # Reference to the node/edge that completed this task
    completed_by_node_id: str | None = None
    completed_by_edge_id: str | None = None

    # For agent execution
    agent_run_id: str | None = None


class TaskFlowInstance(BaseModel):
    """Runtime instance of a task flow execution."""

    id: str
    task_flow_id: str
    workflow_id: str  # The parent workflow (context graph)

    # The anchor node this flow is executing on
    context_node_id: str
    context_node_type: str

    # Current state
    status: Literal["active", "completed", "cancelled", "failed"]

    # All task instances
    task_instances: list[TaskInstance]

    # Progress metrics (computed)
    total_tasks: int
    completed_tasks: int
    progress_percent: float

    # Current frontier (tasks that are ready)
    ready_task_ids: list[str]

    # Timing
    started_at: str
    completed_at: str | None = None
```

---

## Example: Scientific Hypothesis Workflow

```yaml
TaskFlow: hypothesis_validation
  name: "Hypothesis Validation"
  context_node_type: "Hypothesis"

  tasks:
    - id: draft_hypothesis
      template: create_hypothesis_draft
      # ExpectedDelta: create_node(type="Hypothesis", status="draft")

    - id: review_hypothesis
      template: review_hypothesis
      # ExpectedDelta: update_status(target="$context", to="under_review")

    - id: approve_hypothesis
      template: approve_or_reject
      # ExpectedDelta: update_status(target="$context", to=["approved", "rejected"])

    - id: create_samples
      template: add_samples
      # ExpectedDelta: create_edge(type="HAS_SAMPLE", from="$context")
      # min_count: 3 (at least 3 samples required)

    - id: add_analysis_type_a
      template: add_analysis
      # ExpectedDelta: create_node(type="Analysis", properties={"analysis_type": "Type A"})
      # + create_edge(type="ANALYZES", to="$sample")

    - id: add_analysis_type_b
      template: add_analysis
      # ExpectedDelta: create_node(type="Analysis", properties={"analysis_type": "Type B"})
      # Depends on: add_analysis_type_a (sequential ordering)

    - id: add_analysis_type_c
      template: add_analysis
      # Depends on: add_analysis_type_b

    - id: final_decision
      template: prove_or_disprove
      # ExpectedDelta: update_status(target="$context", to=["proven", "disproven"])

  dependencies:
    - from: draft_hypothesis → to: review_hypothesis
    - from: review_hypothesis → to: approve_hypothesis
    - from: approve_hypothesis → to: create_samples
      condition: {when_status: "approved"}
    - from: approve_hypothesis → to: end  # Terminal if rejected
      condition: {when_status: "rejected"}
    - from: create_samples → to: add_analysis_type_a
    - from: add_analysis_type_a → to: add_analysis_type_b
    - from: add_analysis_type_b → to: add_analysis_type_c
    - from: add_analysis_type_c → to: final_decision
```

Visualization:
```
                    ┌─────────────────┐
                    │ Draft Hypothesis│
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ Review Hypothesis│
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ Approve/Reject  │
                    └───┬─────────┬───┘
                        │         │
             ┌──────────▼──┐   ┌──▼──────────┐
             │ [approved]  │   │ [rejected]  │
             │ Add Samples │   │    END      │
             └──────┬──────┘   └─────────────┘
                    │
            ┌───────▼───────┐
            │ Analysis A    │
            └───────┬───────┘
                    │
            ┌───────▼───────┐
            │ Analysis B    │
            └───────┬───────┘
                    │
            ┌───────▼───────┐
            │ Analysis C    │
            └───────┬───────┘
                    │
            ┌───────▼───────┐
            │ Final Decision│
            │ (Prove/Disprove)│
            └───────────────┘
```

---

## Auto-Detection of Task Completion

The engine monitors graph events and auto-completes tasks when expected deltas occur.

```python
class TaskCompletionDetector:
    """Monitors graph events and completes tasks automatically."""

    async def on_event(self, event: Event, workflow_id: str):
        """Called when any graph event occurs."""

        # Find all active task flow instances for this workflow
        active_flows = await self.get_active_flows(workflow_id)

        for flow_instance in active_flows:
            # Check each ready task
            for task_instance in flow_instance.get_ready_tasks():
                if await self.matches_expected_delta(task_instance, event):
                    await self.complete_task(task_instance, event)
                    await self.advance_flow(flow_instance)

    async def matches_expected_delta(
        self,
        task_instance: TaskInstance,
        event: Event
    ) -> bool:
        """Check if event satisfies the task's expected delta."""

        template = await self.get_template(task_instance.task_template_id)
        delta = template.expected_delta

        match delta.delta_type:
            case "create_node":
                if event.event_type != "node_created":
                    return False
                return event.payload.get("type") == delta.node_type

            case "update_status":
                if event.event_type != "status_changed":
                    return False
                to_status = event.payload.get("to")
                expected = delta.to_status
                if isinstance(expected, list):
                    return to_status in expected
                return to_status == expected

            case "create_edge":
                if event.event_type != "edge_created":
                    return False
                return event.payload.get("edge_type") == delta.edge_type

        return False
```

---

## Agent Integration

Tasks can be assigned to AI agents for automatic execution.

```python
class AgentConfig(BaseModel):
    """Configuration for agent-based task execution."""

    agent_type: str  # e.g., "claude-agent", "custom-agent"

    # Instruction template (with variable substitution)
    instruction: str

    # Tools the agent can use
    allowed_tools: list[str] = []

    # Model configuration
    model: str = "claude-sonnet-4-20250514"
    max_turns: int = 20

    # Constraints
    timeout_seconds: int = 300
    max_retries: int = 3


class AgentTaskExecutor:
    """Executes tasks using AI agents."""

    async def execute_task(
        self,
        task_instance: TaskInstance,
        flow_instance: TaskFlowInstance,
    ):
        """Execute a task using its configured agent."""

        template = await self.get_template(task_instance.task_template_id)
        agent_config = template.agent_config

        # Build context for agent
        context = await self.build_context(flow_instance)

        # Prepare instruction with variable substitution
        instruction = self.substitute_variables(
            agent_config.instruction,
            context=context,
            task=task_instance,
        )

        # Execute agent
        result = await self.run_agent(
            instruction=instruction,
            tools=self.get_tools_for_workflow(flow_instance.workflow_id),
            config=agent_config,
        )

        # The agent's actions will trigger graph events
        # which will be picked up by TaskCompletionDetector
        return result
```

---

## Database Schema

```sql
-- Task flow definitions (schema layer)
CREATE TABLE task_templates (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    expected_delta_json TEXT NOT NULL,  -- JSON: ExpectedDelta
    completion_mode TEXT DEFAULT 'auto_detect',
    default_assignee_type TEXT DEFAULT 'unassigned',
    default_assignee TEXT,
    agent_config_json TEXT,  -- JSON: AgentConfig
    ui_hints_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (workflow_id) REFERENCES workflow_definitions(workflow_id)
);

CREATE TABLE task_flows (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    context_node_type TEXT NOT NULL,
    tasks_json TEXT NOT NULL,  -- JSON: list[TaskFlowNode]
    dependencies_json TEXT NOT NULL,  -- JSON: list[TaskDependency]
    version INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (workflow_id) REFERENCES workflow_definitions(workflow_id)
);

-- Task flow instances (runtime layer)
CREATE TABLE task_flow_instances (
    id TEXT PRIMARY KEY,
    task_flow_id TEXT NOT NULL,
    workflow_id TEXT NOT NULL,
    context_node_id TEXT NOT NULL,
    context_node_type TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    started_at TEXT NOT NULL,
    completed_at TEXT,
    FOREIGN KEY (task_flow_id) REFERENCES task_flows(id),
    FOREIGN KEY (workflow_id) REFERENCES workflow_definitions(workflow_id),
    FOREIGN KEY (context_node_id) REFERENCES nodes(id)
);

CREATE TABLE task_instances (
    id TEXT PRIMARY KEY,
    task_template_id TEXT NOT NULL,
    task_flow_instance_id TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    assignee_type TEXT DEFAULT 'unassigned',
    assignee_id TEXT,
    assigned_at TEXT,
    started_at TEXT,
    completed_at TEXT,
    result TEXT,
    result_data_json TEXT,
    completed_by_node_id TEXT,
    completed_by_edge_id TEXT,
    agent_run_id TEXT,
    FOREIGN KEY (task_template_id) REFERENCES task_templates(id),
    FOREIGN KEY (task_flow_instance_id) REFERENCES task_flow_instances(id)
);

-- Indexes for efficient queries
CREATE INDEX idx_task_flow_instances_workflow
    ON task_flow_instances(workflow_id, status);
CREATE INDEX idx_task_flow_instances_context
    ON task_flow_instances(context_node_id);
CREATE INDEX idx_task_instances_flow
    ON task_instances(task_flow_instance_id, status);
CREATE INDEX idx_task_instances_assignee
    ON task_instances(assignee_type, assignee_id, status);
```

---

## API Endpoints

```
# Task Templates (Schema)
GET    /api/v1/workflows/{wf_id}/task-templates
POST   /api/v1/workflows/{wf_id}/task-templates
GET    /api/v1/workflows/{wf_id}/task-templates/{id}
PATCH  /api/v1/workflows/{wf_id}/task-templates/{id}
DELETE /api/v1/workflows/{wf_id}/task-templates/{id}

# Task Flows (DAG Definitions)
GET    /api/v1/workflows/{wf_id}/task-flows
POST   /api/v1/workflows/{wf_id}/task-flows
GET    /api/v1/workflows/{wf_id}/task-flows/{id}
PATCH  /api/v1/workflows/{wf_id}/task-flows/{id}
DELETE /api/v1/workflows/{wf_id}/task-flows/{id}
GET    /api/v1/workflows/{wf_id}/task-flows/{id}/visualize  # DAG visualization data

# Task Flow Instances (Runtime)
GET    /api/v1/workflows/{wf_id}/task-flow-instances
POST   /api/v1/workflows/{wf_id}/task-flow-instances  # Start a new flow on a context node
GET    /api/v1/workflows/{wf_id}/task-flow-instances/{id}
GET    /api/v1/workflows/{wf_id}/task-flow-instances/{id}/progress  # Progress summary
POST   /api/v1/workflows/{wf_id}/task-flow-instances/{id}/cancel

# Task Instances (Individual Tasks)
GET    /api/v1/workflows/{wf_id}/task-instances
GET    /api/v1/workflows/{wf_id}/task-instances/{id}
PATCH  /api/v1/workflows/{wf_id}/task-instances/{id}  # Update assignment, manual complete
POST   /api/v1/workflows/{wf_id}/task-instances/{id}/assign
POST   /api/v1/workflows/{wf_id}/task-instances/{id}/start
POST   /api/v1/workflows/{wf_id}/task-instances/{id}/complete
POST   /api/v1/workflows/{wf_id}/task-instances/{id}/execute-agent  # Trigger agent execution

# Convenience: Tasks by context node
GET    /api/v1/workflows/{wf_id}/nodes/{node_id}/tasks  # All tasks related to this node
GET    /api/v1/workflows/{wf_id}/nodes/{node_id}/next-tasks  # What's ready next

# My Tasks (cross-workflow)
GET    /api/v1/my-tasks?assignee_id={id}&status=ready
```

---

## Frontend Components

### 1. Task Flow Designer

Visual DAG editor for creating task flows:
- Drag-and-drop task templates
- Connect tasks with dependency arrows
- Configure branch conditions on connections
- Preview flow execution

### 2. Task Flow Progress View

Shows execution state of a task flow instance:
- DAG visualization with completed/ready/pending coloring
- Current frontier highlighted
- Click task to see details/assignment
- Progress bar and completion percentage

### 3. Task List View

Filterable list of task instances:
- Group by flow, by assignee, by status
- Quick actions: assign, start, complete
- Agent execution trigger button

### 4. Task Detail Panel

Full details of a task instance:
- Expected delta visualization
- Assignment controls
- Timing information
- Related nodes/edges
- Agent execution logs

### 5. My Tasks Dashboard

Personal view of assigned tasks across all workflows:
- Grouped by workflow
- Sorted by priority/due date
- Quick action buttons

---

## Implementation Phases

### Phase 1: Core Models & Storage
- [ ] Add Pydantic models for TaskTemplate, TaskFlow, TaskFlowInstance, TaskInstance
- [ ] Create database tables and migrations
- [ ] Implement GraphStore methods for task CRUD

### Phase 2: Task Flow Engine
- [ ] Implement TaskFlowEngine (start flow, compute ready tasks, advance flow)
- [ ] Implement TaskCompletionDetector (event monitoring, auto-completion)
- [ ] Add event hooks to existing node/edge creation/update endpoints
- [ ] Branch condition evaluation

### Phase 3: API Endpoints
- [ ] Task template CRUD endpoints
- [ ] Task flow CRUD endpoints
- [ ] Task flow instance endpoints
- [ ] Task instance endpoints
- [ ] Progress and visualization endpoints

### Phase 4: Agent Integration
- [ ] AgentConfig model and storage
- [ ] AgentTaskExecutor implementation
- [ ] Agent execution endpoint
- [ ] Logging and monitoring for agent runs

### Phase 5: Frontend Components
- [ ] Task flow designer (visual DAG editor)
- [ ] Task flow progress view
- [ ] Task list view
- [ ] Task detail panel
- [ ] My tasks dashboard

### Phase 6: Advanced Features
- [ ] Parallel task execution (multiple tasks in same level)
- [ ] Loop constructs (repeat until condition)
- [ ] Timeout and SLA tracking
- [ ] Notifications and webhooks
- [ ] Task flow templates (reusable across workflows)

---

## Key Design Decisions

### 1. Tasks as Expected Deltas
Tasks are completed when the graph changes in a specific way. This is:
- **Observable**: Any graph mutation can satisfy a task
- **Decoupled**: The system doesn't care HOW the delta happens (UI, API, agent)
- **Auditable**: Events already record all changes

### 2. Multiple Task Flows per Workflow
A single workflow (context graph) can have multiple task flow definitions:
- Different processes for different contexts
- Run multiple flows concurrently on the same or different nodes
- Compose flows for complex scenarios

### 3. Context Node as Anchor
Each task flow instance is anchored to a "context node":
- Provides scope for relative references (`$context`, `$parent`)
- Enables multiple parallel executions
- Natural grouping for progress tracking

### 4. Branch Conditions on Dependencies
Branching happens via conditions on the dependency edges, not on tasks:
- Keeps tasks simple (just expected deltas)
- Allows same task to lead to different branches
- Easy to visualize in DAG

### 5. Auto-Detection with Manual Override
Default is auto-detection (watch for matching events), but:
- Can be set to `manual` (require explicit completion call)
- Can be set to `agent` (trigger agent execution when ready)

---

## Integration with Existing Systems

### Rules System
Existing rules (require edges before status transition) still apply:
- Task completion blocked if rule violation
- Can surface rule violations in task UI as "blockers"

### Events System
Tasks leverage existing events:
- `node_created` → completes `create_node` tasks
- `status_changed` → completes `update_status` tasks
- `edge_created` → completes `create_edge` tasks

### View Templates
New view types for tasks:
- `task_flow` style: Show DAG with progress
- `task_list` style: Show task instances as cards/rows
- Integrate with existing views (show task badges on nodes)

---

## Example: Starting a Task Flow

```python
# 1. Define a task flow for hypothesis validation (done once)
task_flow = TaskFlow(
    id="hypothesis_validation_v1",
    name="Hypothesis Validation",
    context_node_type="Hypothesis",
    tasks=[...],
    dependencies=[...],
)

# 2. Create a hypothesis node
hypothesis = await graph_store.create_node(
    workflow_id="my_workflow",
    node=NodeCreate(type="Hypothesis", title="H1: Effect X causes Y", status="draft"),
)

# 3. Start the task flow on this hypothesis
flow_instance = await task_flow_engine.start_flow(
    task_flow_id="hypothesis_validation_v1",
    workflow_id="my_workflow",
    context_node_id=hypothesis.id,
)

# 4. Query ready tasks
ready = await task_flow_engine.get_ready_tasks(flow_instance.id)
# Returns: [TaskInstance(template="review_hypothesis", status="ready")]

# 5. As user/agent performs actions, tasks auto-complete
# When hypothesis status changes to "approved", the approve_hypothesis task completes
# and create_samples becomes ready

# 6. Query progress at any time
progress = await task_flow_engine.get_progress(flow_instance.id)
# Returns: { completed: 3, total: 8, percent: 37.5, next_tasks: [...] }
```

---

## Questions to Resolve

1. **Task assignment inheritance**: Should child tasks inherit assignees from parent flow or task?
2. **Partial completion**: How to handle tasks with `min_count > 1` (e.g., "add at least 3 samples")?
3. **Flow modification**: Can you modify a task flow while instances are active?
4. **Cross-flow dependencies**: Can a task in one flow depend on a task in another flow?
5. **Rollback**: What happens when a completed task's delta is undone (node deleted)?

---

## Summary

This design introduces a third layer—the **Execution Graph**—that orchestrates work on the Instance Graph according to definitions in the Schema Graph. It enables:

| Capability | How |
|------------|-----|
| **Define expected work** | TaskTemplates with ExpectedDeltas |
| **Orchestrate sequences** | TaskFlows as DAGs with dependencies |
| **Track progress** | TaskFlowInstances with computed metrics |
| **Branch on decisions** | BranchConditions on dependencies |
| **Assign work** | TaskInstances with assignee fields |
| **Automate with agents** | AgentConfig + AgentTaskExecutor |
| **Multiple concurrent flows** | Many TaskFlowInstances per workflow |

The architecture preserves the existing two-graph model while adding powerful orchestration capabilities on top.
