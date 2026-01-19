"""Main orchestrator for the agentic data transformer.

Uses the Claude Agent SDK to transform input files into validated
Pydantic-schema-compliant artifacts.
"""

import json
import logging
import shutil
import tempfile
import time
import uuid
from collections.abc import Callable
from pathlib import Path
from typing import Any, TypeVar

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ClaudeSDKClient,
    HookMatcher,
    ResultMessage,
    TextBlock,
    ToolResultBlock,
    ToolUseBlock,
)
from pydantic import BaseModel

from app.llm.transformer.models import (
    TransformConfig,
    TransformManifest,
    TransformRun,
    compute_schema_hash,
)
from app.llm.transformer.tools import create_transformer_tools
from app.llm.transformer.validator import get_schema_description, validate_artifact

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

# Callback type for streaming events
EventCallback = Callable[[str, dict[str, Any]], None]


DIRECT_MODE_PROMPT = """You are an expert data transformer.

Your task is to transform input files into a specific output format that matches a Pydantic schema.

## Instructions

1. First, explore the input files in the working directory to understand their structure
2. Transform the data according to the user's instruction
3. Write the transformed data to {output_file}
   - For json format: Write a single JSON object
   - For jsonl format: Write one JSON object per line (no array wrapper)
4. Call validate_artifact to check your output against the schema
5. If validation fails, read the errors, fix your output, and try again

## Output Schema (Pydantic)

{schema_json}

## Important

- Always validate your output before finishing
- Fix all validation errors - the output MUST pass validation
- For jsonl format, each line must be a complete, valid JSON object
- Do not wrap jsonl output in an array - each line is independent
"""

CODE_MODE_PROMPT = """You are an expert data transformer.

Your task is to write Python code that transforms input files into a validated output format.

## Instructions

1. First, explore the input files in the working directory to understand their structure
2. Write a Python script to ./transform.py that transforms the inputs
3. Call run_transformer to execute your script
4. Call validate_artifact to check the output against the schema
5. If validation fails, fix your code and repeat steps 3-4

## Output Schema (Pydantic)

{schema_json}

## transform.py Contract

Your script should:
- Read input files from the working directory
- Write output to {output_file}
  - For json format: json.dump(result, f, indent=2)
  - For jsonl format: One json.dumps(record) per line
- Use standard library (csv, json) or simple parsing
- Handle errors gracefully with clear error messages

## Important

- Always validate your output before finishing
- Fix all validation errors - the output MUST pass validation
- Keep code simple and readable
"""


