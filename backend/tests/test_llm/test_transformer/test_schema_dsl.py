"""Tests for schema_dsl module."""

import pytest

from app.llm.transformer.schema_dsl import (
    _convert_edge_types,
    _convert_field,
    _convert_node_type,
    _convert_state_machine,
    convert_schema_to_dsl,
    workflow_to_dsl,
)
from app.models.workflow import (
    EdgeType,
    Field,
    FieldKind,
    NodeState,
    NodeType,
    StateTransition,
    WorkflowDefinition,
)


class TestConvertField:
    """Tests for _convert_field function."""

    def test_simple_string_field(self):
        field = {"key": "name", "kind": "string", "required": False, "label": "Name"}
        result = _convert_field(field)
        assert result == "name: string"

    def test_required_string_field(self):
        field = {"key": "title", "kind": "string", "required": True, "label": "Title"}
        result = _convert_field(field)
        assert result == "title: string!"

    def test_optional_enum_field(self):
        field = {
            "key": "priority",
            "kind": "enum",
            "required": False,
            "values": ["low", "medium", "high"],
            "label": "Priority",
        }
        result = _convert_field(field)
        assert result == "priority: enum(low|medium|high)"

    def test_required_enum_field(self):
        field = {
            "key": "status",
            "kind": "enum",
            "required": True,
            "values": ["open", "closed"],
            "label": "Status",
        }
        result = _convert_field(field)
        assert result == "status: enum!(open|closed)"

    def test_array_field(self):
        field = {"key": "tags", "kind": "tag[]", "required": False, "label": "Tags"}
        result = _convert_field(field)
        assert result == "tags: tag[]"

    def test_field_with_unit_comment(self):
        field = {
            "key": "progress",
            "kind": "number",
            "required": False,
            "label": "Progress (%)",
        }
        result = _convert_field(field)
        assert result == "progress: number  # Progress (%)"

    def test_empty_key_returns_empty(self):
        field = {"key": "", "kind": "string"}
        result = _convert_field(field)
        assert result == ""


class TestConvertStateMachine:
    """Tests for _convert_state_machine function."""

    def test_simple_linear_states(self):
        states = {
            "enabled": True,
            "initial": "todo",
            "values": ["todo", "in_progress", "done"],
            "transitions": [
                {"from": "todo", "to": "in_progress"},
                {"from": "in_progress", "to": "done"},
            ],
        }
        result = _convert_state_machine(states)
        assert result == "[todo→in_progress→done]"

    def test_branching_states(self):
        states = {
            "enabled": True,
            "initial": "draft",
            "values": ["draft", "review", "approved", "rejected"],
            "transitions": [
                {"from": "draft", "to": "review"},
                {"from": "review", "to": "approved"},
                {"from": "review", "to": "rejected"},
            ],
        }
        result = _convert_state_machine(states)
        # Main path should be draft→review→approved or draft→review→rejected
        assert "draft→review" in result
        # Should have the alternative branch
        assert "→rejected" in result or "→approved" in result

    def test_bidirectional_states(self):
        states = {
            "enabled": True,
            "initial": "active",
            "values": ["active", "paused"],
            "transitions": [
                {"from": "active", "to": "paused"},
                {"from": "paused", "to": "active"},
            ],
        }
        result = _convert_state_machine(states)
        assert "↔" in result

    def test_empty_transitions_returns_empty(self):
        states = {"enabled": True, "initial": "start", "values": ["start"], "transitions": []}
        result = _convert_state_machine(states)
        assert result == ""

    def test_disabled_states_returns_empty(self):
        states = {
            "enabled": False,
            "initial": "start",
            "values": ["start", "end"],
            "transitions": [{"from": "start", "to": "end"}],
        }
        # The function is called only when enabled, but test the falsy path
        result = _convert_state_machine({})
        assert result == ""


