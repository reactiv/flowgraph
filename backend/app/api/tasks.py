"""Task Execution Engine API routes.

This module provides endpoints for managing TaskSet definitions (DAG templates),
TaskSet instances (running executions), and individual task operations.
"""

import logging

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.db import graph_store
from app.models import (
    AssigneeType,
    EventCreate,
    TaskDefinition,
    TaskInstance,
    TaskSetDefinition,
    TaskSetDefinitionCreate,
    TaskSetInstance,
    TaskSetInstanceCreate,
    TaskSetInstanceStatus,
    TaskStatus,
)
from app.services.delta_applicator import DeltaApplicator
from app.services.node_reference_resolver import TaskContext
from app.services.task_progress import TaskProgressService

logger = logging.getLogger(__name__)

# =============================================================================
# Event Helpers
# =============================================================================


async def _emit_task_event(
    workflow_id: str,
    event_type: str,
    task_set_instance_id: str,
    task_definition_id: str | None = None,
    subject_node_id: str | None = None,
    **extra_payload: object,
) -> None:
    """Emit a task-related event."""
    payload = {
        "taskSetInstanceId": task_set_instance_id,
        **extra_payload,
    }
    if task_definition_id:
        payload["taskDefinitionId"] = task_definition_id

    await graph_store.append_event(
        workflow_id,
        EventCreate(
            subject_node_id=subject_node_id,
            event_type=event_type,
            payload=payload,
        ),
    )

router = APIRouter()


# =============================================================================
# Request/Response Models
# =============================================================================


class TaskSetDefinitionsResponse(BaseModel):
    """Response for listing TaskSet definitions."""

    definitions: list[TaskSetDefinition]
    total: int


class TaskSetInstancesResponse(BaseModel):
    """Response for listing TaskSet instances."""

    instances: list[TaskSetInstance]
    total: int


class AvailableTasksResponse(BaseModel):
    """Response with available tasks."""

    tasks: list[TaskDefinition]
    task_instances: list[TaskInstance]


class AssignTaskRequest(BaseModel):
    """Request to assign a task."""

    assignee_type: AssigneeType
    assignee_id: str | None = None
    assigned_by: str | None = None


class CompleteTaskRequest(BaseModel):
    """Request to mark a task as complete."""

    output_node_id: str | None = None
    notes: str | None = None
    initial_values: dict[str, object] | None = None  # For create_node deltas


class MyTasksResponse(BaseModel):
    """Response for my-tasks query."""

    tasks: list[dict]  # Includes task instance + definition info
    total: int


class NodeTaskProgressResponse(BaseModel):
    """Response for task progress on a node."""

    task_set_instances: list[TaskSetInstance]
    total: int


# =============================================================================
# TaskSet Definition CRUD
# =============================================================================


@router.get("/workflows/{workflow_id}/task-sets")
async def list_task_set_definitions(
    workflow_id: str,
) -> TaskSetDefinitionsResponse:
    """List all TaskSet definitions for a workflow."""
    # Verify workflow exists
    workflow = await graph_store.get_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    definitions = await graph_store.list_task_set_definitions(workflow_id)
    return TaskSetDefinitionsResponse(definitions=definitions, total=len(definitions))


@router.post("/workflows/{workflow_id}/task-sets")
async def create_task_set_definition(
    workflow_id: str,
    definition: TaskSetDefinitionCreate,
) -> TaskSetDefinition:
    """Create a new TaskSet definition.

    A TaskSet defines a DAG of tasks with dependencies, conditions, and assignments.
    """
    # Verify workflow exists
    workflow = await graph_store.get_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Validate task IDs are unique
    task_ids = [t.id for t in definition.tasks]
    if len(task_ids) != len(set(task_ids)):
        raise HTTPException(status_code=400, detail="Task IDs must be unique")

    # Validate dependencies reference valid task IDs
    for task in definition.tasks:
        for dep_id in task.depends_on:
            if dep_id not in task_ids:
                raise HTTPException(
                    status_code=400,
                    detail=f"Task '{task.id}' has invalid dependency '{dep_id}'",
                )

    return await graph_store.create_task_set_definition(workflow_id, definition)


