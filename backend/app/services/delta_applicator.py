"""DeltaApplicator - Applies task deltas to the workflow graph.

This module provides a service that applies task deltas (expected changes)
to the actual workflow graph when tasks are completed.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from app.models.edge import EdgeCreate
from app.models.node import NodeCreate, NodeUpdate
from app.models.task import (
    CompoundDelta,
    CreateEdgeDelta,
    CreateNodeDelta,
    TaskDelta,
    TaskInstance,
    TaskSetDefinition,
    UpdateNodeFieldDelta,
    UpdateNodeStatusDelta,
)
from app.services.node_reference_resolver import (
    NodeReferenceResolver,
    StepContext,
    TaskContext,
)

if TYPE_CHECKING:
    from app.db.graph_store import GraphStore


@dataclass
class DeltaApplicationResult:
    """Result of applying a delta to the graph."""

    applied: bool
    node_id: str | None = None
    edge_id: str | None = None
    error: str | None = None
    already_applied: bool = False


class DeltaApplicator:
    """Applies task deltas to the workflow graph.

    When a task is completed, this service applies the expected change (delta)
    to the actual graph. Supports:
    - CreateNodeDelta: Creates a new node
    - UpdateNodeStatusDelta: Updates a node's status
    - UpdateNodeFieldDelta: Updates a field on a node
    - CreateEdgeDelta: Creates an edge between nodes

    The applicator is designed to be idempotent - calling it multiple times
    with the same delta should produce the same result.
    """

    def __init__(self, graph_store: GraphStore, workflow_id: str) -> None:
        self._store = graph_store
        self._workflow_id = workflow_id
        self._resolver = NodeReferenceResolver(graph_store, workflow_id)

    async def apply(
        self,
        delta: TaskDelta,
        task_instance: TaskInstance,
        definition: TaskSetDefinition,
        context: TaskContext,
        request_values: dict[str, object] | None = None,
    ) -> DeltaApplicationResult:
        """Apply a delta to the graph.

        Args:
            delta: The delta describing the expected change
            task_instance: The task instance being completed
            definition: The TaskSet definition for context
            context: Task context for resolving references
            request_values: Optional values from the completion request
                            (for create_node deltas, these override delta.initial_values)
                            (for compound deltas, these are keyed by step.key)

        Returns:
            DeltaApplicationResult with the created/modified node/edge ID
        """
        delta_type = getattr(delta, "delta_type", None)

        if isinstance(delta, CompoundDelta) or delta_type == "compound":
            return await self._apply_compound(
                delta, task_instance, definition, context, request_values  # type: ignore
            )
        elif isinstance(delta, CreateNodeDelta) or delta_type == "create_node":
            return await self._apply_create_node(delta, task_instance, definition, request_values)  # type: ignore
        elif isinstance(delta, UpdateNodeStatusDelta) or delta_type == "update_node_status":
            return await self._apply_update_status(delta, context)  # type: ignore
        elif isinstance(delta, UpdateNodeFieldDelta) or delta_type == "update_node_field":
            return await self._apply_update_field(delta, context)  # type: ignore
        elif isinstance(delta, CreateEdgeDelta) or delta_type == "create_edge":
            return await self._apply_create_edge(delta, context)
        else:
            return DeltaApplicationResult(
                applied=False,
                error=f"Unknown delta type: {type(delta)}",
            )

    async def _apply_compound(
        self,
        delta: CompoundDelta,
        task_instance: TaskInstance,
        definition: TaskSetDefinition,
        context: TaskContext,
        request_values: dict[str, object] | None = None,
    ) -> DeltaApplicationResult:
        """Apply all steps in a compound delta sequentially.

        Args:
            delta: The compound delta containing multiple steps
            task_instance: The task instance being completed
            definition: The TaskSet definition for context
            context: Task context for resolving references
            request_values: Optional values keyed by step.key

        Returns:
            DeltaApplicationResult with the output node ID
            (from output_step_key or first create_node)
        """
        step_context = StepContext()
        results: list[DeltaApplicationResult] = []
        output_node_id: str | None = None

        for step in delta.steps:
            # Get request values for this step (keyed by step.key)
            step_request_values = None
            if request_values and step.key in request_values:
                step_val = request_values[step.key]
                if isinstance(step_val, dict):
                    step_request_values = step_val

            # Apply the step's delta
            result = await self._apply_atomic(
                step.delta,
                task_instance,
                definition,
                context,
                step_context,
                step_request_values,
            )

            if result.error:
                return DeltaApplicationResult(
                    applied=False,
                    error=f"Step '{step.key}' failed: {result.error}",
                )

            results.append(result)

            # Track created nodes for step_output references
            if result.node_id:
                step_context.set_output_node_id(step.key, result.node_id)

            # Determine output node
            if delta.output_step_key == step.key:
                output_node_id = result.node_id

        # If no explicit output_step_key, use first create_node step's output
        if output_node_id is None:
            for step, result in zip(delta.steps, results):
                if isinstance(step.delta, CreateNodeDelta) and result.node_id:
                    output_node_id = result.node_id
                    break

        return DeltaApplicationResult(
            applied=True,
            node_id=output_node_id,
        )

    async def _apply_atomic(
        self,
        delta: CreateNodeDelta | UpdateNodeStatusDelta | UpdateNodeFieldDelta | CreateEdgeDelta,
        task_instance: TaskInstance,
        definition: TaskSetDefinition,
        context: TaskContext,
        step_context: StepContext | None = None,
        request_values: dict[str, object] | None = None,
    ) -> DeltaApplicationResult:
        """Apply an atomic delta with optional step context.

        This is used by _apply_compound to apply individual steps.
        """
        delta_type = getattr(delta, "delta_type", None)

        if isinstance(delta, CreateNodeDelta) or delta_type == "create_node":
            return await self._apply_create_node(
                delta, task_instance, definition, request_values  # type: ignore
            )
        elif isinstance(delta, UpdateNodeStatusDelta) or delta_type == "update_node_status":
            return await self._apply_update_status(delta, context, step_context)  # type: ignore
        elif isinstance(delta, UpdateNodeFieldDelta) or delta_type == "update_node_field":
            return await self._apply_update_field(delta, context, step_context)  # type: ignore
        elif isinstance(delta, CreateEdgeDelta) or delta_type == "create_edge":
            return await self._apply_create_edge(delta, context, step_context)
        else:
            return DeltaApplicationResult(
                applied=False,
                error=f"Unknown atomic delta type: {type(delta)}",
            )

    async def _apply_create_node(
        self,
        delta: CreateNodeDelta,
        task_instance: TaskInstance,
        definition: TaskSetDefinition,
        request_values: dict[str, object] | None = None,
    ) -> DeltaApplicationResult:
        """Create a new node in the workflow.

        Idempotency: If task already has an output_node_id, verify the node
        exists and return it.

        Args:
            delta: The create node delta
            task_instance: The task instance being completed
            definition: The TaskSet definition for context
            request_values: Optional values from the completion request
                            (these override delta.initial_values)
        """
        # Check if already applied
        if task_instance.output_node_id:
            node = await self._store.get_node(
                self._workflow_id, task_instance.output_node_id
            )
            if node and node.type == delta.node_type:
                return DeltaApplicationResult(
                    applied=True,
                    node_id=node.id,
                    already_applied=True,
                )

        # Merge initial values: delta.initial_values as base, request_values as override
        merged_properties: dict[str, object] = {}
        if delta.initial_values:
            merged_properties.update(delta.initial_values)
        if request_values:
            merged_properties.update(request_values)

        # Generate title from node type and merged values
        title = self._generate_node_title_from_properties(delta.node_type, merged_properties)

        # Create the node
        node_create = NodeCreate(
            type=delta.node_type,
            title=title,
            status=delta.initial_status,
            properties=merged_properties,
        )

        node = await self._store.create_node(self._workflow_id, node_create)

        return DeltaApplicationResult(
            applied=True,
            node_id=node.id,
        )

    async def _apply_update_status(
        self,
        delta: UpdateNodeStatusDelta,
        context: TaskContext,
        step_context: StepContext | None = None,
    ) -> DeltaApplicationResult:
        """Update a node's status.

        Idempotency: If node is already in the target status, return success.
        """
        # Resolve target node
        node = await self._resolver.resolve(delta.target_node, context, step_context)
        if node is None:
            return DeltaApplicationResult(
                applied=False,
                error="Target node not found",
            )

        # Check if already in target status
        if node.status == delta.to_status:
            return DeltaApplicationResult(
                applied=True,
                node_id=node.id,
                already_applied=True,
            )

        # Verify from_status constraint if specified
        if delta.from_status:
            valid_from = (
                delta.from_status
                if isinstance(delta.from_status, list)
                else [delta.from_status]
            )
            if node.status not in valid_from:
                return DeltaApplicationResult(
                    applied=False,
                    error=f"Node is in status '{node.status}', expected one of {valid_from}",
                )

        # Update the status
        update = NodeUpdate(status=delta.to_status)
        updated_node = await self._store.update_node(self._workflow_id, node.id, update)

        if updated_node is None:
            return DeltaApplicationResult(
                applied=False,
                error="Failed to update node status",
            )

        return DeltaApplicationResult(
            applied=True,
            node_id=updated_node.id,
        )

    async def _apply_update_field(
        self,
        delta: UpdateNodeFieldDelta,
        context: TaskContext,
        step_context: StepContext | None = None,
    ) -> DeltaApplicationResult:
        """Update a field on a node.

        Idempotency: If field already has the expected value, return success.
        """
        # Resolve target node
        node = await self._resolver.resolve(delta.target_node, context, step_context)
        if node is None:
            return DeltaApplicationResult(
                applied=False,
                error="Target node not found",
            )

        current_value = node.properties.get(delta.field_key)

        # Check if already has expected value
        if delta.expected_value is not None and current_value == delta.expected_value:
            return DeltaApplicationResult(
                applied=True,
                node_id=node.id,
                already_applied=True,
            )

        # Update the field
        new_properties = dict(node.properties)
        new_properties[delta.field_key] = delta.expected_value

        update = NodeUpdate(properties=new_properties)
        updated_node = await self._store.update_node(self._workflow_id, node.id, update)

        if updated_node is None:
            return DeltaApplicationResult(
                applied=False,
                error="Failed to update node field",
            )

        return DeltaApplicationResult(
            applied=True,
            node_id=updated_node.id,
        )

    async def _apply_create_edge(
        self,
        delta: CreateEdgeDelta,
        context: TaskContext,
        step_context: StepContext | None = None,
    ) -> DeltaApplicationResult:
        """Create an edge between nodes.

        Idempotency: If edge already exists, return success.
        """
        # Resolve from and to nodes
        from_node = await self._resolver.resolve(delta.from_node, context, step_context)
        to_node = await self._resolver.resolve(delta.to_node, context, step_context)

        if from_node is None:
            return DeltaApplicationResult(
                applied=False,
                error="From node not found",
            )
        if to_node is None:
            return DeltaApplicationResult(
                applied=False,
                error="To node not found",
            )

        # Check if edge already exists
        neighbors = await self._store.get_neighbors(
            self._workflow_id, from_node.id, edge_types=[delta.edge_type]
        )

        for item in neighbors.get("outgoing", []):
            if item["node"]["id"] == to_node.id:
                return DeltaApplicationResult(
                    applied=True,
                    node_id=from_node.id,
                    edge_id=item["edge"]["id"],
                    already_applied=True,
                )

        # Create the edge
        edge_create = EdgeCreate(
            type=delta.edge_type,
            from_node_id=from_node.id,
            to_node_id=to_node.id,
            properties={},
        )

        edge = await self._store.create_edge(self._workflow_id, edge_create)

        return DeltaApplicationResult(
            applied=True,
            node_id=from_node.id,
            edge_id=edge.id,
        )

    def _generate_node_title(self, delta: CreateNodeDelta) -> str:
        """Generate a title for a new node.

        Uses initial_values if they contain a 'title' or 'name' key,
        otherwise generates from node type.
        """
        return self._generate_node_title_from_properties(
            delta.node_type, delta.initial_values
        )

    def _generate_node_title_from_properties(
        self, node_type: str, properties: dict[str, object]
    ) -> str:
        """Generate a title for a new node from properties.

        Uses properties if they contain a 'title' or 'name' key,
        otherwise generates from node type.
        """
        # Check for explicit title in properties
        if "title" in properties:
            return str(properties["title"])
        if "name" in properties:
            return str(properties["name"])

        # Generate from node type
        # Convert "SomeNodeType" to "New Some Node Type"
        # Insert spaces before capitals
        spaced = ""
        for i, char in enumerate(node_type):
            if i > 0 and char.isupper():
                spaced += " "
            spaced += char
        return f"New {spaced}"
