"""Custom tools for the agentic data transformer.

Only workflow-specific tools are defined here. The Claude Agent SDK provides
built-in tools for Bash, Read, Write, etc.
"""

import json
import subprocess
import sys
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

    @tool(
        "run_transformer",
        "Execute the transform.py script you wrote to transform the input files. "
        "The script should read from the inputs in the working directory and write "
        "to the output file. Returns stdout, stderr, and exit code.",
        {"script_path": str},
    )
    async def run_transformer(args: dict[str, Any]) -> dict[str, Any]:
        """Execute the transformer script."""
        script_path = args.get("script_path", "./transform.py")

        # Resolve path relative to work_dir
        if script_path.startswith("./"):
            script_path = script_path[2:]
        resolved_path = (work_dir / script_path).resolve()

        # Security check
        if not str(resolved_path).startswith(str(work_dir.resolve())):
            error = '{"success": false, "error": "Path escapes work directory"}'
            return {"content": [{"type": "text", "text": error}]}

        if not resolved_path.exists():
            error = f'{{"success": false, "error": "Script not found: {script_path}"}}'
            return {"content": [{"type": "text", "text": error}]}

        try:
            result = subprocess.run(
                [sys.executable, str(resolved_path)],
                cwd=str(work_dir),
                capture_output=True,
                text=True,
                timeout=60,
            )

            response = {
                "success": result.returncode == 0,
                "exit_code": result.returncode,
                "stdout": result.stdout[-4000:] if len(result.stdout) > 4000 else result.stdout,
                "stderr": result.stderr[-4000:] if len(result.stderr) > 4000 else result.stderr,
            }
        except subprocess.TimeoutExpired:
            response = {"success": False, "error": "Script timed out after 60 seconds"}
        except Exception as e:
            response = {"success": False, "error": f"Execution failed: {e}"}

        return {
            "content": [
                {"type": "text", "text": json.dumps(response, indent=2)}
            ]
        }

    return create_sdk_mcp_server(
        name="transformer-tools",
        version="1.0.0",
        tools=[validate_artifact, run_transformer],
    )
