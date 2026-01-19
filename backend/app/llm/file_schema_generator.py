"""Generate workflow schemas from uploaded files using the agentic data transformer."""

import asyncio
import logging
from collections.abc import AsyncGenerator
from typing import Any

from app.llm.schema_generator import SchemaGenerationOptions, SchemaValidationResult
from app.llm.transformer import DataTransformer, TransformConfig
from app.llm.view_generator import ViewGenerator
from app.models.workflow import ViewTemplateCreate, WorkflowDefinition
from app.storage.upload_store import UploadStore, get_upload_store

logger = logging.getLogger(__name__)


SCHEMA_FROM_FILES_INSTRUCTION = """Analyze the input files and create a WorkflowDefinition schema.

## Your Task

1. Explore the input files to understand their structure and content
2. Identify the key entities (these become node types)
3. Identify relationships between entities (these become edge types)
4. Create a comprehensive WorkflowDefinition

## User's Description

{description}

## Schema Generation Options

- Include state machines: {include_states}
- Include tagging system: {include_tags}
- Use scientific terminology: {scientific_terminology}

## Guidelines

- Node types should be in PascalCase (e.g., "Message", "Author", "Link")
- Edge types should be in UPPER_SNAKE_CASE (e.g., "AUTHORED_BY", "CONTAINS_LINK")
- Field keys should be in snake_case (e.g., "created_at", "author_name")
- Choose appropriate field kinds: string, number, datetime, enum, person, json, tag[], file[]
- For enum fields, provide realistic values based on the data
- Include states if the data suggests progression (e.g., Draft -> Published)
- Create edges that represent meaningful relationships in the data

## Output

Write a complete WorkflowDefinition JSON that captures the structure of the uploaded files.
The schema should allow importing the actual data from these files in a future step.
"""


