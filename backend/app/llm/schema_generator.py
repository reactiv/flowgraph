"""Schema generator from natural language descriptions."""

import logging

from pydantic import BaseModel, Field, ValidationError

from app.llm.client import LLMClient, get_client
from app.models.workflow import WorkflowDefinition

logger = logging.getLogger(__name__)


class SchemaGenerationOptions(BaseModel):
    """Options to customize schema generation."""

    include_states: bool = True
    include_tags: bool = True
    scientific_terminology: bool = False


class SchemaValidationResult(BaseModel):
    """Result of schema validation."""

    is_valid: bool = Field(alias="isValid")
    errors: list[str]
    warnings: list[str]
    fixes_applied: list[str] = Field(default_factory=list, alias="fixesApplied")

    model_config = {"populate_by_name": True}


SCHEMA_GENERATION_SYSTEM = """You are a workflow schema generator.
Given a natural language description of a workflow, generate a WorkflowDefinition JSON.

## WorkflowDefinition Structure

```json
{
  "workflowId": "snake_case_id",
  "name": "Human Readable Name",
  "description": "A brief description of the workflow",
  "nodeTypes": [...],
  "edgeTypes": [...],
  "rules": []
}
```

## Node Type Structure

Each node type represents an entity in the workflow:

```json
{
  "type": "PascalCase",
  "displayName": "Human Readable",
  "titleField": "field_key",
  "subtitleField": "field_key_or_null",
  "fields": [
    {"key": "snake_case", "label": "Human Label", "kind": "string", "required": true},
    {"key": "status_field", "label": "Status", "kind": "enum", "values": ["Value1", "Value2"]}
  ],
  "states": {
    "enabled": true,
    "initial": "Draft",
    "values": ["Draft", "In Progress", "Complete"],
    "transitions": [
      {"from": "Draft", "to": "In Progress"},
      {"from": "In Progress", "to": "Complete"}
    ]
  },
  "ui": {
    "defaultViews": ["list", "detail", "graph"],
    "primarySections": ["summary", "relationships"],
    "listColumns": ["field1", "field2"],
    "quickActions": []
  }
}
```

## Field Kinds

Use these exact values for field "kind":
- "string": Text content
- "number": Numeric values
- "datetime": Date/time values
- "enum": Fixed set of values (must include "values" array)
- "person": Person name (for authors, assignees)
- "json": Complex structured data
- "tag[]": Array of tag references
- "file[]": Array of file attachments

## Edge Type Structure

Edges define relationships between node types:

```json
{
  "type": "UPPER_SNAKE_CASE",
  "displayName": "human readable",
  "from": "SourceNodeType",
  "to": "TargetNodeType",
  "direction": "out"
}
```

## Guidelines

1. **Node Types**: Extract entities mentioned in the description. Common patterns:
   - Primary entities (what users mainly work with)
   - Supporting entities (referenced by primary)
   - Category/Tag entities (for grouping)

2. **Fields**: Each node type should have:
   - A unique ID field (e.g., "task_id", "project_id")
   - A title/name field (use for titleField)
   - An author/creator field (kind: "person")
   - A date field (kind: "datetime")
   - Status field if states are enabled

3. **States**: Define lifecycle progressions:
   - Start with Draft/New/Pending
   - Include In Progress/Active states
   - End with Complete/Done/Closed
   - Optionally include Archived/Cancelled

4. **Edges**: Create relationships between entities:
   - HAS_X: Parent owns children (Sample HAS_ANALYSIS Analysis)
   - LINKS_TO_X: Many-to-many associations
   - BELONGS_TO_X: Child references parent
   - ASSIGNED_TO: For person assignments

5. **Naming Conventions**:
   - Node types: PascalCase (Task, Project, Bug)
   - Field keys: snake_case (task_id, due_date)
   - Edge types: UPPER_SNAKE_CASE (HAS_TASK, LINKS_TO)

## Response Format

Return ONLY valid JSON with the WorkflowDefinition structure. No markdown, no explanations.
"""


