"""Tests for seed data validators."""

import pytest

from app.llm.transformer.seed_models import SeedData, SeedEdge, SeedNode
from app.llm.transformer.seed_validators import (
    create_seed_data_validator,
    validate_edge_connectivity,
    validate_edge_types,
    validate_enum_values,
    validate_node_types,
    validate_property_keys,
    validate_required_fields,
    validate_status_values,
    validate_temp_id_references,
)
from app.models.workflow import (
    EdgeType,
    Field,
    FieldKind,
    NodeState,
    NodeType,
    WorkflowDefinition,
)


@pytest.fixture
def sample_definition() -> WorkflowDefinition:
    """Create a sample workflow definition for testing."""
    return WorkflowDefinition(
        workflow_id="test-workflow",
        name="Test Workflow",
        description="A test workflow definition",
        node_types=[
            NodeType(
                type="task",
                display_name="Task",
                title_field="name",
                fields=[
                    Field(key="name", label="Name", kind=FieldKind.STRING, required=True),
                    Field(key="description", label="Description", kind=FieldKind.STRING),
                    Field(
                        key="priority",
                        label="Priority",
                        kind=FieldKind.ENUM,
                        values=["low", "medium", "high"],
                    ),
                ],
                states=NodeState(
                    enabled=True,
                    initial="todo",
                    values=["todo", "in_progress", "done"],
                ),
            ),
            NodeType(
                type="person",
                display_name="Person",
                title_field="name",
                fields=[
                    Field(key="name", label="Name", kind=FieldKind.STRING, required=True),
                    Field(key="email", label="Email", kind=FieldKind.STRING),
                ],
            ),
        ],
        edge_types=[
            EdgeType(
                type="assigned_to",
                display_name="Assigned To",
                from_type="task",
                to_type="person",
            ),
            EdgeType(
                type="depends_on",
                display_name="Depends On",
                from_type="task",
                to_type="task",
            ),
        ],
    )


class TestValidateNodeTypes:
    """Tests for validate_node_types."""

    def test_valid_node_types(self, sample_definition: WorkflowDefinition):
        """Test validation passes for valid node types."""
        seed_data = SeedData(
            nodes=[
                SeedNode(temp_id="task_1", node_type="task", title="Task 1"),
                SeedNode(temp_id="person_1", node_type="person", title="Person 1"),
            ],
            edges=[],
        )

        errors = validate_node_types(seed_data, sample_definition)
        assert errors == []

    def test_invalid_node_type(self, sample_definition: WorkflowDefinition):
        """Test validation fails for invalid node type."""
        seed_data = SeedData(
            nodes=[
                SeedNode(temp_id="task_1", node_type="task", title="Task 1"),
                SeedNode(temp_id="bug_1", node_type="bug", title="Bug 1"),  # Invalid
            ],
            edges=[],
        )

        errors = validate_node_types(seed_data, sample_definition)
        assert len(errors) == 1
        assert errors[0].code == "invalid_node_type"
        assert "bug" in errors[0].message
        assert errors[0].path == "nodes[1].node_type"

    def test_multiple_invalid_node_types(self, sample_definition: WorkflowDefinition):
        """Test validation reports multiple errors."""
        seed_data = SeedData(
            nodes=[
                SeedNode(temp_id="bug_1", node_type="bug", title="Bug 1"),
                SeedNode(temp_id="feature_1", node_type="feature", title="Feature 1"),
            ],
            edges=[],
        )

        errors = validate_node_types(seed_data, sample_definition)
        assert len(errors) == 2


class TestValidateEdgeTypes:
    """Tests for validate_edge_types."""

    def test_valid_edge_types(self, sample_definition: WorkflowDefinition):
        """Test validation passes for valid edge types."""
        seed_data = SeedData(
            nodes=[
                SeedNode(temp_id="task_1", node_type="task", title="Task 1"),
                SeedNode(temp_id="person_1", node_type="person", title="Person 1"),
            ],
            edges=[
                SeedEdge(
                    edge_type="assigned_to",
                    from_temp_id="task_1",
                    to_temp_id="person_1",
                ),
            ],
        )

        errors = validate_edge_types(seed_data, sample_definition)
        assert errors == []

    def test_invalid_edge_type(self, sample_definition: WorkflowDefinition):
        """Test validation fails for invalid edge type."""
        seed_data = SeedData(
            nodes=[
                SeedNode(temp_id="task_1", node_type="task", title="Task 1"),
                SeedNode(temp_id="person_1", node_type="person", title="Person 1"),
            ],
            edges=[
                SeedEdge(
                    edge_type="created_by",  # Invalid
                    from_temp_id="task_1",
                    to_temp_id="person_1",
                ),
            ],
        )

        errors = validate_edge_types(seed_data, sample_definition)
        assert len(errors) == 1
        assert errors[0].code == "invalid_edge_type"
        assert "created_by" in errors[0].message


