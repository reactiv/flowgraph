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
    Event,
    EventCreate,
    Node,
    NodeCreate,
    NodeUpdate,
    WorkflowDefinition,
)
from app.models.workflow import (
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

        await db.execute(
            """
            INSERT INTO workflow_definitions (id, name, version, definition_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                definition.workflow_id,
                definition.name,
                1,
                definition.model_dump_json(by_alias=True),
                now,
                now,
            ),
        )
        await db.commit()

        return WorkflowSummary(
            id=definition.workflow_id,
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
            edge_filter = f"AND type IN ({placeholders})"
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
    ) -> dict[str, Any]:
        """
        Traverse the graph according to a view template configuration.

        Returns a structured response with nodes organized by level (node type).
        """
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

        # Store root nodes in result
        result["levels"][template.root_type] = {
            "nodes": [node.model_dump() for node in root_nodes],
            "edges": [],
        }

        # Track visited node IDs to avoid cycles
        visited_node_ids: set[str] = {n.id for n in root_nodes}

        # Traverse each edge configuration
        current_level_nodes = root_nodes

        for edge_config in template.edges:
            level_nodes: list[dict[str, Any]] = []
            level_edges: list[dict[str, Any]] = []

            for node in current_level_nodes:
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
                        level_edges.append(edge)

            # Store this level's nodes and edges
            if edge_config.target_type not in result["levels"]:
                result["levels"][edge_config.target_type] = {
                    "nodes": [],
                    "edges": [],
                }

            result["levels"][edge_config.target_type]["nodes"].extend(level_nodes)
            result["levels"][edge_config.target_type]["edges"].extend(level_edges)

            # Update current level for next traversal (if needed for deeper traversals)
            current_level_nodes = [
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
            root_type=view_create.root_type,
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
                # Apply partial updates
                if update.name is not None:
                    view["name"] = update.name
                if update.description is not None:
                    view["description"] = update.description
                if update.icon is not None:
                    view["icon"] = update.icon
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

    # ==================== Reset & Seed ====================

    async def reset_workflow(self, workflow_id: str) -> bool:
        """Reset a workflow by deleting all nodes, edges, and events."""
        db = await get_db()

        # Delete events
        await db.execute("DELETE FROM events WHERE workflow_id = ?", (workflow_id,))
        # Delete edges
        await db.execute("DELETE FROM edges WHERE workflow_id = ?", (workflow_id,))
        # Delete nodes
        await db.execute("DELETE FROM nodes WHERE workflow_id = ?", (workflow_id,))

        await db.commit()
        return True


# Global instance
graph_store = GraphStore()
