"""Pydantic models for learnable workflow endpoints."""

from typing import Any, Literal

from pydantic import BaseModel, Field


class EndpointCreate(BaseModel):
    """Request to create a new endpoint."""

    model_config = {"populate_by_name": True}

    name: str = Field(..., description="Human-readable name for the endpoint")
    slug: str = Field(..., pattern=r"^[a-z0-9-]+$", description="URL-safe identifier")
    description: str | None = Field(None, description="What this endpoint does")
    http_method: Literal["GET", "POST", "PUT", "DELETE"] = Field(
        "POST", alias="httpMethod", description="HTTP method for this endpoint"
    )
    instruction: str = Field(..., description="Natural language transformer instruction")
    mode: Literal["direct", "code"] = Field(
        "direct", description="Transformer mode: direct or code"
    )


class EndpointUpdate(BaseModel):
    """Request to update an endpoint."""

    model_config = {"populate_by_name": True}

    name: str | None = None
    description: str | None = None
    http_method: Literal["GET", "POST", "PUT", "DELETE"] | None = Field(
        None, alias="httpMethod"
    )
    instruction: str | None = None
    mode: Literal["direct", "code"] | None = None


class Endpoint(BaseModel):
    """Full endpoint model."""

    model_config = {"populate_by_name": True, "serialize_by_alias": True}

    id: str
    workflow_id: str = Field(alias="workflowId")
    name: str
    slug: str
    description: str | None = None
    http_method: Literal["GET", "POST", "PUT", "DELETE"] = Field(alias="httpMethod")
    instruction: str
    mode: Literal["direct", "code"]

    # Learning status
    is_learned: bool = Field(
        ..., alias="isLearned", description="Whether the endpoint has been learned"
    )
    learned_at: str | None = Field(None, alias="learnedAt")
    learned_skill_md: str | None = Field(
        None,
        alias="learnedSkillMd",
        description="Generated SKILL.md content (only included on detail requests)",
    )
    learned_transformer_code: str | None = Field(
        None,
        alias="learnedTransformerCode",
        description="Generated transform.py code (only for code mode, detail requests)",
    )

    # Metadata
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")
    last_executed_at: str | None = Field(None, alias="lastExecutedAt")
    execution_count: int = Field(0, alias="executionCount")


class EndpointExecuteRequest(BaseModel):
    """Request body for executing an endpoint."""

    model_config = {"populate_by_name": True}

    input_data: dict[str, Any] | list[Any] | str | None = Field(
        None, alias="inputData", description="Input data for the transformation"
    )
    learn: bool = Field(False, description="If true, run full transformer and save skill")
    apply: bool = Field(
        True, description="If false, return preview without applying changes"
    )


class EndpointExecuteResponse(BaseModel):
    """Response from endpoint execution."""

    model_config = {"populate_by_name": True, "serialize_by_alias": True}

    success: bool
    result: dict[str, Any] | list[Any] | None = Field(
        None, description="Query results (for GET endpoints)"
    )
    nodes_created: int = Field(0, alias="nodesCreated")
    nodes_updated: int = Field(0, alias="nodesUpdated")
    nodes_deleted: int = Field(0, alias="nodesDeleted")
    edges_created: int = Field(0, alias="edgesCreated")
    errors: list[str] = Field(default_factory=list)
    execution_time_ms: int = Field(0, alias="executionTimeMs")


class EndpointsResponse(BaseModel):
    """Response for listing endpoints."""

    model_config = {"serialize_by_alias": True}

    endpoints: list[Endpoint]
    total: int


class ApplyPreviewRequest(BaseModel):
    """Request body for applying a previewed endpoint result."""

    model_config = {"populate_by_name": True}

    transform_result: dict[str, Any] = Field(
        ..., alias="transformResult", description="The transform result from preview"
    )
    match_result: dict[str, Any] | None = Field(
        None, alias="matchResult", description="Optional matching results for POST endpoints"
    )


class ApplyPreviewResponse(BaseModel):
    """Response from applying a previewed endpoint result."""

    model_config = {"populate_by_name": True, "serialize_by_alias": True}

    success: bool
    nodes_created: int = Field(0, alias="nodesCreated")
    nodes_updated: int = Field(0, alias="nodesUpdated")
    nodes_deleted: int = Field(0, alias="nodesDeleted")
    edges_created: int = Field(0, alias="edgesCreated")
    errors: list[str] = Field(default_factory=list)
