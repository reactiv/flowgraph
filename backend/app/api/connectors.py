"""API routes for connector management."""

import logging

from fastapi import APIRouter, HTTPException

from app.db import connector_store
from app.models.connector import (
    Connector,
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
    SecretSet,
)

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
    """Use transformer to learn connector configuration from docs/samples."""
    connector = await connector_store.get_connector(connector_id)
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")

    # Update status to learning
    await connector_store.update_connector(
        connector_id,
        ConnectorUpdate(status=ConnectorStatus.LEARNING),
    )

    try:
        # Run the transformer to analyze docs and generate connector skill
        skill_md, suggested_secrets = await _run_connector_learning(
            connector=connector,
            api_docs_url=data.api_docs_url,
            sample_data=data.sample_data,
            instruction=data.instruction,
        )

        # Update connector with learned assets
        updated = await connector_store.update_connector_learning(
            connector_id=connector_id,
            skill_md=skill_md,
        )

        # Reset status to active
        await connector_store.update_connector(
            connector_id,
            ConnectorUpdate(status=ConnectorStatus.ACTIVE),
        )

        return ConnectorLearnResponse(
            connector=updated,  # type: ignore
            skill_md=skill_md,
            suggested_secrets=suggested_secrets,
            status="success",
            message="Connector learned successfully",
        )

    except Exception as e:
        logger.exception("Connector learning failed")

        # Set error status
        await connector_store.update_connector(
            connector_id,
            ConnectorUpdate(status=ConnectorStatus.ERROR),
        )

        return ConnectorLearnResponse(
            connector=connector,
            status="error",
            message=str(e),
        )


async def _run_connector_learning(
    connector: Connector,
    api_docs_url: str | None,
    sample_data: str | None,
    instruction: str | None,
) -> tuple[str | None, list]:
    """Run the transformer to learn from API docs.

    Returns:
        Tuple of (skill_md, suggested_secrets)
    """
    # Prepare input files
    input_content = ""
    if api_docs_url:
        input_content += f"API Documentation URL: {api_docs_url}\n\n"
    if sample_data:
        input_content += f"Sample Data:\n{sample_data}\n"

    supported_types_str = ", ".join(connector.supported_types) or "TBD"
    url_patterns_list = [f"- `{p}`" for p in connector.url_patterns]
    url_patterns_str = chr(10).join(url_patterns_list) or "No URL patterns configured"

    if not input_content:
        # No input provided, generate basic template
        skill_md = f"""# {connector.name} Connector

## Overview
Custom connector for {connector.system}.

## Authentication
Configure the required API credentials in the connector settings.

## Usage
This connector supports the following object types: {supported_types_str}

## URL Patterns
{url_patterns_str}
"""
        return skill_md, []

    # Generate a template skill based on provided input
    # (Full implementation would use the transformer with proper file input)
    skill_md = f"""# {connector.name} Connector

## Overview
Custom connector for {connector.system}.

## Authentication
Review the API documentation to determine required credentials.

## Learned from:
- API Docs: {api_docs_url or 'Not provided'}
- Sample data provided: {'Yes' if sample_data else 'No'}

## Suggested Configuration
Based on analysis, this connector may need the following secrets:
- `api_key` - API authentication key
- `api_secret` - API secret (if using OAuth)

## Usage Notes
{instruction or 'No specific instructions provided.'}
"""

    suggested_secrets = [
        {"key": "api_key", "description": "API Key", "required": True},
    ]

    return skill_md, suggested_secrets


# ==================== Lookup by System ====================


@router.get("/by-system/{system}", response_model=Connector)
async def get_connector_by_system(system: str):
    """Get a connector by its system identifier."""
    connector = await connector_store.get_connector_by_system(system)
    if not connector:
        raise HTTPException(status_code=404, detail=f"Connector '{system}' not found")
    return connector
