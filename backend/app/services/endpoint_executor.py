"""Endpoint execution service for learnable endpoints."""

import asyncio
import json
import logging
import os
import shutil
import tempfile
import time
from collections.abc import AsyncGenerator
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

from app.db import graph_store
from app.llm.transformer import DataTransformer, TransformConfig
from app.llm.transformer.seed_models import SeedData
from app.llm.transformer.seed_validators import create_seed_data_validator
from app.llm.transformer.validator import CustomValidationError
from app.models import EdgeCreate, Endpoint, NodeCreate, NodeUpdate, WorkflowDefinition
from app.models.endpoint import EndpointExecuteResponse
from app.models.match import MatchDecision, MatchResult
from app.services.node_matcher import NodeMatcher

logger = logging.getLogger(__name__)


# Output models for different HTTP methods


class QueryResult(BaseModel):
    """Output for GET endpoints - query results."""

    nodes: list[dict[str, Any]] = Field(
        default_factory=list, description="Matching nodes with their properties"
    )
    count: int = Field(0, description="Total count of matching nodes")


class UpdateResult(BaseModel):
    """Output for PUT endpoints - nodes to update."""

    updates: list[dict[str, Any]] = Field(
        default_factory=list,
        description="List of node updates with node_id and properties",
    )


class DeleteResult(BaseModel):
    """Output for DELETE endpoints - node IDs to delete."""

    node_ids: list[str] = Field(
        default_factory=list, description="List of node IDs to delete"
    )


def validate_update_result(update_result: UpdateResult) -> list[CustomValidationError]:
    """Validate that UpdateResult has the correct structure for applying updates.

    Checks:
    - Each update has a node_id (string)
    - Each update has a properties dict

    Args:
        update_result: The UpdateResult to validate.

    Returns:
        List of validation errors.
    """
    errors: list[CustomValidationError] = []

    for i, update in enumerate(update_result.updates):
        # Check node_id exists and is a string
        node_id = update.get("node_id")
        if not node_id:
            errors.append(
                CustomValidationError(
                    path=f"updates[{i}].node_id",
                    message="Missing required field 'node_id' in update",
                    code="missing_node_id",
                    context={"update_keys": list(update.keys())},
                )
            )
        elif not isinstance(node_id, str):
            errors.append(
                CustomValidationError(
                    path=f"updates[{i}].node_id",
                    message=f"node_id must be a string, got {type(node_id).__name__}",
                    code="invalid_node_id_type",
                    context={"node_id": str(node_id)[:100]},
                )
            )

        # Check properties exists and is a dict
        if "properties" not in update:
            # Provide helpful message with the keys that were provided
            provided_keys = [k for k in update.keys() if k != "node_id"]
            errors.append(
                CustomValidationError(
                    path=f"updates[{i}].properties",
                    message=(
                        f"Missing required field 'properties' in update. "
                        f"Got keys: {provided_keys}. Wrap your property values in a 'properties' dict."
                    ),
                    code="missing_properties",
                    context={
                        "node_id": node_id,
                        "provided_keys": provided_keys,
                    },
                )
            )
        elif not isinstance(update["properties"], dict):
            errors.append(
                CustomValidationError(
                    path=f"updates[{i}].properties",
                    message=f"properties must be a dict, got {type(update['properties']).__name__}",
                    code="invalid_properties_type",
                    context={"node_id": node_id},
                )
            )

    return errors


# Instruction templates for different HTTP methods

GET_INSTRUCTION_TEMPLATE = """Query the workflow graph based on the user's input.

## Your Task
{instruction}

## Workflow Schema
{schema_json}

## Input Data
The input.json file contains the query parameters or criteria provided by the user.

## Output Format
Return a QueryResult with:
- nodes: List of matching nodes with their id, type, title, status, and properties
- count: Total number of matching nodes

Analyze the input criteria and return nodes that match. You can use the workflow schema
to understand what node types and properties are available.
"""

