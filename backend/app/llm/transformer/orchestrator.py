"""Main orchestrator for the agentic data transformer.

The DataTransformer class orchestrates Claude to transform input files
into validated Pydantic-schema-compliant artifacts.
"""

import asyncio
import json
import logging
import os
import shutil
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any, TypeVar, cast

import anthropic
import anthropic.types
from pydantic import BaseModel

from app.llm.transformer.models import (
    LearnedAssets,
    TransformConfig,
    TransformManifest,
    TransformRun,
    compute_schema_hash,
)
from app.llm.transformer.tools import ToolContext, execute_tool, get_tools_for_mode
from app.llm.transformer.validator import get_schema_description, validate_artifact

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


DIRECT_MODE_SYSTEM_PROMPT = """You are an expert data transformer.

Your task is to transform input files into a specific output format that matches a Pydantic schema.

## Instructions

1. First, use list_files to see what input files are available in ./inputs/
2. Use read_file to explore the input files and understand their structure
3. Transform the data according to the user's instruction
4. Write the transformed data to {output_file}
   - For json format: Write a single JSON object
   - For jsonl format: Write one JSON object per line (no array wrapper)
5. Call validate_artifact to check your output against the schema
6. If validation fails, read the errors, fix your output, and try again

## Output Schema (Pydantic)

{schema_json}

## Important

- Always validate your output before finishing
- Fix all validation errors - the output MUST pass validation
- For jsonl format, each line must be a complete, valid JSON object
- Do not wrap jsonl output in an array - each line is independent
"""

