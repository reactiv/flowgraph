"""Schema-aware data generator for workflows using scenario-driven generation.

This module generates realistic, coherent workflow data by:
1. Using Claude to generate rich narrative scenarios
2. Expanding scenarios into nodes with Gemini Flash
3. Creating meaningful edges based on scenario structure
4. Generating context-aware summaries that reference connected nodes
"""

import json
import logging
import random
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, TypedDict

from app.db.graph_store import GraphStore
from app.llm.client import LLMClient, get_client
from app.llm.gemini_client import GeminiClient, get_gemini_client
from app.llm.scenario_generator import Scenario, ScenarioGenerator, ScenarioNode
from app.models import EdgeCreate, NodeCreate, NodeType, WorkflowDefinition


class SeedProgress(TypedDict):
    """Progress update during seeding."""

    phase: str  # "scenarios" | "expanding" | "summaries" | "saving" | "complete"
    current: int  # Current batch/item number
    total: int  # Total batches/items
    message: str  # Human-readable progress message


# Type alias for progress callback
ProgressCallback = Callable[[SeedProgress], Awaitable[None]]

logger = logging.getLogger(__name__)


@dataclass
class SeedConfig:
    """Configuration for data seeding."""

    scale: str = "small"  # small, medium, large

    @property
    def num_scenarios(self) -> int:
        """Get number of scenarios based on scale."""
        return {"small": 3, "medium": 6, "large": 12}[self.scale]

    @property
    def nodes_per_scenario(self) -> tuple[int, int]:
        """Get min/max nodes per scenario based on scale."""
        return {"small": (3, 6), "medium": (5, 10), "large": (8, 15)}[self.scale]


@dataclass
class GeneratedNode:
    """Temporarily holds generated node data before DB insertion."""

    temp_id: str
    node_type: str
    title: str
    status: str
    properties: dict[str, Any]
    scenario_context: str = ""  # Rich context from scenario
    db_id: str | None = None


@dataclass
class GeneratedEdge:
    """Temporarily holds generated edge data."""

    edge_type: str
    from_temp_id: str
    to_temp_id: str
    rationale: str = ""  # Why this edge exists
    properties: dict[str, Any] = field(default_factory=dict)


# Person names for realistic data
PERSON_NAMES = [
    "Dr. Alice Chen",
    "Bob Martinez",
    "Dr. Carol Johnson",
    "David Kim",
    "Emma Wilson",
    "Dr. Frank Garcia",
    "Grace Lee",
    "Henry Brown",
    "Dr. Ivy Patel",
    "Jack Thompson",
    "Karen Davis",
    "Dr. Leo Nguyen",
]