POST_INSTRUCTION_TEMPLATE = """Create or update nodes and edges in the workflow graph.

## Your Task
{instruction}

## Workflow Schema
{schema_json}

## Input Data
The input.json file contains the raw data to be transformed and stored.

## Querying Existing Nodes (graph_api.py)

IMPORTANT: Before creating nodes, check if matching nodes already exist using graph_api.py.
This prevents duplicate nodes when the input data corresponds to existing records.

```python
from graph_api import search_nodes, get_node

# Search by type and properties (most common for matching by external ID)
existing = search_nodes("Analysis", properties={{"result_id": "abc123"}})

# Search by exact title
existing = search_nodes("Sample", title_exact="Sample-001")

# Search by title substring
existing = search_nodes("Sample", title_contains="Sample")
```

When you find an existing node that should be updated:
- Set `"intent": "update"` on the SeedNode
- Set `"existing_node_id"` to the existing node's ID

## Output Format
Return a SeedData object with:
- nodes: List of SeedNode objects to create or update
- edges: List of SeedEdge objects to connect nodes

For SeedNode:
- temp_id: Unique identifier for referencing in edges (e.g., "item_1", "item_2")
- node_type: Must match a type from the workflow schema
- title: Display title for the node
- status: Optional status value (if the node type has states)
- properties: Field values matching the node type's field definitions
- intent: "create" (default) or "update" - use "update" when modifying existing nodes
- existing_node_id: Required when intent="update" - the ID of the node to update

For SeedEdge:
- edge_type: Must match a type from the workflow schema
- from_temp_id: References a node's temp_id
- to_temp_id: References a node's temp_id
- properties: Optional edge properties

## Important Guidelines
- Use graph_api.py to check for existing nodes BEFORE deciding to create
- When input has a unique identifier (like result_id), search for existing nodes with that ID
- Use consistent temp_id prefixes by node type
- Ensure all edge references use valid temp_ids from the nodes list
- Match field keys exactly as defined in the schema
"""

PUT_INSTRUCTION_TEMPLATE = """Update existing nodes in the workflow graph.

## Your Task
{instruction}

## Workflow Schema
{schema_json}

## Input Data
The input.json file contains the update data with node identifiers and new values.

## Output Format
Return an UpdateResult with:
- updates: List of objects containing:
  - node_id: The ID of the node to update (find using the input criteria)
  - properties: The new property values to set

You may need to query the graph to find the node IDs to update based on the input criteria.
"""

DELETE_INSTRUCTION_TEMPLATE = """Delete nodes from the workflow graph.

## Your Task
{instruction}

## Workflow Schema
{schema_json}

## Input Data
The input.json file contains the criteria for which nodes to delete.

## Output Format
Return a DeleteResult with:
- node_ids: List of node IDs to delete

You may need to query the graph to find the node IDs that match the deletion criteria.
Be careful - this operation cannot be undone.
"""


