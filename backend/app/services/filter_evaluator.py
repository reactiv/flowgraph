"""Filter evaluation service for view templates."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from app.models.node import Node
from app.models.workflow import (
    FilterGroup,
    FilterOperator,
    PropertyFilter,
    RelationalFilter,
)

if TYPE_CHECKING:
    from app.db.graph_store import GraphStore


class FilterEvaluator:
    """Evaluates filter expressions against nodes."""

    def __init__(self, graph_store: GraphStore, workflow_id: str) -> None:
        self.graph_store = graph_store
        self.workflow_id = workflow_id
        # Cache for related nodes to avoid repeated queries
        self._neighbor_cache: dict[str, dict[str, Any]] = {}

    async def evaluate_filter_group(
        self,
        nodes: list[Node],
        filter_group: FilterGroup,
    ) -> list[Node]:
        """Filter a list of nodes based on a filter group."""
        if not filter_group.filters:
            return nodes

        result = []
        for node in nodes:
            matches = await self._evaluate_group_for_node(node, filter_group)
            if matches:
                result.append(node)

        return result

    async def _evaluate_group_for_node(
        self,
        node: Node,
        filter_group: FilterGroup,
    ) -> bool:
        """Evaluate a filter group against a single node."""
        if filter_group.logic == "and":
            for f in filter_group.filters:
                if isinstance(f, FilterGroup):
                    if not await self._evaluate_group_for_node(node, f):
                        return False
                else:
                    if not await self._evaluate_filter_for_node(node, f):
                        return False
            return True
        else:  # OR logic
            for f in filter_group.filters:
                if isinstance(f, FilterGroup):
                    if await self._evaluate_group_for_node(node, f):
                        return True
                else:
                    if await self._evaluate_filter_for_node(node, f):
                        return True
            return False

    async def _evaluate_filter_for_node(
        self,
        node: Node,
        node_filter: PropertyFilter | RelationalFilter,
    ) -> bool:
        """Evaluate a single filter against a node."""
        if isinstance(node_filter, PropertyFilter) or node_filter.type == "property":
            return self._evaluate_property_filter(node, node_filter)  # type: ignore
        elif isinstance(node_filter, RelationalFilter) or node_filter.type == "relational":
            return await self._evaluate_relational_filter(node, node_filter)  # type: ignore
        return True

    def _evaluate_property_filter(
        self,
        node: Node,
        prop_filter: PropertyFilter,
    ) -> bool:
        """Evaluate a property filter against a node."""
        value = self._get_node_field_value(node, prop_filter.field)
        return self._compare_values(value, prop_filter.operator, prop_filter.value)

    def _get_node_field_value(self, node: Node, field: str) -> Any:
        """Get a field value from a node (handles special fields and properties)."""
        # Handle built-in fields
        if field == "title":
            return node.title
        elif field == "type":
            return node.type
        elif field == "status":
            return node.status
        elif field == "created_at":
            return node.created_at
        elif field == "updated_at":
            return node.updated_at
        elif field == "id":
            return node.id
        else:
            # Look in properties
            return node.properties.get(field)

    def _compare_values(
        self,
        node_value: Any,
        operator: FilterOperator,
        filter_value: Any,
    ) -> bool:
        """Compare a node value against a filter value using the given operator."""
        # Handle null checks first
        if operator == FilterOperator.IS_NULL:
            return node_value is None
        if operator == FilterOperator.IS_NOT_NULL:
            return node_value is not None

        # Handle missing values
        if node_value is None:
            return False

        # String operations
        if operator == FilterOperator.EQUALS:
            return node_value == filter_value
        elif operator == FilterOperator.NOT_EQUALS:
            return node_value != filter_value
        elif operator == FilterOperator.CONTAINS:
            return str(filter_value).lower() in str(node_value).lower()
        elif operator == FilterOperator.STARTS_WITH:
            return str(node_value).lower().startswith(str(filter_value).lower())
        elif operator == FilterOperator.ENDS_WITH:
            return str(node_value).lower().endswith(str(filter_value).lower())

        # Numeric/date operations
        elif operator == FilterOperator.GREATER_THAN:
            try:
                return node_value > filter_value
            except TypeError:
                return False
        elif operator == FilterOperator.GREATER_THAN_OR_EQUAL:
            try:
                return node_value >= filter_value
            except TypeError:
                return False
        elif operator == FilterOperator.LESS_THAN:
            try:
                return node_value < filter_value
            except TypeError:
                return False
        elif operator == FilterOperator.LESS_THAN_OR_EQUAL:
            try:
                return node_value <= filter_value
            except TypeError:
                return False

        # Set operations
        elif operator == FilterOperator.IN:
            if isinstance(filter_value, list):
                return node_value in filter_value
            return node_value == filter_value
        elif operator == FilterOperator.NOT_IN:
            if isinstance(filter_value, list):
                return node_value not in filter_value
            return node_value != filter_value

        return False

    async def _evaluate_relational_filter(
        self,
        node: Node,
        rel_filter: RelationalFilter,
    ) -> bool:
        """Evaluate a relational filter by checking connected nodes."""
        # Build cache key
        cache_key = f"{node.id}:{rel_filter.edge_type}:{rel_filter.direction}"

        # Get neighbors (from cache if available)
        if cache_key not in self._neighbor_cache:
            neighbors = await self.graph_store.get_neighbors(
                self.workflow_id,
                node.id,
                edge_types=[rel_filter.edge_type],
            )
            self._neighbor_cache[cache_key] = neighbors
        else:
            neighbors = self._neighbor_cache[cache_key]

        # Get the relevant neighbor list based on direction
        if rel_filter.direction == "outgoing":
            neighbor_list = neighbors.get("outgoing", [])
        else:
            neighbor_list = neighbors.get("incoming", [])

        # Filter to only target type
        related_nodes_data = [
            item["node"] for item in neighbor_list if item["node"]["type"] == rel_filter.target_type
        ]

        if not related_nodes_data:
            # No related nodes - "none" mode would return True, others False
            return rel_filter.match_mode == "none"

        # Evaluate the target filter against related nodes
        matches = []
        for related_node_dict in related_nodes_data:
            related_value = self._get_dict_field_value(
                related_node_dict,
                rel_filter.target_filter.field,
            )
            match = self._compare_values(
                related_value,
                rel_filter.target_filter.operator,
                rel_filter.target_filter.value,
            )
            matches.append(match)

        # Apply match mode
        if rel_filter.match_mode == "any":
            return any(matches)
        elif rel_filter.match_mode == "all":
            return all(matches)
        elif rel_filter.match_mode == "none":
            return not any(matches)

        return False

    def _get_dict_field_value(self, node_dict: dict[str, Any], field: str) -> Any:
        """Get a field value from a node dictionary."""
        if field in ("title", "type", "status", "created_at", "updated_at", "id"):
            return node_dict.get(field)
        return node_dict.get("properties", {}).get(field)
