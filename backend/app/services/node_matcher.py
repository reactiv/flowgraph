"""Node and edge matching service with noise tolerance.

Matches incoming seed data against existing graph structures to determine
whether to create, update, or skip nodes/edges.
"""

import re
from typing import Any

from app.db.graph_store import GraphStore
from app.llm.transformer.seed_models import SeedData, SeedEdge, SeedNode
from app.llm.transformer.seed_validators import _levenshtein_distance
from app.models.match import (
    EdgeMatchResult,
    MatchConfidence,
    MatchDecision,
    MatchResult,
    NodeMatchResult,
)
from app.models.node import Node


def _normalize_title(title: str) -> str:
    """Normalize title for comparison.

    - Lowercase
    - Collapse whitespace
    - Strip leading/trailing whitespace
    """
    return re.sub(r"\s+", " ", title.lower().strip())


def _confidence_from_distance(distance: int, title_length: int) -> MatchConfidence:
    """Determine confidence based on edit distance and title length."""
    if distance == 0:
        return MatchConfidence.EXACT

    # For short titles, be stricter
    if title_length <= 5:
        if distance == 1:
            return MatchConfidence.HIGH
        elif distance == 2:
            return MatchConfidence.MEDIUM
        else:
            return MatchConfidence.NONE

    # For longer titles, allow more tolerance (relative to length)
    relative_distance = distance / title_length

    if distance <= 2 or relative_distance <= 0.1:
        return MatchConfidence.HIGH
    elif distance <= 4 or relative_distance <= 0.2:
        return MatchConfidence.MEDIUM
    else:
        return MatchConfidence.NONE


def _confidence_rank(confidence: MatchConfidence) -> int:
    """Convert confidence to numeric rank for comparison."""
    ranks = {
        MatchConfidence.EXACT: 4,
        MatchConfidence.HIGH: 3,
        MatchConfidence.MEDIUM: 2,
        MatchConfidence.NONE: 0,
    }
    return ranks.get(confidence, 0)


