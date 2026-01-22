"""Context gathering for LLM suggestions using composable graph traversals.

The ContextGatherer executes ContextSelector paths to gather nodes for LLM context.
It supports multi-hop traversals, branching paths, global queries, and property filtering.

Extended to support external references with the Pointer/Projection/Snapshot model,
producing ContextPacks with full provenance for audit and reproducibility.
"""

import logging
import uuid
from datetime import datetime
from typing import Any

from app.db.graph_store import GraphStore
from app.models import Node
from app.models.context_pack import (
    ContextPack,
    ContextPackRequest,
    ContextPackResponse,
    ContextResource,
)
from app.models.context_selector import (
    ContextPath,
    ContextPreview,
    ContextPreviewNode,
    ContextSelector,
    PropertySelector,
    default_context_selector,
)
from app.models.external_reference import RetrievalMode

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

    # ==================== Context Pack Generation ====================

    async def build_context_pack(
        self,
        workflow_id: str,
        source_node_id: str,
        request: ContextPackRequest | None = None,
        selector: ContextSelector | None = None,
    ) -> ContextPackResponse:
        """Build a context pack with provenance tracking.

        This method gathers context nodes and external references, tracking:
        - What resources were included
        - How they were retrieved (cached vs fresh)
        - Their freshness state
        - Which traversal path pulled them in

        Args:
            workflow_id: The workflow ID
            source_node_id: The source node to gather context for
            request: Optional request configuration
            selector: Context selector (uses default if None)

        Returns:
            ContextPackResponse with the pack and any warnings
        """
        request = request or ContextPackRequest()
        selector = selector or default_context_selector()

        # Get source node
        source_node = await self._graph_store.get_node(workflow_id, source_node_id)
        if source_node is None:
            raise ValueError(f"Source node {source_node_id} not found")

        # Track resources and warnings
        resources: list[ContextResource] = []
        warnings: list[str] = []
        refreshed_count = 0
        skipped_count = 0

        # Add source node as first resource
        source_resource = await self._node_to_resource(
            workflow_id, source_node, path_name="source", hop_depth=0
        )
        resources.append(source_resource)

        # Execute paths and gather resources
        path_results: dict[str, list[dict[str, Any]]] = {}

        for path in selector.paths:
            try:
                result_nodes = await self._execute_path(
                    workflow_id, source_node, path, path_results
                )
                path_results[path.name] = result_nodes

                # Convert to resources with external reference checks
                for node_dict in result_nodes:
                    resource = await self._node_dict_to_resource(
                        workflow_id,
                        node_dict,
                        path_name=path.name,
                        hop_depth=node_dict.get("traversal_depth", 1),
                        refresh_stale=request.refresh_stale,
                    )

                    if resource.is_stale:
                        warnings.append(
                            f"Resource '{resource.title}' from path '{path.name}' is stale"
                        )

                    resources.append(resource)

            except Exception as e:
                logger.warning(f"Error executing path '{path.name}': {e}")
                warnings.append(f"Failed to execute path '{path.name}': {str(e)}")

        # Handle empty paths (default neighbors)
        if not selector.paths:
            neighbors = await self._graph_store.get_neighbors(workflow_id, source_node_id)
            all_neighbors = neighbors.get("outgoing", []) + neighbors.get("incoming", [])
            for n in all_neighbors[:5]:
                resource = await self._node_dict_to_resource(
                    workflow_id,
                    n["node"],
                    path_name="neighbors",
                    hop_depth=1,
                    refresh_stale=request.refresh_stale,
                )
                resources.append(resource)

        # Estimate tokens
        estimated_tokens = self._estimate_tokens(resources)

        # Apply token limit if specified
        if request.max_tokens and estimated_tokens > request.max_tokens:
            resources, skipped_count = self._apply_token_limit(
                resources, request.max_tokens
            )
            estimated_tokens = self._estimate_tokens(resources)
            if skipped_count > 0:
                warnings.append(
                    f"Skipped {skipped_count} resources to stay within token limit"
                )

        # Create the context pack
        pack = ContextPack(
            id=str(uuid.uuid4()),
            workflow_id=workflow_id,
            source_node_id=source_node_id,
            traversal_rule=selector.name if hasattr(selector, 'name') else None,
            resources=resources,
            created_at=datetime.utcnow(),
            estimated_tokens=estimated_tokens,
        )

        # Compute freshness summary
        pack.compute_freshness_summary()

        # Check for stale data requirement
        if request.require_fresh and pack.any_stale:
            warnings.insert(0, "Some resources are stale but fresh data was required")

        # Save pack for audit (optional)
        try:
            await self._graph_store.save_context_pack(pack)
        except Exception as e:
            logger.warning(f"Failed to save context pack: {e}")

        return ContextPackResponse(
            pack=pack,
            warnings=warnings,
            refreshed_count=refreshed_count,
            skipped_count=skipped_count,
        )

    async def _node_to_resource(
        self,
        workflow_id: str,
        node: Node,
        path_name: str,
        hop_depth: int,
    ) -> ContextResource:
        """Convert a Node to a ContextResource, checking for external references."""
        # Check if node has linked external references
        node_refs = await self._graph_store.get_node_references(workflow_id, node.id)

        if node_refs:
            # Use the first (primary) reference
            ref_link = node_refs[0]
            ref = ref_link.reference
            proj = ref.projection

            return ContextResource(
                reference_id=ref.id,
                node_id=node.id,
                title=proj.title if proj else node.title,
                content=proj.summary if proj else None,
                properties=proj.properties if proj else node.properties,
                projection=proj,
                retrieval_mode=proj.retrieval_mode if proj else RetrievalMode.CACHED,
                fetched_at=proj.fetched_at if proj else None,
                version=ref.version,
                is_stale=proj.is_stale if proj else False,
                path_name=path_name,
                hop_depth=hop_depth,
            )
        else:
            # Internal node only
            return ContextResource(
                node_id=node.id,
                title=node.title,
                content=None,
                properties=node.properties,
                retrieval_mode=RetrievalMode.CACHED,
                fetched_at=datetime.utcnow(),
                is_stale=False,
                path_name=path_name,
                hop_depth=hop_depth,
            )

    async def _node_dict_to_resource(
        self,
        workflow_id: str,
        node_dict: dict[str, Any],
        path_name: str,
        hop_depth: int,
        refresh_stale: bool = False,
    ) -> ContextResource:
        """Convert a node dictionary to a ContextResource."""
        node_id = node_dict.get("id")

        # Check for external references
        if node_id:
            node_refs = await self._graph_store.get_node_references(workflow_id, node_id)

            if node_refs:
                ref_link = node_refs[0]
                ref = ref_link.reference
                proj = ref.projection

                # Optionally refresh stale projections
                if refresh_stale and proj and proj.is_stale:
                    # Note: Actual refresh would require connector lookup
                    # For now, just note that refresh was requested
                    logger.debug(
                        f"Would refresh stale projection for reference {ref.id}"
                    )

                return ContextResource(
                    reference_id=ref.id,
                    node_id=node_id,
                    title=proj.title if proj else node_dict.get("title"),
                    content=proj.summary if proj else None,
                    properties=proj.properties if proj else node_dict.get("properties", {}),
                    projection=proj,
                    retrieval_mode=proj.retrieval_mode if proj else RetrievalMode.CACHED,
                    fetched_at=proj.fetched_at if proj else None,
                    version=ref.version,
                    is_stale=proj.is_stale if proj else False,
                    path_name=path_name,
                    hop_depth=hop_depth,
                )

        # Internal node only
        return ContextResource(
            node_id=node_id,
            title=node_dict.get("title"),
            content=None,
            properties=node_dict.get("properties", {}),
            retrieval_mode=RetrievalMode.CACHED,
            fetched_at=datetime.utcnow(),
            is_stale=False,
            path_name=path_name,
            hop_depth=hop_depth,
        )

    def _estimate_tokens(self, resources: list[ContextResource]) -> int:
        """Estimate token count for a list of resources.

        Rough estimation: ~4 chars per token, plus overhead for structure.
        """
        total_chars = 0
        for resource in resources:
            # Title
            if resource.title:
                total_chars += len(resource.title)
            # Content/summary
            if resource.content:
                total_chars += len(resource.content)
            # Properties (JSON serialized)
            if resource.properties:
                import json
                total_chars += len(json.dumps(resource.properties))
            # Overhead per resource (~50 tokens for structure)
            total_chars += 200

        return total_chars // 4

    def _apply_token_limit(
        self, resources: list[ContextResource], max_tokens: int
    ) -> tuple[list[ContextResource], int]:
        """Apply token limit by truncating resources from the end.

        Keeps source node and prioritizes by hop_depth (closer = higher priority).

        Returns:
            Tuple of (filtered resources, count of skipped resources)
        """
        if not resources:
            return resources, 0

        # Sort by hop_depth (source first, then closer nodes)
        sorted_resources = sorted(resources, key=lambda r: r.hop_depth)

        kept: list[ContextResource] = []
        current_tokens = 0

        for resource in sorted_resources:
            # Estimate this resource's tokens
            resource_tokens = self._estimate_tokens([resource])

            if current_tokens + resource_tokens <= max_tokens:
                kept.append(resource)
                current_tokens += resource_tokens
            else:
                # Stop adding resources
                break

        skipped = len(resources) - len(kept)
        return kept, skipped
