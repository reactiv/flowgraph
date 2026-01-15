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

    def auto_generate_views(
        self, workflow_definition: WorkflowDefinition
    ) -> list[ViewTemplateCreate]:
        """Generate a standard set of views based on the workflow schema.

        Creates appropriate views for each node type without LLM calls:
        - Kanban view for node types with states or status enum fields
        - Table view for node types without states

        Args:
            workflow_definition: The workflow schema to generate views for

        Returns:
            List of ViewTemplateCreate objects ready to be saved
        """
        views: list[ViewTemplateCreate] = []

        # Standard colors for status values
        status_colors = {
            # Pending/Draft states
            "Draft": "#64748b",
            "Pending": "#64748b",
            "New": "#64748b",
            "Proposed": "#64748b",
            "Planned": "#64748b",
            "Backlog": "#64748b",
            "To Do": "#64748b",
            # Active/In Progress states
            "In Progress": "#3b82f6",
            "Active": "#3b82f6",
            "Running": "#3b82f6",
            "In Review": "#3b82f6",
            "Submitted": "#3b82f6",
            "Processing": "#3b82f6",
            # Complete/Success states
            "Complete": "#22c55e",
            "Completed": "#22c55e",
            "Done": "#22c55e",
            "Validated": "#22c55e",
            "Approved": "#22c55e",
            "Successful": "#22c55e",
            "Passed": "#22c55e",
            # Failed/Error states
            "Failed": "#ef4444",
            "Rejected": "#ef4444",
            "Error": "#ef4444",
            "Blocked": "#ef4444",
            # Archived/Cancelled states
            "Archived": "#475569",
            "Cancelled": "#475569",
            "Closed": "#475569",
            "Dismissed": "#475569",
            "On Hold": "#475569",
        }

        for node_type in workflow_definition.node_types:
            # Skip Tag node type - usually not useful as a primary view
            if node_type.type == "Tag":
                continue

            # Find status/state field for kanban grouping
            status_field = None
            status_values = []

            # First check if states are enabled
            if node_type.states and node_type.states.enabled:
                status_field = "status"
                status_values = node_type.states.values or []
            else:
                # Look for an enum field that could work as status
                for field in node_type.fields:
                    if field.kind.value == "enum" and field.values:
                        if field.key in ("status", "state", "phase", "stage"):
                            status_field = field.key
                            status_values = field.values
                            break
                        # Fall back to first enum field
                        if not status_field:
                            status_field = field.key
                            status_values = field.values

            # Find useful fields for card display
            title_field = node_type.title_field
            subtitle_field = node_type.subtitle_field

            # Find author/person field
            author_field = None
            for field in node_type.fields:
                if field.kind.value == "person":
                    author_field = field.key
                    break

            # Find date field
            date_field = None
            for field in node_type.fields:
                if field.kind.value == "datetime":
                    date_field = field.key
                    break

            # Build body fields (useful info to show on cards)
            body_fields = []
            if author_field:
                body_fields.append(author_field)
            if date_field:
                body_fields.append(date_field)
            # Add first few other fields
            for field in node_type.fields:
                if len(body_fields) >= 3:
                    break
                if field.key not in (title_field, subtitle_field, status_field,
                                     author_field, date_field):
                    if field.kind.value in ("string", "enum", "number"):
                        body_fields.append(field.key)

            if status_field and status_values:
                # Create Kanban view
                col_colors = {
                    val: status_colors.get(val, "#64748b")
                    for val in status_values
                }

                card_template = CardTemplate(
                    title_field=title_field,
                    subtitle_field=subtitle_field,
                    status_field=status_field,
                    body_fields=body_fields,
                    status_colors=col_colors,
                )

                kanban_config = KanbanConfig(
                    group_by_field=status_field,
                    column_order=status_values,
                    column_colors=col_colors,
                    allow_drag=True,
                    show_counts=True,
                    show_empty_columns=True,
                    card_template=card_template,
                )

                views.append(ViewTemplateCreate(
                    name=f"{node_type.display_name} Board",
                    description=f"Kanban board for {node_type.display_name} by {status_field}",
                    root_type=node_type.type,
                    levels={
                        node_type.type: LevelConfig(
                            style=ViewStyle.KANBAN,
                            style_config=kanban_config,
                        )
                    },
                ))
            else:
                # Create Table view for node types without status
                # Get first few fields for table columns
                table_columns = [title_field]
                for field in node_type.fields:
                    if len(table_columns) >= 5:
                        break
                    if field.key != title_field:
                        table_columns.append(field.key)

                table_config = TableConfig(
                    columns=table_columns,
                    sortable=True,
                )

                views.append(ViewTemplateCreate(
                    name=f"{node_type.display_name} List",
                    description=f"Table view of all {node_type.display_name} items",
                    root_type=node_type.type,
                    levels={
                        node_type.type: LevelConfig(
                            style=ViewStyle.TABLE,
                            style_config=table_config,
                        )
                    },
                ))

        return views
