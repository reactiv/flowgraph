"""Context gathering for LLM suggestions using composable graph traversals.

The ContextGatherer executes ContextSelector paths to gather nodes for LLM context.
It supports multi-hop traversals, branching paths, global queries, and property filtering.
"""

import logging
from typing import Any

from app.db.graph_store import GraphStore
from app.models import Node
from app.models.context_selector import (
    ContextPath,
    ContextPreview,
    ContextPreviewNode,
    ContextSelector,
    PropertySelector,
    default_context_selector,
)

logger = logging.getLogger(__name__)


class ContextGatherer:
    """Gathers context nodes by executing traversal paths."""

    def __init__(self, graph_store: GraphStore | None = None):
        self._graph_store = graph_store or GraphStore()

    async def gather_context(
        self,
        workflow_id: str,
        source_node_id: str,
        selector: ContextSelector | None = None,
    ) -> dict[str, Any]:
        """Execute all paths and gather context nodes.

        Args:
            workflow_id: The workflow ID.
            source_node_id: The source node to gather context for.
            selector: Context selector configuration. Uses defaults if None.

        Returns:
            Dictionary with source_node and path_results.
        """
        selector = selector or default_context_selector()

        # Get source node
        source_node = await self._graph_store.get_node(workflow_id, source_node_id)
        if source_node is None:
            raise ValueError(f"Source node {source_node_id} not found")

        # Execute paths
        path_results: dict[str, list[dict[str, Any]]] = {}

        for path in selector.paths:
            try:
                result_nodes = await self._execute_path(
                    workflow_id, source_node, path, path_results
                )
                path_results[path.name] = result_nodes
            except Exception as e:
                logger.warning(f"Error executing path '{path.name}': {e}")
                path_results[path.name] = []

        # Handle empty paths (default: get direct neighbors)
        if not selector.paths:
            neighbors = await self._graph_store.get_neighbors(workflow_id, source_node_id)
            all_neighbors = neighbors.get("outgoing", []) + neighbors.get("incoming", [])
            path_results["neighbors"] = [
                self._node_dict_to_context(n["node"], "neighbors", 1)
                for n in all_neighbors[:5]
            ]

        # Apply property filtering
        filtered_source = self._filter_properties(
            source_node.model_dump(), selector.source_properties
        )
        filtered_paths = {
            name: [
                self._filter_properties(n, selector.context_properties)
                for n in nodes
            ]
            for name, nodes in path_results.items()
        }

        return {
            "source_node": filtered_source,
            "path_results": filtered_paths,
        }

    async def preview_context(
        self,
        workflow_id: str,
        source_node_id: str,
        selector: ContextSelector | None = None,
    ) -> ContextPreview:
        """Generate a preview of context that would be included.

        Returns a ContextPreview with full node information for UI display.
        """
        selector = selector or default_context_selector()

        # Get source node
        source_node = await self._graph_store.get_node(workflow_id, source_node_id)
        if source_node is None:
            raise ValueError(f"Source node {source_node_id} not found")

        # Execute paths
        path_results: dict[str, list[ContextPreviewNode]] = {}

        for path in selector.paths:
            try:
                result_nodes = await self._execute_path(
                    workflow_id, source_node, path, {}
                )
                path_results[path.name] = [
                    ContextPreviewNode(**n) for n in result_nodes
                ]
            except Exception as e:
                logger.warning(f"Error executing path '{path.name}': {e}")
                path_results[path.name] = []

        # Handle empty paths (default: get direct neighbors)
        if not selector.paths:
            neighbors = await self._graph_store.get_neighbors(workflow_id, source_node_id)
            all_neighbors = neighbors.get("outgoing", []) + neighbors.get("incoming", [])
            path_results["neighbors"] = [
                ContextPreviewNode(**self._node_dict_to_context(n["node"], "neighbors", 1))
                for n in all_neighbors[:5]
            ]

        # Calculate totals
        total_nodes = sum(len(nodes) for nodes in path_results.values())

        # Estimate tokens (rough: 50 tokens per node average)
        tokens_estimate = (total_nodes + 1) * 50  # +1 for source

        return ContextPreview(
            source_node=ContextPreviewNode(
                id=source_node.id,
                type=source_node.type,
                title=source_node.title,
                status=source_node.status,
                properties=source_node.properties,
                path_name=None,
                traversal_depth=0,
            ),
            path_results=path_results,
            total_nodes=total_nodes,
            total_tokens_estimate=tokens_estimate,
        )

    async def _execute_path(
        self,
        workflow_id: str,
        source_node: Node,
        path: ContextPath,
        prior_results: dict[str, list[dict[str, Any]]],
    ) -> list[dict[str, Any]]:
        """Execute a single context path and return matching nodes."""

        # Handle global queries (not relative to source)
        if path.global_query:
            if not path.target_type:
                logger.warning(f"Path '{path.name}' is global but has no target_type")
                return []
            nodes, _ = await self._graph_store.query_nodes(
                workflow_id, node_type=path.target_type, limit=path.max_count + 1
            )
            # Exclude source node from results
            nodes = [n for n in nodes if n.id != source_node.id]
            return [
                self._node_to_context(n, path.name, 0) for n in nodes[: path.max_count]
            ]

        # Determine starting nodes
        if path.from_path:
            # Start from results of another path
            prior = prior_results.get(path.from_path, [])
            if not prior:
                logger.debug(f"Path '{path.name}' has no starting nodes from '{path.from_path}'")
                return []
            start_nodes = [(n, path.steps[0] if path.steps else None) for n in prior]
        else:
            # Start from source node
            start_nodes = [(self._node_to_dict(source_node), None)]

        # If no steps, return direct neighbors (legacy behavior)
        if not path.steps:
            all_neighbors: list[dict[str, Any]] = []
            for start_dict, _ in start_nodes:
                neighbors = await self._graph_store.get_neighbors(
                    workflow_id, start_dict["id"]
                )
                out = neighbors.get("outgoing", [])
                inc = neighbors.get("incoming", [])
                for n in out + inc:
                    all_neighbors.append(
                        self._node_dict_to_context(n["node"], path.name, 1)
                    )
            # Filter by target type
            if path.target_type:
                all_neighbors = [n for n in all_neighbors if n["type"] == path.target_type]
            return all_neighbors[: path.max_count]

        # Execute traversal steps
        current_nodes = [n for n, _ in start_nodes]
        depth = 0

        for step in path.steps:
            depth += 1
            next_nodes: list[dict[str, Any]] = []
            seen_ids: set[str] = set()

            for node_dict in current_nodes:
                neighbors = await self._graph_store.get_neighbors(
                    workflow_id,
                    node_dict["id"],
                    depth=1,
                    edge_types=[step.edge_type],
                )

                # Get nodes in the specified direction
                direction_key = step.direction
                for item in neighbors.get(direction_key, []):
                    neighbor_node = item["node"]
                    if neighbor_node["id"] not in seen_ids:
                        seen_ids.add(neighbor_node["id"])
                        next_nodes.append(
                            self._node_dict_to_context(neighbor_node, path.name, depth)
                        )

            current_nodes = next_nodes

            if not current_nodes:
                break

        # Filter by target type
        if path.target_type:
            current_nodes = [n for n in current_nodes if n["type"] == path.target_type]

        return current_nodes[: path.max_count]

    def _node_to_dict(self, node: Node) -> dict[str, Any]:
        """Convert a Node to a dictionary."""
        return {
            "id": node.id,
            "type": node.type,
            "title": node.title,
            "status": node.status,
            "properties": node.properties,
        }

    def _node_to_context(
        self, node: Node, path_name: str, depth: int
    ) -> dict[str, Any]:
        """Convert a Node to context preview format."""
        return {
            "id": node.id,
            "type": node.type,
            "title": node.title,
            "status": node.status,
            "properties": node.properties,
            "path_name": path_name,
            "traversal_depth": depth,
        }

    def _node_dict_to_context(
        self, node_dict: dict[str, Any], path_name: str, depth: int
    ) -> dict[str, Any]:
        """Convert a node dictionary to context preview format."""
        return {
            "id": node_dict["id"],
            "type": node_dict["type"],
            "title": node_dict["title"],
            "status": node_dict.get("status"),
            "properties": node_dict.get("properties", {}),
            "path_name": path_name,
            "traversal_depth": depth,
        }

    def _filter_properties(
        self, node_dict: dict[str, Any], selector: PropertySelector
    ) -> dict[str, Any]:
        """Apply property filtering to a node dictionary."""
        if selector.mode == "all":
            return node_dict

        props = node_dict.get("properties", {})

        if selector.mode == "include":
            filtered_props = {k: v for k, v in props.items() if k in selector.fields}
        else:  # exclude
            filtered_props = {k: v for k, v in props.items() if k not in selector.fields}

        return {**node_dict, "properties": filtered_props}
