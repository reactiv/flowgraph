"""Tests for seed data validators."""

import pytest

from app.llm.transformer.seed_models import SeedData, SeedEdge, SeedNode
from app.llm.transformer.seed_validators import (
    _find_similar_temp_id,
    _levenshtein_distance,
    create_seed_data_validator,
    validate_array_fields,
    validate_datetime_fields,
    validate_edge_connectivity,
    validate_edge_types,
    validate_enum_values,
    validate_no_duplicate_edges,
    validate_no_self_loops,
    validate_node_types,
    validate_number_fields,
    validate_property_keys,
    validate_required_fields,
    validate_status_values,
    validate_temp_id_references,
    validate_unique_fields,
    validate_unique_temp_ids,
    warn_empty_seed_data,
    warn_low_edge_density,
    warn_orphan_nodes,
)
from app.llm.transformer.validator import ValidationSeverity
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


# ==================== Tests for New Validators ====================


class TestLevenshteinDistance:
    """Tests for _levenshtein_distance helper."""

    def test_identical_strings(self):
        """Test distance is 0 for identical strings."""
        assert _levenshtein_distance("hello", "hello") == 0

    def test_single_character_difference(self):
        """Test distance is 1 for single character difference."""
        assert _levenshtein_distance("hello", "hallo") == 1
        assert _levenshtein_distance("task_1", "task_2") == 1

    def test_missing_underscore(self):
        """Test distance for common typo pattern - missing underscore."""
        assert _levenshtein_distance("task_1", "task1") == 1
        assert _levenshtein_distance("author_1", "author1") == 1

    def test_hyphen_vs_underscore(self):
        """Test distance for hyphen vs underscore."""
        assert _levenshtein_distance("task-1", "task_1") == 1

    def test_empty_string(self):
        """Test distance with empty string."""
        assert _levenshtein_distance("", "hello") == 5
        assert _levenshtein_distance("hello", "") == 5


class TestFindSimilarTempId:
    """Tests for _find_similar_temp_id helper."""

    def test_finds_similar_with_typo(self):
        """Test finding similar temp_id when there's a typo."""
        valid_ids = {"task_1", "task_2", "person_1"}
        assert _find_similar_temp_id("task1", valid_ids) == "task_1"
        assert _find_similar_temp_id("task-1", valid_ids) == "task_1"

    def test_returns_none_when_no_similar(self):
        """Test returns None when no similar temp_id exists."""
        valid_ids = {"task_1", "task_2"}
        assert _find_similar_temp_id("person_99", valid_ids) is None

    def test_respects_max_distance(self):
        """Test respects max_distance parameter."""
        valid_ids = {"task_1"}
        # "taaask_1" has distance 2 (2 extra 'a's) from "task_1"
        # "taaaask_1" has distance 3 (3 extra 'a's) from "task_1"
        assert _find_similar_temp_id("taaask_1", valid_ids, max_distance=1) is None
        assert _find_similar_temp_id("taaask_1", valid_ids, max_distance=2) == "task_1"
        assert _find_similar_temp_id("taaaask_1", valid_ids, max_distance=2) is None
        assert _find_similar_temp_id("taaaask_1", valid_ids, max_distance=3) == "task_1"


class TestValidateUniqueTempIds:
    """Tests for validate_unique_temp_ids."""

    def test_unique_temp_ids(self):
        """Test validation passes for unique temp_ids."""
        seed_data = SeedData(
            nodes=[
                SeedNode(temp_id="task_1", node_type="task", title="Task 1"),
                SeedNode(temp_id="task_2", node_type="task", title="Task 2"),
            ],
            edges=[],
        )

        errors = validate_unique_temp_ids(seed_data)
        assert errors == []

    def test_duplicate_temp_ids(self):
        """Test validation fails for duplicate temp_ids."""
        seed_data = SeedData(
            nodes=[
                SeedNode(temp_id="task_1", node_type="task", title="Task 1"),
                SeedNode(temp_id="task_1", node_type="task", title="Task 2"),  # Duplicate
            ],
            edges=[],
        )

        errors = validate_unique_temp_ids(seed_data)
        assert len(errors) == 1
        assert errors[0].code == "duplicate_temp_id"
        assert "task_1" in errors[0].message
        assert errors[0].path == "nodes[1].temp_id"


