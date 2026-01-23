"""Node suggestion generator using LLM to suggest contextually appropriate nodes."""

import json
import logging
from datetime import datetime
from typing import Any, Literal

from app.db.graph_store import GraphStore
from app.llm.client import LLMClient, get_client
from app.llm.context_gatherer import ContextGatherer
from app.models import Node, NodeCreate, WorkflowDefinition
from app.models.context_pack import ContextPackRequest, ContextResource
from app.models.context_selector import default_context_selector
from app.models.suggestion import (
    NodeSuggestion,
    SuggestionContext,
    SuggestionOptions,
    SuggestionResponse,
)
from app.models.workflow import EdgeType, NodeType

logger = logging.getLogger(__name__)


# System prompt for node suggestion
SUGGESTION_SYSTEM_PROMPT = """You are an expert at generating workflow nodes based on context.

You will be given:
1. A source node with its type, title, status, and properties
2. The relationship (edge type) that will connect the source to the suggested node
3. The target node type definition with its fields and constraints
4. Examples of similar nodes (if available)
5. Connected nodes that provide additional context

Your task is to generate a new node that would be appropriate to link to the source node
via the specified relationship.

## Output Format

Return a JSON object with this exact structure:
```json
{
  "suggestions": [
    {
      "title": "Node title (required)",
      "status": "Initial status from available states",
      "properties": {
        "field_key": "value matching field kind",
        ...
      },
      "rationale": "2-3 sentences explaining why this node is appropriate"
    }
  ]
}
```

## Field Generation Rules

- **string**: Generate realistic, domain-appropriate text
- **number**: Generate sensible numeric values
- **datetime**: Use ISO format (YYYY-MM-DDTHH:MM:SS)
- **enum**: MUST use one of the specified values exactly
- **person**: Generate a realistic name
- **json**: Generate appropriate structured data
- **tag[]**: Generate an array of relevant tag strings
- **file[]**: Leave as empty array [] (files can't be auto-generated)

## Quality Guidelines

1. Reference the source node by name/ID where relevant in text fields
2. Make properties coherent with the relationship to the source node
3. Use domain-appropriate terminology based on the workflow context
4. Only output valid JSON, no markdown or explanations outside the JSON
"""


def _format_node_for_prompt(node: Node | dict[str, Any]) -> str:
    """Format a node for inclusion in a prompt.

    Supports external reference content via special keys:
    - external_summary: Summary text from projection
    - external_status: Status from external system
    - external_owner: Owner from external system
    - is_stale: Whether the external data may be stale
    """
    if isinstance(node, Node):
        node = node.model_dump()

    lines = [
        f"Type: {node['type']}",
        f"Title: {node['title']}",
    ]
    if node.get("status"):
        lines.append(f"Status: {node['status']}")

    # Include external reference content if present
    if node.get("external_summary") or node.get("external_status") or node.get("external_owner"):
        lines.append("")
        lines.append("**External Content:**")
        if node.get("external_summary"):
            summary = node["external_summary"]
            if len(summary) > 500:
                summary = summary[:500] + "..."
            lines.append(f"Summary: {summary}")
        if node.get("external_status"):
            lines.append(f"External Status: {node['external_status']}")
        if node.get("external_owner"):
            lines.append(f"Owner: {node['external_owner']}")
        if node.get("is_stale"):
            lines.append("*Note: External data may be stale*")

    props = node.get("properties", {})
    if props:
        lines.append("Properties:")
        for key, value in props.items():
            if value is not None and value != "":
                # Truncate long values
                val_str = str(value)
                if len(val_str) > 200:
                    val_str = val_str[:200] + "..."
                lines.append(f"  - {key}: {val_str}")

    return "\n".join(lines)


def _format_node_type_schema(node_type: NodeType) -> str:
    """Format a node type definition for the prompt."""
    lines = [
        f"## {node_type.type} ({node_type.display_name})",
        f"Title field: {node_type.title_field}",
    ]

    if node_type.subtitle_field:
        lines.append(f"Subtitle field: {node_type.subtitle_field}")

    # States
    if node_type.states and node_type.states.enabled:
        lines.append(f"Initial status: {node_type.states.initial}")
        lines.append(f"Available statuses: {node_type.states.values}")

    # Fields
    lines.append("\nFields:")
    for field in node_type.fields:
        field_line = f"  - {field.key} ({field.kind.value})"
        if field.required:
            field_line += " [required]"
        if field.values:
            field_line += f" values: {field.values}"
        lines.append(field_line)

    return "\n".join(lines)


