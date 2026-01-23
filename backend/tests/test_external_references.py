"""Tests for external references (Pointer/Projection/Snapshot model)."""

import pytest
from datetime import datetime, timedelta

from app.models.external_reference import (
    ExternalReference,
    ExternalReferenceCreate,
    Projection,
    ProjectionCreate,
    RetrievalMode,
    VersionType,
    get_default_freshness_slo,
)


class TestExternalReferenceModels:
    """Tests for ExternalReference model."""

    def test_create_reference(self):
        """Test creating an external reference."""
        ref = ExternalReferenceCreate(
            system="notion",
            object_type="page",
            external_id="abc123",
            canonical_url="https://notion.so/abc123",
            display_name="Test Page",
            version="2024-01-15T10:00:00Z",
            version_type=VersionType.TIMESTAMP,
        )

        assert ref.system == "notion"
        assert ref.object_type == "page"
        assert ref.external_id == "abc123"
        assert ref.version_type == VersionType.TIMESTAMP

    def test_reference_with_defaults(self):
        """Test reference with default values."""
        ref = ExternalReferenceCreate(
            system="gdrive",
            object_type="file",
            external_id="file123",
        )

        assert ref.canonical_url is None
        assert ref.version is None
        assert ref.version_type == VersionType.ETAG

    def test_full_reference(self):
        """Test full ExternalReference with all fields."""
        now = datetime.utcnow()
        ref = ExternalReference(
            id="ref-123",
            system="notion",
            object_type="page",
            external_id="abc123",
            canonical_url="https://notion.so/abc123",
            version="v1",
            version_type=VersionType.ETAG,
            display_name="Test",
            created_at=now,
            last_seen_at=now,
        )

        assert ref.id == "ref-123"
        assert ref.created_at == now


class TestProjectionModels:
    """Tests for Projection model."""

    def test_create_projection(self):
        """Test creating a projection."""
        proj = ProjectionCreate(
            reference_id="ref-123",
            title="Test Document",
            status="active",
            owner="user@example.com",
            summary="A test document summary",
            properties={"key": "value"},
            relationships=["ref-456"],
            freshness_slo_seconds=3600,
            retrieval_mode=RetrievalMode.CONDITIONAL,
        )

        assert proj.reference_id == "ref-123"
        assert proj.title == "Test Document"
        assert proj.freshness_slo_seconds == 3600
        assert proj.retrieval_mode == RetrievalMode.CONDITIONAL

    def test_projection_freshness(self):
        """Test projection freshness properties."""
        now = datetime.utcnow()
        proj = Projection(
            id="proj-123",
            reference_id="ref-123",
            title="Test",
            properties={},
            relationships=[],
            fetched_at=now,
            stale_after=now + timedelta(hours=1),
            freshness_slo_seconds=3600,
            retrieval_mode=RetrievalMode.CACHED,
        )

        assert proj.is_fresh
        assert not proj.is_stale
        assert proj.freshness_slo == timedelta(seconds=3600)

    def test_projection_stale(self):
        """Test stale projection detection."""
        now = datetime.utcnow()
        proj = Projection(
            id="proj-123",
            reference_id="ref-123",
            title="Test",
            properties={},
            relationships=[],
            fetched_at=now - timedelta(hours=2),
            stale_after=now - timedelta(hours=1),
            freshness_slo_seconds=3600,
            retrieval_mode=RetrievalMode.CACHED,
        )

        assert proj.is_stale
        assert not proj.is_fresh


class TestFreshnessSLO:
    """Tests for freshness SLO defaults."""

    def test_default_document_slo(self):
        """Test default SLO for documents."""
        slo_seconds, mode = get_default_freshness_slo("notion", "document")
        assert slo_seconds == 3600  # 1 hour
        assert mode == RetrievalMode.CACHED

    def test_default_task_slo(self):
        """Test default SLO for tasks."""
        slo_seconds, mode = get_default_freshness_slo("*", "task")
        assert slo_seconds == 900  # 15 minutes
        assert mode == RetrievalMode.CONDITIONAL

    def test_default_unknown_type(self):
        """Test fallback SLO for unknown types."""
        slo_seconds, mode = get_default_freshness_slo("unknown", "unknown")
        assert slo_seconds == 3600  # Default 1 hour
        assert mode == RetrievalMode.CACHED

    def test_machine_status_slo(self):
        """Test SLO for real-time data."""
        slo_seconds, mode = get_default_freshness_slo("*", "machine_status")
        assert slo_seconds == 30  # 30 seconds
        assert mode == RetrievalMode.FORCED


class TestRetrievalModes:
    """Tests for retrieval mode enum."""

    def test_retrieval_modes(self):
        """Test all retrieval modes exist."""
        assert RetrievalMode.CACHED.value == "cached"
        assert RetrievalMode.CONDITIONAL.value == "conditional"
        assert RetrievalMode.FORCED.value == "forced"

    def test_version_types(self):
        """Test all version types exist."""
        assert VersionType.ETAG.value == "etag"
        assert VersionType.REVISION.value == "revision"
        assert VersionType.SHA.value == "sha"
        assert VersionType.TIMESTAMP.value == "timestamp"