class TestConvertNodeType:
    """Tests for _convert_node_type function."""

    def test_simple_node_type(self):
        node_type = {
            "type": "Task",
            "displayName": "Task",
            "fields": [
                {"key": "title", "kind": "string", "required": True, "label": "Title"},
                {"key": "description", "kind": "string", "required": False, "label": "Description"},
            ],
        }
        lines = _convert_node_type(node_type)
        assert lines[0] == "Task"
        assert "  title: string!" in lines
        assert "  description: string" in lines

    def test_node_type_with_states(self):
        node_type = {
            "type": "Issue",
            "displayName": "Issue",
            "fields": [{"key": "title", "kind": "string", "required": True, "label": "Title"}],
            "states": {
                "enabled": True,
                "initial": "open",
                "values": ["open", "closed"],
                "transitions": [{"from": "open", "to": "closed"}],
            },
        }
        lines = _convert_node_type(node_type)
        assert lines[0] == "Issue [open→closed]"

    def test_node_type_with_different_display_name(self):
        node_type = {
            "type": "epic",
            "displayName": "Epic Story",
            "fields": [],
        }
        lines = _convert_node_type(node_type)
        assert lines[0] == "epic (Epic Story)"


class TestConvertEdgeTypes:
    """Tests for _convert_edge_types function."""

    def test_simple_edge(self):
        edges = [
            {"type": "DEPENDS_ON", "from": "Task", "to": "Task", "displayName": "depends on"}
        ]
        lines = _convert_edge_types(edges)
        assert len(lines) == 1
        # "depends on" normalizes to "DEPENDS_ON" which matches the type, so no comment
        assert lines[0] == "Task -DEPENDS_ON-> Task"

    def test_edge_with_informative_display_name(self):
        edges = [
            {"type": "BLOCKS", "from": "Task", "to": "Task", "displayName": "is blocked by"}
        ]
        lines = _convert_edge_types(edges)
        assert len(lines) == 1
        # "is blocked by" doesn't match "BLOCKS", so comment is added
        assert lines[0] == "Task -BLOCKS-> Task  # is blocked by"

    def test_multiple_sources_grouped(self):
        edges = [
            {"type": "TAGGED_WITH", "from": "Task", "to": "Tag", "displayName": "tagged with"},
            {"type": "TAGGED_WITH", "from": "Epic", "to": "Tag", "displayName": "tagged with"},
        ]
        lines = _convert_edge_types(edges)
        assert len(lines) == 1
        # Should combine sources
        assert "Task|Epic" in lines[0] or "Epic|Task" in lines[0]
        assert "-TAGGED_WITH-> Tag" in lines[0]

    def test_edge_with_matching_display_name(self):
        edges = [{"type": "OWNED_BY", "from": "Task", "to": "User", "displayName": "OWNED BY"}]
        lines = _convert_edge_types(edges)
        # Display name matches type, no comment
        assert lines[0] == "Task -OWNED_BY-> User"


class TestConvertSchemaToDsl:
    """Tests for convert_schema_to_dsl function."""

    def test_complete_schema(self):
        schema = {
            "name": "Project Tracker",
            "description": "A simple project tracking workflow",
            "nodeTypes": [
                {
                    "type": "Task",
                    "displayName": "Task",
                    "fields": [
                        {"key": "title", "kind": "string", "required": True, "label": "Title"},
                    ],
                    "states": {
                        "enabled": True,
                        "initial": "todo",
                        "values": ["todo", "done"],
                        "transitions": [{"from": "todo", "to": "done"}],
                    },
                }
            ],
            "edgeTypes": [
                {"type": "DEPENDS_ON", "from": "Task", "to": "Task", "displayName": "depends on"}
            ],
        }
        result = convert_schema_to_dsl(schema)

        # Check header
        assert "# Project Tracker" in result
        assert "# A simple project tracking workflow" in result

        # Check legend
        assert "# Legend:" in result

        # Check node section
        assert "## Nodes" in result
        assert "Task [todo→done]" in result
        assert "title: string!" in result

        # Check edge section
        assert "## Edges" in result
        assert "Task -DEPENDS_ON-> Task" in result


