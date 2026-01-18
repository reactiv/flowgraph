"""Schema validation for transformer outputs."""

import json
import logging
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ValidationError

logger = logging.getLogger(__name__)


class ValidationResult(BaseModel):
    """Result of validating an artifact against a schema."""

    valid: bool
    """Whether validation passed."""

    item_count: int
    """Number of items validated."""

    errors: list[str]
    """List of validation errors (with line numbers for JSONL)."""

    sample: list[dict[str, Any]] | None = None
    """Sample of successfully parsed items (first few)."""


def validate_json_file(
    file_path: str | Path,
    model: type[BaseModel],
) -> ValidationResult:
    """Validate a JSON file containing a single object against a Pydantic model.

    Args:
        file_path: Path to the JSON file.
        model: Pydantic model to validate against.

    Returns:
        ValidationResult with validation status and any errors.
    """
    file_path = Path(file_path)

    if not file_path.exists():
        return ValidationResult(
            valid=False,
            item_count=0,
            errors=[f"File not found: {file_path}"],
        )

    try:
        content = file_path.read_text()
    except Exception as e:
        return ValidationResult(
            valid=False,
            item_count=0,
            errors=[f"Failed to read file: {e}"],
        )

    try:
        data = json.loads(content)
    except json.JSONDecodeError as e:
        return ValidationResult(
            valid=False,
            item_count=0,
            errors=[f"Invalid JSON: {e}"],
        )

    try:
        model.model_validate(data)
        return ValidationResult(
            valid=True,
            item_count=1,
            errors=[],
            sample=[data] if isinstance(data, dict) else None,
        )
    except ValidationError as e:
        errors = []
        for error in e.errors():
            loc = ".".join(str(x) for x in error["loc"])
            msg = error["msg"]
            errors.append(f"{loc}: {msg}")
        return ValidationResult(
            valid=False,
            item_count=0,
            errors=errors,
        )


def validate_jsonl_file(
    file_path: str | Path,
    model: type[BaseModel],
    max_errors: int = 10,
    sample_size: int = 3,
) -> ValidationResult:
    """Validate a JSONL file where each line is an object against a Pydantic model.

    Streams through the file line-by-line to handle large files efficiently.

    Args:
        file_path: Path to the JSONL file.
        model: Pydantic model to validate against.
        max_errors: Maximum number of errors to collect before stopping.
        sample_size: Number of valid items to include in the sample.

    Returns:
        ValidationResult with validation status and any errors.
    """
    file_path = Path(file_path)

    if not file_path.exists():
        return ValidationResult(
            valid=False,
            item_count=0,
            errors=[f"File not found: {file_path}"],
        )

    errors: list[str] = []
    sample: list[dict[str, Any]] = []
    item_count = 0

    try:
        with file_path.open() as f:
            for line_num, line in enumerate(f, start=1):
                line = line.strip()
                if not line:
                    continue  # Skip empty lines

                # Parse JSON
                try:
                    data = json.loads(line)
                except json.JSONDecodeError as e:
                    errors.append(f"Line {line_num}: Invalid JSON - {e}")
                    if len(errors) >= max_errors:
                        errors.append(f"... (stopped after {max_errors} errors)")
                        break
                    continue

                # Validate against model
                try:
                    model.model_validate(data)
                    item_count += 1
                    if len(sample) < sample_size:
                        sample.append(data)
                except ValidationError as e:
                    for error in e.errors():
                        loc = ".".join(str(x) for x in error["loc"])
                        msg = error["msg"]
                        errors.append(f"Line {line_num}: {loc}: {msg}")
                    if len(errors) >= max_errors:
                        errors.append(f"... (stopped after {max_errors} errors)")
                        break

    except Exception as e:
        return ValidationResult(
            valid=False,
            item_count=item_count,
            errors=[f"Failed to read file: {e}"] + errors,
            sample=sample if sample else None,
        )

    return ValidationResult(
        valid=len(errors) == 0,
        item_count=item_count,
        errors=errors,
        sample=sample if sample else None,
    )


def validate_artifact(
    file_path: str | Path,
    model: type[BaseModel],
    format: str = "jsonl",
    max_errors: int = 10,
) -> ValidationResult:
    """Validate an artifact file against a Pydantic model.

    Args:
        file_path: Path to the artifact file.
        model: Pydantic model to validate against.
        format: File format ('json' or 'jsonl').
        max_errors: Maximum number of errors to collect (for JSONL).

    Returns:
        ValidationResult with validation status and any errors.
    """
    if format == "json":
        return validate_json_file(file_path, model)
    elif format == "jsonl":
        return validate_jsonl_file(file_path, model, max_errors=max_errors)
    else:
        return ValidationResult(
            valid=False,
            item_count=0,
            errors=[f"Unknown format: {format}. Expected 'json' or 'jsonl'."],
        )


def get_schema_description(model: type[BaseModel]) -> str:
    """Get a human-readable description of a Pydantic model's schema.

    This is used in the system prompt to help the agent understand
    what structure the output should have.

    Args:
        model: Pydantic model class.

    Returns:
        JSON schema as a formatted string.
    """
    schema = model.model_json_schema()
    return json.dumps(schema, indent=2)