class TestValidateEdgeConnectivity:
    """Tests for validate_edge_connectivity."""

    def test_valid_connectivity(self, sample_definition: WorkflowDefinition):
        """Test validation passes for valid edge connectivity."""
        seed_data = SeedData(
            nodes=[
                SeedNode(temp_id="task_1", node_type="task", title="Task 1"),
                SeedNode(temp_id="person_1", node_type="person", title="Person 1"),
            ],
            edges=[
                SeedEdge(
                    edge_type="assigned_to",
                    from_temp_id="task_1",
                    to_temp_id="person_1",
                ),
            ],
        )

        errors = validate_edge_connectivity(seed_data, sample_definition)
        assert errors == []

    def test_invalid_from_type(self, sample_definition: WorkflowDefinition):
        """Test validation fails when from_type doesn't match."""
        seed_data = SeedData(
            nodes=[
                SeedNode(temp_id="person_1", node_type="person", title="Person 1"),
                SeedNode(temp_id="person_2", node_type="person", title="Person 2"),
            ],
            edges=[
                SeedEdge(
                    edge_type="assigned_to",  # requires from=task
                    from_temp_id="person_1",  # but this is a person
                    to_temp_id="person_2",
                ),
            ],
        )

        errors = validate_edge_connectivity(seed_data, sample_definition)
        assert len(errors) >= 1
        assert any(e.code == "invalid_edge_connectivity" for e in errors)
        assert any("from_node type 'task'" in e.message for e in errors)

    def test_invalid_to_type(self, sample_definition: WorkflowDefinition):
        """Test validation fails when to_type doesn't match."""
        seed_data = SeedData(
            nodes=[
                SeedNode(temp_id="task_1", node_type="task", title="Task 1"),
                SeedNode(temp_id="task_2", node_type="task", title="Task 2"),
            ],
            edges=[
                SeedEdge(
                    edge_type="assigned_to",  # requires to=person
                    from_temp_id="task_1",
                    to_temp_id="task_2",  # but this is a task
                ),
            ],
        )

        errors = validate_edge_connectivity(seed_data, sample_definition)
        assert len(errors) >= 1
        assert any(e.code == "invalid_edge_connectivity" for e in errors)
        assert any("to_node type 'person'" in e.message for e in errors)


class TestValidateTempIdReferences:
    """Tests for validate_temp_id_references."""

    def test_valid_references(self, sample_definition: WorkflowDefinition):
        """Test validation passes for valid temp_id references."""
        seed_data = SeedData(
            nodes=[
                SeedNode(temp_id="task_1", node_type="task", title="Task 1"),
                SeedNode(temp_id="person_1", node_type="person", title="Person 1"),
            ],
            edges=[
                SeedEdge(
                    edge_type="assigned_to",
                    from_temp_id="task_1",
                    to_temp_id="person_1",
                ),
            ],
        )

        errors = validate_temp_id_references(seed_data)
        assert errors == []

    def test_invalid_from_temp_id(self):
        """Test validation fails for invalid from_temp_id."""
        seed_data = SeedData(
            nodes=[
                SeedNode(temp_id="task_1", node_type="task", title="Task 1"),
            ],
            edges=[
                SeedEdge(
                    edge_type="assigned_to",
                    from_temp_id="task_99",  # doesn't exist
                    to_temp_id="task_1",
                ),
            ],
        )

        errors = validate_temp_id_references(seed_data)
        assert len(errors) == 1
        assert errors[0].code == "invalid_temp_id_reference"
        assert "from_temp_id" in errors[0].path
        assert "task_99" in errors[0].message

    def test_invalid_to_temp_id(self):
        """Test validation fails for invalid to_temp_id."""
        seed_data = SeedData(
            nodes=[
                SeedNode(temp_id="task_1", node_type="task", title="Task 1"),
            ],
            edges=[
                SeedEdge(
                    edge_type="assigned_to",
                    from_temp_id="task_1",
                    to_temp_id="person_99",  # doesn't exist
                ),
            ],
        )

        errors = validate_temp_id_references(seed_data)
        assert len(errors) == 1
        assert errors[0].code == "invalid_temp_id_reference"
        assert "to_temp_id" in errors[0].path

    def test_both_invalid(self):
        """Test validation reports both invalid references."""
        seed_data = SeedData(
            nodes=[],
            edges=[
                SeedEdge(
                    edge_type="assigned_to",
                    from_temp_id="task_99",
                    to_temp_id="person_99",
                ),
            ],
        )

        errors = validate_temp_id_references(seed_data)
        assert len(errors) == 2