@router.get("/workflows/{workflow_id}/task-sets/{task_set_id}")
async def get_task_set_definition(
    workflow_id: str,
    task_set_id: str,
) -> TaskSetDefinition:
    """Get a TaskSet definition by ID."""
    definition = await graph_store.get_task_set_definition(workflow_id, task_set_id)
    if definition is None:
        raise HTTPException(status_code=404, detail="TaskSet definition not found")
    return definition


@router.delete("/workflows/{workflow_id}/task-sets/{task_set_id}")
async def delete_task_set_definition(
    workflow_id: str,
    task_set_id: str,
) -> dict[str, bool]:
    """Delete a TaskSet definition."""
    deleted = await graph_store.delete_task_set_definition(workflow_id, task_set_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="TaskSet definition not found")
    return {"deleted": True}


# =============================================================================
# TaskSet Instance Management
# =============================================================================


@router.post("/workflows/{workflow_id}/task-sets/{task_set_id}/start")
async def start_task_set_instance(
    workflow_id: str,
    task_set_id: str,
    root_node_id: str | None = Query(None, description="Optional root node to anchor to"),
) -> TaskSetInstance:
    """Start a new instance of a TaskSet.

    Creates task instances for each task in the definition and determines
    which tasks are initially available.
    """
    # Verify workflow exists
    workflow = await graph_store.get_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Verify root node exists if provided
    if root_node_id:
        node = await graph_store.get_node(workflow_id, root_node_id)
        if node is None:
            raise HTTPException(status_code=404, detail="Root node not found")

    create_request = TaskSetInstanceCreate(
        task_set_definition_id=task_set_id,
        root_node_id=root_node_id,
    )

    try:
        instance = await graph_store.create_task_set_instance(workflow_id, create_request)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    # Get the definition for refreshing
    definition = await graph_store.get_task_set_definition(workflow_id, task_set_id)
    if definition is None:
        raise HTTPException(status_code=404, detail="TaskSet definition not found")

    # Refresh to compute available tasks
    progress_service = TaskProgressService(graph_store, workflow_id)
    refreshed = await progress_service.refresh_task_progress(instance, definition)

    # Emit task_set_started event
    await _emit_task_event(
        workflow_id,
        "task_set_started",
        refreshed.id,
        subject_node_id=root_node_id,
        taskSetDefinitionId=task_set_id,
        taskSetDefinitionName=definition.name,
    )

    return refreshed


@router.get("/workflows/{workflow_id}/task-set-instances")
async def list_task_set_instances(
    workflow_id: str,
    status: TaskSetInstanceStatus | None = Query(None, description="Filter by status"),
    root_node_id: str | None = Query(None, description="Filter by root node"),
) -> TaskSetInstancesResponse:
    """List TaskSet instances for a workflow."""
    # Verify workflow exists
    workflow = await graph_store.get_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    instances = await graph_store.list_task_set_instances(
        workflow_id, status=status, root_node_id=root_node_id
    )
    return TaskSetInstancesResponse(instances=instances, total=len(instances))


@router.get("/workflows/{workflow_id}/task-set-instances/{instance_id}")
async def get_task_set_instance(
    workflow_id: str,
    instance_id: str,
) -> TaskSetInstance:
    """Get a TaskSet instance with its current progress."""
    instance = await graph_store.get_task_set_instance(workflow_id, instance_id)
    if instance is None:
        raise HTTPException(status_code=404, detail="TaskSet instance not found")
    return instance


@router.post("/workflows/{workflow_id}/task-set-instances/{instance_id}/refresh")
async def refresh_task_set_instance(
    workflow_id: str,
    instance_id: str,
) -> TaskSetInstance:
    """Refresh task progress by re-evaluating all tasks.

    Re-evaluates each task to check if its expected delta has been achieved,
    and updates the available tasks list.
    """
    instance = await graph_store.get_task_set_instance(workflow_id, instance_id)
    if instance is None:
        raise HTTPException(status_code=404, detail="TaskSet instance not found")

    definition = await graph_store.get_task_set_definition(
        workflow_id, instance.task_set_definition_id
    )
    if definition is None:
        raise HTTPException(status_code=404, detail="TaskSet definition not found")

    progress_service = TaskProgressService(graph_store, workflow_id)
    return await progress_service.refresh_task_progress(instance, definition)


