"""View template generator from natural language descriptions."""

import logging

from pydantic import ValidationError

from app.llm.client import LLMClient, get_client
from app.models import WorkflowDefinition
from app.models.workflow import (
    GanttConfig,
    KanbanConfig,
    LevelConfig,
    ViewStyle,
    ViewTemplateCreate,
)

logger = logging.getLogger(__name__)

VIEW_GENERATION_SYSTEM = """You are a view template generator for a workflow management system.

Create declarative view configurations that define how to display workflow data.

## View Styles

**kanban**: Group items in columns by a field value
- groupByField: The field key to group by (e.g., "status")
- columnOrder: Array of values in display order
- columnColors: Map of value to hex color (semantic colors preferred)
- cardTemplate.bodyFields: Array of field keys to show in card body

**gantt**: Show items as duration bars on a timeline
- startDateField: The field key containing the start date (must be datetime type)
- endDateField: The field key containing the end date (must be datetime type)
- progressField: Optional field with percentage (0-100) for progress indicator
- labelField: Optional field to display on the bar (defaults to title)
- groupByField: Optional field to group rows (e.g., by assignee or priority)
- timeScale: "day" | "week" | "month" (default: "week")
- statusColors: Map of status value to hex color for bar coloring
- dependencyEdgeTypes: Array of edge types that represent task dependencies (optional)

## Response Format

Return ONLY valid JSON:
{
  "name": "View Name",
  "description": "Brief description",
  "rootType": "ExactNodeTypeName",
  "levels": {
    "ExactNodeTypeName": {
      "style": "kanban",
      "styleConfig": {
        "groupByField": "status",
        "columnOrder": ["Pending", "In Progress", "Complete"],
        "columnColors": {
          "Pending": "#64748b",
          "In Progress": "#3b82f6",
          "Complete": "#22c55e",
          "Failed": "#ef4444",
          "Archived": "#475569"
        },
        "allowDrag": true,
        "showCounts": true,
        "showEmptyColumns": true,
        "cardTemplate": {
          "titleField": "field_key",
          "subtitleField": "field_key",
          "statusField": "status",
          "bodyFields": ["author"]
        }
      }
    }
  }
}

## Color Guidelines
- Pending/Draft/Proposed: grey (#64748b)
- In Progress/Active: blue (#3b82f6)
- Complete/Validated: green (#22c55e)
- Failed/Rejected: red (#ef4444)
- Archived/Dismissed: dark grey (#475569)

## Rules
- rootType MUST exactly match a node type name from the schema
- All field keys MUST exactly match keys from the schema (they are quoted in the schema)
- Include columnColors for all values in columnOrder
- Include relevant fields in bodyFields (e.g., author, date, type fields)
- Only output valid JSON, no markdown or explanations
"""


def _build_schema_context(definition: WorkflowDefinition) -> str:
    """Build a description of the workflow schema for the LLM."""
    lines = ["## Workflow Schema", f"Name: {definition.name}", ""]

    lines.append("### Node Types")
    for nt in definition.node_types:
        lines.append(f"\n**{nt.type}**")

        lines.append("  Fields (use these exact keys):")
        for field in nt.fields:
            field_desc = f'    - "{field.key}": {field.kind.value}'
            if field.values:
                field_desc += f" (values: {field.values})"
            lines.append(field_desc)

        lines.append(f'  Title field: "{nt.title_field}"')
        if nt.subtitle_field:
            lines.append(f'  Subtitle field: "{nt.subtitle_field}"')

    return "\n".join(lines)


