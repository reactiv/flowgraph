"""Rule generator from natural language descriptions.

Converts natural language business rule descriptions into structured
Rule objects that can be enforced by the workflow engine.
"""

import logging
from typing import Any

from pydantic import ValidationError

from app.llm.client import LLMClient, get_client
from app.models import WorkflowDefinition
from app.models.workflow import Rule

logger = logging.getLogger(__name__)

RULE_GENERATION_SYSTEM = """You are a workflow rule generator for a compliance system.

Given a workflow schema and a natural language description of a business rule,
generate a Rule object that enforces the constraint.

## Rule Structure

```json
{
  "id": "unique_snake_case_id",
  "when": {
    "nodeType": "ExactNodeTypeName",
    "transitionTo": "TargetStatus"
  },
  "requireEdges": [
    {"edgeType": "EXACT_EDGE_TYPE", "minCount": 1}
  ],
  "message": "Human-readable error message explaining why this rule exists"
}
```

## Field Descriptions

- **id**: Unique identifier in snake_case (e.g., "require_approval_for_publish")
- **when.nodeType**: MUST exactly match a node type name from the schema
- **when.transitionTo**: Specific status value from states.values, or null if rule applies to any transition
- **requireEdges.edgeType**: MUST exactly match an edge type from the schema
- **requireEdges.minCount**: Minimum number of edges required (usually 1 or 2)
- **message**: Clear, actionable message shown when the rule blocks a transition

## Guidelines

1. Parse the natural language carefully to identify:
   - Which node type the rule applies to
   - Which state transition triggers the rule (if specific)
   - What relationships/edges are required

2. Map natural language to schema elements:
   - "reviews" → look for Review node type and edges like HAS_REVIEW
   - "approved/approval" → look for Approval node type or "Approved" status
   - "at least N" → minCount: N
   - "before" typically means transitionTo the mentioned state

3. Generate clear, actionable messages that:
   - Explain what is required
   - Help users understand how to satisfy the rule
   - Use natural language, not technical jargon

## Examples

Input: "Investigations must identify root causes before completion"
Output:
{
  "id": "investigation_requires_root_cause",
  "when": {"nodeType": "Investigation", "transitionTo": "Complete"},
  "requireEdges": [{"edgeType": "IDENTIFIES", "minCount": 1}],
  "message": "An Investigation must identify at least 1 Root Cause before it can be completed."
}

Input: "Documents need 2 approvals before publishing"
Output:
{
  "id": "doc_requires_dual_approval",
  "when": {"nodeType": "Document", "transitionTo": "Published"},
  "requireEdges": [{"edgeType": "HAS_APPROVAL", "minCount": 2}],
  "message": "A Document requires at least 2 approvals (dual sign-off) before it can be published."
}

## Response Format

Return ONLY valid JSON with the Rule structure. No markdown, no explanations, no code blocks.
"""


def _build_schema_context(definition: WorkflowDefinition) -> str:
    """Build schema context for rule generation."""
    lines = ["## Workflow Schema", f"Name: {definition.name}", ""]

    lines.append("### Node Types")
    for nt in definition.node_types:
        lines.append(f"\n**{nt.type}** ({nt.display_name})")
        if nt.states and nt.states.enabled:
            lines.append(f"  Status values: {nt.states.values}")
            if nt.states.transitions:
                transitions = [
                    f"{t.from_state}→{t.to_state}" for t in nt.states.transitions
                ]
                lines.append(f"  Valid transitions: {', '.join(transitions)}")

    lines.append("\n### Edge Types")
    for et in definition.edge_types:
        lines.append(f"  - {et.type}: {et.from_type} → {et.to_type}")

    if definition.rules:
        lines.append("\n### Existing Rules (for reference)")
        for rule in definition.rules:
            lines.append(f"  - {rule.id}: {rule.message}")

    return "\n".join(lines)


class RuleGenerator:
    """Generates workflow rules from natural language descriptions.

    Uses an LLM to interpret natural language rule descriptions and
    convert them into structured Rule objects that match the workflow schema.

    Example:
        generator = RuleGenerator()
        rule = await generator.generate_rule(
            "Documents need 2 reviews before approval",
            workflow_definition
        )
    """

    def __init__(self, llm_client: LLMClient | None = None):
        """Initialize the rule generator.

        Args:
            llm_client: Optional LLM client. If not provided, uses the default client.
        """
        self._llm_client = llm_client or get_client()

    async def generate_rule(
        self,
        description: str,
        workflow_definition: WorkflowDefinition,
    ) -> Rule:
        """Generate a rule from a natural language description.

        Args:
            description: Natural language description of the rule
            workflow_definition: The workflow schema

        Returns:
            Validated Rule object

        Raises:
            ValueError: If generation or validation fails after retries
        """
        schema_context = _build_schema_context(workflow_definition)

        prompt = f"""Create a workflow rule for this requirement:

"{description}"

{schema_context}

Generate a JSON Rule object using exact node types and edge types from the schema above."""

        max_attempts = 3
        last_error: str | None = None

        for attempt in range(max_attempts):
            try:
                if last_error:
                    prompt_with_error = (
                        f"{prompt}\n\n"
                        f"IMPORTANT: Your previous attempt failed with this error:\n"
                        f"{last_error}\n\n"
                        f"Please fix the issue and generate valid JSON."
                    )
                else:
                    prompt_with_error = prompt

                result = await self._llm_client.generate_json(
                    prompt=prompt_with_error,
                    system=RULE_GENERATION_SYSTEM,
                    max_tokens=1024,
                    temperature=0.1 if attempt == 0 else 0.05,
                )

                # Validate against workflow schema
                rule = self._validate_rule(result, workflow_definition)
                logger.info(f"Generated rule '{rule.id}' from description: {description}")
                return rule

            except (ValueError, ValidationError) as e:
                logger.warning(f"Rule generation attempt {attempt + 1} failed: {e}")
                last_error = str(e)
                continue

        raise ValueError(
            f"Failed to generate valid rule after {max_attempts} attempts: {last_error}"
        )

    def _validate_rule(
        self,
        rule_data: dict[str, Any],
        definition: WorkflowDefinition,
    ) -> Rule:
        """Validate rule data against the workflow schema.

        Args:
            rule_data: Raw rule data from LLM
            definition: The workflow definition to validate against

        Returns:
            Validated Rule object

        Raises:
            ValueError: If validation fails
        """
        # Get valid node types
        valid_node_types = {nt.type for nt in definition.node_types}
        when = rule_data.get("when", {})
        node_type = when.get("nodeType")

        if node_type not in valid_node_types:
            raise ValueError(
                f"Invalid nodeType '{node_type}'. Must be one of: {valid_node_types}"
            )

        # Validate transition target if specified
        transition_to = when.get("transitionTo")
        if transition_to:
            node_type_def = next(
                (nt for nt in definition.node_types if nt.type == node_type), None
            )
            if node_type_def and node_type_def.states:
                if transition_to not in node_type_def.states.values:
                    raise ValueError(
                        f"Invalid transitionTo '{transition_to}'. "
                        f"Must be one of: {node_type_def.states.values}"
                    )

        # Validate edge types
        valid_edges = {et.type for et in definition.edge_types}
        for req in rule_data.get("requireEdges", []):
            edge_type = req.get("edgeType")
            if edge_type not in valid_edges:
                raise ValueError(
                    f"Invalid edgeType '{edge_type}'. Must be one of: {valid_edges}"
                )

        # Build and return validated Rule
        return Rule.model_validate(rule_data)