class TestValidateRequiredFields:
    """Tests for validate_required_fields."""

    def test_valid_required_fields(self, sample_definition: WorkflowDefinition):
        """Test validation passes when required fields are present."""
        seed_data = SeedData(
            nodes=[
                SeedNode(
                    temp_id="task_1",
                    node_type="task",
                    title="Task 1",
                    properties={"name": "Task One"},
                ),
            ],
            edges=[],
        )

        errors = validate_required_fields(seed_data, sample_definition)
        assert errors == []

    def test_missing_required_field(self, sample_definition: WorkflowDefinition):
        """Test validation fails when required field is missing."""
        seed_data = SeedData(
            nodes=[
                SeedNode(
                    temp_id="task_1",
                    node_type="task",
                    title="Task 1",
                    properties={},  # missing 'name'
                ),
            ],
            edges=[],
        )

        errors = validate_required_fields(seed_data, sample_definition)
        assert len(errors) == 1
        assert errors[0].code == "missing_required_field"
        assert "name" in errors[0].message

    def test_required_field_null(self, sample_definition: WorkflowDefinition):
        """Test validation fails when required field is None."""
        seed_data = SeedData(
            nodes=[
                SeedNode(
                    temp_id="task_1",
                    node_type="task",
                    title="Task 1",
                    properties={"name": None},
                ),
            ],
            edges=[],
        )

        errors = validate_required_fields(seed_data, sample_definition)
        assert len(errors) == 1
        assert errors[0].code == "missing_required_field"


class TestValidateEnumValues:
    """Tests for validate_enum_values."""

    def test_valid_enum_value(self, sample_definition: WorkflowDefinition):
        """Test validation passes for valid enum value."""
        seed_data = SeedData(
            nodes=[
                SeedNode(
                    temp_id="task_1",
                    node_type="task",
                    title="Task 1",
                    properties={"priority": "high"},
                ),
            ],
            edges=[],
        )

        errors = validate_enum_values(seed_data, sample_definition)
        assert errors == []

    def test_invalid_enum_value(self, sample_definition: WorkflowDefinition):
        """Test validation fails for invalid enum value."""
        seed_data = SeedData(
            nodes=[
                SeedNode(
                    temp_id="task_1",
                    node_type="task",
                    title="Task 1",
                    properties={"priority": "critical"},  # not in values
                ),
            ],
            edges=[],
        )

        errors = validate_enum_values(seed_data, sample_definition)
        assert len(errors) == 1
        assert errors[0].code == "invalid_enum_value"
        assert "critical" in errors[0].message
        assert "priority" in errors[0].path

    def test_enum_field_missing_is_ok(self, sample_definition: WorkflowDefinition):
        """Test that missing enum field doesn't cause error."""
        seed_data = SeedData(
            nodes=[
                SeedNode(
                    temp_id="task_1",
                    node_type="task",
                    title="Task 1",
                    properties={},  # priority not set
                ),
            ],
            edges=[],
        )

        errors = validate_enum_values(seed_data, sample_definition)
        assert errors == []


