"""Scenario generation for coherent workflow data.

This module generates rich narrative scenarios that define coherent
groups of nodes and their relationships, rather than random data.
"""

import json
import logging
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

from app.llm.client import LLMClient
from app.models import WorkflowDefinition

logger = logging.getLogger(__name__)


@dataclass
class ScenarioNode:
    """A node defined within a scenario."""

    temp_id: str
    node_type: str
    title: str
    description: str  # Rich context for generating this node's content
    key_properties: dict[str, Any] = field(default_factory=dict)
    status: str | None = None


@dataclass
class ScenarioEdge:
    """A relationship defined within a scenario."""

    from_temp_id: str
    to_temp_id: str
    edge_type: str
    rationale: str  # Why this connection exists


@dataclass
class Scenario:
    """A coherent mini-story within the workflow."""

    theme: str
    narrative: str  # 2-3 sentence story
    nodes: list[ScenarioNode] = field(default_factory=list)
    edges: list[ScenarioEdge] = field(default_factory=list)


# System prompt for scenario generation
SCENARIO_SYSTEM_PROMPT = """You are a domain expert generating realistic workflow scenarios.
Your scenarios should feel like real projects that professionals would create.

Guidelines:
- Create diverse, realistic scenarios that tell coherent stories
- Use domain-appropriate terminology and values
- Each scenario should have a clear theme or research question
- Nodes within a scenario should be logically connected
- Include specific, realistic details (IDs, measurements, findings)
- Vary the scale and complexity across scenarios
- Make sure node types and edge types match the workflow schema exactly

Return valid JSON only."""


