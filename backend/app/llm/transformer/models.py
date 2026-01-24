"""Data models for the agentic data transformer."""

import hashlib
from typing import Any, Generic, Literal, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T", bound=BaseModel)


class TransformManifest(BaseModel):
    """Manifest describing a successful transformation output."""

    artifact_path: str
    """Path to the output artifact file."""

    artifact_format: Literal["json", "jsonl"] = "jsonl"
    """Format of the output: 'json' for single object, 'jsonl' for multiple records."""

    item_count: int
    """Number of items in the output (1 for json format, N for jsonl)."""

    schema_hash: str
    """Hash of the Pydantic schema used for validation."""

    validation_passed: bool
    """Whether the output passed validation against the schema."""

    sample: list[dict[str, Any]] | None = None
    """Sample of output items (first few records)."""

    recipe_id: str | None = None
    """Optional ID for a saved recipe (for future reuse)."""

    run_id: str
    """Unique identifier for this transformation run."""


class LearnedAssets(BaseModel):
    """Assets learned during transformation that can be reused."""

    transformer_code: str | None = None
    """Python code generated in code mode."""

    prompt_refinements: list[str] = Field(default_factory=list)
    """Refinements to the original instruction discovered during iteration."""

    skill_md: str | None = None
    """Generated SKILL.md content documenting how to repeat this transformation."""


class TransformRun(BaseModel, Generic[T]):  # noqa: UP046 - Pydantic generics work better with explicit Generic
    """Result of a transformation run."""

    manifest: TransformManifest
    """Manifest describing the output artifact."""

    items: list[T] | None = None
    """Parsed and validated items (optional, may be omitted for large outputs)."""

    learned: LearnedAssets | None = None
    """Assets learned during transformation."""

    session_id: str | None = None
    """Agent session ID for debugging/resumption."""

    cost_usd: float | None = None
    """Estimated cost of the transformation in USD."""

    debug: dict[str, Any] = Field(default_factory=dict)
    """Debug information (iterations, errors, timing, etc.)."""


class TransformConfig(BaseModel):
    """Configuration for a transformation."""

    mode: Literal["direct", "code"] = "direct"
    """
    Transformation mode:
    - 'direct': Agent writes output directly (good for small outputs < ~100 records)
    - 'code': Agent writes transformer code, host executes it (good for large outputs)
    """

    output_format: Literal["json", "jsonl"] = "jsonl"
    """
    Output format:
    - 'json': Single JSON object (e.g., WorkflowDefinition)
    - 'jsonl': Multiple records, one JSON object per line
    """

    max_iterations: int = 80
    """Maximum number of agent turns (model calls). Each turn can include text or tool use."""

    timeout_seconds: int = 300
    """Overall timeout for the transformation."""

    work_dir: str | None = None
    """Working directory for the transformation. If None, a temp dir is created."""

    learn: bool = False
    """If True, generate a SKILL.md after successful transformation."""

    workflow_id: str | None = None
    """Workflow ID for graph_api.py to query existing nodes. Enables update intent."""

    db_path: str | None = None
    """Database path for graph_api.py to connect to. Defaults to DATABASE_PATH env var."""

    enable_rlm: bool = False
    """Enable RLM (Recursive Language Model) mode with persistent REPL.

    When enabled, input files are loaded into a persistent IPython kernel as the
    `context` variable. The agent uses a `repl` tool to execute Python code
    that processes this context, rather than having it in the LLM context window.

    This is useful for processing massive inputs that exceed context limits.
    """


def compute_schema_hash(model: type[BaseModel]) -> str:
    """Compute a hash of a Pydantic model's schema.

    Args:
        model: The Pydantic model class.

    Returns:
        A short hash string identifying the schema.
    """
    schema_json = model.model_json_schema()
    # Sort keys for consistent hashing
    import json

    schema_str = json.dumps(schema_json, sort_keys=True)
    return hashlib.sha256(schema_str.encode()).hexdigest()[:16]
