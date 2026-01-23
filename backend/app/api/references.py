"""External reference API routes.

Provides endpoints for managing external references (pointers), projections,
snapshots, and node-reference links.
"""

from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.connectors import ConnectorRegistry
from app.db import graph_store
from app.llm.context_gatherer import ContextGatherer
from app.models.context_pack import ContextPack, ContextPackRequest, ContextPackResponse
from app.models.external_reference import (
    ExternalReference,
    ExternalReferenceCreate,
    ExternalReferenceWithProjection,
    LinkReferenceRequest,
    NodeExternalRef,
    NodeExternalRefWithDetails,
    Projection,
    Snapshot,
    SnapshotCreate,
)

router = APIRouter()


# =============================================================================
# Response Models
# =============================================================================


class ReferencesResponse(BaseModel):
    """Response for reference list queries."""

    references: list[ExternalReference]
    total: int
    limit: int
    offset: int


class ResolveUrlRequest(BaseModel):
    """Request to resolve a URL to an external reference."""

    url: str


class ResolveUrlResponse(BaseModel):
    """Response with resolved reference and projection."""

    reference: ExternalReference
    projection: Projection | None = None
    is_new: bool = False


class RefreshProjectionResponse(BaseModel):
    """Response from refreshing a projection."""

    projection: Projection
    was_stale: bool
    changed: bool


class NodeRefsResponse(BaseModel):
    """Response with node's external references."""

    references: list[NodeExternalRefWithDetails]


class SnapshotsResponse(BaseModel):
    """Response for snapshot list queries."""

    snapshots: list[Snapshot]


# =============================================================================
# External References (Pointers)
# =============================================================================


@router.post("/references", response_model=ExternalReference)
async def create_reference(ref: ExternalReferenceCreate) -> ExternalReference:
    """Create or update an external reference.

    If a reference with the same system + external_id exists, it will be updated.
    """
    return await graph_store.create_reference(ref)


@router.get("/references/{reference_id}", response_model=ExternalReferenceWithProjection)
async def get_reference(reference_id: str) -> ExternalReferenceWithProjection:
    """Get an external reference by ID, including its projection."""
    ref = await graph_store.get_reference(reference_id)
    if ref is None:
        raise HTTPException(status_code=404, detail="Reference not found")

    # Get projection if exists
    projection = await graph_store.get_projection(reference_id)

    return ExternalReferenceWithProjection(
        **ref.model_dump(),
        projection=projection,
    )