class TestValidateNoSelfLoops:
    """Tests for validate_no_self_loops."""

    def test_no_self_loops(self):
        """Test validation passes when no self-loops exist."""
        seed_data = SeedData(
            nodes=[
                SeedNode(temp_id="task_1", node_type="task", title="Task 1"),
                SeedNode(temp_id="task_2", node_type="task", title="Task 2"),
            ],
            edges=[
                SeedEdge(edge_type="depends_on", from_temp_id="task_1", to_temp_id="task_2"),
            ],
        )

        errors = validate_no_self_loops(seed_data)
        assert errors == []

    def test_self_loop_detected(self):
        """Test validation fails for self-referential edge."""
        seed_data = SeedData(
            nodes=[
                SeedNode(temp_id="task_1", node_type="task", title="Task 1"),
            ],
            edges=[
                SeedEdge(edge_type="depends_on", from_temp_id="task_1", to_temp_id="task_1"),
            ],
        )

        errors = validate_no_self_loops(seed_data)
        assert len(errors) == 1
        assert errors[0].code == "self_loop_edge"
        assert "task_1" in errors[0].message


class TestValidateNoDuplicateEdges:
    """Tests for validate_no_duplicate_edges."""

    def test_no_duplicate_edges(self):
        """Test validation passes when no duplicate edges exist."""
        seed_data = SeedData(
            nodes=[
                SeedNode(temp_id="task_1", node_type="task", title="Task 1"),
                SeedNode(temp_id="task_2", node_type="task", title="Task 2"),
            ],
            edges=[
                SeedEdge(edge_type="depends_on", from_temp_id="task_1", to_temp_id="task_2"),
            ],
        )

        errors = validate_no_duplicate_edges(seed_data)
        assert errors == []

    def test_duplicate_edge_detected(self):
        """Test validation fails for duplicate edges."""
        seed_data = SeedData(
            nodes=[
                SeedNode(temp_id="task_1", node_type="task", title="Task 1"),
                SeedNode(temp_id="task_2", node_type="task", title="Task 2"),
            ],
            edges=[
                SeedEdge(edge_type="depends_on", from_temp_id="task_1", to_temp_id="task_2"),
                SeedEdge(edge_type="depends_on", from_temp_id="task_1", to_temp_id="task_2"),
            ],
        )

        errors = validate_no_duplicate_edges(seed_data)
        assert len(errors) == 1
        assert errors[0].code == "duplicate_edge"

    def test_different_edge_types_allowed(self):
        """Test that same nodes can have different edge types."""
        seed_data = SeedData(
            nodes=[
                SeedNode(temp_id="task_1", node_type="task", title="Task 1"),
                SeedNode(temp_id="person_1", node_type="person", title="Person 1"),
            ],
            edges=[
                SeedEdge(edge_type="assigned_to", from_temp_id="task_1", to_temp_id="person_1"),
                SeedEdge(edge_type="created_by", from_temp_id="task_1", to_temp_id="person_1"),
            ],
        )

        errors = validate_no_duplicate_edges(seed_data)
        assert errors == []


class TestValidateTempIdTypoDetection:
    """Tests for temp_id typo detection in validate_temp_id_references."""

    def test_suggests_correction_for_typo(self):
        """Test error message suggests correction when typo detected."""
        seed_data = SeedData(
            nodes=[
                SeedNode(temp_id="task_1", node_type="task", title="Task 1"),
            ],
            edges=[
                SeedEdge(
                    edge_type="depends_on",
                    from_temp_id="task1",  # Missing underscore
                    to_temp_id="task_1",
                ),
            ],
        )

        errors = validate_temp_id_references(seed_data)
        assert len(errors) == 1
        assert "Did you mean 'task_1'" in errors[0].message
        assert errors[0].context.get("suggested_correction") == "task_1"

    def test_no_suggestion_when_no_similar(self):
        """Test no suggestion when there's no similar temp_id."""
        seed_data = SeedData(
            nodes=[
                SeedNode(temp_id="task_1", node_type="task", title="Task 1"),
            ],
            edges=[
                SeedEdge(
                    edge_type="depends_on",
                    from_temp_id="completely_different_id",
                    to_temp_id="task_1",
                ),
            ],
        )

        errors = validate_temp_id_references(seed_data)
        assert len(errors) == 1
        assert "Did you mean" not in errors[0].message
        assert errors[0].context.get("suggested_correction") is None