@router.post("/workflows/{workflow_id}/task-set-instances/{instance_id}/cancel")
async def cancel_task_set_instance(
    workflow_id: str,
    instance_id: str,
) -> TaskSetInstance:
    """Cancel a TaskSet instance."""
    instance = await graph_store.get_task_set_instance(workflow_id, instance_id)
    if instance is None:
        raise HTTPException(status_code=404, detail="TaskSet instance not found")

    success = await graph_store.update_task_set_instance_status(
        workflow_id, instance_id, TaskSetInstanceStatus.CANCELLED
    )
    if not success:
        raise HTTPException(status_code=500, detail="Failed to cancel instance")

    updated = await graph_store.get_task_set_instance(workflow_id, instance_id)
    if updated is None:
        raise HTTPException(status_code=404, detail="TaskSet instance not found")
    return updated


# =============================================================================
# Task Operations
# =============================================================================


@router.get("/workflows/{workflow_id}/task-set-instances/{instance_id}/available-tasks")
async def get_available_tasks(
    workflow_id: str,
    instance_id: str,
) -> AvailableTasksResponse:
    """Get tasks that are currently available to work on.

    A task is available when all its dependencies are completed
    and its condition (if any) evaluates to true.
    """
    instance = await graph_store.get_task_set_instance(workflow_id, instance_id)
    if instance is None:
        raise HTTPException(status_code=404, detail="TaskSet instance not found")

    definition = await graph_store.get_task_set_definition(
        workflow_id, instance.task_set_definition_id
    )
    if definition is None:
        raise HTTPException(status_code=404, detail="TaskSet definition not found")

    progress_service = TaskProgressService(graph_store, workflow_id)
    available_defs = await progress_service.get_available_tasks(instance, definition)

    # Get corresponding task instances
    task_instances = []
    for task_def in available_defs:
        for ti in instance.task_instances:
            if ti.task_definition_id == task_def.id:
                task_instances.append(ti)
                break

    return AvailableTasksResponse(tasks=available_defs, task_instances=task_instances)


@router.post(
    "/workflows/{workflow_id}/task-set-instances/{instance_id}/tasks/{task_def_id}/assign"
)
async def assign_task(
    workflow_id: str,
    instance_id: str,
    task_def_id: str,
    request: AssignTaskRequest,
) -> TaskInstance:
    """Assign a task to a user or agent."""
    # Verify instance exists
    instance = await graph_store.get_task_set_instance(workflow_id, instance_id)
    if instance is None:
        raise HTTPException(status_code=404, detail="TaskSet instance not found")

    # Find the task instance
    task_instance = instance.get_task_instance(task_def_id)
    if task_instance is None:
        raise HTTPException(status_code=404, detail="Task not found in instance")

    # Update assignment
    updated = await graph_store.update_task_instance(
        instance_id,
        task_def_id,
        assignee_type=request.assignee_type.value,
        assignee_id=request.assignee_id,
        assigned_by=request.assigned_by,
    )

    if updated is None:
        raise HTTPException(status_code=500, detail="Failed to assign task")

    # Emit task_assigned event
    await _emit_task_event(
        workflow_id,
        "task_assigned",
        instance_id,
        task_def_id,
        subject_node_id=instance.root_node_id,
        assigneeType=request.assignee_type.value,
        assigneeId=request.assignee_id,
    )

    return updated


@router.post(
    "/workflows/{workflow_id}/task-set-instances/{instance_id}/tasks/{task_def_id}/start"
)
async def start_task(
    workflow_id: str,
    instance_id: str,
    task_def_id: str,
) -> TaskInstance:
    """Mark a task as in progress."""
    # Verify instance exists
    instance = await graph_store.get_task_set_instance(workflow_id, instance_id)
    if instance is None:
        raise HTTPException(status_code=404, detail="TaskSet instance not found")

    # Find the task instance
    task_instance = instance.get_task_instance(task_def_id)
    if task_instance is None:
        raise HTTPException(status_code=404, detail="Task not found in instance")

    # Can only start available or pending tasks
    if task_instance.status not in (TaskStatus.AVAILABLE, TaskStatus.PENDING):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot start task with status '{task_instance.status.value}'",
        )

    updated = await graph_store.update_task_instance(
        instance_id,
        task_def_id,
        status=TaskStatus.IN_PROGRESS,
    )

    if updated is None:
        raise HTTPException(status_code=500, detail="Failed to start task")

    # Emit task_started event
    await _emit_task_event(
        workflow_id,
        "task_started",
        instance_id,
        task_def_id,
        subject_node_id=instance.root_node_id,
    )

    return updated