class EndpointExecutor:
    """Execute learnable endpoints using the transformer."""

    def __init__(self):
        self.transformer = DataTransformer()

    async def execute(
        self,
        endpoint: Endpoint,
        workflow: WorkflowDefinition,
        input_data: dict | list | str | None,
        learn: bool = False,
    ) -> EndpointExecuteResponse:
        """Execute an endpoint synchronously.

        Args:
            endpoint: The endpoint configuration.
            workflow: The workflow definition.
            input_data: Input data for the transformation.
            learn: Whether to run in learn mode.

        Returns:
            EndpointExecuteResponse with execution results.
        """
        result = None
        async for event in self.execute_with_events(
            endpoint, workflow, input_data, learn
        ):
            if event.get("event") == "complete":
                result = event
            elif event.get("event") == "error":
                return EndpointExecuteResponse(
                    success=False,
                    errors=[event.get("message", "Unknown error")],
                    execution_time_ms=event.get("execution_time_ms", 0),
                )

        if result is None:
            return EndpointExecuteResponse(
                success=False,
                errors=["Execution did not complete"],
            )

        return EndpointExecuteResponse(
            success=True,
            result=result.get("result"),
            nodes_created=result.get("nodes_created", 0),
            nodes_updated=result.get("nodes_updated", 0),
            nodes_deleted=result.get("nodes_deleted", 0),
            edges_created=result.get("edges_created", 0),
            execution_time_ms=result.get("execution_time_ms", 0),
        )

    async def execute_with_events(
        self,
        endpoint: Endpoint,
        workflow: WorkflowDefinition,
        input_data: dict | list | str | None,
        learn: bool = False,
        apply: bool = True,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """Execute an endpoint, yielding events for SSE streaming.

        Args:
            endpoint: The endpoint configuration.
            workflow: The workflow definition.
            input_data: Input data for the transformation.
            learn: Whether to run in learn mode.
            apply: Whether to apply changes to the graph (False for preview mode).

        Yields:
            Events with structure: {"event": "...", ...data}
        """
        start_time = time.time()
        workflow_id = endpoint.workflow_id

        # Determine if we need to learn
        should_learn = learn or not endpoint.is_learned

        yield {
            "event": "phase",
            "phase": "preparing",
            "message": "Preparing execution environment...",
            "learn_mode": should_learn,
        }

        # Create separate directories for input and work
        # (transformer copies input files into work_dir, so they must be separate)
        input_dir = Path(tempfile.mkdtemp(prefix=f"endpoint_{endpoint.slug}_input_"))
        work_dir = Path(tempfile.mkdtemp(prefix=f"endpoint_{endpoint.slug}_work_"))

        try:
            # Write input data to input directory (not work directory)
            input_path = input_dir / "input.json"
            if input_data is not None:
                if isinstance(input_data, str):
                    input_path.write_text(input_data)
                else:
                    input_path.write_text(json.dumps(input_data, indent=2))
            else:
                input_path.write_text("{}")

            # Inject learned assets if available and not in learn mode
            if not should_learn:
                # Write learned skill.md
                if endpoint.learned_skill_md:
                    skill_dir = work_dir / ".claude" / "skills" / f"endpoint-{endpoint.slug}"
                    skill_dir.mkdir(parents=True, exist_ok=True)
                    (skill_dir / "SKILL.md").write_text(endpoint.learned_skill_md)
                    logger.info(f"Injected learned SKILL.md for endpoint {endpoint.slug}")

                # Write learned transform.py for code mode endpoints
                if endpoint.learned_transformer_code and endpoint.mode == "code":
                    transform_path = work_dir / "transform.py"
                    transform_path.write_text(endpoint.learned_transformer_code)
                    logger.info(f"Injected learned transform.py for endpoint {endpoint.slug}")

            # Build instruction based on HTTP method
            # Only include essential schema info (node_types, edge_types) - exclude rules and views
            schema_dict = workflow.model_dump(by_alias=True)
            essential_schema = {
                "name": schema_dict.get("name"),
                "description": schema_dict.get("description"),
                "nodeTypes": schema_dict.get("nodeTypes", []),
                "edgeTypes": schema_dict.get("edgeTypes", []),
            }
            schema_json = json.dumps(essential_schema, indent=2)
            instruction = self._build_instruction(
                endpoint, schema_json, should_learn
            )

            # Determine output model and config based on HTTP method
            output_model, config = self._get_model_and_config(endpoint, should_learn)

            # Create event queue for streaming
            events_queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
            transform_result = None
            transform_error = None

            # Create custom validator based on HTTP method
            custom_validator = None
            if endpoint.http_method == "POST":
                custom_validator = create_seed_data_validator(workflow)
            elif endpoint.http_method == "PUT":
                custom_validator = validate_update_result

            def on_event(event_type: str, data: dict[str, Any]) -> None:
                events_queue.put_nowait({"event": event_type, **data})

            message = (
                "Learning transformation pattern..."
                if should_learn
                else "Running transformation..."
            )
            yield {
                "event": "phase",
                "phase": "transforming",
                "message": message,
            }

            # Run transformer in background
            async def run_transform():
                nonlocal transform_result, transform_error
                try:
                    transform_result = await self.transformer.transform(
                        input_paths=[str(input_path)],
                        instruction=instruction,
                        output_model=output_model,
                        config=TransformConfig(
                            mode=endpoint.mode,
                            output_format="json",
                            max_iterations=80,
                            work_dir=str(work_dir),
                            learn=should_learn,
                            workflow_id=workflow_id,
                            db_path=os.environ.get("DATABASE_PATH", "./data/workflow.db"),
                        ),
                        on_event=on_event,
                        custom_validator=custom_validator,
                    )
                except Exception as e:
                    transform_error = e
                    logger.exception(f"Endpoint execution failed: {e}")

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

            elapsed_ms = int((time.time() - start_time) * 1000)

            # Handle errors
            if transform_error:
                yield {
                    "event": "error",
                    "message": str(transform_error),
                    "execution_time_ms": elapsed_ms,
                }
                return

            if transform_result is None or not transform_result.items:
                yield {
                    "event": "error",
                    "message": "Transformation did not produce output",
                    "execution_time_ms": elapsed_ms,
                }
                return

            # Save learned assets if in learn mode
            if should_learn and transform_result.learned:
                yield {
                    "event": "phase",
                    "phase": "saving",
                    "message": "Saving learned transformation...",
                }

                learned_code = (
                    transform_result.learned.transformer_code
                    if transform_result.learned
                    else None
                )

                await graph_store.update_endpoint_learned(
                    workflow_id=workflow_id,
                    endpoint_id=endpoint.id,
                    skill_md=transform_result.learned.skill_md,
                    transformer_code=learned_code,
                )

                yield {
                    "event": "skill_saved",
                    "skill_md": transform_result.learned.skill_md,
                }

            # Apply result based on HTTP method (or preview if apply=False)
            if apply:
                yield {
                    "event": "phase",
                    "phase": "applying",
                    "message": "Applying changes to graph...",
                }

                result = await self._apply_result(
                    endpoint, workflow_id, transform_result.items[0]
                )

                # Record execution
                await graph_store.record_endpoint_execution(workflow_id, endpoint.id)

                elapsed_ms = int((time.time() - start_time) * 1000)

                yield {
                    "event": "complete",
                    "execution_time_ms": elapsed_ms,
                    **result,
                }
            else:
                yield {
                    "event": "phase",
                    "phase": "preview",
                    "message": "Preview ready",
                }

                preview = self._preview_result(endpoint, transform_result.items[0])

                # Run matching for POST endpoints to detect duplicates
                match_result: MatchResult | None = None
                if endpoint.http_method == "POST":
                    seed_data = transform_result.items[0]
                    if isinstance(seed_data, SeedData):
                        yield {
                            "event": "phase",
                            "phase": "matching",
                            "message": "Matching against existing graph...",
                        }
                        matcher = NodeMatcher(graph_store, workflow_id)
                        match_result = await matcher.match_seed_data(seed_data)

                elapsed_ms = int((time.time() - start_time) * 1000)

                # Include learned assets if available (from endpoint or from this run)
                learned_skill_md = (
                    transform_result.learned.skill_md
                    if transform_result.learned
                    else endpoint.learned_skill_md
                )
                learned_transformer_code = (
                    transform_result.learned.transformer_code
                    if transform_result.learned and transform_result.learned.transformer_code
                    else endpoint.learned_transformer_code
                )

                complete_event: dict[str, Any] = {
                    "event": "complete",
                    "execution_time_ms": elapsed_ms,
                    "preview": True,
                    "transform_result": transform_result.items[0].model_dump(),
                    "learned_skill_md": learned_skill_md,
                    "learned_transformer_code": learned_transformer_code,
                    **preview,
                }
                if match_result:
                    complete_event["match_result"] = match_result.model_dump()

                yield complete_event

        finally:
            # Clean up directories
            for dir_path in [work_dir, input_dir]:
                try:
                    shutil.rmtree(dir_path)
                except Exception as e:
                    logger.warning(f"Failed to clean up {dir_path}: {e}")

    def _build_instruction(
        self, endpoint: Endpoint, schema_json: str, learn: bool
    ) -> str:
        """Build the full instruction for the transformer."""
        templates = {
            "GET": GET_INSTRUCTION_TEMPLATE,
            "POST": POST_INSTRUCTION_TEMPLATE,
            "PUT": PUT_INSTRUCTION_TEMPLATE,
            "DELETE": DELETE_INSTRUCTION_TEMPLATE,
        }

        template = templates.get(endpoint.http_method, POST_INSTRUCTION_TEMPLATE)
        instruction = template.format(
            schema_json=schema_json,
            instruction=endpoint.instruction,
        )

        # Reference the learned skill if available and not learning
        if endpoint.learned_skill_md and not learn:
            instruction += "\n\nRemember to check your available skills."

        return instruction

    def _get_model_and_config(
        self, endpoint: Endpoint, learn: bool
    ) -> tuple[type[BaseModel], TransformConfig]:
        """Get the appropriate output model and config for the HTTP method."""
        models = {
            "GET": QueryResult,
            "POST": SeedData,
            "PUT": UpdateResult,
            "DELETE": DeleteResult,
        }

        model = models.get(endpoint.http_method, SeedData)
        config = TransformConfig(
            mode=endpoint.mode,
            output_format="json",
            max_iterations=80,
            learn=learn,
        )

        return model, config

    async def _apply_result(
        self, endpoint: Endpoint, workflow_id: str, result: BaseModel
    ) -> dict[str, Any]:
        """Apply the transformation result to the graph."""
        if endpoint.http_method == "GET":
            # GET returns query results, no graph mutation
            query_result = result if isinstance(result, QueryResult) else QueryResult()
            return {
                "result": {
                    "nodes": query_result.nodes,
                    "count": query_result.count,
                },
            }

        elif endpoint.http_method == "POST":
            # POST creates nodes and edges
            seed_data = result if isinstance(result, SeedData) else SeedData(nodes=[], edges=[])
            nodes_created, edges_created = await self._insert_seed_data(
                workflow_id, seed_data
            )
            return {
                "nodes_created": nodes_created,
                "edges_created": edges_created,
            }

        elif endpoint.http_method == "PUT":
            # PUT updates nodes
            update_result = result if isinstance(result, UpdateResult) else UpdateResult()
            nodes_updated = 0

            for update in update_result.updates:
                node_id = update.get("node_id")
                properties = update.get("properties", {})

                if node_id and properties:
                    updated = await graph_store.update_node(
                        workflow_id,
                        node_id,
                        NodeUpdate(properties=properties),
                    )
                    if updated:
                        nodes_updated += 1

            return {"nodes_updated": nodes_updated}

        elif endpoint.http_method == "DELETE":
            # DELETE removes nodes
            delete_result = result if isinstance(result, DeleteResult) else DeleteResult()
            nodes_deleted = 0

            for node_id in delete_result.node_ids:
                deleted = await graph_store.delete_node(workflow_id, node_id)
                if deleted:
                    nodes_deleted += 1

            return {"nodes_deleted": nodes_deleted}

        return {}

    def _preview_result(
        self, endpoint: Endpoint, result: BaseModel
    ) -> dict[str, Any]:
        """Format result as preview without applying changes."""
        if endpoint.http_method == "GET":
            query_result = result if isinstance(result, QueryResult) else QueryResult()
            return {
                "result": {
                    "nodes": query_result.nodes,
                    "count": query_result.count,
                },
            }

        elif endpoint.http_method == "POST":
            seed_data = (
                result if isinstance(result, SeedData) else SeedData(nodes=[], edges=[])
            )
            return {
                "nodes_to_create": [n.model_dump() for n in seed_data.nodes],
                "edges_to_create": [e.model_dump() for e in seed_data.edges],
                "nodes_created": len(seed_data.nodes),
                "edges_created": len(seed_data.edges),
            }

        elif endpoint.http_method == "PUT":
            update_result = (
                result if isinstance(result, UpdateResult) else UpdateResult()
            )
            return {
                "updates_to_apply": update_result.updates,
                "nodes_updated": len(update_result.updates),
            }

        elif endpoint.http_method == "DELETE":
            delete_result = (
                result if isinstance(result, DeleteResult) else DeleteResult()
            )
            return {
                "nodes_to_delete": delete_result.node_ids,
                "nodes_deleted": len(delete_result.node_ids),
            }

        return {}

    async def _insert_seed_data(
        self, workflow_id: str, seed_data: SeedData
    ) -> tuple[int, int]:
        """Insert seed data into the database."""
        temp_id_to_real_id: dict[str, str] = {}
        nodes_created = 0
        edges_created = 0

        # Insert nodes first
        for seed_node in seed_data.nodes:
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
            except Exception as e:
                logger.warning(f"Failed to create node {seed_node.temp_id}: {e}")

        # Insert edges
        for seed_edge in seed_data.edges:
            from_id = temp_id_to_real_id.get(seed_edge.from_temp_id)
            to_id = temp_id_to_real_id.get(seed_edge.to_temp_id)

            if not from_id or not to_id:
                logger.warning(
                    f"Edge references unknown temp_id: "
                    f"{seed_edge.from_temp_id} -> {seed_edge.to_temp_id}"
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
            except Exception as e:
                logger.warning(f"Failed to create edge: {e}")

        return nodes_created, edges_created

    async def _insert_seed_data_with_matching(
        self,
        workflow_id: str,
        seed_data: SeedData,
        match_result: MatchResult,
    ) -> tuple[int, int, int]:
        """Insert/update seed data based on match results.

        Args:
            workflow_id: The workflow ID.
            seed_data: The seed data to insert.
            match_result: The matching results from NodeMatcher.

        Returns:
            Tuple of (nodes_created, nodes_updated, edges_created).
        """
        temp_id_to_real_id: dict[str, str] = {}
        nodes_created = 0
        nodes_updated = 0
        edges_created = 0

        # Process node matches
        for i, node_match in enumerate(match_result.node_matches):
            seed_node = seed_data.nodes[i]

            if node_match.decision == MatchDecision.CREATE:
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
                except Exception as e:
                    logger.warning(f"Failed to create node {seed_node.temp_id}: {e}")

            elif node_match.decision == MatchDecision.UPDATE:
                if node_match.matched_node_id:
                    try:
                        await graph_store.update_node(
                            workflow_id,
                            node_match.matched_node_id,
                            NodeUpdate(
                                title=seed_node.title,
                                status=seed_node.status,
                                properties=seed_node.properties,
                            ),
                        )
                        temp_id_to_real_id[seed_node.temp_id] = node_match.matched_node_id
                        nodes_updated += 1
                    except Exception as e:
                        logger.warning(
                            f"Failed to update node {node_match.matched_node_id}: {e}"
                        )

            elif node_match.decision == MatchDecision.SKIP:
                # Map temp_id to existing node for edge resolution
                if node_match.matched_node_id:
                    temp_id_to_real_id[seed_node.temp_id] = node_match.matched_node_id

        # Process edge matches
        for i, edge_match in enumerate(match_result.edge_matches):
            if edge_match.decision == MatchDecision.CREATE:
                seed_edge = seed_data.edges[i]
                from_id = temp_id_to_real_id.get(seed_edge.from_temp_id)
                to_id = temp_id_to_real_id.get(seed_edge.to_temp_id)

                if not from_id or not to_id:
                    logger.warning(
                        f"Edge references unknown temp_id: "
                        f"{seed_edge.from_temp_id} -> {seed_edge.to_temp_id}"
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
                except Exception as e:
                    logger.warning(f"Failed to create edge: {e}")
            # SKIP edges are ignored (already exist)

        return nodes_created, nodes_updated, edges_created

    async def apply_preview(
        self,
        endpoint: Endpoint,
        workflow_id: str,
        transform_result: dict[str, Any],
        match_result: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Apply a previously previewed transformation result.

        Args:
            endpoint: The endpoint configuration.
            workflow_id: The workflow ID.
            transform_result: The transform_result from a preview execution.
            match_result: Optional matching results for POST endpoints.

        Returns:
            Dict with applied changes counts.
        """
        # Reconstruct the proper model from the transform_result dict
        if endpoint.http_method == "GET":
            result = QueryResult(**transform_result)
        elif endpoint.http_method == "POST":
            result = SeedData(**transform_result)
        elif endpoint.http_method == "PUT":
            result = UpdateResult(**transform_result)
        elif endpoint.http_method == "DELETE":
            result = DeleteResult(**transform_result)
        else:
            return {"error": f"Unknown HTTP method: {endpoint.http_method}"}

        # For POST endpoints with matching, use the matching-aware insert
        if endpoint.http_method == "POST" and match_result and isinstance(result, SeedData):
            match_result_model = MatchResult(**match_result)
            nodes_created, nodes_updated, edges_created = (
                await self._insert_seed_data_with_matching(
                    workflow_id, result, match_result_model
                )
            )
            await graph_store.record_endpoint_execution(workflow_id, endpoint.id)
            return {
                "nodes_created": nodes_created,
                "nodes_updated": nodes_updated,
                "edges_created": edges_created,
            }

        # Apply using the existing method for other cases
        applied = await self._apply_result(endpoint, workflow_id, result)

        # Record execution
        await graph_store.record_endpoint_execution(workflow_id, endpoint.id)

        return applied
