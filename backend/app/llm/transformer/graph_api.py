"""Graph query API for transform.py scripts.

This module is copied into the transformer work directory and provides
read-only synchronous access to the workflow graph database.

Usage in transform.py:
    from graph_api import search_nodes, get_node, get_neighbors

    # Search for existing nodes by property
    existing = search_nodes("Analysis", properties={"result_id": "2600881b-t001"})
    if existing:
        # Update existing node
        node_id = existing[0]["id"]
    else:
        # Create new node
        ...
"""

import json
import os
import sqlite3
from pathlib import Path
from typing import Any


def _load_config() -> tuple[str, str]:
    """Load workflow_id and db_path from config file or environment.

    Tries in order:
    1. .graph_config.json in the current directory (written by orchestrator)
    2. Environment variables WORKFLOW_ID and WORKFLOW_DB_PATH
    """
    config_path = Path(".graph_config.json")
    if config_path.exists():
        try:
            with open(config_path) as f:
                config = json.load(f)
                return config.get("workflow_id", ""), config.get("db_path", "workflow.db")
        except (json.JSONDecodeError, IOError):
            pass

    # Fall back to environment variables
    return (
        os.environ.get("WORKFLOW_ID", ""),
        os.environ.get("WORKFLOW_DB_PATH", "workflow.db"),
    )


# Context loaded at import time
WORKFLOW_ID, DB_PATH = _load_config()