@pytest.fixture
def extended_definition() -> WorkflowDefinition:
    """Create an extended workflow definition with all field types for testing."""
    return WorkflowDefinition(
        workflow_id="test-extended",
        name="Extended Test Workflow",
        description="A test workflow with all field types",
        node_types=[
            NodeType(
                type="event",
                display_name="Event",
                title_field="name",
                fields=[
                    Field(key="name", label="Name", kind=FieldKind.STRING, required=True),
                    Field(key="start_time", label="Start Time", kind=FieldKind.DATETIME),
                    Field(key="end_time", label="End Time", kind=FieldKind.DATETIME),
                    Field(key="attendee_count", label="Attendees", kind=FieldKind.NUMBER),
                    Field(key="tags", label="Tags", kind=FieldKind.TAG_ARRAY),
                    Field(key="attachments", label="Files", kind=FieldKind.FILE_ARRAY),
                    Field(
                        key="event_code",
                        label="Code",
                        kind=FieldKind.STRING,
                        unique=True,
                    ),
                ],
            ),
        ],
        edge_types=[],
    )


class TestValidateDatetimeFields:
    """Tests for validate_datetime_fields."""

    def test_valid_datetime(self, extended_definition: WorkflowDefinition):
        """Test validation passes for valid ISO 8601 datetime."""
        seed_data = SeedData(
            nodes=[
                SeedNode(
                    temp_id="event_1",
                    node_type="event",
                    title="Event 1",
                    properties={
                        "name": "Conference",
                        "start_time": "2024-01-15T10:30:00Z",
                        "end_time": "2024-01-15T18:00:00+05:00",
                    },
                ),
            ],
            edges=[],
        )

        errors = validate_datetime_fields(seed_data, extended_definition)
        assert errors == []

    def test_invalid_datetime_format(self, extended_definition: WorkflowDefinition):
        """Test validation fails for invalid datetime format."""
        seed_data = SeedData(
            nodes=[
                SeedNode(
                    temp_id="event_1",
                    node_type="event",
                    title="Event 1",
                    properties={
                        "name": "Conference",
                        "start_time": "January 15, 2024",  # Invalid format
                    },
                ),
            ],
            edges=[],
        )

        errors = validate_datetime_fields(seed_data, extended_definition)
        assert len(errors) == 1
        assert errors[0].code == "invalid_datetime"
        assert "start_time" in errors[0].path

    def test_non_string_datetime(self, extended_definition: WorkflowDefinition):
        """Test validation fails for non-string datetime value."""
        seed_data = SeedData(
            nodes=[
                SeedNode(
                    temp_id="event_1",
                    node_type="event",
                    title="Event 1",
                    properties={
                        "name": "Conference",
                        "start_time": 1705312200,  # Unix timestamp (invalid)
                    },
                ),
            ],
            edges=[],
        )

        errors = validate_datetime_fields(seed_data, extended_definition)
        assert len(errors) == 1
        assert errors[0].code == "invalid_datetime"


class TestValidateNumberFields:
    """Tests for validate_number_fields."""

    def test_valid_numbers(self, extended_definition: WorkflowDefinition):
        """Test validation passes for valid numbers."""
        seed_data = SeedData(
            nodes=[
                SeedNode(
                    temp_id="event_1",
                    node_type="event",
                    title="Event 1",
                    properties={
                        "name": "Conference",
                        "attendee_count": 150,
                    },
                ),
            ],
            edges=[],
        )

        errors = validate_number_fields(seed_data, extended_definition)
        assert errors == []

    def test_float_is_valid(self, extended_definition: WorkflowDefinition):
        """Test validation passes for float values."""
        seed_data = SeedData(
            nodes=[
                SeedNode(
                    temp_id="event_1",
                    node_type="event",
                    title="Event 1",
                    properties={
                        "name": "Conference",
                        "attendee_count": 150.5,
                    },
                ),
            ],
            edges=[],
        )

        errors = validate_number_fields(seed_data, extended_definition)
        assert errors == []

    def test_string_number_is_invalid(self, extended_definition: WorkflowDefinition):
        """Test validation fails for string number."""
        seed_data = SeedData(
            nodes=[
                SeedNode(
                    temp_id="event_1",
                    node_type="event",
                    title="Event 1",
                    properties={
                        "name": "Conference",
                        "attendee_count": "150",  # String, not number
                    },
                ),
            ],
            edges=[],
        )

        errors = validate_number_fields(seed_data, extended_definition)
        assert len(errors) == 1
        assert errors[0].code == "invalid_number"

    def test_boolean_is_invalid(self, extended_definition: WorkflowDefinition):
        """Test validation fails for boolean value in number field."""
        seed_data = SeedData(
            nodes=[
                SeedNode(
                    temp_id="event_1",
                    node_type="event",
                    title="Event 1",
                    properties={
                        "name": "Conference",
                        "attendee_count": True,  # Boolean
                    },
                ),
            ],
            edges=[],
        )

        errors = validate_number_fields(seed_data, extended_definition)
        assert len(errors) == 1
        assert errors[0].code == "invalid_number"