def _get_relationship_verb(
    edge_type: EdgeType, direction: Literal["incoming", "outgoing"]
) -> str:
    """Get a human-readable verb for the relationship."""
    display = edge_type.display_name or edge_type.type.lower().replace("_", " ")

    if direction == "outgoing":
        # Source → Target: "Sample HAS_ANALYSIS Analysis" → "has"
        return display
    else:
        # Target → Source: "ExperimentPlan TESTS Hypothesis" → "tests"
        # From source's perspective: "is tested by"
        return f"is {display} by" if not display.startswith("is") else display


class NodeSuggestionGenerator:
    """Generates contextually appropriate nodes based on graph context."""

    def __init__(
        self,
        llm_client: LLMClient | None = None,
        graph_store: GraphStore | None = None,
        context_gatherer: ContextGatherer | None = None,
    ):
        self._llm_client = llm_client or get_client()
        self._graph_store = graph_store or GraphStore()
        self._context_gatherer = context_gatherer or ContextGatherer(self._graph_store)

    async def suggest_node(
        self,
        workflow_id: str,
        source_node_id: str,
        edge_type: str,
        direction: Literal["incoming", "outgoing"],
        options: SuggestionOptions | None = None,
    ) -> SuggestionResponse:
        """Generate node suggestions based on context.

        Args:
            workflow_id: The workflow ID
            source_node_id: The node to suggest a connection for
            edge_type: The edge type that will connect source to suggested node
            direction: Direction of edge relative to source node
                - "outgoing": source → suggested (e.g., Sample → Analysis)
                - "incoming": suggested → source (e.g., ExperimentPlan → Hypothesis)
            options: Generation options

        Returns:
            SuggestionResponse with suggestions and context info
        """
        options = options or SuggestionOptions()

        # 1. Gather context
        context = await self._gather_context(
            workflow_id, source_node_id, edge_type, direction, options
        )

        # 2. Build prompt
        prompt = self._build_prompt(context, options)

        # 3. Generate via LLM
        try:
            result = await self._llm_client.generate_json(
                prompt=prompt,
                system=SUGGESTION_SYSTEM_PROMPT,
                max_tokens=2048,
                temperature=0.7,
            )
        except Exception as e:
            logger.error(f"LLM suggestion generation failed: {e}")
            raise ValueError(f"Failed to generate suggestions: {e}") from e

        # 4. Parse and validate
        suggestions = self._parse_and_validate(result, context)

        # Count context nodes from path results
        context_nodes_count = sum(
            len(nodes) for nodes in context.get("path_results", {}).values()
        )

        return SuggestionResponse(
            suggestions=suggestions,
            context=SuggestionContext(
                source_node_id=source_node_id,
                source_node_title=context["source_node"]["title"],
                source_node_type=context["source_node"]["type"],
                edge_type=edge_type,
                direction=direction,
                target_node_type=context["target_type"].type,
                context_nodes_count=context_nodes_count,
                external_refs_included=context.get("external_refs_included", 0),
                stale_refs_count=context.get("stale_refs_count", 0),
                external_warnings=context.get("external_warnings", []),
            ),
        )

    async def _gather_context(
        self,
        workflow_id: str,
        source_node_id: str,
        edge_type: str,
        direction: Literal["incoming", "outgoing"],
        options: SuggestionOptions,
    ) -> dict[str, Any]:
        """Gather all context needed for suggestion generation."""
        # Get workflow definition
        definition = await self._graph_store.get_workflow(workflow_id)
        if definition is None:
            raise ValueError(f"Workflow {workflow_id} not found")

        # Find edge type definition
        edge_type_def = next(
            (et for et in definition.edge_types if et.type == edge_type), None
        )
        if edge_type_def is None:
            raise ValueError(f"Edge type {edge_type} not found in workflow schema")

        # Determine target node type based on direction
        if direction == "outgoing":
            # source → target: edge goes from source to suggested node
            # Edge definition: from_type → to_type, so target is to_type
            target_type_name = edge_type_def.to_type
        else:
            # suggested → source: edge goes from suggested node to source
            # Edge definition: from_type → to_type, so suggested node is from_type
            target_type_name = edge_type_def.from_type

        # Get target node type definition
        target_type = next(
            (nt for nt in definition.node_types if nt.type == target_type_name), None
        )
        if target_type is None:
            raise ValueError(
                f"Target node type {target_type_name} not found in workflow schema"
            )

        # Use context gatherer with the provided selector or default
        selector = options.context_selector or default_context_selector()

        # Use context pack if external content is requested (default: True)
        if options.external_content.include_projections:
            pack_request = ContextPackRequest(
                refresh_stale=options.external_content.refresh_stale,
                include_snapshots=options.external_content.include_full_content,
            )

            pack_response = await self._context_gatherer.build_context_pack(
                workflow_id, source_node_id, pack_request, selector
            )

            # Convert resources to source_node and path_results format
            resources = pack_response.pack.resources
            source_resource = resources[0] if resources else None
            context_resources = resources[1:] if len(resources) > 1 else []

            source_node = (
                self._resource_to_node_dict(source_resource)
                if source_resource
                else {"id": source_node_id, "title": "Unknown", "type": "Unknown"}
            )
            path_results = self._resources_to_path_results(context_resources)

            # Count external refs and stale refs
            external_refs_count = sum(
                1 for r in resources if r.reference_id is not None
            )
            stale_refs_count = sum(1 for r in resources if r.is_stale)

            return {
                "definition": definition,
                "source_node": source_node,
                "path_results": path_results,
                "edge_type_def": edge_type_def,
                "target_type": target_type,
                "direction": direction,
                "external_refs_included": external_refs_count,
                "stale_refs_count": stale_refs_count,
                "external_warnings": pack_response.warnings,
            }
        else:
            # Use simple gather_context (no external reference content)
            gathered = await self._context_gatherer.gather_context(
                workflow_id, source_node_id, selector
            )

            return {
                "definition": definition,
                "source_node": gathered["source_node"],
                "path_results": gathered["path_results"],
                "edge_type_def": edge_type_def,
                "target_type": target_type,
                "direction": direction,
                "external_refs_included": 0,
                "stale_refs_count": 0,
                "external_warnings": [],
            }

    def _resource_to_node_dict(self, resource: ContextResource) -> dict[str, Any]:
        """Convert a ContextResource to node dict format for prompts.

        Includes external content fields when available from projections.
        """
        result: dict[str, Any] = {
            "id": resource.node_id,
            "title": resource.title or "Untitled",
            "type": resource.node_type or "Unknown",
            "properties": resource.properties or {},
            "path_name": resource.path_name,
            "traversal_depth": resource.hop_depth,
        }

        # Include external content if present
        if resource.content:
            result["external_summary"] = resource.content
        if resource.projection:
            if resource.projection.status:
                result["external_status"] = resource.projection.status
            if resource.projection.owner:
                result["external_owner"] = resource.projection.owner
            result["is_stale"] = resource.is_stale
            result["external_source"] = resource.reference_id

        return result

    def _resources_to_path_results(
        self, resources: list[ContextResource]
    ) -> dict[str, list[dict[str, Any]]]:
        """Group ContextResources by path_name for prompt formatting."""
        path_results: dict[str, list[dict[str, Any]]] = {}
        for resource in resources:
            path_name = resource.path_name
            if path_name not in path_results:
                path_results[path_name] = []
            path_results[path_name].append(self._resource_to_node_dict(resource))
        return path_results

    def _build_prompt(self, context: dict[str, Any], options: SuggestionOptions) -> str:
        """Build the user prompt for suggestion generation."""
        source_node: dict[str, Any] = context["source_node"]
        edge_type_def: EdgeType = context["edge_type_def"]
        target_type: NodeType = context["target_type"]
        definition: WorkflowDefinition = context["definition"]
        direction: str = context["direction"]
        path_results: dict[str, list[dict[str, Any]]] = context.get("path_results", {})

        relationship_verb = _get_relationship_verb(edge_type_def, direction)

        lines = [
            f"# Generate a {target_type.type} Node",
            "",
            f"Generate a **{target_type.display_name}** node that {relationship_verb} "
            f"the following **{source_node['type']}**.",
            "",
            "## Workflow Context",
            f"Workflow: {definition.name}",
            f"Description: {definition.description}",
            "",
            "## Source Node",
            _format_node_for_prompt(source_node),
            "",
            "## Target Node Schema",
            _format_node_type_schema(target_type),
            "",
        ]

        # Add context nodes from path results
        total_context_nodes = sum(len(nodes) for nodes in path_results.values())
        if total_context_nodes > 0:
            lines.append("## Context")
            lines.append(
                "The following nodes provide context for generating an appropriate suggestion."
            )
            lines.append("")

            for path_name, nodes in path_results.items():
                if not nodes:
                    continue
                lines.append(f"### {path_name} ({len(nodes)} node(s))")
                for node in nodes[:5]:  # Limit to 5 per path
                    lines.append(f"\n#### {node['title']} ({node['type']})")
                    lines.append(_format_node_for_prompt(node))
                lines.append("")

        # Final instruction
        lines.append(
            f"Generate {options.num_suggestions} suggestion(s) for a new "
            f"**{target_type.type}** that would be appropriate to link to "
            f"'{source_node['title']}' via the **{edge_type_def.type}** relationship."
        )

        # Add user guidance if provided
        if options.guidance and options.guidance.strip():
            lines.append("")
            lines.append("## User Guidance")
            lines.append(
                "The user has provided the following guidance for this suggestion. "
                "Please incorporate their preferences and direction:"
            )
            lines.append(f"\n> {options.guidance.strip()}")

        # Add current date for datetime fields
        lines.append(f"\nCurrent date/time for reference: {datetime.utcnow().isoformat()}")

        return "\n".join(lines)

    def _parse_and_validate(
        self, result: dict[str, Any], context: dict[str, Any]
    ) -> list[NodeSuggestion]:
        """Parse and validate LLM suggestions."""
        target_type: NodeType = context["target_type"]
        suggestions_data = result.get("suggestions", [])

        if not suggestions_data:
            logger.warning("LLM returned no suggestions")
            return []

        suggestions: list[NodeSuggestion] = []

        for suggestion_data in suggestions_data:
            try:
                suggestion = self._parse_single_suggestion(suggestion_data, target_type)
                suggestions.append(suggestion)
            except Exception as e:
                logger.warning(f"Skipping invalid suggestion: {e}")
                continue

        return suggestions

    def _parse_single_suggestion(
        self, data: dict[str, Any], target_type: NodeType
    ) -> NodeSuggestion:
        """Parse and validate a single suggestion."""
        title = data.get("title")
        if not title:
            raise ValueError("Suggestion missing required 'title' field")

        # Validate and coerce status
        status = data.get("status")
        if target_type.states and target_type.states.enabled:
            if status and status not in target_type.states.values:
                logger.warning(
                    f"Invalid status '{status}', using initial: {target_type.states.initial}"
                )
                status = target_type.states.initial
            elif not status:
                status = target_type.states.initial

        # Validate properties
        properties = data.get("properties", {})
        validated_props = self._validate_properties(properties, target_type)

        # Create NodeCreate object
        node_create = NodeCreate(
            type=target_type.type,
            title=title,
            status=status,
            properties=validated_props,
        )

        return NodeSuggestion(
            node=node_create,
            rationale=data.get("rationale", "Generated based on context."),
        )

    def _validate_properties(
        self, properties: dict[str, Any], target_type: NodeType
    ) -> dict[str, Any]:
        """Validate and coerce property values based on field definitions."""
        valid_fields = {f.key: f for f in target_type.fields}
        validated: dict[str, Any] = {}

        for key, value in properties.items():
            if key not in valid_fields:
                logger.warning(f"Skipping unknown property '{key}'")
                continue

            field = valid_fields[key]

            # Skip null/empty values for optional fields
            if value is None or value == "":
                continue

            # Validate based on field kind
            try:
                validated[key] = self._coerce_field_value(value, field)
            except Exception as e:
                logger.warning(f"Skipping invalid value for '{key}': {e}")
                continue

        # Check for required fields
        for field in target_type.fields:
            if field.required and field.key not in validated:
                logger.warning(f"Required field '{field.key}' not provided")

        return validated

    def _coerce_field_value(self, value: Any, field: Any) -> Any:
        """Coerce a value to match the field's expected type."""
        kind = field.kind.value

        if kind == "string":
            return str(value)

        elif kind == "number":
            if isinstance(value, (int, float)):
                return value
            return float(value)

        elif kind == "datetime":
            # Ensure ISO format
            if isinstance(value, str):
                # Validate by parsing
                datetime.fromisoformat(value.replace("Z", "+00:00"))
                return value
            return str(value)

        elif kind == "enum":
            # Must match exactly
            if field.values and str(value) not in field.values:
                raise ValueError(
                    f"Value '{value}' not in enum values: {field.values}"
                )
            return str(value)

        elif kind == "person":
            return str(value)

        elif kind == "json":
            if isinstance(value, (dict, list)):
                return value
            return json.loads(value) if isinstance(value, str) else value

        elif kind == "tag[]":
            if isinstance(value, list):
                return [str(v) for v in value]
            return [str(value)]

        elif kind == "file[]":
            # Files can't be auto-generated, return empty
            return []

        else:
            # Unknown kind, pass through
            return value