class ViewGenerator:
    """Generates view templates from natural language descriptions."""

    def __init__(self, llm_client: LLMClient | None = None):
        self._llm_client = llm_client or get_client()

    async def generate_view(
        self, description: str, workflow_definition: WorkflowDefinition
    ) -> ViewTemplateCreate:
        """Generate a view template from a natural language description."""
        schema_context = _build_schema_context(workflow_definition)

        prompt = f"""Create a view template for this request:

"{description}"

{schema_context}

Generate a JSON view template using exact field keys from the schema."""

        try:
            result = await self._llm_client.generate_json(
                prompt=prompt,
                system=VIEW_GENERATION_SYSTEM,
                max_tokens=2048,
                temperature=0.2,
            )
        except Exception as e:
            logger.error(f"LLM generation failed: {e}")
            raise ValueError(f"Failed to generate view: {e}") from e

        try:
            view = self._parse_and_validate(result, workflow_definition)
        except ValidationError as e:
            logger.error(f"Generated view validation failed: {e}")
            raise ValueError(f"Generated view is invalid: {e}") from e

        return view

    def _parse_and_validate(
        self, result: dict, definition: WorkflowDefinition
    ) -> ViewTemplateCreate:
        """Parse and validate the LLM result against the schema."""
        # Validate rootType
        valid_types = {nt.type for nt in definition.node_types}
        root_type = result.get("rootType")
        if root_type not in valid_types:
            raise ValueError(
                f"Invalid rootType '{root_type}'. Must be one of: {valid_types}"
            )

        # Get the node type definition
        node_type_def = next(
            nt for nt in definition.node_types if nt.type == root_type
        )

        # Build set of valid field keys (status is now a regular field)
        valid_fields = {f.key for f in node_type_def.fields}

        # Process and validate levels
        levels = result.get("levels", {})
        if not levels:
            raise ValueError("No levels defined in view template")

        processed_levels = {}
        for node_type_name, level_config in levels.items():
            if node_type_name not in valid_types:
                raise ValueError(f"Invalid node type in levels: '{node_type_name}'")

            style_str = level_config.get("style", "kanban")
            style_config = level_config.get("styleConfig", {})

            if style_str == "kanban":
                # Validate groupByField
                group_by = style_config.get("groupByField")
                if not group_by:
                    raise ValueError("kanban view requires groupByField")
                if group_by not in valid_fields:
                    raise ValueError(
                        f"Invalid groupByField '{group_by}'. "
                        f"Valid fields: {valid_fields}"
                    )

                # Validate cardTemplate fields if present
                card_tpl = style_config.get("cardTemplate", {})
                for field_key in ["titleField", "subtitleField", "statusField"]:
                    field_val = card_tpl.get(field_key)
                    if field_val and field_val not in valid_fields:
                        raise ValueError(
                            f"Invalid {field_key} '{field_val}'. "
                            f"Valid fields: {valid_fields}"
                        )

                config = KanbanConfig.model_validate(style_config)
                processed_levels[node_type_name] = LevelConfig(
                    style=ViewStyle.KANBAN, style_config=config
                )
            elif style_str == "gantt":
                # Validate date fields
                start_field = style_config.get("startDateField")
                end_field = style_config.get("endDateField")
                if not start_field or not end_field:
                    raise ValueError(
                        "gantt view requires startDateField and endDateField"
                    )
                if start_field not in valid_fields:
                    raise ValueError(
                        f"Invalid startDateField '{start_field}'. "
                        f"Valid fields: {valid_fields}"
                    )
                if end_field not in valid_fields:
                    raise ValueError(
                        f"Invalid endDateField '{end_field}'. "
                        f"Valid fields: {valid_fields}"
                    )

                # Validate optional fields
                for opt_field in ["progressField", "labelField", "groupByField"]:
                    field_val = style_config.get(opt_field)
                    if field_val and field_val not in valid_fields:
                        raise ValueError(
                            f"Invalid {opt_field} '{field_val}'. "
                            f"Valid fields: {valid_fields}"
                        )

                config = GanttConfig.model_validate(style_config)
                processed_levels[node_type_name] = LevelConfig(
                    style=ViewStyle.GANTT, style_config=config
                )
            else:
                # Default to kanban for unimplemented styles
                status_field = next(
                    (f for f in node_type_def.fields if f.key == "status"), None
                )
                if status_field and status_field.values:
                    config = KanbanConfig(
                        group_by_field="status",
                        column_order=status_field.values,
                        allow_drag=True,
                        show_counts=True,
                        show_empty_columns=True,
                    )
                else:
                    config = KanbanConfig(
                        group_by_field="status",
                        allow_drag=True,
                        show_counts=True,
                        show_empty_columns=True,
                    )
                processed_levels[node_type_name] = LevelConfig(
                    style=ViewStyle.KANBAN, style_config=config
                )

        return ViewTemplateCreate(
            name=result.get("name", f"{root_type} View"),
            description=result.get("description"),
            icon=result.get("icon"),
            root_type=root_type,
            levels=processed_levels,
        )
