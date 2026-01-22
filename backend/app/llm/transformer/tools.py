"""Custom tools for the agentic data transformer.

Only workflow-specific tools are defined here. The Claude Agent SDK provides
built-in tools for Bash, Read, Write, etc.
"""

import json
import shutil
import subprocess
import sys
import tempfile
from collections.abc import Callable
from pathlib import Path
from typing import Any

from claude_agent_sdk import create_sdk_mcp_server, tool
from pydantic import BaseModel

from app.llm.transformer.validator import (
    CustomValidationError,
    validate_artifact_with_custom,
)


def run_and_validate_transformer(
    script_path: Path,
    work_dir: Path,
    output_model: type[BaseModel],
    output_format: str,
    input_paths: list[str] | None = None,
    custom_validator: Callable[[Any], list[CustomValidationError]] | None = None,
) -> dict[str, Any]:
    """Execute a transformer script and validate its output.

    This is the core logic for the run_transformer MCP tool, extracted
    for testability.

    Args:
        script_path: Path to the Python transform script.
        work_dir: Working directory for the transformation.
        output_model: Pydantic model for validation.
        output_format: Output format ('json' or 'jsonl').
        input_paths: Original input file paths for validation.
        custom_validator: Optional custom validator for domain-specific validation.

    Returns:
        Dict with success status, execution results, and validation results.
        Success is True only if BOTH execution AND validation pass.
    """
    if not script_path.exists():
        return {"success": False, "error": f"Script not found: {script_path}"}

    # Create a fresh temp directory for validation
    # This ensures the script works on original input files, not work_dir contents
    validation_dir = Path(tempfile.mkdtemp(prefix="transformer_validate_"))

    try:
        # Copy original input files to validation directory
        if input_paths:
            for input_path in input_paths:
                src = Path(input_path)
                if src.is_file():
                    shutil.copy(src, validation_dir / src.name)
                elif src.is_dir():
                    shutil.copytree(src, validation_dir / src.name)

        # Copy the script to validation directory
        shutil.copy(script_path, validation_dir / "transform.py")

        result = subprocess.run(
            [sys.executable, str(validation_dir / "transform.py")],
            cwd=str(validation_dir),
            capture_output=True,
            text=True,
            timeout=600,  # 10 minutes - transformations can be slow
        )

        # Copy output file back to work_dir if it was created
        output_filename = f"output.{output_format}"
        output_file = validation_dir / output_filename
        work_dir_output = work_dir / output_filename
        if output_file.exists():
            shutil.copy(output_file, work_dir_output)

        # Build base response with execution results
        response: dict[str, Any] = {
            "exit_code": result.returncode,
            "stdout": result.stdout[-4000:] if len(result.stdout) > 4000 else result.stdout,
            "stderr": result.stderr[-4000:] if len(result.stderr) > 4000 else result.stderr,
        }

        # If script failed, return failure immediately
        if result.returncode != 0:
            response["success"] = False
            response["error"] = "Script execution failed (non-zero exit code)"
            return response

        # Script succeeded - now validate the output
        if not work_dir_output.exists():
            response["success"] = False
            response["error"] = f"Script ran but did not produce {output_filename}"
            return response

        # Run validation on the output
        validation = validate_artifact_with_custom(
            file_path=work_dir_output,
            model=output_model,
            format=output_format,
            custom_validator=custom_validator,
        )

        # Include validation results in response
        custom_errors = [e.model_dump() for e in validation.custom_errors]
        response["validation"] = {
            "valid": validation.valid,
            "item_count": validation.item_count,
            "errors": validation.errors,
            "custom_errors": custom_errors,
        }

        # Success requires BOTH execution AND validation to pass
        response["success"] = validation.valid

        if not validation.valid:
            response["error"] = "Script ran but output failed validation"

        return response

    except subprocess.TimeoutExpired:
        return {"success": False, "error": "Script timed out after 10 minutes"}
    except Exception as e:
        return {"success": False, "error": f"Execution failed: {e}"}
    finally:
        # Clean up validation directory
        try:
            shutil.rmtree(validation_dir)
        except Exception:
            pass

# Max response size to avoid Claude Agent SDK tool result overflow
MAX_RESPONSE_SIZE = 30_000  # 30KB is safe margin under SDK limits


