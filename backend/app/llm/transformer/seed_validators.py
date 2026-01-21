"""Custom validators for SeedData against WorkflowDefinition.

These validators check semantic correctness beyond Pydantic schema validation:
- node_type exists in definition.node_types
- edge_type exists in definition.edge_types
- edges connect valid node types (from_type/to_type)
- temp_id references are valid
- required fields are present
- enum values are valid
- status values are valid
- property keys match field definitions
"""

from collections.abc import Callable, Sequence
from typing import TypeVar

from app.llm.transformer.seed_models import SeedData
from app.llm.transformer.validator import CustomValidationError
from app.models.workflow import WorkflowDefinition

# Max items to include in error context arrays to avoid response overflow
MAX_CONTEXT_ITEMS = 5

T = TypeVar("T")


def _truncate_list(items: Sequence[T], max_items: int = MAX_CONTEXT_ITEMS) -> list[T]:
    """Truncate a list for error context, adding ellipsis indicator if truncated."""
    if len(items) <= max_items:
        return list(items)
    return list(items[:max_items]) + ["..."]  # type: ignore[list-item]


def validate_node_types(
    seed_data: SeedData,
    definition: WorkflowDefinition,
) -> list[CustomValidationError]:
    """Validate that all node_type values exist in the workflow definition.

    Args:
        seed_data: The seed data to validate.
        definition: The workflow definition schema.

    Returns:
        List of validation errors for invalid node types.
    """
    errors: list[CustomValidationError] = []
    valid_types = {nt.type for nt in definition.node_types}

    sorted_valid_types = sorted(valid_types)
    for i, node in enumerate(seed_data.nodes):
        if node.node_type not in valid_types:
            errors.append(
                CustomValidationError(
                    path=f"nodes[{i}].node_type",
                    message=(
                        f"Invalid node_type '{node.node_type}'. "
                        f"Valid types: {_truncate_list(sorted_valid_types)}"
                    ),
                    code="invalid_node_type",
                    context={
                        "temp_id": node.temp_id,
                        "node_type": node.node_type,
                        "valid_types": _truncate_list(sorted_valid_types),
                    },
                )
            )

    return errors


def validate_edge_types(
    seed_data: SeedData,
    definition: WorkflowDefinition,
) -> list[CustomValidationError]:
    """Validate that all edge_type values exist in the workflow definition.

    Args:
        seed_data: The seed data to validate.
        definition: The workflow definition schema.

    Returns:
        List of validation errors for invalid edge types.
    """
    errors: list[CustomValidationError] = []
    valid_types = {et.type for et in definition.edge_types}
    sorted_valid_types = sorted(valid_types)

    for i, edge in enumerate(seed_data.edges):
        if edge.edge_type not in valid_types:
            errors.append(
                CustomValidationError(
                    path=f"edges[{i}].edge_type",
                    message=(
                        f"Invalid edge_type '{edge.edge_type}'. "
                        f"Valid types: {_truncate_list(sorted_valid_types)}"
                    ),
                    code="invalid_edge_type",
                    context={
                        "edge_type": edge.edge_type,
                        "from_temp_id": edge.from_temp_id,
                        "to_temp_id": edge.to_temp_id,
                        "valid_types": _truncate_list(sorted_valid_types),
                    },
                )
            )

    return errors


def validate_edge_connectivity(
    seed_data: SeedData,
    definition: WorkflowDefinition,
) -> list[CustomValidationError]:
    """Validate that edges connect valid node types per EdgeType constraints.

    Checks that from_node's type matches EdgeType.from_type and
    to_node's type matches EdgeType.to_type.

    Args:
        seed_data: The seed data to validate.
        definition: The workflow definition schema.

    Returns:
        List of validation errors for invalid edge connectivity.
    """
    errors: list[CustomValidationError] = []

    # Build lookup maps
    edge_type_map = {et.type: et for et in definition.edge_types}
    node_temp_id_to_type = {node.temp_id: node.node_type for node in seed_data.nodes}

    for i, edge in enumerate(seed_data.edges):
        edge_def = edge_type_map.get(edge.edge_type)
        if not edge_def:
            # Edge type validation is handled by validate_edge_types
            continue

        from_node_type = node_temp_id_to_type.get(edge.from_temp_id)
        to_node_type = node_temp_id_to_type.get(edge.to_temp_id)

        # Skip if temp_ids are invalid (handled by validate_temp_id_references)
        if from_node_type is None or to_node_type is None:
            continue

        if from_node_type != edge_def.from_type:
            errors.append(
                CustomValidationError(
                    path=f"edges[{i}]",
                    message=(
                        f"Edge type '{edge.edge_type}' requires from_node type "
                        f"'{edge_def.from_type}', but got '{from_node_type}' "
                        f"(from temp_id '{edge.from_temp_id}')"
                    ),
                    code="invalid_edge_connectivity",
                    context={
                        "edge_type": edge.edge_type,
                        "expected_from_type": edge_def.from_type,
                        "actual_from_type": from_node_type,
                        "from_temp_id": edge.from_temp_id,
                    },
                )
            )

        if to_node_type != edge_def.to_type:
            errors.append(
                CustomValidationError(
                    path=f"edges[{i}]",
                    message=(
                        f"Edge type '{edge.edge_type}' requires to_node type "
                        f"'{edge_def.to_type}', but got '{to_node_type}' "
                        f"(to temp_id '{edge.to_temp_id}')"
                    ),
                    code="invalid_edge_connectivity",
                    context={
                        "edge_type": edge.edge_type,
                        "expected_to_type": edge_def.to_type,
                        "actual_to_type": to_node_type,
                        "to_temp_id": edge.to_temp_id,
                    },
                )
            )

    return errors


