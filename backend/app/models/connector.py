"""Pydantic models for connector management.

Connectors are integrations with external systems (Notion, Google Drive, etc.)
that can be configured through the UI and stored in the database.
"""

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class ConnectorType(str, Enum):
    """Type of connector."""

    BUILTIN = "builtin"  # Hardcoded Python class (e.g., NotionConnector)
    CUSTOM = "custom"  # User-defined via transformer learning


class ConnectorStatus(str, Enum):
    """Status of a connector."""

    ACTIVE = "active"  # Ready to use
    INACTIVE = "inactive"  # Disabled
    LEARNING = "learning"  # Currently being configured via transformer
    ERROR = "error"  # Configuration error


class SecretKeySchema(BaseModel):
    """Schema for a single secret key."""

    key: str = Field(..., description="Secret key name, e.g., 'api_token'")
    description: str = Field(..., description="Human-readable description")
    required: bool = Field(True, description="Whether this secret is required")
    env_var: str | None = Field(None, description="Environment variable to fall back to")


class ConnectorConfigSchema(BaseModel):
    """Schema defining what configuration a connector needs."""

    secrets: list[SecretKeySchema] = Field(
        default_factory=list,
        description="List of secret keys this connector requires",
    )
    settings: dict[str, Any] = Field(
        default_factory=dict,
        description="JSON Schema for non-secret settings",
    )


# ==================== Create/Update Models ====================


class ConnectorCreate(BaseModel):
    """Request model for creating a connector."""

    name: str = Field(..., min_length=1, max_length=100, description="Display name")
    system: str = Field(
        ...,
        min_length=1,
        max_length=50,
        pattern=r"^[a-z][a-z0-9_-]*$",
        description="Unique system identifier (lowercase, no spaces)",
    )
    description: str | None = Field(None, max_length=500)
    url_patterns: list[str] = Field(
        default_factory=list,
        description="Regex patterns for URL matching",
    )
    supported_types: list[str] = Field(
        default_factory=list,
        description="Object types this connector handles, e.g., ['page', 'database']",
    )
    config_schema: ConnectorConfigSchema = Field(
        default_factory=ConnectorConfigSchema,
        description="Schema for connector configuration",
    )


class ConnectorUpdate(BaseModel):
    """Request model for updating a connector."""

    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = None
    url_patterns: list[str] | None = None
    supported_types: list[str] | None = None
    config_schema: ConnectorConfigSchema | None = None
    status: ConnectorStatus | None = None


# ==================== Response Models ====================


class Connector(BaseModel):
    """Full connector model returned from API."""

    id: str
    name: str
    system: str
    description: str | None = None
    connector_type: ConnectorType = ConnectorType.CUSTOM
    url_patterns: list[str] = Field(default_factory=list)
    supported_types: list[str] = Field(default_factory=list)
    config_schema: ConnectorConfigSchema = Field(default_factory=ConnectorConfigSchema)
    status: ConnectorStatus = ConnectorStatus.ACTIVE
    learned_skill_md: str | None = None
    learned_connector_code: str | None = None
    created_at: datetime
    updated_at: datetime

    # Computed fields (not stored)
    is_configured: bool = Field(
        False,
        description="Whether all required secrets are set",
    )
    has_learned: bool = Field(
        False,
        description="Whether this connector has learned skills",
    )


class ConnectorSummary(BaseModel):
    """Summary connector model for list views."""

    id: str
    name: str
    system: str
    description: str | None = None
    connector_type: ConnectorType = ConnectorType.CUSTOM
    status: ConnectorStatus = ConnectorStatus.ACTIVE
    supported_types: list[str] = Field(default_factory=list)
    is_configured: bool = False
    has_learned: bool = False


class ConnectorsResponse(BaseModel):
    """Response for listing connectors."""

    connectors: list[ConnectorSummary]
    total: int


# ==================== Secret Models ====================


class SecretSet(BaseModel):
    """Request to set a secret value."""

    key: str = Field(..., description="Secret key name")
    value: str = Field(..., description="Secret value (will be encrypted)")


class SecretInfo(BaseModel):
    """Info about a configured secret (value not exposed)."""

    key: str
    is_set: bool = True
    updated_at: datetime


class ConnectorSecretsResponse(BaseModel):
    """Response showing which secrets are configured."""

    connector_id: str
    secrets: list[SecretInfo]


# ==================== Learning Models ====================


class ConnectorLearnRequest(BaseModel):
    """Request to start learning a connector configuration."""

    api_docs_url: str | None = Field(
        None,
        description="URL to API documentation to learn from",
    )
    sample_data: str | None = Field(
        None,
        description="Sample API response or data format",
    )
    instruction: str | None = Field(
        None,
        description="Natural language description of what to integrate",
    )
    test_url: str | None = Field(
        None,
        description="URL to test the connector against (requires secrets configured)",
    )


class ConnectorLearnResponse(BaseModel):
    """Response from connector learning."""

    connector: Connector
    skill_md: str | None = None
    suggested_secrets: list[SecretKeySchema] = Field(default_factory=list)
    status: str = "success"
    message: str | None = None

    # Test results (included when test_url was provided)
    connection_verified: bool = Field(
        False, description="True if connector was tested and identify() passed"
    )
    test_results: dict[str, Any] | None = Field(
        None, description="Detailed test results for identify, read, list_changes"
    )


# ==================== Test Models ====================


class ConnectorTestRequest(BaseModel):
    """Request to test a connector's configuration."""

    test_url: str | None = Field(
        None,
        description="Optional URL to test identification with",
    )


class ConnectorTestResponse(BaseModel):
    """Response from testing a connector."""

    success: bool
    message: str
    details: dict[str, Any] | None = None
