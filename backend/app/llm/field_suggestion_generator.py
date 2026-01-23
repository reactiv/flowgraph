"""Field value suggestion generator using LLM to suggest appropriate field values."""

import json
import logging
from datetime import datetime
from typing import Any

from app.db.graph_store import GraphStore
from app.llm.client import LLMClient, get_client
from app.llm.context_gatherer import ContextGatherer
from app.models import Node, WorkflowDefinition
from app.models.context_pack import ContextPackRequest, ContextResource
from app.models.context_selector import default_context_selector
from app.models.suggestion import (
    FieldValueSuggestion,
    FieldValueSuggestionContext,
    FieldValueSuggestionOptions,
    FieldValueSuggestionResponse,
)
from app.models.workflow import Field, NodeType

logger = logging.getLogger(__name__)


# System prompt for field value suggestion
FIELD_SUGGESTION_SYSTEM_PROMPT = """You are an expert at generating appropriate \
field values based on context.

You will be given:
1. A node with its type, title, status, and existing properties
2. The specific field that needs a value suggested
3. Connected nodes that provide relationship context
4. Examples of similar nodes' values for this field (if available)

Your task is to generate an appropriate value for the specified field.

## Output Format

Return a JSON object with this exact structure:
```json
{
  "suggestions": [
    {
      "value": <suggested value matching field kind>,
      "rationale": "2-3 sentences explaining why this value is appropriate"
    }
  ]
}
```

## Field Kind Rules

- **string**: Generate realistic, domain-appropriate text. Reference connected nodes when relevant.
- **number**: Generate sensible numeric values appropriate for the domain.
- **datetime**: Use ISO format (YYYY-MM-DDTHH:MM:SS). Consider temporal relationships.
- **enum**: MUST use one of the specified allowed values exactly.
- **person**: Generate a realistic full name.
- **json**: Generate appropriate structured data as a JSON object or array.
- **tag[]**: Generate an array of relevant tag strings based on context.
- **file[]**: Return an empty array [] (files cannot be auto-generated).

## Quality Guidelines

1. Make the value coherent with the node's existing properties
2. Reference connected nodes by name/ID where it makes sense
3. Use domain-appropriate terminology based on the workflow context
4. Consider temporal ordering for datetime fields
5. For text fields, be specific and detailed, not generic
6. Only output valid JSON, no markdown or explanations outside the JSON
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


def _format_field_definition(field: Field) -> str:
    """Format a field definition for the prompt."""
    lines = [
        f"Field: {field.key}",
        f"Label: {field.label}",
        f"Kind: {field.kind.value}",
    ]

    if field.required:
        lines.append("Required: Yes")

    if field.values:
        lines.append(f"Allowed values: {field.values}")

    if field.default is not None:
        lines.append(f"Default: {field.default}")

    return "\n".join(lines)


class FieldValueSuggestionGenerator:
    """Generates appropriate field values based on node and graph context."""

    def __init__(
        self,
        llm_client: LLMClient | None = None,
        graph_store: GraphStore | None = None,
        context_gatherer: ContextGatherer | None = None,
    ):
        self._llm_client = llm_client or get_client()
        self._graph_store = graph_store or GraphStore()
        self._context_gatherer = context_gatherer or ContextGatherer(self._graph_store)

    async def suggest_field_value(
        self,
        workflow_id: str,
        node_id: str,
        field_key: str,
        options: FieldValueSuggestionOptions | None = None,
    ) -> FieldValueSuggestionResponse:
        """Generate field value suggestions based on context.

        Args:
            workflow_id: The workflow ID
            node_id: The node whose field needs a value suggestion
            field_key: The key of the field to suggest a value for
            options: Generation options

        Returns:
            FieldValueSuggestionResponse with suggestions and context info
        """
        options = options or FieldValueSuggestionOptions()

        # 1. Gather context
        context = await self._gather_context(workflow_id, node_id, field_key, options)

        # 2. Build prompt
        prompt = self._build_prompt(context, options)

        # 3. Generate via LLM
        try:
            result = await self._llm_client.generate_json(
                prompt=prompt,
                system=FIELD_SUGGESTION_SYSTEM_PROMPT,
                max_tokens=1024,
                temperature=0.7,
            )
        except Exception as e:
            logger.error(f"LLM field suggestion generation failed: {e}")
            raise ValueError(f"Failed to generate field suggestions: {e}") from e

        # 4. Parse and validate
        suggestions = self._parse_and_validate(result, context)

        field_def: Field = context["field_def"]
        source_node: dict[str, Any] = context["source_node"]

        # Count context nodes from path results
        context_nodes_count = sum(
            len(nodes) for nodes in context.get("path_results", {}).values()
        )

        return FieldValueSuggestionResponse(
            suggestions=suggestions,
            context=FieldValueSuggestionContext(
                node_id=node_id,
                node_title=source_node["title"],
                node_type=source_node["type"],
                field_key=field_key,
                field_kind=field_def.kind.value,
                field_label=field_def.label,
                current_value=context.get("current_value"),
                context_nodes_count=context_nodes_count,
                external_refs_included=context.get("external_refs_included", 0),
                stale_refs_count=context.get("stale_refs_count", 0),
                external_warnings=context.get("external_warnings", []),
            ),
        )

    async def _gather_context(
        self,
        workflow_id: str,
        node_id: str,
        field_key: str,
        options: FieldValueSuggestionOptions,
    ) -> dict[str, Any]:
        """Gather all context needed for field value suggestion generation."""
        # Get workflow definition
        definition = await self._graph_store.get_workflow(workflow_id)
        if definition is None:
            raise ValueError(f"Workflow {workflow_id} not found")

        # Get the node
        node = await self._graph_store.get_node(workflow_id, node_id)
        if node is None:
            raise ValueError(f"Node {node_id} not found")

        # Find node type definition
        node_type = next(
            (nt for nt in definition.node_types if nt.type == node.type), None
        )
        if node_type is None:
            raise ValueError(f"Node type {node.type} not found in workflow schema")

        # Find field definition
        field_def = next((f for f in node_type.fields if f.key == field_key), None)
        if field_def is None:
            raise ValueError(
                f"Field '{field_key}' not found in node type '{node.type}'"
            )

        # Get current value if exists
        current_value = node.properties.get(field_key)

        # Use context gatherer with the provided selector or default
        selector = options.context_selector or default_context_selector()

        # Use context pack if external content is requested (default: True)
        if options.external_content.include_projections:
            pack_request = ContextPackRequest(
                refresh_stale=options.external_content.refresh_stale,
                include_snapshots=options.external_content.include_full_content,
            )

            pack_response = await self._context_gatherer.build_context_pack(
                workflow_id, node_id, pack_request, selector
            )

            # Convert resources to source_node and path_results format
            resources = pack_response.pack.resources
            source_resource = resources[0] if resources else None
            context_resources = resources[1:] if len(resources) > 1 else []

            source_node_dict = (
                self._resource_to_node_dict(source_resource)
                if source_resource
                else {"id": node_id, "title": node.title, "type": node.type}
            )
            path_results = self._resources_to_path_results(context_resources)

            # Count external refs and stale refs
            external_refs_count = sum(
                1 for r in resources if r.reference_id is not None
            )
            stale_refs_count = sum(1 for r in resources if r.is_stale)

            return {
                "definition": definition,
                "source_node": source_node_dict,
                "path_results": path_results,
                "node_type": node_type,
                "field_def": field_def,
                "current_value": current_value,
                "external_refs_included": external_refs_count,
                "stale_refs_count": stale_refs_count,
                "external_warnings": pack_response.warnings,
            }
        else:
            # Use simple gather_context (no external reference content)
            gathered = await self._context_gatherer.gather_context(
                workflow_id, node_id, selector
            )

            return {
                "definition": definition,
                "source_node": gathered["source_node"],
                "path_results": gathered["path_results"],
                "node_type": node_type,
                "field_def": field_def,
                "current_value": current_value,
                "external_refs_included": 0,
                "stale_refs_count": 0,
                "external_warnings": [],
            }

    def _build_prompt(
        self, context: dict[str, Any], options: FieldValueSuggestionOptions
    ) -> str:
        """Build the user prompt for field value suggestion generation."""
        source_node: dict[str, Any] = context["source_node"]
        node_type: NodeType = context["node_type"]
        field_def: Field = context["field_def"]
        definition: WorkflowDefinition = context["definition"]
        path_results: dict[str, list[dict[str, Any]]] = context.get("path_results", {})
        current_value: Any = context.get("current_value")

        lines = [
            f"# Suggest Value for Field: {field_def.label}",
            "",
            f"Generate an appropriate value for the **{field_def.label}** field "
            f"of the following **{node_type.display_name}** node.",
            "",
            "## Workflow Context",
            f"Workflow: {definition.name}",
            f"Description: {definition.description}",
            "",
            "## Target Field",
            _format_field_definition(field_def),
            "",
        ]

        # Current value if exists
        if current_value is not None and current_value != "":
            lines.append("## Current Value")
            val_str = str(current_value)
            if len(val_str) > 300:
                val_str = val_str[:300] + "..."
            lines.append(f"The field currently has value: {val_str}")
            lines.append(
                "(Generate a better or alternative value, not necessarily the same)"
            )
            lines.append("")

        # Node context
        lines.append("## Node Being Updated")
        lines.append(_format_node_for_prompt(source_node))
        lines.append("")

        # Add context nodes from path results
        total_context_nodes = sum(len(nodes) for nodes in path_results.values())
        if total_context_nodes > 0:
            lines.append("## Context")
            lines.append(
                "The following nodes provide context for generating an appropriate value."
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
            f"Generate {options.num_suggestions} suggestion(s) for the "
            f"**{field_def.label}** ({field_def.kind.value}) field."
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
    ) -> list[FieldValueSuggestion]:
        """Parse and validate LLM suggestions."""
        field_def: Field = context["field_def"]
        suggestions_data = result.get("suggestions", [])

        if not suggestions_data:
            logger.warning("LLM returned no field suggestions")
            return []

        suggestions: list[FieldValueSuggestion] = []

        for suggestion_data in suggestions_data:
            try:
                suggestion = self._parse_single_suggestion(suggestion_data, field_def)
                suggestions.append(suggestion)
            except Exception as e:
                logger.warning(f"Skipping invalid field suggestion: {e}")
                continue

        return suggestions

    def _parse_single_suggestion(
        self, data: dict[str, Any], field_def: Field
    ) -> FieldValueSuggestion:
        """Parse and validate a single field value suggestion."""
        value = data.get("value")
        if value is None:
            raise ValueError("Suggestion missing required 'value' field")

        # Validate and coerce based on field kind
        validated_value = self._coerce_field_value(value, field_def)

        return FieldValueSuggestion(
            value=validated_value,
            rationale=data.get("rationale", "Generated based on context."),
        )

    def _coerce_field_value(self, value: Any, field: Field) -> Any:
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
