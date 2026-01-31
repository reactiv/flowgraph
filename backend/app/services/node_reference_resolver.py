"""NodeReferenceResolver - Shared service for resolving node references.

This module provides a reusable service for resolving NodeReference objects
to actual Node instances. Used by both DeltaApplicator and TaskProgressService.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from app.models.node import Node
from app.models.task import (
    NodeReference,
    NodeReferenceType,
    TaskInstance,
    TaskSetInstance,
    TaskStatus,
)

if TYPE_CHECKING:
    from app.db.graph_store import GraphStore


@dataclass
class StepContext:
    """Tracks nodes created by steps within a compound delta.

    Used during compound delta application to allow later steps
    to reference nodes created by earlier steps via step_output references.
    """

    output_nodes: dict[str, str] = field(default_factory=dict)  # step_key → node_id

    def get_output_node_id(self, step_key: str) -> str | None:
        """Get the node ID created by a specific step."""
        return self.output_nodes.get(step_key)

    def set_output_node_id(self, step_key: str, node_id: str) -> None:
        """Record the node ID created by a step."""
        self.output_nodes[step_key] = node_id


class TaskContext:
    """Context for resolving task-related references.

    Provides access to task instances and their output nodes.
    """

    def __init__(self, task_set_instance: TaskSetInstance) -> None:
        self.instance = task_set_instance
        # Build lookup map
        self._task_instances_by_def_id = {
            ti.task_definition_id: ti for ti in task_set_instance.task_instances
        }

    def get_task_instance(self, task_def_id: str) -> TaskInstance | None:
        """Get a task instance by its definition ID."""
        return self._task_instances_by_def_id.get(task_def_id)

    def get_output_node_id(self, task_def_id: str) -> str | None:
        """Get the output node ID from a completed task."""
        instance = self.get_task_instance(task_def_id)
        if instance and instance.status == TaskStatus.COMPLETED:
            return instance.output_node_id
        return None


class NodeReferenceResolver:
    """Resolves NodeReference objects to actual Node instances.

    Supports three resolution modes:
    - ID: Direct node ID lookup
    - TASK_OUTPUT: Reference to another task's output node
    - QUERY: Query-based lookup by node type and filters

    The resolver includes caching to avoid redundant database queries.
    """

    def __init__(self, graph_store: GraphStore, workflow_id: str) -> None:
        self._store = graph_store
        self._workflow_id = workflow_id
        self._node_cache: dict[str, Node | None] = {}

    def clear_cache(self) -> None:
        """Clear the node cache. Call this before each operation cycle."""
        self._node_cache.clear()

    async def resolve(
        self,
        ref: NodeReference,
        context: TaskContext | None = None,
        step_context: StepContext | None = None,
    ) -> Node | None:
        """Resolve a NodeReference to an actual Node.

        Args:
            ref: The node reference to resolve
            context: Optional task context for resolving task_output references
            step_context: Optional step context for resolving step_output references
                         (within compound deltas)

        Returns:
            The resolved Node, or None if not found
        """
        cache_key = self._get_cache_key(ref, context, step_context)
        if cache_key in self._node_cache:
            return self._node_cache[cache_key]

        node: Node | None = None

        if ref.type == NodeReferenceType.ID:
            node = await self._resolve_by_id(ref)
        elif ref.type == NodeReferenceType.TASK_OUTPUT:
            node = await self._resolve_by_task_output(ref, context)
        elif ref.type == NodeReferenceType.QUERY:
            node = await self._resolve_by_query(ref, context)
        elif ref.type == NodeReferenceType.STEP_OUTPUT:
            node = await self._resolve_by_step_output(ref, step_context)

        self._node_cache[cache_key] = node
        return node

    async def _resolve_by_id(self, ref: NodeReference) -> Node | None:
        """Resolve a node by its ID."""
        if ref.node_id:
            return await self._store.get_node(self._workflow_id, ref.node_id)
        return None

    async def _resolve_by_task_output(
        self,
        ref: NodeReference,
        context: TaskContext | None,
    ) -> Node | None:
        """Resolve a node by referencing another task's output."""
        if ref.task_id and context:
            output_node_id = context.get_output_node_id(ref.task_id)
            if output_node_id:
                return await self._store.get_node(self._workflow_id, output_node_id)
        return None

    async def _resolve_by_query(
        self, ref: NodeReference, context: TaskContext | None
    ) -> Node | None:
        """Resolve a node by querying node type and optional filters.

        For node-scoped TaskSets: If the query matches the root node's type
        and no specific filters are set, returns the root node. This ensures
        that tasks operating on "the Account" or "the Contact" resolve to
        the specific node the TaskSet instance is scoped to.
        """
        if not ref.node_type:
            return None

        # For node-scoped TaskSets, check if we should use the root node
        if context and context.instance.root_node_id:
            root_node = await self._store.get_node(
                self._workflow_id, context.instance.root_node_id
            )
            # If query is for the same type as root and no specific filters,
            # return the root node
            if root_node and root_node.type == ref.node_type and not ref.query_filters:
                return root_node

        # Fallback: query all nodes of this type
        nodes, _ = await self._store.query_nodes(
            self._workflow_id,
            node_type=ref.node_type,
            limit=1,
        )
        return nodes[0] if nodes else None

    async def _resolve_by_step_output(
        self,
        ref: NodeReference,
        step_context: StepContext | None,
    ) -> Node | None:
        """Resolve a reference to a node created by an earlier step in a compound delta."""
        if not step_context or not ref.step_key:
            return None

        node_id = step_context.get_output_node_id(ref.step_key)
        if not node_id:
            return None

        return await self._store.get_node(self._workflow_id, node_id)

    def _get_cache_key(
        self,
        ref: NodeReference,
        context: TaskContext | None,
        step_context: StepContext | None = None,
    ) -> str:
        """Generate a cache key for a node reference."""
        if ref.type == NodeReferenceType.ID:
            return f"id:{ref.node_id}"
        elif ref.type == NodeReferenceType.TASK_OUTPUT:
            output_id = context.get_output_node_id(ref.task_id or "") if context else None
            return f"task_output:{ref.task_id}:{output_id}"
        elif ref.type == NodeReferenceType.QUERY:
            root_id = context.instance.root_node_id if context else None
            return f"query:{ref.node_type}:{ref.query_filters}:{root_id}"
        elif ref.type == NodeReferenceType.STEP_OUTPUT:
            output_id = (
                step_context.get_output_node_id(ref.step_key or "")
                if step_context
                else None
            )
            return f"step_output:{ref.step_key}:{output_id}"
        return f"unknown:{ref}"
