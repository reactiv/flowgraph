"""Schema-aware data generator for workflows using Claude."""

import logging
import random
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

from app.db.graph_store import GraphStore
from app.llm.client import LLMClient, get_client
from app.models import WorkflowDefinition, NodeCreate, EdgeCreate, NodeType, EdgeType

logger = logging.getLogger(__name__)


@dataclass
class SeedConfig:
    """Configuration for data seeding."""

    scale: str = "small"  # small, medium, large

    @property
    def node_counts(self) -> dict[str, tuple[int, int]]:
        """Get min/max node counts per type based on scale."""
        if self.scale == "small":
            return {"default": (3, 8), "secondary": (5, 15), "tertiary": (2, 5)}
        elif self.scale == "medium":
            return {"default": (10, 25), "secondary": (20, 50), "tertiary": (5, 15)}
        else:  # large
            return {"default": (30, 60), "secondary": (50, 120), "tertiary": (15, 40)}


@dataclass
class GeneratedNode:
    """Temporarily holds generated node data before DB insertion."""

    temp_id: str
    node_type: str
    title: str
    status: str
    properties: dict[str, Any]
    db_id: str | None = None


@dataclass
class GeneratedEdge:
    """Temporarily holds generated edge data."""

    edge_type: str
    from_temp_id: str
    to_temp_id: str
    properties: dict[str, Any] = field(default_factory=dict)


# Person names for realistic data
PERSON_NAMES = [
    "Alice Chen",
    "Bob Martinez",
    "Carol Johnson",
    "David Kim",
    "Emma Wilson",
    "Frank Garcia",
    "Grace Lee",
    "Henry Brown",
    "Ivy Patel",
    "Jack Thompson",
    "Karen Davis",
    "Leo Nguyen",
]