CODE_MODE_SYSTEM_PROMPT = """You are an expert data transformer.

Your task is to write Python code that transforms input files into a specific output format.

## Instructions

1. First, use list_files to see what input files are available in ./inputs/
2. Use read_file to explore the input files and understand their structure
3. Write a Python script to ./transform.py that:
   - Reads from ./inputs/
   - Transforms the data according to the user's instruction
   - Writes to {output_file}
4. Call run_transformer to execute your script
5. Call validate_artifact to check the output against the schema
6. If validation fails, fix your code and repeat steps 4-5

## Output Schema (Pydantic)

{schema_json}

## transform.py Contract

Your script should:
- Read input files from ./inputs/
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

    The transformer supports two modes:
    - direct: Claude writes the output directly (good for small outputs)
    - code: Claude writes Python code to transform the data (good for large outputs)
    """

    def __init__(self, api_key: str | None = None):
        """Initialize the transformer.

        Args:
            api_key: Anthropic API key. If not provided, uses ANTHROPIC_API_KEY env var.
        """
        self.api_key = api_key or os.getenv("ANTHROPIC_API_KEY")
        if not self.api_key:
            raise ValueError(
                "Anthropic API key required. Set ANTHROPIC_API_KEY environment variable "
                "or pass api_key parameter."
            )
        self._client = anthropic.Anthropic(api_key=self.api_key)

    async def transform(
        self,
        input_paths: list[str | Path],
        instruction: str,
        output_model: type[T],
        config: TransformConfig | None = None,
    ) -> TransformRun[T]:
        """Transform input files into validated Pydantic objects.

        Args:
            input_paths: Paths to input files to transform.
            instruction: Natural language instruction describing the transformation.
            output_model: Pydantic model class that each output item should match.
            config: Optional configuration for the transformation.

        Returns:
            TransformRun with the manifest, parsed items, and debug info.

        Raises:
            ValueError: If transformation fails after max iterations.
            TimeoutError: If transformation exceeds the configured timeout.
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
            # Set up inputs directory
            inputs_dir = work_dir / "inputs"
            inputs_dir.mkdir(exist_ok=True)

            for input_path in input_paths:
                input_path = Path(input_path)
                if input_path.is_file():
                    shutil.copy(input_path, inputs_dir / input_path.name)
                elif input_path.is_dir():
                    shutil.copytree(input_path, inputs_dir / input_path.name)
                else:
                    raise ValueError(f"Input path not found: {input_path}")

            # Determine output file path
            output_file = f"./output.{config.output_format}"

            # Run the agentic loop
            result = await self._run_agent(
                work_dir=work_dir,
                instruction=instruction,
                output_model=output_model,
                output_file=output_file,
                config=config,
                run_id=run_id,
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
        output_file: str,
        config: TransformConfig,
        run_id: str,
    ) -> TransformRun[T]:
        """Run the agentic loop to transform data.

        Args:
            work_dir: Working directory for the transformation.
            instruction: User instruction for the transformation.
            output_model: Pydantic model for validation.
            output_file: Path to the output file.
            config: Transformation configuration.
            run_id: Unique run identifier.

        Returns:
            TransformRun with results.
        """
        # Get schema description
        schema_json = get_schema_description(output_model)

        # Build system prompt
        if config.mode == "direct":
            system_prompt = DIRECT_MODE_SYSTEM_PROMPT.format(
                output_file=output_file,
                schema_json=schema_json,
            )
        else:
            system_prompt = CODE_MODE_SYSTEM_PROMPT.format(
                output_file=output_file,
                schema_json=schema_json,
            )

        # Get tools for this mode
        tools = get_tools_for_mode(config.mode)

        # Create tool context
        ctx = ToolContext(
            work_dir=work_dir,
            output_model=output_model,
            output_format=config.output_format,
        )

        # Initialize conversation
        messages: list[dict[str, Any]] = [
            {"role": "user", "content": instruction},
        ]

        debug: dict[str, Any] = {
            "iterations": 0,
            "tool_calls": [],
            "mode": config.mode,
            "output_format": config.output_format,
        }

        # Agentic loop
        iteration = 0
        validation_passed = False
        final_validation = None
        learned_code: str | None = None

        while iteration < config.max_iterations and not validation_passed:
            iteration += 1
            debug["iterations"] = iteration

            # Call Claude
            try:
                response = await self._call_claude(
                    system=system_prompt,
                    messages=messages,
                    tools=tools,
                )
            except Exception as e:
                logger.error(f"Claude API call failed: {e}")
                raise ValueError(f"Claude API call failed: {e}") from e

            # Process response
            assistant_content = response.content
            messages.append({"role": "assistant", "content": assistant_content})

            # Check for tool use blocks
            tool_use_blocks: list[anthropic.types.ToolUseBlock] = [
                cast(anthropic.types.ToolUseBlock, block)
                for block in assistant_content
                if block.type == "tool_use"
            ]

            if not tool_use_blocks:
                # No tool use - check if we have a valid output
                output_path = work_dir / output_file.lstrip("./")
                if output_path.exists():
                    final_validation = validate_artifact(
                        output_path,
                        output_model,
                        config.output_format,
                    )
                    validation_passed = final_validation.valid
                break

            # Execute tools and collect results
            tool_results = []
            for tool_use in tool_use_blocks:
                tool_name = tool_use.name
                tool_input = cast(dict[str, Any], tool_use.input)

                debug["tool_calls"].append({
                    "iteration": iteration,
                    "tool": tool_name,
                    "input": tool_input,
                })

                result = execute_tool(ctx, tool_name, tool_input)

                # Track learned code
                file_path = str(tool_input.get("file_path", ""))
                if tool_name == "write_file" and "transform.py" in file_path:
                    learned_code = cast(str | None, tool_input.get("content"))

                # Check for validation success
                if tool_name == "validate_artifact" and result.get("valid"):
                    validation_passed = True
                    final_validation = result

                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tool_use.id,
                    "content": json.dumps(result),
                })

            messages.append({"role": "user", "content": tool_results})

        # Build result
        output_path = work_dir / output_file.lstrip("./")
        schema_hash = compute_schema_hash(output_model)

        if final_validation is None and output_path.exists():
            final_validation = validate_artifact(
                output_path,
                output_model,
                config.output_format,
            )

        if final_validation is None:
            raise ValueError(
                f"Transformation failed after {iteration} iterations: no output produced"
            )

        # Handle both dict (from tool result) and ValidationResult types
        if isinstance(final_validation, dict):
            is_valid = final_validation.get("valid", False)
            errors = final_validation.get("errors", [])
        else:
            is_valid = final_validation.valid
            errors = final_validation.errors

        if not is_valid:
            raise ValueError(
                f"Transformation failed after {iteration} iterations. "
                f"Validation errors: {errors}"
            )

        # Parse items for small outputs
        items: list[T] | None = None
        if isinstance(final_validation, dict):
            item_count = final_validation.get("item_count", 0)
            sample = final_validation.get("sample")
        else:
            item_count = final_validation.item_count
            sample = final_validation.sample

        # Read and parse output for small item counts
        if item_count <= 100 and output_path.exists():
            try:
                items = self._parse_output(output_path, output_model, config.output_format)
            except Exception as e:
                logger.warning(f"Failed to parse output items: {e}")

        manifest = TransformManifest(
            artifact_path=str(output_path),
            artifact_format=config.output_format,
            item_count=item_count,
            schema_hash=schema_hash,
            validation_passed=True,
            sample=sample,
            run_id=run_id,
        )

        learned = None
        if learned_code:
            learned = LearnedAssets(transformer_code=learned_code)

        return TransformRun(
            manifest=manifest,
            items=items,
            learned=learned,
            debug=debug,
        )

    async def _call_claude(
        self,
        system: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
    ) -> anthropic.types.Message:
        """Call the Claude API with tools.

        Args:
            system: System prompt.
            messages: Conversation messages.
            tools: Tool definitions.

        Returns:
            API response.
        """
        # Run sync client in thread pool
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: self._client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=8192,
                system=system,
                messages=messages,
                tools=tools,
            ),
        )
        return response

    def _parse_output(
        self,
        output_path: Path,
        output_model: type[T],
        output_format: str,
    ) -> list[T]:
        """Parse output file into Pydantic models.

        Args:
            output_path: Path to the output file.
            output_model: Pydantic model class.
            output_format: 'json' or 'jsonl'.

        Returns:
            List of parsed models.
        """
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
