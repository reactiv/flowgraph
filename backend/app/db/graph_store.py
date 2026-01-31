"""GraphStore - Storage abstraction layer for workflow graphs."""

import json
import uuid
from datetime import datetime
from typing import Any

import aiosqlite

from app.db.database import get_db
from app.models import (
    Edge,
    EdgeCreate,
    Endpoint,
    EndpointCreate,
    EndpointUpdate,
    Event,
    EventCreate,
    Node,
    NodeCreate,
    NodeUpdate,
    TaskAssignment,
    TaskInstance,
    TaskSetDefinition,
    TaskSetDefinitionCreate,
    TaskSetInstance,
    TaskSetInstanceCreate,
    TaskSetInstanceStatus,
    TaskStatus,
    WorkflowDefinition,
)
from app.models.workflow import (
    Rule,
    ViewFilterParams,
    ViewTemplate,
    ViewTemplateCreate,
    ViewTemplateUpdate,
    WorkflowSummary,
)


def _generate_id() -> str:
    """Generate a unique ID."""
    return str(uuid.uuid4())


def _now() -> str:
    """Get current timestamp in ISO format."""
    return datetime.utcnow().isoformat()


class GraphStore:
    """Storage abstraction for workflow graph operations."""

    # ==================== Workflows ====================

    async def create_workflow(self, definition: WorkflowDefinition) -> WorkflowSummary:
        """Create a new workflow from a definition."""
        db = await get_db()
        now = _now()

        # Generate a unique ID to avoid collisions with LLM-generated IDs
        unique_id = f"{definition.workflow_id}-{_generate_id()[:8]}"

        # Update the definition with the unique ID for storage
        definition_dict = definition.model_dump(by_alias=True)
        definition_dict["workflowId"] = unique_id

        await db.execute(
            """
            INSERT INTO workflow_definitions (id, name, version, definition_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                unique_id,
                definition.name,
                1,
                json.dumps(definition_dict),
                now,
                now,
            ),
        )
        await db.commit()

        return WorkflowSummary(
            id=unique_id,
            name=definition.name,
            description=definition.description,
            version=1,
            node_type_count=len(definition.node_types),
            edge_type_count=len(definition.edge_types),
            created_at=now,
            updated_at=now,
        )

    async def list_workflows(self) -> list[WorkflowSummary]:
        """List all workflows."""
        db = await get_db()
        cursor = await db.execute(
            "SELECT id, name, version, definition_json, created_at, updated_at FROM workflow_definitions ORDER BY updated_at DESC"
        )
        rows = await cursor.fetchall()

        workflows = []
        for row in rows:
            definition = json.loads(row["definition_json"])
            workflows.append(
                WorkflowSummary(
                    id=row["id"],
                    name=row["name"],
                    description=definition.get("description", ""),
                    version=row["version"],
                    node_type_count=len(definition.get("nodeTypes", [])),
                    edge_type_count=len(definition.get("edgeTypes", [])),
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                )
            )
        return workflows

    async def get_workflow(self, workflow_id: str) -> WorkflowDefinition | None:
        """Get a workflow definition by ID."""
        db = await get_db()
        cursor = await db.execute(
            "SELECT definition_json FROM workflow_definitions WHERE id = ?",
            (workflow_id,),
        )
        row = await cursor.fetchone()

        if row is None:
            return None

        return WorkflowDefinition.model_validate_json(row["definition_json"])

    async def delete_workflow(self, workflow_id: str) -> bool:
        """Delete a workflow and all its data."""
        db = await get_db()
        cursor = await db.execute(
            "DELETE FROM workflow_definitions WHERE id = ?",
            (workflow_id,),
        )
        await db.commit()
        return cursor.rowcount > 0

    # ==================== Nodes ====================

    async def create_node(self, workflow_id: str, node: NodeCreate) -> Node:
        """Create a new node in a workflow."""
        db = await get_db()
        node_id = _generate_id()
        now = _now()

        await db.execute(
            """
            INSERT INTO nodes (id, workflow_id, type, title, status, properties_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                node_id,
                workflow_id,
                node.type,
                node.title,
                node.status,
                json.dumps(node.properties),
                now,
                now,
            ),
        )
        await db.commit()

        # Create a node_created event
        await self.append_event(
            workflow_id,
            EventCreate(
                subject_node_id=node_id,
                event_type="node_created",
                payload={"type": node.type, "title": node.title},
            ),
        )

        return Node(
            id=node_id,
            workflow_id=workflow_id,
            type=node.type,
            title=node.title,
            status=node.status,
            properties=node.properties,
            created_at=now,
            updated_at=now,
        )

    async def get_node(self, workflow_id: str, node_id: str) -> Node | None:
        """Get a node by ID."""
        db = await get_db()
        cursor = await db.execute(
            """
            SELECT id, workflow_id, type, title, status, properties_json, created_at, updated_at
            FROM nodes WHERE id = ? AND workflow_id = ?
            """,
            (node_id, workflow_id),
        )
        row = await cursor.fetchone()

        if row is None:
            return None

        return Node(
            id=row["id"],
            workflow_id=row["workflow_id"],
            type=row["type"],
            title=row["title"],
            status=row["status"],
            properties=json.loads(row["properties_json"]),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    async def update_node(
        self, workflow_id: str, node_id: str, update: NodeUpdate
    ) -> Node | None:
        """Update a node."""
        db = await get_db()

        # Get current node
        current = await self.get_node(workflow_id, node_id)
        if current is None:
            return None

        # Build update fields
        now = _now()
        new_title = update.title if update.title is not None else current.title
        new_status = update.status if update.status is not None else current.status
        new_properties = (
            update.properties if update.properties is not None else current.properties
        )

        await db.execute(
            """
            UPDATE nodes SET title = ?, status = ?, properties_json = ?, updated_at = ?
            WHERE id = ? AND workflow_id = ?
            """,
            (
                new_title,
                new_status,
                json.dumps(new_properties),
                now,
                node_id,
                workflow_id,
            ),
        )
        await db.commit()

        # Create status change event if status changed
        if update.status is not None and update.status != current.status:
            await self.append_event(
                workflow_id,
                EventCreate(
                    subject_node_id=node_id,
                    event_type="status_changed",
                    payload={"from": current.status, "to": update.status},
                ),
            )

        return Node(
            id=node_id,
            workflow_id=workflow_id,
            type=current.type,
            title=new_title,
            status=new_status,
            properties=new_properties,
            created_at=current.created_at,
            updated_at=now,
        )

    async def delete_node(self, workflow_id: str, node_id: str) -> bool:
        """Delete a node."""
        db = await get_db()
        cursor = await db.execute(
            "DELETE FROM nodes WHERE id = ? AND workflow_id = ?",
            (node_id, workflow_id),
        )
        await db.commit()
        return cursor.rowcount > 0

    async def query_nodes(
        self,
        workflow_id: str,
        node_type: str | None = None,
        status: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[Node], int]:
        """Query nodes with filters. Returns (nodes, total_count)."""
        db = await get_db()

        # Build query
        where_clauses = ["workflow_id = ?"]
        params: list[Any] = [workflow_id]

        if node_type:
            where_clauses.append("type = ?")
            params.append(node_type)

        if status:
            where_clauses.append("status = ?")
            params.append(status)

        where_sql = " AND ".join(where_clauses)

        # Get total count
        cursor = await db.execute(
            f"SELECT COUNT(*) as count FROM nodes WHERE {where_sql}",
            params,
        )
        row = await cursor.fetchone()
        total = row["count"] if row else 0

        # Get nodes
        cursor = await db.execute(
            f"""
            SELECT id, workflow_id, type, title, status, properties_json, created_at, updated_at
            FROM nodes WHERE {where_sql}
            ORDER BY updated_at DESC
            LIMIT ? OFFSET ?
            """,
            params + [limit, offset],
        )
        rows = await cursor.fetchall()

        nodes = [
            Node(
                id=row["id"],
                workflow_id=row["workflow_id"],
                type=row["type"],
                title=row["title"],
                status=row["status"],
                properties=json.loads(row["properties_json"]),
                created_at=row["created_at"],
                updated_at=row["updated_at"],
            )
            for row in rows
        ]

        return nodes, total

    async def get_distinct_field_values(
        self,
        workflow_id: str,
        node_type: str,
        field: str,
        limit: int = 50,
    ) -> list[str]:
        """Get distinct values for a field from nodes.

        Used for autocomplete suggestions in filters.
        Returns unique non-null values for the specified field.
        """
        db = await get_db()

        # Handle built-in fields vs properties
        if field in ("title", "status"):
            # Direct column query
            cursor = await db.execute(
                f"""
                SELECT DISTINCT {field} as value
                FROM nodes
                WHERE workflow_id = ? AND type = ? AND {field} IS NOT NULL
                ORDER BY {field}
                LIMIT ?
                """,
                (workflow_id, node_type, limit),
            )
        else:
            # Query JSON property - use json_extract for SQLite
            cursor = await db.execute(
                """
                SELECT DISTINCT json_extract(properties_json, ?) as value
                FROM nodes
                WHERE workflow_id = ? AND type = ?
                  AND json_extract(properties_json, ?) IS NOT NULL
                ORDER BY value
                LIMIT ?
                """,
                (f"$.{field}", workflow_id, node_type, f"$.{field}", limit),
            )

        rows = await cursor.fetchall()
        return [str(row["value"]) for row in rows if row["value"] is not None]

    # ==================== Edges ====================

    async def create_edge(self, workflow_id: str, edge: EdgeCreate) -> Edge:
        """Create a new edge between nodes."""
        db = await get_db()
        edge_id = _generate_id()
        now = _now()

        await db.execute(
            """
            INSERT INTO edges (id, workflow_id, type, from_node_id, to_node_id, properties_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                edge_id,
                workflow_id,
                edge.type,
                edge.from_node_id,
                edge.to_node_id,
                json.dumps(edge.properties),
                now,
            ),
        )
        await db.commit()

        # Create edge_created event
        await self.append_event(
            workflow_id,
            EventCreate(
                subject_node_id=edge.from_node_id,
                event_type="edge_created",
                payload={
                    "edge_type": edge.type,
                    "from_node_id": edge.from_node_id,
                    "to_node_id": edge.to_node_id,
                },
            ),
        )

        return Edge(
            id=edge_id,
            workflow_id=workflow_id,
            type=edge.type,
            from_node_id=edge.from_node_id,
            to_node_id=edge.to_node_id,
            properties=edge.properties,
            created_at=now,
        )

    async def delete_edge(self, workflow_id: str, edge_id: str) -> bool:
        """Delete an edge."""
        db = await get_db()
        cursor = await db.execute(
            "DELETE FROM edges WHERE id = ? AND workflow_id = ?",
            (edge_id, workflow_id),
        )
        await db.commit()
        return cursor.rowcount > 0

    async def query_edges(
        self,
        workflow_id: str,
        edge_type: str | None = None,
        limit: int = 1000,
        offset: int = 0,
    ) -> tuple[list[Edge], int]:
        """Query edges with filters. Returns (edges, total_count)."""
        db = await get_db()

        # Build query
        where_clauses = ["workflow_id = ?"]
        params: list[Any] = [workflow_id]

        if edge_type:
            where_clauses.append("type = ?")
            params.append(edge_type)

        where_sql = " AND ".join(where_clauses)

        # Get total count
        cursor = await db.execute(
            f"SELECT COUNT(*) as count FROM edges WHERE {where_sql}",
            params,
        )
        row = await cursor.fetchone()
        total = row["count"] if row else 0

        # Get edges
        cursor = await db.execute(
            f"""
            SELECT id, workflow_id, type, from_node_id, to_node_id, properties_json, created_at
            FROM edges WHERE {where_sql}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
            """,
            params + [limit, offset],
        )
        rows = await cursor.fetchall()

        edges = [
            Edge(
                id=row["id"],
                workflow_id=row["workflow_id"],
                type=row["type"],
                from_node_id=row["from_node_id"],
                to_node_id=row["to_node_id"],
                properties=json.loads(row["properties_json"]),
                created_at=row["created_at"],
            )
            for row in rows
        ]

        return edges, total

    async def get_neighbors(
        self,
        workflow_id: str,
        node_id: str,
        depth: int = 1,
        edge_types: list[str] | None = None,
    ) -> dict[str, Any]:
        """Get neighboring nodes and edges for a node."""
        db = await get_db()

        # Build edge type filter
        edge_filter = ""
        edge_params: list[Any] = []
        if edge_types:
            placeholders = ",".join("?" * len(edge_types))
            edge_filter = f"AND e.type IN ({placeholders})"
            edge_params = edge_types

        # Get outgoing edges
        cursor = await db.execute(
            f"""
            SELECT e.id, e.type, e.from_node_id, e.to_node_id, e.properties_json, e.created_at,
                   n.id as node_id, n.workflow_id, n.type as node_type, n.title, n.status,
                   n.properties_json as node_props, n.created_at as node_created, n.updated_at as node_updated
            FROM edges e
            JOIN nodes n ON e.to_node_id = n.id
            WHERE e.workflow_id = ? AND e.from_node_id = ? {edge_filter}
            """,
            [workflow_id, node_id] + edge_params,
        )
        outgoing_rows = await cursor.fetchall()

        # Get incoming edges
        cursor = await db.execute(
            f"""
            SELECT e.id, e.type, e.from_node_id, e.to_node_id, e.properties_json, e.created_at,
                   n.id as node_id, n.workflow_id, n.type as node_type, n.title, n.status,
                   n.properties_json as node_props, n.created_at as node_created, n.updated_at as node_updated
            FROM edges e
            JOIN nodes n ON e.from_node_id = n.id
            WHERE e.workflow_id = ? AND e.to_node_id = ? {edge_filter}
            """,
            [workflow_id, node_id] + edge_params,
        )
        incoming_rows = await cursor.fetchall()

        def row_to_edge_with_node(row: aiosqlite.Row) -> dict[str, Any]:
            return {
                "edge": {
                    "id": row["id"],
                    "type": row["type"],
                    "from_node_id": row["from_node_id"],
                    "to_node_id": row["to_node_id"],
                    "properties": json.loads(row["properties_json"]),
                    "created_at": row["created_at"],
                },
                "node": {
                    "id": row["node_id"],
                    "workflow_id": row["workflow_id"],
                    "type": row["node_type"],
                    "title": row["title"],
                    "status": row["status"],
                    "properties": json.loads(row["node_props"]),
                    "created_at": row["node_created"],
                    "updated_at": row["node_updated"],
                },
            }

        return {
            "outgoing": [row_to_edge_with_node(row) for row in outgoing_rows],
            "incoming": [row_to_edge_with_node(row) for row in incoming_rows],
        }

    # ==================== View Templates ====================

    async def traverse_view_template(
        self,
        workflow_id: str,
        template: ViewTemplate,
        root_node_id: str | None = None,
        filter_params: ViewFilterParams | None = None,
    ) -> dict[str, Any]:
        """
        Traverse the graph according to a view template configuration.

        Returns a structured response with nodes organized by level (node type).
        Optionally applies filters to root nodes.
        """
        from app.services.filter_evaluator import FilterEvaluator

        result: dict[str, Any] = {
            "template": template.model_dump(by_alias=True),
            "levels": {},
        }

        # Get root nodes
        if root_node_id:
            root_node = await self.get_node(workflow_id, root_node_id)
            if root_node is None:
                return result
            root_nodes = [root_node]
        else:
            root_nodes, _ = await self.query_nodes(
                workflow_id, node_type=template.root_type, limit=1000
            )

        # Apply filters to root nodes if provided
        if filter_params and filter_params.filters:
            evaluator = FilterEvaluator(self, workflow_id)
            root_nodes = await evaluator.evaluate_filter_group(
                root_nodes, filter_params.filters
            )

        # Store root nodes in result
        result["levels"][template.root_type] = {
            "nodes": [node.model_dump() for node in root_nodes],
            "edges": [],
            "count": len(root_nodes),
            "parent_map": {},  # Root nodes have no parents
        }

        # Track visited node IDs to avoid cycles
        visited_node_ids: set[str] = {n.id for n in root_nodes}

        # Keep track of nodes by type for edge traversal
        nodes_by_type: dict[str, list[Node]] = {template.root_type: root_nodes}

        # Auto-include edge traversals for Kanban swimlanePath configurations
        # This ensures relational swimlanes work without requiring explicit edge config
        from app.models.workflow import EdgeTraversal, KanbanConfig

        edges_to_traverse = list(template.edges)  # Copy to avoid mutating original

        for level_type, level_config in template.levels.items():
            if level_config.style == "kanban" and isinstance(
                level_config.style_config, KanbanConfig
            ):
                swimlane_path = level_config.style_config.swimlane_path

                if swimlane_path:
                    # Check if this edge traversal already exists
                    already_exists = any(
                        e.edge_type == swimlane_path.edge_type
                        and e.direction == swimlane_path.direction
                        and e.target_type == swimlane_path.target_type
                        for e in edges_to_traverse
                    )

                    if not already_exists:
                        edges_to_traverse.append(
                            EdgeTraversal(
                                edge_type=swimlane_path.edge_type,
                                direction=swimlane_path.direction,
                                target_type=swimlane_path.target_type,
                                source_type=level_type,
                            )
                        )

        # Traverse each edge configuration
        for edge_config in edges_to_traverse:
            # Determine source type: use explicit sourceType or default to root type
            source_type = edge_config.source_type or template.root_type
            source_nodes = nodes_by_type.get(source_type, [])

            level_nodes: list[dict[str, Any]] = []
            level_edges: list[dict[str, Any]] = []
            level_parent_map: dict[str, str] = {}  # child_id -> parent_id

            for node in source_nodes:
                # Determine which direction to traverse
                if edge_config.direction == "outgoing":
                    neighbors = await self.get_neighbors(
                        workflow_id,
                        node.id,
                        edge_types=[edge_config.edge_type],
                    )
                    neighbor_list = neighbors.get("outgoing", [])
                else:
                    neighbors = await self.get_neighbors(
                        workflow_id,
                        node.id,
                        edge_types=[edge_config.edge_type],
                    )
                    neighbor_list = neighbors.get("incoming", [])

                for item in neighbor_list:
                    neighbor_node = item["node"]
                    edge = item["edge"]

                    # Check if this node matches the target type
                    if neighbor_node["type"] == edge_config.target_type:
                        # Avoid duplicates
                        if neighbor_node["id"] not in visited_node_ids:
                            visited_node_ids.add(neighbor_node["id"])
                            level_nodes.append(neighbor_node)
                            # Track parent relationship (the node we traversed from)
                            level_parent_map[neighbor_node["id"]] = node.id
                        level_edges.append(edge)

            # Store this level's nodes and edges
            if edge_config.target_type not in result["levels"]:
                result["levels"][edge_config.target_type] = {
                    "nodes": [],
                    "edges": [],
                    "count": 0,
                    "parent_map": {},
                }

            result["levels"][edge_config.target_type]["nodes"].extend(level_nodes)
            result["levels"][edge_config.target_type]["edges"].extend(level_edges)
            result["levels"][edge_config.target_type]["count"] += len(level_nodes)
            result["levels"][edge_config.target_type]["parent_map"].update(level_parent_map)

            # Store discovered nodes by type for potential use in subsequent edge traversals
            if level_nodes:
                target_type = edge_config.target_type
                if target_type not in nodes_by_type:
                    nodes_by_type[target_type] = []
                nodes_by_type[target_type].extend(
                    [
                        Node(
                            id=n["id"],
                            workflow_id=n["workflow_id"],
                            type=n["type"],
                            title=n["title"],
                            status=n.get("status"),
                            properties=n.get("properties", {}),
                            created_at=n["created_at"],
                            updated_at=n["updated_at"],
                        )
                        for n in level_nodes
                    ]
                )

        return result

    async def add_view_template(
        self, workflow_id: str, view_create: ViewTemplateCreate
    ) -> ViewTemplate | None:
        """Add a view template to a workflow definition."""
        db = await get_db()

        # Get current workflow definition
        cursor = await db.execute(
            "SELECT definition_json, version FROM workflow_definitions WHERE id = ?",
            (workflow_id,),
        )
        row = await cursor.fetchone()
        if row is None:
            return None

        definition_dict = json.loads(row["definition_json"])
        current_version = row["version"]

        # Generate unique view ID
        view_id = f"view-{_generate_id()[:8]}"

        # Create ViewTemplate from ViewTemplateCreate
        view_template = ViewTemplate(
            id=view_id,
            name=view_create.name,
            description=view_create.description,
            icon=view_create.icon,
            rootType=view_create.root_type,
            edges=view_create.edges,
            levels=view_create.levels,
            filters=view_create.filters,
        )

        # Add to view_templates list
        if "viewTemplates" not in definition_dict:
            definition_dict["viewTemplates"] = []
        definition_dict["viewTemplates"].append(
            view_template.model_dump(by_alias=True)
        )

        # Update definition_json and increment version
        now = _now()
        await db.execute(
            """
            UPDATE workflow_definitions
            SET definition_json = ?, version = ?, updated_at = ?
            WHERE id = ?
            """,
            (json.dumps(definition_dict), current_version + 1, now, workflow_id),
        )
        await db.commit()

        return view_template

    async def update_view_template(
        self, workflow_id: str, view_id: str, update: ViewTemplateUpdate
    ) -> ViewTemplate | None:
        """Update a view template in a workflow definition."""
        db = await get_db()

        # Get current workflow definition
        cursor = await db.execute(
            "SELECT definition_json, version FROM workflow_definitions WHERE id = ?",
            (workflow_id,),
        )
        row = await cursor.fetchone()
        if row is None:
            return None

        definition_dict = json.loads(row["definition_json"])
        current_version = row["version"]

        # Find and update the view
        view_templates = definition_dict.get("viewTemplates", [])
        updated_view: ViewTemplate | None = None

        for i, view in enumerate(view_templates):
            if view.get("id") == view_id:
                # Apply partial updates - basic fields
                if update.name is not None:
                    view["name"] = update.name
                if update.description is not None:
                    view["description"] = update.description
                if update.icon is not None:
                    view["icon"] = update.icon
                # Apply partial updates - structural fields
                if update.edges is not None:
                    view["edges"] = [
                        e.model_dump(by_alias=True) for e in update.edges
                    ]
                if update.levels is not None:
                    view["levels"] = {
                        k: v.model_dump(by_alias=True)
                        for k, v in update.levels.items()
                    }
                if update.filters is not None:
                    view["filters"] = [
                        f.model_dump(by_alias=True) for f in update.filters
                    ]
                view_templates[i] = view
                updated_view = ViewTemplate.model_validate(view)
                break

        if updated_view is None:
            return None

        definition_dict["viewTemplates"] = view_templates

        # Update definition_json and increment version
        now = _now()
        await db.execute(
            """
            UPDATE workflow_definitions
            SET definition_json = ?, version = ?, updated_at = ?
            WHERE id = ?
            """,
            (json.dumps(definition_dict), current_version + 1, now, workflow_id),
        )
        await db.commit()

        return updated_view

    async def delete_view_template(self, workflow_id: str, view_id: str) -> bool:
        """Delete a view template from a workflow definition."""
        db = await get_db()

        # Get current workflow definition
        cursor = await db.execute(
            "SELECT definition_json, version FROM workflow_definitions WHERE id = ?",
            (workflow_id,),
        )
        row = await cursor.fetchone()
        if row is None:
            return False

        definition_dict = json.loads(row["definition_json"])
        current_version = row["version"]

        # Filter out the view
        view_templates = definition_dict.get("viewTemplates", [])
        original_count = len(view_templates)
        view_templates = [v for v in view_templates if v.get("id") != view_id]

        if len(view_templates) == original_count:
            return False  # View not found

        definition_dict["viewTemplates"] = view_templates

        # Update definition_json and increment version
        now = _now()
        await db.execute(
            """
            UPDATE workflow_definitions
            SET definition_json = ?, version = ?, updated_at = ?
            WHERE id = ?
            """,
            (json.dumps(definition_dict), current_version + 1, now, workflow_id),
        )
        await db.commit()

        return True

    async def list_view_templates(self, workflow_id: str) -> list[ViewTemplate]:
        """List all view templates for a workflow."""
        workflow = await self.get_workflow(workflow_id)
        if workflow is None:
            return []
        return workflow.view_templates

    # ==================== Rules ====================

    async def add_rule(self, workflow_id: str, rule: Rule) -> Rule | None:
        """Add a rule to a workflow definition."""
        db = await get_db()

        # Get current workflow definition
        cursor = await db.execute(
            "SELECT definition_json, version FROM workflow_definitions WHERE id = ?",
            (workflow_id,),
        )
        row = await cursor.fetchone()
        if row is None:
            return None

        definition_dict = json.loads(row["definition_json"])
        current_version = row["version"]

        # Add to rules list
        if "rules" not in definition_dict:
            definition_dict["rules"] = []

        # Check for duplicate rule ID
        existing_ids = {r.get("id") for r in definition_dict["rules"]}
        if rule.id in existing_ids:
            # Generate unique ID if collision
            rule = Rule(
                id=f"{rule.id}_{_generate_id()[:6]}",
                when=rule.when,
                require_edges=rule.require_edges,
                message=rule.message,
            )

        definition_dict["rules"].append(rule.model_dump(by_alias=True))

        # Update definition_json and increment version
        now = _now()
        await db.execute(
            """
            UPDATE workflow_definitions
            SET definition_json = ?, version = ?, updated_at = ?
            WHERE id = ?
            """,
            (json.dumps(definition_dict), current_version + 1, now, workflow_id),
        )
        await db.commit()

        return rule

    async def delete_rule(self, workflow_id: str, rule_id: str) -> bool:
        """Delete a rule from a workflow definition."""
        db = await get_db()

        # Get current workflow definition
        cursor = await db.execute(
            "SELECT definition_json, version FROM workflow_definitions WHERE id = ?",
            (workflow_id,),
        )
        row = await cursor.fetchone()
        if row is None:
            return False

        definition_dict = json.loads(row["definition_json"])
        current_version = row["version"]

        # Find and remove the rule
        rules = definition_dict.get("rules", [])
        original_count = len(rules)
        rules = [r for r in rules if r.get("id") != rule_id]

        if len(rules) == original_count:
            return False  # Rule not found

        definition_dict["rules"] = rules

        # Update definition_json and increment version
        now = _now()
        await db.execute(
            """
            UPDATE workflow_definitions
            SET definition_json = ?, version = ?, updated_at = ?
            WHERE id = ?
            """,
            (json.dumps(definition_dict), current_version + 1, now, workflow_id),
        )
        await db.commit()

        return True

    async def list_rules(self, workflow_id: str) -> list[Rule]:
        """List all rules for a workflow."""
        workflow = await self.get_workflow(workflow_id)
        if workflow is None:
            return []
        return workflow.rules

    # ==================== Events ====================

    async def append_event(self, workflow_id: str, event: EventCreate) -> Event:
        """Append an event to the workflow timeline."""
        db = await get_db()
        event_id = _generate_id()
        now = _now()

        await db.execute(
            """
            INSERT INTO events (id, workflow_id, subject_node_id, event_type, payload_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                event_id,
                workflow_id,
                event.subject_node_id,
                event.event_type,
                json.dumps(event.payload),
                now,
            ),
        )
        await db.commit()

        return Event(
            id=event_id,
            workflow_id=workflow_id,
            subject_node_id=event.subject_node_id,
            event_type=event.event_type,
            payload=event.payload,
            created_at=now,
        )

    async def get_events(
        self,
        workflow_id: str,
        subject_node_id: str | None = None,
        event_type: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[Event]:
        """Get events with optional filters."""
        db = await get_db()

        where_clauses = ["workflow_id = ?"]
        params: list[Any] = [workflow_id]

        if subject_node_id:
            where_clauses.append("subject_node_id = ?")
            params.append(subject_node_id)

        if event_type:
            where_clauses.append("event_type = ?")
            params.append(event_type)

        where_sql = " AND ".join(where_clauses)

        cursor = await db.execute(
            f"""
            SELECT id, workflow_id, subject_node_id, event_type, payload_json, created_at
            FROM events WHERE {where_sql}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
            """,
            params + [limit, offset],
        )
        rows = await cursor.fetchall()

        return [
            Event(
                id=row["id"],
                workflow_id=row["workflow_id"],
                subject_node_id=row["subject_node_id"],
                event_type=row["event_type"],
                payload=json.loads(row["payload_json"]),
                created_at=row["created_at"],
            )
            for row in rows
        ]

    # ==================== Endpoints ====================

    async def create_endpoint(
        self, workflow_id: str, endpoint: EndpointCreate
    ) -> Endpoint:
        """Create a new endpoint for a workflow."""
        db = await get_db()
        endpoint_id = _generate_id()
        now = _now()

        await db.execute(
            """
            INSERT INTO endpoints (
                id, workflow_id, name, slug, description, http_method,
                instruction, mode, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                endpoint_id,
                workflow_id,
                endpoint.name,
                endpoint.slug,
                endpoint.description,
                endpoint.http_method,
                endpoint.instruction,
                endpoint.mode,
                now,
                now,
            ),
        )
        await db.commit()

        return Endpoint(
            id=endpoint_id,
            workflow_id=workflow_id,
            name=endpoint.name,
            slug=endpoint.slug,
            description=endpoint.description,
            http_method=endpoint.http_method,
            instruction=endpoint.instruction,
            mode=endpoint.mode,
            is_learned=False,
            learned_at=None,
            learned_skill_md=None,
            created_at=now,
            updated_at=now,
            last_executed_at=None,
            execution_count=0,
        )

    async def get_endpoint(
        self, workflow_id: str, endpoint_id: str
    ) -> Endpoint | None:
        """Get an endpoint by ID."""
        db = await get_db()
        cursor = await db.execute(
            """
            SELECT id, workflow_id, name, slug, description, http_method,
                   instruction, mode, learned_skill_md, learned_transformer_code,
                   learned_at, created_at, updated_at, last_executed_at, execution_count
            FROM endpoints
            WHERE id = ? AND workflow_id = ?
            """,
            (endpoint_id, workflow_id),
        )
        row = await cursor.fetchone()

        if row is None:
            return None

        return Endpoint(
            id=row["id"],
            workflow_id=row["workflow_id"],
            name=row["name"],
            slug=row["slug"],
            description=row["description"],
            http_method=row["http_method"],
            instruction=row["instruction"],
            mode=row["mode"],
            is_learned=row["learned_at"] is not None,
            learned_at=row["learned_at"],
            learned_skill_md=row["learned_skill_md"],
            learned_transformer_code=row["learned_transformer_code"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            last_executed_at=row["last_executed_at"],
            execution_count=row["execution_count"],
        )

    async def get_endpoint_by_slug(
        self, workflow_id: str, slug: str
    ) -> Endpoint | None:
        """Get an endpoint by its slug."""
        db = await get_db()
        cursor = await db.execute(
            """
            SELECT id, workflow_id, name, slug, description, http_method,
                   instruction, mode, learned_skill_md, learned_transformer_code,
                   learned_at, created_at, updated_at, last_executed_at, execution_count
            FROM endpoints
            WHERE workflow_id = ? AND slug = ?
            """,
            (workflow_id, slug),
        )
        row = await cursor.fetchone()

        if row is None:
            return None

        return Endpoint(
            id=row["id"],
            workflow_id=row["workflow_id"],
            name=row["name"],
            slug=row["slug"],
            description=row["description"],
            http_method=row["http_method"],
            instruction=row["instruction"],
            mode=row["mode"],
            is_learned=row["learned_at"] is not None,
            learned_at=row["learned_at"],
            learned_skill_md=row["learned_skill_md"],
            learned_transformer_code=row["learned_transformer_code"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            last_executed_at=row["last_executed_at"],
            execution_count=row["execution_count"],
        )

    async def list_endpoints(self, workflow_id: str) -> tuple[list[Endpoint], int]:
        """List all endpoints for a workflow. Returns (endpoints, total_count)."""
        db = await get_db()

        # Get total count
        cursor = await db.execute(
            "SELECT COUNT(*) as count FROM endpoints WHERE workflow_id = ?",
            (workflow_id,),
        )
        row = await cursor.fetchone()
        total = row["count"] if row else 0

        # Get endpoints (without learned_skill_md for list view)
        cursor = await db.execute(
            """
            SELECT id, workflow_id, name, slug, description, http_method,
                   instruction, mode, learned_at, created_at, updated_at,
                   last_executed_at, execution_count
            FROM endpoints
            WHERE workflow_id = ?
            ORDER BY created_at DESC
            """,
            (workflow_id,),
        )
        rows = await cursor.fetchall()

        endpoints = [
            Endpoint(
                id=row["id"],
                workflow_id=row["workflow_id"],
                name=row["name"],
                slug=row["slug"],
                description=row["description"],
                http_method=row["http_method"],
                instruction=row["instruction"],
                mode=row["mode"],
                is_learned=row["learned_at"] is not None,
                learned_at=row["learned_at"],
                learned_skill_md=None,  # Excluded from list view
                created_at=row["created_at"],
                updated_at=row["updated_at"],
                last_executed_at=row["last_executed_at"],
                execution_count=row["execution_count"],
            )
            for row in rows
        ]

        return endpoints, total

    async def update_endpoint(
        self, workflow_id: str, endpoint_id: str, update: EndpointUpdate
    ) -> Endpoint | None:
        """Update an endpoint."""
        db = await get_db()

        # Get current endpoint
        current = await self.get_endpoint(workflow_id, endpoint_id)
        if current is None:
            return None

        # Build update fields
        now = _now()
        new_name = update.name if update.name is not None else current.name
        new_description = (
            update.description if update.description is not None else current.description
        )
        new_http_method = (
            update.http_method if update.http_method is not None else current.http_method
        )
        new_instruction = (
            update.instruction if update.instruction is not None else current.instruction
        )
        new_mode = update.mode if update.mode is not None else current.mode

        await db.execute(
            """
            UPDATE endpoints
            SET name = ?, description = ?, http_method = ?, instruction = ?,
                mode = ?, updated_at = ?
            WHERE id = ? AND workflow_id = ?
            """,
            (
                new_name,
                new_description,
                new_http_method,
                new_instruction,
                new_mode,
                now,
                endpoint_id,
                workflow_id,
            ),
        )
        await db.commit()

        return Endpoint(
            id=endpoint_id,
            workflow_id=workflow_id,
            name=new_name,
            slug=current.slug,  # Slug cannot be changed
            description=new_description,
            http_method=new_http_method,
            instruction=new_instruction,
            mode=new_mode,
            is_learned=current.is_learned,
            learned_at=current.learned_at,
            learned_skill_md=current.learned_skill_md,
            created_at=current.created_at,
            updated_at=now,
            last_executed_at=current.last_executed_at,
            execution_count=current.execution_count,
        )

    async def delete_endpoint(self, workflow_id: str, endpoint_id: str) -> bool:
        """Delete an endpoint."""
        db = await get_db()
        cursor = await db.execute(
            "DELETE FROM endpoints WHERE id = ? AND workflow_id = ?",
            (endpoint_id, workflow_id),
        )
        await db.commit()
        return cursor.rowcount > 0

    async def update_endpoint_learned(
        self,
        workflow_id: str,
        endpoint_id: str,
        skill_md: str,
        transformer_code: str | None = None,
    ) -> Endpoint | None:
        """Update an endpoint with learned assets after successful learning."""
        db = await get_db()
        now = _now()

        await db.execute(
            """
            UPDATE endpoints
            SET learned_skill_md = ?, learned_transformer_code = ?,
                learned_at = ?, updated_at = ?
            WHERE id = ? AND workflow_id = ?
            """,
            (skill_md, transformer_code, now, now, endpoint_id, workflow_id),
        )
        await db.commit()

        return await self.get_endpoint(workflow_id, endpoint_id)

    async def reset_endpoint_learning(
        self, workflow_id: str, endpoint_id: str
    ) -> Endpoint | None:
        """Clear learned assets from an endpoint."""
        db = await get_db()
        now = _now()

        await db.execute(
            """
            UPDATE endpoints
            SET learned_skill_md = NULL, learned_transformer_code = NULL,
                learned_at = NULL, updated_at = ?
            WHERE id = ? AND workflow_id = ?
            """,
            (now, endpoint_id, workflow_id),
        )
        await db.commit()

        return await self.get_endpoint(workflow_id, endpoint_id)

    async def record_endpoint_execution(
        self, workflow_id: str, endpoint_id: str
    ) -> None:
        """Record that an endpoint was executed (updates last_executed_at and count)."""
        db = await get_db()
        now = _now()

        await db.execute(
            """
            UPDATE endpoints
            SET last_executed_at = ?, execution_count = execution_count + 1
            WHERE id = ? AND workflow_id = ?
            """,
            (now, endpoint_id, workflow_id),
        )
        await db.commit()

    async def get_endpoint_learned_code(
        self, workflow_id: str, endpoint_id: str
    ) -> str | None:
        """Get just the learned transformer code for an endpoint."""
        db = await get_db()
        cursor = await db.execute(
            "SELECT learned_transformer_code FROM endpoints WHERE id = ? AND workflow_id = ?",
            (endpoint_id, workflow_id),
        )
        row = await cursor.fetchone()
        return row["learned_transformer_code"] if row else None

    # ==================== Reset & Seed ====================

    async def reset_workflow(self, workflow_id: str) -> bool:
        """Reset a workflow by deleting all nodes, edges, and events."""
        db = await get_db()

        # Delete events
        await db.execute("DELETE FROM events WHERE workflow_id = ?", (workflow_id,))
        # Delete edges
        await db.execute("DELETE FROM edges WHERE workflow_id = ?", (workflow_id,))
        # Delete node-reference links
        await db.execute(
            "DELETE FROM node_external_refs WHERE workflow_id = ?", (workflow_id,)
        )
        # Delete nodes
        await db.execute("DELETE FROM nodes WHERE workflow_id = ?", (workflow_id,))

        await db.commit()
        return True

    # ==================== External References ====================

    async def create_reference(
        self, ref: "ExternalReferenceCreate"
    ) -> "ExternalReference":
        """Create or update an external reference (upsert by system + external_id)."""
        from app.models.external_reference import ExternalReference

        db = await get_db()
        now = _now()

        # Check if reference already exists
        cursor = await db.execute(
            "SELECT id FROM external_references WHERE system = ? AND external_id = ?",
            (ref.system, ref.external_id),
        )
        existing = await cursor.fetchone()

        if existing:
            # Update existing reference
            ref_id = existing["id"]
            await db.execute(
                """
                UPDATE external_references
                SET canonical_url = ?, version = ?, version_type = ?,
                    display_name = ?, last_seen_at = ?
                WHERE id = ?
                """,
                (
                    ref.canonical_url,
                    ref.version,
                    ref.version_type.value if ref.version_type else "etag",
                    ref.display_name,
                    now,
                    ref_id,
                ),
            )
        else:
            # Create new reference
            ref_id = _generate_id()
            await db.execute(
                """
                INSERT INTO external_references
                (id, system, object_type, external_id, canonical_url, version, version_type,
                 display_name, created_at, last_seen_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    ref_id,
                    ref.system,
                    ref.object_type,
                    ref.external_id,
                    ref.canonical_url,
                    ref.version,
                    ref.version_type.value if ref.version_type else "etag",
                    ref.display_name,
                    now,
                    now,
                ),
            )

        await db.commit()

        # Fetch and return the full record
        cursor = await db.execute(
            "SELECT * FROM external_references WHERE id = ?", (ref_id,)
        )
        row = await cursor.fetchone()

        return ExternalReference(
            id=row["id"],
            system=row["system"],
            object_type=row["object_type"],
            external_id=row["external_id"],
            canonical_url=row["canonical_url"],
            version=row["version"],
            version_type=row["version_type"],
            display_name=row["display_name"],
            created_at=row["created_at"],
            last_seen_at=row["last_seen_at"],
        )

    async def get_reference(self, reference_id: str) -> "ExternalReference | None":
        """Get an external reference by ID."""
        from app.models.external_reference import ExternalReference

        db = await get_db()
        cursor = await db.execute(
            "SELECT * FROM external_references WHERE id = ?", (reference_id,)
        )
        row = await cursor.fetchone()

        if row is None:
            return None

        return ExternalReference(
            id=row["id"],
            system=row["system"],
            object_type=row["object_type"],
            external_id=row["external_id"],
            canonical_url=row["canonical_url"],
            version=row["version"],
            version_type=row["version_type"],
            display_name=row["display_name"],
            created_at=row["created_at"],
            last_seen_at=row["last_seen_at"],
        )

    async def get_reference_by_external_id(
        self, system: str, external_id: str
    ) -> "ExternalReference | None":
        """Get an external reference by system and external ID."""
        from app.models.external_reference import ExternalReference

        db = await get_db()
        cursor = await db.execute(
            "SELECT * FROM external_references WHERE system = ? AND external_id = ?",
            (system, external_id),
        )
        row = await cursor.fetchone()

        if row is None:
            return None

        return ExternalReference(
            id=row["id"],
            system=row["system"],
            object_type=row["object_type"],
            external_id=row["external_id"],
            canonical_url=row["canonical_url"],
            version=row["version"],
            version_type=row["version_type"],
            display_name=row["display_name"],
            created_at=row["created_at"],
            last_seen_at=row["last_seen_at"],
        )

    async def query_references(
        self,
        system: str | None = None,
        object_type: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list["ExternalReference"], int]:
        """Query external references with filters."""
        from app.models.external_reference import ExternalReference

        db = await get_db()

        where_clauses: list[str] = []
        params: list[Any] = []

        if system:
            where_clauses.append("system = ?")
            params.append(system)

        if object_type:
            where_clauses.append("object_type = ?")
            params.append(object_type)

        where_sql = " AND ".join(where_clauses) if where_clauses else "1=1"

        # Get total count
        cursor = await db.execute(
            f"SELECT COUNT(*) as count FROM external_references WHERE {where_sql}",
            params,
        )
        row = await cursor.fetchone()
        total = row["count"] if row else 0

        # Get references
        cursor = await db.execute(
            f"""
            SELECT * FROM external_references WHERE {where_sql}
            ORDER BY last_seen_at DESC
            LIMIT ? OFFSET ?
            """,
            params + [limit, offset],
        )
        rows = await cursor.fetchall()

        refs = [
            ExternalReference(
                id=row["id"],
                system=row["system"],
                object_type=row["object_type"],
                external_id=row["external_id"],
                canonical_url=row["canonical_url"],
                version=row["version"],
                version_type=row["version_type"],
                display_name=row["display_name"],
                created_at=row["created_at"],
                last_seen_at=row["last_seen_at"],
            )
            for row in rows
        ]

        return refs, total

    async def delete_reference(self, reference_id: str) -> bool:
        """Delete an external reference and its associated data."""
        db = await get_db()
        cursor = await db.execute(
            "DELETE FROM external_references WHERE id = ?", (reference_id,)
        )
        await db.commit()
        return cursor.rowcount > 0

    # ==================== Projections ====================

    async def upsert_projection(
        self, proj: "ProjectionCreate"
    ) -> "Projection":
        """Create or update a projection for an external reference."""
        from datetime import datetime, timedelta

        from app.models.external_reference import Projection

        db = await get_db()
        now = datetime.utcnow()
        now_str = now.isoformat()
        stale_after = (now + timedelta(seconds=proj.freshness_slo_seconds)).isoformat()

        # Check if projection already exists
        cursor = await db.execute(
            "SELECT id FROM projections WHERE reference_id = ?",
            (proj.reference_id,),
        )
        existing = await cursor.fetchone()

        if existing:
            proj_id = existing["id"]
            await db.execute(
                """
                UPDATE projections
                SET title = ?, status = ?, owner = ?, summary = ?,
                    properties_json = ?, relationships_json = ?,
                    fetched_at = ?, stale_after = ?,
                    freshness_slo_seconds = ?, retrieval_mode = ?,
                    content_hash = ?
                WHERE id = ?
                """,
                (
                    proj.title,
                    proj.status,
                    proj.owner,
                    proj.summary,
                    json.dumps(proj.properties),
                    json.dumps(proj.relationships),
                    now_str,
                    stale_after,
                    proj.freshness_slo_seconds,
                    proj.retrieval_mode.value if proj.retrieval_mode else "cached",
                    None,  # content_hash will be computed if needed
                    proj_id,
                ),
            )
        else:
            proj_id = _generate_id()
            await db.execute(
                """
                INSERT INTO projections
                (id, reference_id, title, status, owner, summary,
                 properties_json, relationships_json,
                 fetched_at, stale_after, freshness_slo_seconds, retrieval_mode, content_hash)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    proj_id,
                    proj.reference_id,
                    proj.title,
                    proj.status,
                    proj.owner,
                    proj.summary,
                    json.dumps(proj.properties),
                    json.dumps(proj.relationships),
                    now_str,
                    stale_after,
                    proj.freshness_slo_seconds,
                    proj.retrieval_mode.value if proj.retrieval_mode else "cached",
                    None,
                ),
            )

        await db.commit()

        return Projection(
            id=proj_id,
            reference_id=proj.reference_id,
            title=proj.title,
            status=proj.status,
            owner=proj.owner,
            summary=proj.summary,
            properties=proj.properties,
            relationships=proj.relationships,
            fetched_at=now,
            stale_after=datetime.fromisoformat(stale_after),
            freshness_slo_seconds=proj.freshness_slo_seconds,
            retrieval_mode=proj.retrieval_mode,
            content_hash=None,
        )

    async def get_projection(self, reference_id: str) -> "Projection | None":
        """Get the projection for an external reference."""
        from datetime import datetime

        from app.models.external_reference import Projection, RetrievalMode

        db = await get_db()
        cursor = await db.execute(
            "SELECT * FROM projections WHERE reference_id = ?", (reference_id,)
        )
        row = await cursor.fetchone()

        if row is None:
            return None

        return Projection(
            id=row["id"],
            reference_id=row["reference_id"],
            title=row["title"],
            status=row["status"],
            owner=row["owner"],
            summary=row["summary"],
            properties=json.loads(row["properties_json"] or "{}"),
            relationships=json.loads(row["relationships_json"] or "[]"),
            fetched_at=datetime.fromisoformat(row["fetched_at"]),
            stale_after=datetime.fromisoformat(row["stale_after"]),
            freshness_slo_seconds=row["freshness_slo_seconds"],
            retrieval_mode=RetrievalMode(row["retrieval_mode"]),
            content_hash=row["content_hash"],
        )

    async def get_stale_projections(
        self, limit: int = 100
    ) -> list["Projection"]:
        """Get projections that are past their stale_after time."""
        from datetime import datetime

        from app.models.external_reference import Projection, RetrievalMode

        db = await get_db()
        now_str = datetime.utcnow().isoformat()

        cursor = await db.execute(
            """
            SELECT * FROM projections
            WHERE stale_after < ?
            ORDER BY stale_after ASC
            LIMIT ?
            """,
            (now_str, limit),
        )
        rows = await cursor.fetchall()

        return [
            Projection(
                id=row["id"],
                reference_id=row["reference_id"],
                title=row["title"],
                status=row["status"],
                owner=row["owner"],
                summary=row["summary"],
                properties=json.loads(row["properties_json"] or "{}"),
                relationships=json.loads(row["relationships_json"] or "[]"),
                fetched_at=datetime.fromisoformat(row["fetched_at"]),
                stale_after=datetime.fromisoformat(row["stale_after"]),
                freshness_slo_seconds=row["freshness_slo_seconds"],
                retrieval_mode=RetrievalMode(row["retrieval_mode"]),
                content_hash=row["content_hash"],
            )
            for row in rows
        ]

    # ==================== Snapshots ====================

    async def create_snapshot(
        self, snapshot: "SnapshotCreate"
    ) -> "Snapshot":
        """Create an immutable snapshot of external content."""
        from app.models.external_reference import Snapshot

        db = await get_db()
        snapshot_id = _generate_id()
        now = _now()

        await db.execute(
            """
            INSERT INTO snapshots
            (id, reference_id, content_type, content_path, content_inline,
             content_hash, captured_at, captured_by, capture_reason, source_version)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                snapshot_id,
                snapshot.reference_id,
                snapshot.content_type,
                snapshot.content_path,
                snapshot.content_inline,
                snapshot.content_hash,
                now,
                snapshot.captured_by,
                snapshot.capture_reason.value if snapshot.capture_reason else "manual",
                snapshot.source_version,
            ),
        )
        await db.commit()

        return Snapshot(
            id=snapshot_id,
            reference_id=snapshot.reference_id,
            content_type=snapshot.content_type,
            content_path=snapshot.content_path,
            content_inline=snapshot.content_inline,
            content_hash=snapshot.content_hash,
            captured_at=now,
            captured_by=snapshot.captured_by,
            capture_reason=snapshot.capture_reason,
            source_version=snapshot.source_version,
        )

    async def get_snapshot(self, snapshot_id: str) -> "Snapshot | None":
        """Get a snapshot by ID."""
        from app.models.external_reference import CaptureReason, Snapshot

        db = await get_db()
        cursor = await db.execute(
            "SELECT * FROM snapshots WHERE id = ?", (snapshot_id,)
        )
        row = await cursor.fetchone()

        if row is None:
            return None

        return Snapshot(
            id=row["id"],
            reference_id=row["reference_id"],
            content_type=row["content_type"],
            content_path=row["content_path"],
            content_inline=row["content_inline"],
            content_hash=row["content_hash"],
            captured_at=row["captured_at"],
            captured_by=row["captured_by"],
            capture_reason=CaptureReason(row["capture_reason"])
            if row["capture_reason"]
            else None,
            source_version=row["source_version"],
        )

    async def get_snapshots_for_reference(
        self, reference_id: str, limit: int = 10
    ) -> list["Snapshot"]:
        """Get all snapshots for an external reference."""
        from app.models.external_reference import CaptureReason, Snapshot

        db = await get_db()
        cursor = await db.execute(
            """
            SELECT * FROM snapshots
            WHERE reference_id = ?
            ORDER BY captured_at DESC
            LIMIT ?
            """,
            (reference_id, limit),
        )
        rows = await cursor.fetchall()

        return [
            Snapshot(
                id=row["id"],
                reference_id=row["reference_id"],
                content_type=row["content_type"],
                content_path=row["content_path"],
                content_inline=row["content_inline"],
                content_hash=row["content_hash"],
                captured_at=row["captured_at"],
                captured_by=row["captured_by"],
                capture_reason=CaptureReason(row["capture_reason"])
                if row["capture_reason"]
                else None,
                source_version=row["source_version"],
            )
            for row in rows
        ]

    # ==================== Node ↔ Reference Links ====================

    async def link_node_reference(
        self,
        workflow_id: str,
        node_id: str,
        reference_id: str,
        relationship: str = "source",
        added_by: str | None = None,
    ) -> "NodeExternalRef":
        """Link a workflow node to an external reference."""
        from app.models.external_reference import NodeExternalRef, ReferenceRelationship

        db = await get_db()
        now = _now()

        # Upsert the link
        await db.execute(
            """
            INSERT OR REPLACE INTO node_external_refs
            (node_id, reference_id, workflow_id, relationship, added_at, added_by)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (node_id, reference_id, workflow_id, relationship, now, added_by),
        )
        await db.commit()

        return NodeExternalRef(
            node_id=node_id,
            reference_id=reference_id,
            workflow_id=workflow_id,
            relationship=ReferenceRelationship(relationship),
            added_at=now,
            added_by=added_by,
        )

    async def unlink_node_reference(
        self, node_id: str, reference_id: str
    ) -> bool:
        """Remove link between a node and external reference."""
        db = await get_db()
        cursor = await db.execute(
            "DELETE FROM node_external_refs WHERE node_id = ? AND reference_id = ?",
            (node_id, reference_id),
        )
        await db.commit()
        return cursor.rowcount > 0

    async def get_node_references(
        self, workflow_id: str, node_id: str
    ) -> list["NodeExternalRefWithDetails"]:
        """Get all external references linked to a node, with full reference details."""
        from app.models.external_reference import (
            ExternalReferenceWithProjection,
            NodeExternalRefWithDetails,
            ReferenceRelationship,
        )

        db = await get_db()
        cursor = await db.execute(
            """
            SELECT nr.*, r.*, p.id as proj_id, p.title as proj_title,
                   p.status as proj_status, p.owner as proj_owner, p.summary as proj_summary,
                   p.properties_json as proj_props, p.relationships_json as proj_rels,
                   p.fetched_at, p.stale_after, p.freshness_slo_seconds, p.retrieval_mode,
                   p.content_hash
            FROM node_external_refs nr
            JOIN external_references r ON nr.reference_id = r.id
            LEFT JOIN projections p ON r.id = p.reference_id
            WHERE nr.workflow_id = ? AND nr.node_id = ?
            ORDER BY nr.added_at DESC
            """,
            (workflow_id, node_id),
        )
        rows = await cursor.fetchall()

        results = []
        for row in rows:
            # Build projection if it exists
            projection = None
            if row["proj_id"]:
                from datetime import datetime

                from app.models.external_reference import Projection, RetrievalMode

                projection = Projection(
                    id=row["proj_id"],
                    reference_id=row["reference_id"],
                    title=row["proj_title"],
                    status=row["proj_status"],
                    owner=row["proj_owner"],
                    summary=row["proj_summary"],
                    properties=json.loads(row["proj_props"] or "{}"),
                    relationships=json.loads(row["proj_rels"] or "[]"),
                    fetched_at=datetime.fromisoformat(row["fetched_at"]),
                    stale_after=datetime.fromisoformat(row["stale_after"]),
                    freshness_slo_seconds=row["freshness_slo_seconds"],
                    retrieval_mode=RetrievalMode(row["retrieval_mode"]),
                    content_hash=row["content_hash"],
                )

            # Build reference with projection
            ref_with_proj = ExternalReferenceWithProjection(
                id=row["id"],
                system=row["system"],
                object_type=row["object_type"],
                external_id=row["external_id"],
                canonical_url=row["canonical_url"],
                version=row["version"],
                version_type=row["version_type"],
                display_name=row["display_name"],
                created_at=row["created_at"],
                last_seen_at=row["last_seen_at"],
                projection=projection,
            )

            # Build the full link object
            results.append(
                NodeExternalRefWithDetails(
                    node_id=row["node_id"],
                    reference_id=row["reference_id"],
                    workflow_id=row["workflow_id"],
                    relationship=ReferenceRelationship(row["relationship"]),
                    added_at=row["added_at"],
                    added_by=row["added_by"],
                    reference=ref_with_proj,
                )
            )

        return results

    async def get_nodes_for_reference(
        self, reference_id: str
    ) -> list["NodeExternalRef"]:
        """Get all nodes linked to an external reference."""
        from app.models.external_reference import NodeExternalRef, ReferenceRelationship

        db = await get_db()
        cursor = await db.execute(
            """
            SELECT * FROM node_external_refs
            WHERE reference_id = ?
            ORDER BY added_at DESC
            """,
            (reference_id,),
        )
        rows = await cursor.fetchall()

        return [
            NodeExternalRef(
                node_id=row["node_id"],
                reference_id=row["reference_id"],
                workflow_id=row["workflow_id"],
                relationship=ReferenceRelationship(row["relationship"]),
                added_at=row["added_at"],
                added_by=row["added_by"],
            )
            for row in rows
        ]

    # ==================== Context Packs ====================

    async def save_context_pack(self, pack: "ContextPack") -> "ContextPack":
        """Save a context pack for audit purposes."""

        db = await get_db()

        await db.execute(
            """
            INSERT INTO context_packs
            (id, workflow_id, source_node_id, traversal_rule, resources_json,
             oldest_projection, any_stale, estimated_tokens, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                pack.id,
                pack.workflow_id,
                pack.source_node_id,
                pack.traversal_rule,
                json.dumps([r.model_dump() for r in pack.resources]),
                pack.oldest_projection.isoformat() if pack.oldest_projection else None,
                1 if pack.any_stale else 0,
                pack.estimated_tokens,
                pack.created_at.isoformat(),
            ),
        )
        await db.commit()

        return pack

    async def get_context_pack(self, pack_id: str) -> "ContextPack | None":
        """Get a context pack by ID."""
        from datetime import datetime

        from app.models.context_pack import ContextPack, ContextResource

        db = await get_db()
        cursor = await db.execute(
            "SELECT * FROM context_packs WHERE id = ?", (pack_id,)
        )
        row = await cursor.fetchone()

        if row is None:
            return None

        resources_data = json.loads(row["resources_json"] or "[]")
        resources = [ContextResource.model_validate(r) for r in resources_data]

        return ContextPack(
            id=row["id"],
            workflow_id=row["workflow_id"],
            source_node_id=row["source_node_id"],
            traversal_rule=row["traversal_rule"],
            resources=resources,
            oldest_projection=datetime.fromisoformat(row["oldest_projection"])
            if row["oldest_projection"]
            else None,
            any_stale=bool(row["any_stale"]),
            estimated_tokens=row["estimated_tokens"],
            created_at=datetime.fromisoformat(row["created_at"]),
        )

    # ==================== Task Execution Engine ====================

    async def create_task_set_definition(
        self, workflow_id: str, definition: TaskSetDefinitionCreate
    ) -> TaskSetDefinition:
        """Create a new TaskSet definition."""
        db = await get_db()
        task_set_id = _generate_id()
        now = _now()

        # Build the full definition with computed fields
        full_definition = TaskSetDefinition(
            id=task_set_id,
            name=definition.name,
            description=definition.description,
            root_node_type=definition.root_node_type,
            tasks=definition.tasks,
            tags=definition.tags,
            created_at=now,
            updated_at=now,
        )

        await db.execute(
            """
            INSERT INTO task_set_definitions (id, workflow_id, name, version, definition_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                task_set_id,
                workflow_id,
                definition.name,
                1,
                json.dumps(full_definition.model_dump(by_alias=True)),
                now,
                now,
            ),
        )
        await db.commit()

        return full_definition

    async def get_task_set_definition(
        self, workflow_id: str, task_set_id: str
    ) -> TaskSetDefinition | None:
        """Get a TaskSet definition by ID."""
        db = await get_db()
        cursor = await db.execute(
            """
            SELECT definition_json FROM task_set_definitions
            WHERE id = ? AND workflow_id = ?
            """,
            (task_set_id, workflow_id),
        )
        row = await cursor.fetchone()

        if row is None:
            return None

        return TaskSetDefinition.model_validate_json(row["definition_json"])

    async def list_task_set_definitions(
        self, workflow_id: str
    ) -> list[TaskSetDefinition]:
        """List all TaskSet definitions for a workflow."""
        db = await get_db()
        cursor = await db.execute(
            """
            SELECT definition_json FROM task_set_definitions
            WHERE workflow_id = ?
            ORDER BY created_at DESC
            """,
            (workflow_id,),
        )
        rows = await cursor.fetchall()

        return [
            TaskSetDefinition.model_validate_json(row["definition_json"])
            for row in rows
        ]

    async def delete_task_set_definition(
        self, workflow_id: str, task_set_id: str
    ) -> bool:
        """Delete a TaskSet definition."""
        db = await get_db()
        cursor = await db.execute(
            """
            DELETE FROM task_set_definitions WHERE id = ? AND workflow_id = ?
            """,
            (task_set_id, workflow_id),
        )
        await db.commit()
        return cursor.rowcount > 0

    async def create_task_set_instance(
        self, workflow_id: str, create: TaskSetInstanceCreate
    ) -> TaskSetInstance:
        """Start a new TaskSet instance."""
        db = await get_db()

        # Verify the TaskSet definition exists
        task_set_def = await self.get_task_set_definition(
            workflow_id, create.task_set_definition_id
        )
        if task_set_def is None:
            raise ValueError(
                f"TaskSet definition {create.task_set_definition_id} not found"
            )

        instance_id = _generate_id()
        now = _now()

        # Create the instance
        await db.execute(
            """
            INSERT INTO task_set_instances
            (id, workflow_id, task_set_definition_id, root_node_id, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                instance_id,
                workflow_id,
                create.task_set_definition_id,
                create.root_node_id,
                TaskSetInstanceStatus.ACTIVE.value,
                now,
                now,
            ),
        )

        # Create task instances for each task in the definition
        task_instances = []
        for task_def in task_set_def.tasks:
            task_instance_id = _generate_id()
            initial_status = TaskStatus.PENDING.value

            await db.execute(
                """
                INSERT INTO task_instances
                (id, task_set_instance_id, task_definition_id, status, assignee_type, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    task_instance_id,
                    instance_id,
                    task_def.id,
                    initial_status,
                    task_def.default_assignee_type.value,
                    now,
                    now,
                ),
            )

            task_instances.append(
                TaskInstance(
                    id=task_instance_id,
                    task_set_instance_id=instance_id,
                    task_definition_id=task_def.id,
                    status=TaskStatus.PENDING,
                    assignment=TaskAssignment(
                        assignee_type=task_def.default_assignee_type
                    ),
                )
            )

        await db.commit()

        return TaskSetInstance(
            id=instance_id,
            workflow_id=workflow_id,
            task_set_definition_id=create.task_set_definition_id,
            root_node_id=create.root_node_id,
            status=TaskSetInstanceStatus.ACTIVE,
            task_instances=task_instances,
            total_tasks=len(task_instances),
            completed_tasks=0,
            available_tasks=0,
            created_at=now,
            updated_at=now,
        )

    async def get_task_set_instance(
        self, workflow_id: str, instance_id: str
    ) -> TaskSetInstance | None:
        """Get a TaskSet instance with all its task instances."""
        db = await get_db()

        # Get the instance
        cursor = await db.execute(
            """
            SELECT id, workflow_id, task_set_definition_id, root_node_id, status, created_at, updated_at
            FROM task_set_instances
            WHERE id = ? AND workflow_id = ?
            """,
            (instance_id, workflow_id),
        )
        row = await cursor.fetchone()

        if row is None:
            return None

        # Get all task instances
        cursor = await db.execute(
            """
            SELECT id, task_set_instance_id, task_definition_id, status,
                   assignee_type, assignee_id, assigned_at, assigned_by,
                   started_at, completed_at, output_node_id, notes
            FROM task_instances
            WHERE task_set_instance_id = ?
            """,
            (instance_id,),
        )
        task_rows = await cursor.fetchall()

        task_instances = []
        completed_count = 0
        for task_row in task_rows:
            status = TaskStatus(task_row["status"])
            if status == TaskStatus.COMPLETED:
                completed_count += 1

            assignment = None
            if task_row["assignee_type"]:
                from app.models.task import AssigneeType
                assignment = TaskAssignment(
                    assignee_type=AssigneeType(task_row["assignee_type"]),
                    assignee_id=task_row["assignee_id"],
                    assigned_at=task_row["assigned_at"],
                    assigned_by=task_row["assigned_by"],
                )

            task_instances.append(
                TaskInstance(
                    id=task_row["id"],
                    task_set_instance_id=task_row["task_set_instance_id"],
                    task_definition_id=task_row["task_definition_id"],
                    status=status,
                    assignment=assignment,
                    started_at=task_row["started_at"],
                    completed_at=task_row["completed_at"],
                    output_node_id=task_row["output_node_id"],
                    notes=task_row["notes"],
                )
            )

        return TaskSetInstance(
            id=row["id"],
            workflow_id=row["workflow_id"],
            task_set_definition_id=row["task_set_definition_id"],
            root_node_id=row["root_node_id"],
            status=TaskSetInstanceStatus(row["status"]),
            task_instances=task_instances,
            total_tasks=len(task_instances),
            completed_tasks=completed_count,
            available_tasks=0,  # Will be computed by progress evaluator
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    async def list_task_set_instances(
        self,
        workflow_id: str,
        status: TaskSetInstanceStatus | None = None,
        root_node_id: str | None = None,
    ) -> list[TaskSetInstance]:
        """List TaskSet instances for a workflow."""
        db = await get_db()

        where_clauses = ["workflow_id = ?"]
        params: list[Any] = [workflow_id]

        if status:
            where_clauses.append("status = ?")
            params.append(status.value)

        if root_node_id:
            where_clauses.append("root_node_id = ?")
            params.append(root_node_id)

        where_sql = " AND ".join(where_clauses)

        cursor = await db.execute(
            f"""
            SELECT id FROM task_set_instances
            WHERE {where_sql}
            ORDER BY created_at DESC
            """,
            params,
        )
        rows = await cursor.fetchall()

        instances = []
        for row in rows:
            instance = await self.get_task_set_instance(workflow_id, row["id"])
            if instance:
                instances.append(instance)

        return instances

    async def update_task_instance(
        self,
        task_set_instance_id: str,
        task_definition_id: str,
        status: TaskStatus | None = None,
        output_node_id: str | None = None,
        notes: str | None = None,
        assignee_type: str | None = None,
        assignee_id: str | None = None,
        assigned_by: str | None = None,
    ) -> TaskInstance | None:
        """Update a task instance."""
        db = await get_db()
        now = _now()

        # Get current task instance
        cursor = await db.execute(
            """
            SELECT * FROM task_instances
            WHERE task_set_instance_id = ? AND task_definition_id = ?
            """,
            (task_set_instance_id, task_definition_id),
        )
        row = await cursor.fetchone()

        if row is None:
            return None

        # Build update
        updates = ["updated_at = ?"]
        params: list[Any] = [now]

        if status is not None:
            updates.append("status = ?")
            params.append(status.value)
            if status == TaskStatus.IN_PROGRESS and row["started_at"] is None:
                updates.append("started_at = ?")
                params.append(now)
            elif status == TaskStatus.COMPLETED:
                updates.append("completed_at = ?")
                params.append(now)

        if output_node_id is not None:
            updates.append("output_node_id = ?")
            params.append(output_node_id)

        if notes is not None:
            updates.append("notes = ?")
            params.append(notes)

        if assignee_type is not None:
            updates.append("assignee_type = ?")
            params.append(assignee_type)
            updates.append("assignee_id = ?")
            params.append(assignee_id)
            updates.append("assigned_at = ?")
            params.append(now)
            updates.append("assigned_by = ?")
            params.append(assigned_by)

        params.extend([task_set_instance_id, task_definition_id])

        await db.execute(
            f"""
            UPDATE task_instances
            SET {", ".join(updates)}
            WHERE task_set_instance_id = ? AND task_definition_id = ?
            """,
            params,
        )
        await db.commit()

        # Return updated instance
        cursor = await db.execute(
            """
            SELECT id, task_set_instance_id, task_definition_id, status,
                   assignee_type, assignee_id, assigned_at, assigned_by,
                   started_at, completed_at, output_node_id, notes
            FROM task_instances
            WHERE task_set_instance_id = ? AND task_definition_id = ?
            """,
            (task_set_instance_id, task_definition_id),
        )
        row = await cursor.fetchone()

        if row is None:
            return None

        from app.models.task import AssigneeType
        assignment = None
        if row["assignee_type"]:
            assignment = TaskAssignment(
                assignee_type=AssigneeType(row["assignee_type"]),
                assignee_id=row["assignee_id"],
                assigned_at=row["assigned_at"],
                assigned_by=row["assigned_by"],
            )

        return TaskInstance(
            id=row["id"],
            task_set_instance_id=row["task_set_instance_id"],
            task_definition_id=row["task_definition_id"],
            status=TaskStatus(row["status"]),
            assignment=assignment,
            started_at=row["started_at"],
            completed_at=row["completed_at"],
            output_node_id=row["output_node_id"],
            notes=row["notes"],
        )

    async def update_task_set_instance_status(
        self, workflow_id: str, instance_id: str, status: TaskSetInstanceStatus
    ) -> bool:
        """Update the status of a TaskSet instance."""
        db = await get_db()
        now = _now()

        cursor = await db.execute(
            """
            UPDATE task_set_instances
            SET status = ?, updated_at = ?
            WHERE id = ? AND workflow_id = ?
            """,
            (status.value, now, instance_id, workflow_id),
        )
        await db.commit()
        return cursor.rowcount > 0

    async def get_task_instance_by_id(
        self, task_instance_id: str
    ) -> TaskInstance | None:
        """Get a task instance by its ID."""
        db = await get_db()

        cursor = await db.execute(
            """
            SELECT id, task_set_instance_id, task_definition_id, status,
                   assignee_type, assignee_id, assigned_at, assigned_by,
                   started_at, completed_at, output_node_id, notes
            FROM task_instances
            WHERE id = ?
            """,
            (task_instance_id,),
        )
        row = await cursor.fetchone()

        if row is None:
            return None

        from app.models.task import AssigneeType
        assignment = None
        if row["assignee_type"]:
            assignment = TaskAssignment(
                assignee_type=AssigneeType(row["assignee_type"]),
                assignee_id=row["assignee_id"],
                assigned_at=row["assigned_at"],
                assigned_by=row["assigned_by"],
            )

        return TaskInstance(
            id=row["id"],
            task_set_instance_id=row["task_set_instance_id"],
            task_definition_id=row["task_definition_id"],
            status=TaskStatus(row["status"]),
            assignment=assignment,
            started_at=row["started_at"],
            completed_at=row["completed_at"],
            output_node_id=row["output_node_id"],
            notes=row["notes"],
        )


# Type hints for forward references
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.context_pack import ContextPack
    from app.models.external_reference import (
        ExternalReference,
        ExternalReferenceCreate,
        NodeExternalRef,
        NodeExternalRefWithDetails,
        Projection,
        ProjectionCreate,
        Snapshot,
        SnapshotCreate,
    )

# Global instance
graph_store = GraphStore()
