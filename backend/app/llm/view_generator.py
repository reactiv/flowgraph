"""View template generator from natural language descriptions."""

import logging

from pydantic import ValidationError

from app.llm.client import LLMClient, get_client
from app.models import WorkflowDefinition
from app.models.workflow import (
    CardsConfig,
    CardTemplate,
    EdgeTraversal,
    GanttConfig,
    KanbanConfig,
    LevelConfig,
    RecordConfig,
    TableConfig,
    TimelineConfig,
    TreeConfig,
    ViewStyle,
    ViewTemplateCreate,
)

logger = logging.getLogger(__name__)

# System prompt for generating multiple views based on workflow description
VIEWS_FROM_DESCRIPTION_SYSTEM = """You are a view template generator for a workflow management system.

Given a workflow description and schema, generate a diverse set of useful views that would help users work with this workflow effectively.

## Available View Styles

**kanban**: Board with columns grouped by a field (best for status-based workflows)
- groupByField: Field to group by (typically "status" or an enum field)
- columnOrder: Array of values in display order
- columnColors: Map of value to hex color
- cardTemplate: How to display each card

**table**: Sortable data grid (best for data-heavy views, reporting, bulk operations)
- columns: Array of field keys to display as columns
- sortable: true/false
- statusColors: Optional map for status badge colors

**timeline**: Date-grouped entries (best for chronological views, activity feeds)
- dateField: Field containing the date to group by
- granularity: "day" | "week" | "month"
- showConnectors: true/false
- cardTemplate: How to display each entry

**tree**: Hierarchical view (best for parent-child relationships)
- expandable: true/false
- showDepthLines: true/false
- cardTemplate: How to display each node

**gantt**: Timeline with duration bars (best for project planning, scheduling)
- startDateField: Field with start date
- endDateField: Field with end date
- progressField: Optional percentage field
- groupByField: Optional field to group rows
- timeScale: "day" | "week" | "month"

**cards**: Card grid or list (best for browsing, galleries)
- layout: "grid" | "list" | "single"
- columns: Number of columns for grid layout
- cardTemplate: How to display each card

**record**: Hierarchical detail view (best for master-detail, deep exploration)
- selectorStyle: "list" | "cards" | "dropdown" (how to display root node selector)
- showProperties: true/false (show property section)
- propertiesTitle: Title for properties section
- propertyFields: Array of field keys to show (null = all fields)
- sections: Array of related node sections to display
  - Each section needs: targetType, title (optional), collapsedByDefault (optional)
  - Sections display related nodes in their own configured view style

## Response Format

Return a JSON array of view templates:
```json
{
  "views": [
    {
      "name": "View Name",
      "description": "What this view is for",
      "rootType": "ExactNodeTypeName",
      "style": "kanban",
      "styleConfig": { ... style-specific config ... }
    }
  ]
}
```

## Style Config Examples

Kanban:
{"groupByField": "status", "columnOrder": ["Draft", "Active", "Done"], "columnColors": {"Draft": "#64748b", "Active": "#3b82f6", "Done": "#22c55e"}, "allowDrag": true, "showCounts": true, "cardTemplate": {"titleField": "name", "statusField": "status", "bodyFields": ["author"]}}

Table:
{"columns": ["name", "status", "author", "created_at"], "sortable": true, "statusColors": {"Active": "#3b82f6", "Done": "#22c55e"}}

Timeline:
{"dateField": "created_at", "granularity": "week", "showConnectors": true, "cardTemplate": {"titleField": "name", "subtitleField": "author"}}

Gantt:
{"startDateField": "start_date", "endDateField": "end_date", "groupByField": "assignee", "timeScale": "week", "statusColors": {"In Progress": "#3b82f6"}}

Cards:
{"layout": "grid", "columns": 3, "cardTemplate": {"titleField": "name", "subtitleField": "type", "bodyFields": ["description"]}}

Tree:
{"expandable": true, "showDepthLines": true, "cardTemplate": {"titleField": "name", "statusField": "status"}}

Record (requires edges config):
{"selectorStyle": "list", "showProperties": true, "propertiesTitle": "Details", "sections": [{"targetType": "Task", "title": "Tasks", "collapsedByDefault": false}]}

## Color Guidelines
- Pending/Draft/New/Proposed: grey (#64748b)
- In Progress/Active/Running: blue (#3b82f6)
- Complete/Done/Validated/Approved: green (#22c55e)
- Failed/Rejected/Error/Blocked: red (#ef4444)
- Archived/Cancelled/Closed: dark grey (#475569)
- Warning/Review: yellow (#eab308)

## Rules
1. Generate 3-6 diverse views that would be genuinely useful for this workflow
2. rootType MUST exactly match a node type name from the schema
3. All field keys MUST exactly match keys from the schema
4. Choose view styles that match the data - don't force styles that don't fit
5. Each view should serve a different purpose (don't just make 5 kanban boards)
6. Consider: What would users of this workflow actually need to see?
7. Only output valid JSON, no markdown or explanations
"""