class FileSchemaGenerator:
    """Generate WorkflowDefinition schemas from uploaded files.

    Uses the agentic data transformer to analyze files and produce
    validated WorkflowDefinition outputs.
    """

    def __init__(self, upload_store: UploadStore | None = None):
        """Initialize the generator.

        Args:
            upload_store: Optional upload store instance. Uses global if not provided.
        """
        self.upload_store = upload_store or get_upload_store()
        self.transformer = DataTransformer()
        self.view_generator = ViewGenerator()

    async def generate_schema_from_files(
        self,
        upload_id: str,
        description: str,
        options: SchemaGenerationOptions | None = None,
    ) -> tuple[WorkflowDefinition, SchemaValidationResult, list[ViewTemplateCreate]]:
        """Generate a workflow schema from uploaded files.

        Args:
            upload_id: The upload session ID containing the files.
            description: User's description of the desired workflow.
            options: Schema generation options.

        Returns:
            Tuple of (definition, validation, view_templates).

        Raises:
            FileNotFoundError: If the upload session doesn't exist.
            ValueError: If transformation fails.
        """
        result = None
        async for event in self.generate_schema_with_events(
            upload_id, description, options
        ):
            if event.get("event") == "complete":
                result = event

        if result is None:
            raise ValueError("Schema generation did not complete")

        # Parse the result
        definition = WorkflowDefinition.model_validate(result["definition"])
        validation = SchemaValidationResult.model_validate(result["validation"])
        view_templates = [
            ViewTemplateCreate.model_validate(vt) for vt in result["view_templates"]
        ]

        return definition, validation, view_templates

    async def generate_schema_with_events(
        self,
        upload_id: str,
        description: str,
        options: SchemaGenerationOptions | None = None,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """Generate schema from files, yielding events for SSE streaming.

        Args:
            upload_id: The upload session ID containing the files.
            description: User's description of the desired workflow.
            options: Schema generation options.

        Yields:
            Events with structure: {"event": "...", ...data}

        Events:
            - iteration_start: Agent iteration started
            - tool_call: Agent calling a tool
            - tool_result: Tool execution result
            - validation: Schema validation result
            - text: Agent thinking/output text
            - complete: Transformation complete with result
            - error: Error occurred
        """
        if options is None:
            options = SchemaGenerationOptions()

        # Get uploaded files
        try:
            files = await self.upload_store.get_files(upload_id)
        except FileNotFoundError:
            yield {"event": "error", "message": f"Upload session {upload_id} not found or expired"}
            return

        if not files:
            yield {"event": "error", "message": "No files found in upload session"}
            return

        # Build instruction
        instruction = SCHEMA_FROM_FILES_INSTRUCTION.format(
            description=description,
            include_states="Yes" if options.include_states else "No",
            include_tags="Yes" if options.include_tags else "No",
            scientific_terminology="Yes" if options.scientific_terminology else "No",
        )

        # Configure transformer for direct mode (schema is small)
        config = TransformConfig(
            mode="direct",
            output_format="json",
            max_iterations=60,
        )

        # Create event queue for streaming
        events_queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        transform_result = None
        transform_error = None

        def on_event(event_type: str, data: dict[str, Any]) -> None:
            """Callback to capture transformer events."""
            events_queue.put_nowait({"event": event_type, **data})

        # Run transformer in background task
        async def run_transform():
            nonlocal transform_result, transform_error
            try:
                transform_result = await self.transformer.transform(
                    input_paths=[str(f) for f in files],
                    instruction=instruction,
                    output_model=WorkflowDefinition,
                    config=config,
                    on_event=on_event,
                )
            except Exception as e:
                transform_error = e
                logger.exception(f"Schema transformation failed: {e}")

        task = asyncio.create_task(run_transform())

        # Stream events
        while not task.done():
            try:
                event = await asyncio.wait_for(events_queue.get(), timeout=1.0)
                yield event
            except TimeoutError:
                yield {"event": "keepalive"}

        # Drain remaining events
        while not events_queue.empty():
            try:
                event = events_queue.get_nowait()
                yield event
            except asyncio.QueueEmpty:
                break

        # Check for errors
        if transform_error:
            logger.error(f"Transform error: {transform_error}")
            yield {"event": "error", "message": str(transform_error)}
            return

        if transform_result is None:
            logger.error("Transform result is None")
            yield {"event": "error", "message": "Schema generation did not produce a result"}
            return

        if not transform_result.items:
            logger.error(
                f"Transform result has no items. "
                f"Manifest: {transform_result.manifest}, "
                f"Debug: {transform_result.debug}"
            )
            yield {
                "event": "error",
                "message": (
                    f"Schema generation completed but produced no items. "
                    f"Manifest artifact: {transform_result.manifest.artifact_path if transform_result.manifest else 'None'}"
                ),
            }
            return

        # Get the generated definition
        definition = transform_result.items[0]

        # Validate the definition
        validation = self._validate_definition(definition)

        # Generate view templates if validation passed
        view_templates: list[ViewTemplateCreate] = []
        if validation.is_valid:
            try:
                view_templates = await self.view_generator.generate_views_from_description(
                    description, definition
                )
            except Exception as e:
                logger.warning(f"Failed to generate view templates: {e}")
                # Not a fatal error - continue with empty views

        # Emit completion event
        yield {
            "event": "complete",
            "definition": definition.model_dump(by_alias=True),
            "validation": validation.model_dump(by_alias=True),
            "view_templates": [vt.model_dump(by_alias=True) for vt in view_templates],
        }

    def _validate_definition(self, definition: WorkflowDefinition) -> SchemaValidationResult:
        """Validate a generated WorkflowDefinition.

        Args:
            definition: The definition to validate.

        Returns:
            Validation result with errors and warnings.
        """
        errors: list[str] = []
        warnings: list[str] = []

        # Check for required fields
        if not definition.workflow_id:
            errors.append("workflowId is required")
        if not definition.name:
            errors.append("name is required")
        if not definition.node_types:
            errors.append("At least one node type is required")
        if not definition.edge_types:
            warnings.append("No edge types defined - consider adding relationships")

        # Validate node types
        node_type_names = set()
        for nt in definition.node_types:
            if nt.type in node_type_names:
                errors.append(f"Duplicate node type: {nt.type}")
            node_type_names.add(nt.type)

            # Check title field exists
            field_keys = {f.key for f in nt.fields}
            if nt.title_field and nt.title_field not in field_keys:
                errors.append(
                    f"Node type {nt.type}: titleField '{nt.title_field}' not found in fields"
                )

        # Validate edge types reference valid node types
        for et in definition.edge_types:
            if et.from_type not in node_type_names:
                errors.append(f"Edge type {et.type}: from type '{et.from_type}' not found")
            if et.to_type not in node_type_names:
                errors.append(f"Edge type {et.type}: to type '{et.to_type}' not found")

        return SchemaValidationResult(
            is_valid=len(errors) == 0,
            errors=errors,
            warnings=warnings,
            fixes_applied=[],
        )
