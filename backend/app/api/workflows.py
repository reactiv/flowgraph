"""Workflow API routes."""

import asyncio
import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.db import graph_store
from app.llm import (
    DataGenerator,
    FieldValueSuggestionGenerator,
    FileSchemaGenerator,
    FileSeeder,
    NodeSuggestionGenerator,
    SchemaGenerationOptions,
    SchemaGenerator,
    SchemaValidationResult,
    SeedConfig,
    ViewGenerator,
)
from app.models import (
    Edge,
    EdgeCreate,
    Event,
    FieldValueSuggestionRequest,
    FieldValueSuggestionResponse,
    FilterableField,
    FilterSchema,
    Node,
    NodeCreate,
    NodeUpdate,
    RelationPath,
    SuggestionRequest,
    SuggestionResponse,
    ViewFilterParams,
    WorkflowDefinition,
)
from app.models.workflow import (
    FieldKind,
    ViewTemplate,
    ViewTemplateCreate,
    ViewTemplateUpdate,
    WorkflowSummary,
)
from app.storage.upload_store import get_upload_store

router = APIRouter()

TEMPLATES_DIR = Path(__file__).parent.parent.parent / "templates"


class CreateFromTemplateRequest(BaseModel):
    """Request to create a workflow from a template."""

    template_id: str


class CreateFromLanguageRequest(BaseModel):
    """Request to create a workflow schema from natural language."""

    description: str
    options: SchemaGenerationOptions | None = None


class CreateFromLanguageResponse(BaseModel):
    """Response with generated schema and validation results."""

    definition: WorkflowDefinition
    validation: SchemaValidationResult
    view_templates: list[ViewTemplateCreate] = []


class NodesResponse(BaseModel):
    """Response for node list queries."""

    nodes: list[Node]
    total: int
    limit: int
    offset: int


class EdgesResponse(BaseModel):
    """Response for edge list queries."""

    edges: list[Edge]
    total: int
    limit: int
    offset: int


# ==================== Workflows ====================


@router.get("/workflows")
async def list_workflows() -> list[WorkflowSummary]:
    """List all workflows."""
    return await graph_store.list_workflows()


@router.post("/workflows/from-template")
async def create_from_template(request: CreateFromTemplateRequest) -> WorkflowSummary:
    """Create a new workflow from a template."""
    template_file = TEMPLATES_DIR / f"{request.template_id}.workflow.json"

    if not template_file.exists():
        raise HTTPException(
            status_code=404, detail=f"Template '{request.template_id}' not found"
        )

    with open(template_file) as f:
        data = json.load(f)

    definition = WorkflowDefinition.model_validate(data)
    return await graph_store.create_workflow(definition)