def validate_temp_id_references(
    seed_data: SeedData,
) -> list[CustomValidationError]:
    """Validate that edge from_temp_id and to_temp_id reference existing nodes.

    Args:
        seed_data: The seed data to validate.

    Returns:
        List of validation errors for invalid temp_id references.
    """
    errors: list[CustomValidationError] = []
    valid_temp_ids = {node.temp_id for node in seed_data.nodes}

    for i, edge in enumerate(seed_data.edges):
        if edge.from_temp_id not in valid_temp_ids:
            errors.append(
                CustomValidationError(
                    path=f"edges[{i}].from_temp_id",
                    message=(
                        f"Invalid from_temp_id '{edge.from_temp_id}'. "
                        f"No node with this temp_id exists."
                    ),
                    code="invalid_temp_id_reference",
                    context={
                        "edge_type": edge.edge_type,
                        "from_temp_id": edge.from_temp_id,
                        "to_temp_id": edge.to_temp_id,
                    },
                )
            )

        if edge.to_temp_id not in valid_temp_ids:
            errors.append(
                CustomValidationError(
                    path=f"edges[{i}].to_temp_id",
                    message=(
                        f"Invalid to_temp_id '{edge.to_temp_id}'. "
                        f"No node with this temp_id exists."
                    ),
                    code="invalid_temp_id_reference",
                    context={
                        "edge_type": edge.edge_type,
                        "from_temp_id": edge.from_temp_id,
                        "to_temp_id": edge.to_temp_id,
                    },
                )
            )

    return errors


def validate_required_fields(
    seed_data: SeedData,
    definition: WorkflowDefinition,
) -> list[CustomValidationError]:
    """Validate that required fields are present in node properties.

    Args:
        seed_data: The seed data to validate.
        definition: The workflow definition schema.

    Returns:
        List of validation errors for missing required fields.
    """
    errors: list[CustomValidationError] = []

    # Build map of node_type -> required field keys
    node_type_required_fields: dict[str, set[str]] = {}
    for nt in definition.node_types:
        required = {f.key for f in nt.fields if f.required and f.key != "status"}
        node_type_required_fields[nt.type] = required

    for i, node in enumerate(seed_data.nodes):
        required_fields = node_type_required_fields.get(node.node_type, set())
        if not required_fields:
            continue

        for field_key in required_fields:
            if field_key not in node.properties or node.properties[field_key] is None:
                errors.append(
                    CustomValidationError(
                        path=f"nodes[{i}].properties.{field_key}",
                        message=(
                            f"Missing required field '{field_key}' for node type "
                            f"'{node.node_type}' (temp_id: '{node.temp_id}')"
                        ),
                        code="missing_required_field",
                        context={
                            "temp_id": node.temp_id,
                            "node_type": node.node_type,
                            "field_key": field_key,
                        },
                    )
                )

    return errors


def validate_enum_values(
    seed_data: SeedData,
    definition: WorkflowDefinition,
) -> list[CustomValidationError]:
    """Validate that enum field values are in Field.values.

    Args:
        seed_data: The seed data to validate.
        definition: The workflow definition schema.

    Returns:
        List of validation errors for invalid enum values.
    """
    errors: list[CustomValidationError] = []

    # Build map of node_type -> field_key -> valid enum values
    from app.models.workflow import FieldKind

    node_type_enum_fields: dict[str, dict[str, list[str]]] = {}
    for nt in definition.node_types:
        enum_fields: dict[str, list[str]] = {}
        for f in nt.fields:
            if f.kind == FieldKind.ENUM and f.values:
                # Skip status field - validated separately
                if f.key != "status":
                    enum_fields[f.key] = f.values
        if enum_fields:
            node_type_enum_fields[nt.type] = enum_fields

    for i, node in enumerate(seed_data.nodes):
        enum_fields = node_type_enum_fields.get(node.node_type, {})
        if not enum_fields:
            continue

        for field_key, valid_values in enum_fields.items():
            if field_key not in node.properties:
                continue

            value = node.properties[field_key]
            if value is not None and value not in valid_values:
                errors.append(
                    CustomValidationError(
                        path=f"nodes[{i}].properties.{field_key}",
                        message=(
                            f"Invalid enum value '{value}' for field '{field_key}'. "
                            f"Valid values: {_truncate_list(valid_values)}"
                        ),
                        code="invalid_enum_value",
                        context={
                            "temp_id": node.temp_id,
                            "node_type": node.node_type,
                            "field_key": field_key,
                            "value": value,
                            "valid_values": _truncate_list(valid_values),
                        },
                    )
                )

    return errors