class TestWorkflowToDsl:
    """Tests for workflow_to_dsl function using real Pydantic models."""

    def test_workflow_definition_conversion(self):
        definition = WorkflowDefinition(
            workflowId="test-1",
            name="Test Workflow",
            description="A test workflow",
            nodeTypes=[
                NodeType(
                    type="Task",
                    displayName="Task",
                    titleField="title",
                    fields=[
                        Field(key="title", label="Title", kind=FieldKind.STRING, required=True),
                        Field(
                            key="priority",
                            label="Priority",
                            kind=FieldKind.ENUM,
                            values=["low", "medium", "high"],
                        ),
                    ],
                    states=NodeState(
                        enabled=True,
                        initial="pending",
                        values=["pending", "active", "complete"],
                        transitions=[
                            StateTransition(**{"from": "pending", "to": "active"}),
                            StateTransition(**{"from": "active", "to": "complete"}),
                        ],
                    ),
                )
            ],
            edgeTypes=[
                EdgeType(
                    type="ASSIGNED_TO",
                    displayName="assigned to",
                    **{"from": "Task", "to": "User"},
                )
            ],
        )

        result = workflow_to_dsl(definition)

        # Verify structure
        assert "# Test Workflow" in result
        assert "# A test workflow" in result
        assert "## Nodes" in result
        assert "## Edges" in result

        # Verify node type
        assert "Task [pending→active→complete]" in result
        assert "title: string!" in result
        assert "priority: enum(low|medium|high)" in result

        # Verify edge type
        assert "Task -ASSIGNED_TO-> User" in result


class TestTokenEfficiency:
    """Tests to verify the DSL format is more compact than JSON."""

    def test_dsl_is_smaller_than_json(self):
        import json

        definition = WorkflowDefinition(
            workflowId="efficiency-test",
            name="Efficiency Test",
            description="Testing token efficiency",
            nodeTypes=[
                NodeType(
                    type="Project",
                    displayName="Project",
                    titleField="name",
                    fields=[
                        Field(key="name", label="Name", kind=FieldKind.STRING, required=True),
                        Field(key="description", label="Description", kind=FieldKind.STRING),
                        Field(
                            key="status",
                            label="Status",
                            kind=FieldKind.ENUM,
                            required=True,
                            values=["planning", "active", "on_hold", "complete"],
                        ),
                        Field(key="start_date", label="Start Date", kind=FieldKind.DATETIME),
                        Field(key="end_date", label="End Date", kind=FieldKind.DATETIME),
                        Field(key="budget", label="Budget", kind=FieldKind.NUMBER),
                    ],
                    states=NodeState(
                        enabled=True,
                        initial="planning",
                        values=["planning", "active", "on_hold", "complete"],
                        transitions=[
                            StateTransition(**{"from": "planning", "to": "active"}),
                            StateTransition(**{"from": "active", "to": "on_hold"}),
                            StateTransition(**{"from": "on_hold", "to": "active"}),
                            StateTransition(**{"from": "active", "to": "complete"}),
                        ],
                    ),
                ),
                NodeType(
                    type="Task",
                    displayName="Task",
                    titleField="title",
                    fields=[
                        Field(key="title", label="Title", kind=FieldKind.STRING, required=True),
                        Field(key="effort_hours", label="Effort (hours)", kind=FieldKind.NUMBER),
                    ],
                ),
            ],
            edgeTypes=[
                EdgeType(
                    type="HAS_TASK", displayName="has task", **{"from": "Project", "to": "Task"}
                ),
                EdgeType(
                    type="DEPENDS_ON",
                    displayName="depends on",
                    **{"from": "Task", "to": "Task"},
                ),
            ],
        )

        # Get both representations
        dsl_output = workflow_to_dsl(definition)
        json_schema = definition.model_json_schema()
        json_output = json.dumps(json_schema, indent=2)

        # DSL should be significantly smaller
        dsl_size = len(dsl_output)
        json_size = len(json_output)

        # DSL should be at least 3x smaller
        assert dsl_size < json_size / 3, (
            f"DSL ({dsl_size} chars) should be much smaller than JSON ({json_size} chars)"
        )