class TestValidateArrayFields:
    """Tests for validate_array_fields."""

    def test_valid_arrays(self, extended_definition: WorkflowDefinition):
        """Test validation passes for valid arrays."""
        seed_data = SeedData(
            nodes=[
                SeedNode(
                    temp_id="event_1",
                    node_type="event",
                    title="Event 1",
                    properties={
                        "name": "Conference",
                        "tags": ["tech", "conference", "2024"],
                        "attachments": ["agenda.pdf", "schedule.xlsx"],
                    },
                ),
            ],
            edges=[],
        )

        errors = validate_array_fields(seed_data, extended_definition)
        assert errors == []

    def test_string_instead_of_array(self, extended_definition: WorkflowDefinition):
        """Test validation fails for string instead of array."""
        seed_data = SeedData(
            nodes=[
                SeedNode(
                    temp_id="event_1",
                    node_type="event",
                    title="Event 1",
                    properties={
                        "name": "Conference",
                        "tags": "tech, conference",  # String, not array
                    },
                ),
            ],
            edges=[],
        )

        errors = validate_array_fields(seed_data, extended_definition)
        assert len(errors) == 1
        assert errors[0].code == "invalid_array"
        assert "tag[]" in errors[0].message


class TestValidateUniqueFields:
    """Tests for validate_unique_fields."""

    def test_unique_values(self, extended_definition: WorkflowDefinition):
        """Test validation passes for unique values."""
        seed_data = SeedData(
            nodes=[
                SeedNode(
                    temp_id="event_1",
                    node_type="event",
                    title="Event 1",
                    properties={"name": "Conference", "event_code": "EVT-001"},
                ),
                SeedNode(
                    temp_id="event_2",
                    node_type="event",
                    title="Event 2",
                    properties={"name": "Workshop", "event_code": "EVT-002"},
                ),
            ],
            edges=[],
        )

        errors = validate_unique_fields(seed_data, extended_definition)
        assert errors == []

    def test_duplicate_unique_values(self, extended_definition: WorkflowDefinition):
        """Test validation fails for duplicate unique field values."""
        seed_data = SeedData(
            nodes=[
                SeedNode(
                    temp_id="event_1",
                    node_type="event",
                    title="Event 1",
                    properties={"name": "Conference", "event_code": "EVT-001"},
                ),
                SeedNode(
                    temp_id="event_2",
                    node_type="event",
                    title="Event 2",
                    properties={"name": "Workshop", "event_code": "EVT-001"},  # Duplicate
                ),
            ],
            edges=[],
        )

        errors = validate_unique_fields(seed_data, extended_definition)
        assert len(errors) == 1
        assert errors[0].code == "duplicate_unique_value"
        assert "EVT-001" in errors[0].message


class TestWarnOrphanNodes:
    """Tests for warn_orphan_nodes."""

    def test_no_orphans(self):
        """Test no warnings when all nodes are connected."""
        seed_data = SeedData(
            nodes=[
                SeedNode(temp_id="task_1", node_type="task", title="Task 1"),
                SeedNode(temp_id="person_1", node_type="person", title="Person 1"),
            ],
            edges=[
                SeedEdge(edge_type="assigned_to", from_temp_id="task_1", to_temp_id="person_1"),
            ],
        )

        warnings = warn_orphan_nodes(seed_data)
        assert warnings == []

    def test_orphan_detected(self):
        """Test warning is generated for orphan node."""
        seed_data = SeedData(
            nodes=[
                SeedNode(temp_id="task_1", node_type="task", title="Task 1"),
                SeedNode(temp_id="task_2", node_type="task", title="Task 2"),
                SeedNode(temp_id="person_1", node_type="person", title="Person 1"),
            ],
            edges=[
                SeedEdge(edge_type="assigned_to", from_temp_id="task_1", to_temp_id="person_1"),
            ],
        )

        warnings = warn_orphan_nodes(seed_data)
        assert len(warnings) == 1
        assert warnings[0].code == "orphan_node"
        assert warnings[0].severity == ValidationSeverity.WARNING
        assert "task_2" in warnings[0].message