def validate_status_values(
    seed_data: SeedData,
    definition: WorkflowDefinition,
) -> list[CustomValidationError]:
    """Validate that status values are in NodeState.values.

    Args:
        seed_data: The seed data to validate.
        definition: The workflow definition schema.

    Returns:
        List of validation errors for invalid status values.
    """
    errors: list[CustomValidationError] = []

    # Build map of node_type -> valid status values
    node_type_statuses: dict[str, list[str]] = {}
    for nt in definition.node_types:
        if nt.states and nt.states.enabled:
            node_type_statuses[nt.type] = nt.states.values

    for i, node in enumerate(seed_data.nodes):
        valid_statuses = node_type_statuses.get(node.node_type)
        if valid_statuses is None:
            # Node type doesn't have states, status should be None
            if node.status is not None:
                errors.append(
                    CustomValidationError(
                        path=f"nodes[{i}].status",
                        message=(
                            f"Node type '{node.node_type}' does not have states enabled, "
                            f"but status '{node.status}' was provided"
                        ),
                        code="invalid_status",
                        context={
                            "temp_id": node.temp_id,
                            "node_type": node.node_type,
                            "status": node.status,
                        },
                    )
                )
            continue

        # Node type has states - status must be valid or None (will use default)
        if node.status is not None and node.status not in valid_statuses:
            errors.append(
                CustomValidationError(
                    path=f"nodes[{i}].status",
                    message=(
                        f"Invalid status '{node.status}' for node type '{node.node_type}'. "
                        f"Valid statuses: {_truncate_list(valid_statuses)}"
                    ),
                    code="invalid_status",
                    context={
                        "temp_id": node.temp_id,
                        "node_type": node.node_type,
                        "status": node.status,
                        "valid_statuses": _truncate_list(valid_statuses),
                    },
                )
            )

    return errors


def validate_property_keys(
    seed_data: SeedData,
    definition: WorkflowDefinition,
) -> list[CustomValidationError]:
    """Validate that property keys match NodeType.fields.

    Args:
        seed_data: The seed data to validate.
        definition: The workflow definition schema.

    Returns:
        List of validation errors for unknown property keys.
    """
    errors: list[CustomValidationError] = []

    # Build map of node_type -> valid field keys
    node_type_fields: dict[str, set[str]] = {}
    for nt in definition.node_types:
        valid_keys = {f.key for f in nt.fields}
        node_type_fields[nt.type] = valid_keys

    for i, node in enumerate(seed_data.nodes):
        valid_keys = node_type_fields.get(node.node_type)
        if valid_keys is None:
            # Invalid node type - handled by validate_node_types
            continue

        sorted_valid_keys = sorted(valid_keys)
        for prop_key in node.properties:
            if prop_key not in valid_keys:
                errors.append(
                    CustomValidationError(
                        path=f"nodes[{i}].properties.{prop_key}",
                        message=(
                            f"Unknown property key '{prop_key}' for node type "
                            f"'{node.node_type}'. Valid keys: {_truncate_list(sorted_valid_keys)}"
                        ),
                        code="unknown_property_key",
                        context={
                            "temp_id": node.temp_id,
                            "node_type": node.node_type,
                            "property_key": prop_key,
                            "valid_keys": _truncate_list(sorted_valid_keys),
                        },
                    )
                )

    return errors


def create_seed_data_validator(
    definition: WorkflowDefinition,
    max_errors: int = 10,
) -> Callable[[SeedData], list[CustomValidationError]]:
    """Create a composite validator for SeedData against a WorkflowDefinition.

    The returned function runs all individual validators and aggregates errors
    up to max_errors.

    Args:
        definition: The workflow definition to validate against.
        max_errors: Maximum number of errors to return.

    Returns:
        A validator function that takes SeedData and returns validation errors.
    """

    def validate(seed_data: SeedData) -> list[CustomValidationError]:
        all_errors: list[CustomValidationError] = []

        # Run validators in priority order (most fundamental first)
        validators = [
            lambda sd: validate_node_types(sd, definition),
            lambda sd: validate_edge_types(sd, definition),
            lambda sd: validate_temp_id_references(sd),
            lambda sd: validate_edge_connectivity(sd, definition),
            lambda sd: validate_property_keys(sd, definition),
            lambda sd: validate_required_fields(sd, definition),
            lambda sd: validate_enum_values(sd, definition),
            lambda sd: validate_status_values(sd, definition),
        ]

        for validator in validators:
            errors = validator(seed_data)
            all_errors.extend(errors)

            if len(all_errors) >= max_errors:
                return all_errors[:max_errors]

        return all_errors

    return validate
