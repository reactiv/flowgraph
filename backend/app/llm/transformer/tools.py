"""Custom tools for the agentic data transformer.

Only workflow-specific tools are defined here. The Claude Agent SDK provides
built-in tools for Bash, Read, Write, etc.
"""

from pathlib import Path
from typing import Any

from claude_agent_sdk import create_sdk_mcp_server, tool
from pydantic import BaseModel

from app.llm.transformer.validator import validate_artifact as _validate_artifact


def create_transformer_tools(
    work_dir: Path,
    output_model: type[BaseModel],
    output_format: str = "jsonl",
):
    """Create custom MCP tools for the transformer.

    Args:
        work_dir: Working directory for the transformation.
        output_model: Pydantic model for validation.
        output_format: Output format ('json' or 'jsonl').

    Returns:
        SDK MCP server with custom tools.
    """

    @tool(
        "validate_artifact",
        "Validate the output file against the required Pydantic schema. "
        "Call this after writing output to check if it matches the expected structure. "
        "Returns validation errors if any, which you should fix and retry.",
        {"file_path": str},
    )
    async def validate_artifact(args: dict[str, Any]) -> dict[str, Any]:
        """Validate output file against the Pydantic schema."""
        file_path = args.get("file_path", "")

        # Resolve path relative to work_dir
        if file_path.startswith("./"):
            file_path = file_path[2:]
        resolved_path = (work_dir / file_path).resolve()

        # Security check
        if not str(resolved_path).startswith(str(work_dir.resolve())):
            error_json = '{"valid": false, "error": "Path escapes work directory"}'
            return {
                "content": [{"type": "text", "text": error_json}]
            }

        result = _validate_artifact(
            file_path=resolved_path,
            model=output_model,
            format=output_format,
        )

        import json
        response = {
            "valid": result.valid,
            "item_count": result.item_count,
            "errors": result.errors,
            "sample": result.sample,
        }

        return {
            "content": [
                {"type": "text", "text": json.dumps(response, indent=2)}
            ]
        }

    return create_sdk_mcp_server(
        name="transformer-tools",
        version="1.0.0",
        tools=[validate_artifact],
    )
