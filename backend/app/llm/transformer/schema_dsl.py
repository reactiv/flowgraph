"""Converts WorkflowDefinition to a compact DSL format for token-efficient prompts.

DSL Legend:
  ! = required field
  type[] = array of type
  enum(x|y) = optional enum with values x, y
  enum!(x|y) = required enum
  State notation: → = transition, ↔ = bidirectional, | = or
"""

from collections import defaultdict
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.models.workflow import WorkflowDefinition


def workflow_to_dsl(definition: "WorkflowDefinition") -> str:
    """Convert a WorkflowDefinition to compact DSL format.

    This produces a much more token-efficient representation than JSON schema,
    reducing prompt sizes by ~5-10x while preserving all structural information.

    Args:
        definition: The WorkflowDefinition to convert.

    Returns:
        A compact DSL string representation.
    """
    # Convert to dict with aliases and JSON-serializable values (enums as strings)
    schema = definition.model_dump(by_alias=True, mode="json")
    return convert_schema_to_dsl(schema)


def convert_schema_to_dsl(schema: dict[str, Any]) -> str:
    """Convert a JSON graph schema dict to compact DSL format.

    Args:
        schema: Dictionary with nodeTypes, edgeTypes, etc.

    Returns:
        A compact DSL string representation.
    """
    lines = []

    # Header
    name = schema.get("name", "Unnamed Schema")
    description = schema.get("description", "")
    lines.append(f"# {name}")
    if description:
        lines.append(f"# {description}")
    lines.append("")

    # Legend
    lines.append(
        "# Legend: ! = required, type[] = array, "
        "enum(x|y) = optional enum, enum!(x|y) = required enum"
    )
    lines.append(
        "# States: [initial → ... → final] where → = transition, "
        "↔ = bidirectional, | = or"
    )
    lines.append("")

    # Node types
    lines.append("## Nodes")
    lines.append("")

    for node_type in schema.get("nodeTypes", []):
        node_lines = _convert_node_type(node_type)
        lines.extend(node_lines)
        lines.append("")

    # Edge types
    lines.append("## Edges")
    lines.append("")
    edge_lines = _convert_edge_types(schema.get("edgeTypes", []))
    lines.extend(edge_lines)

    return "\n".join(lines)


def _convert_node_type(node_type: dict[str, Any]) -> list[str]:
    """Convert a single node type to DSL lines."""
    lines = []

    type_name = node_type.get("type", "Unknown")
    display_name = node_type.get("displayName", "")

    # Build the header line with state machine if present
    header = type_name
    if display_name and display_name != type_name:
        header = f"{type_name} ({display_name})"

    # Add state machine notation
    states = node_type.get("states")
    if states and states.get("enabled"):
        state_notation = _convert_state_machine(states)
        if state_notation:
            header = f"{type_name} {state_notation}"

    lines.append(header)

    # Convert fields
    for field in node_type.get("fields", []):
        field_line = _convert_field(field)
        if field_line:
            lines.append(f"  {field_line}")

    return lines


def _convert_field(field: dict[str, Any]) -> str:
    """Convert a single field to DSL notation."""
    key = field.get("key", "")
    kind = field.get("kind", "string")
    required = field.get("required", False)
    values = field.get("values")
    label = field.get("label", "")

    # Skip if no key
    if not key:
        return ""

    # Build type string
    if kind == "enum" and values:
        values_str = "|".join(values)
        type_str = f"enum{'!' if required else ''}({values_str})"
    elif kind.endswith("[]"):
        base_kind = kind[:-2]
        type_str = f"{base_kind}[]"
    else:
        type_str = kind
        if required and kind != "enum":
            type_str = f"{kind}!"

    # Add comment for non-obvious labels
    comment = ""
    if label and not _label_matches_key(label, key):
        # Check for units or clarifying info in label
        if "%" in label or "°" in label or "(" in label:
            # Extract the unit/clarification
            comment = f"  # {label}"

    return f"{key}: {type_str}{comment}"


def _label_matches_key(label: str, key: str) -> bool:
    """Check if a label is essentially the same as the key."""
    normalized_label = label.lower().replace(" ", "_").replace("-", "_")
    normalized_key = key.lower().replace("-", "_")
    return normalized_label == normalized_key or label.lower().replace(" ", "") == key.lower()


