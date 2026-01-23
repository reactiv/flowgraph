"""Pydantic models for LLM-powered node and field suggestions."""

from typing import Any, Literal

from pydantic import BaseModel, Field

from app.models.context_selector import ContextSelector
from app.models.node import NodeCreate


class ExternalContentOptions(BaseModel):
    """Options for including external reference content in suggestions."""

    include_projections: bool = Field(
        default=True,
        description="Include projection summary and properties for nodes with external references",
    )

    include_full_content: bool = Field(
        default=False,
        description="Include full snapshot content if available (heavier but more complete)",
    )

    refresh_stale: bool = Field(
        default=False,
        description="Whether to refresh stale projections before gathering context",
    )


class SuggestionOptions(BaseModel):
    """Options for node suggestion generation."""

    num_suggestions: int = Field(default=1, ge=1, le=5)
    """Number of alternative suggestions to generate."""

    guidance: str | None = None
    """Optional user guidance to steer the suggestion."""

    context_selector: ContextSelector | None = None
    """Custom context configuration. If None, uses default context gathering."""

    external_content: ExternalContentOptions = Field(
        default_factory=ExternalContentOptions
    )
    """Options for including external reference content in the suggestion context."""


class SuggestionRequest(BaseModel):
    """Request model for suggesting a new node."""

    edge_type: str
    """The edge type that will connect the source node to the suggested node."""

    direction: Literal["incoming", "outgoing"]
    """Direction of the edge relative to the source node.
    - 'outgoing': source → suggested (e.g., Sample → Analysis)
    - 'incoming': suggested → source (e.g., ExperimentPlan → Hypothesis)
    """

    options: SuggestionOptions = Field(default_factory=SuggestionOptions)


class NodeSuggestion(BaseModel):
    """A single node suggestion with metadata."""

    node: NodeCreate
    """The suggested node, ready to be created."""

    rationale: str
    """Explanation of why this node was suggested."""


class SuggestionContext(BaseModel):
    """Context information used to generate suggestions."""

    source_node_id: str
    source_node_title: str
    source_node_type: str
    edge_type: str
    direction: Literal["incoming", "outgoing"]
    target_node_type: str
    context_nodes_count: int
    external_refs_included: int = Field(
        default=0, description="Number of nodes with external reference content included"
    )
    stale_refs_count: int = Field(
        default=0, description="Number of external references that were stale"
    )
    external_warnings: list[str] = Field(
        default_factory=list, description="Warnings about external content"
    )


class SuggestionResponse(BaseModel):
    """Response model for node suggestions."""

    suggestions: list[NodeSuggestion]
    """List of suggested nodes."""

    context: SuggestionContext
    """Context information used to generate the suggestions."""


# Field Value Suggestion Models


class FieldValueSuggestionOptions(BaseModel):
    """Options for field value suggestion generation."""

    guidance: str | None = None
    """Optional user guidance to steer the suggestion."""

    num_suggestions: int = Field(default=1, ge=1, le=3)
    """Number of alternative suggestions to generate."""

    context_selector: ContextSelector | None = None
    """Custom context configuration. If None, uses default context gathering."""

    external_content: ExternalContentOptions = Field(
        default_factory=ExternalContentOptions
    )
    """Options for including external reference content in the suggestion context."""


class FieldValueSuggestionRequest(BaseModel):
    """Request model for suggesting a field value."""

    options: FieldValueSuggestionOptions = Field(
        default_factory=FieldValueSuggestionOptions
    )


class FieldValueSuggestion(BaseModel):
    """A single field value suggestion with metadata."""

    value: Any
    """The suggested value for the field (type depends on field kind)."""

    rationale: str
    """Explanation of why this value was suggested."""


class FieldValueSuggestionContext(BaseModel):
    """Context information used to generate field value suggestions."""

    node_id: str
    node_title: str
    node_type: str
    field_key: str
    field_kind: str
    field_label: str
    current_value: Any | None
    context_nodes_count: int
    external_refs_included: int = Field(
        default=0, description="Number of nodes with external reference content included"
    )
    stale_refs_count: int = Field(
        default=0, description="Number of external references that were stale"
    )
    external_warnings: list[str] = Field(
        default_factory=list, description="Warnings about external content"
    )


class FieldValueSuggestionResponse(BaseModel):
    """Response model for field value suggestions."""

    suggestions: list[FieldValueSuggestion]
    """List of suggested field values."""

    context: FieldValueSuggestionContext
    """Context information used to generate the suggestions."""