class GraphAPI:
    """Synchronous read-only graph query API."""

    def __init__(self, db_path: str, workflow_id: str):
        self.db_path = db_path
        self.workflow_id = workflow_id
        self._conn: sqlite3.Connection | None = None

    def _get_connection(self) -> sqlite3.Connection:
        """Get or create a database connection."""
        if self._conn is None:
            self._conn = sqlite3.connect(self.db_path)
            self._conn.row_factory = sqlite3.Row
        return self._conn

    def search_nodes(
        self,
        node_type: str,
        properties: dict[str, Any] | None = None,
        title_contains: str | None = None,
        title_exact: str | None = None,
        status: str | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """Search for nodes by type and optional filters.

        Args:
            node_type: The node type to search for (required).
            properties: Optional dict of property key-value pairs to match.
                        Properties are matched using JSON extraction.
            title_contains: Optional substring to match in title (case-insensitive).
            title_exact: Optional exact title to match.
            status: Optional status value to match.
            limit: Maximum number of results to return (default 100).

        Returns:
            List of node dictionaries with id, title, status, properties, etc.
        """
        conn = self._get_connection()

        where_clauses = ["workflow_id = ?", "type = ?"]
        params: list[Any] = [self.workflow_id, node_type]

        if title_contains:
            where_clauses.append("title LIKE ?")
            params.append(f"%{title_contains}%")

        if title_exact:
            where_clauses.append("title = ?")
            params.append(title_exact)

        if status:
            where_clauses.append("status = ?")
            params.append(status)

        # Property filters using JSON extraction
        if properties:
            for key, value in properties.items():
                where_clauses.append("json_extract(properties_json, ?) = ?")
                params.append(f"$.{key}")
                # Handle different value types for JSON comparison
                if isinstance(value, bool):
                    params.append(1 if value else 0)
                elif isinstance(value, (int, float)):
                    params.append(value)
                else:
                    params.append(str(value))

        where_sql = " AND ".join(where_clauses)

        cursor = conn.execute(
            f"""
            SELECT id, workflow_id, type, title, status, properties_json,
                   created_at, updated_at
            FROM nodes
            WHERE {where_sql}
            ORDER BY updated_at DESC
            LIMIT ?
            """,
            params + [limit],
        )

        results = []
        for row in cursor.fetchall():
            results.append({
                "id": row["id"],
                "workflow_id": row["workflow_id"],
                "type": row["type"],
                "title": row["title"],
                "status": row["status"],
                "properties": json.loads(row["properties_json"]) if row["properties_json"] else {},
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
            })

        return results

    def get_node(self, node_id: str) -> dict[str, Any] | None:
        """Get a specific node by ID.

        Args:
            node_id: The node ID to retrieve.

        Returns:
            Node dictionary or None if not found.
        """
        conn = self._get_connection()

        cursor = conn.execute(
            """
            SELECT id, workflow_id, type, title, status, properties_json,
                   created_at, updated_at
            FROM nodes
            WHERE id = ? AND workflow_id = ?
            """,
            (node_id, self.workflow_id),
        )

        row = cursor.fetchone()
        if row is None:
            return None

        return {
            "id": row["id"],
            "workflow_id": row["workflow_id"],
            "type": row["type"],
            "title": row["title"],
            "status": row["status"],
            "properties": json.loads(row["properties_json"]) if row["properties_json"] else {},
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    def get_neighbors(
        self,
        node_id: str,
        edge_type: str | None = None,
    ) -> dict[str, list[dict[str, Any]]]:
        """Get incoming and outgoing connected nodes.

        Args:
            node_id: The center node ID.
            edge_type: Optional edge type filter.

        Returns:
            Dict with "incoming" and "outgoing" lists, each containing
            dicts with "edge" and "node" keys.
        """
        conn = self._get_connection()

        edge_filter = ""
        edge_params: list[Any] = []
        if edge_type:
            edge_filter = "AND e.type = ?"
            edge_params = [edge_type]

        # Get outgoing edges
        cursor = conn.execute(
            f"""
            SELECT e.id as edge_id, e.type as edge_type, e.from_node_id, e.to_node_id,
                   e.properties_json as edge_props, e.created_at as edge_created,
                   n.id, n.workflow_id, n.type, n.title, n.status, n.properties_json,
                   n.created_at, n.updated_at
            FROM edges e
            JOIN nodes n ON e.to_node_id = n.id
            WHERE e.workflow_id = ? AND e.from_node_id = ? {edge_filter}
            """,
            [self.workflow_id, node_id] + edge_params,
        )
        outgoing = []
        for row in cursor.fetchall():
            outgoing.append({
                "edge": {
                    "id": row["edge_id"],
                    "type": row["edge_type"],
                    "from_node_id": row["from_node_id"],
                    "to_node_id": row["to_node_id"],
                    "properties": json.loads(row["edge_props"]) if row["edge_props"] else {},
                    "created_at": row["edge_created"],
                },
                "node": {
                    "id": row["id"],
                    "workflow_id": row["workflow_id"],
                    "type": row["type"],
                    "title": row["title"],
                    "status": row["status"],
                    "properties": (
                        json.loads(row["properties_json"])
                        if row["properties_json"] else {}
                    ),
                    "created_at": row["created_at"],
                    "updated_at": row["updated_at"],
                },
            })

        # Get incoming edges
        cursor = conn.execute(
            f"""
            SELECT e.id as edge_id, e.type as edge_type, e.from_node_id, e.to_node_id,
                   e.properties_json as edge_props, e.created_at as edge_created,
                   n.id, n.workflow_id, n.type, n.title, n.status, n.properties_json,
                   n.created_at, n.updated_at
            FROM edges e
            JOIN nodes n ON e.from_node_id = n.id
            WHERE e.workflow_id = ? AND e.to_node_id = ? {edge_filter}
            """,
            [self.workflow_id, node_id] + edge_params,
        )
        incoming = []
        for row in cursor.fetchall():
            incoming.append({
                "edge": {
                    "id": row["edge_id"],
                    "type": row["edge_type"],
                    "from_node_id": row["from_node_id"],
                    "to_node_id": row["to_node_id"],
                    "properties": json.loads(row["edge_props"]) if row["edge_props"] else {},
                    "created_at": row["edge_created"],
                },
                "node": {
                    "id": row["id"],
                    "workflow_id": row["workflow_id"],
                    "type": row["type"],
                    "title": row["title"],
                    "status": row["status"],
                    "properties": (
                        json.loads(row["properties_json"])
                        if row["properties_json"] else {}
                    ),
                    "created_at": row["created_at"],
                    "updated_at": row["updated_at"],
                },
            })

        return {
            "outgoing": outgoing,
            "incoming": incoming,
        }

    def count_nodes(self, node_type: str | None = None) -> int:
        """Count nodes, optionally filtered by type.

        Args:
            node_type: Optional node type filter.

        Returns:
            Number of matching nodes.
        """
        conn = self._get_connection()

        if node_type:
            cursor = conn.execute(
                "SELECT COUNT(*) as count FROM nodes WHERE workflow_id = ? AND type = ?",
                (self.workflow_id, node_type),
            )
        else:
            cursor = conn.execute(
                "SELECT COUNT(*) as count FROM nodes WHERE workflow_id = ?",
                (self.workflow_id,),
            )

        row = cursor.fetchone()
        return row["count"] if row else 0


# Global instance initialized from environment variables
graph = GraphAPI(DB_PATH, WORKFLOW_ID)


# Convenience functions for simpler imports
def search_nodes(
    node_type: str,
    properties: dict[str, Any] | None = None,
    title_contains: str | None = None,
    title_exact: str | None = None,
    status: str | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    """Search for nodes by type and optional filters.

    See GraphAPI.search_nodes for full documentation.
    """
    return graph.search_nodes(
        node_type,
        properties=properties,
        title_contains=title_contains,
        title_exact=title_exact,
        status=status,
        limit=limit,
    )


def get_node(node_id: str) -> dict[str, Any] | None:
    """Get a specific node by ID.

    See GraphAPI.get_node for full documentation.
    """
    return graph.get_node(node_id)


def get_neighbors(
    node_id: str,
    edge_type: str | None = None,
) -> dict[str, list[dict[str, Any]]]:
    """Get incoming and outgoing connected nodes.

    See GraphAPI.get_neighbors for full documentation.
    """
    return graph.get_neighbors(node_id, edge_type=edge_type)


def count_nodes(node_type: str | None = None) -> int:
    """Count nodes, optionally filtered by type.

    See GraphAPI.count_nodes for full documentation.
    """
    return graph.count_nodes(node_type)