def _convert_state_machine(states: dict[str, Any]) -> str:
    """Convert state transitions to compact notation."""
    if not states:
        return ""

    transitions = states.get("transitions", [])
    initial = states.get("initial", "")

    if not transitions:
        return ""

    # Build adjacency map
    outgoing: dict[str, set[str]] = defaultdict(set)

    for t in transitions:
        from_state = t.get("from", "")
        to_state = t.get("to", "")
        if from_state and to_state:
            outgoing[from_state].add(to_state)

    # Find bidirectional transitions
    bidirectional: set[tuple[str, str]] = set()
    for from_state, targets in outgoing.items():
        for to_state in targets:
            if from_state in outgoing.get(to_state, set()):
                sorted_pair = sorted([from_state, to_state])
                pair: tuple[str, str] = (sorted_pair[0], sorted_pair[1])
                bidirectional.add(pair)

    # Special case: if we have exactly 2 states with bidirectional transitions,
    # just output the bidirectional notation
    all_states = set()
    for t in transitions:
        all_states.add(t.get("from", ""))
        all_states.add(t.get("to", ""))
    all_states.discard("")

    if len(all_states) == 2 and len(bidirectional) == 1:
        pair = list(bidirectional)[0]
        return f"[{pair[0]}↔{pair[1]}]"

    # Try to find the main path (longest chain from initial)
    def find_main_path(start: str, visited: set[str] | None = None) -> list[str]:
        if visited is None:
            visited = set()
        if start in visited:
            return []
        visited.add(start)

        best_path = [start]
        for next_state in outgoing.get(start, []):
            # Skip bidirectional back-edges
            pair = tuple(sorted([start, next_state]))
            if pair in bidirectional and next_state < start:
                continue

            candidate = [start] + find_main_path(next_state, visited.copy())
            if len(candidate) > len(best_path):
                best_path = candidate

        return best_path

    main_path = find_main_path(initial) if initial else []

    # Build notation parts
    parts = []

    # Main path
    if main_path:
        parts.append("→".join(main_path))

    # Add branches/alternatives not in main path
    main_path_transitions: set[tuple[str, str]] = set()
    for i in range(len(main_path) - 1):
        main_path_transitions.add((main_path[i], main_path[i + 1]))

    # Track bidirectional pairs that are fully covered by main path
    covered_bidirectional: set[tuple[str, str]] = set()
    for pair in bidirectional:
        # Check if one direction is in main path
        fwd_in_path = (pair[0], pair[1]) in main_path_transitions
        rev_in_path = (pair[1], pair[0]) in main_path_transitions
        if fwd_in_path or rev_in_path:
            covered_bidirectional.add(pair)

    # Group alternative transitions
    alternatives: dict[str, list[str | None]] = defaultdict(list)
    for t in transitions:
        from_state = t.get("from", "")
        to_state = t.get("to", "")

        if (from_state, to_state) in main_path_transitions:
            continue

        pair = tuple(sorted([from_state, to_state]))
        if pair in bidirectional:
            # Add bidirectional notation if this pair has one direction in main path
            if pair in covered_bidirectional:
                key = f"{pair[0]}↔{pair[1]}"
                if key not in alternatives:
                    alternatives[key].append(None)
            elif from_state < to_state:
                # Neither direction in main path, add once
                alternatives[f"{from_state}↔{to_state}"].append(None)
        else:
            alternatives[to_state].append(from_state)

    # Format alternatives
    for target, sources in alternatives.items():
        if "↔" in target:
            # Bidirectional - replace the one-way arrow in main path with bidirectional
            # by adding the bidirectional notation
            parts.append(target)
        else:
            # Filter out sources already in main path leading to this target
            valid_sources = [s for s in sources if s]
            if valid_sources:
                if len(valid_sources) == 1:
                    parts.append(f"{valid_sources[0]}→{target}")
                else:
                    parts.append(f"{'|'.join(valid_sources)}→{target}")

    if not parts:
        return ""

    # Simplify and dedupe
    result = ", ".join(parts)
    return f"[{result}]"


def _convert_edge_types(edge_types: list[dict[str, Any]]) -> list[str]:
    """Convert edge types to compact notation."""
    lines = []

    # Group edges by pattern for compression
    edge_groups: dict[tuple[str, str], list[str]] = defaultdict(list)

    for edge in edge_types:
        edge_type = edge.get("type", "")
        to_node = edge.get("to", "")
        from_node = edge.get("from", "")

        # Group by edge type for multi-source edges (like TAGGED_WITH)
        edge_groups[(edge_type, to_node)].append(from_node)

    # Output edges
    seen: set[tuple[str, str]] = set()
    for edge in edge_types:
        edge_type = edge.get("type", "")
        display_name = edge.get("displayName", "")
        from_node = edge.get("from", "")
        to_node = edge.get("to", "")

        key = (edge_type, to_node)
        if key in seen:
            continue
        seen.add(key)

        sources = edge_groups[key]

        if len(sources) > 1:
            from_str = "|".join(sources)
        else:
            from_str = from_node

        # Use display name as comment if informative
        comment = ""
        if display_name and display_name.replace(" ", "_").upper() != edge_type:
            comment = f"  # {display_name}"

        lines.append(f"{from_str} -{edge_type}-> {to_node}{comment}")

    return lines
