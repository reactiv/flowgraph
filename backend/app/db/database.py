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

    # Endpoints table - learnable API endpoints for workflows
    await db.execute("""
        CREATE TABLE IF NOT EXISTS endpoints (
            id TEXT PRIMARY KEY,
            workflow_id TEXT NOT NULL,
            name TEXT NOT NULL,
            slug TEXT NOT NULL,
            description TEXT,
            http_method TEXT NOT NULL DEFAULT 'POST',
            instruction TEXT NOT NULL,
            mode TEXT NOT NULL DEFAULT 'direct',
            learned_skill_md TEXT,
            learned_transformer_code TEXT,
            learned_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            last_executed_at TEXT,
            execution_count INTEGER DEFAULT 0,
            FOREIGN KEY (workflow_id) REFERENCES workflow_definitions(id) ON DELETE CASCADE,
            UNIQUE(workflow_id, slug)
        )
    """)

    # Endpoints indexes
    await db.execute("""
        CREATE INDEX IF NOT EXISTS idx_endpoints_workflow
        ON endpoints(workflow_id)
    """)

    # =========================================================================
    # External References (Pointer Layer)
    # =========================================================================
    await db.execute("""
        CREATE TABLE IF NOT EXISTS external_references (
            id TEXT PRIMARY KEY,
            system TEXT NOT NULL,
            object_type TEXT NOT NULL,
            external_id TEXT NOT NULL,
            canonical_url TEXT,
            version TEXT,
            version_type TEXT DEFAULT 'etag',
            display_name TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(system, external_id)
        )
    """)

    await db.execute("""
        CREATE INDEX IF NOT EXISTS idx_refs_system_type
        ON external_references(system, object_type)
    """)

    # =========================================================================
    # Projections (Cached Fields Layer)
    # =========================================================================
    await db.execute("""
        CREATE TABLE IF NOT EXISTS projections (
            id TEXT PRIMARY KEY,
            reference_id TEXT NOT NULL,
            title TEXT,
            status TEXT,
            owner TEXT,
            summary TEXT,
            properties_json TEXT DEFAULT '{}',
            relationships_json TEXT DEFAULT '[]',
            fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
            stale_after TEXT NOT NULL,
            freshness_slo_seconds INTEGER NOT NULL DEFAULT 3600,
            retrieval_mode TEXT DEFAULT 'cached',
            content_hash TEXT,
            FOREIGN KEY (reference_id) REFERENCES external_references(id) ON DELETE CASCADE,
            UNIQUE(reference_id)
        )
    """)

    await db.execute("""
        CREATE INDEX IF NOT EXISTS idx_projections_stale
        ON projections(stale_after)
    """)

    await db.execute("""
        CREATE INDEX IF NOT EXISTS idx_projections_reference
        ON projections(reference_id)
    """)

    # =========================================================================
    # Snapshots (Immutable Copy Layer)
    # =========================================================================
    await db.execute("""
        CREATE TABLE IF NOT EXISTS snapshots (
            id TEXT PRIMARY KEY,
            reference_id TEXT NOT NULL,
            content_type TEXT NOT NULL,
            content_path TEXT,
            content_inline TEXT,
            content_hash TEXT NOT NULL,
            captured_at TEXT NOT NULL DEFAULT (datetime('now')),
            captured_by TEXT,
            capture_reason TEXT DEFAULT 'manual',
            source_version TEXT,
            FOREIGN KEY (reference_id) REFERENCES external_references(id) ON DELETE CASCADE
        )
    """)

    await db.execute("""
        CREATE INDEX IF NOT EXISTS idx_snapshots_reference
        ON snapshots(reference_id)
    """)

    # =========================================================================
    # Node ↔ Reference Links
    # =========================================================================
    await db.execute("""
        CREATE TABLE IF NOT EXISTS node_external_refs (
            node_id TEXT NOT NULL,
            reference_id TEXT NOT NULL,
            workflow_id TEXT NOT NULL,
            relationship TEXT DEFAULT 'source',
            added_at TEXT NOT NULL DEFAULT (datetime('now')),
            added_by TEXT,
            PRIMARY KEY (node_id, reference_id),
            FOREIGN KEY (reference_id) REFERENCES external_references(id) ON DELETE CASCADE,
            FOREIGN KEY (workflow_id) REFERENCES workflow_definitions(id) ON DELETE CASCADE
        )
    """)

    await db.execute("""
        CREATE INDEX IF NOT EXISTS idx_node_refs_workflow
        ON node_external_refs(workflow_id)
    """)

    await db.execute("""
        CREATE INDEX IF NOT EXISTS idx_node_refs_reference
        ON node_external_refs(reference_id)
    """)

    # =========================================================================
    # Context Packs (Audit Trail)
    # =========================================================================
    await db.execute("""
        CREATE TABLE IF NOT EXISTS context_packs (
            id TEXT PRIMARY KEY,
            workflow_id TEXT NOT NULL,
            source_node_id TEXT NOT NULL,
            traversal_rule TEXT,
            resources_json TEXT NOT NULL DEFAULT '[]',
            oldest_projection TEXT,
            any_stale INTEGER DEFAULT 0,
            estimated_tokens INTEGER DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (workflow_id) REFERENCES workflow_definitions(id) ON DELETE CASCADE
        )
    """)

    await db.execute("""
        CREATE INDEX IF NOT EXISTS idx_context_packs_workflow
        ON context_packs(workflow_id, created_at)
    """)

    # Endpoints table - learnable API endpoints for workflows
    await db.execute("""
        CREATE TABLE IF NOT EXISTS endpoints (
            id TEXT PRIMARY KEY,
            workflow_id TEXT NOT NULL,
            name TEXT NOT NULL,
            slug TEXT NOT NULL,
            description TEXT,
            http_method TEXT NOT NULL DEFAULT 'POST',
            instruction TEXT NOT NULL,
            mode TEXT NOT NULL DEFAULT 'direct',
            learned_skill_md TEXT,
            learned_transformer_code TEXT,
            learned_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            last_executed_at TEXT,
            execution_count INTEGER DEFAULT 0,
            FOREIGN KEY (workflow_id) REFERENCES workflow_definitions(id) ON DELETE CASCADE,
            UNIQUE(workflow_id, slug)
        )
    """)

    # Endpoints indexes
    await db.execute("""
        CREATE INDEX IF NOT EXISTS idx_endpoints_workflow
        ON endpoints(workflow_id)
    """)

    # =========================================================================
    # Connectors (External System Integrations)
    # =========================================================================
    await db.execute("""
        CREATE TABLE IF NOT EXISTS connectors (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            system TEXT NOT NULL UNIQUE,
            description TEXT,
            connector_type TEXT NOT NULL DEFAULT 'custom',
            url_patterns_json TEXT DEFAULT '[]',
            supported_types_json TEXT DEFAULT '[]',
            config_schema_json TEXT DEFAULT '{}',
            learned_skill_md TEXT,
            learned_connector_code TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)

    await db.execute("""
        CREATE INDEX IF NOT EXISTS idx_connectors_system
        ON connectors(system)
    """)

    await db.execute("""
        CREATE INDEX IF NOT EXISTS idx_connectors_status
        ON connectors(status)
    """)

    # =========================================================================
    # Task Execution Engine - TaskSet Definitions (DAG Templates)
    # =========================================================================
    await db.execute("""
        CREATE TABLE IF NOT EXISTS task_set_definitions (
            id TEXT PRIMARY KEY,
            workflow_id TEXT NOT NULL,
            name TEXT NOT NULL,
            version INTEGER NOT NULL DEFAULT 1,
            definition_json TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (workflow_id) REFERENCES workflow_definitions(id) ON DELETE CASCADE
        )
    """)

    await db.execute("""
        CREATE INDEX IF NOT EXISTS idx_task_set_defs_workflow
        ON task_set_definitions(workflow_id)
    """)

    # =========================================================================
    # Task Execution Engine - TaskSet Instances (Running Workflows)
    # =========================================================================
    await db.execute("""
        CREATE TABLE IF NOT EXISTS task_set_instances (
            id TEXT PRIMARY KEY,
            workflow_id TEXT NOT NULL,
            task_set_definition_id TEXT NOT NULL,
            root_node_id TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (workflow_id) REFERENCES workflow_definitions(id) ON DELETE CASCADE,
            FOREIGN KEY (task_set_definition_id) REFERENCES task_set_definitions(id) ON DELETE CASCADE,
            FOREIGN KEY (root_node_id) REFERENCES nodes(id) ON DELETE SET NULL
        )
    """)

    await db.execute("""
        CREATE INDEX IF NOT EXISTS idx_task_set_inst_workflow
        ON task_set_instances(workflow_id)
    """)

    await db.execute("""
        CREATE INDEX IF NOT EXISTS idx_task_set_inst_root
        ON task_set_instances(root_node_id)
    """)

    await db.execute("""
        CREATE INDEX IF NOT EXISTS idx_task_set_inst_status
        ON task_set_instances(status)
    """)

    # =========================================================================
    # Task Execution Engine - Task Instances (Individual Task States)
    # =========================================================================
    await db.execute("""
        CREATE TABLE IF NOT EXISTS task_instances (
            id TEXT PRIMARY KEY,
            task_set_instance_id TEXT NOT NULL,
            task_definition_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            assignee_type TEXT DEFAULT 'unassigned',
            assignee_id TEXT,
            assigned_at TEXT,
            assigned_by TEXT,
            started_at TEXT,
            completed_at TEXT,
            output_node_id TEXT,
            notes TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (task_set_instance_id) REFERENCES task_set_instances(id) ON DELETE CASCADE,
            FOREIGN KEY (output_node_id) REFERENCES nodes(id) ON DELETE SET NULL
        )
    """)

    await db.execute("""
        CREATE INDEX IF NOT EXISTS idx_task_inst_set
        ON task_instances(task_set_instance_id)
    """)

    await db.execute("""
        CREATE INDEX IF NOT EXISTS idx_task_inst_status
        ON task_instances(status)
    """)

    await db.execute("""
        CREATE INDEX IF NOT EXISTS idx_task_inst_assignee
        ON task_instances(assignee_type, assignee_id)
    """)

    # =========================================================================
    # Connector Secrets (Encrypted Credentials)
    # =========================================================================
    await db.execute("""
        CREATE TABLE IF NOT EXISTS connector_secrets (
            id TEXT PRIMARY KEY,
            connector_id TEXT NOT NULL,
            key TEXT NOT NULL,
            encrypted_value TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (connector_id) REFERENCES connectors(id) ON DELETE CASCADE,
            UNIQUE(connector_id, key)
        )
    """)

    await db.execute("""
        CREATE INDEX IF NOT EXISTS idx_connector_secrets_connector
        ON connector_secrets(connector_id)
    """)

    await db.commit()
