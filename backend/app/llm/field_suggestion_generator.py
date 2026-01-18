"""Field value suggestion generator using LLM to suggest appropriate field values."""

import json
import logging
from datetime import datetime
from typing import Any

from app.db.graph_store import GraphStore
from app.llm.client import LLMClient, get_client
from app.models import Node, WorkflowDefinition
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
    """Format a node for inclusion in a prompt."""
    if isinstance(node, Node):
        node = node.model_dump()

    lines = [
        f"Type: {node['type']}",
        f"Title: {node['title']}",
    ]
    if node.get("status"):
        lines.append(f"Status: {node['status']}")

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
        self, llm_client: LLMClient | None = None, graph_store: GraphStore | None = None
    ):
        self._llm_client = llm_client or get_client()
        self._graph_store = graph_store or GraphStore()

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
        node: Node = context["node"]

        return FieldValueSuggestionResponse(
            suggestions=suggestions,
            context=FieldValueSuggestionContext(
                node_id=node_id,
                node_title=node.title,
                node_type=node.type,
                field_key=field_key,
                field_kind=field_def.kind.value,
                field_label=field_def.label,
                current_value=context.get("current_value"),
                similar_values_count=len(context.get("similar_values", [])),
                neighbors_count=context.get("neighbors_count", 0),
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

        # Get neighbors for context
        neighbors = await self._graph_store.get_neighbors(workflow_id, node_id)
        all_neighbors = neighbors.get("outgoing", []) + neighbors.get("incoming", [])

        # Get similar nodes' values for this field as examples
        similar_values: list[Any] = []
        if options.include_similar and options.max_similar_examples > 0:
            similar_nodes, _ = await self._graph_store.query_nodes(
                workflow_id,
                node_type=node.type,
                limit=options.max_similar_examples + 5,  # Get extra to filter
            )
            # Extract values for this field from similar nodes (excluding current node)
            for similar_node in similar_nodes:
                if similar_node.id == node_id:
                    continue
                val = similar_node.properties.get(field_key)
                if val is not None and val != "" and val not in similar_values:
                    similar_values.append(val)
                if len(similar_values) >= options.max_similar_examples:
                    break

        return {
            "definition": definition,
            "node": node,
            "node_type": node_type,
            "field_def": field_def,
            "current_value": current_value,
            "neighbors": all_neighbors,
            "neighbors_count": len(all_neighbors),
            "similar_values": similar_values,
        }

    def _build_prompt(
        self, context: dict[str, Any], options: FieldValueSuggestionOptions
    ) -> str:
        """Build the user prompt for field value suggestion generation."""
        node: Node = context["node"]
        node_type: NodeType = context["node_type"]
        field_def: Field = context["field_def"]
        definition: WorkflowDefinition = context["definition"]
        neighbors: list = context["neighbors"]
        similar_values: list = context.get("similar_values", [])
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
        lines.append(_format_node_for_prompt(node))
        lines.append("")

        # Connected nodes for context
        if neighbors:
            lines.append("## Connected Nodes (for context)")
            for item in neighbors[:5]:  # Limit to 5 neighbors
                neighbor_node = item["node"]
                edge = item["edge"]
                lines.append(f"\n### {neighbor_node['type']} (via {edge['type']})")
                lines.append(_format_node_for_prompt(neighbor_node))
            lines.append("")

        # Similar values as examples
        if similar_values:
            lines.append(f"## Example Values from Similar {node_type.type} Nodes")
            for i, val in enumerate(similar_values[:5], 1):
                val_str = str(val)
                if len(val_str) > 200:
                    val_str = val_str[:200] + "..."
                lines.append(f"{i}. {val_str}")
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
