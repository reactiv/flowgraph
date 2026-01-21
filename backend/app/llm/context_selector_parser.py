"""LLM-powered parser for natural language to ContextSelector.

Converts user descriptions like "Include all sibling analyses"
into structured ContextSelector configurations.

Uses Gemini with structured outputs for reliable JSON generation.
"""

import logging
from typing import Literal

from google import genai
from google.genai import types
from pydantic import BaseModel, Field

from app.models import WorkflowDefinition
from app.models.context_selector import (
    ContextPath,
    ContextSelector,
    EdgeStep,
    PropertySelector,
)

logger = logging.getLogger(__name__)


# Pydantic models for Gemini structured output
class LLMEdgeStep(BaseModel):
    """A single edge traversal step."""

    edge_type: str = Field(description="The edge type to traverse (must exist in schema)")
    direction: Literal["outgoing", "incoming"] = Field(
        description="outgoing: FromNode→ToNode, incoming: ToNode→FromNode"
    )


class LLMContextPath(BaseModel):
    """A traversal path to gather context nodes."""

    name: str = Field(description="Unique name for this path")
    steps: list[LLMEdgeStep] = Field(description="Edge traversal steps")
    target_type: str | None = Field(
        default=None, description="Filter results to this node type"
    )
    max_count: int = Field(default=10, description="Maximum nodes to return")
    from_path: str | None = Field(
        default=None, description="Start from another path's results instead of source"
    )


class LLMContextSelector(BaseModel):
    """Configuration for gathering context nodes via graph traversal."""

    paths: list[LLMContextPath] = Field(description="Traversal paths to execute")


PARSE_SYSTEM_PROMPT = """Convert the user's natural language description into a \
ContextSelector for graph traversal.

## Edge Format
Edges are defined as: EdgeType: FromNode → ToNode

## Direction Rules
- "outgoing": You are at FromNode, moving to ToNode
- "incoming": You are at ToNode, moving to FromNode

## Multi-hop
Chain paths using from_path to start from another path's results.
"""