class SchemaGenerator:
    """Generates workflow schemas from natural language descriptions."""

    def __init__(self, llm_client: LLMClient | None = None):
        self._llm_client = llm_client or get_client()

    async def generate_schema(
        self, description: str, options: SchemaGenerationOptions | None = None
    ) -> tuple[WorkflowDefinition, SchemaValidationResult]:
        """Generate a workflow schema from a natural language description.

        Uses a retry loop that feeds parsing/validation errors back to the LLM
        for self-correction.

        Args:
            description: Natural language description of the workflow
            options: Generation options

        Returns:
            Tuple of (WorkflowDefinition, SchemaValidationResult)

        Raises:
            ValueError: If generation or validation fails after max retries
        """
        if options is None:
            options = SchemaGenerationOptions()

        max_attempts = 3
        last_error: str | None = None

        for attempt in range(max_attempts):
            prompt = self._build_prompt(description, options, last_error)

            # Try to generate JSON
            try:
                result = await self._llm_client.generate_json(
                    prompt=prompt,
                    system=SCHEMA_GENERATION_SYSTEM,
                    max_tokens=8192,
                    temperature=0.2 if attempt == 0 else 0.1,
                )
            except ValueError as e:
                # JSON parsing error - retry with error feedback
                error_msg = str(e)
                logger.warning(
                    f"Attempt {attempt + 1}/{max_attempts}: JSON parse error: {error_msg}"
                )
                last_error = f"JSON parsing failed: {error_msg}"
                continue
            except Exception as e:
                logger.error(f"LLM generation failed: {e}")
                raise ValueError(f"Failed to generate schema: {e}") from e

            # Ensure required fields exist
            if "rules" not in result:
                result["rules"] = []

            # Try to validate directly with Pydantic
            try:
                definition = WorkflowDefinition.model_validate(result)
                validation = SchemaValidationResult(
                    is_valid=True,
                    errors=[],
                    warnings=[],
                    fixes_applied=[],
                )
                logger.info(
                    f"Schema generated successfully on attempt {attempt + 1}"
                )
                return definition, validation
            except ValidationError as e:
                # Validation error - retry with error feedback
                error_msg = str(e)
                logger.warning(
                    f"Attempt {attempt + 1}/{max_attempts}: Validation error: {error_msg}"
                )
                last_error = f"Pydantic validation failed: {error_msg}"
                continue

        # All attempts failed
        raise ValueError(
            f"Failed to generate valid schema after {max_attempts} attempts. "
            f"Last error: {last_error}"
        )

    def _build_prompt(
        self,
        description: str,
        options: SchemaGenerationOptions,
        last_error: str | None = None,
    ) -> str:
        """Build the user prompt for schema generation."""
        lines = [f'Generate a workflow schema for:\n\n"{description}"']

        if options.include_states:
            lines.append(
                "\nInclude state machines with status progressions for relevant node types."
            )
        else:
            lines.append("\nDo not include state machines (states should be null).")

        if options.include_tags:
            lines.append(
                "Include a Tag node type for categorization and tag[] fields on entities."
            )

        if options.scientific_terminology:
            lines.append(
                "Use scientific/technical terminology for research and lab workflows."
            )

        # Include error feedback for retry attempts
        if last_error:
            lines.append(
                f"\n\nIMPORTANT: Your previous attempt failed with this error:\n"
                f"{last_error}\n\n"
                f"Please fix the issue and generate valid JSON. Common issues:\n"
                f"- Ensure all JSON is properly formatted (no trailing commas)\n"
                f"- states.initial and states.values are REQUIRED when states.enabled=true\n"
                f"- If states are not needed, set states to null instead of {{enabled: false}}\n"
                f"- All field keys must be snake_case strings"
            )

        lines.append("\nGenerate the complete WorkflowDefinition JSON.")
        return "\n".join(lines)
