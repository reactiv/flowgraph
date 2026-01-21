"""Pydantic models for context selection in LLM suggestions.

The ContextSelector enables composable graph traversals to gather context nodes.
Paths can branch from each other using `from_path` to enable complex relational
queries like "siblings in the same project" or "documents belonging to my team members".
"""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class EdgeStep(BaseModel):
    """A single edge traversal step."""

    model_config = ConfigDict(populate_by_name=True)

    edge_type: str = Field(alias="edgeType")
    """The edge type to traverse."""

    direction: Literal["outgoing", "incoming"]
    """Direction to traverse: outgoing (source→target) or incoming (target→source)."""


class ContextPath(BaseModel):
    """A named traversal path that gathers context nodes.

    Paths are executed in order, and later paths can reference earlier paths
    via `from_path` to continue traversing from those results.

    Example - "Issues in the same Project":
        paths = [
            ContextPath(name="project", steps=[EdgeStep("BELONGS_TO", "outgoing")]),
            ContextPath(name="siblings", steps=[EdgeStep("BELONGS_TO", "incoming")],
                       from_path="project", target_type="Issue"),
        ]

    Example - "Similar nodes as examples" (global query, not from source):
        paths = [
            ContextPath(name="examples", global_query=True, target_type="Sample", max_count=3),
        ]
    """

    model_config = ConfigDict(populate_by_name=True)

    name: str
    """Unique name for this path (used for referencing in from_path)."""

    steps: list[EdgeStep] = Field(default_factory=list)
    """Edge traversal steps from the starting point."""

    target_type: str | None = Field(default=None, alias="targetType")
    """Filter final nodes to this type. None = no type filter."""

    max_count: int = Field(default=10, ge=1, le=50, alias="maxCount")
    """Maximum nodes to include from this path."""

    from_path: str | None = Field(default=None, alias="fromPath")
    """Start from results of another path instead of source node.
    None = start from the source node."""

    include_intermediate: bool = Field(default=False, alias="includeIntermediate")
    """Include nodes traversed along the way, not just final nodes."""

    global_query: bool = Field(default=False, alias="globalQuery")
    """If True, query nodes by target_type globally instead of traversing from source.
    Useful for fetching example nodes of a type without requiring a relationship."""


class PropertySelector(BaseModel):
    """Configuration for which properties to include from nodes."""

    mode: Literal["all", "include", "exclude"] = "all"
    """all=include all properties, include=only listed fields, exclude=all except listed."""

    fields: list[str] = Field(default_factory=list)
    """Field keys to include or exclude based on mode."""


class ContextSelector(BaseModel):
    """Full context configuration for LLM suggestions.

    Defines which nodes to include in the context through composable traversal paths
    and which properties to include.
    """

    model_config = ConfigDict(populate_by_name=True)

    paths: list[ContextPath] = Field(default_factory=list)
    """Named traversal paths to gather context nodes.
    If empty, uses default behavior (direct neighbors depth=1)."""

    source_properties: PropertySelector = Field(
        default_factory=PropertySelector, alias="sourceProperties"
    )
    """Which properties to include from the source node."""

    context_properties: PropertySelector = Field(
        default_factory=PropertySelector, alias="contextProperties"
    )
    """Which properties to include from traversed context nodes."""


# ==================== Context Preview Models ====================


class ContextPreviewNode(BaseModel):
    """A node included in the context preview."""

    id: str
    type: str
    title: str
    status: str | None = None
    properties: dict[str, Any] = Field(default_factory=dict)
    path_name: str | None = None
    """Which ContextPath this node came from. None for source node."""

    traversal_depth: int = 0
    """How many hops from source (0 for source node itself)."""


class ContextPreview(BaseModel):
    """Preview of context that would be included in a suggestion."""

    source_node: ContextPreviewNode
    """The source node being suggested from."""

    path_results: dict[str, list[ContextPreviewNode]] = Field(default_factory=dict)
    """Nodes grouped by path name."""

    total_nodes: int = 0
    """Total number of context nodes (excluding source)."""

    total_tokens_estimate: int | None = None
    """Estimated token count for this context (for prompt size awareness)."""


# ==================== Request/Response Models ====================


class ContextPreviewRequest(BaseModel):
    """Request model for context preview endpoint."""

    model_config = ConfigDict(populate_by_name=True)

    context_selector: ContextSelector = Field(
        default_factory=ContextSelector, alias="contextSelector"
    )


class ParseContextSelectorRequest(BaseModel):
    """Request model for parsing natural language to ContextSelector."""

    model_config = ConfigDict(populate_by_name=True)

    description: str
    """Natural language description of desired context."""

    source_type: str | None = Field(default=None, alias="sourceType")
    """Type of the source node (e.g., 'Sample')."""

    edge_type: str | None = Field(default=None, alias="edgeType")
    """Edge type being created (e.g., 'HAS_ANALYSIS')."""

    direction: Literal["outgoing", "incoming"] | None = None
    """Direction of the edge from source node."""

    target_type: str | None = Field(default=None, alias="targetType")
    """Type of node being suggested (e.g., 'Analysis')."""


# ==================== Default Selectors ====================


def default_context_selector(
    edge_type: str | None = None,
    direction: Literal["outgoing", "incoming"] | None = None,
    target_type: str | None = None,
) -> ContextSelector:
    """Create a default context selector for suggestions.

    When edge_type, direction, and target_type are provided (typical for node suggestions),
    creates a selector that includes existing sibling nodes of the target type - nodes
    that already have the same relationship to the source node.

    Example: When suggesting an Analysis for a Sample (outgoing HAS_ANALYSIS edge),
    this finds other Analysis nodes already connected to that Sample.

    Args:
        edge_type: The edge type connecting source to target
        direction: Direction from source node's perspective ("outgoing" = source->target)
        target_type: Type of node being suggested

    Returns:
        ContextSelector configured for the suggestion context
    """
    paths: list[ContextPath] = []

    if edge_type and direction and target_type:
        # Include existing sibling nodes - same type with same relationship to source
        # Direction matches the edge direction from source to target
        paths.append(
            ContextPath(
                name="siblings",
                steps=[EdgeStep(edge_type=edge_type, direction=direction)],
                target_type=target_type,
                max_count=5,
            )
        )
    else:
        # Fallback: direct neighbors when context not provided
        paths.append(
            ContextPath(
                name="neighbors",
                steps=[],  # Empty steps = direct neighbors
                max_count=5,
            )
        )

    return ContextSelector(paths=paths)