@router.post(
    "/workflows/{workflow_id}/task-set-instances/{instance_id}/tasks/{task_def_id}/complete"
)
async def complete_task(
    workflow_id: str,
    instance_id: str,
    task_def_id: str,
    request: CompleteTaskRequest | None = None,
) -> TaskSetInstance:
    """Mark a task as complete.

    This endpoint:
    1. Applies the task's delta to the graph (creates/updates nodes/edges)
    2. Marks the task as completed
    3. Refreshes dependent tasks availability
    4. Checks if the TaskSet is fully completed
    """
    # Verify instance exists
    instance = await graph_store.get_task_set_instance(workflow_id, instance_id)
    if instance is None:
        raise HTTPException(status_code=404, detail="TaskSet instance not found")

    # Find the task instance
    task_instance = instance.get_task_instance(task_def_id)
    if task_instance is None:
        raise HTTPException(status_code=404, detail="Task not found in instance")

    # Can only complete in_progress or available tasks
    if task_instance.status not in (TaskStatus.IN_PROGRESS, TaskStatus.AVAILABLE):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot complete task with status '{task_instance.status.value}'",
        )

    # Get task definition to access delta
    definition = await graph_store.get_task_set_definition(
        workflow_id, instance.task_set_definition_id
    )
    if definition is None:
        raise HTTPException(status_code=404, detail="TaskSet definition not found")

    task_def = definition.get_task(task_def_id)
    if task_def is None:
        raise HTTPException(status_code=404, detail="Task definition not found")

    # Apply the delta to the graph
    context = TaskContext(instance)
    applicator = DeltaApplicator(graph_store, workflow_id)
    logger.info(
        "Applying delta for task %s, type=%s",
        task_def_id,
        getattr(task_def.delta, "delta_type", None),
    )
    # Pass initial_values from request to allow form-provided values
    request_values = request.initial_values if request else None
    result = await applicator.apply(
        task_def.delta, task_instance, definition, context, request_values
    )

    if not result.applied:
        logger.warning(
            "Delta application failed for task %s: %s", task_def_id, result.error
        )
        raise HTTPException(
            status_code=400,
            detail=f"Failed to apply delta: {result.error}",
        )

    # Determine output_node_id: use result from delta application if not provided
    output_node_id = (
        request.output_node_id if request and request.output_node_id else result.node_id
    )
    notes = request.notes if request else None

    # Update task to completed with output node ID
    await graph_store.update_task_instance(
        instance_id,
        task_def_id,
        status=TaskStatus.COMPLETED,
        output_node_id=output_node_id,
        notes=notes,
    )

    # Refresh to update dependent tasks
    updated_instance = await graph_store.get_task_set_instance(workflow_id, instance_id)
    if updated_instance is None:
        raise HTTPException(status_code=404, detail="TaskSet instance not found")

    progress_service = TaskProgressService(graph_store, workflow_id)
    refreshed = await progress_service.refresh_task_progress(updated_instance, definition)

    # Emit task_completed event
    await _emit_task_event(
        workflow_id,
        "task_completed",
        instance_id,
        task_def_id,
        subject_node_id=output_node_id or instance.root_node_id,
        outputNodeId=output_node_id,
        deltaApplied=True,
        alreadyApplied=result.already_applied,
    )

    # Check if all tasks are completed
    if refreshed.completed_tasks == refreshed.total_tasks:
        await graph_store.update_task_set_instance_status(
            workflow_id, instance_id, TaskSetInstanceStatus.COMPLETED
        )
        refreshed.status = TaskSetInstanceStatus.COMPLETED

        # Emit task_set_completed event
        await _emit_task_event(
            workflow_id,
            "task_set_completed",
            instance_id,
            subject_node_id=instance.root_node_id,
            completedTasks=refreshed.completed_tasks,
            totalTasks=refreshed.total_tasks,
        )

    return refreshed


