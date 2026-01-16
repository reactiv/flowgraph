"""Pydantic models for LLM-powered node suggestions."""

from typing import Literal

from pydantic import BaseModel, Field

from app.models.node import NodeCreate


class SuggestionOptions(BaseModel):
    """Options for node suggestion generation."""

    include_similar: bool = True
    """Include similar nodes as examples for the LLM."""

    num_suggestions: int = Field(default=1, ge=1, le=5)
    """Number of alternative suggestions to generate."""

    max_similar_examples: int = Field(default=3, ge=0, le=10)
    """Maximum number of similar nodes to include as examples."""

    guidance: str | None = None
    """Optional user guidance to steer the suggestion."""


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
    similar_nodes_count: int


class SuggestionResponse(BaseModel):
    """Response model for node suggestions."""

    suggestions: list[NodeSuggestion]
    """List of suggested nodes."""

    context: SuggestionContext
    """Context information used to generate the suggestions."""