class NodeMatcher:
    """Matches incoming seed data against existing graph nodes."""

    def __init__(
        self,
        graph_store: GraphStore,
        workflow_id: str,
        fuzzy_threshold: MatchConfidence = MatchConfidence.MEDIUM,
    ):
        self.graph_store = graph_store
        self.workflow_id = workflow_id
        self.fuzzy_threshold = fuzzy_threshold

        # Cache: node_type -> list of existing nodes
        self._existing_nodes_cache: dict[str, list[Node]] = {}
        # Cache: (edge_type, from_id, to_id) -> edge_id
        self._existing_edges_cache: dict[tuple[str, str, str], str] = {}

    async def match_seed_data(self, seed_data: SeedData) -> MatchResult:
        """Match all nodes and edges in seed data against existing graph."""

        # Step 1: Load existing nodes by type (for types present in seed_data)
        await self._load_existing_nodes(seed_data)

        # Step 2: Match nodes
        node_matches: list[NodeMatchResult] = []
        temp_id_to_node_id: dict[str, str] = {}

        for seed_node in seed_data.nodes:
            match = await self._match_node(seed_node)
            node_matches.append(match)

            # Build temp_id mapping for matched nodes
            if match.decision in (MatchDecision.UPDATE, MatchDecision.SKIP):
                if match.matched_node_id:
                    temp_id_to_node_id[seed_node.temp_id] = match.matched_node_id
            # For CREATE, temp_id will be resolved after insertion

        # Step 3: Match edges (only if both endpoints resolve)
        await self._load_existing_edges(seed_data, temp_id_to_node_id)
        edge_matches: list[EdgeMatchResult] = []

        for seed_edge in seed_data.edges:
            match = await self._match_edge(seed_edge, temp_id_to_node_id)
            edge_matches.append(match)

        # Step 4: Build summary
        result = MatchResult(
            node_matches=node_matches,
            edge_matches=edge_matches,
            nodes_to_create=sum(
                1 for m in node_matches if m.decision == MatchDecision.CREATE
            ),
            nodes_to_update=sum(
                1 for m in node_matches if m.decision == MatchDecision.UPDATE
            ),
            nodes_to_skip=sum(
                1 for m in node_matches if m.decision == MatchDecision.SKIP
            ),
            edges_to_create=sum(
                1 for m in edge_matches if m.decision == MatchDecision.CREATE
            ),
            edges_to_skip=sum(
                1 for m in edge_matches if m.decision == MatchDecision.SKIP
            ),
            temp_id_to_node_id=temp_id_to_node_id,
        )

        return result

    async def _load_existing_nodes(self, seed_data: SeedData) -> None:
        """Pre-load all existing nodes for relevant types."""
        node_types = {node.node_type for node in seed_data.nodes}

        for node_type in node_types:
            if node_type not in self._existing_nodes_cache:
                nodes, _ = await self.graph_store.query_nodes(
                    self.workflow_id,
                    node_type=node_type,
                    limit=10000,  # Adjust based on expected graph size
                )
                self._existing_nodes_cache[node_type] = nodes

    async def _load_existing_edges(
        self,
        seed_data: SeedData,
        temp_id_to_node_id: dict[str, str],
    ) -> None:
        """Pre-load existing edges for matching."""
        # Get all edge types from seed data
        edge_types = {edge.edge_type for edge in seed_data.edges}

        for edge_type in edge_types:
            edges, _ = await self.graph_store.query_edges(
                self.workflow_id,
                edge_type=edge_type,
                limit=10000,
            )
            for edge in edges:
                key = (edge.type, edge.from_node_id, edge.to_node_id)
                self._existing_edges_cache[key] = edge.id

    async def _match_node(self, seed_node: SeedNode) -> NodeMatchResult:
        """Find best match for a seed node among existing nodes."""
        existing_nodes = self._existing_nodes_cache.get(seed_node.node_type, [])

        if not existing_nodes:
            return NodeMatchResult(
                temp_id=seed_node.temp_id,
                incoming_node_type=seed_node.node_type,
                incoming_title=seed_node.title,
                decision=MatchDecision.CREATE,
                confidence=MatchConfidence.NONE,
                match_reason="No existing nodes of this type",
            )

        # Normalize incoming title
        normalized_incoming = _normalize_title(seed_node.title)

        # Find best match
        best_match: Node | None = None
        best_confidence = MatchConfidence.NONE
        best_distance = float("inf")

        for existing in existing_nodes:
            normalized_existing = _normalize_title(existing.title)
            distance = _levenshtein_distance(normalized_incoming, normalized_existing)
            confidence = _confidence_from_distance(
                distance, max(len(normalized_incoming), len(normalized_existing))
            )

            # Check if this is a better match
            if _confidence_rank(confidence) > _confidence_rank(best_confidence):
                best_match = existing
                best_confidence = confidence
                best_distance = distance
            elif (
                _confidence_rank(confidence) == _confidence_rank(best_confidence)
                and distance < best_distance
            ):
                best_match = existing
                best_distance = distance

        # Determine decision based on confidence threshold
        if best_match and _confidence_rank(best_confidence) >= _confidence_rank(
            self.fuzzy_threshold
        ):
            # Check if properties differ
            props_to_update = self._compute_property_diff(
                best_match.properties,
                seed_node.properties,
            )
            unchanged = [k for k in seed_node.properties if k not in props_to_update]

            # Also check status change
            status_changed = (
                seed_node.status is not None and seed_node.status != best_match.status
            )

            if props_to_update or status_changed:
                return NodeMatchResult(
                    temp_id=seed_node.temp_id,
                    incoming_node_type=seed_node.node_type,
                    incoming_title=seed_node.title,
                    decision=MatchDecision.UPDATE,
                    confidence=best_confidence,
                    matched_node_id=best_match.id,
                    matched_node_title=best_match.title,
                    matched_node_properties=best_match.properties,
                    properties_to_update=props_to_update if props_to_update else None,
                    properties_unchanged=unchanged if unchanged else None,
                    match_reason=f"Title match (distance={int(best_distance)})",
                )
            else:
                return NodeMatchResult(
                    temp_id=seed_node.temp_id,
                    incoming_node_type=seed_node.node_type,
                    incoming_title=seed_node.title,
                    decision=MatchDecision.SKIP,
                    confidence=best_confidence,
                    matched_node_id=best_match.id,
                    matched_node_title=best_match.title,
                    match_reason="Duplicate (no property changes)",
                )

        return NodeMatchResult(
            temp_id=seed_node.temp_id,
            incoming_node_type=seed_node.node_type,
            incoming_title=seed_node.title,
            decision=MatchDecision.CREATE,
            confidence=best_confidence,
            match_reason="No sufficiently close match found",
        )

    async def _match_edge(
        self,
        seed_edge: SeedEdge,
        temp_id_to_node_id: dict[str, str],
    ) -> EdgeMatchResult:
        """Match a seed edge against existing edges."""
        from_id = temp_id_to_node_id.get(seed_edge.from_temp_id)
        to_id = temp_id_to_node_id.get(seed_edge.to_temp_id)

        # If either endpoint is CREATE (not in mapping), edge must be created
        if not from_id or not to_id:
            return EdgeMatchResult(
                edge_type=seed_edge.edge_type,
                from_temp_id=seed_edge.from_temp_id,
                to_temp_id=seed_edge.to_temp_id,
                decision=MatchDecision.CREATE,
                confidence=MatchConfidence.NONE,
                from_node_id=from_id,
                to_node_id=to_id,
                match_reason="One or both endpoints will be created",
            )

        # Check if edge already exists
        key = (seed_edge.edge_type, from_id, to_id)
        existing_edge_id = self._existing_edges_cache.get(key)

        if existing_edge_id:
            return EdgeMatchResult(
                edge_type=seed_edge.edge_type,
                from_temp_id=seed_edge.from_temp_id,
                to_temp_id=seed_edge.to_temp_id,
                decision=MatchDecision.SKIP,
                confidence=MatchConfidence.EXACT,
                from_node_id=from_id,
                to_node_id=to_id,
                matched_edge_id=existing_edge_id,
                match_reason="Edge already exists",
            )

        return EdgeMatchResult(
            edge_type=seed_edge.edge_type,
            from_temp_id=seed_edge.from_temp_id,
            to_temp_id=seed_edge.to_temp_id,
            decision=MatchDecision.CREATE,
            confidence=MatchConfidence.NONE,
            from_node_id=from_id,
            to_node_id=to_id,
            match_reason="New edge between existing nodes",
        )

    def _compute_property_diff(
        self,
        existing: dict[str, Any],
        incoming: dict[str, Any],
    ) -> dict[str, Any]:
        """Compute properties that differ between existing and incoming."""
        diff: dict[str, Any] = {}
        for key, value in incoming.items():
            if key not in existing or existing[key] != value:
                diff[key] = value
        return diff
