"""Tool definitions and implementations for the agentic data transformer.

Tools are exposed to the Claude agent to help it transform data:
- validate_artifact: Validate output against the Pydantic schema
- run_transformer: Execute a Python transformer script (code mode only)
"""

import logging
import subprocess
import sys
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from app.llm.transformer.validator import validate_artifact as _validate_artifact

logger = logging.getLogger(__name__)


# Tool definitions for the Anthropic API
TOOL_VALIDATE_ARTIFACT = {
    "name": "validate_artifact",
    "description": (
        "Validate the output file against the required Pydantic schema. "
        "Call this after writing output to check if it matches the expected structure. "
        "Returns validation errors if any, which you should fix and retry."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "file_path": {
                "type": "string",
                "description": "Path to the output file to validate (e.g., './output.jsonl')",
            },
        },
        "required": ["file_path"],
    },
}

TOOL_RUN_TRANSFORMER = {
    "name": "run_transformer",
    "description": (
        "Execute the transform.py script you wrote to transform the input files. "
        "The script should read from ./inputs/ and write to the output file. "
        "Returns the script's stdout/stderr and exit code."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "script_path": {
                "type": "string",
                "description": "Path to the transformer script (default: './transform.py')",
                "default": "./transform.py",
            },
        },
        "required": [],
    },
}

TOOL_READ_FILE = {
    "name": "read_file",
    "description": (
        "Read the contents of a file. Use this to explore input files and understand "
        "their structure before transforming them."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "file_path": {
                "type": "string",
                "description": "Path to the file to read (e.g., './inputs/data.csv')",
            },
            "max_lines": {
                "type": "integer",
                "description": "Maximum number of lines to read (default: 100)",
                "default": 100,
            },
        },
        "required": ["file_path"],
    },
}

TOOL_WRITE_FILE = {
    "name": "write_file",
    "description": (
        "Write content to a file. Use this to write your transformed output "
        "or transformer code."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "file_path": {
                "type": "string",
                "description": "Path to the file to write (e.g., './output.jsonl')",
            },
            "content": {
                "type": "string",
                "description": "Content to write to the file",
            },
        },
        "required": ["file_path", "content"],
    },
}

TOOL_LIST_FILES = {
    "name": "list_files",
    "description": "List files in a directory. Use this to see what input files are available.",
    "input_schema": {
        "type": "object",
        "properties": {
            "directory": {
                "type": "string",
                "description": "Directory path to list (default: './inputs')",
                "default": "./inputs",
            },
        },
        "required": [],
    },
}


class ToolContext:
    """Context for tool execution within a transformation run.

    Provides access to the work directory and output model for validation.
    """

    def __init__(
        self,
        work_dir: Path,
        output_model: type[BaseModel],
        output_format: str = "jsonl",
    ):
        self.work_dir = work_dir
        self.output_model = output_model
        self.output_format = output_format

    def resolve_path(self, path: str) -> Path:
        """Resolve a path relative to the work directory.

        Args:
            path: Path string (can be relative or absolute).

        Returns:
            Resolved absolute path.

        Raises:
            ValueError: If path escapes the work directory.
        """
        if path.startswith("./"):
            path = path[2:]

        resolved = (self.work_dir / path).resolve()

        # Security check: ensure path is within work_dir
        if not str(resolved).startswith(str(self.work_dir.resolve())):
            raise ValueError(f"Path escapes work directory: {path}")

        return resolved


def execute_validate_artifact(
    ctx: ToolContext,
    file_path: str,
) -> dict[str, Any]:
    """Execute the validate_artifact tool.

    Args:
        ctx: Tool context with work directory and output model.
        file_path: Path to the file to validate.

    Returns:
        Dictionary with validation results.
    """
    try:
        resolved_path = ctx.resolve_path(file_path)
    except ValueError as e:
        return {"valid": False, "error": str(e)}

    result = _validate_artifact(
        file_path=resolved_path,
        model=ctx.output_model,
        format=ctx.output_format,
    )

    return {
        "valid": result.valid,
        "item_count": result.item_count,
        "errors": result.errors,
        "sample": result.sample,
    }


def execute_run_transformer(
    ctx: ToolContext,
    script_path: str = "./transform.py",
    timeout: int = 60,
) -> dict[str, Any]:
    """Execute the run_transformer tool.

    Runs a Python script in the work directory with a timeout.

    Args:
        ctx: Tool context with work directory.
        script_path: Path to the Python script.
        timeout: Execution timeout in seconds.

    Returns:
        Dictionary with execution results.
    """
    try:
        resolved_path = ctx.resolve_path(script_path)
    except ValueError as e:
        return {"success": False, "error": str(e)}

    if not resolved_path.exists():
        return {"success": False, "error": f"Script not found: {script_path}"}

    try:
        result = subprocess.run(
            [sys.executable, str(resolved_path)],
            cwd=str(ctx.work_dir),
            capture_output=True,
            text=True,
            timeout=timeout,
        )

        return {
            "success": result.returncode == 0,
            "exit_code": result.returncode,
            "stdout": result.stdout[-4000:] if len(result.stdout) > 4000 else result.stdout,
            "stderr": result.stderr[-4000:] if len(result.stderr) > 4000 else result.stderr,
        }
    except subprocess.TimeoutExpired:
        return {"success": False, "error": f"Script timed out after {timeout} seconds"}
    except Exception as e:
        return {"success": False, "error": f"Execution failed: {e}"}