class ScenarioGenerator:
    """Generates coherent scenarios for workflow data seeding."""

    def __init__(self, llm_client: LLMClient):
        """Initialize the generator.

        Args:
            llm_client: Claude client for scenario generation
        """
        self.llm_client = llm_client

    async def generate_scenarios(
        self,
        definition: WorkflowDefinition,
        num_scenarios: int,
        nodes_per_scenario: tuple[int, int] = (4, 8),
        on_progress: Callable[[int, int], Awaitable[None]] | None = None,
    ) -> list[Scenario]:
        """Generate coherent scenarios for a workflow.

        Args:
            definition: The workflow definition
            num_scenarios: Number of scenarios to generate
            nodes_per_scenario: Min/max nodes per scenario
            on_progress: Optional async callback (current_batch, total_batches)

        Returns:
            List of generated scenarios
        """
        # Generate in batches of 2 to avoid token limit issues
        batch_size = 2
        all_scenarios: list[Scenario] = []
        total_batches = (num_scenarios + batch_size - 1) // batch_size

        for batch_start in range(0, num_scenarios, batch_size):
            batch_num = batch_start // batch_size + 1
            batch_count = min(batch_size, num_scenarios - batch_start)

            prompt = self._build_scenario_prompt(
                definition, batch_count, nodes_per_scenario
            )

            try:
                result = await self.llm_client.generate_json(
                    prompt=prompt,
                    system=SCENARIO_SYSTEM_PROMPT,
                    max_tokens=8000,
                    temperature=0.9,
                )

                for s in result.get("scenarios", []):
                    scenario = self._parse_scenario(s, definition)
                    if scenario:
                        all_scenarios.append(scenario)

                logger.info(
                    f"Generated batch {batch_num}: "
                    f"{len(result.get('scenarios', []))} scenarios"
                )

                # Report progress after each batch
                if on_progress:
                    await on_progress(batch_num, total_batches)

            except Exception as e:
                logger.error(f"Failed to generate scenario batch: {e}")
                # Continue with other batches even if one fails
                continue

        logger.info(
            f"Generated {len(all_scenarios)} total scenarios for {definition.name}"
        )
        return all_scenarios

    def _build_scenario_prompt(
        self,
        definition: WorkflowDefinition,
        num_scenarios: int,
        nodes_per_scenario: tuple[int, int],
    ) -> str:
        """Build the prompt for scenario generation."""
        # Summarize node types
        node_types_info = []
        for nt in definition.node_types:
            fields_summary = [f"{f.key} ({f.kind.value})" for f in nt.fields[:5]]
            states = nt.states.values if nt.states and nt.states.enabled else []
            node_types_info.append({
                "type": nt.type,
                "display_name": nt.display_name,
                "fields": fields_summary,
                "states": states,
            })

        # Summarize edge types
        edge_types_info = [
            {"type": et.type, "from": et.from_type, "to": et.to_type}
            for et in definition.edge_types
        ]

        min_nodes, max_nodes = nodes_per_scenario

        return f"""Generate {num_scenarios} diverse, realistic scenarios for this workflow.

Workflow: {definition.name}

Workflow description: {definition.description}

Available node types:
{json.dumps(node_types_info, indent=2)}

Available edge types (relationships):
{json.dumps(edge_types_info, indent=2)}

Requirements for each scenario:
1. A clear theme or research question
2. {min_nodes}-{max_nodes} interconnected nodes that tell a coherent story
3. Explicit relationships using the available edge types
4. Domain-appropriate titles, IDs, and terminology
5. Realistic status distribution (mix of in-progress and completed)
6. Specific details that reference other nodes in the scenario

Return JSON in this exact format:
{{
  "scenarios": [
    {{
      "theme": "Short theme description",
      "narrative": "2-3 sentence story explaining the scenario",
      "nodes": [
        {{
          "temp_id": "node_1",
          "node_type": "Sample",
          "title": "Specific descriptive title",
          "description": "Rich context for this node's purpose and findings",
          "status": "Complete",
          "key_properties": {{
            "sample_id": "TI-2024-117",
            "author": "Dr. Sarah Chen"
          }}
        }}
      ],
      "edges": [
        {{
          "from_temp_id": "node_1",
          "to_temp_id": "node_2",
          "edge_type": "HAS_ANALYSIS",
          "rationale": "TGA analysis of the titanium sample"
        }}
      ]
    }}
  ]
}}

Generate exactly {num_scenarios} scenarios with diverse themes."""

    def _parse_scenario(
        self, data: dict[str, Any], definition: WorkflowDefinition
    ) -> Scenario | None:
        """Parse a scenario from JSON data."""
        try:
            # Parse nodes
            nodes = []
            valid_node_types = {nt.type for nt in definition.node_types}

            for n in data.get("nodes", []):
                node_type = n.get("node_type", "")
                if node_type not in valid_node_types:
                    logger.warning(f"Skipping invalid node type: {node_type}")
                    continue

                nodes.append(ScenarioNode(
                    temp_id=n.get("temp_id", f"temp_{uuid.uuid4().hex[:8]}"),
                    node_type=node_type,
                    title=n.get("title", "Untitled"),
                    description=n.get("description", ""),
                    status=n.get("status"),
                    key_properties=n.get("key_properties", {}),
                ))

            # Parse edges
            edges = []
            valid_edge_types = {et.type for et in definition.edge_types}
            node_ids = {n.temp_id for n in nodes}

            for e in data.get("edges", []):
                edge_type = e.get("edge_type", "")
                from_id = e.get("from_temp_id", "")
                to_id = e.get("to_temp_id", "")

                if edge_type not in valid_edge_types:
                    logger.warning(f"Skipping invalid edge type: {edge_type}")
                    continue

                if from_id not in node_ids or to_id not in node_ids:
                    logger.warning(f"Skipping edge with invalid node refs: {from_id} -> {to_id}")
                    continue

                edges.append(ScenarioEdge(
                    from_temp_id=from_id,
                    to_temp_id=to_id,
                    edge_type=edge_type,
                    rationale=e.get("rationale", ""),
                ))

            return Scenario(
                theme=data.get("theme", ""),
                narrative=data.get("narrative", ""),
                nodes=nodes,
                edges=edges,
            )

        except Exception as e:
            logger.error(f"Failed to parse scenario: {e}")
            return None
