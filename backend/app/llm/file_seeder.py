"""Seed workflows from uploaded files using the agentic data transformer."""

import asyncio
import json
import logging
import shutil
import subprocess
import sys
import tempfile
from collections.abc import AsyncGenerator
from pathlib import Path
from typing import Any

from app.db import graph_store
from app.llm.transformer import DataTransformer, TransformConfig
from app.llm.transformer.schema_dsl import workflow_to_dsl
from app.llm.transformer.seed_models import SeedData
from app.llm.transformer.seed_validators import create_seed_data_validator
from app.llm.transformer.validator import validate_artifact_with_custom
from app.models import EdgeCreate, NodeCreate, WorkflowDefinition
from app.storage.upload_store import UploadStore, get_upload_store

logger = logging.getLogger(__name__)


SEED_FROM_FILES_INSTRUCTION = """Transform data into SeedData for a workflow graph.

## IMPORTANT: User Instructions (READ FIRST)

{instruction}

## Your Task

1. First, check your available skills by running: ls -la .claude/skills/
2. Explore the input sources to understand their structure and content:
   - If input files are present in the working directory, explore them
   - If instructed to use external sources (DynamoDB, APIs, etc.), use the appropriate skills
3. Extract entities that match the node types defined in the workflow schema
4. Create SeedNode objects for each entity with appropriate properties
5. Create SeedEdge objects to connect related nodes
6. Output a complete SeedData object with nodes and edges

**Remember to follow the User Instructions above when deciding what data to include.**

## Workflow Schema

{schema_dsl}

## Output Format

Create a SeedData object with:
- nodes: List of SeedNode objects
- edges: List of SeedEdge objects

For SeedNode:
- temp_id: Unique identifier for referencing in edges (e.g., "author_1", "message_23")
- node_type: Must match a type from the workflow schema
- title: Display title for the node
- status: Optional status value (if the node type has states)
- properties: Field values matching the node type's field definitions

For SeedEdge:
- edge_type: Must match a type from the workflow schema
- from_temp_id: References a node's temp_id
- to_temp_id: References a node's temp_id
- properties: Optional edge properties

## Important Guidelines

- Use consistent temp_id prefixes by node type (e.g., "author_", "message_", "link_")
- Ensure all edge references use valid temp_ids from the nodes list
- Match field keys exactly as defined in the schema
- Include all required fields for each node type
- Create meaningful relationships based on the data structure
- If using external sources, write code that fetches and transforms the data
"""