VIEW_GENERATION_SYSTEM = """You are a view template generator for a workflow management system.

Create declarative view configurations that define how to display workflow data.

## View Styles

**kanban**: Group items in columns by a field value (requires status/enum field)
- groupByField: The field key to group by (e.g., "status") - MUST exist in schema
- columnOrder: Array of values in display order
- columnColors: Map of value to hex color (semantic colors preferred)
- cardTemplate.bodyFields: Array of field keys to show in card body

**table**: Sortable data grid (best for data-heavy views, reporting)
- columns: Array of field keys to display as columns
- sortable: true/false

**cards**: Card grid or list (best for browsing, galleries)
- layout: "grid" | "list" | "single"
- columns: Number of columns for grid layout
- cardTemplate: How to display each card

**timeline**: Date-grouped entries (best for chronological views)
- dateField: Field containing the date to group by (must be datetime type)
- granularity: "day" | "week" | "month"
- showConnectors: true/false

**tree**: Hierarchical view (best for parent-child relationships)
- expandable: true/false
- showDepthLines: true/false

**gantt**: Timeline with duration bars (best for project planning)
- startDateField: Field with start date (must be datetime type)
- endDateField: Field with end date (must be datetime type)
- timeScale: "day" | "week" | "month"

**record**: Hierarchical detail view (best for master-detail exploration)
- selectorStyle: "list" | "cards" | "dropdown"
- showProperties: true/false
- propertiesTitle: Title for properties section
- propertyFields: Array of field keys to show (null = all)
- sections: Array of {targetType, title, collapsedByDefault} for related nodes

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
- CRITICAL: For titleField, use the ACTUAL field key (usually "name"), NOT "title"
- Choose a style that fits the node type's fields:
  - Use "kanban" ONLY if the node type has a "status" field or enum field to group by
  - Use "table" for data-heavy node types or when there's no status field
  - Use "record" when the user asks for hierarchical/detail views
  - Use "timeline" when the node type has datetime fields
  - Use "gantt" when there are start/end date fields
- For kanban: Include columnColors for all values in columnOrder
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


def _build_schema_context_detailed(definition: WorkflowDefinition) -> str:
    """Build a detailed schema context for view generation."""
    lines = [
        "## Workflow Schema",
        f"Name: {definition.name}",
        f"Description: {definition.description}",
        "",
    ]

    lines.append("### Node Types (use these exact names for rootType)")
    for nt in definition.node_types:
        lines.append(f"\n**{nt.type}** (display: {nt.display_name})")
        lines.append(f'  Title field: "{nt.title_field}"')
        if nt.subtitle_field:
            lines.append(f'  Subtitle field: "{nt.subtitle_field}"')

        # Show states if enabled
        if nt.states and nt.states.enabled:
            lines.append(f"  Status values: {nt.states.values}")

        lines.append("  Fields (use these exact keys):")
        for field in nt.fields:
            field_info = f'    - "{field.key}": {field.kind.value}'
            if field.values:
                field_info += f" (enum values: {field.values})"
            if field.required:
                field_info += " [required]"
            lines.append(field_info)

    if definition.edge_types:
        lines.append("\n### Edge Types (relationships)")
        for et in definition.edge_types:
            lines.append(f"  - {et.from_type} --[{et.type}]--> {et.to_type}")

    return "\n".join(lines)


class ViewGenerator:
    """Generates view templates from natural language descriptions."""

    def __init__(self, llm_client: LLMClient | None = None):
        self._llm_client = llm_client or get_client()

    def _find_edge_for_types(
        self, definition: WorkflowDefinition, from_type: str, to_type: str
    ) -> EdgeTraversal | None:
        """Find an edge type that connects from_type to to_type.

        Checks both directions:
        - from_type -> to_type (outgoing)
        - to_type -> from_type (incoming from to_type's perspective)
        """
        for edge_type in definition.edge_types:
            # Check outgoing: from_type -> to_type
            if edge_type.from_type == from_type and edge_type.to_type == to_type:
                return EdgeTraversal(
                    edgeType=edge_type.type,
                    direction="outgoing",
                    targetType=to_type,
                )
            # Check incoming: to_type -> from_type (we're at from_type, edge comes in)
            if edge_type.from_type == to_type and edge_type.to_type == from_type:
                return EdgeTraversal(
                    edgeType=edge_type.type,
                    direction="incoming",
                    targetType=to_type,
                )
        return None

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

    async def generate_views_from_description(
        self, description: str, workflow_definition: WorkflowDefinition
    ) -> list[ViewTemplateCreate]:
        """Generate multiple diverse views based on the workflow description and schema.

        Uses LLM to intelligently create views that match the workflow's purpose.

        Args:
            description: The original user description of the workflow
            workflow_definition: The generated workflow schema

        Returns:
            List of ViewTemplateCreate objects
        """
        schema_context = _build_schema_context_detailed(workflow_definition)

        prompt = f"""Generate useful views for this workflow:

## Original Workflow Description
"{description}"

{schema_context}

Based on the workflow description and schema, generate 3-6 diverse views that would help users work effectively with this data. Choose view styles that match the data structure and workflow purpose."""

        try:
            result = await self._llm_client.generate_json(
                prompt=prompt,
                system=VIEWS_FROM_DESCRIPTION_SYSTEM,
                max_tokens=4096,
                temperature=0.3,
            )
        except Exception as e:
            logger.error(f"LLM view generation failed: {e}")
            raise ValueError(f"Failed to generate views: {e}") from e

        views = result.get("views", [])
        if not views:
            logger.warning("LLM returned no views, falling back to auto-generation")
            return self.auto_generate_views(workflow_definition)

        validated_views: list[ViewTemplateCreate] = []
        for view_data in views:
            try:
                view = self._parse_view_from_llm(view_data, workflow_definition)
                validated_views.append(view)
            except (ValueError, ValidationError) as e:
                logger.warning(f"Skipping invalid view: {e}")
                continue

        if not validated_views:
            logger.warning("No valid views from LLM, falling back to auto-generation")
            return self.auto_generate_views(workflow_definition)

        return validated_views

    def _parse_view_from_llm(
        self, view_data: dict, definition: WorkflowDefinition
    ) -> ViewTemplateCreate:
        """Parse and validate a single view from LLM output."""
        valid_types = {nt.type for nt in definition.node_types}
        root_type = view_data.get("rootType")

        if root_type not in valid_types:
            raise ValueError(f"Invalid rootType '{root_type}'")

        node_type_def = next(
            nt for nt in definition.node_types if nt.type == root_type
        )
        valid_fields = {f.key for f in node_type_def.fields}

        style = view_data.get("style", "kanban")
        style_config = view_data.get("styleConfig", {})

        # Parse based on style
        if style == "kanban":
            config = KanbanConfig.model_validate(style_config)
            level_config = LevelConfig(style=ViewStyle.KANBAN, styleConfig=config)
        elif style == "table":
            config = TableConfig.model_validate(style_config)
            level_config = LevelConfig(style=ViewStyle.TABLE, styleConfig=config)
        elif style == "timeline":
            # Validate dateField exists
            date_field = style_config.get("dateField")
            if date_field and date_field not in valid_fields:
                raise ValueError(f"Invalid dateField '{date_field}'")
            config = TimelineConfig.model_validate(style_config)
            level_config = LevelConfig(style=ViewStyle.TIMELINE, styleConfig=config)
        elif style == "tree":
            config = TreeConfig.model_validate(style_config)
            level_config = LevelConfig(style=ViewStyle.TREE, styleConfig=config)
        elif style == "gantt":
            # Validate date fields exist
            start_field = style_config.get("startDateField")
            end_field = style_config.get("endDateField")
            if start_field and start_field not in valid_fields:
                raise ValueError(f"Invalid startDateField '{start_field}'")
            if end_field and end_field not in valid_fields:
                raise ValueError(f"Invalid endDateField '{end_field}'")
            config = GanttConfig.model_validate(style_config)
            level_config = LevelConfig(style=ViewStyle.GANTT, styleConfig=config)
        elif style == "cards":
            config = CardsConfig.model_validate(style_config)
            level_config = LevelConfig(style=ViewStyle.CARDS, styleConfig=config)
        elif style == "record":
            config = RecordConfig.model_validate(style_config)
            level_config = LevelConfig(style=ViewStyle.RECORD, styleConfig=config)

            # For record views, we need to create edges and level configs for sections
            edges: list[EdgeTraversal] = []
            levels: dict[str, LevelConfig] = {root_type: level_config}

            for section in config.sections:
                target_type = section.target_type
                if target_type not in valid_types:
                    logger.warning(
                        f"Skipping section with invalid target type: {target_type}"
                    )
                    continue

                # Find an edge type that connects root_type to target_type
                edge_traversal = self._find_edge_for_types(
                    definition, root_type, target_type
                )
                if edge_traversal:
                    edges.append(edge_traversal)

                    # Create a default table config for the target type
                    target_node_type = next(
                        nt for nt in definition.node_types if nt.type == target_type
                    )
                    target_fields = [f.key for f in target_node_type.fields[:5]]
                    target_config = TableConfig(columns=target_fields, sortable=True)
                    levels[target_type] = LevelConfig(
                        style=ViewStyle.TABLE, styleConfig=target_config
                    )
                else:
                    logger.warning(
                        f"No edge found connecting {root_type} to {target_type}"
                    )

            return ViewTemplateCreate(
                name=view_data.get("name", f"{root_type} View"),
                description=view_data.get("description"),
                rootType=root_type,
                edges=edges,
                levels=levels,
            )
        else:
            raise ValueError(f"Unknown style '{style}'")

        return ViewTemplateCreate(
            name=view_data.get("name", f"{root_type} View"),
            description=view_data.get("description"),
            rootType=root_type,
            levels={root_type: level_config},
        )

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

        # Track edges for record views
        edges: list[EdgeTraversal] = []

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

                # Validate and fix cardTemplate fields if present
                card_tpl = style_config.get("cardTemplate", {})
                for field_key in ["titleField", "subtitleField", "statusField"]:
                    field_val = card_tpl.get(field_key)
                    if field_val and field_val not in valid_fields:
                        # Try common auto-fixes
                        if field_val == "title" and "name" in valid_fields:
                            card_tpl[field_key] = "name"
                            logger.info(f"Auto-fixed {field_key}: 'title' -> 'name'")
                        else:
                            # Remove invalid field rather than failing
                            logger.warning(
                                f"Removing invalid {field_key} '{field_val}' "
                                f"(valid: {valid_fields})"
                            )
                            del card_tpl[field_key]

                config = KanbanConfig.model_validate(style_config)
                processed_levels[node_type_name] = LevelConfig(
                    style=ViewStyle.KANBAN, styleConfig=config
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
                    style=ViewStyle.GANTT, styleConfig=config
                )
            elif style_str == "record":
                config = RecordConfig.model_validate(style_config)
                processed_levels[node_type_name] = LevelConfig(
                    style=ViewStyle.RECORD, styleConfig=config
                )

                # For record views, create edges and level configs for sections
                for section in config.sections:
                    target_type = section.target_type
                    if target_type not in valid_types:
                        logger.warning(
                            f"Skipping section with invalid target type: {target_type}"
                        )
                        continue

                    # Find an edge connecting root_type to target_type
                    edge_traversal = self._find_edge_for_types(
                        definition, root_type, target_type
                    )
                    if edge_traversal:
                        edges.append(edge_traversal)

                        # Create a default table config for the target type if not defined
                        if target_type not in processed_levels:
                            target_node_type = next(
                                nt
                                for nt in definition.node_types
                                if nt.type == target_type
                            )
                            target_fields = [f.key for f in target_node_type.fields[:5]]
                            target_config = TableConfig(
                                columns=target_fields, sortable=True
                            )
                            processed_levels[target_type] = LevelConfig(
                                style=ViewStyle.TABLE, styleConfig=target_config
                            )
                    else:
                        logger.warning(
                            f"No edge found connecting {root_type} to {target_type}"
                        )
            elif style_str == "table":
                config = TableConfig.model_validate(style_config)
                processed_levels[node_type_name] = LevelConfig(
                    style=ViewStyle.TABLE, styleConfig=config
                )
            elif style_str == "cards":
                config = CardsConfig.model_validate(style_config)
                processed_levels[node_type_name] = LevelConfig(
                    style=ViewStyle.CARDS, styleConfig=config
                )
            elif style_str == "timeline":
                # Validate dateField exists
                date_field = style_config.get("dateField")
                if date_field and date_field not in valid_fields:
                    raise ValueError(
                        f"Invalid dateField '{date_field}'. "
                        f"Valid fields: {valid_fields}"
                    )
                config = TimelineConfig.model_validate(style_config)
                processed_levels[node_type_name] = LevelConfig(
                    style=ViewStyle.TIMELINE, styleConfig=config
                )
            elif style_str == "tree":
                config = TreeConfig.model_validate(style_config)
                processed_levels[node_type_name] = LevelConfig(
                    style=ViewStyle.TREE, styleConfig=config
                )
            else:
                # Unknown style - try to create a sensible default
                # First, try kanban if there's a status field
                status_field = next(
                    (f for f in node_type_def.fields if f.key == "status"), None
                )
                if status_field and status_field.values:
                    config = KanbanConfig(
                        groupByField="status",
                        columnOrder=status_field.values,
                        allowDrag=True,
                        showCounts=True,
                        showEmptyColumns=True,
                    )
                    processed_levels[node_type_name] = LevelConfig(
                        style=ViewStyle.KANBAN, styleConfig=config
                    )
                else:
                    # Fall back to table view if no status field
                    table_columns = [node_type_def.title_field]
                    for field in node_type_def.fields:
                        if len(table_columns) >= 5:
                            break
                        if field.key != node_type_def.title_field:
                            table_columns.append(field.key)
                    config = TableConfig(columns=table_columns, sortable=True)
                    processed_levels[node_type_name] = LevelConfig(
                        style=ViewStyle.TABLE, styleConfig=config
                    )

        return ViewTemplateCreate(
            name=result.get("name", f"{root_type} View"),
            description=result.get("description"),
            icon=result.get("icon"),
            rootType=root_type,
            edges=edges,
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
                    titleField=title_field,
                    subtitleField=subtitle_field,
                    statusField=status_field,
                    bodyFields=body_fields,
                    statusColors=col_colors,
                )

                kanban_config = KanbanConfig(
                    groupByField=status_field,
                    columnOrder=status_values,
                    columnColors=col_colors,
                    allowDrag=True,
                    showCounts=True,
                    showEmptyColumns=True,
                    cardTemplate=card_template,
                )

                views.append(ViewTemplateCreate(
                    name=f"{node_type.display_name} Board",
                    description=f"Kanban board for {node_type.display_name} by {status_field}",
                    rootType=node_type.type,
                    levels={
                        node_type.type: LevelConfig(
                            style=ViewStyle.KANBAN,
                            styleConfig=kanban_config,
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
                    rootType=node_type.type,
                    levels={
                        node_type.type: LevelConfig(
                            style=ViewStyle.TABLE,
                            styleConfig=table_config,
                        )
                    },
                ))

        return views
