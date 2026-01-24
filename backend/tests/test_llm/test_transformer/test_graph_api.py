"""Tests for graph_api.py RLM-style exploration functions."""

import json
import sqlite3
import tempfile
from pathlib import Path

import pytest

from app.llm.transformer.graph_api import GraphAPI


@pytest.fixture
def temp_db():
    """Create a temporary database with test data."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name

    conn = sqlite3.connect(db_path)
    conn.execute("""
        CREATE TABLE nodes (
            id TEXT PRIMARY KEY,
            workflow_id TEXT NOT NULL,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            status TEXT,
            properties_json TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.execute("""
        CREATE TABLE edges (
            id TEXT PRIMARY KEY,
            workflow_id TEXT NOT NULL,
            type TEXT NOT NULL,
            from_node_id TEXT NOT NULL,
            to_node_id TEXT NOT NULL,
            properties_json TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()

    yield db_path

    # Cleanup
    Path(db_path).unlink(missing_ok=True)


@pytest.fixture
def populated_db(temp_db):
    """Create a database with populated test data."""
    conn = sqlite3.connect(temp_db)

    # Insert test nodes
    nodes = [
        ("node-1", "workflow-1", "Person", "Alice", "active", '{"age": 30}'),
        ("node-2", "workflow-1", "Person", "Bob", "active", '{"age": 25}'),
        ("node-3", "workflow-1", "Person", "Charlie", "inactive", '{"age": 35}'),
        ("node-4", "workflow-1", "Task", "Task 1", "pending", '{}'),
        ("node-5", "workflow-1", "Task", "Task 2", "completed", '{}'),
        ("node-6", "workflow-1", "Project", "Project Alpha", "active", '{}'),
    ]
    for node in nodes:
        conn.execute(
            "INSERT INTO nodes (id, workflow_id, type, title, status, properties_json) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            node,
        )

    # Insert test edges
    edges = [
        ("edge-1", "workflow-1", "ASSIGNED_TO", "node-4", "node-1", "{}"),
        ("edge-2", "workflow-1", "ASSIGNED_TO", "node-5", "node-2", "{}"),
        ("edge-3", "workflow-1", "BELONGS_TO", "node-4", "node-6", "{}"),
        ("edge-4", "workflow-1", "BELONGS_TO", "node-5", "node-6", "{}"),
        ("edge-5", "workflow-1", "WORKS_WITH", "node-1", "node-2", "{}"),
    ]
    for edge in edges:
        conn.execute(
            "INSERT INTO edges (id, workflow_id, type, from_node_id, to_node_id, properties_json) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            edge,
        )

    conn.commit()
    conn.close()

    return temp_db


class TestGetGraphOverview:
    """Tests for get_graph_overview method."""

    def test_empty_graph(self, temp_db):
        """Test overview of an empty graph."""
        api = GraphAPI(temp_db, "workflow-1")
        overview = api.get_graph_overview()

        assert overview["total_nodes"] == 0
        assert overview["total_edges"] == 0
        assert overview["node_types"] == {}
        assert overview["edge_types"] == {}
        assert overview["sample_titles"] == {}

    def test_populated_graph(self, populated_db):
        """Test overview of a populated graph."""
        api = GraphAPI(populated_db, "workflow-1")
        overview = api.get_graph_overview()

        assert overview["total_nodes"] == 6
        assert overview["total_edges"] == 5
        assert overview["node_types"]["Person"] == 3
        assert overview["node_types"]["Task"] == 2
        assert overview["node_types"]["Project"] == 1
        assert "ASSIGNED_TO" in overview["edge_types"]
        assert "BELONGS_TO" in overview["edge_types"]
        assert len(overview["sample_titles"]["Person"]) <= 3

    def test_different_workflow(self, populated_db):
        """Test overview only counts nodes from specified workflow."""
        api = GraphAPI(populated_db, "workflow-999")
        overview = api.get_graph_overview()

        assert overview["total_nodes"] == 0
        assert overview["total_edges"] == 0


class TestExploreSubgraph:
    """Tests for explore_subgraph method."""

    def test_nonexistent_node(self, populated_db):
        """Test exploring from a nonexistent node."""
        api = GraphAPI(populated_db, "workflow-1")
        result = api.explore_subgraph("nonexistent-id")

        assert result == {}

    def test_node_with_no_neighbors(self, temp_db):
        """Test exploring a node with no connections."""
        conn = sqlite3.connect(temp_db)
        conn.execute(
            "INSERT INTO nodes (id, workflow_id, type, title, status, properties_json) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            ("lonely-node", "workflow-1", "Isolated", "Lonely Node", "active", "{}"),
        )
        conn.commit()
        conn.close()

        api = GraphAPI(temp_db, "workflow-1")
        result = api.explore_subgraph("lonely-node", depth=2)

        assert result["node"]["id"] == "lonely-node"
        assert result["depth"] == 2
        assert result["outgoing"] == []
        assert result["incoming"] == []

    def test_explore_depth_1(self, populated_db):
        """Test exploring with depth 1."""
        api = GraphAPI(populated_db, "workflow-1")
        result = api.explore_subgraph("node-6", depth=1)

        assert result["node"]["id"] == "node-6"
        assert result["depth"] == 1
        # Project has 2 incoming BELONGS_TO edges from tasks
        assert len(result["incoming"]) == 2
        # Depth 1 means we get node, not subgraph
        assert "node" in result["incoming"][0]
        assert "subgraph" not in result["incoming"][0]

    def test_explore_depth_2(self, populated_db):
        """Test exploring with depth 2."""
        api = GraphAPI(populated_db, "workflow-1")
        result = api.explore_subgraph("node-6", depth=2)

        assert result["depth"] == 2
        # At depth 2, we should get subgraphs for neighbors
        if result["incoming"]:
            assert "subgraph" in result["incoming"][0]

    def test_direction_outgoing_only(self, populated_db):
        """Test exploring only outgoing edges."""
        api = GraphAPI(populated_db, "workflow-1")
        result = api.explore_subgraph("node-4", depth=1, direction="outgoing")

        assert "outgoing" in result
        assert "incoming" not in result

    def test_direction_incoming_only(self, populated_db):
        """Test exploring only incoming edges."""
        api = GraphAPI(populated_db, "workflow-1")
        result = api.explore_subgraph("node-6", depth=1, direction="incoming")

        assert "incoming" in result
        assert "outgoing" not in result

    def test_max_per_level_truncation(self, populated_db):
        """Test that results are truncated at max_per_level."""
        api = GraphAPI(populated_db, "workflow-1")
        result = api.explore_subgraph("node-6", depth=1, max_per_level=1)

        # Project has 2 incoming edges but we limited to 1
        assert len(result["incoming"]) == 1
        assert result["incoming_truncated"] is True

    def test_depth_safety_limit(self, populated_db):
        """Test that depth is capped at 5."""
        api = GraphAPI(populated_db, "workflow-1")
        result = api.explore_subgraph("node-1", depth=100)

        # Should be capped internally
        assert result["depth"] <= 5


class TestSearchNodesPaginated:
    """Tests for search_nodes_paginated method."""

    def test_basic_pagination(self, populated_db):
        """Test basic pagination."""
        api = GraphAPI(populated_db, "workflow-1")
        result = api.search_nodes_paginated("Person", offset=0, limit=2)

        assert len(result["nodes"]) == 2
        assert result["total"] == 3
        assert result["offset"] == 0
        assert result["limit"] == 2
        assert result["has_more"] is True

    def test_second_page(self, populated_db):
        """Test getting second page."""
        api = GraphAPI(populated_db, "workflow-1")
        result = api.search_nodes_paginated("Person", offset=2, limit=2)

        assert len(result["nodes"]) == 1
        assert result["total"] == 3
        assert result["offset"] == 2
        assert result["has_more"] is False

    def test_with_status_filter(self, populated_db):
        """Test pagination with status filter."""
        api = GraphAPI(populated_db, "workflow-1")
        result = api.search_nodes_paginated("Person", status="active")

        assert result["total"] == 2
        for node in result["nodes"]:
            assert node["status"] == "active"

    def test_with_title_filter(self, populated_db):
        """Test pagination with title filter."""
        api = GraphAPI(populated_db, "workflow-1")
        result = api.search_nodes_paginated("Person", title_contains="li")

        # Matches "Alice" and "Charlie"
        assert result["total"] == 2

    def test_with_property_filter(self, populated_db):
        """Test pagination with property filter."""
        api = GraphAPI(populated_db, "workflow-1")
        result = api.search_nodes_paginated("Person", properties={"age": 30})

        assert result["total"] == 1
        assert result["nodes"][0]["title"] == "Alice"

    def test_limit_cap(self, populated_db):
        """Test that limit is capped at 500."""
        api = GraphAPI(populated_db, "workflow-1")
        result = api.search_nodes_paginated("Person", limit=1000)

        # Limit should be capped internally
        assert result["limit"] == 500

    def test_empty_result(self, populated_db):
        """Test pagination with no matching results."""
        api = GraphAPI(populated_db, "workflow-1")
        result = api.search_nodes_paginated("NonexistentType")

        assert result["nodes"] == []
        assert result["total"] == 0
        assert result["has_more"] is False