class TestWarnLowEdgeDensity:
    """Tests for warn_low_edge_density."""

    def test_good_density(self):
        """Test no warning when edge density is good."""
        seed_data = SeedData(
            nodes=[
                SeedNode(temp_id="task_1", node_type="task", title="Task 1"),
                SeedNode(temp_id="task_2", node_type="task", title="Task 2"),
                SeedNode(temp_id="person_1", node_type="person", title="Person 1"),
            ],
            edges=[
                SeedEdge(edge_type="assigned_to", from_temp_id="task_1", to_temp_id="person_1"),
                SeedEdge(edge_type="assigned_to", from_temp_id="task_2", to_temp_id="person_1"),
            ],
        )

        warnings = warn_low_edge_density(seed_data)
        assert warnings == []

    def test_low_density_warning(self):
        """Test warning when edge density is low."""
        seed_data = SeedData(
            nodes=[
                SeedNode(temp_id=f"task_{i}", node_type="task", title=f"Task {i}")
                for i in range(10)
            ],
            edges=[],  # No edges
        )

        warnings = warn_low_edge_density(seed_data)
        assert len(warnings) == 1
        assert warnings[0].code == "low_edge_density"
        assert warnings[0].severity == ValidationSeverity.WARNING

    def test_single_node_no_warning(self):
        """Test no warning for single node (edge density not applicable)."""
        seed_data = SeedData(
            nodes=[SeedNode(temp_id="task_1", node_type="task", title="Task 1")],
            edges=[],
        )

        warnings = warn_low_edge_density(seed_data)
        assert warnings == []


class TestWarnEmptySeedData:
    """Tests for warn_empty_seed_data."""

    def test_non_empty_data(self):
        """Test no warning when data is not empty."""
        seed_data = SeedData(
            nodes=[SeedNode(temp_id="task_1", node_type="task", title="Task 1")],
            edges=[],
        )

        warnings = warn_empty_seed_data(seed_data)
        assert warnings == []

    def test_empty_data_warning(self):
        """Test warning when data is empty."""
        seed_data = SeedData(nodes=[], edges=[])

        warnings = warn_empty_seed_data(seed_data)
        assert len(warnings) == 1
        assert warnings[0].code == "empty_seed_data"
        assert warnings[0].severity == ValidationSeverity.WARNING


class TestCompositeValidatorWithNewValidators:
    """Tests for create_seed_data_validator with new validators."""

    def test_includes_new_validators(self, sample_definition: WorkflowDefinition):
        """Test composite validator includes new graph integrity validators."""
        seed_data = SeedData(
            nodes=[
                SeedNode(temp_id="task_1", node_type="task", title="Task 1"),
                SeedNode(temp_id="task_1", node_type="task", title="Duplicate"),  # Duplicate
            ],
            edges=[],
        )

        validator = create_seed_data_validator(sample_definition)
        errors = validator(seed_data)

        error_codes = {e.code for e in errors}
        assert "duplicate_temp_id" in error_codes

    def test_warnings_included_by_default(self, sample_definition: WorkflowDefinition):
        """Test warnings are included by default."""
        seed_data = SeedData(
            nodes=[
                SeedNode(
                    temp_id="task_1",
                    node_type="task",
                    title="Task 1",
                    properties={"name": "Task"},
                ),
            ],
            edges=[],  # Orphan
        )

        validator = create_seed_data_validator(sample_definition)
        issues = validator(seed_data)

        warning_codes = {e.code for e in issues if e.severity == ValidationSeverity.WARNING}
        assert "orphan_node" in warning_codes

    def test_warnings_can_be_disabled(self, sample_definition: WorkflowDefinition):
        """Test warnings can be disabled."""
        seed_data = SeedData(
            nodes=[
                SeedNode(
                    temp_id="task_1",
                    node_type="task",
                    title="Task 1",
                    properties={"name": "Task"},
                ),
            ],
            edges=[],  # Orphan
        )

        validator = create_seed_data_validator(sample_definition, include_warnings=False)
        issues = validator(seed_data)

        # Should have no warnings
        warnings = [e for e in issues if e.severity == ValidationSeverity.WARNING]
        assert len(warnings) == 0
