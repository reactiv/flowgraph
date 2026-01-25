"""API routes for connector management."""

import asyncio
import json
import logging
import tempfile
from collections.abc import AsyncGenerator
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.db import connector_store
from app.llm.transformer import DataTransformer, TransformConfig
from app.models.connector import (
    Connector,
    ConnectorConfigSchema,
    ConnectorCreate,
    ConnectorLearnRequest,
    ConnectorLearnResponse,
    ConnectorsResponse,
    ConnectorStatus,
    ConnectorTestRequest,
    ConnectorTestResponse,
    ConnectorType,
    ConnectorUpdate,
    SecretInfo,
    SecretKeySchema,
    SecretSet,
)
from app.models.connector_learning import ConnectorReadOutput

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/connectors", tags=["connectors"])


# ==================== Connector CRUD ====================


@router.get("", response_model=ConnectorsResponse)
async def list_connectors(
    status: ConnectorStatus | None = None,
    connector_type: ConnectorType | None = None,
    limit: int = 100,
    offset: int = 0,
):
    """List all connectors with optional filters."""
    connectors, total = await connector_store.list_connectors(
        status=status,
        connector_type=connector_type,
        limit=limit,
        offset=offset,
    )

    return ConnectorsResponse(connectors=connectors, total=total)


@router.post("", response_model=Connector, status_code=201)
async def create_connector(data: ConnectorCreate):
    """Create a new custom connector."""
    # Check if system already exists
    existing = await connector_store.get_connector_by_system(data.system)
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Connector with system '{data.system}' already exists",
        )

    connector = await connector_store.create_connector(data)
    return connector


@router.get("/{connector_id}", response_model=Connector)
async def get_connector(connector_id: str):
    """Get a connector by ID."""
    connector = await connector_store.get_connector(connector_id)
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")
    return connector


@router.put("/{connector_id}", response_model=Connector)
async def update_connector(connector_id: str, data: ConnectorUpdate):
    """Update a connector."""
    connector = await connector_store.update_connector(connector_id, data)
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")
    return connector


