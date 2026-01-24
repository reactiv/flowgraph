"""Database operations for connector management."""

import json
import uuid
from datetime import datetime

import aiosqlite

from app.db.database import get_db
from app.db.secrets import decrypt_secret, encrypt_secret
from app.models.connector import (
    Connector,
    ConnectorConfigSchema,
    ConnectorCreate,
    ConnectorStatus,
    ConnectorSummary,
    ConnectorType,
    ConnectorUpdate,
    SecretInfo,
)


def _row_to_connector(row: aiosqlite.Row) -> Connector:
    """Convert a database row to a Connector model."""
    url_patterns = json.loads(row["url_patterns_json"] or "[]")
    supported_types = json.loads(row["supported_types_json"] or "[]")
    config_schema_data = json.loads(row["config_schema_json"] or "{}")

    return Connector(
        id=row["id"],
        name=row["name"],
        system=row["system"],
        description=row["description"],
        connector_type=ConnectorType(row["connector_type"]),
        url_patterns=url_patterns,
        supported_types=supported_types,
        config_schema=ConnectorConfigSchema(**config_schema_data),
        status=ConnectorStatus(row["status"]),
        learned_skill_md=row["learned_skill_md"],
        learned_connector_code=row["learned_connector_code"],
        created_at=datetime.fromisoformat(row["created_at"]),
        updated_at=datetime.fromisoformat(row["updated_at"]),
        is_configured=False,  # Will be computed separately
        has_learned=bool(row["learned_skill_md"]),
    )


def _row_to_summary(row: aiosqlite.Row) -> ConnectorSummary:
    """Convert a database row to a ConnectorSummary model."""
    supported_types = json.loads(row["supported_types_json"] or "[]")

    return ConnectorSummary(
        id=row["id"],
        name=row["name"],
        system=row["system"],
        description=row["description"],
        connector_type=ConnectorType(row["connector_type"]),
        status=ConnectorStatus(row["status"]),
        supported_types=supported_types,
        is_configured=False,  # Will be computed separately
        has_learned=bool(row["learned_skill_md"]),
    )


async def list_connectors(
    status: ConnectorStatus | None = None,
    connector_type: ConnectorType | None = None,
    limit: int = 100,
    offset: int = 0,
) -> tuple[list[ConnectorSummary], int]:
    """List all connectors with optional filters."""
    db = await get_db()

    # Build query
    conditions = []
    params: list = []

    if status:
        conditions.append("status = ?")
        params.append(status.value)

    if connector_type:
        conditions.append("connector_type = ?")
        params.append(connector_type.value)

    where_clause = " AND ".join(conditions) if conditions else "1=1"

    # Get total count
    count_query = f"SELECT COUNT(*) FROM connectors WHERE {where_clause}"
    cursor = await db.execute(count_query, params)
    row = await cursor.fetchone()
    total = row[0] if row else 0

    # Get connectors
    query = f"""
        SELECT * FROM connectors
        WHERE {where_clause}
        ORDER BY name ASC
        LIMIT ? OFFSET ?
    """
    params.extend([limit, offset])

    cursor = await db.execute(query, params)
    rows = await cursor.fetchall()

    connectors = [_row_to_summary(row) for row in rows]

    # Check which connectors are configured (have all required secrets)
    for connector in connectors:
        connector.is_configured = await is_connector_configured(connector.id)

    return connectors, total


async def get_connector(connector_id: str) -> Connector | None:
    """Get a connector by ID."""
    db = await get_db()

    cursor = await db.execute(
        "SELECT * FROM connectors WHERE id = ?",
        [connector_id],
    )
    row = await cursor.fetchone()

    if not row:
        return None

    connector = _row_to_connector(row)
    connector.is_configured = await is_connector_configured(connector_id)
    return connector


async def get_connector_by_system(system: str) -> Connector | None:
    """Get a connector by system name."""
    db = await get_db()

    cursor = await db.execute(
        "SELECT * FROM connectors WHERE system = ?",
        [system],
    )
    row = await cursor.fetchone()

    if not row:
        return None

    connector = _row_to_connector(row)
    connector.is_configured = await is_connector_configured(connector.id)
    return connector