@router.get("/references", response_model=ReferencesResponse)
async def list_references(
    system: str | None = Query(None, description="Filter by system"),
    object_type: str | None = Query(None, description="Filter by object type"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
) -> ReferencesResponse:
    """List external references with optional filters."""
    refs, total = await graph_store.query_references(
        system=system,
        object_type=object_type,
        limit=limit,
        offset=offset,
    )
    return ReferencesResponse(
        references=refs,
        total=total,
        limit=limit,
        offset=offset,
    )


@router.delete("/references/{reference_id}")
async def delete_reference(reference_id: str) -> dict[str, bool]:
    """Delete an external reference and associated data."""
    deleted = await graph_store.delete_reference(reference_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Reference not found")
    return {"deleted": True}


@router.post("/references/resolve", response_model=ResolveUrlResponse)
async def resolve_url(request: ResolveUrlRequest) -> ResolveUrlResponse:
    """Resolve a URL to an external reference.

    This endpoint:
    1. Identifies the appropriate connector for the URL
    2. Extracts the external ID and metadata
    3. Creates/updates the reference
    4. Optionally fetches and caches a projection
    """
    # Find connector that can handle this URL
    connector_class = ConnectorRegistry.get_for_url(request.url)
    if connector_class is None:
        raise HTTPException(
            status_code=400,
            detail=f"No connector available for URL: {request.url}",
        )

    try:
        connector = connector_class()
        ref_create = await connector.identify(request.url)
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to identify URL: {str(e)}",
        )

    # Check if reference already exists
    existing = await graph_store.get_reference_by_external_id(
        ref_create.system, ref_create.external_id
    )
    is_new = existing is None

    # Create/update the reference
    ref = await graph_store.create_reference(ref_create)

    # Try to fetch projection with content to get summary
    projection = None
    try:
        proj_create, _ = await connector.read(ref, include_content=True)
        if proj_create:
            projection = await graph_store.upsert_projection(proj_create)
    except Exception:
        # Projection fetch is optional
        pass

    return ResolveUrlResponse(
        reference=ref,
        projection=projection,
        is_new=is_new,
    )


# =============================================================================
# Projections
# =============================================================================


@router.post("/references/{reference_id}/refresh", response_model=RefreshProjectionResponse)
async def refresh_projection(reference_id: str) -> RefreshProjectionResponse:
    """Force refresh the projection for an external reference."""
    ref = await graph_store.get_reference(reference_id)
    if ref is None:
        raise HTTPException(status_code=404, detail="Reference not found")

    # Get current projection to check staleness
    current_proj = await graph_store.get_projection(reference_id)
    was_stale = current_proj.is_stale if current_proj else True
    old_hash = current_proj.content_hash if current_proj else None

    # Find and use connector
    connector_class = ConnectorRegistry.get(ref.system)
    if connector_class is None:
        raise HTTPException(
            status_code=400,
            detail=f"No connector for system: {ref.system}",
        )

    try:
        connector = connector_class()

        # Force full fetch if summary is missing, otherwise use conditional fetch
        needs_content = not current_proj or current_proj.summary is None
        if_none_match = None if needs_content else (ref.version if not was_stale else None)
        proj_create, _ = await connector.read(
            ref, include_content=True, if_none_match=if_none_match
        )

        if proj_create is None:
            # 304 Not Modified - just extend staleness
            if current_proj:
                from datetime import datetime, timedelta
                current_proj.stale_after = (
                    datetime.utcnow() +
                    timedelta(seconds=current_proj.freshness_slo_seconds)
                )
                # Would need to update in DB - simplified here
                return RefreshProjectionResponse(
                    projection=current_proj,
                    was_stale=was_stale,
                    changed=False,
                )

        # Update projection
        projection = await graph_store.upsert_projection(proj_create)
        changed = projection.content_hash != old_hash if old_hash else True

        return RefreshProjectionResponse(
            projection=projection,
            was_stale=was_stale,
            changed=changed,
        )

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to refresh projection: {str(e)}",
        )


@router.get("/references/{reference_id}/projection", response_model=Projection | None)
async def get_projection(reference_id: str) -> Projection | None:
    """Get the cached projection for an external reference."""
    return await graph_store.get_projection(reference_id)


# =============================================================================
# Snapshots
# =============================================================================


@router.post("/references/{reference_id}/snapshot", response_model=Snapshot)
async def create_snapshot(
    reference_id: str,
    captured_by: str | None = Query(None),
    capture_reason: str = Query("manual"),
) -> Snapshot:
    """Create an immutable snapshot of the external content."""
    ref = await graph_store.get_reference(reference_id)
    if ref is None:
        raise HTTPException(status_code=404, detail="Reference not found")

    # Find and use connector to fetch content
    connector_class = ConnectorRegistry.get(ref.system)
    if connector_class is None:
        raise HTTPException(
            status_code=400,
            detail=f"No connector for system: {ref.system}",
        )

    try:
        from app.connectors.base import BaseConnector
        from app.models.external_reference import CaptureReason

        connector = connector_class()
        _, content = await connector.read(ref, include_content=True)

        if content is None:
            raise HTTPException(
                status_code=400,
                detail="No content available for snapshot",
            )

        # Compute content hash
        content_hash = BaseConnector.compute_content_hash(content)

        # Create snapshot
        snapshot_create = SnapshotCreate(
            reference_id=reference_id,
            content_type="text/plain",  # Would detect from content
            content_inline=content.decode("utf-8") if len(content) < 100000 else None,
            content_path=None,  # Would store large content to file
            content_hash=content_hash,
            captured_by=captured_by,
            capture_reason=CaptureReason(capture_reason),
            source_version=ref.version,
        )

        return await graph_store.create_snapshot(snapshot_create)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create snapshot: {str(e)}",
        )


