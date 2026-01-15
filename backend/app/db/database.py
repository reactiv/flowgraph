"""SQLite database connection and schema initialization."""

from pathlib import Path

import aiosqlite

# Global connection holder
_db_connection: aiosqlite.Connection | None = None


async def init_database(db_path: str) -> None:
    """Initialize the database connection and create schema."""
    global _db_connection

    # Ensure the data directory exists
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)

    _db_connection = await aiosqlite.connect(db_path)
    _db_connection.row_factory = aiosqlite.Row

    # Enable foreign keys
    await _db_connection.execute("PRAGMA foreign_keys = ON")

    # Create schema
    await _create_schema(_db_connection)


async def close_database() -> None:
    """Close the database connection."""
    global _db_connection
    if _db_connection:
        await _db_connection.close()
        _db_connection = None


async def get_db() -> aiosqlite.Connection:
    """Get the database connection."""
    if _db_connection is None:
        raise RuntimeError("Database not initialized. Call init_database first.")
    return _db_connection


async def _create_schema(db: aiosqlite.Connection) -> None:
    """Create database tables and indexes."""
    # Workflow definitions table
    await db.execute("""
        CREATE TABLE IF NOT EXISTS workflow_definitions (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            version INTEGER NOT NULL DEFAULT 1,
            definition_json TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)

    # Nodes table
    await db.execute("""
        CREATE TABLE IF NOT EXISTS nodes (
            id TEXT PRIMARY KEY,
            workflow_id TEXT NOT NULL,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            status TEXT,
            properties_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (workflow_id) REFERENCES workflow_definitions(id) ON DELETE CASCADE
        )
    """)

    # Edges table
    await db.execute("""
        CREATE TABLE IF NOT EXISTS edges (
            id TEXT PRIMARY KEY,
            workflow_id TEXT NOT NULL,
            type TEXT NOT NULL,
            from_node_id TEXT NOT NULL,
            to_node_id TEXT NOT NULL,
            properties_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (workflow_id) REFERENCES workflow_definitions(id) ON DELETE CASCADE,
            FOREIGN KEY (from_node_id) REFERENCES nodes(id) ON DELETE CASCADE,
            FOREIGN KEY (to_node_id) REFERENCES nodes(id) ON DELETE CASCADE
        )
    """)

    # Events table
    await db.execute("""
        CREATE TABLE IF NOT EXISTS events (
            id TEXT PRIMARY KEY,
            workflow_id TEXT NOT NULL,
            subject_node_id TEXT,
            event_type TEXT NOT NULL,
            payload_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (workflow_id) REFERENCES workflow_definitions(id) ON DELETE CASCADE,
            FOREIGN KEY (subject_node_id) REFERENCES nodes(id) ON DELETE SET NULL
        )
    """)

    # Create indexes for snappy queries
    # Nodes indexes
    await db.execute("""
        CREATE INDEX IF NOT EXISTS idx_nodes_workflow_type_status
        ON nodes(workflow_id, type, status, updated_at)
    """)

    # Edges indexes - for outgoing edges
    await db.execute("""
        CREATE INDEX IF NOT EXISTS idx_edges_workflow_from
        ON edges(workflow_id, from_node_id, type)
    """)

    # Edges indexes - for incoming edges (reverse lookups)
    await db.execute("""
        CREATE INDEX IF NOT EXISTS idx_edges_workflow_to
        ON edges(workflow_id, to_node_id, type)
    """)

    # Events indexes
    await db.execute("""
        CREATE INDEX IF NOT EXISTS idx_events_workflow_subject
        ON events(workflow_id, subject_node_id, created_at)
    """)

    await db.commit()