async def create_connector(data: ConnectorCreate) -> Connector:
    """Create a new connector."""
    db = await get_db()

    connector_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()

    await db.execute(
        """
        INSERT INTO connectors (
            id, name, system, description, connector_type,
            url_patterns_json, supported_types_json, config_schema_json,
            status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            connector_id,
            data.name,
            data.system,
            data.description,
            ConnectorType.CUSTOM.value,
            json.dumps(data.url_patterns),
            json.dumps(data.supported_types),
            json.dumps(data.config_schema.model_dump()),
            ConnectorStatus.ACTIVE.value,
            now,
            now,
        ],
    )
    await db.commit()

    return await get_connector(connector_id)  # type: ignore


async def update_connector(
    connector_id: str,
    data: ConnectorUpdate,
) -> Connector | None:
    """Update an existing connector."""
    db = await get_db()

    # Check connector exists
    existing = await get_connector(connector_id)
    if not existing:
        return None

    # Build update query dynamically
    updates = []
    params = []

    if data.name is not None:
        updates.append("name = ?")
        params.append(data.name)

    if data.description is not None:
        updates.append("description = ?")
        params.append(data.description)

    if data.url_patterns is not None:
        updates.append("url_patterns_json = ?")
        params.append(json.dumps(data.url_patterns))

    if data.supported_types is not None:
        updates.append("supported_types_json = ?")
        params.append(json.dumps(data.supported_types))

    if data.config_schema is not None:
        updates.append("config_schema_json = ?")
        params.append(json.dumps(data.config_schema.model_dump()))

    if data.status is not None:
        updates.append("status = ?")
        params.append(data.status.value)

    if not updates:
        return existing

    updates.append("updated_at = ?")
    params.append(datetime.utcnow().isoformat())
    params.append(connector_id)

    query = f"UPDATE connectors SET {', '.join(updates)} WHERE id = ?"
    await db.execute(query, params)
    await db.commit()

    return await get_connector(connector_id)


async def update_connector_learning(
    connector_id: str,
    skill_md: str | None = None,
    connector_code: str | None = None,
) -> Connector | None:
    """Update a connector's learned assets."""
    db = await get_db()

    now = datetime.utcnow().isoformat()

    await db.execute(
        """
        UPDATE connectors
        SET learned_skill_md = ?,
            learned_connector_code = ?,
            updated_at = ?
        WHERE id = ?
        """,
        [skill_md, connector_code, now, connector_id],
    )
    await db.commit()

    return await get_connector(connector_id)


async def delete_connector(connector_id: str) -> bool:
    """Delete a connector and its secrets."""
    db = await get_db()

    # Check if connector exists and is not builtin
    existing = await get_connector(connector_id)
    if not existing:
        return False

    if existing.connector_type == ConnectorType.BUILTIN:
        raise ValueError("Cannot delete builtin connectors")

    await db.execute("DELETE FROM connectors WHERE id = ?", [connector_id])
    await db.commit()
    return True


# ==================== Secrets Management ====================


async def set_secret(
    connector_id: str,
    key: str,
    value: str,
) -> SecretInfo:
    """Set or update a secret for a connector."""
    db = await get_db()

    secret_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    encrypted_value = encrypt_secret(value)

    # Upsert secret
    await db.execute(
        """
        INSERT INTO connector_secrets
            (id, connector_id, key, encrypted_value, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(connector_id, key) DO UPDATE SET
            encrypted_value = excluded.encrypted_value,
            updated_at = excluded.updated_at
        """,
        [secret_id, connector_id, key, encrypted_value, now, now],
    )
    await db.commit()

    return SecretInfo(
        key=key,
        is_set=True,
        updated_at=datetime.fromisoformat(now),
    )


async def get_secret(connector_id: str, key: str) -> str | None:
    """Get a decrypted secret value."""
    db = await get_db()

    cursor = await db.execute(
        "SELECT encrypted_value FROM connector_secrets WHERE connector_id = ? AND key = ?",
        [connector_id, key],
    )
    row = await cursor.fetchone()

    if not row:
        return None

    return decrypt_secret(row["encrypted_value"])


async def list_secrets(connector_id: str) -> list[SecretInfo]:
    """List all secrets for a connector (without values)."""
    db = await get_db()

    cursor = await db.execute(
        "SELECT key, updated_at FROM connector_secrets WHERE connector_id = ?",
        [connector_id],
    )
    rows = await cursor.fetchall()

    return [
        SecretInfo(
            key=row["key"],
            is_set=True,
            updated_at=datetime.fromisoformat(row["updated_at"]),
        )
        for row in rows
    ]


async def delete_secret(connector_id: str, key: str) -> bool:
    """Delete a secret."""
    db = await get_db()

    cursor = await db.execute(
        "DELETE FROM connector_secrets WHERE connector_id = ? AND key = ?",
        [connector_id, key],
    )
    await db.commit()

    return cursor.rowcount > 0


async def is_connector_configured(connector_id: str) -> bool:
    """Check if all required secrets are set for a connector."""
    connector = await get_connector_raw(connector_id)
    if not connector:
        return False

    config_schema_data = json.loads(connector["config_schema_json"] or "{}")
    config_schema = ConnectorConfigSchema(**config_schema_data)

    # Get set secrets
    set_secrets = {s.key for s in await list_secrets(connector_id)}

    # Check all required secrets
    for secret_def in config_schema.secrets:
        if secret_def.required and secret_def.key not in set_secrets:
            return False

    return True


async def get_connector_raw(connector_id: str) -> aiosqlite.Row | None:
    """Get raw connector row (internal use)."""
    db = await get_db()

    cursor = await db.execute(
        "SELECT * FROM connectors WHERE id = ?",
        [connector_id],
    )
    return await cursor.fetchone()


# ==================== Builtin Connector Registration ====================


async def ensure_builtin_connectors() -> None:
    """Ensure builtin connectors are registered in the database.

    This is called at startup to sync hardcoded connectors with the database.
    """
    from app.connectors.base import ConnectorRegistry

    db = await get_db()

    for connector_class in ConnectorRegistry.list_connectors():
        system = connector_class.system

        # Check if already exists
        cursor = await db.execute(
            "SELECT id FROM connectors WHERE system = ?",
            [system],
        )
        row = await cursor.fetchone()

        if row:
            continue

        # Create builtin connector record
        connector_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat()

        # Determine secrets schema based on known connectors
        secrets_schema = []
        if system == "notion":
            secrets_schema = [
                {
                    "key": "api_token",
                    "description": "Notion Integration Token",
                    "required": True,
                    "env_var": "NOTION_TOKEN",
                }
            ]
        elif system == "gdrive":
            secrets_schema = [
                {
                    "key": "tokens_json",
                    "description": "Google Drive OAuth2 Tokens",
                    "required": True,
                    "env_var": "GOOGLE_DRIVE_TOKENS",
                }
            ]

        config_schema = ConnectorConfigSchema(
            secrets=[
                {
                    "key": s["key"],
                    "description": s["description"],
                    "required": s["required"],
                    "env_var": s.get("env_var"),
                }
                for s in secrets_schema
            ]
        )

        await db.execute(
            """
            INSERT INTO connectors (
                id, name, system, description, connector_type,
                url_patterns_json, supported_types_json, config_schema_json,
                status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                connector_id,
                system.title(),  # "notion" -> "Notion"
                system,
                f"Built-in {system.title()} connector",
                ConnectorType.BUILTIN.value,
                json.dumps(connector_class.url_patterns),
                json.dumps(connector_class.supported_types),
                json.dumps(config_schema.model_dump()),
                ConnectorStatus.ACTIVE.value,
                now,
                now,
            ],
        )

    await db.commit()
