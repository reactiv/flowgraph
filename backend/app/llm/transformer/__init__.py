"""Agentic data transformer module.

Transforms input files into validated Pydantic-schema-compliant artifacts
using Claude as an intelligent agent.
"""

from app.llm.transformer.models import (
    LearnedAssets,
    TransformConfig,
    TransformManifest,
    TransformRun,
    compute_schema_hash,
)
from app.llm.transformer.orchestrator import DataTransformer, EventCallback
from app.llm.transformer.validator import (
    ValidationResult,
    get_schema_description,
    validate_artifact,
    validate_json_file,
    validate_jsonl_file,
)

__all__ = [
    # Main class
    "DataTransformer",
    "EventCallback",
    # Models
    "TransformConfig",
    "TransformManifest",
    "TransformRun",
    "LearnedAssets",
    # Validation
    "ValidationResult",
    "validate_artifact",
    "validate_json_file",
    "validate_jsonl_file",
    "get_schema_description",
    # Utilities
    "compute_schema_hash",
]