class DataGenerator:
    """Generates realistic workflow data using Claude."""

    def __init__(
        self, graph_store: GraphStore, llm_client: LLMClient | None = None
    ):
        """Initialize the generator.

        Args:
            graph_store: GraphStore instance for database operations
            llm_client: Optional LLM client. If None, will create one (requires API key).

        Raises:
            ValueError: If no ANTHROPIC_API_KEY is set and no client provided.
        """
        self.graph_store = graph_store
        self._llm_client = llm_client or get_client()

    @property
    def llm_client(self) -> LLMClient:
        """Get the LLM client."""
        return self._llm_client

    async def seed_workflow(
        self, workflow_id: str, definition: WorkflowDefinition, config: SeedConfig
    ) -> dict[str, Any]:
        """Seed a workflow with realistic demo data.

        Args:
            workflow_id: The workflow ID to seed
            definition: The workflow definition (schema)
            config: Seeding configuration

        Returns:
            Summary of generated data
        """
        logger.info(f"Seeding workflow {workflow_id} with scale={config.scale}")

        # Phase 1: Generate graph structure
        nodes, edges = await self._generate_graph_structure(definition, config)

        # Phase 2: Generate field values (with LLM if available)
        nodes = await self._populate_field_values(nodes, definition)

        # Phase 3: Insert into database
        node_count, edge_count = await self._insert_into_db(
            workflow_id, nodes, edges
        )

        return {
            "workflow_id": workflow_id,
            "scale": config.scale,
            "nodes_created": node_count,
            "edges_created": edge_count,
        }

    async def _generate_graph_structure(
        self, definition: WorkflowDefinition, config: SeedConfig
    ) -> tuple[list[GeneratedNode], list[GeneratedEdge]]:
        """Generate the graph structure (nodes and edges).

        Creates a coherent graph based on the schema's node types and edge types.
        """
        nodes: list[GeneratedNode] = []
        edges: list[GeneratedEdge] = []
        nodes_by_type: dict[str, list[GeneratedNode]] = {}

        # Categorize node types by their role in the graph
        primary_types, secondary_types, tertiary_types = self._categorize_node_types(
            definition
        )

        counts = config.node_counts

        # Generate primary nodes first (roots)
        for node_type in primary_types:
            type_def = self._get_node_type(definition, node_type)
            if type_def is None:
                continue

            count = random.randint(*counts["default"])
            type_nodes = self._generate_nodes_of_type(type_def, count)
            nodes.extend(type_nodes)
            nodes_by_type[node_type] = type_nodes

        # Generate secondary nodes (linked to primary)
        for node_type in secondary_types:
            type_def = self._get_node_type(definition, node_type)
            if type_def is None:
                continue

            count = random.randint(*counts["secondary"])
            type_nodes = self._generate_nodes_of_type(type_def, count)
            nodes.extend(type_nodes)
            nodes_by_type[node_type] = type_nodes

        # Generate tertiary nodes (tags, configs, etc.)
        for node_type in tertiary_types:
            type_def = self._get_node_type(definition, node_type)
            if type_def is None:
                continue

            count = random.randint(*counts["tertiary"])
            type_nodes = self._generate_nodes_of_type(type_def, count)
            nodes.extend(type_nodes)
            nodes_by_type[node_type] = type_nodes

        # Generate edges based on edge types
        for edge_type in definition.edge_types:
            type_edges = self._generate_edges_for_type(
                edge_type, nodes_by_type, definition
            )
            edges.extend(type_edges)

        return nodes, edges

    def _categorize_node_types(
        self, definition: WorkflowDefinition
    ) -> tuple[list[str], list[str], list[str]]:
        """Categorize node types into primary, secondary, tertiary.

        Primary: Root entities (usually have outgoing edges but few incoming)
        Secondary: Main linked entities
        Tertiary: Supporting entities (tags, configs, etc.)
        """
        primary = []
        secondary = []
        tertiary = ["Tag"]  # Tags are always tertiary

        # Count incoming/outgoing edge types for each node type
        outgoing_count: dict[str, int] = {}
        incoming_count: dict[str, int] = {}

        for nt in definition.node_types:
            outgoing_count[nt.type] = 0
            incoming_count[nt.type] = 0

        for et in definition.edge_types:
            outgoing_count[et.from_type] = outgoing_count.get(et.from_type, 0) + 1
            incoming_count[et.to_type] = incoming_count.get(et.to_type, 0) + 1

        for nt in definition.node_types:
            if nt.type in tertiary:
                continue

            # Check if it's a supporting type
            if nt.type in ["InstrumentConfig", "FamilyTree", "Config"]:
                tertiary.append(nt.type)
            elif outgoing_count.get(nt.type, 0) > incoming_count.get(nt.type, 0):
                primary.append(nt.type)
            else:
                secondary.append(nt.type)

        # Ensure we have at least one primary type
        if not primary and secondary:
            primary.append(secondary.pop(0))

        return primary, secondary, tertiary

    def _get_node_type(
        self, definition: WorkflowDefinition, type_name: str
    ) -> NodeType | None:
        """Get a node type definition by name."""
        for nt in definition.node_types:
            if nt.type == type_name:
                return nt
        return None

    def _generate_nodes_of_type(
        self, type_def: NodeType, count: int
    ) -> list[GeneratedNode]:
        """Generate nodes of a specific type."""
        nodes = []
        base_date = datetime.now() - timedelta(days=90)

        for i in range(count):
            temp_id = f"temp_{type_def.type}_{i}_{uuid.uuid4().hex[:8]}"

            # Generate initial title
            title = self._generate_title(type_def, i)

            # Determine status
            status = self._generate_status(type_def)

            # Generate basic properties
            properties = self._generate_basic_properties(type_def, i, base_date)

            nodes.append(
                GeneratedNode(
                    temp_id=temp_id,
                    node_type=type_def.type,
                    title=title,
                    status=status,
                    properties=properties,
                )
            )

        return nodes

    def _generate_title(self, type_def: NodeType, index: int) -> str:
        """Generate a title for a node."""
        type_name = type_def.type
        prefixes = {
            "Sample": ["Sample", "Batch", "Specimen"],
            "Analysis": ["Analysis", "Test", "Measurement"],
            "Hypothesis": ["Hypothesis", "Theory", "Prediction"],
            "Tag": ["tag"],
            "Dataset": ["Dataset", "Data"],
            "Model": ["Model", "Surrogate"],
            "Experiment": ["Experiment", "Trial"],
            "Goal": ["Goal", "Objective"],
            "Nonconformance": ["NC", "Issue"],
            "Investigation": ["Investigation", "Inquiry"],
            "BioSample": ["BioSample", "Specimen"],
        }

        prefix = random.choice(prefixes.get(type_name, [type_name]))
        suffix = f"{index + 1:03d}"

        return f"{prefix}-{suffix}"

    def _generate_status(self, type_def: NodeType) -> str:
        """Generate a status for a node based on its state machine."""
        if type_def.states and type_def.states.enabled:
            # Weighted distribution: more nodes in middle/complete states
            values = type_def.states.values
            if len(values) >= 3:
                weights = [0.15] + [0.3] * (len(values) - 2) + [0.25]
                # Normalize weights
                total = sum(weights[: len(values)])
                weights = [w / total for w in weights[: len(values)]]
                return random.choices(values, weights=weights)[0]
            return random.choice(values)
        return "Active"

    def _generate_basic_properties(
        self, type_def: NodeType, index: int, base_date: datetime
    ) -> dict[str, Any]:
        """Generate basic properties for a node based on field definitions."""
        properties: dict[str, Any] = {}

        for field_def in type_def.fields:
            key = field_def.key
            kind = field_def.kind.value

            # Generate value based on field kind
            if kind == "string":
                if "id" in key.lower():
                    properties[key] = f"{type_def.type.upper()[:3]}-{index + 1:04d}"
                elif "summary" in key.lower() or "description" in key.lower():
                    properties[key] = None  # Will be filled by LLM
                elif "name" in key.lower() or "title" in key.lower():
                    properties[key] = self._generate_title(type_def, index)
                else:
                    properties[key] = f"{key.replace('_', ' ').title()} {index + 1}"

            elif kind == "number":
                if "count" in key.lower():
                    properties[key] = random.randint(1, 100)
                elif "percent" in key.lower() or "score" in key.lower():
                    properties[key] = round(random.uniform(0.5, 1.0), 3)
                else:
                    properties[key] = round(random.uniform(0.1, 100.0), 2)

            elif kind == "datetime":
                # Generate dates in sequence
                offset = timedelta(days=index * random.randint(1, 3))
                properties[key] = (base_date + offset).isoformat()

            elif kind == "enum":
                if field_def.values:
                    properties[key] = random.choice(field_def.values)

            elif kind == "person":
                properties[key] = random.choice(PERSON_NAMES)

            elif kind == "json":
                # Generate placeholder JSON - could be enhanced
                properties[key] = {"generated": True, "index": index}

            elif kind == "tag[]":
                properties[key] = []  # Will be populated via edges

            elif kind == "file[]":
                properties[key] = []  # Could add placeholder file metadata

        return properties

    def _generate_edges_for_type(
        self,
        edge_type: EdgeType,
        nodes_by_type: dict[str, list[GeneratedNode]],
        definition: WorkflowDefinition,
    ) -> list[GeneratedEdge]:
        """Generate edges of a specific type."""
        edges = []

        from_nodes = nodes_by_type.get(edge_type.from_type, [])
        to_nodes = nodes_by_type.get(edge_type.to_type, [])

        if not from_nodes or not to_nodes:
            return edges

        # Different linking strategies based on edge semantics
        edge_name = edge_type.type.lower()

        if "tagged" in edge_name or "tag" in edge_name:
            # Tags: each node gets 1-3 random tags
            for from_node in from_nodes:
                num_tags = random.randint(1, min(3, len(to_nodes)))
                selected_tags = random.sample(to_nodes, num_tags)
                for tag_node in selected_tags:
                    edges.append(
                        GeneratedEdge(
                            edge_type=edge_type.type,
                            from_temp_id=from_node.temp_id,
                            to_temp_id=tag_node.temp_id,
                        )
                    )

        elif "parent" in edge_name or "child" in edge_name:
            # Hierarchical: create tree structure
            if len(from_nodes) > 1:
                for i, node in enumerate(from_nodes[1:], 1):
                    parent_idx = random.randint(0, min(i - 1, len(from_nodes) - 1))
                    if parent_idx < len(to_nodes):
                        edges.append(
                            GeneratedEdge(
                                edge_type=edge_type.type,
                                from_temp_id=from_nodes[parent_idx].temp_id,
                                to_temp_id=node.temp_id,
                            )
                        )

        else:
            # Default: create semi-random links
            # Each "from" node links to 1-3 "to" nodes
            for from_node in from_nodes:
                num_links = random.randint(1, min(3, len(to_nodes)))
                selected_to = random.sample(to_nodes, num_links)
                for to_node in selected_to:
                    # Avoid self-loops
                    if from_node.temp_id != to_node.temp_id:
                        edges.append(
                            GeneratedEdge(
                                edge_type=edge_type.type,
                                from_temp_id=from_node.temp_id,
                                to_temp_id=to_node.temp_id,
                            )
                        )

        return edges

    async def _populate_field_values(
        self, nodes: list[GeneratedNode], definition: WorkflowDefinition
    ) -> list[GeneratedNode]:
        """Populate field values using LLM for summaries."""
        # Group nodes by type for batch processing
        nodes_by_type: dict[str, list[GeneratedNode]] = {}
        for node in nodes:
            if node.node_type not in nodes_by_type:
                nodes_by_type[node.node_type] = []
            nodes_by_type[node.node_type].append(node)

        # Generate summaries/descriptions for each type
        for type_name, type_nodes in nodes_by_type.items():
            type_def = self._get_node_type(definition, type_name)
            if type_def is None:
                continue

            # Check if this type has summary/description fields
            summary_fields = [
                f for f in type_def.fields
                if "summary" in f.key.lower() or "description" in f.key.lower()
            ]

            if summary_fields and len(type_nodes) > 0:
                await self._generate_summaries_with_llm(
                    type_nodes, type_def, summary_fields[0].key, definition
                )

        return nodes

    async def _generate_summaries_with_llm(
        self,
        nodes: list[GeneratedNode],
        type_def: NodeType,
        summary_field: str,
        definition: WorkflowDefinition,
    ) -> None:
        """Use LLM to generate summaries for nodes."""
        if not self.llm_client or len(nodes) == 0:
            return

        # Batch nodes for efficiency (max 10 at a time)
        batch_size = 10

        for i in range(0, len(nodes), batch_size):
            batch = nodes[i : i + batch_size]

            prompt = self._build_summary_prompt(batch, type_def, definition)

            try:
                result = await self.llm_client.generate_json(
                    prompt=prompt,
                    system=(
                        "You are a data generator for a workflow management system. "
                        "Generate realistic, domain-appropriate summaries for workflow nodes. "
                        "Return valid JSON only."
                    ),
                    max_tokens=2000,
                    temperature=0.8,
                )

                summaries = result.get("summaries", [])
                for j, node in enumerate(batch):
                    if j < len(summaries):
                        node.properties[summary_field] = summaries[j]

            except Exception as e:
                logger.warning(f"Failed to generate summaries for batch: {e}")

    def _build_summary_prompt(
        self,
        nodes: list[GeneratedNode],
        type_def: NodeType,
        definition: WorkflowDefinition,
    ) -> str:
        """Build a prompt for generating summaries."""
        node_info = []
        for node in nodes:
            info = {
                "title": node.title,
                "status": node.status,
                "type": node.node_type,
            }
            # Add relevant properties
            for key in ["author", "sample_type", "analysis_type", "category"]:
                if key in node.properties:
                    info[key] = node.properties[key]
            node_info.append(info)

        return f"""Generate brief, realistic summaries for the following {type_def.display_name} items in a {definition.name} workflow.

Each summary should be 1-2 sentences describing the item's purpose or findings.

Items to summarize:
{node_info}

Return JSON in this exact format:
{{"summaries": ["summary for item 1", "summary for item 2", ...]}}

Generate {len(nodes)} summaries in the array, one for each item in order."""

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
