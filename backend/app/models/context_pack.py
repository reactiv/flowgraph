"""Context pack models for AI context generation with provenance.

A context pack is an auditable bundle of resources gathered for AI consumption,
including full provenance tracking (what was fetched, when, how).
"""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.models.external_reference import Projection, RetrievalMode


class ContextResource(BaseModel):
    """Single resource included in a context pack."""

    # Identity
    reference_id: str | None = Field(None, description="External reference ID (if external)")
    node_id: str | None = Field(None, description="Workflow node ID (if internal)")
    node_type: str | None = Field(None, description="Workflow node type (e.g., 'Sample', 'Analysis')")

    # Data included
    title: str | None = Field(None, description="Display title")
    content: str | None = Field(None, description="Text content for AI")
    properties: dict[str, Any] = Field(
        default_factory=dict, description="Structured properties"
    )

    # Projection data (if external)
    projection: Projection | None = Field(None, description="Cached projection data")
    snapshot_id: str | None = Field(None, description="Snapshot ID if snapshot was used")

    # Provenance
    retrieval_mode: RetrievalMode = Field(
        RetrievalMode.CACHED, description="How data was retrieved"
    )
    fetched_at: datetime | None = Field(None, description="When data was fetched")
    version: str | None = Field(None, description="Version/ETag at fetch time")
    is_stale: bool = Field(False, description="Whether data was stale when gathered")

    # Traversal context
    path_name: str = Field(..., description="ContextPath that included this resource")
    hop_depth: int = Field(0, description="Distance from source node")

    @property
    def is_external(self) -> bool:
        """Check if this resource is from an external system."""
        return self.reference_id is not None

    @property
    def is_internal(self) -> bool:
        """Check if this resource is an internal node."""
        return self.node_id is not None and self.reference_id is None


class ContextPackCreate(BaseModel):
    """Create a new context pack."""

    workflow_id: str = Field(..., description="Workflow ID")
    source_node_id: str = Field(..., description="Source node for traversal")
    traversal_rule: str | None = Field(None, description="ContextSelector name/ID used")
    resources: list[ContextResource] = Field(
        default_factory=list, description="Gathered resources"
    )


class ContextPack(ContextPackCreate):
    """Auditable context bundle for AI consumption."""

    id: str = Field(..., description="Platform-issued pack ID")
    created_at: datetime = Field(..., description="When pack was created")

    # Freshness summary
    oldest_projection: datetime | None = Field(
        None, description="Oldest projection timestamp"
    )
    any_stale: bool = Field(False, description="Whether any resources were stale")

    # Token estimation
    estimated_tokens: int = Field(0, description="Estimated token count")

    model_config = {"from_attributes": True}

    def compute_freshness_summary(self) -> None:
        """Compute freshness summary from resources."""
        oldest = None
        any_stale = False

        for resource in self.resources:
            if resource.is_stale:
                any_stale = True
            if resource.fetched_at:
                if oldest is None or resource.fetched_at < oldest:
                    oldest = resource.fetched_at

        self.oldest_projection = oldest
        self.any_stale = any_stale

    def to_prompt_text(self, include_provenance: bool = False) -> str:
        """Convert context pack to text suitable for LLM prompt.

        Args:
            include_provenance: Whether to include provenance metadata

        Returns:
            Formatted text for LLM consumption
        """
        lines = []

        # Group resources by path
        by_path: dict[str, list[ContextResource]] = {}
        for resource in self.resources:
            if resource.path_name not in by_path:
                by_path[resource.path_name] = []
            by_path[resource.path_name].append(resource)

        for path_name, path_resources in by_path.items():
            lines.append(f"## {path_name}")
            lines.append("")

            for resource in sorted(path_resources, key=lambda r: r.hop_depth):
                # Title
                title = resource.title or "Untitled"
                prefix = "  " * resource.hop_depth
                lines.append(f"{prefix}### {title}")

                # Provenance (optional)
                if include_provenance:
                    if resource.is_external:
                        lines.append(f"{prefix}*Source: external ({resource.reference_id})*")
                    else:
                        lines.append(f"{prefix}*Source: node ({resource.node_id})*")
                    if resource.fetched_at:
                        lines.append(f"{prefix}*Fetched: {resource.fetched_at.isoformat()}*")
                    if resource.is_stale:
                        lines.append(f"{prefix}*Warning: Data may be stale*")
                    lines.append("")

                # Content
                if resource.content:
                    lines.append(f"{prefix}{resource.content}")
                    lines.append("")

                # Properties
                if resource.properties:
                    for key, value in resource.properties.items():
                        lines.append(f"{prefix}- **{key}**: {value}")
                    lines.append("")

        return "\n".join(lines)

    def get_stale_resources(self) -> list[ContextResource]:
        """Get list of resources that were stale when gathered."""
        return [r for r in self.resources if r.is_stale]

    def get_external_resources(self) -> list[ContextResource]:
        """Get list of external resources."""
        return [r for r in self.resources if r.is_external]

    def get_internal_resources(self) -> list[ContextResource]:
        """Get list of internal node resources."""
        return [r for r in self.resources if r.is_internal]


class ContextPackRequest(BaseModel):
    """Request to build a context pack."""

    selector_name: str | None = Field(
        None, description="Named ContextSelector to use"
    )
    selector_json: dict[str, Any] | None = Field(
        None, description="Inline ContextSelector definition"
    )
    require_fresh: bool = Field(
        False, description="Whether to require all resources be fresh"
    )
    refresh_stale: bool = Field(
        True, description="Whether to refresh stale projections"
    )
    include_snapshots: bool = Field(
        False, description="Whether to include/create snapshots"
    )
    max_tokens: int | None = Field(
        None, description="Maximum estimated tokens to include"
    )


class ContextPackResponse(BaseModel):
    """Response from context pack generation."""

    pack: ContextPack = Field(..., description="Generated context pack")
    warnings: list[str] = Field(
        default_factory=list, description="Warnings (e.g., stale data)"
    )
    refreshed_count: int = Field(0, description="Number of projections refreshed")
    skipped_count: int = Field(0, description="Number of resources skipped (e.g., token limit)")
