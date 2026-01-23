"""External reference models for the three-layer data strategy.

This module implements the Pointer/Projection/Snapshot model for external system integration:
- ExternalReference (Pointer): Durable link to external object
- Projection: Cached partial copy optimized for traversal + AI
- Snapshot: Immutable copy for audit and reproducibility
"""

from datetime import datetime, timedelta
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class VersionType(str, Enum):
    """Type of version identifier used by external system."""

    ETAG = "etag"
    REVISION = "revision"
    SHA = "sha"
    TIMESTAMP = "timestamp"


class RetrievalMode(str, Enum):
    """How to retrieve data from external system."""

    CACHED = "cached"  # Use cached projection, no remote call
    CONDITIONAL = "conditional"  # Use ETag/If-Modified-Since
    FORCED = "forced"  # Always fetch fresh data


class ReferenceRelationship(str, Enum):
    """How a node relates to an external reference."""

    SOURCE = "source"  # Node was created from this reference
    RELATED = "related"  # Node is related to this reference
    DERIVED_FROM = "derived_from"  # Node data derived from reference


class CaptureReason(str, Enum):
    """Why a snapshot was captured."""

    WORKFLOW_EXECUTION = "workflow_execution"
    MANUAL = "manual"
    SCHEDULED = "scheduled"


# =============================================================================
# Pointer Layer: ExternalReference
# =============================================================================


class ExternalReferenceCreate(BaseModel):
    """Create a new external reference (pointer)."""

    system: str = Field(..., description="System identifier (notion, gdrive, github)")
    object_type: str = Field(..., description="Object type (page, file, issue)")
    external_id: str = Field(..., description="System's native identifier")
    canonical_url: str | None = Field(None, description="Deeplink for navigation")
    version: str | None = Field(None, description="ETag, revision, or commit SHA")
    version_type: VersionType = Field(VersionType.ETAG, description="Type of version")
    display_name: str | None = Field(None, description="Human-readable name")


class ExternalReference(ExternalReferenceCreate):
    """Durable link to an external object without copying content."""

    id: str = Field(..., description="Platform-issued reference ID")
    created_at: datetime = Field(..., description="When reference was created")
    last_seen_at: datetime = Field(..., description="Last time we verified existence")

    model_config = {"from_attributes": True}


class ExternalReferenceWithProjection(ExternalReference):
    """External reference with its cached projection."""

    projection: "Projection | None" = None


# =============================================================================
# Projection Layer: Cached Fields
# =============================================================================


class ProjectionCreate(BaseModel):
    """Create/update a projection for an external reference."""

    reference_id: str = Field(..., description="FK to ExternalReference")

    # Normalized cached fields
    title: str | None = Field(None, description="Display title")
    status: str | None = Field(None, description="Current status")
    owner: str | None = Field(None, description="Owner/assignee")
    summary: str | None = Field(None, description="Short text for RAG/embeddings")
    properties: dict[str, Any] = Field(
        default_factory=dict, description="Additional key fields"
    )
    relationships: list[str] = Field(
        default_factory=list, description="IDs of related external references"
    )

    # Freshness configuration
    freshness_slo_seconds: int = Field(
        3600, description="Target freshness in seconds (default 1 hour)"
    )
    retrieval_mode: RetrievalMode = Field(
        RetrievalMode.CACHED, description="How to retrieve data"
    )


class Projection(ProjectionCreate):
    """Normalized partial copy optimized for graph traversal and AI."""

    id: str = Field(..., description="Platform-issued projection ID")
    fetched_at: datetime = Field(..., description="When projection was last fetched")
    stale_after: datetime = Field(..., description="When projection expires")
    content_hash: str | None = Field(
        None, description="Hash of fields for change detection"
    )

    model_config = {"from_attributes": True}

    @property
    def freshness_slo(self) -> timedelta:
        """Return freshness SLO as timedelta."""
        return timedelta(seconds=self.freshness_slo_seconds)

    @property
    def is_fresh(self) -> bool:
        """Check if projection is still fresh."""
        return datetime.utcnow() < self.stale_after

    @property
    def is_stale(self) -> bool:
        """Check if projection needs refresh."""
        return not self.is_fresh


class ProjectionUpdate(BaseModel):
    """Update fields on an existing projection."""

    title: str | None = None
    status: str | None = None
    owner: str | None = None
    summary: str | None = None
    properties: dict[str, Any] | None = None
    relationships: list[str] | None = None
    freshness_slo_seconds: int | None = None
    retrieval_mode: RetrievalMode | None = None


# =============================================================================
# Snapshot Layer: Immutable Copies
# =============================================================================