def create_transformer_tools(
    work_dir: Path,
    output_model: type[BaseModel],
    output_format: str = "jsonl",
    input_paths: list[str] | None = None,
    custom_validator: Callable[[Any], list[CustomValidationError]] | None = None,
):
    """Create custom MCP tools for the transformer.

    Args:
        work_dir: Working directory for the transformation.
        output_model: Pydantic model for validation.
        output_format: Output format ('json' or 'jsonl').
        input_paths: Original input file paths for validation.
        custom_validator: Optional custom validator for domain-specific validation.

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

        result = validate_artifact_with_custom(
            file_path=resolved_path,
            model=output_model,
            format=output_format,
            custom_validator=custom_validator,
        )

        custom_errors = [e.model_dump() for e in result.custom_errors]
        response = {
            "valid": result.valid,
            "item_count": result.item_count,
            "errors": result.errors,
            "custom_errors": custom_errors,
            "sample": result.sample,
        }

        # Truncate response if too large to avoid SDK overflow
        response_json = json.dumps(response, indent=2)
        if len(response_json) > MAX_RESPONSE_SIZE:
            # Progressively truncate: first sample, then custom_errors
            response["sample"] = None
            response_json = json.dumps(response, indent=2)

            if len(response_json) > MAX_RESPONSE_SIZE and custom_errors:
                # Truncate custom_errors list and add indicator
                while len(response_json) > MAX_RESPONSE_SIZE and len(custom_errors) > 1:
                    custom_errors = custom_errors[:-1]
                    response["custom_errors"] = custom_errors
                    response["custom_errors_truncated"] = len(result.custom_errors)
                    response_json = json.dumps(response, indent=2)

        return {
            "content": [
                {"type": "text", "text": response_json}
            ]
        }

    @tool(
        "run_transformer",
        "Execute the transform.py script you wrote to transform the input files. "
        "IMPORTANT: The script is validated against fresh copies of the original input "
        "files, not the work directory. Your script must handle any file extraction "
        "(e.g., unzipping) itself. Returns stdout, stderr, exit code, AND validation "
        "results. Success requires BOTH script execution AND output validation to pass.",
        {"script_path": str},
    )
    async def run_transformer(args: dict[str, Any]) -> dict[str, Any]:
        """Execute the transformer script and validate output against schema."""
        script_path_arg = args.get("script_path", "./transform.py")

        # Resolve path relative to work_dir
        if script_path_arg.startswith("./"):
            script_path_arg = script_path_arg[2:]
        resolved_path = (work_dir / script_path_arg).resolve()

        # Security check
        if not str(resolved_path).startswith(str(work_dir.resolve())):
            error = '{"success": false, "error": "Path escapes work directory"}'
            return {"content": [{"type": "text", "text": error}]}

        # Run the transformer and validate output
        response = run_and_validate_transformer(
            script_path=resolved_path,
            work_dir=work_dir,
            output_model=output_model,
            output_format=output_format,
            input_paths=input_paths,
            custom_validator=custom_validator,
        )

        # Truncate response if too large
        response_json = json.dumps(response, indent=2)
        if len(response_json) > MAX_RESPONSE_SIZE:
            # Remove validation sample if present
            if "validation" in response:
                response["validation"].pop("sample", None)
                response_json = json.dumps(response, indent=2)

            # Truncate custom_errors if still too large
            if len(response_json) > MAX_RESPONSE_SIZE and "validation" in response:
                custom_errors_raw = response["validation"].get("custom_errors", [])
                if isinstance(custom_errors_raw, list):
                    custom_errors_list = custom_errors_raw
                    while len(response_json) > MAX_RESPONSE_SIZE and len(custom_errors_list) > 1:
                        custom_errors_list = custom_errors_list[:-1]
                        response["validation"]["custom_errors"] = custom_errors_list
                        response["validation"]["custom_errors_truncated"] = True
                        response_json = json.dumps(response, indent=2)

        return {
            "content": [
                {"type": "text", "text": response_json}
            ]
        }

    return create_sdk_mcp_server(
        name="transformer-tools",
        version="1.0.0",
        tools=[validate_artifact, run_transformer],
    )
