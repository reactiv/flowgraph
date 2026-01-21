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
- graph integrity (unique temp_ids, no self-loops, no duplicates)
- field type validation (datetime, number, arrays)
- unique field constraints
"""

from collections.abc import Callable, Sequence
from datetime import datetime
from typing import Any, TypeVar

from app.llm.transformer.seed_models import SeedData
from app.llm.transformer.validator import CustomValidationError, ValidationSeverity
from app.models.workflow import FieldKind, WorkflowDefinition

# Max items to include in error context arrays to avoid response overflow
MAX_CONTEXT_ITEMS = 5

T = TypeVar("T")


def _truncate_list(items: Sequence[T], max_items: int = MAX_CONTEXT_ITEMS) -> list[T]:
    """Truncate a list for error context, adding ellipsis indicator if truncated."""
    if len(items) <= max_items:
        return list(items)
    return list(items[:max_items]) + ["..."]  # type: ignore[list-item]


def _levenshtein_distance(s1: str, s2: str) -> int:
    """Calculate Levenshtein distance between two strings.

    Used for detecting likely typos in temp_id references.
    """
    if len(s1) < len(s2):
        return _levenshtein_distance(s2, s1)

    if len(s2) == 0:
        return len(s1)

    previous_row = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            # j+1 instead of j since previous_row and current_row are one char longer
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row

    return previous_row[-1]


def _find_similar_temp_id(
    invalid_id: str, valid_ids: set[str], max_distance: int = 2
) -> str | None:
    """Find a valid temp_id that's similar to the invalid one.

    Returns the closest match within max_distance, or None if no match found.
    """
    best_match = None
    best_distance = max_distance + 1

    for valid_id in valid_ids:
        distance = _levenshtein_distance(invalid_id, valid_id)
        if distance <= max_distance and distance < best_distance:
            best_distance = distance
            best_match = valid_id

    return best_match


def validate_unique_temp_ids(
    seed_data: SeedData,
) -> list[CustomValidationError]:
    """Validate that all node temp_ids are unique.

    Args:
        seed_data: The seed data to validate.

    Returns:
        List of validation errors for duplicate temp_ids.
    """
    errors: list[CustomValidationError] = []
    seen_temp_ids: dict[str, int] = {}  # temp_id -> first occurrence index

    for i, node in enumerate(seed_data.nodes):
        if node.temp_id in seen_temp_ids:
            first_index = seen_temp_ids[node.temp_id]
            errors.append(
                CustomValidationError(
                    path=f"nodes[{i}].temp_id",
                    message=(
                        f"Duplicate temp_id '{node.temp_id}'. "
                        f"First defined at nodes[{first_index}]."
                    ),
                    code="duplicate_temp_id",
                    context={
                        "temp_id": node.temp_id,
                        "first_occurrence": first_index,
                        "duplicate_occurrence": i,
                    },
                )
            )
        else:
            seen_temp_ids[node.temp_id] = i

    return errors


def validate_no_self_loops(
    seed_data: SeedData,
) -> list[CustomValidationError]:
    """Validate that no edges reference the same node for from and to.

    Args:
        seed_data: The seed data to validate.

    Returns:
        List of validation errors for self-referential edges.
    """
    errors: list[CustomValidationError] = []

    for i, edge in enumerate(seed_data.edges):
        if edge.from_temp_id == edge.to_temp_id:
            errors.append(
                CustomValidationError(
                    path=f"edges[{i}]",
                    message=(
                        f"Self-referential edge: '{edge.edge_type}' connects "
                        f"'{edge.from_temp_id}' to itself."
                    ),
                    code="self_loop_edge",
                    context={
                        "edge_type": edge.edge_type,
                        "temp_id": edge.from_temp_id,
                    },
                )
            )

    return errors


def validate_no_duplicate_edges(
    seed_data: SeedData,
) -> list[CustomValidationError]:
    """Validate that no duplicate edges exist (same type, same from/to pair).

    Args:
        seed_data: The seed data to validate.

    Returns:
        List of validation errors for duplicate edges.
    """
    errors: list[CustomValidationError] = []
    # Track: (edge_type, from_temp_id, to_temp_id) -> first occurrence index
    seen_edges: dict[tuple[str, str, str], int] = {}

    for i, edge in enumerate(seed_data.edges):
        key = (edge.edge_type, edge.from_temp_id, edge.to_temp_id)
        if key in seen_edges:
            first_index = seen_edges[key]
            errors.append(
                CustomValidationError(
                    path=f"edges[{i}]",
                    message=(
                        f"Duplicate edge: '{edge.edge_type}' from '{edge.from_temp_id}' "
                        f"to '{edge.to_temp_id}' already exists at edges[{first_index}]."
                    ),
                    code="duplicate_edge",
                    context={
                        "edge_type": edge.edge_type,
                        "from_temp_id": edge.from_temp_id,
                        "to_temp_id": edge.to_temp_id,
                        "first_occurrence": first_index,
                        "duplicate_occurrence": i,
                    },
                )
            )
        else:
            seen_edges[key] = i

    return errors


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

    Enhanced with typo detection: when an invalid temp_id is close to a valid one
    (Levenshtein distance <= 2), suggests the correction in the error message.

    Args:
        seed_data: The seed data to validate.

    Returns:
        List of validation errors for invalid temp_id references.
    """
    errors: list[CustomValidationError] = []
    valid_temp_ids = {node.temp_id for node in seed_data.nodes}

    for i, edge in enumerate(seed_data.edges):
        if edge.from_temp_id not in valid_temp_ids:
            # Check for likely typo
            similar = _find_similar_temp_id(edge.from_temp_id, valid_temp_ids)
            if similar:
                message = (
                    f"Invalid from_temp_id '{edge.from_temp_id}'. "
                    f"Did you mean '{similar}'?"
                )
            else:
                message = (
                    f"Invalid from_temp_id '{edge.from_temp_id}'. "
                    f"No node with this temp_id exists."
                )

            errors.append(
                CustomValidationError(
                    path=f"edges[{i}].from_temp_id",
                    message=message,
                    code="invalid_temp_id_reference",
                    context={
                        "edge_type": edge.edge_type,
                        "from_temp_id": edge.from_temp_id,
                        "to_temp_id": edge.to_temp_id,
                        "suggested_correction": similar,
                    },
                )
            )

        if edge.to_temp_id not in valid_temp_ids:
            # Check for likely typo
            similar = _find_similar_temp_id(edge.to_temp_id, valid_temp_ids)
            if similar:
                message = (
                    f"Invalid to_temp_id '{edge.to_temp_id}'. "
                    f"Did you mean '{similar}'?"
                )
            else:
                message = (
                    f"Invalid to_temp_id '{edge.to_temp_id}'. "
                    f"No node with this temp_id exists."
                )

            errors.append(
                CustomValidationError(
                    path=f"edges[{i}].to_temp_id",
                    message=message,
                    code="invalid_temp_id_reference",
                    context={
                        "edge_type": edge.edge_type,
                        "from_temp_id": edge.from_temp_id,
                        "to_temp_id": edge.to_temp_id,
                        "suggested_correction": similar,
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


def _is_valid_datetime(value: Any) -> bool:
    """Check if value is a valid ISO 8601 datetime string."""
    if not isinstance(value, str):
        return False
    try:
        # Handle common ISO 8601 formats including 'Z' suffix
        datetime.fromisoformat(value.replace("Z", "+00:00"))
        return True
    except ValueError:
        return False


def _is_valid_number(value: Any) -> bool:
    """Check if value is a valid number (int or float, not NaN/Inf)."""
    if isinstance(value, bool):
        return False  # bool is subclass of int but not a valid number
    if isinstance(value, (int, float)):
        import math

        return not (math.isnan(value) or math.isinf(value))
    return False


def validate_datetime_fields(
    seed_data: SeedData,
    definition: WorkflowDefinition,
) -> list[CustomValidationError]:
    """Validate that datetime field values are valid ISO 8601 format.

    Args:
        seed_data: The seed data to validate.
        definition: The workflow definition schema.

    Returns:
        List of validation errors for invalid datetime values.
    """
    errors: list[CustomValidationError] = []

    # Build map of node_type -> datetime field keys
    node_type_datetime_fields: dict[str, set[str]] = {}
    for nt in definition.node_types:
        datetime_fields = {f.key for f in nt.fields if f.kind == FieldKind.DATETIME}
        if datetime_fields:
            node_type_datetime_fields[nt.type] = datetime_fields

    for i, node in enumerate(seed_data.nodes):
        datetime_fields = node_type_datetime_fields.get(node.node_type, set())
        if not datetime_fields:
            continue

        for field_key in datetime_fields:
            if field_key not in node.properties:
                continue

            value = node.properties[field_key]
            if value is not None and not _is_valid_datetime(value):
                errors.append(
                    CustomValidationError(
                        path=f"nodes[{i}].properties.{field_key}",
                        message=(
                            f"Invalid datetime value '{value}' for field '{field_key}'. "
                            f"Expected ISO 8601 format (e.g., '2024-01-15T10:30:00Z')."
                        ),
                        code="invalid_datetime",
                        context={
                            "temp_id": node.temp_id,
                            "node_type": node.node_type,
                            "field_key": field_key,
                            "value": str(value)[:100],  # Truncate long values
                        },
                    )
                )

    return errors


def validate_number_fields(
    seed_data: SeedData,
    definition: WorkflowDefinition,
) -> list[CustomValidationError]:
    """Validate that number field values are valid numbers.

    Args:
        seed_data: The seed data to validate.
        definition: The workflow definition schema.

    Returns:
        List of validation errors for invalid number values.
    """
    errors: list[CustomValidationError] = []

    # Build map of node_type -> number field keys
    node_type_number_fields: dict[str, set[str]] = {}
    for nt in definition.node_types:
        number_fields = {f.key for f in nt.fields if f.kind == FieldKind.NUMBER}
        if number_fields:
            node_type_number_fields[nt.type] = number_fields

    for i, node in enumerate(seed_data.nodes):
        number_fields = node_type_number_fields.get(node.node_type, set())
        if not number_fields:
            continue

        for field_key in number_fields:
            if field_key not in node.properties:
                continue

            value = node.properties[field_key]
            if value is not None and not _is_valid_number(value):
                errors.append(
                    CustomValidationError(
                        path=f"nodes[{i}].properties.{field_key}",
                        message=(
                            f"Invalid number value '{value}' for field '{field_key}'. "
                            f"Expected a numeric value."
                        ),
                        code="invalid_number",
                        context={
                            "temp_id": node.temp_id,
                            "node_type": node.node_type,
                            "field_key": field_key,
                            "value": str(value)[:100],
                            "value_type": type(value).__name__,
                        },
                    )
                )

    return errors


def validate_array_fields(
    seed_data: SeedData,
    definition: WorkflowDefinition,
) -> list[CustomValidationError]:
    """Validate that tag[] and file[] field values are arrays.

    Args:
        seed_data: The seed data to validate.
        definition: The workflow definition schema.

    Returns:
        List of validation errors for invalid array values.
    """
    errors: list[CustomValidationError] = []

    # Build map of node_type -> array field keys with their kinds
    node_type_array_fields: dict[str, dict[str, FieldKind]] = {}
    for nt in definition.node_types:
        array_fields: dict[str, FieldKind] = {}
        for f in nt.fields:
            if f.kind in (FieldKind.TAG_ARRAY, FieldKind.FILE_ARRAY):
                array_fields[f.key] = f.kind
        if array_fields:
            node_type_array_fields[nt.type] = array_fields

    for i, node in enumerate(seed_data.nodes):
        array_fields = node_type_array_fields.get(node.node_type, {})
        if not array_fields:
            continue

        for field_key, field_kind in array_fields.items():
            if field_key not in node.properties:
                continue

            value = node.properties[field_key]
            if value is None:
                continue

            if not isinstance(value, list):
                kind_name = "tag[]" if field_kind == FieldKind.TAG_ARRAY else "file[]"
                errors.append(
                    CustomValidationError(
                        path=f"nodes[{i}].properties.{field_key}",
                        message=(
                            f"Invalid {kind_name} value for field '{field_key}'. "
                            f"Expected an array, got {type(value).__name__}."
                        ),
                        code="invalid_array",
                        context={
                            "temp_id": node.temp_id,
                            "node_type": node.node_type,
                            "field_key": field_key,
                            "expected_kind": kind_name,
                            "actual_type": type(value).__name__,
                        },
                    )
                )

    return errors


def validate_unique_fields(
    seed_data: SeedData,
    definition: WorkflowDefinition,
) -> list[CustomValidationError]:
    """Validate that fields marked unique=True have unique values across nodes of same type.

    Args:
        seed_data: The seed data to validate.
        definition: The workflow definition schema.

    Returns:
        List of validation errors for duplicate unique field values.
    """
    errors: list[CustomValidationError] = []

    # Build map of node_type -> unique field keys
    node_type_unique_fields: dict[str, set[str]] = {}
    for nt in definition.node_types:
        unique_fields = {f.key for f in nt.fields if f.unique}
        if unique_fields:
            node_type_unique_fields[nt.type] = unique_fields

    # Track seen values: node_type -> field_key -> value -> first occurrence (index, temp_id)
    seen_values: dict[str, dict[str, dict[Any, tuple[int, str]]]] = {}

    for i, node in enumerate(seed_data.nodes):
        unique_fields = node_type_unique_fields.get(node.node_type, set())
        if not unique_fields:
            continue

        # Initialize tracking for this node type
        if node.node_type not in seen_values:
            seen_values[node.node_type] = {field: {} for field in unique_fields}

        for field_key in unique_fields:
            if field_key not in node.properties:
                continue

            value = node.properties[field_key]
            if value is None:
                continue

            field_seen = seen_values[node.node_type][field_key]
            if value in field_seen:
                first_index, first_temp_id = field_seen[value]
                errors.append(
                    CustomValidationError(
                        path=f"nodes[{i}].properties.{field_key}",
                        message=(
                            f"Duplicate value '{value}' for unique field '{field_key}'. "
                            f"First used by '{first_temp_id}' at nodes[{first_index}]."
                        ),
                        code="duplicate_unique_value",
                        context={
                            "temp_id": node.temp_id,
                            "node_type": node.node_type,
                            "field_key": field_key,
                            "value": str(value)[:100],
                            "first_occurrence_index": first_index,
                            "first_occurrence_temp_id": first_temp_id,
                        },
                    )
                )
            else:
                field_seen[value] = (i, node.temp_id)

    return errors


# ==================== Warning Validators ====================


def warn_orphan_nodes(
    seed_data: SeedData,
) -> list[CustomValidationError]:
    """Warn about nodes with no incoming or outgoing edges.

    Args:
        seed_data: The seed data to validate.

    Returns:
        List of warnings for orphan nodes.
    """
    warnings: list[CustomValidationError] = []

    # Build set of all nodes referenced by edges
    connected_nodes: set[str] = set()
    for edge in seed_data.edges:
        connected_nodes.add(edge.from_temp_id)
        connected_nodes.add(edge.to_temp_id)

    # Find orphan nodes
    for i, node in enumerate(seed_data.nodes):
        if node.temp_id not in connected_nodes:
            warnings.append(
                CustomValidationError(
                    path=f"nodes[{i}]",
                    message=(
                        f"Orphan node '{node.temp_id}' ({node.node_type}) "
                        f"has no edges connecting it to other nodes."
                    ),
                    code="orphan_node",
                    context={
                        "temp_id": node.temp_id,
                        "node_type": node.node_type,
                        "title": node.title,
                    },
                    severity=ValidationSeverity.WARNING,
                )
            )

    return warnings


def warn_low_edge_density(
    seed_data: SeedData,
) -> list[CustomValidationError]:
    """Warn when edge density is suspiciously low.

    A well-connected workflow graph typically has at least 0.3 edges per node.
    Very low density may indicate missing relationships.

    Args:
        seed_data: The seed data to validate.

    Returns:
        List of warnings for low edge density.
    """
    warnings: list[CustomValidationError] = []

    node_count = len(seed_data.nodes)
    edge_count = len(seed_data.edges)

    # Skip for very small graphs (0-1 nodes)
    if node_count <= 1:
        return warnings

    # Calculate density threshold: expect at least 0.3 edges per node
    min_expected_edges = (node_count - 1) * 0.3
    density = edge_count / node_count if node_count > 0 else 0

    if edge_count < min_expected_edges:
        warnings.append(
            CustomValidationError(
                path="edges",
                message=(
                    f"Low edge density: {edge_count} edges for {node_count} nodes "
                    f"(density: {density:.2f}). Expected at least "
                    f"{int(min_expected_edges)} edges. This may indicate missing relationships."
                ),
                code="low_edge_density",
                context={
                    "node_count": node_count,
                    "edge_count": edge_count,
                    "density": round(density, 2),
                    "min_expected_edges": int(min_expected_edges),
                },
                severity=ValidationSeverity.WARNING,
            )
        )

    return warnings


def warn_empty_seed_data(
    seed_data: SeedData,
) -> list[CustomValidationError]:
    """Warn when seed data is empty.

    Args:
        seed_data: The seed data to validate.

    Returns:
        List of warnings for empty seed data.
    """
    warnings: list[CustomValidationError] = []

    if not seed_data.nodes:
        warnings.append(
            CustomValidationError(
                path="nodes",
                message="Empty seed data: no nodes to import.",
                code="empty_seed_data",
                context={
                    "node_count": 0,
                    "edge_count": len(seed_data.edges),
                },
                severity=ValidationSeverity.WARNING,
            )
        )

    return warnings


def create_seed_data_validator(
    definition: WorkflowDefinition,
    max_errors: int = 10,
    include_warnings: bool = True,
) -> Callable[[SeedData], list[CustomValidationError]]:
    """Create a composite validator for SeedData against a WorkflowDefinition.

    The returned function runs all individual validators and aggregates errors
    up to max_errors. Warning validators are run after error validators and
    their results are included with severity=WARNING.

    Args:
        definition: The workflow definition to validate against.
        max_errors: Maximum number of errors to return.
        include_warnings: Whether to include warning validators (default: True).

    Returns:
        A validator function that takes SeedData and returns validation errors
        and warnings (distinguished by severity field).
    """

    def validate(seed_data: SeedData) -> list[CustomValidationError]:
        all_issues: list[CustomValidationError] = []

        # Run error validators in priority order (most fundamental first)
        error_validators = [
            # Graph integrity (must run first)
            lambda sd: validate_unique_temp_ids(sd),
            # Schema validation
            lambda sd: validate_node_types(sd, definition),
            lambda sd: validate_edge_types(sd, definition),
            # Reference validation (with typo detection)
            lambda sd: validate_temp_id_references(sd),
            # Edge structure validation
            lambda sd: validate_no_self_loops(sd),
            lambda sd: validate_no_duplicate_edges(sd),
            lambda sd: validate_edge_connectivity(sd, definition),
            # Property validation
            lambda sd: validate_property_keys(sd, definition),
            lambda sd: validate_required_fields(sd, definition),
            lambda sd: validate_enum_values(sd, definition),
            lambda sd: validate_status_values(sd, definition),
            # Type validation
            lambda sd: validate_datetime_fields(sd, definition),
            lambda sd: validate_number_fields(sd, definition),
            lambda sd: validate_array_fields(sd, definition),
            # Uniqueness validation
            lambda sd: validate_unique_fields(sd, definition),
        ]

        for validator in error_validators:
            errors = validator(seed_data)
            all_issues.extend(errors)

            if len(all_issues) >= max_errors:
                return all_issues[:max_errors]

        # Run warning validators (only if no errors reached max)
        if include_warnings:
            warning_validators = [
                lambda sd: warn_empty_seed_data(sd),
                lambda sd: warn_orphan_nodes(sd),
                lambda sd: warn_low_edge_density(sd),
            ]

            for validator in warning_validators:
                warnings = validator(seed_data)
                all_issues.extend(warnings)

        return all_issues

    return validate