def execute_read_file(
    ctx: ToolContext,
    file_path: str,
    max_lines: int = 100,
) -> dict[str, Any]:
    """Execute the read_file tool.

    Args:
        ctx: Tool context with work directory.
        file_path: Path to the file to read.
        max_lines: Maximum number of lines to return.

    Returns:
        Dictionary with file contents.
    """
    try:
        resolved_path = ctx.resolve_path(file_path)
    except ValueError as e:
        return {"success": False, "error": str(e)}

    if not resolved_path.exists():
        return {"success": False, "error": f"File not found: {file_path}"}

    try:
        lines = []
        with resolved_path.open() as f:
            for i, line in enumerate(f):
                if i >= max_lines:
                    lines.append(f"... (truncated after {max_lines} lines)")
                    break
                lines.append(line.rstrip("\n\r"))

        return {
            "success": True,
            "content": "\n".join(lines),
            "line_count": len(lines),
        }
    except Exception as e:
        return {"success": False, "error": f"Failed to read file: {e}"}


def execute_write_file(
    ctx: ToolContext,
    file_path: str,
    content: str,
) -> dict[str, Any]:
    """Execute the write_file tool.

    Args:
        ctx: Tool context with work directory.
        file_path: Path to the file to write.
        content: Content to write.

    Returns:
        Dictionary with write results.
    """
    try:
        resolved_path = ctx.resolve_path(file_path)
    except ValueError as e:
        return {"success": False, "error": str(e)}

    # Ensure parent directory exists
    resolved_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        resolved_path.write_text(content)
        return {
            "success": True,
            "bytes_written": len(content.encode()),
            "path": str(resolved_path),
        }
    except Exception as e:
        return {"success": False, "error": f"Failed to write file: {e}"}


def execute_list_files(
    ctx: ToolContext,
    directory: str = "./inputs",
) -> dict[str, Any]:
    """Execute the list_files tool.

    Args:
        ctx: Tool context with work directory.
        directory: Directory to list.

    Returns:
        Dictionary with file listing.
    """
    try:
        resolved_path = ctx.resolve_path(directory)
    except ValueError as e:
        return {"success": False, "error": str(e)}

    if not resolved_path.exists():
        return {"success": False, "error": f"Directory not found: {directory}"}

    if not resolved_path.is_dir():
        return {"success": False, "error": f"Not a directory: {directory}"}

    try:
        files = []
        for item in resolved_path.iterdir():
            stat = item.stat()
            files.append({
                "name": item.name,
                "type": "directory" if item.is_dir() else "file",
                "size": stat.st_size if item.is_file() else None,
            })

        return {
            "success": True,
            "files": sorted(files, key=lambda x: (x["type"], x["name"])),
        }
    except Exception as e:
        return {"success": False, "error": f"Failed to list directory: {e}"}


def execute_tool(
    ctx: ToolContext,
    tool_name: str,
    tool_input: dict[str, Any],
) -> dict[str, Any]:
    """Execute a tool by name with the given input.

    Args:
        ctx: Tool context.
        tool_name: Name of the tool to execute.
        tool_input: Input arguments for the tool.

    Returns:
        Tool execution result.
    """
    if tool_name == "validate_artifact":
        return execute_validate_artifact(ctx, **tool_input)
    elif tool_name == "run_transformer":
        return execute_run_transformer(ctx, **tool_input)
    elif tool_name == "read_file":
        return execute_read_file(ctx, **tool_input)
    elif tool_name == "write_file":
        return execute_write_file(ctx, **tool_input)
    elif tool_name == "list_files":
        return execute_list_files(ctx, **tool_input)
    else:
        return {"error": f"Unknown tool: {tool_name}"}


def get_tools_for_mode(mode: str) -> list[dict[str, Any]]:
    """Get the tool definitions for a given mode.

    Args:
        mode: 'direct' or 'code'

    Returns:
        List of tool definitions for the Anthropic API.
    """
    tools = [
        TOOL_READ_FILE,
        TOOL_WRITE_FILE,
        TOOL_LIST_FILES,
        TOOL_VALIDATE_ARTIFACT,
    ]

    if mode == "code":
        tools.append(TOOL_RUN_TRANSFORMER)

    return tools
