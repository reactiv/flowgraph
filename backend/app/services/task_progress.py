"""Task Progress Engine for workflow execution.

This module provides:
- TaskProgressEvaluator: Evaluates task completion by comparing expected deltas to graph state
- TaskDependencyResolver: Resolves which tasks are available based on dependencies and conditions
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.models.task import (
    CompoundDelta,
    ConditionEvaluationResult,
    ConditionType,
    CreateEdgeDelta,
    CreateNodeDelta,
    TaskCondition,
    TaskDefinition,
    TaskEvaluationResult,
    TaskInstance,
    TaskSetDefinition,
    TaskSetInstance,
    TaskStatus,
    UpdateNodeFieldDelta,
    UpdateNodeStatusDelta,
)
from app.services.node_reference_resolver import NodeReferenceResolver, TaskContext

if TYPE_CHECKING:
    from app.db.graph_store import GraphStore


class TaskEvaluationContext(TaskContext):
    """Context for evaluating tasks within a TaskSetInstance.

    Extends TaskContext with access to task definitions.
    """

    def __init__(
        self,
        task_set_instance: TaskSetInstance,
        task_set_definition: TaskSetDefinition,
    ) -> None:
        super().__init__(task_set_instance)
        self.definition = task_set_definition
        # Build lookup map for definitions
        self._task_defs_by_id = {td.id: td for td in task_set_definition.tasks}

    def get_task_definition(self, task_def_id: str) -> TaskDefinition | None:
        """Get a task definition by ID."""
        return self._task_defs_by_id.get(task_def_id)


class TaskProgressEvaluator:
    """Evaluates task completion by comparing expected deltas against graph state.

    The evaluator checks if the expected change (delta) described by a task
    has been achieved in the actual workflow graph.
    """

    def __init__(self, graph_store: GraphStore, workflow_id: str) -> None:
        self._store = graph_store
        self._workflow_id = workflow_id
        self._resolver = NodeReferenceResolver(graph_store, workflow_id)

    def clear_cache(self) -> None:
        """Clear the node cache. Call this before each refresh cycle."""
        self._resolver.clear_cache()

    async def evaluate_task(
        self,
        task_def: TaskDefinition,
        task_instance: TaskInstance,
        context: TaskEvaluationContext,
    ) -> TaskEvaluationResult:
        """Evaluate if a task's expected delta has been achieved.

        Args:
            task_def: The task definition describing what change is expected
            task_instance: The current runtime state of the task
            context: Evaluation context with access to other tasks

        Returns:
            TaskEvaluationResult indicating completion status
        """
        delta = task_def.delta
        delta_type = getattr(delta, "delta_type", None)

        if isinstance(delta, CreateNodeDelta) or delta_type == "create_node":
            return await self._evaluate_create_node(
                delta, task_instance, context  # type: ignore
            )
        elif isinstance(delta, UpdateNodeStatusDelta) or delta_type == "update_node_status":
            return await self._evaluate_status_update(delta, context)  # type: ignore
        elif isinstance(delta, UpdateNodeFieldDelta) or delta_type == "update_node_field":
            return await self._evaluate_field_update(delta, context)  # type: ignore
        elif isinstance(delta, CreateEdgeDelta) or delta_type == "create_edge":
            return await self._evaluate_create_edge(delta, context)  # type: ignore
        elif isinstance(delta, CompoundDelta) or delta_type == "compound":
            return await self._evaluate_compound(delta, task_instance, context)  # type: ignore
        else:
            return TaskEvaluationResult(
                completed=False, error=f"Unknown delta type: {type(delta)}"
            )

    async def _evaluate_create_node(
        self,
        delta: CreateNodeDelta,
        task_instance: TaskInstance,
        context: TaskEvaluationContext,
    ) -> TaskEvaluationResult:
        """Check if a node of the expected type was created."""
        # If task already has an output node, verify it still exists
        if task_instance.output_node_id:
            node = await self._store.get_node(
                self._workflow_id, task_instance.output_node_id
            )
            if node and node.type == delta.node_type:
                return TaskEvaluationResult(completed=True, matched_node_id=node.id)
            # Output node no longer exists or wrong type
            return TaskEvaluationResult(completed=False)

        # Look for recently created nodes of this type
        # For now, we require explicit completion for create_node tasks
        # (agent/user must mark complete with output_node_id)
        return TaskEvaluationResult(completed=False)

    async def _evaluate_compound(
        self,
        delta: CompoundDelta,
        task_instance: TaskInstance,
        context: TaskEvaluationContext,
    ) -> TaskEvaluationResult:
        """Check if a compound delta task was completed.

        Compound deltas are completed when they have an output_node_id set,
        which happens when the delta is applied via the complete task endpoint.
        We cannot auto-evaluate compound deltas from graph state.
        """
        # If task already has an output node, it was completed
        if task_instance.output_node_id:
            node = await self._store.get_node(
                self._workflow_id, task_instance.output_node_id
            )
            if node:
                return TaskEvaluationResult(completed=True, matched_node_id=node.id)

        # Compound deltas require explicit completion
        return TaskEvaluationResult(completed=False)

    async def _evaluate_status_update(
        self,
        delta: UpdateNodeStatusDelta,
        context: TaskEvaluationContext,
    ) -> TaskEvaluationResult:
        """Check if target node is in expected status."""
        node = await self._resolver.resolve(delta.target_node, context)
        if node is None:
            return TaskEvaluationResult(
                completed=False, error="Target node not found"
            )

        # Check if node status matches
        if node.status == delta.to_status:
            return TaskEvaluationResult(completed=True, matched_node_id=node.id)

        # Check if from_status constraint is violated (node moved to wrong status)
        if delta.from_status:
            valid_from = (
                delta.from_status
                if isinstance(delta.from_status, list)
                else [delta.from_status]
            )
            if node.status not in valid_from and node.status != delta.to_status:
                return TaskEvaluationResult(
                    completed=False,
                    blocked=True,
                    error=f"Node is in status '{node.status}', expected one of {valid_from}",
                )

        return TaskEvaluationResult(completed=False)

    async def _evaluate_field_update(
        self,
        delta: UpdateNodeFieldDelta,
        context: TaskEvaluationContext,
    ) -> TaskEvaluationResult:
        """Check if target node field has expected value."""
        node = await self._resolver.resolve(delta.target_node, context)
        if node is None:
            return TaskEvaluationResult(
                completed=False, error="Target node not found"
            )

        # Get field value
        field_value = node.properties.get(delta.field_key)

        # If expected_value is None, just check that field has some value
        if delta.expected_value is None:
            if field_value is not None:
                return TaskEvaluationResult(completed=True, matched_node_id=node.id)
        else:
            if field_value == delta.expected_value:
                return TaskEvaluationResult(completed=True, matched_node_id=node.id)

        return TaskEvaluationResult(completed=False)

    async def _evaluate_create_edge(
        self,
        delta: CreateEdgeDelta,
        context: TaskEvaluationContext,
    ) -> TaskEvaluationResult:
        """Check if expected edge exists."""
        from_node = await self._resolver.resolve(delta.from_node, context)
        to_node = await self._resolver.resolve(delta.to_node, context)

        if from_node is None:
            return TaskEvaluationResult(
                completed=False, error="From node not found"
            )
        if to_node is None:
            return TaskEvaluationResult(
                completed=False, error="To node not found"
            )

        # Check if edge exists
        neighbors = await self._store.get_neighbors(
            self._workflow_id, from_node.id, edge_types=[delta.edge_type]
        )

        for item in neighbors.get("outgoing", []):
            if item["node"]["id"] == to_node.id:
                return TaskEvaluationResult(
                    completed=True,
                    matched_node_id=from_node.id,
                    matched_edge_id=item["edge"]["id"],
                )

        return TaskEvaluationResult(completed=False)


class TaskDependencyResolver:
    """Resolves task dependencies and determines available tasks.

    A task is available when:
    1. All its dependencies are completed
    2. Its condition (if any) evaluates to true
    3. The task itself is not already completed or skipped
    """

    def __init__(self, graph_store: GraphStore, workflow_id: str) -> None:
        self._store = graph_store
        self._workflow_id = workflow_id
        self._resolver = NodeReferenceResolver(graph_store, workflow_id)

    async def resolve_available_tasks(
        self,
        task_set_def: TaskSetDefinition,
        context: TaskEvaluationContext,
    ) -> list[str]:
        """Return IDs of tasks that are ready to be worked on.

        Args:
            task_set_def: The TaskSet definition
            context: Evaluation context with task instance states

        Returns:
            List of task definition IDs that are available
        """
        available = []

        for task_def in task_set_def.tasks:
            instance = context.get_task_instance(task_def.id)

            # Skip already completed or skipped tasks
            if instance and instance.status in (
                TaskStatus.COMPLETED,
                TaskStatus.SKIPPED,
            ):
                continue

            # Skip tasks already in progress
            if instance and instance.status == TaskStatus.IN_PROGRESS:
                continue

            # Check all dependencies are completed
            deps_met = self._check_dependencies(task_def, context)
            if not deps_met:
                continue

            # Check condition if present
            if task_def.condition:
                condition_result = await self._evaluate_condition(
                    task_def.condition, context
                )
                if not condition_result.satisfied:
                    continue

            available.append(task_def.id)

        return available

    def _check_dependencies(
        self,
        task_def: TaskDefinition,
        context: TaskEvaluationContext,
    ) -> bool:
        """Check if all dependencies are completed."""
        for dep_id in task_def.depends_on:
            dep_instance = context.get_task_instance(dep_id)
            if dep_instance is None:
                return False
            if dep_instance.status != TaskStatus.COMPLETED:
                return False
        return True

    async def _evaluate_condition(
        self,
        condition: TaskCondition,
        context: TaskEvaluationContext,
    ) -> ConditionEvaluationResult:
        """Evaluate a task condition."""
        if condition.type == ConditionType.NODE_STATUS:
            return await self._evaluate_node_status_condition(condition, context)
        elif condition.type == ConditionType.FIELD_VALUE:
            return await self._evaluate_field_value_condition(condition, context)
        elif condition.type == ConditionType.EDGE_EXISTS:
            return await self._evaluate_edge_exists_condition(condition, context)
        elif condition.type == ConditionType.EXPRESSION:
            # Expression evaluation not implemented yet
            return ConditionEvaluationResult(
                satisfied=True, reason="Expression evaluation not implemented"
            )

        return ConditionEvaluationResult(satisfied=True)

    async def _evaluate_node_status_condition(
        self,
        condition: TaskCondition,
        context: TaskEvaluationContext,
    ) -> ConditionEvaluationResult:
        """Evaluate a node status condition."""
        if not condition.node_ref or not condition.expected_status:
            return ConditionEvaluationResult(
                satisfied=False, reason="Missing node_ref or expected_status"
            )

        node = await self._resolver.resolve(condition.node_ref, context)
        if node is None:
            return ConditionEvaluationResult(
                satisfied=False, reason="Node not found"
            )

        expected = (
            condition.expected_status
            if isinstance(condition.expected_status, list)
            else [condition.expected_status]
        )

        if node.status in expected:
            return ConditionEvaluationResult(satisfied=True)

        return ConditionEvaluationResult(
            satisfied=False,
            reason=f"Node status is '{node.status}', expected one of {expected}",
        )

    async def _evaluate_field_value_condition(
        self,
        condition: TaskCondition,
        context: TaskEvaluationContext,
    ) -> ConditionEvaluationResult:
        """Evaluate a field value condition."""
        if not condition.node_ref or not condition.field_key:
            return ConditionEvaluationResult(
                satisfied=False, reason="Missing node_ref or field_key"
            )

        node = await self._resolver.resolve(condition.node_ref, context)
        if node is None:
            return ConditionEvaluationResult(
                satisfied=False, reason="Node not found"
            )

        field_value = node.properties.get(condition.field_key)
        expected = condition.expected_value

        # Apply operator
        if condition.operator == "eq":
            satisfied = field_value == expected
        elif condition.operator == "neq":
            satisfied = field_value != expected
        elif condition.operator == "in":
            satisfied = field_value in (expected or [])
        elif condition.operator == "notin":
            satisfied = field_value not in (expected or [])
        elif condition.operator == "contains":
            satisfied = expected in (field_value or "")
        elif condition.operator == "gt":
            satisfied = field_value is not None and field_value > expected
        elif condition.operator == "lt":
            satisfied = field_value is not None and field_value < expected
        elif condition.operator == "exists":
            satisfied = field_value is not None
        else:
            satisfied = field_value == expected

        if satisfied:
            return ConditionEvaluationResult(satisfied=True)

        reason = (
            f"Field '{condition.field_key}' value '{field_value}' "
            f"does not satisfy {condition.operator} '{expected}'"
        )
        return ConditionEvaluationResult(satisfied=False, reason=reason)

    async def _evaluate_edge_exists_condition(
        self,
        condition: TaskCondition,
        context: TaskEvaluationContext,
    ) -> ConditionEvaluationResult:
        """Evaluate an edge exists condition."""
        if not condition.edge_type or not condition.from_node or not condition.to_node:
            return ConditionEvaluationResult(
                satisfied=False, reason="Missing edge_type, from_node, or to_node"
            )

        from_node = await self._resolver.resolve(condition.from_node, context)
        to_node = await self._resolver.resolve(condition.to_node, context)

        if from_node is None or to_node is None:
            return ConditionEvaluationResult(
                satisfied=False, reason="Source or target node not found"
            )

        neighbors = await self._store.get_neighbors(
            self._workflow_id, from_node.id, edge_types=[condition.edge_type]
        )

        for item in neighbors.get("outgoing", []):
            if item["node"]["id"] == to_node.id:
                return ConditionEvaluationResult(satisfied=True)

        return ConditionEvaluationResult(
            satisfied=False,
            reason=f"Edge {condition.edge_type} does not exist between nodes",
        )


class TaskProgressService:
    """High-level service for managing task progress.

    Combines the evaluator and resolver to provide a complete
    task progress management interface.
    """

    def __init__(self, graph_store: GraphStore, workflow_id: str) -> None:
        self._store = graph_store
        self._workflow_id = workflow_id
        self._evaluator = TaskProgressEvaluator(graph_store, workflow_id)
        self._resolver = TaskDependencyResolver(graph_store, workflow_id)

    def _check_dependencies_met(
        self,
        task_def: TaskDefinition,
        context: TaskEvaluationContext,
    ) -> bool:
        """Check if all dependencies of a task are completed."""
        for dep_id in task_def.depends_on:
            dep_instance = context.get_task_instance(dep_id)
            if dep_instance is None:
                return False
            if dep_instance.status != TaskStatus.COMPLETED:
                return False
        return True

    async def refresh_task_progress(
        self,
        task_set_instance: TaskSetInstance,
        task_set_definition: TaskSetDefinition,
    ) -> TaskSetInstance:
        """Refresh task progress by re-evaluating all tasks.

        This method:
        1. Creates an evaluation context
        2. Evaluates each pending task to see if it's completed
        3. Resolves available tasks
        4. Updates task instance statuses
        5. Returns updated instance

        Args:
            task_set_instance: The instance to refresh
            task_set_definition: The definition containing task specs

        Returns:
            Updated TaskSetInstance with current progress
        """
        # Clear node cache to ensure fresh data
        self._evaluator.clear_cache()

        context = TaskEvaluationContext(task_set_instance, task_set_definition)

        # Evaluate each non-completed task
        for task_def in task_set_definition.tasks:
            instance = context.get_task_instance(task_def.id)
            if instance is None:
                continue

            # Skip already completed/skipped tasks
            if instance.status in (TaskStatus.COMPLETED, TaskStatus.SKIPPED):
                continue

            # Evaluate task completion
            result = await self._evaluator.evaluate_task(task_def, instance, context)

            # Check if dependencies are met before marking as blocked
            deps_met = self._check_dependencies_met(task_def, context)

            if result.completed:
                # Update task status to completed
                await self._store.update_task_instance(
                    task_set_instance.id,
                    task_def.id,
                    status=TaskStatus.COMPLETED,
                    output_node_id=result.matched_node_id,
                )
            elif result.blocked and deps_met:
                # Only mark as BLOCKED if dependencies are met but from_status check fails
                # Tasks with unmet dependencies should stay PENDING, not BLOCKED
                await self._store.update_task_instance(
                    task_set_instance.id,
                    task_def.id,
                    status=TaskStatus.BLOCKED,
                    notes=result.error,
                )

        # Get updated instance
        updated_instance = await self._store.get_task_set_instance(
            self._workflow_id, task_set_instance.id
        )
        if updated_instance is None:
            return task_set_instance

        # Resolve available tasks
        context = TaskEvaluationContext(updated_instance, task_set_definition)
        available_ids = await self._resolver.resolve_available_tasks(
            task_set_definition, context
        )

        # Update available tasks to AVAILABLE status
        for task_def_id in available_ids:
            instance = context.get_task_instance(task_def_id)
            # Update PENDING or BLOCKED tasks to AVAILABLE (unblock previously blocked tasks)
            if instance and instance.status in (TaskStatus.PENDING, TaskStatus.BLOCKED):
                await self._store.update_task_instance(
                    task_set_instance.id,
                    task_def_id,
                    status=TaskStatus.AVAILABLE,
                )

        # Get final updated instance
        final_instance = await self._store.get_task_set_instance(
            self._workflow_id, task_set_instance.id
        )
        if final_instance:
            # Compute available count
            final_instance.available_tasks = len(available_ids)

        return final_instance or updated_instance

    async def get_available_tasks(
        self,
        task_set_instance: TaskSetInstance,
        task_set_definition: TaskSetDefinition,
    ) -> list[TaskDefinition]:
        """Get tasks that are currently available to work on.

        Args:
            task_set_instance: The running instance
            task_set_definition: The definition

        Returns:
            List of TaskDefinitions that are available
        """
        context = TaskEvaluationContext(task_set_instance, task_set_definition)
        available_ids = await self._resolver.resolve_available_tasks(
            task_set_definition, context
        )

        return [
            task_def
            for task_def in task_set_definition.tasks
            if task_def.id in available_ids
        ]