class ContextSelectorParser:
    """Parses natural language descriptions into ContextSelector configurations.

    Uses Gemini with structured outputs for reliable JSON generation.
    """

    def __init__(self) -> None:
        self._client = genai.Client()

    async def parse(
        self,
        description: str,
        workflow_definition: WorkflowDefinition,
        source_type: str | None = None,
        edge_type: str | None = None,
        direction: Literal["outgoing", "incoming"] | None = None,
        target_type: str | None = None,
    ) -> ContextSelector:
        """Parse a natural language description into a ContextSelector.

        Args:
            description: Natural language description of desired context.
            workflow_definition: The workflow schema for valid types.
            source_type: Type of the source node (e.g., 'Sample').
            edge_type: Edge type being created (e.g., 'HAS_ANALYSIS').
            direction: Direction of the edge from source node.
            target_type: Type of node being suggested (e.g., 'Analysis').

        Returns:
            A ContextSelector configuration.
        """
        prompt = self._build_prompt(
            description=description,
            workflow_definition=workflow_definition,
            source_type=source_type,
            edge_type=edge_type,
            direction=direction,
            target_type=target_type,
        )

        logger.info("=== Context Selector Parser (Gemini) ===")
        logger.info("User prompt:\n%s", prompt)

        try:
            response = await self._client.aio.models.generate_content(
                model="gemini-3-flash-preview",
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=PARSE_SYSTEM_PROMPT,
                    temperature=0.2,
                    response_mime_type="application/json",
                    response_schema=LLMContextSelector.model_json_schema(),
                ),
            )
            llm_result = LLMContextSelector.model_validate_json(response.text)
        except Exception as e:
            logger.error(f"Gemini parsing failed: {e}")
            raise ValueError(f"Failed to parse context description: {e}") from e

        logger.info("Gemini result:\n%s", llm_result)
        selector = self._convert_result(llm_result)

        # Validate and fix traversals against schema
        selector = self._validate_selector(
            selector, workflow_definition, source_type
        )
        return selector

    def _build_prompt(
        self,
        description: str,
        workflow_definition: WorkflowDefinition,
        source_type: str | None = None,
        edge_type: str | None = None,
        direction: Literal["outgoing", "incoming"] | None = None,
        target_type: str | None = None,
    ) -> str:
        """Build the prompt with schema and context information."""
        # Build schema section
        node_types = [nt.type for nt in workflow_definition.node_types]
        edge_info = [
            f"{et.type}: {et.from_type} → {et.to_type}"
            for et in workflow_definition.edge_types
        ]

        # Build context section if available
        context_lines = []
        if source_type:
            context_lines.append(f"Source node type: {source_type}")
        if target_type:
            context_lines.append(f"Suggesting node type: {target_type}")
        if edge_type and direction:
            context_lines.append(f"Via edge: {edge_type} ({direction})")

        context_section = ""
        if context_lines:
            context_section = f"""
## Current Context
{chr(10).join(context_lines)}
"""

        return f"""## Schema
Node types: {', '.join(node_types)}
Edges: {'; '.join(edge_info)}
{context_section}
## User Request
"{description}"
"""

    def _convert_result(self, llm_result: LLMContextSelector) -> ContextSelector:
        """Convert LLM result to internal ContextSelector model."""
        paths = []
        for llm_path in llm_result.paths:
            steps = [
                EdgeStep(edge_type=s.edge_type, direction=s.direction)
                for s in llm_path.steps
            ]
            paths.append(
                ContextPath(
                    name=llm_path.name,
                    steps=steps,
                    target_type=llm_path.target_type,
                    max_count=llm_path.max_count,
                    from_path=llm_path.from_path,
                    global_query=False,
                )
            )

        return ContextSelector(
            paths=paths,
            source_properties=PropertySelector(),
            context_properties=PropertySelector(),
        )

    def _validate_selector(
        self,
        selector: ContextSelector,
        workflow_definition: WorkflowDefinition,
        source_type: str | None,
    ) -> ContextSelector:
        """Validate and fix traversal paths against the schema.

        Removes invalid steps/paths that reference non-existent edges or
        use directions that are impossible from the current position.
        """
        # Build edge lookup: edge_type -> (from_type, to_type)
        edge_schema: dict[str, tuple[str, str]] = {}
        for et in workflow_definition.edge_types:
            edge_schema[et.type] = (et.from_type, et.to_type)

        # Track path results for from_path resolution
        path_result_types: dict[str, set[str]] = {}

        valid_paths: list[ContextPath] = []

        for path in selector.paths:
            # Determine starting position(s)
            if path.from_path and path.from_path in path_result_types:
                current_types = path_result_types[path.from_path]
            elif path.global_query:
                # Global query doesn't start from source
                current_types = set()
            elif source_type:
                current_types = {source_type}
            else:
                # Can't validate without knowing start type
                valid_paths.append(path)
                continue

            # Validate each step
            valid_steps: list[EdgeStep] = []
            for step in path.steps:
                if step.edge_type not in edge_schema:
                    logger.warning(
                        f"Path '{path.name}': Edge type '{step.edge_type}' "
                        "does not exist in schema, removing step"
                    )
                    continue

                from_type, to_type = edge_schema[step.edge_type]

                if not current_types:
                    # No starting types (global query), accept the step
                    valid_steps.append(step)
                    if step.direction == "outgoing":
                        current_types = {to_type}
                    else:
                        current_types = {from_type}
                    continue

                # Check if direction is valid from current position
                if step.direction == "outgoing":
                    # Must be at from_type to go outgoing
                    if from_type in current_types:
                        valid_steps.append(step)
                        current_types = {to_type}
                    else:
                        logger.warning(
                            f"Path '{path.name}': Cannot traverse '{step.edge_type}' "
                            f"outgoing from {current_types} (need to be at {from_type})"
                        )
                else:  # incoming
                    # Must be at to_type to go incoming
                    if to_type in current_types:
                        valid_steps.append(step)
                        current_types = {from_type}
                    else:
                        logger.warning(
                            f"Path '{path.name}': Cannot traverse '{step.edge_type}' "
                            f"incoming from {current_types} (need to be at {to_type})"
                        )

            # Only include path if it has valid steps (or is a global query)
            if valid_steps or path.global_query:
                valid_path = ContextPath(
                    name=path.name,
                    steps=valid_steps,
                    target_type=path.target_type,
                    max_count=path.max_count,
                    from_path=path.from_path,
                    include_intermediate=path.include_intermediate,
                    global_query=path.global_query,
                )
                valid_paths.append(valid_path)

                # Track result types for from_path resolution
                if current_types:
                    path_result_types[path.name] = current_types
            else:
                logger.warning(
                    f"Path '{path.name}': No valid steps remain after validation, "
                    "removing path"
                )

        # Fix dangling from_path references
        valid_path_names = {p.name for p in valid_paths}
        fixed_paths: list[ContextPath] = []
        for path in valid_paths:
            if path.from_path and path.from_path not in valid_path_names:
                logger.warning(
                    f"Path '{path.name}': from_path '{path.from_path}' was removed, "
                    "clearing reference (path will start from source)"
                )
                fixed_paths.append(
                    ContextPath(
                        name=path.name,
                        steps=path.steps,
                        target_type=path.target_type,
                        max_count=path.max_count,
                        from_path=None,  # Clear dangling reference
                        include_intermediate=path.include_intermediate,
                        global_query=path.global_query,
                    )
                )
            else:
                fixed_paths.append(path)

        return ContextSelector(
            paths=fixed_paths,
            source_properties=selector.source_properties,
            context_properties=selector.context_properties,
        )