@router.delete("/{connector_id}")
async def delete_connector(connector_id: str):
    """Delete a custom connector."""
    try:
        deleted = await connector_store.delete_connector(connector_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Connector not found")
        return {"deleted": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ==================== Secrets Management ====================


@router.get("/{connector_id}/secrets", response_model=list[SecretInfo])
async def list_secrets(connector_id: str):
    """List configured secrets for a connector (values not exposed)."""
    connector = await connector_store.get_connector(connector_id)
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")

    return await connector_store.list_secrets(connector_id)


@router.post("/{connector_id}/secrets", response_model=SecretInfo)
async def set_secret(connector_id: str, data: SecretSet):
    """Set or update a secret for a connector."""
    connector = await connector_store.get_connector(connector_id)
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")

    return await connector_store.set_secret(
        connector_id=connector_id,
        key=data.key,
        value=data.value,
    )


@router.delete("/{connector_id}/secrets/{key}")
async def delete_secret(connector_id: str, key: str):
    """Delete a secret."""
    connector = await connector_store.get_connector(connector_id)
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")

    deleted = await connector_store.delete_secret(connector_id, key)
    if not deleted:
        raise HTTPException(status_code=404, detail="Secret not found")

    return {"deleted": True}


# ==================== Connector Testing ====================


@router.post("/{connector_id}/test", response_model=ConnectorTestResponse)
async def test_connector(connector_id: str, data: ConnectorTestRequest | None = None):
    """Test a connector's configuration."""
    from app.connectors.base import ConnectorRegistry

    connector = await connector_store.get_connector(connector_id)
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")

    # Check if configured
    if not connector.is_configured:
        return ConnectorTestResponse(
            success=False,
            message="Connector is not fully configured. Missing required secrets.",
            details={"missing_secrets": _get_missing_secrets(connector)},
        )

    # For builtin connectors, try to use the registry
    if connector.connector_type == ConnectorType.BUILTIN:
        connector_class = ConnectorRegistry.get(connector.system)
        if not connector_class:
            return ConnectorTestResponse(
                success=False,
                message=f"Builtin connector '{connector.system}' not found in registry",
            )

        try:
            instance = connector_class()

            if data and data.test_url:
                # Test URL identification
                result = await instance.identify(data.test_url)
                return ConnectorTestResponse(
                    success=True,
                    message="Successfully identified URL",
                    details={
                        "system": result.system,
                        "object_type": result.object_type,
                        "external_id": result.external_id,
                        "display_name": result.display_name,
                    },
                )
            else:
                # Basic auth test - try to list changes
                await instance.list_changes(limit=1)
                return ConnectorTestResponse(
                    success=True,
                    message="Connector is working",
                )

        except Exception as e:
            return ConnectorTestResponse(
                success=False,
                message=f"Connector test failed: {str(e)}",
            )

    # For custom connectors, just verify configuration
    return ConnectorTestResponse(
        success=True,
        message="Custom connector is configured (no runtime test available)",
    )


def _get_missing_secrets(connector: Connector) -> list[str]:
    """Get list of missing required secret keys."""
    # This would need to compare config_schema with set secrets
    # For now, return empty - the is_configured check handles this
    return []


# ==================== Connector Learning ====================


@router.post("/{connector_id}/learn", response_model=ConnectorLearnResponse)
async def learn_connector(connector_id: str, data: ConnectorLearnRequest):
    """Use transformer to learn connector configuration from docs/samples.

    For streaming progress updates, use POST /{connector_id}/learn/stream instead.
    """
    connector = await connector_store.get_connector(connector_id)
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")

    # Update status to learning
    await connector_store.update_connector(
        connector_id,
        ConnectorUpdate(status=ConnectorStatus.LEARNING),
    )

    try:
        # Run learning (same function as streaming, just without events)
        learning_output, transformer_code = await _run_connector_learning_with_events(
            connector=connector,
            api_docs_url=data.api_docs_url,
            sample_data=data.sample_data,
            instruction=data.instruction,
            test_url=data.test_url,
            on_event=None,
        )

        # Update connector with learned assets
        await connector_store.update_connector_learning(
            connector_id=connector_id,
            skill_md=learning_output.skill_md,
            connector_code=transformer_code,
        )

        # Update connector config with discovered patterns and secrets
        config_schema = ConnectorConfigSchema(
            secrets=[
                SecretKeySchema(
                    key=s.key,
                    description=s.description,
                    required=s.required,
                    env_var=s.env_var,
                )
                for s in learning_output.suggested_secrets
            ]
        )
        updated = await connector_store.update_connector(
            connector_id,
            ConnectorUpdate(
                url_patterns=learning_output.url_patterns or None,
                supported_types=learning_output.supported_types or None,
                config_schema=config_schema,
                status=ConnectorStatus.ACTIVE,
            ),
        )

        return ConnectorLearnResponse(
            connector=updated,  # type: ignore
            skill_md=learning_output.skill_md,
            suggested_secrets=[
                SecretKeySchema(
                    key=s.key,
                    description=s.description,
                    required=s.required,
                    env_var=s.env_var,
                )
                for s in learning_output.suggested_secrets
            ],
            status="success",
            message=_build_learn_message(learning_output),
        )

    except Exception as e:
        logger.exception("Connector learning failed")

        await connector_store.update_connector(
            connector_id,
            ConnectorUpdate(status=ConnectorStatus.ERROR),
        )

        return ConnectorLearnResponse(
            connector=connector,
            status="error",
            message=str(e),
        )


@router.post("/{connector_id}/learn/stream")
async def learn_connector_stream(
    connector_id: str, data: ConnectorLearnRequest
) -> StreamingResponse:
    """Learn connector configuration with SSE progress updates.

    This endpoint streams progress events as Server-Sent Events (SSE),
    providing real-time feedback during the connector learning process.
    """
    connector = await connector_store.get_connector(connector_id)
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")

    # Update status to learning
    await connector_store.update_connector(
        connector_id,
        ConnectorUpdate(status=ConnectorStatus.LEARNING),
    )

    async def event_generator() -> AsyncGenerator[str, None]:
        """Generate SSE events for connector learning."""
        events_queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        learning_result: tuple[ConnectorReadOutput, str | None] | None = None
        learning_error: Exception | None = None

        def on_event(event_type: str, event_data: dict[str, Any]) -> None:
            """Callback to capture transformer events."""
            events_queue.put_nowait({"event": event_type, **event_data})

        async def run_learning() -> None:
            nonlocal learning_result, learning_error
            try:
                learning_result = await _run_connector_learning_with_events(
                    connector=connector,
                    api_docs_url=data.api_docs_url,
                    sample_data=data.sample_data,
                    instruction=data.instruction,
                    test_url=data.test_url,
                    on_event=on_event,
                )
            except Exception as e:
                learning_error = e
                logger.exception("Connector learning failed")

        # Run learning in background task
        task = asyncio.create_task(run_learning())

        # Stream events while task runs
        while not task.done():
            try:
                event = await asyncio.wait_for(events_queue.get(), timeout=1.0)
                if event.get("event") == "keepalive":
                    yield ": keepalive\n\n"
                else:
                    yield f"data: {json.dumps(event)}\n\n"
            except TimeoutError:
                yield ": keepalive\n\n"

        # Drain remaining events
        while not events_queue.empty():
            try:
                event = events_queue.get_nowait()
                if event.get("event") != "keepalive":
                    yield f"data: {json.dumps(event)}\n\n"
            except asyncio.QueueEmpty:
                break

        # Handle error
        if learning_error:
            await connector_store.update_connector(
                connector_id,
                ConnectorUpdate(status=ConnectorStatus.ERROR),
            )
            yield f"data: {json.dumps({'event': 'error', 'message': str(learning_error)})}\n\n"
            return

        if learning_result is None:
            await connector_store.update_connector(
                connector_id,
                ConnectorUpdate(status=ConnectorStatus.ERROR),
            )
            err = {"event": "error", "message": "Learning did not produce output"}
            yield f"data: {json.dumps(err)}\n\n"
            return

        learning_output, transformer_code = learning_result

        # Update connector with learned assets
        # The transformer_code IS the connector - it was validated by execution
        await connector_store.update_connector_learning(
            connector_id=connector_id,
            skill_md=learning_output.skill_md,
            connector_code=transformer_code,
        )

        # Update connector config with discovered patterns and secrets
        config_schema = ConnectorConfigSchema(
            secrets=[
                SecretKeySchema(
                    key=s.key,
                    description=s.description,
                    required=s.required,
                    env_var=s.env_var,
                )
                for s in learning_output.suggested_secrets
            ]
        )
        updated = await connector_store.update_connector(
            connector_id,
            ConnectorUpdate(
                url_patterns=learning_output.url_patterns or None,
                supported_types=learning_output.supported_types or None,
                config_schema=config_schema,
                status=ConnectorStatus.ACTIVE,
            ),
        )

        # Build final complete event with actual data fetched
        # The properties dict proves the connector worked
        complete_event = {
            "event": "complete",
            "connector": updated.model_dump(mode="json") if updated else None,
            "skill_md": learning_output.skill_md,
            "suggested_secrets": [
                {"key": s.key, "description": s.description, "required": s.required}
                for s in learning_output.suggested_secrets
            ],
            "status": "success",
            "message": f"Read {learning_output.object_type} '{learning_output.display_name}'",
            # Include actual data so user can verify
            "read_result": {
                "system": learning_output.system,
                "object_type": learning_output.object_type,
                "external_id": learning_output.external_id,
                "display_name": learning_output.display_name,
                "title": learning_output.title,
                "status": learning_output.status,
                "owner": learning_output.owner,
                "properties": learning_output.properties,
            },
        }
        yield f"data: {json.dumps(complete_event)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.delete("/{connector_id}/learn")
async def unlearn_connector(connector_id: str):
    """Clear learned assets from a connector."""
    connector = await connector_store.get_connector(connector_id)
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")

    # Clear learned assets
    await connector_store.update_connector_learning(
        connector_id=connector_id,
        skill_md=None,
        connector_code=None,
    )

    # Refresh connector
    updated = await connector_store.get_connector(connector_id)

    return {"success": True, "connector": updated}


def _build_learn_message(output: ConnectorReadOutput) -> str:
    """Build a human-readable message from learning output."""
    if output.display_name:
        return f"Successfully read {output.object_type} '{output.display_name}'"
    return f"Successfully read {output.object_type} {output.external_id}"


async def _run_connector_learning_with_events(
    connector: Connector,
    api_docs_url: str | None,
    sample_data: str | None,
    instruction: str | None,
    test_url: str | None,
    on_event: Any | None = None,
) -> tuple[ConnectorReadOutput, str | None]:
    """Run connector learning with event streaming support.

    Creates input.json with the test URL, runs the transformer in code mode,
    and saves the generated transform.py as the connector implementation.

    The pattern is:
    1. input.json contains {"url": test_url}
    2. transform.py reads input.json, fetches data, writes output.json
    3. On repeat runs, transform.py is executed directly (no agent needed)

    Args:
        connector: The connector being learned.
        api_docs_url: URL to API documentation (optional context).
        sample_data: Sample API response (optional context).
        instruction: Additional instructions (optional).
        test_url: URL to test the connector against (required).
        on_event: Optional callback for streaming events.

    Returns:
        Tuple of (ConnectorReadOutput, validated_transformer_code).
    """
    if not test_url:
        raise ValueError("test_url is required for connector learning")

    # Fetch configured secrets for this connector
    secrets = await connector_store.get_all_secrets(connector.id)

    # Create input.json with the URL (this is what transform.py will read)
    with tempfile.TemporaryDirectory() as temp_dir:
        input_dir = Path(temp_dir)

        # Write input.json - the standard input format
        input_path = input_dir / "input.json"
        input_data = {"url": test_url}
        input_path.write_text(json.dumps(input_data, indent=2))

        # Build instruction for the transformer
        transformer_instruction = _build_connector_learning_instruction(
            connector=connector,
            api_docs_url=api_docs_url,
            sample_data=sample_data,
            instruction=instruction,
            configured_secrets=list(secrets.keys()) if secrets else None,
        )

        # Run transformer in code mode with learn=True
        # The agent writes transform.py, which gets validated by execution
        transformer = DataTransformer()
        result = await transformer.transform(
            input_paths=[str(input_path)],
            instruction=transformer_instruction,
            output_model=ConnectorReadOutput,
            config=TransformConfig(
                mode="code",
                output_format="json",
                max_iterations=100,
                learn=True,  # Generates SKILL.md automatically
                env_vars=secrets if secrets else None,
            ),
            on_event=on_event,
        )

        if not result.items:
            raise ValueError("Transformer did not produce output")

        # Return the output and the validated transform.py code
        transformer_code = None
        if result.learned:
            transformer_code = result.learned.transformer_code

        return result.items[0], transformer_code


def _build_connector_learning_instruction(
    connector: Connector,
    api_docs_url: str | None,
    sample_data: str | None,
    instruction: str | None,
    configured_secrets: list[str] | None = None,
) -> str:
    """Build instruction for connector learning.

    Simple template that tells the agent to read URL from input.json and
    write ConnectorReadOutput to output.json.
    """
    parts = [
        f"# {connector.name} Connector",
        "",
        f"System: {connector.system}",
        f"Description: {connector.description or 'API connector'}",
        "",
        "## Input",
        "",
        'input.json contains: `{"url": "https://..."}`',
        "",
        "## Task",
        "",
        "Write transform.py that:",
        "1. Reads URL from input.json",
        "2. Fetches data from that URL",
        "3. Writes result to output.json",
        "",
    ]

    # Authentication section
    if configured_secrets:
        parts.append("## Available Secrets")
        parts.append("")
        for key in configured_secrets:
            parts.append(f"- `{key}`: `os.environ.get('{key}')`")
        parts.append("")
    else:
        parts.append("## Authentication")
        parts.append("")
        parts.append("Use `os.environ.get('KEY_NAME')` for API credentials.")
        parts.append("")

    # Optional context
    if api_docs_url:
        parts.append(f"## API Docs: {api_docs_url}")
        parts.append("")

    if sample_data:
        parts.append("## Sample Data")
        parts.append("")
        parts.append("```")
        parts.append(sample_data[:500])  # Truncate if too long
        parts.append("```")
        parts.append("")

    if instruction:
        parts.append("## Notes")
        parts.append("")
        parts.append(instruction)
        parts.append("")

    # Output schema
    parts.extend([
        "## Output Schema",
        "",
        "```json",
        "{",
        f'  "system": "{connector.system}",',
        '  "object_type": "...",',
        '  "external_id": "...",',
        '  "display_name": "...",',
        '  "canonical_url": "...",',
        '  "title": "...",',
        '  "status": "...",',
        '  "owner": "...",',
        '  "properties": {...},',
        '  "url_patterns": ["..."],',
        '  "supported_types": ["..."],',
        '  "suggested_secrets": [{"key": "...", "description": "...", "required": true}],',
        '  "skill_md": "# How to use..."',
        "}",
        "```",
    ])

    return "\n".join(parts)


# ==================== Lookup by System ====================


@router.get("/by-system/{system}", response_model=Connector)
async def get_connector_by_system(system: str):
    """Get a connector by its system identifier."""
    connector = await connector_store.get_connector_by_system(system)
    if not connector:
        raise HTTPException(status_code=404, detail=f"Connector '{system}' not found")
    return connector