class DataTransformer:
    """Orchestrates Claude to transform data into validated Pydantic outputs.

    Uses the Claude Agent SDK with built-in tools (Bash, Read, Write, etc.)
    plus a custom validate_artifact tool.
    """

    def __init__(self):
        """Initialize the transformer."""
        pass  # No API key needed - SDK handles authentication

    async def transform(
        self,
        input_paths: list[str | Path],
        instruction: str,
        output_model: type[T],
        config: TransformConfig | None = None,
        on_event: EventCallback | None = None,
    ) -> TransformRun[T]:
        """Transform input files into validated Pydantic objects.

        Args:
            input_paths: Paths to input files to transform.
            instruction: Natural language instruction describing the transformation.
            output_model: Pydantic model class that each output item should match.
            config: Optional configuration for the transformation.
            on_event: Optional callback for streaming events.

        Returns:
            TransformRun with the manifest, parsed items, and debug info.
        """
        if config is None:
            config = TransformConfig()

        run_id = str(uuid.uuid4())[:8]
        start_time = time.time()

        # Set up work directory
        if config.work_dir:
            work_dir = Path(config.work_dir)
            work_dir.mkdir(parents=True, exist_ok=True)
            cleanup_work_dir = False
        else:
            work_dir = Path(tempfile.mkdtemp(prefix="transform_"))
            cleanup_work_dir = True

        try:
            # Copy inputs to work directory
            for input_path in input_paths:
                input_path = Path(input_path)
                dest = work_dir / input_path.name
                if input_path.is_file():
                    shutil.copy(input_path, dest)
                elif input_path.is_dir():
                    shutil.copytree(input_path, dest)
                else:
                    raise ValueError(f"Input path not found: {input_path}")

            # Run the agent
            result = await self._run_agent(
                work_dir=work_dir,
                instruction=instruction,
                output_model=output_model,
                config=config,
                run_id=run_id,
                on_event=on_event,
            )

            elapsed = time.time() - start_time
            result.debug["elapsed_seconds"] = round(elapsed, 2)

            return result

        finally:
            if cleanup_work_dir:
                try:
                    shutil.rmtree(work_dir)
                except Exception as e:
                    logger.warning(f"Failed to clean up work directory: {e}")

    async def _run_agent(
        self,
        work_dir: Path,
        instruction: str,
        output_model: type[T],
        config: TransformConfig,
        run_id: str,
        on_event: EventCallback | None = None,
    ) -> TransformRun[T]:
        """Run the Claude Agent SDK to transform data."""

        def emit(event_type: str, data: dict[str, Any]) -> None:
            if on_event:
                on_event(event_type, data)

        # Build system prompt based on mode
        output_file = f"./output.{config.output_format}"
        schema_json = get_schema_description(output_model)

        if config.mode == "code":
            system_prompt = CODE_MODE_PROMPT.format(
                output_file=output_file,
                schema_json=schema_json,
            )
        else:
            system_prompt = DIRECT_MODE_PROMPT.format(
                output_file=output_file,
                schema_json=schema_json,
            )

        # Create custom MCP tools
        mcp_server = create_transformer_tools(
            work_dir=work_dir,
            output_model=output_model,
            output_format=config.output_format,
        )

        # Build allowed tools list
        allowed_tools = [
            "Bash",
            "Read",
            "Write",
            "Glob",
            "Grep",
            "mcp__transformer-tools__validate_artifact",
        ]
        if config.mode == "code":
            allowed_tools.append("mcp__transformer-tools__run_transformer")

        debug: dict[str, Any] = {
            "iterations": 0,
            "tool_calls": [],
            "mode": config.mode,
            "output_format": config.output_format,
        }

        validation_result = None
        tool_call_count = 0

        # Hook to emit events before tool execution
        async def pre_tool_hook(input_data: dict, tool_use_id: str, context: Any) -> dict:
            nonlocal tool_call_count
            tool_call_count += 1
            tool_name = input_data.get("tool_name", "unknown")
            tool_input = input_data.get("tool_input", {})

            emit("tool_call", {"tool": tool_name, "input": tool_input})
            debug["tool_calls"].append({
                "call_number": tool_call_count,
                "tool": tool_name,
                "input": tool_input,
            })
            return {}  # Allow tool to proceed

        # Hook to emit events after tool execution
        async def post_tool_hook(input_data: dict, tool_use_id: str, context: Any) -> dict:
            nonlocal validation_result
            tool_name = input_data.get("tool_name", "unknown")
            tool_result = input_data.get("tool_result", "")

            result_str = str(tool_result)[:500]
            emit("tool_result", {"tool": tool_name, "result": result_str})

            # Check for validation results
            if "validate_artifact" in tool_name and '"valid"' in result_str:
                try:
                    validation_result = json.loads(str(tool_result))
                    emit("validation", {
                        "valid": validation_result.get("valid", False),
                        "item_count": validation_result.get("item_count", 0),
                        "errors": validation_result.get("errors", []),
                    })
                except (json.JSONDecodeError, TypeError):
                    pass

            return {}

        # Build hooks for event emission
        hooks = {
            "PreToolUse": [HookMatcher(matcher="*", hooks=[pre_tool_hook])],
            "PostToolUse": [HookMatcher(matcher="*", hooks=[post_tool_hook])],
        }

        # Configure the agent with hooks
        options = ClaudeAgentOptions(
            system_prompt=system_prompt,
            cwd=str(work_dir),
            max_turns=config.max_iterations,
            allowed_tools=allowed_tools,
            permission_mode="acceptEdits",
            mcp_servers={"transformer-tools": mcp_server},
            hooks=hooks,
        )

        emit("iteration_start", {"iteration": 1, "max": config.max_iterations})

        async with ClaudeSDKClient(options=options) as client:
            await client.query(instruction)

            async for message in client.receive_response():
                if isinstance(message, AssistantMessage):
                    for block in message.content:
                        if isinstance(block, TextBlock):
                            emit("text", {"text": block.text})
                        elif isinstance(block, ToolUseBlock):
                            # Tool call info is handled by PreToolUse hook
                            debug["iterations"] = tool_call_count
                        elif isinstance(block, ToolResultBlock):
                            # Tool result info is handled by PostToolUse hook
                            pass

                elif isinstance(message, ResultMessage):
                    # Agent completed
                    pass

        # Final validation check
        output_path = work_dir / output_file.lstrip("./")
        if output_path.exists() and validation_result is None:
            final_result = validate_artifact(
                file_path=output_path,
                model=output_model,
                format=config.output_format,
            )
            validation_result = {
                "valid": final_result.valid,
                "item_count": final_result.item_count,
                "errors": final_result.errors,
                "sample": final_result.sample,
            }

        if validation_result is None:
            raise ValueError(f"Transformation failed: no output produced at {output_file}")

        if not validation_result.get("valid", False):
            raise ValueError(
                f"Transformation failed. Validation errors: {validation_result.get('errors', [])}"
            )

        # Parse items for small outputs
        items: list[T] | None = None
        item_count = validation_result.get("item_count", 0)

        if item_count <= 100 and output_path.exists():
            try:
                items = self._parse_output(output_path, output_model, config.output_format)
            except Exception as e:
                logger.warning(f"Failed to parse output items: {e}")

        manifest = TransformManifest(
            artifact_path=str(output_path),
            artifact_format=config.output_format,
            item_count=item_count,
            schema_hash=compute_schema_hash(output_model),
            validation_passed=True,
            sample=validation_result.get("sample"),
            run_id=run_id,
        )

        emit("complete", {
            "item_count": item_count,
            "artifact_path": str(output_path),
            "iterations": tool_call_count,
        })

        return TransformRun(
            manifest=manifest,
            items=items,
            learned=None,
            debug=debug,
        )

    def _parse_output(
        self,
        output_path: Path,
        output_model: type[T],
        output_format: str,
    ) -> list[T]:
        """Parse output file into Pydantic models."""
        items: list[T] = []

        if output_format == "json":
            content = output_path.read_text()
            data = json.loads(content)
            items.append(output_model.model_validate(data))
        else:  # jsonl
            with output_path.open() as f:
                for line in f:
                    line = line.strip()
                    if line:
                        data = json.loads(line)
                        items.append(output_model.model_validate(data))

        return items
