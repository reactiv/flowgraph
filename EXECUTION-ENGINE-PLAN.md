# Workflow Execution Engine Plan

A comprehensive plan for adding workflow execution capabilities to Workflow Graph Studio, transforming it from a workflow *definition and visualization* tool into a complete *workflow management and execution* platform.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current State Analysis](#current-state-analysis)
3. [Architecture Overview](#architecture-overview)
4. [Core Components](#core-components)
5. [Data Models](#data-models)
6. [Execution Semantics](#execution-semantics)
7. [API Design](#api-design)
8. [Agent Integration](#agent-integration)
9. [Human-in-the-Loop](#human-in-the-loop)
10. [Observability](#observability)
11. [Implementation Phases](#implementation-phases)
12. [Migration Strategy](#migration-strategy)
13. [Testing Strategy](#testing-strategy)
14. [Risk Assessment](#risk-assessment)

---

## Executive Summary

### Goal

Add a workflow execution engine that enables:
- **Automatic state transitions** based on rules and conditions
- **Task assignment and work queues** for human participants
- **Agent-driven automation** for AI-powered workflow steps
- **Event-driven triggers** from external systems
- **Multi-agent orchestration** for complex workflows

### Key Principles

1. **Backward Compatible**: Existing workflows continue to work without execution features
2. **Opt-In Execution**: Workflows enable execution mode explicitly
3. **Hybrid Automation**: Mix of human tasks, agent tasks, and automatic transitions
4. **Observable**: Full visibility into execution state, history, and performance
5. **Resilient**: Graceful handling of failures with retry and compensation

### Success Metrics

| Metric | Target |
|--------|--------|
| Workflows with execution enabled | 50% of new workflows |
| Average automation rate | 60% of transitions are automatic |
| Agent task completion rate | 95% success |
| Human task response time | Visible in dashboard |
| System uptime | 99.9% |

---

## Current State Analysis

### What Exists

```
WorkflowDefinition
├── node_types[]        # Define entities with fields and states
│   ├── states          # Possible status values
│   └── fields[]        # Data schema per node
├── edge_types[]        # Define relationships
├── rules[]             # Validation rules (not enforced)
└── views[]             # UI configurations

Instance Data
├── nodes[]             # Entity instances with status
├── edges[]             # Relationship instances
└── events[]            # Audit trail (passive logging)
```

### What's Missing

| Component | Status | Gap |
|-----------|--------|-----|
| State machine | ❌ | No automatic transitions |
| Task queue | ❌ | No work assignment |
| Scheduler | ❌ | No timer/delay activities |
| Event processor | ❌ | Events are passive logs only |
| Rule engine | ⚠️ | Rules exist but aren't executed |
| Agent executor | ⚠️ | Agents transform data but don't execute tasks |
| Webhook handler | ❌ | No external triggers |

### Current Rule Structure (Unused)

```python
class Rule(BaseModel):
    id: str
    when: RuleCondition      # nodeType, transitionTo, transitionFrom
    require_edges: list[RequiredEdge]  # min_count, edge_type, target_type
```

Rules are validated during manual status updates but never trigger automatic actions.

---

## Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         API Layer (FastAPI)                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │
│  │  Workflow   │  │    Task     │  │   Agent     │  │  Webhook   │ │
│  │  Endpoints  │  │  Endpoints  │  │  Endpoints  │  │  Receiver  │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────┬──────┘ │
│         │                │                │                │        │
├─────────┼────────────────┼────────────────┼────────────────┼────────┤
│         │                │                │                │        │
│         ▼                ▼                ▼                ▼        │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Execution Engine                          │   │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐ │   │
│  │  │   State   │  │   Task    │  │   Event   │  │ Scheduler │ │   │
│  │  │  Machine  │  │   Queue   │  │ Processor │  │           │ │   │
│  │  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘ │   │
│  │        │              │              │              │        │   │
│  │        └──────────────┴──────────────┴──────────────┘        │   │
│  │                           │                                   │   │
│  │                    ┌──────▼──────┐                           │   │
│  │                    │    Rule     │                           │   │
│  │                    │   Engine    │                           │   │
│  │                    └─────────────┘                           │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────┐ │
│  │   Agent     │  │   Human     │  │       External Systems      │ │
│  │  Executor   │  │   Workers   │  │  (Webhooks, APIs, Events)   │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────────┘ │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                    Persistence Layer                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────┐ │
│  │  GraphStore │  │  TaskStore  │  │       ExecutionStore        │ │
│  │  (existing) │  │   (new)     │  │          (new)              │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility |
|-----------|---------------|
| **State Machine** | Manages node lifecycle, validates transitions, triggers actions |
| **Task Queue** | Assigns work to humans/agents, tracks completion, handles timeouts |
| **Event Processor** | Consumes events, triggers rules, maintains event sourcing |
| **Scheduler** | Executes delayed/scheduled tasks, handles timers |
| **Rule Engine** | Evaluates conditions, determines actions, enforces constraints |
| **Agent Executor** | Runs agent tasks with context, handles retries, reports results |

---

## Core Components

### 1. State Machine

The state machine manages node lifecycle with explicit transitions.

```python
class StateMachine:
    """Manages state transitions for workflow nodes."""

    async def can_transition(
        self,
        node: Node,
        from_state: str,
        to_state: str,
        context: ExecutionContext
    ) -> TransitionResult:
        """Check if transition is valid without executing."""

    async def transition(
        self,
        node: Node,
        to_state: str,
        context: ExecutionContext,
        trigger: TransitionTrigger
    ) -> TransitionResult:
        """Execute state transition with side effects."""

    async def get_available_transitions(
        self,
        node: Node,
        context: ExecutionContext
    ) -> list[AvailableTransition]:
        """Get all valid transitions from current state."""
```

**Transition Types**:

| Type | Description | Example |
|------|-------------|---------|
| `manual` | User-initiated via UI | Click "Complete" button |
| `automatic` | Rule-triggered | All approvals received → Approved |
| `agent` | Agent-initiated | Agent marks task done |
| `timer` | Time-based | 7 days with no action → Escalated |
| `external` | Webhook/API triggered | CI pipeline success → Deployed |

### 2. Task Queue

Manages work items for humans and agents.

```python
class TaskQueue:
    """Manages task assignment and execution."""

    async def create_task(
        self,
        node_id: str,
        task_type: TaskType,
        assignee: Assignee | None,
        context: TaskContext
    ) -> Task:
        """Create a new task for a node."""

    async def assign_task(
        self,
        task_id: str,
        assignee: Assignee
    ) -> Task:
        """Assign or reassign a task."""

    async def complete_task(
        self,
        task_id: str,
        result: TaskResult,
        completed_by: Assignee
    ) -> Task:
        """Mark task as completed with result."""

    async def get_queue(
        self,
        workflow_id: str,
        filters: TaskFilters
    ) -> list[Task]:
        """Get tasks matching filters (by assignee, status, type)."""

    async def claim_next(
        self,
        workflow_id: str,
        assignee: Assignee,
        task_types: list[TaskType]
    ) -> Task | None:
        """Claim next available task for processing."""
```

**Task States**:

```
┌─────────┐     ┌──────────┐     ┌─────────────┐     ┌───────────┐
│ pending │ ──▶ │ assigned │ ──▶ │ in_progress │ ──▶ │ completed │
└─────────┘     └──────────┘     └─────────────┘     └───────────┘
     │               │                  │
     │               │                  ▼
     │               │           ┌───────────┐
     │               └─────────▶ │  failed   │
     │                           └───────────┘
     │                                 │
     ▼                                 ▼
┌───────────┐                   ┌───────────┐
│ cancelled │                   │  retrying │
└───────────┘                   └───────────┘
```

### 3. Event Processor

Processes events and triggers downstream actions.

```python
class EventProcessor:
    """Processes events and triggers reactions."""

    async def emit(
        self,
        event: ExecutionEvent
    ) -> None:
        """Emit an event for processing."""

    async def process(
        self,
        event: ExecutionEvent
    ) -> list[Action]:
        """Process event and return triggered actions."""

    async def subscribe(
        self,
        pattern: EventPattern,
        handler: EventHandler
    ) -> Subscription:
        """Subscribe to events matching pattern."""
```

**Event Types**:

| Event | Payload | Triggered By |
|-------|---------|--------------|
| `node.created` | node data | API, agent |
| `node.updated` | diff | API, agent |
| `node.state_changed` | from, to, trigger | State machine |
| `edge.created` | edge data | API, agent |
| `edge.deleted` | edge_id | API, agent |
| `task.created` | task data | State machine |
| `task.completed` | task, result | Human, agent |
| `task.failed` | task, error | Human, agent |
| `rule.triggered` | rule, context | Rule engine |
| `agent.started` | agent_id, task | Agent executor |
| `agent.completed` | agent_id, result | Agent executor |
| `webhook.received` | source, payload | Webhook receiver |
| `timer.fired` | timer_id, node | Scheduler |

### 4. Scheduler

Handles time-based execution.

```python
class Scheduler:
    """Manages scheduled and delayed execution."""

    async def schedule(
        self,
        action: ScheduledAction,
        execute_at: datetime,
        context: ExecutionContext
    ) -> ScheduledTask:
        """Schedule an action for future execution."""

    async def schedule_relative(
        self,
        action: ScheduledAction,
        delay: timedelta,
        context: ExecutionContext
    ) -> ScheduledTask:
        """Schedule an action after a delay."""

    async def cancel(
        self,
        scheduled_task_id: str
    ) -> None:
        """Cancel a scheduled task."""

    async def reschedule(
        self,
        scheduled_task_id: str,
        new_execute_at: datetime
    ) -> ScheduledTask:
        """Reschedule a task to a new time."""
```

**Use Cases**:

- **SLA Timers**: Escalate if not reviewed within 48 hours
- **Reminders**: Notify assignee after 24 hours of inactivity
- **Auto-Close**: Close stale items after 30 days
- **Recurring**: Generate weekly status report every Monday

### 5. Rule Engine

Evaluates conditions and determines actions.

```python
class RuleEngine:
    """Evaluates rules and determines actions."""

    async def evaluate(
        self,
        node: Node,
        event: ExecutionEvent,
        context: ExecutionContext
    ) -> list[RuleMatch]:
        """Evaluate all applicable rules for an event."""

    async def execute(
        self,
        rule_match: RuleMatch,
        context: ExecutionContext
    ) -> ActionResult:
        """Execute actions for a matched rule."""
```

**Extended Rule Model**:

```python
class ExecutionRule(BaseModel):
    """Extended rule with execution capabilities."""

    id: str
    name: str
    description: str | None
    enabled: bool = True
    priority: int = 0  # Higher priority rules execute first

    # When to trigger
    trigger: RuleTrigger  # on_event, on_state_change, on_schedule

    # Conditions to match
    when: RuleCondition

    # Actions to execute
    then: list[RuleAction]

    # Error handling
    on_error: ErrorStrategy = "log"  # log, retry, escalate, compensate


class RuleTrigger(BaseModel):
    """When a rule should be evaluated."""

    type: Literal["event", "state_change", "schedule", "manual"]
    event_types: list[str] | None  # For event triggers
    from_states: list[str] | None  # For state_change triggers
    to_states: list[str] | None    # For state_change triggers
    cron: str | None               # For schedule triggers


class RuleCondition(BaseModel):
    """Conditions for rule matching."""

    node_type: str | None
    state: str | None

    # Edge conditions (existing)
    require_edges: list[RequiredEdge] | None

    # Field conditions (new)
    field_conditions: list[FieldCondition] | None

    # Graph conditions (new)
    graph_conditions: list[GraphCondition] | None

    # Custom expression (new)
    expression: str | None  # e.g., "node.priority == 'high' and edge_count('approval') >= 2"


class RuleAction(BaseModel):
    """Action to execute when rule matches."""

    type: ActionType
    params: dict[str, Any]


class ActionType(str, Enum):
    transition_state = "transition_state"    # Change node state
    create_task = "create_task"              # Create human/agent task
    create_node = "create_node"              # Create related node
    create_edge = "create_edge"              # Create relationship
    update_field = "update_field"            # Update node field
    send_notification = "send_notification"  # Send notification
    call_webhook = "call_webhook"            # Call external webhook
    run_agent = "run_agent"                  # Execute agent task
    schedule_action = "schedule_action"      # Schedule future action
    cancel_timer = "cancel_timer"            # Cancel scheduled action
```

---

## Data Models

### Execution Tables

```sql
-- Task queue for human and agent work
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    node_id TEXT NOT NULL,

    -- Task definition
    task_type TEXT NOT NULL,          -- 'human', 'agent', 'automatic'
    title TEXT NOT NULL,
    description TEXT,
    instructions TEXT,                 -- For agents

    -- Assignment
    assignee_type TEXT,               -- 'user', 'agent', 'group'
    assignee_id TEXT,
    assigned_at TIMESTAMP,

    -- Lifecycle
    status TEXT NOT NULL DEFAULT 'pending',
    priority INTEGER DEFAULT 0,

    -- Timing
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    due_at TIMESTAMP,

    -- Result
    result_type TEXT,                 -- 'success', 'failure', 'skipped'
    result_data TEXT,                 -- JSON
    error_message TEXT,

    -- Execution metadata
    attempt_count INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,

    FOREIGN KEY (workflow_id) REFERENCES workflows(id),
    FOREIGN KEY (node_id) REFERENCES nodes(id)
);

-- Scheduled actions
CREATE TABLE scheduled_actions (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    node_id TEXT,

    -- Action definition
    action_type TEXT NOT NULL,
    action_params TEXT NOT NULL,      -- JSON

    -- Timing
    execute_at TIMESTAMP NOT NULL,
    executed_at TIMESTAMP,

    -- Status
    status TEXT NOT NULL DEFAULT 'pending',  -- pending, executed, cancelled, failed

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT,

    FOREIGN KEY (workflow_id) REFERENCES workflows(id)
);

-- Execution history
CREATE TABLE execution_history (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    node_id TEXT,
    task_id TEXT,

    -- Event
    event_type TEXT NOT NULL,
    event_data TEXT NOT NULL,         -- JSON

    -- Execution
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    executed_by TEXT,                 -- user_id, agent_id, 'system'

    -- Result
    success BOOLEAN NOT NULL,
    error_message TEXT,
    duration_ms INTEGER,

    FOREIGN KEY (workflow_id) REFERENCES workflows(id)
);

-- Active timers
CREATE TABLE timers (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    node_id TEXT NOT NULL,

    -- Timer definition
    timer_type TEXT NOT NULL,         -- 'sla', 'reminder', 'auto_close'
    fires_at TIMESTAMP NOT NULL,

    -- Action when fired
    action_type TEXT NOT NULL,
    action_params TEXT NOT NULL,      -- JSON

    -- Status
    status TEXT NOT NULL DEFAULT 'active',  -- active, fired, cancelled
    fired_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (workflow_id) REFERENCES workflows(id),
    FOREIGN KEY (node_id) REFERENCES nodes(id)
);

-- Execution rules (extends schema rules)
CREATE TABLE execution_rules (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,

    -- Rule definition (JSON)
    rule_definition TEXT NOT NULL,

    -- Status
    enabled BOOLEAN DEFAULT TRUE,
    priority INTEGER DEFAULT 0,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,

    FOREIGN KEY (workflow_id) REFERENCES workflows(id)
);

-- Indexes for performance
CREATE INDEX idx_tasks_workflow_status ON tasks(workflow_id, status);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_type, assignee_id, status);
CREATE INDEX idx_scheduled_actions_execute ON scheduled_actions(execute_at, status);
CREATE INDEX idx_timers_fires ON timers(fires_at, status);
CREATE INDEX idx_execution_history_workflow ON execution_history(workflow_id, executed_at);
```

### Pydantic Models

```python
# backend/app/models/execution.py

from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Literal
from pydantic import BaseModel, Field


class TaskType(str, Enum):
    human = "human"
    agent = "agent"
    automatic = "automatic"


class TaskStatus(str, Enum):
    pending = "pending"
    assigned = "assigned"
    in_progress = "in_progress"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"
    retrying = "retrying"


class Assignee(BaseModel):
    type: Literal["user", "agent", "group"]
    id: str
    name: str | None = None


class Task(BaseModel):
    id: str
    workflow_id: str
    node_id: str

    task_type: TaskType
    title: str
    description: str | None = None
    instructions: str | None = None  # For agents

    assignee: Assignee | None = None
    assigned_at: datetime | None = None

    status: TaskStatus = TaskStatus.pending
    priority: int = 0

    created_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None
    due_at: datetime | None = None

    result_type: Literal["success", "failure", "skipped"] | None = None
    result_data: dict[str, Any] | None = None
    error_message: str | None = None

    attempt_count: int = 0
    max_attempts: int = 3


class TaskCreate(BaseModel):
    node_id: str
    task_type: TaskType
    title: str
    description: str | None = None
    instructions: str | None = None
    assignee: Assignee | None = None
    priority: int = 0
    due_at: datetime | None = None


class TaskResult(BaseModel):
    type: Literal["success", "failure", "skipped"]
    data: dict[str, Any] | None = None
    message: str | None = None


class TransitionTrigger(BaseModel):
    type: Literal["manual", "automatic", "agent", "timer", "external"]
    source: str | None = None  # user_id, agent_id, rule_id, timer_id, webhook_source
    metadata: dict[str, Any] | None = None


class TransitionResult(BaseModel):
    success: bool
    from_state: str
    to_state: str
    trigger: TransitionTrigger
    node_id: str
    executed_at: datetime
    actions_triggered: list[str] = []
    error_message: str | None = None


class AvailableTransition(BaseModel):
    to_state: str
    allowed: bool
    blockers: list[str] = []  # Reasons why transition is blocked
    requirements: list[str] = []  # What's needed to allow transition


class ScheduledAction(BaseModel):
    id: str
    workflow_id: str
    node_id: str | None

    action_type: str
    action_params: dict[str, Any]

    execute_at: datetime
    executed_at: datetime | None = None
    status: Literal["pending", "executed", "cancelled", "failed"]

    created_at: datetime
    created_by: str | None = None


class Timer(BaseModel):
    id: str
    workflow_id: str
    node_id: str

    timer_type: Literal["sla", "reminder", "auto_close", "custom"]
    fires_at: datetime

    action_type: str
    action_params: dict[str, Any]

    status: Literal["active", "fired", "cancelled"]
    fired_at: datetime | None = None

    created_at: datetime


class ExecutionEvent(BaseModel):
    id: str
    workflow_id: str
    node_id: str | None
    task_id: str | None

    event_type: str
    event_data: dict[str, Any]

    executed_at: datetime
    executed_by: str  # user_id, agent_id, 'system'

    success: bool
    error_message: str | None = None
    duration_ms: int | None = None


class ExecutionContext(BaseModel):
    """Context passed through execution pipeline."""

    workflow_id: str
    node_id: str | None = None
    task_id: str | None = None

    triggered_by: str  # user_id, agent_id, rule_id, 'system'
    trigger_type: str  # 'manual', 'rule', 'timer', 'webhook', 'agent'

    # Graph context
    node: dict[str, Any] | None = None
    connected_nodes: list[dict[str, Any]] = []

    # Execution chain
    parent_event_id: str | None = None
    depth: int = 0  # Prevent infinite loops
    max_depth: int = 10

    # Metadata
    started_at: datetime = Field(default_factory=datetime.utcnow)
    metadata: dict[str, Any] = {}
```

---

## Execution Semantics

### State Transition Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     Transition Request                          │
│  (manual, automatic, agent, timer, external)                    │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                     1. Validate Transition                       │
│  - Check state exists in node type                              │
│  - Check transition is allowed (from → to)                      │
│  - Check preconditions (edge requirements, field conditions)    │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                         ┌────────┴────────┐
                         │                 │
                    Valid?            Invalid
                         │                 │
                         ▼                 ▼
              ┌──────────────────┐  ┌──────────────────┐
              │  2. Pre-hooks    │  │  Return Error    │
              │  - Check rules   │  │  with blockers   │
              │  - Custom logic  │  └──────────────────┘
              └────────┬─────────┘
                       │
                       ▼
              ┌──────────────────┐
              │  3. Execute      │
              │  - Update state  │
              │  - Log event     │
              │  - Update audit  │
              └────────┬─────────┘
                       │
                       ▼
              ┌──────────────────┐
              │  4. Post-hooks   │
              │  - Trigger rules │
              │  - Create tasks  │
              │  - Set timers    │
              │  - Notify        │
              └────────┬─────────┘
                       │
                       ▼
              ┌──────────────────┐
              │  5. Cascade      │
              │  - Check other   │
              │    nodes for     │
              │    auto-trigger  │
              └──────────────────┘
```

### Task Execution Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        Task Created                             │
│  (from rule, API, state transition)                            │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
               Human Task                  Agent Task
                    │                           │
                    ▼                           ▼
           ┌───────────────┐           ┌───────────────┐
           │ Add to Queue  │           │ Agent Executor│
           │ Notify User   │           │ - Load context│
           │ Set SLA Timer │           │ - Run agent   │
           └───────┬───────┘           │ - Retry logic │
                   │                   └───────┬───────┘
                   │                           │
                   ▼                           ▼
           ┌───────────────┐           ┌───────────────┐
           │ User Claims   │           │ Agent Result  │
           │ Task          │           │ - Validate    │
           └───────┬───────┘           │ - Apply       │
                   │                   └───────┬───────┘
                   ▼                           │
           ┌───────────────┐                   │
           │ User Completes│                   │
           │ Task          │                   │
           └───────┬───────┘                   │
                   │                           │
                   └───────────┬───────────────┘
                               │
                               ▼
                    ┌──────────────────┐
                    │ Task Completed   │
                    │ - Log result     │
                    │ - Cancel timers  │
                    │ - Trigger rules  │
                    │ - Maybe transition│
                    └──────────────────┘
```

### Rule Evaluation Order

1. **Priority**: Higher priority rules evaluate first
2. **Specificity**: More specific conditions match before general
3. **Conflict Resolution**: First matching rule wins (or all if `allow_multiple`)
4. **Depth Limit**: Maximum cascade depth of 10 to prevent loops

---

## API Design

### Task Endpoints

```
# Task Queue
GET    /api/v1/workflows/{id}/tasks                    # List tasks
POST   /api/v1/workflows/{id}/tasks                    # Create task
GET    /api/v1/workflows/{id}/tasks/{task_id}          # Get task
PATCH  /api/v1/workflows/{id}/tasks/{task_id}          # Update task
DELETE /api/v1/workflows/{id}/tasks/{task_id}          # Cancel task

# Task Actions
POST   /api/v1/workflows/{id}/tasks/{task_id}/assign   # Assign task
POST   /api/v1/workflows/{id}/tasks/{task_id}/claim    # Self-assign
POST   /api/v1/workflows/{id}/tasks/{task_id}/start    # Start working
POST   /api/v1/workflows/{id}/tasks/{task_id}/complete # Complete task
POST   /api/v1/workflows/{id}/tasks/{task_id}/fail     # Mark failed
POST   /api/v1/workflows/{id}/tasks/{task_id}/retry    # Retry failed task

# My Tasks (cross-workflow)
GET    /api/v1/tasks/my                                # My assigned tasks
GET    /api/v1/tasks/available                         # Unassigned claimable
POST   /api/v1/tasks/claim-next                        # Claim next available
```

### Execution Endpoints

```
# State Transitions
GET    /api/v1/workflows/{id}/nodes/{node_id}/transitions    # Available transitions
POST   /api/v1/workflows/{id}/nodes/{node_id}/transition     # Execute transition

# Timers
GET    /api/v1/workflows/{id}/timers                         # List active timers
POST   /api/v1/workflows/{id}/timers                         # Create timer
DELETE /api/v1/workflows/{id}/timers/{timer_id}              # Cancel timer

# Scheduled Actions
GET    /api/v1/workflows/{id}/scheduled                      # List scheduled
POST   /api/v1/workflows/{id}/scheduled                      # Schedule action
DELETE /api/v1/workflows/{id}/scheduled/{action_id}          # Cancel scheduled

# Execution Rules
GET    /api/v1/workflows/{id}/execution-rules                # List rules
POST   /api/v1/workflows/{id}/execution-rules                # Create rule
PATCH  /api/v1/workflows/{id}/execution-rules/{rule_id}      # Update rule
DELETE /api/v1/workflows/{id}/execution-rules/{rule_id}      # Delete rule
POST   /api/v1/workflows/{id}/execution-rules/test           # Test rule

# Execution History
GET    /api/v1/workflows/{id}/execution-history              # List history
GET    /api/v1/workflows/{id}/nodes/{node_id}/history        # Node history

# Webhooks
POST   /api/v1/webhooks/{workflow_id}/{hook_id}              # Receive webhook
GET    /api/v1/workflows/{id}/webhooks                       # List webhook configs
POST   /api/v1/workflows/{id}/webhooks                       # Create webhook config
```

### Example: Transition with Requirements Check

```http
GET /api/v1/workflows/123/nodes/456/transitions

Response:
{
  "current_state": "in_review",
  "available_transitions": [
    {
      "to_state": "approved",
      "allowed": false,
      "blockers": [
        "Requires at least 2 'approval' edges (currently has 1)"
      ],
      "requirements": [
        "Add 1 more approval"
      ]
    },
    {
      "to_state": "rejected",
      "allowed": true,
      "blockers": [],
      "requirements": []
    },
    {
      "to_state": "needs_revision",
      "allowed": true,
      "blockers": [],
      "requirements": []
    }
  ]
}
```

### Example: Execute Transition

```http
POST /api/v1/workflows/123/nodes/456/transition
{
  "to_state": "approved",
  "trigger": {
    "type": "manual",
    "source": "user_789"
  },
  "metadata": {
    "comment": "Looks good, approved!"
  }
}

Response:
{
  "success": true,
  "from_state": "in_review",
  "to_state": "approved",
  "trigger": {
    "type": "manual",
    "source": "user_789"
  },
  "node_id": "456",
  "executed_at": "2024-01-15T10:30:00Z",
  "actions_triggered": [
    "notify_author",
    "create_deployment_task"
  ]
}
```

---

## Agent Integration

### Agent Task Executor

```python
class AgentTaskExecutor:
    """Executes agent tasks within workflow context."""

    def __init__(
        self,
        anthropic_client: Anthropic,
        graph_store: GraphStore,
        task_store: TaskStore
    ):
        self.client = anthropic_client
        self.graph_store = graph_store
        self.task_store = task_store

    async def execute(
        self,
        task: Task,
        context: ExecutionContext
    ) -> TaskResult:
        """Execute an agent task."""

        # 1. Gather context
        node = await self.graph_store.get_node(task.node_id)
        neighbors = await self.graph_store.get_neighbors(task.node_id)
        workflow = await self.graph_store.get_workflow(task.workflow_id)

        # 2. Build agent prompt
        prompt = self._build_prompt(task, node, neighbors, workflow)

        # 3. Create agent with tools
        agent = Agent(
            client=self.client,
            model="claude-sonnet-4-20250514",
            system_prompt=self._get_system_prompt(workflow),
            tools=[
                self._get_graph_tools(context),
                self._get_transition_tools(context),
                self._get_task_tools(context),
            ]
        )

        # 4. Run agent with retry
        for attempt in range(task.max_attempts):
            try:
                result = await agent.run(prompt)
                return TaskResult(
                    type="success",
                    data=result.output,
                    message=result.summary
                )
            except Exception as e:
                if attempt == task.max_attempts - 1:
                    return TaskResult(
                        type="failure",
                        message=str(e)
                    )
                await asyncio.sleep(2 ** attempt)

    def _get_graph_tools(self, context: ExecutionContext) -> list[Tool]:
        """Tools for reading/writing graph data."""
        return [
            Tool(
                name="get_node",
                description="Get node by ID with all properties",
                function=self._tool_get_node
            ),
            Tool(
                name="update_node",
                description="Update node properties",
                function=self._tool_update_node
            ),
            Tool(
                name="get_connected_nodes",
                description="Get nodes connected by specific edge type",
                function=self._tool_get_connected
            ),
            Tool(
                name="create_edge",
                description="Create relationship between nodes",
                function=self._tool_create_edge
            ),
        ]

    def _get_transition_tools(self, context: ExecutionContext) -> list[Tool]:
        """Tools for state transitions."""
        return [
            Tool(
                name="get_available_transitions",
                description="Get valid state transitions for a node",
                function=self._tool_get_transitions
            ),
            Tool(
                name="transition_state",
                description="Transition node to new state",
                function=self._tool_transition
            ),
        ]

    def _get_task_tools(self, context: ExecutionContext) -> list[Tool]:
        """Tools for task management."""
        return [
            Tool(
                name="complete_task",
                description="Mark the current task as completed",
                function=self._tool_complete_task
            ),
            Tool(
                name="create_followup_task",
                description="Create a follow-up task for human or agent",
                function=self._tool_create_task
            ),
        ]
```

### Agent Task Types

| Task Type | Description | Example |
|-----------|-------------|---------|
| `review` | Agent reviews node and provides assessment | Review code PR, check document |
| `transform` | Agent transforms data in node properties | Summarize, translate, reformat |
| `validate` | Agent validates data against rules | Check compliance, verify completeness |
| `generate` | Agent generates new content | Write description, create report |
| `decide` | Agent makes decision and transitions | Route to appropriate queue |
| `extract` | Agent extracts data from attachments | Parse PDF, extract from image |

### Multi-Agent Orchestration

```python
class AgentOrchestrator:
    """Orchestrates multi-agent workflows."""

    async def run_pipeline(
        self,
        pipeline: AgentPipeline,
        context: ExecutionContext
    ) -> PipelineResult:
        """Run a sequence of agent tasks with handoffs."""

        results = []
        current_context = context

        for stage in pipeline.stages:
            # Run agent for this stage
            task = await self.task_store.create_task(
                TaskCreate(
                    node_id=context.node_id,
                    task_type=TaskType.agent,
                    title=stage.title,
                    instructions=stage.instructions,
                    assignee=Assignee(type="agent", id=stage.agent_id)
                )
            )

            result = await self.executor.execute(task, current_context)
            results.append(result)

            # Check if pipeline should continue
            if result.type == "failure" and not stage.continue_on_failure:
                break

            # Pass result to next stage
            current_context = self._enrich_context(current_context, result)

        return PipelineResult(
            stages=results,
            success=all(r.type == "success" for r in results)
        )


class AgentPipeline(BaseModel):
    """Multi-agent pipeline definition."""

    id: str
    name: str
    stages: list[PipelineStage]


class PipelineStage(BaseModel):
    """Single stage in agent pipeline."""

    agent_id: str  # Which agent type to use
    title: str
    instructions: str
    continue_on_failure: bool = False
    timeout: timedelta = timedelta(minutes=5)
```

---

## Human-in-the-Loop

### Task Assignment Strategies

```python
class AssignmentStrategy(str, Enum):
    manual = "manual"           # Explicit assignment required
    round_robin = "round_robin" # Distribute evenly
    least_busy = "least_busy"   # Assign to person with fewest tasks
    skill_match = "skill_match" # Match by skills/expertise
    random = "random"           # Random assignment
    self_assign = "self_assign" # Users claim from pool


class TaskAssigner:
    """Handles task assignment based on strategy."""

    async def assign(
        self,
        task: Task,
        strategy: AssignmentStrategy,
        candidates: list[Assignee],
        context: ExecutionContext
    ) -> Assignee | None:
        """Assign task to appropriate person/agent."""

        if strategy == AssignmentStrategy.round_robin:
            return await self._round_robin(task, candidates)
        elif strategy == AssignmentStrategy.least_busy:
            return await self._least_busy(task, candidates)
        elif strategy == AssignmentStrategy.skill_match:
            return await self._skill_match(task, candidates, context)
        # ... etc
```

### Work Queue UI Components

```typescript
// Frontend components for task management

interface TaskQueueProps {
  workflowId: string;
  filters: TaskFilters;
}

// My Tasks view
function MyTasks({ userId }: { userId: string }) {
  const { data: tasks } = useQuery({
    queryKey: ['my-tasks', userId],
    queryFn: () => fetchMyTasks(userId)
  });

  return (
    <TaskList
      tasks={tasks}
      actions={['start', 'complete', 'reassign']}
    />
  );
}

// Available Tasks (unassigned pool)
function AvailableTasks({ workflowId }: { workflowId: string }) {
  const { data: tasks } = useQuery({
    queryKey: ['available-tasks', workflowId],
    queryFn: () => fetchAvailableTasks(workflowId)
  });

  const claimMutation = useMutation({
    mutationFn: (taskId: string) => claimTask(taskId)
  });

  return (
    <TaskList
      tasks={tasks}
      actions={['claim']}
      onClaim={(taskId) => claimMutation.mutate(taskId)}
    />
  );
}

// Task Detail with Actions
function TaskDetail({ task }: { task: Task }) {
  return (
    <div>
      <h2>{task.title}</h2>
      <p>{task.description}</p>

      {/* Related node context */}
      <NodeCard nodeId={task.nodeId} />

      {/* Task actions based on status */}
      <TaskActions task={task} />

      {/* SLA indicator */}
      {task.dueAt && <SLAIndicator dueAt={task.dueAt} />}
    </div>
  );
}
```

### Notification System

```python
class NotificationService:
    """Sends notifications for workflow events."""

    async def notify(
        self,
        notification: Notification
    ) -> None:
        """Send notification through configured channels."""

        for channel in self._get_channels(notification.recipient):
            if channel == "email":
                await self._send_email(notification)
            elif channel == "slack":
                await self._send_slack(notification)
            elif channel == "in_app":
                await self._store_in_app(notification)


class Notification(BaseModel):
    id: str
    recipient: Assignee
    type: NotificationType
    title: str
    body: str
    action_url: str | None
    priority: Literal["low", "normal", "high", "urgent"]


class NotificationType(str, Enum):
    task_assigned = "task_assigned"
    task_due_soon = "task_due_soon"
    task_overdue = "task_overdue"
    task_completed = "task_completed"
    state_changed = "state_changed"
    mention = "mention"
    comment = "comment"
```

---

## Observability

### Metrics Collection

```python
class ExecutionMetrics:
    """Collects and exposes execution metrics."""

    # Counters
    transitions_total: Counter        # By workflow, node_type, from, to, trigger
    tasks_created_total: Counter      # By workflow, task_type
    tasks_completed_total: Counter    # By workflow, task_type, result
    rules_triggered_total: Counter    # By workflow, rule_id
    agent_runs_total: Counter         # By workflow, agent_type, result

    # Histograms
    transition_duration: Histogram    # Time to execute transition
    task_wait_time: Histogram         # Time from creation to start
    task_work_time: Histogram         # Time from start to completion
    agent_execution_time: Histogram   # Agent run duration

    # Gauges
    active_tasks: Gauge               # Currently pending/in-progress
    pending_timers: Gauge             # Scheduled but not fired
    queue_depth: Gauge                # Tasks per queue


class TokenTracker:
    """Tracks LLM token usage and costs."""

    async def record(
        self,
        workflow_id: str,
        operation: str,
        model: str,
        input_tokens: int,
        output_tokens: int
    ) -> None:
        """Record token usage for an operation."""

    async def get_usage(
        self,
        workflow_id: str,
        period: timedelta
    ) -> UsageReport:
        """Get token usage report for workflow."""
```

### Execution Dashboard

```typescript
// Frontend dashboard components

interface ExecutionDashboardProps {
  workflowId: string;
}

function ExecutionDashboard({ workflowId }: ExecutionDashboardProps) {
  return (
    <div className="grid grid-cols-3 gap-4">
      {/* Key Metrics */}
      <MetricCard
        title="Tasks Completed Today"
        metric="tasks_completed"
        period="1d"
      />
      <MetricCard
        title="Avg Cycle Time"
        metric="task_duration_avg"
        period="7d"
      />
      <MetricCard
        title="Automation Rate"
        metric="auto_transitions_pct"
        period="7d"
      />

      {/* Task Queue Status */}
      <QueueStatus workflowId={workflowId} />

      {/* Recent Executions */}
      <ExecutionHistory workflowId={workflowId} limit={20} />

      {/* Active Timers */}
      <TimerList workflowId={workflowId} />

      {/* Agent Performance */}
      <AgentMetrics workflowId={workflowId} />

      {/* Token Usage */}
      <TokenUsageChart workflowId={workflowId} period="7d" />
    </div>
  );
}

function ExecutionHistory({ workflowId, limit }: { workflowId: string; limit: number }) {
  const { data: events } = useQuery({
    queryKey: ['execution-history', workflowId],
    queryFn: () => fetchExecutionHistory(workflowId, { limit })
  });

  return (
    <div className="space-y-2">
      {events?.map(event => (
        <ExecutionEventCard
          key={event.id}
          event={event}
          onExpand={() => showEventDetails(event)}
        />
      ))}
    </div>
  );
}
```

### Agent Reasoning Traces

```python
class ReasoningTracer:
    """Captures agent reasoning for debugging and explanation."""

    async def capture(
        self,
        task_id: str,
        agent_run: AgentRun
    ) -> ReasoningTrace:
        """Capture full reasoning trace from agent run."""

        return ReasoningTrace(
            task_id=task_id,
            steps=[
                TraceStep(
                    type=step.type,  # thinking, tool_call, tool_result, output
                    content=step.content,
                    timestamp=step.timestamp,
                    tokens_used=step.tokens
                )
                for step in agent_run.steps
            ],
            total_tokens=agent_run.total_tokens,
            duration_ms=agent_run.duration_ms
        )


class ReasoningTrace(BaseModel):
    task_id: str
    steps: list[TraceStep]
    total_tokens: int
    duration_ms: int


class TraceStep(BaseModel):
    type: Literal["thinking", "tool_call", "tool_result", "output"]
    content: str
    timestamp: datetime
    tokens_used: int
```

---

## Implementation Phases

### Phase 1: Core Execution Engine (4-6 weeks)

**Goal**: Basic state machine and task queue

```
Week 1-2: Data Layer
├── Create execution database tables
├── Implement TaskStore CRUD
├── Implement ExecutionStore for history
└── Add migrations

Week 3-4: State Machine
├── Implement StateMachine class
├── Add transition validation
├── Integrate with existing PATCH endpoint
├── Add transition history logging
└── Create /transitions endpoint

Week 5-6: Task Queue
├── Implement TaskQueue class
├── Create task CRUD endpoints
├── Add basic task UI components
├── Implement task completion flow
└── Add task notifications (in-app)
```

**Deliverables**:
- Nodes can transition states with validation
- Tasks can be created, assigned, completed
- Execution history is logged
- Basic "My Tasks" UI view

### Phase 2: Rule Engine & Automation (3-4 weeks)

**Goal**: Automatic transitions and timer support

```
Week 7-8: Rule Engine
├── Implement RuleEngine class
├── Extend Rule model with actions
├── Create rule CRUD endpoints
├── Add rule evaluation on state change
└── Implement automatic transitions

Week 9-10: Scheduler
├── Implement Scheduler class
├── Create timer database table
├── Add timer management endpoints
├── Implement timer firing (background task)
├── Add SLA timers for tasks
└── Timer UI in dashboard
```

**Deliverables**:
- Rules can trigger automatic transitions
- Timers can escalate/remind/auto-close
- SLA tracking for tasks
- Timer management UI

### Phase 3: Agent Integration (3-4 weeks)

**Goal**: Agents can execute workflow tasks

```
Week 11-12: Agent Executor
├── Implement AgentTaskExecutor
├── Create agent tools for graph operations
├── Add agent task assignment
├── Implement retry logic
└── Add reasoning trace capture

Week 13-14: Multi-Agent
├── Implement AgentOrchestrator
├── Create pipeline definitions
├── Add agent handoff support
├── Implement parallel agent execution
└── Add agent metrics dashboard
```

**Deliverables**:
- Agent tasks execute automatically
- Agents can read/write graph data
- Multi-agent pipelines work
- Agent performance visible in dashboard

### Phase 4: Observability & Polish (2-3 weeks)

**Goal**: Full visibility and production readiness

```
Week 15-16: Observability
├── Implement ExecutionMetrics
├── Add token tracking
├── Create execution dashboard
├── Add reasoning trace viewer
└── Implement cost estimation

Week 17: Polish
├── Error handling improvements
├── Performance optimization
├── Documentation
└── Integration tests
```

**Deliverables**:
- Full execution dashboard
- Token/cost tracking
- Reasoning trace viewer
- Production-ready error handling

### Phase 5: External Integration (2-3 weeks)

**Goal**: Connect to external systems

```
Week 18-19: Webhooks
├── Implement webhook receiver
├── Create webhook configuration
├── Add outbound webhooks
├── Implement webhook retry logic
└── Add webhook logs

Week 20: Advanced
├── OAuth flow for integrations
├── Rate limiting per integration
├── Integration health monitoring
└── Webhook testing tools
```

**Deliverables**:
- Inbound webhooks trigger workflows
- Outbound webhooks notify external systems
- Integration status visible

---

## Migration Strategy

### Backward Compatibility

```python
class WorkflowExecution(BaseModel):
    """Execution configuration for a workflow."""

    enabled: bool = False  # Default: off (backward compatible)

    # When enabled
    auto_create_tasks: bool = True
    default_assignment: AssignmentStrategy = AssignmentStrategy.manual
    enable_timers: bool = True
    enable_agents: bool = True

    # Rate limits
    max_concurrent_agent_tasks: int = 5
    max_transitions_per_minute: int = 100


# Add to WorkflowDefinition
class WorkflowDefinition(BaseModel):
    # ... existing fields ...

    execution: WorkflowExecution | None = None  # Optional, default disabled
```

### Enabling Execution for Existing Workflows

```http
POST /api/v1/workflows/{id}/enable-execution
{
  "auto_create_tasks": true,
  "default_assignment": "self_assign",
  "enable_timers": true,
  "enable_agents": true
}

Response:
{
  "enabled": true,
  "tasks_created": 15,    # For nodes in actionable states
  "rules_activated": 3,   # Existing rules now execute
  "timers_created": 5     # Based on SLA rules
}
```

### Data Migration

```sql
-- No migration needed for existing data
-- Execution tables are additive
-- Existing nodes/edges unchanged
-- Events table gains new event_types

-- Optional: Backfill execution history from events
INSERT INTO execution_history (workflow_id, node_id, event_type, event_data, executed_at)
SELECT
    workflow_id,
    subject_node_id,
    event_type,
    payload,
    created_at
FROM events
WHERE event_type IN ('node.created', 'node.updated', 'state.changed');
```

---

## Testing Strategy

### Unit Tests

```python
# test_state_machine.py

async def test_valid_transition():
    """State machine allows valid transition."""
    sm = StateMachine(schema)
    result = await sm.transition(node, "approved", context)
    assert result.success
    assert result.to_state == "approved"

async def test_blocked_transition():
    """State machine blocks transition missing requirements."""
    # Node needs 2 approvals but has 1
    sm = StateMachine(schema)
    result = await sm.can_transition(node, "in_review", "approved", context)
    assert not result.allowed
    assert "requires 2 approval edges" in result.blockers[0]

async def test_automatic_transition():
    """Rule triggers automatic transition when conditions met."""
    engine = RuleEngine(rules)
    # Add second approval edge
    await graph_store.create_edge(approval_edge)
    # Check if auto-transition fires
    actions = await engine.evaluate(node, edge_created_event, context)
    assert any(a.type == "transition_state" for a in actions)
```

### Integration Tests

```python
# test_execution_flow.py

async def test_full_approval_workflow():
    """End-to-end approval workflow with agents and humans."""

    # 1. Create document node
    doc = await api.create_node({"type": "document", "title": "Q4 Report"})
    assert doc.status == "draft"

    # 2. Submit for review (creates review task)
    await api.transition(doc.id, "in_review")
    tasks = await api.get_tasks(workflow_id, {"node_id": doc.id})
    assert len(tasks) == 1
    assert tasks[0].task_type == "human"

    # 3. First reviewer approves
    await api.create_edge({"type": "approval", "from": reviewer1, "to": doc.id})

    # 4. Check still needs more approvals
    transitions = await api.get_transitions(doc.id)
    assert not transitions["approved"]["allowed"]

    # 5. Second reviewer approves
    await api.create_edge({"type": "approval", "from": reviewer2, "to": doc.id})

    # 6. Verify auto-transition to approved
    doc = await api.get_node(doc.id)
    assert doc.status == "approved"

    # 7. Check task was completed
    tasks = await api.get_tasks(workflow_id, {"node_id": doc.id})
    assert all(t.status == "completed" for t in tasks)
```

### Load Tests

```python
# test_execution_performance.py

async def test_high_throughput_transitions():
    """System handles 100 transitions/second."""
    async with load_test(concurrency=100, duration=60):
        results = await run_transitions(count=6000)

    assert results.success_rate > 0.99
    assert results.p99_latency_ms < 500

async def test_agent_task_scaling():
    """Agent executor handles 50 concurrent tasks."""
    tasks = [create_agent_task() for _ in range(50)]
    results = await asyncio.gather(*[execute_task(t) for t in tasks])

    assert all(r.success for r in results)
    assert sum(r.tokens for r in results) < 1_000_000  # Cost control
```

---

## Risk Assessment

### Technical Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Infinite rule loops | High | Medium | Depth limit (10), loop detection |
| Agent task timeout | Medium | Medium | Configurable timeout, async execution |
| Database contention | Medium | Low | Optimistic locking, queue isolation |
| Token cost explosion | High | Medium | Per-workflow limits, monitoring |
| Timer drift | Low | Low | Persistent timers, catch-up on restart |

### Operational Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Breaking existing workflows | High | Low | Opt-in execution, extensive testing |
| Agent hallucination | Medium | Medium | Validate outputs, human review option |
| External service failures | Medium | Medium | Circuit breaker, retry with backoff |
| Data inconsistency | High | Low | Transactions, event sourcing |

### Mitigation Strategies

```python
class ExecutionSafeguards:
    """Safety mechanisms for execution engine."""

    # Loop prevention
    MAX_CASCADE_DEPTH = 10
    MAX_RULES_PER_EVENT = 50

    # Rate limiting
    MAX_TRANSITIONS_PER_MINUTE = 100
    MAX_AGENT_TASKS_CONCURRENT = 10

    # Cost control
    MAX_TOKENS_PER_TASK = 50_000
    MAX_TOKENS_PER_WORKFLOW_DAILY = 1_000_000

    # Timeouts
    AGENT_TASK_TIMEOUT = timedelta(minutes=5)
    TRANSITION_TIMEOUT = timedelta(seconds=30)

    async def check_loop(self, context: ExecutionContext) -> bool:
        """Check if we're in a loop."""
        if context.depth >= self.MAX_CASCADE_DEPTH:
            logger.warning(f"Max cascade depth reached: {context}")
            return True
        return False

    async def check_rate_limit(self, workflow_id: str) -> bool:
        """Check if workflow is rate limited."""
        recent = await self.count_recent_transitions(workflow_id, minutes=1)
        return recent >= self.MAX_TRANSITIONS_PER_MINUTE
```

---

## Conclusion

This execution engine plan transforms Workflow Graph Studio from a visualization tool into a complete workflow management platform. The phased approach allows incremental delivery while maintaining backward compatibility.

**Key Success Factors**:
1. **Backward Compatible**: Existing workflows unchanged unless execution enabled
2. **Observable**: Full visibility into what's happening and why
3. **Resilient**: Graceful failure handling with retry and compensation
4. **Scalable**: Async execution, rate limiting, cost controls
5. **Flexible**: Mix human, agent, and automatic execution

The implementation prioritizes core execution capabilities first, then adds agent integration and external connectivity, ensuring each phase delivers demonstrable value.