@router.get("/references/{reference_id}/snapshots", response_model=SnapshotsResponse)
async def list_snapshots(
    reference_id: str,
    limit: int = Query(10, ge=1, le=100),
) -> SnapshotsResponse:
    """List snapshots for an external reference."""
    ref = await graph_store.get_reference(reference_id)
    if ref is None:
        raise HTTPException(status_code=404, detail="Reference not found")

    snapshots = await graph_store.get_snapshots_for_reference(reference_id, limit)
    return SnapshotsResponse(snapshots=snapshots)


@router.get("/snapshots/{snapshot_id}", response_model=Snapshot)
async def get_snapshot(snapshot_id: str) -> Snapshot:
    """Get a snapshot by ID."""
    snapshot = await graph_store.get_snapshot(snapshot_id)
    if snapshot is None:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return snapshot


# =============================================================================
# Node ↔ Reference Links
# =============================================================================


@router.post(
    "/workflows/{workflow_id}/nodes/{node_id}/refs",
    response_model=NodeExternalRef,
)
async def link_node_reference(
    workflow_id: str,
    node_id: str,
    link: LinkReferenceRequest,
) -> NodeExternalRef:
    """Link an external reference to a workflow node."""
    # Verify node exists
    node = await graph_store.get_node(workflow_id, node_id)
    if node is None:
        raise HTTPException(status_code=404, detail="Node not found")

    # Verify reference exists
    ref = await graph_store.get_reference(link.reference_id)
    if ref is None:
        raise HTTPException(status_code=404, detail="Reference not found")

    return await graph_store.link_node_reference(
        workflow_id=workflow_id,
        node_id=node_id,
        reference_id=link.reference_id,
        relationship=link.relationship.value,
        added_by=link.added_by,
    )


@router.get(
    "/workflows/{workflow_id}/nodes/{node_id}/refs",
    response_model=NodeRefsResponse,
)
async def get_node_references(
    workflow_id: str,
    node_id: str,
) -> NodeRefsResponse:
    """Get all external references linked to a node."""
    # Verify node exists
    node = await graph_store.get_node(workflow_id, node_id)
    if node is None:
        raise HTTPException(status_code=404, detail="Node not found")

    refs = await graph_store.get_node_references(workflow_id, node_id)
    return NodeRefsResponse(references=refs)


@router.delete("/workflows/{workflow_id}/nodes/{node_id}/refs/{reference_id}")
async def unlink_node_reference(
    workflow_id: str,
    node_id: str,
    reference_id: str,
) -> dict[str, bool]:
    """Remove link between a node and external reference."""
    deleted = await graph_store.unlink_node_reference(node_id, reference_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Link not found")
    return {"deleted": True}


# =============================================================================
# Context Packs
# =============================================================================


@router.post(
    "/workflows/{workflow_id}/nodes/{node_id}/context-pack",
    response_model=ContextPackResponse,
)
async def build_context_pack(
    workflow_id: str,
    node_id: str,
    request: ContextPackRequest | None = None,
) -> ContextPackResponse:
    """Build a context pack for AI consumption.

    This endpoint gathers context from the graph, including external references,
    and produces an auditable context pack with provenance tracking.
    """
    # Verify node exists
    node = await graph_store.get_node(workflow_id, node_id)
    if node is None:
        raise HTTPException(status_code=404, detail="Node not found")

    gatherer = ContextGatherer(graph_store)

    try:
        response = await gatherer.build_context_pack(
            workflow_id=workflow_id,
            source_node_id=node_id,
            request=request,
        )
        return response
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/context-packs/{pack_id}", response_model=ContextPack)
async def get_context_pack(pack_id: str) -> ContextPack:
    """Retrieve a stored context pack by ID."""
    pack = await graph_store.get_context_pack(pack_id)
    if pack is None:
        raise HTTPException(status_code=404, detail="Context pack not found")
    return pack


# =============================================================================
# Connector Discovery
# =============================================================================


@router.get("/connectors")
async def list_connectors() -> dict[str, Any]:
    """List available connectors and their capabilities."""
    connectors = []
    for system in ConnectorRegistry.list_systems():
        connector_class = ConnectorRegistry.get(system)
        if connector_class:
            connectors.append({
                "system": system,
                "supported_types": connector_class.supported_types,
                "url_patterns": connector_class.url_patterns,
            })

    return {"connectors": connectors}