class DataGenerator:
    """Generates realistic workflow data using scenario-driven generation."""

    def __init__(
        self,
        graph_store: GraphStore,
        llm_client: LLMClient | None = None,
        gemini_client: GeminiClient | None = None,
    ):
        """Initialize the generator.

        Args:
            graph_store: GraphStore instance for database operations
            llm_client: Claude client for scenario generation
            gemini_client: Gemini client for fast content generation

        Raises:
            ValueError: If no ANTHROPIC_API_KEY is set and no client provided.
        """
        self.graph_store = graph_store
        self._llm_client = llm_client or get_client()
        self._gemini_client = gemini_client or get_gemini_client()
        self._scenario_generator = ScenarioGenerator(self._llm_client)

    @property
    def llm_client(self) -> LLMClient:
        """Get the Claude LLM client."""
        return self._llm_client

    @property
    def gemini_client(self) -> GeminiClient | None:
        """Get the Gemini client (may be None if not configured)."""
        return self._gemini_client

    async def seed_workflow(
        self,
        workflow_id: str,
        definition: WorkflowDefinition,
        config: SeedConfig,
        on_progress: ProgressCallback | None = None,
    ) -> dict[str, Any]:
        """Seed a workflow with realistic demo data.

        Args:
            workflow_id: The workflow ID to seed
            definition: The workflow definition (schema)
            config: Seeding configuration
            on_progress: Optional async callback for progress updates

        Returns:
            Summary of generated data
        """
        logger.info(f"Seeding workflow {workflow_id} with scale={config.scale}")

        async def report_progress(progress: SeedProgress) -> None:
            """Report progress if callback is provided."""
            if on_progress:
                await on_progress(progress)

        # Phase 1: Generate scenarios using Claude
        total_batches = (config.num_scenarios + 1) // 2  # batch size is 2

        async def scenario_progress(current: int, total: int) -> None:
            await report_progress({
                "phase": "scenarios",
                "current": current,
                "total": total,
                "message": f"Generating scenarios ({current}/{total})...",
            })

        await report_progress({
            "phase": "scenarios",
            "current": 0,
            "total": total_batches,
            "message": "Starting scenario generation...",
        })

        scenarios = await self._scenario_generator.generate_scenarios(
            definition,
            num_scenarios=config.num_scenarios,
            nodes_per_scenario=config.nodes_per_scenario,
            on_progress=scenario_progress,
        )

        # Phase 2: Expand scenarios into nodes and edges
        await report_progress({
            "phase": "expanding",
            "current": 1,
            "total": 1,
            "message": "Expanding scenarios into nodes...",
        })
        nodes, edges = await self._expand_scenarios(scenarios, definition)

        # Phase 3: Generate rich content with relationship context
        total_summary_batches = (len(nodes) + 9) // 10  # batch size is 10
        await report_progress({
            "phase": "summaries",
            "current": 0,
            "total": total_summary_batches,
            "message": "Generating content summaries...",
        })
        nodes = await self._populate_with_context(
            nodes, edges, definition, on_progress=on_progress
        )

        # Phase 4: Insert into database
        await report_progress({
            "phase": "saving",
            "current": 1,
            "total": 1,
            "message": "Saving to database...",
        })
        node_count, edge_count = await self._insert_into_db(
            workflow_id, nodes, edges
        )

        return {
            "workflow_id": workflow_id,
            "scale": config.scale,
            "scenarios_generated": len(scenarios),
            "nodes_created": node_count,
            "edges_created": edge_count,
        }

    async def _expand_scenarios(
        self, scenarios: list[Scenario], definition: WorkflowDefinition
    ) -> tuple[list[GeneratedNode], list[GeneratedEdge]]:
        """Expand scenarios into full nodes and edges."""
        all_nodes: list[GeneratedNode] = []
        all_edges: list[GeneratedEdge] = []
        base_date = datetime.now() - timedelta(days=90)

        for scenario_idx, scenario in enumerate(scenarios):
            # Build mapping from scenario temp_ids to globally unique temp_ids
            # This prevents collisions when LLM reuses temp_ids like "node_1" across scenarios
            temp_id_map: dict[str, str] = {}
            for node in scenario.nodes:
                unique_temp_id = f"s{scenario_idx}_{node.temp_id}"
                temp_id_map[node.temp_id] = unique_temp_id

            # Create nodes from scenario
            for node in scenario.nodes:
                type_def = self._get_node_type(definition, node.node_type)
                if type_def is None:
                    continue

                # Generate properties from scenario context and type definition
                properties = await self._generate_node_properties(
                    node, type_def, definition, scenario, base_date, scenario_idx
                )

                # Determine status
                status = node.status or self._generate_status(type_def)

                all_nodes.append(GeneratedNode(
                    temp_id=temp_id_map[node.temp_id],
                    node_type=node.node_type,
                    title=node.title,
                    status=status,
                    properties=properties,
                    scenario_context=node.description,
                ))

            # Create edges from scenario using mapped temp_ids
            for edge in scenario.edges:
                from_temp_id = temp_id_map.get(edge.from_temp_id)
                to_temp_id = temp_id_map.get(edge.to_temp_id)
                if from_temp_id and to_temp_id:
                    all_edges.append(GeneratedEdge(
                        edge_type=edge.edge_type,
                        from_temp_id=from_temp_id,
                        to_temp_id=to_temp_id,
                        rationale=edge.rationale,
                    ))

        # Add cross-scenario connections (tags if they exist)
        tag_edges = self._generate_tag_edges(all_nodes, definition)
        all_edges.extend(tag_edges)

        return all_nodes, all_edges

    async def _generate_node_properties(
        self,
        scenario_node: ScenarioNode,
        type_def: NodeType,
        definition: WorkflowDefinition,
        scenario: Scenario,
        base_date: datetime,
        scenario_idx: int,
    ) -> dict[str, Any]:
        """Generate properties for a node based on its scenario context."""
        properties: dict[str, Any] = {}

        # Start with properties from scenario
        properties.update(scenario_node.key_properties)

        # Fill in remaining fields based on type definition
        for field_def in type_def.fields:
            key = field_def.key
            kind = field_def.kind.value

            # Skip if already provided by scenario
            if key in properties:
                continue

            # Generate value based on field kind
            if kind == "string":
                if "id" in key.lower():
                    prefix = type_def.type.upper()[:3]
                    properties[key] = f"{prefix}-{scenario_idx:02d}-{uuid.uuid4().hex[:4].upper()}"
                elif "summary" in key.lower() or "description" in key.lower():
                    properties[key] = None  # Will be filled with context-aware content
                elif "name" in key.lower() or "title" in key.lower():
                    properties[key] = scenario_node.title
                else:
                    properties[key] = f"{key.replace('_', ' ').title()}"

            elif kind == "number":
                if "count" in key.lower():
                    properties[key] = random.randint(1, 100)
                elif "percent" in key.lower() or "score" in key.lower():
                    properties[key] = round(random.uniform(0.7, 0.99), 3)
                else:
                    properties[key] = round(random.uniform(1.0, 100.0), 2)

            elif kind == "datetime":
                offset = timedelta(days=scenario_idx * random.randint(2, 5))
                properties[key] = (base_date + offset).isoformat()

            elif kind == "enum":
                if field_def.values:
                    properties[key] = random.choice(field_def.values)

            elif kind == "person":
                properties[key] = random.choice(PERSON_NAMES)

            elif kind == "json":
                # Generate contextual JSON based on the field name
                properties[key] = self._generate_json_property(key, scenario_node)

            elif kind == "tag[]":
                properties[key] = []  # Tags handled via edges

            elif kind == "file[]":
                properties[key] = []

        return properties

    def _generate_json_property(
        self, field_key: str, scenario_node: ScenarioNode
    ) -> dict[str, Any]:
        """Generate a JSON property based on field name and context."""
        key_lower = field_key.lower()

        if "parameter" in key_lower or "config" in key_lower:
            return {
                "generated": True,
                "context": scenario_node.description[:100] if scenario_node.description else "",
            }
        elif "result" in key_lower or "finding" in key_lower:
            return {
                "status": "completed",
                "notes": scenario_node.description[:200] if scenario_node.description else "",
            }
        elif "detail" in key_lower:
            return {"info": scenario_node.description[:150] if scenario_node.description else ""}
        else:
            return {"data": True}

    def _get_node_type(
        self, definition: WorkflowDefinition, type_name: str
    ) -> NodeType | None:
        """Get a node type definition by name."""
        for nt in definition.node_types:
            if nt.type == type_name:
                return nt
        return None

    def _generate_status(self, type_def: NodeType) -> str:
        """Generate a status for a node based on its state machine."""
        if type_def.states and type_def.states.enabled:
            values = type_def.states.values
            if len(values) >= 3:
                # Weighted: fewer at start, more in middle/end
                weights = [0.1] + [0.35] * (len(values) - 2) + [0.2]
                weights = weights[: len(values)]
                total = sum(weights)
                weights = [w / total for w in weights]
                return random.choices(values, weights=weights)[0]
            return random.choice(values)
        return "Active"

    def _generate_tag_edges(
        self, nodes: list[GeneratedNode], definition: WorkflowDefinition
    ) -> list[GeneratedEdge]:
        """Generate tag edges to connect nodes to shared tags."""
        edges = []

        # Find tag-related edge types
        tag_edge_types = [
            et for et in definition.edge_types
            if "tag" in et.type.lower()
        ]

        if not tag_edge_types:
            return edges

        # Find Tag nodes
        tag_nodes = [n for n in nodes if n.node_type == "Tag"]
        if not tag_nodes:
            return edges

        # Connect non-tag nodes to random tags
        non_tag_nodes = [n for n in nodes if n.node_type != "Tag"]

        for node in non_tag_nodes:
            # Find applicable tag edge type for this node type
            applicable_edges = [
                et for et in tag_edge_types
                if et.from_type == node.node_type
            ]

            if not applicable_edges:
                continue

            edge_type = applicable_edges[0]
            num_tags = random.randint(1, min(3, len(tag_nodes)))
            selected_tags = random.sample(tag_nodes, num_tags)

            for tag in selected_tags:
                edges.append(GeneratedEdge(
                    edge_type=edge_type.type,
                    from_temp_id=node.temp_id,
                    to_temp_id=tag.temp_id,
                    rationale="Thematic tagging",
                ))

        return edges

    async def _populate_with_context(
        self,
        nodes: list[GeneratedNode],
        edges: list[GeneratedEdge],
        definition: WorkflowDefinition,
        on_progress: ProgressCallback | None = None,
    ) -> list[GeneratedNode]:
        """Generate summaries and descriptions with full relationship context."""
        # Build neighbor map
        neighbors = self._build_neighbor_map(nodes, edges)

        # Group nodes by type for batch processing
        nodes_by_type: dict[str, list[GeneratedNode]] = {}
        for node in nodes:
            if node.node_type not in nodes_by_type:
                nodes_by_type[node.node_type] = []
            nodes_by_type[node.node_type].append(node)

        # Count total nodes needing summaries for progress tracking
        total_nodes_needing_summaries = 0
        for type_name, type_nodes in nodes_by_type.items():
            type_def = self._get_node_type(definition, type_name)
            if type_def is None or type_name == "Tag":
                continue
            summary_fields = [
                f for f in type_def.fields
                if "summary" in f.key.lower() or "description" in f.key.lower()
            ]
            if summary_fields:
                total_nodes_needing_summaries += len(type_nodes)

        batch_size = 10
        total_batches = (total_nodes_needing_summaries + batch_size - 1) // batch_size
        current_batch = 0

        # Process each type
        for type_name, type_nodes in nodes_by_type.items():
            type_def = self._get_node_type(definition, type_name)
            if type_def is None or type_name == "Tag":
                continue

            # Check if this type has summary/description fields
            summary_fields = [
                f for f in type_def.fields
                if "summary" in f.key.lower() or "description" in f.key.lower()
            ]

            if summary_fields:
                # Process in batches for this type
                for i in range(0, len(type_nodes), batch_size):
                    batch = type_nodes[i : i + batch_size]
                    await self._generate_contextual_summaries_batch(
                        batch, neighbors, definition, summary_fields[0].key
                    )
                    current_batch += 1

                    # Report progress
                    if on_progress:
                        await on_progress({
                            "phase": "summaries",
                            "current": current_batch,
                            "total": total_batches,
                            "message": f"Generating summaries ({current_batch}/{total_batches})...",
                        })

        return nodes

    def _build_neighbor_map(
        self, nodes: list[GeneratedNode], edges: list[GeneratedEdge]
    ) -> dict[str, list[GeneratedNode]]:
        """Build a map of node temp_id to connected nodes."""
        node_map = {n.temp_id: n for n in nodes}
        neighbors: dict[str, list[GeneratedNode]] = {}

        for node in nodes:
            neighbors[node.temp_id] = []

        for edge in edges:
            if edge.from_temp_id in node_map and edge.to_temp_id in node_map:
                # Add bidirectional neighbors
                neighbors[edge.from_temp_id].append(node_map[edge.to_temp_id])
                neighbors[edge.to_temp_id].append(node_map[edge.from_temp_id])

        return neighbors

    async def _generate_contextual_summaries_batch(
        self,
        batch: list[GeneratedNode],
        neighbors: dict[str, list[GeneratedNode]],
        definition: WorkflowDefinition,
        summary_field: str,
    ) -> None:
        """Generate summaries for a single batch of nodes."""
        # Use Gemini if available, otherwise Claude
        use_gemini = self._gemini_client is not None

        # Build context for each node
        batch_contexts = []
        for node in batch:
            connected = neighbors.get(node.temp_id, [])
            connected_info = [
                f"- {n.title} ({n.node_type})" for n in connected[:5]
            ]

            batch_contexts.append({
                "title": node.title,
                "type": node.node_type,
                "status": node.status,
                "scenario_context": node.scenario_context,
                "connected_nodes": connected_info,
            })

        prompt = f"""Generate realistic summaries for these {len(batch)} workflow items.

Each summary should:
- Be 2-4 sentences
- Reference at least one connected node by name when available
- Use domain-appropriate technical language
- Sound like real professional documentation
- Be specific to the item's context

Items to summarize:
{json.dumps(batch_contexts, indent=2)}

Return JSON:
{{"summaries": ["summary for item 1", "summary for item 2", ...]}}

Generate exactly {len(batch)} summaries."""

        try:
            system_prompt = (
                "You are generating realistic workflow documentation. "
                "Create professional, technical summaries that reference connected items."
            )

            if use_gemini and self._gemini_client is not None:
                result = await self._gemini_client.generate_json(
                    prompt=prompt,
                    system=system_prompt,
                    temperature=0.8,
                )
            else:
                result = await self._llm_client.generate_json(
                    prompt=prompt,
                    system=system_prompt,
                    max_tokens=3000,
                    temperature=0.8,
                )

            summaries = result.get("summaries", [])
            for j, node in enumerate(batch):
                if j < len(summaries):
                    node.properties[summary_field] = summaries[j]

        except Exception as e:
            logger.warning(f"Failed to generate summaries for batch: {e}")

    async def _insert_into_db(
        self,
        workflow_id: str,
        nodes: list[GeneratedNode],
        edges: list[GeneratedEdge],
    ) -> tuple[int, int]:
        """Insert generated nodes and edges into the database."""
        # Create a mapping from temp_id to actual DB id
        temp_to_db: dict[str, str] = {}

        # Insert nodes
        node_count = 0
        for node in nodes:
            try:
                db_node = await self.graph_store.create_node(
                    workflow_id,
                    NodeCreate(
                        type=node.node_type,
                        title=node.title,
                        status=node.status,
                        properties=node.properties,
                    ),
                )
                temp_to_db[node.temp_id] = db_node.id
                node.db_id = db_node.id
                node_count += 1
            except Exception as e:
                logger.error(f"Failed to create node {node.temp_id}: {e}")

        # Insert edges
        edge_count = 0
        for edge in edges:
            from_id = temp_to_db.get(edge.from_temp_id)
            to_id = temp_to_db.get(edge.to_temp_id)

            if from_id and to_id:
                try:
                    await self.graph_store.create_edge(
                        workflow_id,
                        EdgeCreate(
                            type=edge.edge_type,
                            from_node_id=from_id,
                            to_node_id=to_id,
                            properties=edge.properties,
                        ),
                    )
                    edge_count += 1
                except Exception as e:
                    logger.error(f"Failed to create edge {edge.edge_type}: {e}")

        return node_count, edge_count