@router.post("/workflows/from-language")
async def create_from_language(
    request: CreateFromLanguageRequest,
) -> CreateFromLanguageResponse:
    """Generate a workflow schema from natural language description.

    This uses Claude to interpret the description and generate a WorkflowDefinition.
    The generated schema is returned for preview but NOT saved.
    Call POST /workflows/from-definition to save the schema.
    """
    try:
        generator = SchemaGenerator()
    except ValueError as e:
        raise HTTPException(
            status_code=500,
            detail=f"LLM client not configured: {e}. Set ANTHROPIC_API_KEY.",
        )

    options = request.options or SchemaGenerationOptions()

    try:
        definition, validation = await generator.generate_schema(
            request.description, options
        )

        # Generate view templates based on the schema and original description
        view_generator = ViewGenerator()
        view_templates = await view_generator.generate_views_from_description(
            request.description, definition
        )

        return CreateFromLanguageResponse(
            definition=definition,
            validation=validation,
            view_templates=view_templates,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/workflows/from-files/stream")
async def create_from_files_stream(
    upload_id: str = Query(..., description="Upload session ID"),
    description: str = Query(..., description="Workflow description"),
    include_states: bool = Query(True, description="Include state machines"),
    include_tags: bool = Query(True, description="Include tagging system"),
    scientific_terminology: bool = Query(False, description="Use scientific terminology"),
) -> StreamingResponse:
    """Generate a workflow schema from uploaded files with SSE progress updates.

    This endpoint uses the agentic data transformer to analyze uploaded files
    and generate a WorkflowDefinition schema. Progress events are streamed
    in real-time using Server-Sent Events.

    Events are sent in the format:
        data: {"event": "tool_call", "tool": "Read", "input": {...}}
        data: {"event": "tool_result", "tool": "Read", "result": "..."}
        data: {"event": "validation", "valid": true, "errors": []}
        data: {"event": "complete", "definition": {...}, "validation": {...}}

    The final event will have event="complete" and include the generated schema.
    """
    # Verify upload exists
    store = get_upload_store()
    try:
        await store.get_manifest(upload_id)
    except FileNotFoundError:
        raise HTTPException(
            status_code=404,
            detail=f"Upload session {upload_id} not found or expired",
        )

    options = SchemaGenerationOptions(
        include_states=include_states,
        include_tags=include_tags,
        scientific_terminology=scientific_terminology,
    )

    generator = FileSchemaGenerator(upload_store=store)

    async def event_generator():
        """Generate SSE events during schema generation."""
        async for event in generator.generate_schema_with_events(
            upload_id=upload_id,
            description=description,
            options=options,
        ):
            # Skip keepalive events in SSE format
            if event.get("event") == "keepalive":
                yield ": keepalive\n\n"
            else:
                yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/workflows/from-definition")
async def create_from_definition(definition: WorkflowDefinition) -> WorkflowSummary:
    """Create a workflow from a validated WorkflowDefinition.

    Use this after previewing a schema generated from language.
    """
    return await graph_store.create_workflow(definition)


@router.get("/workflows/{workflow_id}")
async def get_workflow(workflow_id: str) -> WorkflowDefinition:
    """Get a workflow definition."""
    workflow = await graph_store.get_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return workflow


@router.delete("/workflows/{workflow_id}")
async def delete_workflow(workflow_id: str) -> dict[str, bool]:
    """Delete a workflow."""
    deleted = await graph_store.delete_workflow(workflow_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return {"deleted": True}


# ==================== Nodes ====================


@router.get("/workflows/{workflow_id}/nodes")
async def list_nodes(
    workflow_id: str,
    type: str | None = Query(None, description="Filter by node type"),
    status: str | None = Query(None, description="Filter by status"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
) -> NodesResponse:
    """List nodes in a workflow with optional filters."""
    # Verify workflow exists
    workflow = await graph_store.get_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    nodes, total = await graph_store.query_nodes(
        workflow_id, node_type=type, status=status, limit=limit, offset=offset
    )
    return NodesResponse(nodes=nodes, total=total, limit=limit, offset=offset)


@router.post("/workflows/{workflow_id}/nodes")
async def create_node(workflow_id: str, node: NodeCreate) -> Node:
    """Create a new node in a workflow."""
    # Verify workflow exists
    workflow = await graph_store.get_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    return await graph_store.create_node(workflow_id, node)


@router.get("/workflows/{workflow_id}/nodes/{node_id}")
async def get_node(workflow_id: str, node_id: str) -> Node:
    """Get a specific node."""
    node = await graph_store.get_node(workflow_id, node_id)
    if node is None:
        raise HTTPException(status_code=404, detail="Node not found")
    return node


@router.patch("/workflows/{workflow_id}/nodes/{node_id}")
async def update_node(workflow_id: str, node_id: str, update: NodeUpdate) -> Node:
    """Update a node."""
    node = await graph_store.update_node(workflow_id, node_id, update)
    if node is None:
        raise HTTPException(status_code=404, detail="Node not found")
    return node


@router.delete("/workflows/{workflow_id}/nodes/{node_id}")
async def delete_node(workflow_id: str, node_id: str) -> dict[str, bool]:
    """Delete a node."""
    deleted = await graph_store.delete_node(workflow_id, node_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Node not found")
    return {"deleted": True}


@router.get("/workflows/{workflow_id}/nodes/{node_id}/neighbors")
async def get_neighbors(
    workflow_id: str,
    node_id: str,
    depth: int = Query(1, ge=1, le=3),
    edge_types: str | None = Query(None, description="Comma-separated edge types"),
) -> dict[str, Any]:
    """Get neighboring nodes and edges."""
    # Verify node exists
    node = await graph_store.get_node(workflow_id, node_id)
    if node is None:
        raise HTTPException(status_code=404, detail="Node not found")

    edge_type_list = edge_types.split(",") if edge_types else None
    return await graph_store.get_neighbors(
        workflow_id, node_id, depth=depth, edge_types=edge_type_list
    )


@router.post("/workflows/{workflow_id}/nodes/{node_id}/suggest")
async def suggest_node(
    workflow_id: str,
    node_id: str,
    request: SuggestionRequest,
) -> SuggestionResponse:
    """Suggest a new node to link to the specified node.

    Uses LLM to generate a contextually appropriate node based on:
    - The source node's properties and status
    - Connected nodes for context
    - Similar nodes of the target type as examples
    - The workflow schema

    The direction parameter specifies the edge direction relative to the source node:
    - "outgoing": source → suggested (e.g., Sample → Analysis)
    - "incoming": suggested → source (e.g., ExperimentPlan → Hypothesis)

    The generated node is returned for preview but NOT created.
    Call POST /nodes to create the node, then POST /edges to create the edge.
    """
    # Verify node exists
    node = await graph_store.get_node(workflow_id, node_id)
    if node is None:
        raise HTTPException(status_code=404, detail="Node not found")

    # Verify edge type exists in workflow
    workflow = await graph_store.get_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    valid_edge_types = {et.type for et in workflow.edge_types}
    if request.edge_type not in valid_edge_types:
        raise HTTPException(
            status_code=400,
            detail=f"Edge type '{request.edge_type}' not found in workflow schema",
        )

    try:
        generator = NodeSuggestionGenerator(graph_store=graph_store)
    except ValueError as e:
        raise HTTPException(
            status_code=500,
            detail=f"LLM client not configured: {e}. Set ANTHROPIC_API_KEY.",
        )

    try:
        return await generator.suggest_node(
            workflow_id=workflow_id,
            source_node_id=node_id,
            edge_type=request.edge_type,
            direction=request.direction,
            options=request.options,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/workflows/{workflow_id}/nodes/{node_id}/fields/{field_key}/suggest")
async def suggest_field_value(
    workflow_id: str,
    node_id: str,
    field_key: str,
    request: FieldValueSuggestionRequest,
) -> FieldValueSuggestionResponse:
    """Suggest a value for a specific field on a node.

    Uses LLM to generate a contextually appropriate field value based on:
    - The node's existing properties and status
    - Connected nodes for relationship context
    - Similar nodes' values for this field as examples
    - The field definition from the workflow schema

    The generated value is returned for preview but NOT applied.
    Call PATCH /nodes/{node_id} to update the node with the suggested value.
    """
    # Verify node exists
    node = await graph_store.get_node(workflow_id, node_id)
    if node is None:
        raise HTTPException(status_code=404, detail="Node not found")

    # Verify workflow exists
    workflow = await graph_store.get_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Verify field exists in node type schema
    node_type = next(
        (nt for nt in workflow.node_types if nt.type == node.type), None
    )
    if node_type is None:
        raise HTTPException(
            status_code=400,
            detail=f"Node type '{node.type}' not found in workflow schema",
        )

    field_def = next((f for f in node_type.fields if f.key == field_key), None)
    if field_def is None:
        raise HTTPException(
            status_code=400,
            detail=f"Field '{field_key}' not found in node type '{node.type}'",
        )

    # Cannot suggest file[] fields
    if field_def.kind.value == "file[]":
        raise HTTPException(
            status_code=400,
            detail="Cannot generate suggestions for file[] fields",
        )

    try:
        generator = FieldValueSuggestionGenerator(graph_store=graph_store)
    except ValueError as e:
        raise HTTPException(
            status_code=500,
            detail=f"LLM client not configured: {e}. Set ANTHROPIC_API_KEY.",
        )

    try:
        return await generator.suggest_field_value(
            workflow_id=workflow_id,
            node_id=node_id,
            field_key=field_key,
            options=request.options,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ==================== Edges ====================


@router.get("/workflows/{workflow_id}/edges")
async def list_edges(
    workflow_id: str,
    type: str | None = Query(None, description="Filter by edge type"),
    limit: int = Query(1000, ge=1, le=5000),
    offset: int = Query(0, ge=0),
) -> EdgesResponse:
    """List edges in a workflow with optional filters."""
    # Verify workflow exists
    workflow = await graph_store.get_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    edges, total = await graph_store.query_edges(
        workflow_id, edge_type=type, limit=limit, offset=offset
    )
    return EdgesResponse(edges=edges, total=total, limit=limit, offset=offset)


@router.post("/workflows/{workflow_id}/edges")
async def create_edge(workflow_id: str, edge: EdgeCreate) -> Edge:
    """Create a new edge between nodes."""
    # Verify workflow exists
    workflow = await graph_store.get_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Verify both nodes exist
    from_node = await graph_store.get_node(workflow_id, edge.from_node_id)
    if from_node is None:
        raise HTTPException(status_code=404, detail="From node not found")

    to_node = await graph_store.get_node(workflow_id, edge.to_node_id)
    if to_node is None:
        raise HTTPException(status_code=404, detail="To node not found")

    return await graph_store.create_edge(workflow_id, edge)


@router.delete("/workflows/{workflow_id}/edges/{edge_id}")
async def delete_edge(workflow_id: str, edge_id: str) -> dict[str, bool]:
    """Delete an edge."""
    deleted = await graph_store.delete_edge(workflow_id, edge_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Edge not found")
    return {"deleted": True}


# ==================== Views ====================


@router.get("/workflows/{workflow_id}/views")
async def list_views(workflow_id: str) -> list[ViewTemplate]:
    """List all view templates for a workflow."""
    # Verify workflow exists
    workflow = await graph_store.get_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    return await graph_store.list_view_templates(workflow_id)


@router.post("/workflows/{workflow_id}/views")
async def create_view(workflow_id: str, view: ViewTemplateCreate) -> ViewTemplate:
    """Create a new view template."""
    # Verify workflow exists
    workflow = await graph_store.get_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Validate rootType exists in workflow
    valid_node_types = {nt.type for nt in workflow.node_types}
    if view.root_type not in valid_node_types:
        raise HTTPException(
            status_code=400,
            detail=f"rootType '{view.root_type}' not found in workflow node types",
        )

    result = await graph_store.add_view_template(workflow_id, view)
    if result is None:
        raise HTTPException(status_code=500, detail="Failed to create view")
    return result


@router.get("/workflows/{workflow_id}/views/{view_id}")
async def get_view_subgraph(
    workflow_id: str,
    view_id: str,
    root_node_id: str | None = Query(None, description="Optional root node ID"),
    filters: str | None = Query(None, description="JSON-encoded filter parameters"),
) -> dict[str, Any]:
    """Get a subgraph traversed according to a view template configuration.

    Optionally accepts a `filters` query parameter as a JSON-encoded FilterGroup.
    """
    # Get workflow definition
    workflow = await graph_store.get_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Find the view template
    template = None
    for vt in workflow.view_templates:
        if vt.id == view_id:
            template = vt
            break

    if template is None:
        raise HTTPException(
            status_code=404, detail=f"View template '{view_id}' not found"
        )

    # Parse filter parameters if provided
    filter_params = None
    if filters:
        try:
            filter_dict = json.loads(filters)
            filter_params = ViewFilterParams.model_validate(filter_dict)
        except json.JSONDecodeError as e:
            raise HTTPException(
                status_code=400, detail=f"Invalid JSON in filters parameter: {e}"
            )
        except ValueError as e:
            raise HTTPException(
                status_code=400, detail=f"Invalid filter parameters: {e}"
            )

    # Traverse the graph according to the template
    return await graph_store.traverse_view_template(
        workflow_id, template, root_node_id, filter_params
    )


@router.get("/workflows/{workflow_id}/views/{view_id}/filter-schema")
async def get_view_filter_schema(
    workflow_id: str,
    view_id: str,
) -> FilterSchema:
    """Get the schema of available filter options for a view template.

    Returns property fields (direct node fields) and relational fields
    (fields on connected nodes via edges).
    """
    # Get workflow definition
    workflow = await graph_store.get_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Find the view template
    template = None
    for vt in workflow.view_templates:
        if vt.id == view_id:
            template = vt
            break

    if template is None:
        raise HTTPException(
            status_code=404, detail=f"View template '{view_id}' not found"
        )

    # Build filter schema from workflow definition and template
    return _build_filter_schema(workflow, template)


def _build_filter_schema(
    workflow: WorkflowDefinition,
    template: ViewTemplate,
) -> FilterSchema:
    """Build filter schema showing available fields and relationships."""
    # Find the root node type definition
    root_node_type = next(
        (nt for nt in workflow.node_types if nt.type == template.root_type),
        None,
    )

    property_fields: list[FilterableField] = []
    relational_fields: list[FilterableField] = []

    if root_node_type:
        # Add built-in fields
        property_fields.append(
            FilterableField(
                key="title",
                label="Title",
                kind=FieldKind.STRING,
                node_type=root_node_type.type,
                is_relational=False,
            )
        )
        property_fields.append(
            FilterableField(
                key="status",
                label="Status",
                kind=FieldKind.ENUM,
                node_type=root_node_type.type,
                values=root_node_type.states.values if root_node_type.states else None,
                is_relational=False,
            )
        )

        # Add direct property fields from schema
        for field in root_node_type.fields:
            # Skip status since we already added it
            if field.key == "status":
                continue
            property_fields.append(
                FilterableField(
                    key=field.key,
                    label=field.label,
                    kind=field.kind,
                    node_type=root_node_type.type,
                    values=field.values,
                    is_relational=False,
                )
            )

    # Add relational fields based on edge types
    for edge_type in workflow.edge_types:
        # Check outgoing edges from root type
        if edge_type.from_type == template.root_type:
            target_node_type = next(
                (nt for nt in workflow.node_types if nt.type == edge_type.to_type),
                None,
            )
            if target_node_type:
                # Key format: EDGE_TYPE:out:field_name (direction included for uniqueness)
                key_prefix = f"{edge_type.type}:out"

                # Add built-in fields for the target node type
                relational_fields.append(
                    FilterableField(
                        key=f"{key_prefix}:title",
                        label=f"{target_node_type.display_name} > Title",
                        kind=FieldKind.STRING,
                        node_type=target_node_type.type,
                        is_relational=True,
                        relation_path=RelationPath(
                            edge_type=edge_type.type,
                            direction="outgoing",
                            target_type=edge_type.to_type,
                        ),
                    )
                )
                relational_fields.append(
                    FilterableField(
                        key=f"{key_prefix}:status",
                        label=f"{target_node_type.display_name} > Status",
                        kind=FieldKind.ENUM,
                        node_type=target_node_type.type,
                        values=target_node_type.states.values if target_node_type.states else None,
                        is_relational=True,
                        relation_path=RelationPath(
                            edge_type=edge_type.type,
                            direction="outgoing",
                            target_type=edge_type.to_type,
                        ),
                    )
                )

                # Add property fields from the target node type
                for field in target_node_type.fields:
                    if field.key == "status":
                        continue
                    relational_fields.append(
                        FilterableField(
                            key=f"{key_prefix}:{field.key}",
                            label=f"{target_node_type.display_name} > {field.label}",
                            kind=field.kind,
                            node_type=target_node_type.type,
                            values=field.values,
                            is_relational=True,
                            relation_path=RelationPath(
                                edge_type=edge_type.type,
                                direction="outgoing",
                                target_type=edge_type.to_type,
                            ),
                        )
                    )

        # Check incoming edges to root type
        if edge_type.to_type == template.root_type:
            source_node_type = next(
                (nt for nt in workflow.node_types if nt.type == edge_type.from_type),
                None,
            )
            if source_node_type:
                # Key format: EDGE_TYPE:in:field_name (direction included for uniqueness)
                key_prefix = f"{edge_type.type}:in"

                # Add built-in fields
                relational_fields.append(
                    FilterableField(
                        key=f"{key_prefix}:title",
                        label=f"{source_node_type.display_name} > Title",
                        kind=FieldKind.STRING,
                        node_type=source_node_type.type,
                        is_relational=True,
                        relation_path=RelationPath(
                            edge_type=edge_type.type,
                            direction="incoming",
                            target_type=edge_type.from_type,
                        ),
                    )
                )
                relational_fields.append(
                    FilterableField(
                        key=f"{key_prefix}:status",
                        label=f"{source_node_type.display_name} > Status",
                        kind=FieldKind.ENUM,
                        node_type=source_node_type.type,
                        values=source_node_type.states.values if source_node_type.states else None,
                        is_relational=True,
                        relation_path=RelationPath(
                            edge_type=edge_type.type,
                            direction="incoming",
                            target_type=edge_type.from_type,
                        ),
                    )
                )

                for field in source_node_type.fields:
                    if field.key == "status":
                        continue
                    relational_fields.append(
                        FilterableField(
                            key=f"{key_prefix}:{field.key}",
                            label=f"{source_node_type.display_name} > {field.label}",
                            kind=field.kind,
                            node_type=source_node_type.type,
                            values=field.values,
                            is_relational=True,
                            relation_path=RelationPath(
                                edge_type=edge_type.type,
                                direction="incoming",
                                target_type=edge_type.from_type,
                            ),
                        )
                    )

    return FilterSchema(
        property_fields=property_fields,
        relational_fields=relational_fields,
    )


class FilterValuesResponse(BaseModel):
    """Response with distinct values for a filter field."""

    values: list[str]


@router.get("/workflows/{workflow_id}/views/{view_id}/filter-values")
async def get_filter_values(
    workflow_id: str,
    view_id: str,
    node_type: str = Query(..., description="The node type to get values from"),
    field: str = Query(..., description="The field to get distinct values for"),
    limit: int = Query(50, ge=1, le=200, description="Maximum number of values"),
) -> FilterValuesResponse:
    """Get distinct values for a filter field.

    Used for autocomplete suggestions in the filter UI.
    Returns unique non-null values for the specified field.
    """
    # Verify workflow exists
    workflow = await graph_store.get_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Get distinct values from nodes
    values = await graph_store.get_distinct_field_values(
        workflow_id, node_type, field, limit
    )
    return FilterValuesResponse(values=values)


@router.put("/workflows/{workflow_id}/views/{view_id}")
async def update_view(
    workflow_id: str, view_id: str, update: ViewTemplateUpdate
) -> ViewTemplate:
    """Update a view template."""
    result = await graph_store.update_view_template(workflow_id, view_id, update)
    if result is None:
        raise HTTPException(status_code=404, detail="View template not found")
    return result


@router.delete("/workflows/{workflow_id}/views/{view_id}")
async def delete_view(workflow_id: str, view_id: str) -> dict[str, bool]:
    """Delete a view template."""
    deleted = await graph_store.delete_view_template(workflow_id, view_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="View template not found")
    return {"deleted": True}


class GenerateViewRequest(BaseModel):
    """Request to generate a view from natural language."""

    description: str


@router.post("/workflows/{workflow_id}/views/generate")
async def generate_view(
    workflow_id: str, request: GenerateViewRequest
) -> ViewTemplateCreate:
    """Generate a view template from natural language description.

    This uses Claude to interpret the description and generate a view template.
    The generated template is returned but NOT saved - call POST /views to save it.
    """
    # Get workflow definition for schema context
    workflow = await graph_store.get_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    try:
        generator = ViewGenerator()
    except ValueError as e:
        raise HTTPException(
            status_code=500,
            detail=f"LLM client not configured: {e}. Set ANTHROPIC_API_KEY.",
        )

    try:
        result = await generator.generate_view(request.description, workflow)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ==================== Events ====================


@router.get("/workflows/{workflow_id}/events")
async def list_events(
    workflow_id: str,
    node_id: str | None = Query(None, description="Filter by subject node"),
    event_type: str | None = Query(None, description="Filter by event type"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
) -> list[Event]:
    """List events for a workflow."""
    # Verify workflow exists
    workflow = await graph_store.get_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    return await graph_store.get_events(
        workflow_id,
        subject_node_id=node_id,
        event_type=event_type,
        limit=limit,
        offset=offset,
    )


# ==================== Seeding ====================


@router.post("/workflows/{workflow_id}/reset")
async def reset_workflow(workflow_id: str) -> dict[str, bool]:
    """Reset a workflow by deleting all nodes, edges, and events."""
    # Verify workflow exists
    workflow = await graph_store.get_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    await graph_store.reset_workflow(workflow_id)
    return {"reset": True}


class SeedRequest(BaseModel):
    """Request to seed a workflow with demo data."""

    scale: str = "small"  # small, medium, large


@router.post("/workflows/{workflow_id}/seed")
async def seed_workflow(workflow_id: str, request: SeedRequest) -> dict[str, Any]:
    """Seed a workflow with demo data using LLM-powered generation."""
    # Verify workflow exists
    workflow = await graph_store.get_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Create the data generator and seed the workflow
    try:
        generator = DataGenerator(graph_store)
    except ValueError as e:
        raise HTTPException(
            status_code=500,
            detail=f"LLM client not configured: {e}. Set ANTHROPIC_API_KEY environment variable.",
        )

    config = SeedConfig(scale=request.scale)
    result = await generator.seed_workflow(workflow_id, workflow, config)
    return result


@router.get("/workflows/{workflow_id}/seed/stream")
async def seed_workflow_stream(
    workflow_id: str,
    scale: str = Query("small", description="Scale: small, medium, or large"),
) -> StreamingResponse:
    """Seed a workflow with SSE progress updates.

    This endpoint streams progress events as Server-Sent Events (SSE),
    providing real-time feedback during the long-running seeding process.

    Events are sent in the format:
        data: {"phase": "scenarios", "current": 1, "total": 3, "message": "..."}

    The final event will have phase="complete" and include the full result.
    """
    # Verify workflow exists
    workflow = await graph_store.get_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Validate scale
    if scale not in ("small", "medium", "large"):
        raise HTTPException(status_code=400, detail="Invalid scale. Use small, medium, or large.")

    # Create the data generator
    try:
        generator = DataGenerator(graph_store)
    except ValueError as e:
        raise HTTPException(
            status_code=500,
            detail=f"LLM client not configured: {e}. Set ANTHROPIC_API_KEY environment variable.",
        )

    async def event_generator():
        """Generate SSE events during seeding."""
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()

        async def progress_callback(progress: dict[str, Any]) -> None:
            """Put progress events into the queue."""
            await queue.put(progress)

        # Start seeding in a background task
        config = SeedConfig(scale=scale)
        task = asyncio.create_task(
            generator.seed_workflow(workflow_id, workflow, config, on_progress=progress_callback)
        )

        # Stream progress events
        while not task.done():
            try:
                # Wait for next progress event with timeout
                event = await asyncio.wait_for(queue.get(), timeout=1.0)
                yield f"data: {json.dumps(event)}\n\n"
            except TimeoutError:
                # Send keepalive comment to prevent connection timeout
                yield ": keepalive\n\n"

        # Drain any remaining events in the queue
        while not queue.empty():
            try:
                event = queue.get_nowait()
                yield f"data: {json.dumps(event)}\n\n"
            except asyncio.QueueEmpty:
                break

        # Get the final result
        try:
            result = await task
            final_event = {**result, "phase": "complete"}
            yield f"data: {json.dumps(final_event)}\n\n"
        except Exception as e:
            error_event = {"phase": "error", "message": str(e)}
            yield f"data: {json.dumps(error_event)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )


@router.get("/workflows/{workflow_id}/seed-from-files/stream")
async def seed_from_files_stream(
    workflow_id: str,
    upload_id: str = Query(..., description="Upload session ID"),
    instruction: str | None = Query(None, description="Additional transformation instructions"),
) -> StreamingResponse:
    """Seed a workflow from uploaded files with SSE progress updates.

    This endpoint uses the agentic data transformer to extract data from
    uploaded files and insert it into the workflow as nodes and edges.
    Progress events are streamed in real-time using Server-Sent Events.

    Events are sent in the format:
        data: {"event": "phase", "phase": "transforming", "message": "..."}
        data: {"event": "tool_call", "tool": "Read", "input": {...}}
        data: {"event": "progress", "current": 10, "total": 100, "message": "..."}
        data: {"event": "complete", "nodes_created": 50, "edges_created": 120}

    The final event will have event="complete" and include the creation counts.
    """
    # Verify workflow exists
    workflow = await graph_store.get_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Verify upload exists
    store = get_upload_store()
    try:
        await store.get_manifest(upload_id)
    except FileNotFoundError:
        raise HTTPException(
            status_code=404,
            detail=f"Upload session {upload_id} not found or expired",
        )

    seeder = FileSeeder(upload_store=store)

    async def event_generator():
        """Generate SSE events during file-based seeding."""
        async for event in seeder.seed_from_files_with_events(
            workflow_id=workflow_id,
            definition=workflow,
            upload_id=upload_id,
            instruction=instruction,
        ):
            # Skip keepalive events in SSE format
            if event.get("event") == "keepalive":
                yield ": keepalive\n\n"
            else:
                yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
