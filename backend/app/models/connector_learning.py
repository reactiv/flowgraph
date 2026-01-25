"""Pydantic models for connector learning via transformer.

These models define the output schema that the transformer agent produces
when learning a new connector from API documentation.

The key insight: if the transformer can produce valid output matching this
schema, it PROVES the connector code works (because it had to actually
call the API to get the data).
"""

from typing import Any

from pydantic import BaseModel, Field


class SuggestedSecret(BaseModel):
    """A secret the connector needs."""

    key: str = Field(..., description="Secret key name, e.g., 'api_token'")
    description: str = Field(..., description="Human-readable description")
    required: bool = Field(True, description="Whether this secret is required")
    env_var: str | None = Field(None, description="Environment variable fallback")


class ConnectorReadOutput(BaseModel):
    """Output from testing a connector's read() method.

    This schema captures the ACTUAL data returned by calling the connector
    on the test URL. If this validates, it proves the connector works.

    The transform.py that produces this output IS the connector implementation.
    """

    # === What was identified from the URL ===
    system: str = Field(..., description="System identifier (lowercase, e.g., 'wandb')")
    object_type: str = Field(..., description="Type of object (e.g., 'run', 'project')")
    external_id: str = Field(..., description="External ID extracted from URL")
    display_name: str | None = Field(None, description="Human-readable name of the object")
    canonical_url: str | None = Field(None, description="Canonical URL for the object")

    # === What was read (actual data from the API) ===
    title: str | None = Field(None, description="Object title/name")
    status: str | None = Field(None, description="Object status if applicable")
    owner: str | None = Field(None, description="Owner/creator of the object")
    properties: dict[str, Any] = Field(
        default_factory=dict,
        description="Actual properties fetched from the API",
    )

    # === Configuration discovered ===
    url_patterns: list[str] = Field(
        default_factory=list,
        description="Regex patterns for URL matching",
    )
    supported_types: list[str] = Field(
        default_factory=list,
        description="Object types this connector handles",
    )
    suggested_secrets: list[SuggestedSecret] = Field(
        default_factory=list,
        description="Secrets the connector needs",
    )

    # === Documentation ===
    skill_md: str = Field(
        ...,
        description="SKILL.md content documenting how to use this connector",
    )