class TestValidateStatusValues:
    """Tests for validate_status_values."""

    def test_valid_status(self, sample_definition: WorkflowDefinition):
        """Test validation passes for valid status."""
        seed_data = SeedData(
            nodes=[
                SeedNode(
                    temp_id="task_1",
                    node_type="task",
                    title="Task 1",
                    status="in_progress",
                ),
            ],
            edges=[],
        )

        errors = validate_status_values(seed_data, sample_definition)
        assert errors == []

    def test_invalid_status(self, sample_definition: WorkflowDefinition):
        """Test validation fails for invalid status."""
        seed_data = SeedData(
            nodes=[
                SeedNode(
                    temp_id="task_1",
                    node_type="task",
                    title="Task 1",
                    status="blocked",  # not a valid status
                ),
            ],
            edges=[],
        )

        errors = validate_status_values(seed_data, sample_definition)
        assert len(errors) == 1
        assert errors[0].code == "invalid_status"
        assert "blocked" in errors[0].message

    def test_null_status_ok_when_states_enabled(self, sample_definition: WorkflowDefinition):
        """Test that None status is allowed (will use default)."""
        seed_data = SeedData(
            nodes=[
                SeedNode(
                    temp_id="task_1",
                    node_type="task",
                    title="Task 1",
                    status=None,  # will use default
                ),
            ],
            edges=[],
        )

        errors = validate_status_values(seed_data, sample_definition)
        assert errors == []

    def test_status_on_stateless_node_type(self, sample_definition: WorkflowDefinition):
        """Test validation fails when status is set on node type without states."""
        seed_data = SeedData(
            nodes=[
                SeedNode(
                    temp_id="person_1",
                    node_type="person",  # person doesn't have states
                    title="Person 1",
                    status="active",  # but we're setting a status
                ),
            ],
            edges=[],
        )

        errors = validate_status_values(seed_data, sample_definition)
        assert len(errors) == 1
        assert errors[0].code == "invalid_status"
        assert "does not have states enabled" in errors[0].message


class TestValidatePropertyKeys:
    """Tests for validate_property_keys."""

    def test_valid_property_keys(self, sample_definition: WorkflowDefinition):
        """Test validation passes for valid property keys."""
        seed_data = SeedData(
            nodes=[
                SeedNode(
                    temp_id="task_1",
                    node_type="task",
                    title="Task 1",
                    properties={"name": "Task One", "description": "A task"},
                ),
            ],
            edges=[],
        )

        errors = validate_property_keys(seed_data, sample_definition)
        assert errors == []

    def test_unknown_property_key(self, sample_definition: WorkflowDefinition):
        """Test validation fails for unknown property key."""
        seed_data = SeedData(
            nodes=[
                SeedNode(
                    temp_id="task_1",
                    node_type="task",
                    title="Task 1",
                    properties={"name": "Task One", "assignee": "John"},  # assignee invalid
                ),
            ],
            edges=[],
        )

        errors = validate_property_keys(seed_data, sample_definition)
        assert len(errors) == 1
        assert errors[0].code == "unknown_property_key"
        assert "assignee" in errors[0].message


class TestCreateSeedDataValidator:
    """Tests for create_seed_data_validator."""

    def test_composite_validator_valid_data(self, sample_definition: WorkflowDefinition):
        """Test composite validator passes for valid data."""
        seed_data = SeedData(
            nodes=[
                SeedNode(
                    temp_id="task_1",
                    node_type="task",
                    title="Task 1",
                    status="todo",
                    properties={"name": "Task One", "priority": "high"},
                ),
                SeedNode(
                    temp_id="person_1",
                    node_type="person",
                    title="Person 1",
                    properties={"name": "John"},
                ),
            ],
            edges=[
                SeedEdge(
                    edge_type="assigned_to",
                    from_temp_id="task_1",
                    to_temp_id="person_1",
                ),
            ],
        )

        validator = create_seed_data_validator(sample_definition)
        errors = validator(seed_data)
        assert errors == []

    def test_composite_validator_aggregates_errors(
        self, sample_definition: WorkflowDefinition
    ):
        """Test composite validator aggregates errors from multiple validators."""
        seed_data = SeedData(
            nodes=[
                SeedNode(
                    temp_id="bug_1",
                    node_type="bug",  # invalid node type
                    title="Bug 1",
                    properties={"severity": "high"},  # unknown property
                ),
            ],
            edges=[
                SeedEdge(
                    edge_type="created_by",  # invalid edge type
                    from_temp_id="bug_1",
                    to_temp_id="user_99",  # invalid temp_id
                ),
            ],
        )

        validator = create_seed_data_validator(sample_definition)
        errors = validator(seed_data)

        # Should have multiple types of errors
        error_codes = {e.code for e in errors}
        assert "invalid_node_type" in error_codes
        assert "invalid_edge_type" in error_codes
        assert "invalid_temp_id_reference" in error_codes

    def test_composite_validator_respects_max_errors(
        self, sample_definition: WorkflowDefinition
    ):
        """Test composite validator stops at max_errors."""
        # Create seed data with many errors
        nodes = [
            SeedNode(
                temp_id=f"bug_{i}",
                node_type="bug",  # all invalid
                title=f"Bug {i}",
            )
            for i in range(50)
        ]

        seed_data = SeedData(nodes=nodes, edges=[])

        validator = create_seed_data_validator(sample_definition, max_errors=5)
        errors = validator(seed_data)
        assert len(errors) == 5
