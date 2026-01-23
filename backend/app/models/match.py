"""Data models for node/edge matching results.

These models represent the results of matching incoming delta (SeedData)
against existing graph structures to determine create/update/skip decisions.
"""

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class MatchConfidence(str, Enum):
    """Confidence level for a match."""

    EXACT = "exact"  # Perfect title match (case-insensitive)
    HIGH = "high"  # Levenshtein distance 1-2
    MEDIUM = "medium"  # Levenshtein distance 3-4
    NONE = "none"  # No match found


class MatchDecision(str, Enum):
    """What action to take for this item."""

    CREATE = "create"  # New node/edge to insert
    UPDATE = "update"  # Match found, will update
    SKIP = "skip"  # Duplicate, no action needed


class NodeMatchResult(BaseModel):
    """Result of matching a single SeedNode against existing nodes."""

    temp_id: str = Field(description="The incoming node's temp_id")
    incoming_node_type: str
    incoming_title: str

    decision: MatchDecision
    confidence: MatchConfidence

    # If matched (UPDATE or SKIP)
    matched_node_id: str | None = None
    matched_node_title: str | None = None
    matched_node_properties: dict[str, Any] | None = None

    # Diff information (for UPDATE)
    properties_to_update: dict[str, Any] | None = None
    properties_unchanged: list[str] | None = None

    # Match explanation
    match_reason: str | None = None


class EdgeMatchResult(BaseModel):
    """Result of matching a single SeedEdge against existing edges."""

    edge_type: str
    from_temp_id: str
    to_temp_id: str

    decision: MatchDecision
    confidence: MatchConfidence

    # Resolved node IDs (from temp_id mapping)
    from_node_id: str | None = None
    to_node_id: str | None = None

    # If matched
    matched_edge_id: str | None = None

    match_reason: str | None = None


class MatchResult(BaseModel):
    """Complete match analysis for a SeedData delta."""

    node_matches: list[NodeMatchResult]
    edge_matches: list[EdgeMatchResult]

    # Summary counts
    nodes_to_create: int = 0
    nodes_to_update: int = 0
    nodes_to_skip: int = 0
    edges_to_create: int = 0
    edges_to_skip: int = 0

    # Mapping from temp_id to resolved node_id (for UI and edge resolution)
    temp_id_to_node_id: dict[str, str] = Field(default_factory=dict)