class FileSeeder:
    """Seed workflows from uploaded files using the agentic transformer.

    Uses the DataTransformer in code mode to generate SeedData, which is
    then inserted into the database.
    """

    def __init__(self, upload_store: UploadStore | None = None):
        """Initialize the seeder.

        Args:
            upload_store: Optional upload store instance. Uses global if not provided.
        """
        self.upload_store = upload_store or get_upload_store()
        self.transformer = DataTransformer()

    async def seed_from_files(
        self,
        workflow_id: str,
        definition: WorkflowDefinition,
        upload_id: str,
        instruction: str | None = None,
    ) -> dict[str, Any]:
        """Seed a workflow from uploaded files.

        Args:
            workflow_id: The workflow to seed.
            definition: The workflow definition schema.
            upload_id: The upload session ID containing the files.
            instruction: Optional additional instructions for transformation.

        Returns:
            Dict with nodes_created and edges_created counts.

        Raises:
            FileNotFoundError: If the upload session doesn't exist.
            ValueError: If transformation fails.
        """
        result = None
        async for event in self.seed_from_files_with_events(
            workflow_id, definition, upload_id, instruction
        ):
            if event.get("event") == "complete":
                result = event

        if result is None:
            raise ValueError("Seeding did not complete")

        return {
            "nodes_created": result.get("nodes_created", 0),
            "edges_created": result.get("edges_created", 0),
        }

    async def seed_from_files_with_events(
        self,
        workflow_id: str,
        definition: WorkflowDefinition,
        upload_id: str,
        instruction: str | None = None,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """Seed workflow from files, yielding events for SSE streaming.

        Args:
            workflow_id: The workflow to seed.
            definition: The workflow definition schema.
            upload_id: The upload session ID containing the files.
            instruction: Optional additional instructions.

        Yields:
            Events with structure: {"event": "...", ...data}

        Events:
            - phase: Phase transition (transforming, inserting)
            - tool_call: Agent calling a tool
            - tool_result: Tool execution result
            - validation: Schema validation result
            - text: Agent thinking/output text
            - progress: Insertion progress
            - complete: Seeding complete with counts
            - error: Error occurred
        """
        # Get uploaded files
        try:
            files = await self.upload_store.get_files(upload_id)
        except FileNotFoundError:
            yield {"event": "error", "message": f"Upload session {upload_id} not found or expired"}
            return

        if not files:
            yield {"event": "error", "message": "No files found in upload session"}
            return

        yield {"event": "phase", "phase": "transforming", "message": "Analyzing files..."}

        # Build instruction with schema context (compact DSL for token efficiency)
        schema_dsl = workflow_to_dsl(definition)
        user_instruction = instruction or "Extract all relevant data from the input files."

        full_instruction = SEED_FROM_FILES_INSTRUCTION.format(
            schema_dsl=schema_dsl,
            instruction=user_instruction,
        )

        # Configure transformer for code mode (large outputs)
        # Persist work_dir for debugging - can inspect transform.py
        work_dir = Path("/data/transformer_work") / workflow_id
        work_dir.mkdir(parents=True, exist_ok=True)

        config = TransformConfig(
            mode="code",
            output_format="json",
            max_iterations=80,
            work_dir=str(work_dir),
        )

        # Create custom validator from workflow definition
        seed_validator = create_seed_data_validator(definition)

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
                    instruction=full_instruction,
                    output_model=SeedData,
                    config=config,
                    on_event=on_event,
                    custom_validator=seed_validator,
                )
            except Exception as e:
                transform_error = e
                logger.exception(f"Seed transformation failed: {e}")

        task = asyncio.create_task(run_transform())

        # Stream transformer events
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
            yield {"event": "error", "message": str(transform_error)}
            return

        if transform_result is None or not transform_result.items:
            yield {"event": "error", "message": "Transformation did not produce seed data"}
            return

        # Get the generated seed data
        seed_data: SeedData = transform_result.items[0]

        # Insert into database
        yield {
            "event": "phase",
            "phase": "inserting",
            "message": (
                f"Inserting {len(seed_data.nodes)} nodes "
                f"and {len(seed_data.edges)} edges..."
            ),
        }

        try:
            nodes_created, edges_created = await self._insert_seed_data(
                workflow_id,
                seed_data,
                lambda current, total, msg: events_queue.put_nowait({
                    "event": "progress",
                    "current": current,
                    "total": total,
                    "message": msg,
                }),
            )
        except Exception as e:
            logger.exception(f"Failed to insert seed data: {e}")
            yield {"event": "error", "message": f"Failed to insert data: {e}"}
            return

        yield {
            "event": "complete",
            "nodes_created": nodes_created,
            "edges_created": edges_created,
        }

    async def preview_transform(
        self,
        workflow_id: str,
        definition: WorkflowDefinition,
        upload_id: str | None = None,
        instruction: str | None = None,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """Generate and execute transform.py, return preview without inserting.

        Runs the full transformer (generate script + execute) but stops before
        inserting into the database. Returns the script content and a preview
        of what would be imported.

        If upload_id is not provided, runs in external sources mode where the
        transformer relies solely on the instruction to fetch data from external
        services (e.g., DynamoDB, APIs) using available skills.

        Args:
            workflow_id: The workflow to seed.
            definition: The workflow definition schema.
            upload_id: Optional upload session ID containing the files.
            instruction: Optional additional instructions for transformation.

        Yields:
            Events with structure: {"event": "...", ...data}

        Events:
            - phase: Phase transition (transforming)
            - tool_call: Agent calling a tool
            - tool_result: Tool execution result
            - validation: Schema validation result
            - text: Agent thinking/output text
            - complete: Preview complete with script_content and preview stats
            - error: Error occurred
        """
        logger.info(
            f"preview_transform called: workflow_id={workflow_id}, "
            f"upload_id={upload_id}, instruction={instruction!r}"
        )

        # Get uploaded files (if upload_id provided)
        files: list[Path] = []
        if upload_id:
            try:
                files = await self.upload_store.get_files(upload_id)
            except FileNotFoundError:
                yield {
                    "event": "error",
                    "message": f"Upload session {upload_id} not found or expired",
                }
                return

        # External sources mode: no files, but must have instruction
        if not files and not instruction:
            yield {
                "event": "error",
                "message": (
                    "No files uploaded. "
                    "Please provide instructions to fetch data from external sources."
                ),
            }
            return

        if files:
            yield {"event": "phase", "phase": "transforming", "message": "Analyzing files..."}
        else:
            yield {
                "event": "phase",
                "phase": "transforming",
                "message": "Fetching from external sources...",
            }

        # Build instruction with schema context (compact DSL for token efficiency)
        schema_dsl = workflow_to_dsl(definition)

        if files:
            user_instruction = instruction or "Extract all relevant data from the input files."
        else:
            # External sources mode - instruction is required and describes how to fetch data
            user_instruction = instruction  # Already validated as non-None above

        full_instruction = SEED_FROM_FILES_INSTRUCTION.format(
            schema_dsl=schema_dsl,
            instruction=user_instruction,
        )
        logger.info(f"user_instruction={user_instruction!r}")
        logger.debug(f"full_instruction preview:\n{full_instruction[:500]}...")

        # Use a temp work directory for preview (will be cleaned up)
        work_dir = Path(tempfile.mkdtemp(prefix=f"preview_{workflow_id}_"))

        config = TransformConfig(
            mode="code",
            output_format="json",
            max_iterations=80,
            work_dir=str(work_dir),
        )

        # Create custom validator from workflow definition
        seed_validator = create_seed_data_validator(definition)

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
                    instruction=full_instruction,
                    output_model=SeedData,
                    config=config,
                    on_event=on_event,
                    custom_validator=seed_validator,
                )
            except Exception as e:
                transform_error = e
                logger.exception(f"Preview transformation failed: {e}")

        task = asyncio.create_task(run_transform())

        # Stream transformer events
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
            # Clean up work_dir on error
            try:
                shutil.rmtree(work_dir)
            except Exception:
                pass
            yield {"event": "error", "message": str(transform_error)}
            return

        if transform_result is None or not transform_result.items:
            # Clean up work_dir on error
            try:
                shutil.rmtree(work_dir)
            except Exception:
                pass
            yield {"event": "error", "message": "Transformation did not produce seed data"}
            return

        # Get the generated seed data
        seed_data: SeedData = transform_result.items[0]

        # Read the generated transform.py script
        script_path = work_dir / "transform.py"
        script_content = ""
        if script_path.exists():
            script_content = script_path.read_text()

        # Build preview with counts and sample nodes
        sample_nodes = []
        for node in seed_data.nodes[:10]:  # First 10 nodes as sample
            sample_nodes.append({
                "node_type": node.node_type,
                "title": node.title,
                "status": node.status,
            })

        # Serialize seed data for caching (avoids re-running script on confirm)
        seed_data_json = seed_data.model_dump_json()

        # Clean up work_dir
        try:
            shutil.rmtree(work_dir)
        except Exception as e:
            logger.warning(f"Failed to clean up preview work_dir: {e}")

        yield {
            "event": "complete",
            "script_content": script_content,
            "instruction": user_instruction,
            "seed_data_json": seed_data_json,  # Cached for confirm step
            "preview": {
                "node_count": len(seed_data.nodes),
                "edge_count": len(seed_data.edges),
                "sample_nodes": sample_nodes,
            },
        }

    async def confirm_transform(
        self,
        workflow_id: str,
        definition: WorkflowDefinition,
        upload_id: str | None,
        script_content: str,
        seed_data_json: str | None = None,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """Confirm and insert seed data from a previous preview.

        If seed_data_json is provided (from preview), uses it directly without
        re-executing the script. Otherwise falls back to re-executing the script.

        For external sources mode (no upload_id), seed_data_json is required.

        Args:
            workflow_id: The workflow to seed.
            definition: The workflow definition schema.
            upload_id: Optional upload session ID containing the files.
            script_content: The Python script (for fallback if no cached data).
            seed_data_json: Cached seed data JSON from preview (skips re-execution).

        Yields:
            Events with structure: {"event": "...", ...data}

        Events:
            - phase: Phase transition (executing, validating, inserting)
            - progress: Insertion progress
            - complete: Seeding complete with counts
            - error: Error occurred
        """
        seed_data: SeedData | None = None

        # If we have cached seed data from preview, use it directly
        if seed_data_json:
            yield {
                "event": "phase",
                "phase": "validating",
                "message": "Using cached transformation output...",
            }

            try:
                seed_data = SeedData.model_validate_json(seed_data_json)
            except Exception as e:
                logger.warning(f"Failed to parse cached seed_data_json: {e}")
                if not upload_id:
                    # External sources mode without valid cached data - can't recover
                    yield {
                        "event": "error",
                        "message": f"Failed to parse cached data: {e}",
                    }
                    return
                # Fall through to script execution with files

        # Fall back to re-executing script if no cached data
        if seed_data is None:
            if not upload_id:
                yield {
                    "event": "error",
                    "message": "No cached data and no upload session - cannot proceed",
                }
                return

            # Get uploaded files
            try:
                files = await self.upload_store.get_files(upload_id)
            except FileNotFoundError:
                yield {
                    "event": "error",
                    "message": f"Upload session {upload_id} not found or expired",
                }
                return

            if not files:
                yield {"event": "error", "message": "No files found in upload session"}
                return

            if not script_content.strip():
                yield {"event": "error", "message": "No script content provided"}
                return

            # Create temp work directory
            work_dir = Path(tempfile.mkdtemp(prefix=f"confirm_{workflow_id}_"))

            try:
                yield {
                    "event": "phase",
                    "phase": "executing",
                    "message": "Re-executing transform script...",
                }

                # Copy input files to work directory
                for file_path in files:
                    dest = work_dir / Path(file_path).name
                    shutil.copy(file_path, dest)

                # Write the script
                script_path = work_dir / "transform.py"
                script_path.write_text(script_content)

                # Execute the script
                try:
                    result = subprocess.run(
                        [sys.executable, str(script_path)],
                        cwd=str(work_dir),
                        capture_output=True,
                        text=True,
                        timeout=600,  # 10 minutes - transformations can be slow
                    )
                except subprocess.TimeoutExpired:
                    yield {"event": "error", "message": "Script timed out after 10 minutes"}
                    return
                except Exception as e:
                    yield {"event": "error", "message": f"Script execution failed: {e}"}
                    return

                if result.returncode != 0:
                    error_msg = result.stderr[:2000] if result.stderr else "Unknown error"
                    yield {
                        "event": "error",
                        "message": f"Script failed with exit code {result.returncode}: {error_msg}",
                    }
                    return

                yield {
                    "event": "phase",
                    "phase": "validating",
                    "message": "Validating transformation output...",
                }

                # Validate the output
                output_path = work_dir / "output.json"
                if not output_path.exists():
                    yield {"event": "error", "message": "Script did not produce output.json"}
                    return

                # Create custom validator from workflow definition
                seed_validator = create_seed_data_validator(definition)

                validation_result = validate_artifact_with_custom(
                    file_path=output_path,
                    model=SeedData,
                    format="json",
                    custom_validator=seed_validator,
                )

                if not validation_result.valid:
                    errors = validation_result.errors[:5]
                    custom_msgs = [
                        f"{e.path}: {e.message}" for e in validation_result.custom_errors[:5]
                    ]
                    all_errors = errors + custom_msgs
                    yield {
                        "event": "error",
                        "message": f"Validation failed: {'; '.join(all_errors)}",
                    }
                    return

                # Emit warnings but don't block
                if validation_result.warnings:
                    warning_msgs = [
                        f"{w.path}: {w.message}" for w in validation_result.warnings[:5]
                    ]
                    yield {
                        "event": "validation_warning",
                        "warnings": warning_msgs,
                    }

                # Parse the seed data
                try:
                    output_content = output_path.read_text()
                    seed_data = SeedData.model_validate(json.loads(output_content))
                except Exception as e:
                    yield {"event": "error", "message": f"Failed to parse output: {e}"}
                    return
            finally:
                # Clean up work directory
                try:
                    shutil.rmtree(work_dir)
                except Exception as e:
                    logger.warning(f"Failed to clean up confirm work_dir: {e}")

        # At this point seed_data should be set (either from cache or script execution)
        if seed_data is None:
            yield {"event": "error", "message": "No seed data available"}
            return

        # Final validation gate before insertion
        seed_validator = create_seed_data_validator(definition)
        all_issues = seed_validator(seed_data)

        # Separate errors from warnings - only block on errors
        from app.llm.transformer.validator import ValidationSeverity

        errors = [e for e in all_issues if e.severity == ValidationSeverity.ERROR]
        warnings = [e for e in all_issues if e.severity == ValidationSeverity.WARNING]

        if errors:
            error_msgs = [f"{e.path}: {e.message}" for e in errors[:5]]
            yield {
                "event": "error",
                "message": f"Validation failed: {'; '.join(error_msgs)}",
            }
            return

        # Emit warnings but don't block
        if warnings:
            warning_msgs = [f"{w.path}: {w.message}" for w in warnings[:5]]
            yield {
                "event": "validation_warning",
                "warnings": warning_msgs,
            }

        # Insert into database
        yield {
            "event": "phase",
            "phase": "inserting",
            "message": (
                f"Inserting {len(seed_data.nodes)} nodes "
                f"and {len(seed_data.edges)} edges..."
            ),
        }

        # Create event queue for progress updates
        events_queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()

        nodes_created, edges_created = await self._insert_seed_data(
            workflow_id,
            seed_data,
            lambda current, total, msg: events_queue.put_nowait({
                "event": "progress",
                "current": current,
                "total": total,
                "message": msg,
            }),
        )

        # Drain progress events
        while not events_queue.empty():
            try:
                event = events_queue.get_nowait()
                yield event
            except asyncio.QueueEmpty:
                break

        yield {
            "event": "complete",
            "nodes_created": nodes_created,
            "edges_created": edges_created,
        }

    async def _insert_seed_data(
        self,
        workflow_id: str,
        seed_data: SeedData,
        on_progress: Any = None,
    ) -> tuple[int, int]:
        """Insert seed data into the database.

        Args:
            workflow_id: The workflow to seed.
            seed_data: The seed data to insert.
            on_progress: Optional callback for progress updates.

        Returns:
            Tuple of (nodes_created, edges_created).
        """
        # Map temp_ids to real IDs
        temp_id_to_real_id: dict[str, str] = {}
        nodes_created = 0
        edges_created = 0
        total_items = len(seed_data.nodes) + len(seed_data.edges)

        # Insert nodes first
        for i, seed_node in enumerate(seed_data.nodes):
            try:
                node = await graph_store.create_node(
                    workflow_id,
                    NodeCreate(
                        type=seed_node.node_type,
                        title=seed_node.title,
                        status=seed_node.status,
                        properties=seed_node.properties,
                    ),
                )
                temp_id_to_real_id[seed_node.temp_id] = node.id
                nodes_created += 1

                if on_progress and (i + 1) % 10 == 0:
                    on_progress(
                        i + 1,
                        total_items,
                        f"Inserted {i + 1}/{len(seed_data.nodes)} nodes",
                    )

            except Exception as e:
                logger.warning(f"Failed to create node {seed_node.temp_id}: {e}")
                # Continue with other nodes

        # Insert edges
        edges_start = len(seed_data.nodes)
        for i, seed_edge in enumerate(seed_data.edges):
            from_id = temp_id_to_real_id.get(seed_edge.from_temp_id)
            to_id = temp_id_to_real_id.get(seed_edge.to_temp_id)

            if not from_id:
                logger.warning(
                    f"Edge references unknown from_temp_id: {seed_edge.from_temp_id}"
                )
                continue
            if not to_id:
                logger.warning(
                    f"Edge references unknown to_temp_id: {seed_edge.to_temp_id}"
                )
                continue

            try:
                await graph_store.create_edge(
                    workflow_id,
                    EdgeCreate(
                        type=seed_edge.edge_type,
                        from_node_id=from_id,
                        to_node_id=to_id,
                        properties=seed_edge.properties,
                    ),
                )
                edges_created += 1

                if on_progress and (i + 1) % 20 == 0:
                    on_progress(
                        edges_start + i + 1,
                        total_items,
                        f"Inserted {i + 1}/{len(seed_data.edges)} edges",
                    )

            except Exception as e:
                logger.warning(
                    f"Failed to create edge {seed_edge.edge_type} "
                    f"({seed_edge.from_temp_id} -> {seed_edge.to_temp_id}): {e}"
                )
                # Continue with other edges

        return nodes_created, edges_created
