"""Rule engine for workflow compliance enforcement.

Evaluates business rules against node state transitions to ensure
compliance with workflow constraints.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from pydantic import BaseModel, Field

from app.models import Node
from app.models.workflow import Rule, WorkflowDefinition

if TYPE_CHECKING:
    from app.db.graph_store import GraphStore


class MissingEdge(BaseModel):
    """Details about a missing edge requirement."""

    edge_type: str = Field(alias="edgeType")
    required: int
    actual: int

    model_config = {"populate_by_name": True}


class RuleViolation(BaseModel):
    """Details of a rule violation."""

    rule_id: str = Field(alias="ruleId")
    message: str
    missing_edges: list[MissingEdge] = Field(default=[], alias="missingEdges")

    model_config = {"populate_by_name": True}


class RuleEvaluationResult(BaseModel):
    """Result of rule evaluation for a transition."""

    allowed: bool
    violations: list[RuleViolation] = []


class RuleEngine:
    """Evaluates workflow rules against node transitions.

    The rule engine checks if a proposed status transition is allowed
    based on the rules defined in the workflow definition. Rules can
    require that certain edges exist before a transition is permitted.

    Example:
        engine = RuleEngine(graph_store, workflow_id)
        result = await engine.validate_transition(node, "Approved", workflow)
        if not result.allowed:
            # Handle violations
            for v in result.violations:
                print(f"Rule {v.rule_id}: {v.message}")
    """

    def __init__(self, graph_store: GraphStore, workflow_id: str):
        """Initialize the rule engine.

        Args:
            graph_store: The graph store for querying edges
            workflow_id: The workflow ID for edge queries
        """
        self._graph_store = graph_store
        self._workflow_id = workflow_id

    async def validate_transition(
        self,
        node: Node,
        target_status: str,
        workflow: WorkflowDefinition,
    ) -> RuleEvaluationResult:
        """Validate that a status transition is allowed by all rules.

        Args:
            node: The node being updated
            target_status: The status being transitioned to
            workflow: The workflow definition containing rules

        Returns:
            RuleEvaluationResult with allowed=True if valid, or violations if not
        """
        # Find applicable rules for this node type and target status
        applicable_rules = self._find_applicable_rules(
            node.type, target_status, workflow.rules
        )

        if not applicable_rules:
            return RuleEvaluationResult(allowed=True)

        # Get node's edges for checking requirements
        neighbors = await self._graph_store.get_neighbors(
            self._workflow_id, node.id
        )

        # Count edges by type
        edge_counts = self._count_edges_by_type(neighbors)

        # Check each rule
        violations = []
        for rule in applicable_rules:
            violation = self._check_rule(rule, edge_counts)
            if violation:
                violations.append(violation)

        return RuleEvaluationResult(
            allowed=len(violations) == 0,
            violations=violations,
        )

    def _find_applicable_rules(
        self,
        node_type: str,
        target_status: str,
        rules: list[Rule],
    ) -> list[Rule]:
        """Find rules that apply to this transition.

        A rule applies if:
        - Its when.nodeType matches the node's type
        - Its when.transitionTo is None (applies to all transitions) OR
          matches the target status

        Args:
            node_type: The type of node being transitioned
            target_status: The status being transitioned to
            rules: All rules in the workflow

        Returns:
            List of applicable rules
        """
        return [
            rule
            for rule in rules
            if rule.when.node_type == node_type
            and (
                rule.when.transition_to is None
                or rule.when.transition_to == target_status
            )
        ]

    def _count_edges_by_type(self, neighbors: dict) -> dict[str, int]:
        """Count edges by type from neighbor data.

        Args:
            neighbors: The neighbors data from GraphStore.get_neighbors()

        Returns:
            Dictionary mapping edge type to count
        """
        edge_counts: dict[str, int] = {}

        for item in neighbors.get("outgoing", []):
            edge_type = item["edge"]["type"]
            edge_counts[edge_type] = edge_counts.get(edge_type, 0) + 1

        for item in neighbors.get("incoming", []):
            edge_type = item["edge"]["type"]
            edge_counts[edge_type] = edge_counts.get(edge_type, 0) + 1

        return edge_counts

    def _check_rule(
        self,
        rule: Rule,
        edge_counts: dict[str, int],
    ) -> RuleViolation | None:
        """Check if a specific rule is satisfied.

        Args:
            rule: The rule to check
            edge_counts: Current edge counts by type

        Returns:
            RuleViolation if rule is violated, None if satisfied
        """
        missing_edges = []

        for req in rule.require_edges:
            actual_count = edge_counts.get(req.edge_type, 0)
            if actual_count < req.min_count:
                missing_edges.append(
                    MissingEdge(
                        edgeType=req.edge_type,
                        required=req.min_count,
                        actual=actual_count,
                    )
                )

        if missing_edges:
            return RuleViolation(
                ruleId=rule.id,
                message=rule.message,
                missingEdges=missing_edges,
            )

        return None