class SnapshotCreate(BaseModel):
    """Create an immutable snapshot of external content."""

    reference_id: str = Field(..., description="FK to ExternalReference")
    content_type: str = Field(..., description="MIME type")
    content_path: str | None = Field(None, description="Path to stored file")
    content_inline: str | None = Field(None, description="Inline content for small text")
    content_hash: str = Field(..., description="SHA-256 for integrity")
    captured_by: str | None = Field(None, description="User/system that triggered")
    capture_reason: CaptureReason = Field(
        CaptureReason.MANUAL, description="Why captured"
    )
    source_version: str | None = Field(None, description="Version at capture time")


class Snapshot(SnapshotCreate):
    """Immutable artifact for audit and reproducibility."""

    id: str = Field(..., description="Platform-issued snapshot ID")
    captured_at: datetime = Field(..., description="When snapshot was taken")

    model_config = {"from_attributes": True}


# =============================================================================
# Node ↔ Reference Links
# =============================================================================


class LinkReferenceRequest(BaseModel):
    """API request to link a reference to a node."""

    reference_id: str = Field(..., description="External reference ID")
    relationship: ReferenceRelationship = Field(
        ReferenceRelationship.SOURCE, description="How node relates to reference"
    )
    added_by: str | None = Field(None, description="User who created the link")


class NodeExternalRefCreate(BaseModel):
    """Link a workflow node to an external reference."""

    node_id: str = Field(..., description="Workflow node ID")
    reference_id: str = Field(..., description="External reference ID")
    relationship: ReferenceRelationship = Field(
        ReferenceRelationship.SOURCE, description="How node relates to reference"
    )
    added_by: str | None = Field(None, description="User who created the link")


class NodeExternalRef(NodeExternalRefCreate):
    """Link between a workflow node and an external reference."""

    workflow_id: str = Field(..., description="Workflow containing the node")
    added_at: datetime = Field(..., description="When link was created")

    model_config = {"from_attributes": True}


class NodeExternalRefWithDetails(NodeExternalRef):
    """Node-reference link with full reference details."""

    reference: ExternalReferenceWithProjection


# =============================================================================
# Freshness Configuration
# =============================================================================


class FreshnessSLO(BaseModel):
    """Freshness service level objective for an object type."""

    system: str = Field(..., description="System identifier")
    object_type: str = Field(..., description="Object type")
    slo_seconds: int = Field(..., description="Target freshness in seconds")
    retrieval_mode: RetrievalMode = Field(..., description="Default retrieval mode")
    description: str | None = None


# Default freshness SLOs by object type
DEFAULT_FRESHNESS_SLOS: list[FreshnessSLO] = [
    FreshnessSLO(
        system="*",
        object_type="machine_status",
        slo_seconds=30,
        retrieval_mode=RetrievalMode.FORCED,
        description="Real-time operational data",
    ),
    FreshnessSLO(
        system="*",
        object_type="work_order",
        slo_seconds=300,
        retrieval_mode=RetrievalMode.CONDITIONAL,
        description="Frequently updated",
    ),
    FreshnessSLO(
        system="*",
        object_type="task",
        slo_seconds=900,
        retrieval_mode=RetrievalMode.CONDITIONAL,
        description="Moderate change frequency",
    ),
    FreshnessSLO(
        system="*",
        object_type="issue",
        slo_seconds=900,
        retrieval_mode=RetrievalMode.CONDITIONAL,
        description="Moderate change frequency",
    ),
    FreshnessSLO(
        system="*",
        object_type="document",
        slo_seconds=3600,
        retrieval_mode=RetrievalMode.CACHED,
        description="Slow-changing",
    ),
    FreshnessSLO(
        system="*",
        object_type="page",
        slo_seconds=3600,
        retrieval_mode=RetrievalMode.CACHED,
        description="Slow-changing",
    ),
    FreshnessSLO(
        system="*",
        object_type="file",
        slo_seconds=3600,
        retrieval_mode=RetrievalMode.CACHED,
        description="Slow-changing",
    ),
    FreshnessSLO(
        system="*",
        object_type="spec",
        slo_seconds=86400,
        retrieval_mode=RetrievalMode.CACHED,
        description="Released specs rarely change",
    ),
]


def get_default_freshness_slo(
    system: str, object_type: str
) -> tuple[int, RetrievalMode]:
    """Get default freshness SLO for an object type.

    Returns:
        Tuple of (slo_seconds, retrieval_mode)
    """
    # First try exact match
    for slo in DEFAULT_FRESHNESS_SLOS:
        if slo.system == system and slo.object_type == object_type:
            return slo.slo_seconds, slo.retrieval_mode

    # Then try wildcard system match
    for slo in DEFAULT_FRESHNESS_SLOS:
        if slo.system == "*" and slo.object_type == object_type:
            return slo.slo_seconds, slo.retrieval_mode

    # Default: 1 hour, cached
    return 3600, RetrievalMode.CACHED
