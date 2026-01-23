"""Tests for context pack generation."""

import pytest
from datetime import datetime, timedelta

from app.models.context_pack import (
    ContextPack,
    ContextPackRequest,
    ContextResource,
)
from app.models.external_reference import Projection, RetrievalMode


class TestContextResource:
    """Tests for ContextResource model."""

    def test_internal_resource(self):
        """Test creating an internal (node-only) resource."""
        resource = ContextResource(
            node_id="node-123",
            title="Test Node",
            properties={"key": "value"},
            path_name="test_path",
            hop_depth=1,
        )

        assert resource.is_internal
        assert not resource.is_external
        assert resource.node_id == "node-123"
        assert resource.reference_id is None

    def test_external_resource(self):
        """Test creating an external resource."""
        resource = ContextResource(
            reference_id="ref-123",
            node_id="node-456",
            title="External Document",
            content="Some content",
            properties={"source": "notion"},
            retrieval_mode=RetrievalMode.CONDITIONAL,
            fetched_at=datetime.utcnow(),
            version="v1",
            path_name="external_docs",
            hop_depth=2,
        )

        assert resource.is_external
        assert resource.reference_id == "ref-123"
        assert resource.node_id == "node-456"

    def test_stale_resource(self):
        """Test stale resource detection."""
        resource = ContextResource(
            node_id="node-123",
            title="Stale Node",
            properties={},
            is_stale=True,
            path_name="test",
            hop_depth=0,
        )

        assert resource.is_stale


class TestContextPack:
    """Tests for ContextPack model."""

    def test_create_pack(self):
        """Test creating a context pack."""
        now = datetime.utcnow()
        pack = ContextPack(
            id="pack-123",
            workflow_id="wf-456",
            source_node_id="node-789",
            traversal_rule="default",
            resources=[
                ContextResource(
                    node_id="node-789",
                    title="Source",
                    properties={},
                    path_name="source",
                    hop_depth=0,
                ),
                ContextResource(
                    node_id="node-001",
                    title="Related",
                    properties={},
                    path_name="neighbors",
                    hop_depth=1,
                ),
            ],
            created_at=now,
            estimated_tokens=100,
        )

        assert pack.id == "pack-123"
        assert len(pack.resources) == 2
        assert pack.estimated_tokens == 100

    def test_pack_freshness_summary(self):
        """Test computing freshness summary."""
        now = datetime.utcnow()
        old_time = now - timedelta(hours=2)

        pack = ContextPack(
            id="pack-123",
            workflow_id="wf-456",
            source_node_id="node-789",
            resources=[
                ContextResource(
                    node_id="node-1",
                    title="Fresh",
                    properties={},
                    fetched_at=now,
                    is_stale=False,
                    path_name="test",
                    hop_depth=0,
                ),
                ContextResource(
                    node_id="node-2",
                    title="Stale",
                    properties={},
                    fetched_at=old_time,
                    is_stale=True,
                    path_name="test",
                    hop_depth=1,
                ),
            ],
            created_at=now,
        )

        pack.compute_freshness_summary()

        assert pack.any_stale is True
        assert pack.oldest_projection == old_time

    def test_pack_to_prompt_text(self):
        """Test converting pack to prompt text."""
        now = datetime.utcnow()
        pack = ContextPack(
            id="pack-123",
            workflow_id="wf-456",
            source_node_id="node-789",
            resources=[
                ContextResource(
                    node_id="node-1",
                    title="Main Document",
                    content="This is the main content.",
                    properties={"status": "active"},
                    path_name="source",
                    hop_depth=0,
                ),
                ContextResource(
                    node_id="node-2",
                    title="Related Item",
                    properties={"type": "reference"},
                    path_name="related",
                    hop_depth=1,
                ),
            ],
            created_at=now,
        )

        text = pack.to_prompt_text()

        assert "## source" in text
        assert "### Main Document" in text
        assert "This is the main content." in text
        assert "## related" in text
        assert "### Related Item" in text

    def test_pack_to_prompt_with_provenance(self):
        """Test prompt text with provenance included."""
        now = datetime.utcnow()
        pack = ContextPack(
            id="pack-123",
            workflow_id="wf-456",
            source_node_id="node-789",
            resources=[
                ContextResource(
                    reference_id="ref-1",
                    node_id="node-1",
                    title="External Doc",
                    properties={},
                    fetched_at=now,
                    is_stale=True,
                    path_name="external",
                    hop_depth=0,
                ),
            ],
            created_at=now,
        )

        text = pack.to_prompt_text(include_provenance=True)

        assert "*Source: external (ref-1)*" in text
        assert "*Warning: Data may be stale*" in text

    def test_get_stale_resources(self):
        """Test getting stale resources from pack."""
        now = datetime.utcnow()
        pack = ContextPack(
            id="pack-123",
            workflow_id="wf-456",
            source_node_id="node-789",
            resources=[
                ContextResource(
                    node_id="node-1",
                    title="Fresh",
                    properties={},
                    is_stale=False,
                    path_name="test",
                    hop_depth=0,
                ),
                ContextResource(
                    node_id="node-2",
                    title="Stale 1",
                    properties={},
                    is_stale=True,
                    path_name="test",
                    hop_depth=1,
                ),
                ContextResource(
                    node_id="node-3",
                    title="Stale 2",
                    properties={},
                    is_stale=True,
                    path_name="test",
                    hop_depth=2,
                ),
            ],
            created_at=now,
        )

        stale = pack.get_stale_resources()
        assert len(stale) == 2

    def test_get_external_resources(self):
        """Test getting external resources from pack."""
        now = datetime.utcnow()
        pack = ContextPack(
            id="pack-123",
            workflow_id="wf-456",
            source_node_id="node-789",
            resources=[
                ContextResource(
                    node_id="node-1",
                    title="Internal",
                    properties={},
                    path_name="test",
                    hop_depth=0,
                ),
                ContextResource(
                    reference_id="ref-1",
                    node_id="node-2",
                    title="External",
                    properties={},
                    path_name="test",
                    hop_depth=1,
                ),
            ],
            created_at=now,
        )

        external = pack.get_external_resources()
        internal = pack.get_internal_resources()

        assert len(external) == 1
        assert len(internal) == 1


class TestContextPackRequest:
    """Tests for ContextPackRequest model."""

    def test_default_request(self):
        """Test request with defaults."""
        request = ContextPackRequest()

        assert request.require_fresh is False
        assert request.refresh_stale is True
        assert request.include_snapshots is False
        assert request.max_tokens is None

    def test_custom_request(self):
        """Test request with custom values."""
        request = ContextPackRequest(
            selector_name="custom_selector",
            require_fresh=True,
            refresh_stale=True,
            max_tokens=4000,
        )

        assert request.selector_name == "custom_selector"
        assert request.require_fresh is True
        assert request.max_tokens == 4000