@router.post(
    "/workflows/{workflow_id}/task-set-instances/{instance_id}/tasks/{task_def_id}/skip"
)
async def skip_task(
    workflow_id: str,
    instance_id: str,
    task_def_id: str,
    notes: str | None = Query(None, description="Reason for skipping"),
) -> TaskSetInstance:
    """Skip a task.

    Skipping a task will cause dependent tasks to become blocked.
    """
    # Verify instance exists
    instance = await graph_store.get_task_set_instance(workflow_id, instance_id)
    if instance is None:
        raise HTTPException(status_code=404, detail="TaskSet instance not found")

    # Find the task instance
    task_instance = instance.get_task_instance(task_def_id)
    if task_instance is None:
        raise HTTPException(status_code=404, detail="Task not found in instance")

    # Can only skip available, pending, or in_progress tasks
    if task_instance.status not in (
        TaskStatus.AVAILABLE,
        TaskStatus.PENDING,
        TaskStatus.IN_PROGRESS,
    ):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot skip task with status '{task_instance.status.value}'",
        )

    await graph_store.update_task_instance(
        instance_id,
        task_def_id,
        status=TaskStatus.SKIPPED,
        notes=notes,
    )

    # Emit task_skipped event
    await _emit_task_event(
        workflow_id,
        "task_skipped",
        instance_id,
        task_def_id,
        subject_node_id=instance.root_node_id,
        reason=notes,
    )

    # Refresh to update dependent tasks
    definition = await graph_store.get_task_set_definition(
        workflow_id, instance.task_set_definition_id
    )
    if definition is None:
        raise HTTPException(status_code=404, detail="TaskSet definition not found")

    updated_instance = await graph_store.get_task_set_instance(workflow_id, instance_id)
    if updated_instance is None:
        raise HTTPException(status_code=404, detail="TaskSet instance not found")

    progress_service = TaskProgressService(graph_store, workflow_id)
    return await progress_service.refresh_task_progress(updated_instance, definition)


# =============================================================================
# Progress Queries
# =============================================================================


@router.get("/workflows/{workflow_id}/nodes/{node_id}/task-progress")
async def get_node_task_progress(
    workflow_id: str,
    node_id: str,
) -> NodeTaskProgressResponse:
    """Get task progress for instances anchored to a specific node."""
    # Verify node exists
    node = await graph_store.get_node(workflow_id, node_id)
    if node is None:
        raise HTTPException(status_code=404, detail="Node not found")

    instances = await graph_store.list_task_set_instances(
        workflow_id, root_node_id=node_id
    )

    return NodeTaskProgressResponse(
        task_set_instances=instances,
        total=len(instances),
    )


@router.get("/workflows/{workflow_id}/my-tasks")
async def get_my_tasks(
    workflow_id: str,
    assignee_id: str = Query(..., description="The assignee ID to filter by"),
    assignee_type: AssigneeType = Query(
        AssigneeType.USER, description="Type of assignee"
    ),
    status: TaskStatus | None = Query(None, description="Filter by task status"),
) -> MyTasksResponse:
    """Get tasks assigned to a specific user or agent.

    Returns task instances along with their definitions and parent instance info.
    """
    # Verify workflow exists
    workflow = await graph_store.get_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Get all active instances
    instances = await graph_store.list_task_set_instances(
        workflow_id, status=TaskSetInstanceStatus.ACTIVE
    )

    results = []
    for instance in instances:
        definition = await graph_store.get_task_set_definition(
            workflow_id, instance.task_set_definition_id
        )
        if definition is None:
            continue

        for task_instance in instance.task_instances:
            # Check assignee match
            if task_instance.assignment is None:
                continue
            if task_instance.assignment.assignee_type != assignee_type:
                continue
            if task_instance.assignment.assignee_id != assignee_id:
                continue

            # Check status filter
            if status and task_instance.status != status:
                continue

            # Get task definition
            task_def = definition.get_task(task_instance.task_definition_id)
            if task_def is None:
                continue

            results.append(
                {
                    "taskInstance": task_instance.model_dump(by_alias=True),
                    "taskDefinition": task_def.model_dump(by_alias=True),
                    "taskSetInstance": {
                        "id": instance.id,
                        "status": instance.status.value,
                        "rootNodeId": instance.root_node_id,
                    },
                    "taskSetDefinition": {
                        "id": definition.id,
                        "name": definition.name,
                    },
                }
            )

    return MyTasksResponse(tasks=results, total=len(results))
