"""Tests for connector infrastructure."""

import pytest
from datetime import datetime

from app.connectors.base import (
    BaseConnector,
    ConnectorError,
    ConnectorRegistry,
    NotFoundError,
    AuthenticationError,
    RateLimitError,
)
from app.models.external_reference import (
    ExternalReference,
    ExternalReferenceCreate,
    ProjectionCreate,
    RetrievalMode,
    VersionType,
)


class MockConnector(BaseConnector):
    """Mock connector for testing."""

    system = "mock"
    supported_types = ["document", "folder"]
    url_patterns = [r"https?://mock\.example\.com/.*"]

    async def identify(self, url_or_id: str) -> ExternalReferenceCreate:
        if "notfound" in url_or_id:
            raise NotFoundError("Not found", system=self.system)
        return ExternalReferenceCreate(
            system=self.system,
            object_type="document",
            external_id=url_or_id.split("/")[-1],
            canonical_url=url_or_id,
            display_name="Mock Document",
        )

    async def read(
        self,
        reference: ExternalReference,
        include_content: bool = False,
        if_none_match: str | None = None,
    ) -> tuple[ProjectionCreate | None, bytes | None]:
        # Simulate conditional fetch
        if if_none_match and if_none_match == reference.version:
            return None, None

        proj = ProjectionCreate(
            reference_id=reference.id,
            title="Mock Title",
            status="active",
            owner="test@example.com",
            properties={"key": "value"},
            relationships=[],
        )

        content = b"Mock content" if include_content else None
        return proj, content

    async def list_changes(
        self,
        since: datetime | str | None = None,
        object_types: list[str] | None = None,
        limit: int = 100,
    ) -> list[ExternalReferenceCreate]:
        return [
            ExternalReferenceCreate(
                system=self.system,
                object_type="document",
                external_id="changed-1",
                display_name="Changed Document",
            )
        ]


class TestConnectorRegistry:
    """Tests for ConnectorRegistry."""

    def setup_method(self):
        """Clear registry before each test."""
        ConnectorRegistry._connectors.clear()

    def test_register_connector(self):
        """Test registering a connector."""
        ConnectorRegistry.register(MockConnector)

        assert "mock" in ConnectorRegistry.list_systems()
        assert ConnectorRegistry.get("mock") == MockConnector

    def test_get_unknown_connector(self):
        """Test getting unknown connector returns None."""
        assert ConnectorRegistry.get("unknown") is None

    def test_get_for_url(self):
        """Test finding connector by URL pattern."""
        ConnectorRegistry.register(MockConnector)

        connector = ConnectorRegistry.get_for_url("https://mock.example.com/doc/123")
        assert connector == MockConnector

        # Unknown URL
        connector = ConnectorRegistry.get_for_url("https://unknown.com/doc")
        assert connector is None

    def test_list_connectors(self):
        """Test listing all connectors."""
        ConnectorRegistry.register(MockConnector)

        connectors = ConnectorRegistry.list_connectors()
        assert MockConnector in connectors


class TestBaseConnector:
    """Tests for BaseConnector methods."""

    def test_matches_url(self):
        """Test URL matching."""
        connector = MockConnector()

        assert connector.matches_url("https://mock.example.com/doc/123")
        assert connector.matches_url("http://mock.example.com/folder")
        assert not connector.matches_url("https://other.com/doc")

    def test_compute_content_hash(self):
        """Test content hash computation."""
        hash1 = BaseConnector.compute_content_hash(b"hello world")
        hash2 = BaseConnector.compute_content_hash("hello world")

        assert hash1 == hash2
        assert len(hash1) == 64  # SHA-256 hex

    def test_compute_projection_hash(self):
        """Test projection hash computation."""
        proj = ProjectionCreate(
            reference_id="ref-1",
            title="Test",
            status="active",
            properties={"key": "value"},
            relationships=[],
        )

        hash1 = BaseConnector.compute_projection_hash(proj)
        assert len(hash1) == 16  # Truncated hash

        # Same content should produce same hash
        proj2 = ProjectionCreate(
            reference_id="ref-2",  # Different ref_id shouldn't affect hash
            title="Test",
            status="active",
            properties={"key": "value"},
            relationships=[],
        )
        hash2 = BaseConnector.compute_projection_hash(proj2)
        assert hash1 == hash2

    def test_create_projection_helper(self):
        """Test create_projection helper method."""
        connector = MockConnector()

        proj = connector.create_projection(
            reference_id="ref-123",
            title="Test Doc",
            status="draft",
            properties={"foo": "bar"},
        )

        assert proj.reference_id == "ref-123"
        assert proj.title == "Test Doc"
        assert proj.freshness_slo_seconds > 0


class TestMockConnector:
    """Tests for MockConnector implementation."""

    @pytest.mark.asyncio
    async def test_identify(self):
        """Test identify method."""
        connector = MockConnector()

        ref = await connector.identify("https://mock.example.com/doc/abc123")

        assert ref.system == "mock"
        assert ref.object_type == "document"
        assert ref.external_id == "abc123"

    @pytest.mark.asyncio
    async def test_identify_not_found(self):
        """Test identify with not found error."""
        connector = MockConnector()

        with pytest.raises(NotFoundError):
            await connector.identify("https://mock.example.com/notfound/123")

    @pytest.mark.asyncio
    async def test_read(self):
        """Test read method."""
        connector = MockConnector()
        now = datetime.utcnow()

        ref = ExternalReference(
            id="ref-123",
            system="mock",
            object_type="document",
            external_id="doc-456",
            created_at=now,
            last_seen_at=now,
        )

        proj, content = await connector.read(ref, include_content=True)

        assert proj is not None
        assert proj.title == "Mock Title"
        assert content == b"Mock content"

    @pytest.mark.asyncio
    async def test_read_conditional_not_modified(self):
        """Test conditional read with 304 response."""
        connector = MockConnector()
        now = datetime.utcnow()

        ref = ExternalReference(
            id="ref-123",
            system="mock",
            object_type="document",
            external_id="doc-456",
            version="v1",
            created_at=now,
            last_seen_at=now,
        )

        # When version matches, should return None (not modified)
        proj, content = await connector.read(ref, if_none_match="v1")

        assert proj is None
        assert content is None

    @pytest.mark.asyncio
    async def test_list_changes(self):
        """Test list_changes method."""
        connector = MockConnector()

        changes = await connector.list_changes()

        assert len(changes) == 1
        assert changes[0].external_id == "changed-1"


class TestConnectorErrors:
    """Tests for connector error classes."""

    def test_connector_error(self):
        """Test base ConnectorError."""
        err = ConnectorError("Something went wrong", system="test", retriable=True)

        assert str(err) == "Something went wrong"
        assert err.system == "test"
        assert err.retriable is True

    def test_not_found_error(self):
        """Test NotFoundError."""
        err = NotFoundError("Resource not found", system="notion")

        assert "not found" in str(err).lower()
        assert err.system == "notion"

    def test_auth_error(self):
        """Test AuthenticationError."""
        err = AuthenticationError("Token expired", system="gdrive")

        assert "expired" in str(err).lower()

    def test_rate_limit_error(self):
        """Test RateLimitError with retry_after."""
        err = RateLimitError("Rate limited", retry_after=60, system="notion")

        assert err.retry_after == 60
        assert err.retriable is True
