"""Main orchestrator for the agentic data transformer.

Uses the Claude Agent SDK to transform input files into validated
Pydantic-schema-compliant artifacts.
"""

import json
import logging
import shutil
import subprocess
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
    LearnedAssets,
    TransformConfig,
    TransformManifest,
    TransformRun,
    compute_schema_hash,
)
from app.llm.transformer.tools import create_transformer_tools
from app.llm.transformer.validator import (
    CustomValidationError,
    get_schema_description,
    validate_artifact_with_custom,
)

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

# Callback type for streaming events
EventCallback = Callable[[str, dict[str, Any]], None]



DIRECT_MODE_PROMPT = """You are an expert data transformer.

Your task is to transform input files into a specific output format that matches a Pydantic schema.

## Instructions

1. First, explore the input files in the working directory to understand their structure
2. Transform the data according to the user's instruction
3. Write the transformed data DIRECTLY to {output_file} using the Write tool
   - For json format: Write a single JSON object
   - For jsonl format: Write one JSON object per line (no array wrapper)
4. Call validate_artifact to check your output against the schema
5. If validation fails, read the errors, fix your output, and try again

## Output Schema (Pydantic)

{schema_json}

## Important

- DO NOT write Python scripts or code files - write the JSON output directly
- DO NOT create transform.py or any .py files
- Use the Write tool to write the output JSON directly to {output_file}
- Always validate your output before finishing
- Fix all validation errors - the output MUST pass validation
- For jsonl format, each line must be a complete, valid JSON object
- Do not wrap jsonl output in an array - each line is independent
"""

CODE_MODE_PROMPT = """You are an expert data transformer.

Your task is to write Python code that transforms input files into a validated output format.

## Instructions

1. First, list your available skills to see what capabilities you have
2. Run `ls -la .claude/skills/` to see the skills directory
3. Explore the input files in the working directory to understand their structure
4. Write a Python script to ./transform.py that transforms the inputs
5. Call run_transformer to execute your script
6. Call validate_artifact to check the output against the schema
7. If validation fails, fix your code and repeat steps 5-6

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

LEARNING_PROMPT = """
## Learning Mode

After you successfully validate your output, you MUST generate a SKILL.md file that
captures what you learned so future runs can reuse your work.

IMPORTANT: Future runs will have access to any transform.py you created. The SKILL.md
should help the agent understand the transformation without needing to re-derive it.

Write the skill to ./SKILL.md with this format:

```yaml
---
name: <short-name-for-this-transformation>
description: <when to use this skill>
---
```

# <Title>

## What This Does
Brief description of the transformation.

## Input
What input.json contains and its structure.

## Output
What gets produced and key fields.

## Key Insights
- Important patterns or mappings discovered
- Edge cases handled
- Any non-obvious decisions made
"""


class DataTransformer:
    """Orchestrates Claude to transform data into validated Pydantic outputs.

    Uses the Claude Agent SDK with built-in tools (Bash, Read, Write, etc.)
    plus a custom validate_artifact tool.
    """

    def __init__(self):
        """Initialize the transformer."""
        pass  # No API key needed - SDK handles authentication

    def _try_execute_transform_py(
        self,
        work_dir: Path,
        output_model: type[T],
        output_format: str,
        custom_validator: Callable[[Any], list[CustomValidationError]] | None = None,
        on_event: EventCallback | None = None,
    ) -> tuple[bool, TransformRun[T] | None, str | None]:
        """Try to execute an existing transform.py programmatically.

        Args:
            work_dir: Working directory containing transform.py and input files.
            output_model: Pydantic model for output validation.
            output_format: Expected output format ('json' or 'jsonl').
            custom_validator: Optional custom validator function.
            on_event: Optional callback for streaming events.

        Returns:
            Tuple of (success, result, error_message).
            If success, result contains the TransformRun.
            If failure, error_message explains why.
        """
        transform_path = work_dir / "transform.py"
        output_path = work_dir / f"output.{output_format}"

        if not transform_path.exists():
            return False, None, "transform.py not found"

        if on_event:
            on_event("phase", {
                "phase": "executing",
                "message": "Executing learned transform.py...",
            })

        try:
            # Execute transform.py
            result = subprocess.run(
                ["python", str(transform_path)],
                cwd=str(work_dir),
                capture_output=True,
                text=True,
                timeout=60,  # 60 second timeout
            )

            if result.returncode != 0:
                error_msg = result.stderr or result.stdout or "Unknown error"
                logger.warning(f"transform.py failed: {error_msg[:500]}")
                return False, None, f"transform.py exited with code {result.returncode}"

            # Check if output was created
            if not output_path.exists():
                return False, None, "transform.py did not create output file"

            # Validate the output
            validation = validate_artifact_with_custom(
                file_path=output_path,
                model=output_model,
                format=output_format,
                custom_validator=custom_validator,
            )

            if not validation.valid:
                error_msg = "; ".join(validation.errors[:3])
                logger.warning(f"Output validation failed: {error_msg}")
                return False, None, f"Output validation failed: {error_msg}"

            # Parse the output
            content = output_path.read_text()
            if output_format == "json":
                data = json.loads(content)
                items = [output_model.model_validate(data)]
            else:  # jsonl
                items = []
                for line in content.strip().split("\n"):
                    if line.strip():
                        items.append(output_model.model_validate(json.loads(line)))

            if on_event:
                on_event("phase", {
                    "phase": "complete",
                    "message": f"Successfully executed transform.py ({len(items)} items)",
                })

            # Build the result
            run_result = TransformRun(
                manifest=TransformManifest(
                    artifact_path=str(output_path),
                    artifact_format=output_format,
                    item_count=len(items),
                    schema_hash=compute_schema_hash(output_model),
                    validation_passed=True,
                    sample=[items[0].model_dump()] if items else None,
                    run_id="replay",
                ),
                items=items,
                learned=None,  # No learning in replay mode
                debug={"mode": "replay", "source": "transform.py"},
            )

            return True, run_result, None

        except subprocess.TimeoutExpired:
            logger.warning("transform.py timed out")
            return False, None, "transform.py timed out after 60 seconds"
        except Exception as e:
            logger.warning(f"Error executing transform.py: {e}")
            return False, None, str(e)

    async def transform(
        self,
        input_paths: list[str | Path],
        instruction: str,
        output_model: type[T],
        config: TransformConfig | None = None,
        on_event: EventCallback | None = None,
        custom_validator: Callable[[Any], list[CustomValidationError]] | None = None,
    ) -> TransformRun[T]:
        """Transform input files into validated Pydantic objects.

        Args:
            input_paths: Paths to input files to transform.
            instruction: Natural language instruction describing the transformation.
            output_model: Pydantic model class that each output item should match.
            config: Optional configuration for the transformation.
            on_event: Optional callback for streaming events.
            custom_validator: Optional function for domain-specific validation.
                Takes parsed data and returns a list of CustomValidationError.

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

            # Copy skills directory so agent can discover them via setting_sources
            # Merge with existing skills (e.g., learned endpoint skills) instead of overwriting
            skills_src = Path(__file__).parent.parent.parent.parent / ".claude" / "skills"
            available_skills = []
            logger.info(f"Looking for skills at: {skills_src} (exists: {skills_src.exists()})")
            skills_dest = work_dir / ".claude" / "skills"
            skills_dest.mkdir(parents=True, exist_ok=True)

            # First, collect any pre-existing skills (e.g., learned endpoint skills)
            if skills_dest.exists():
                for skill_dir in skills_dest.iterdir():
                    if skill_dir.is_dir() and (skill_dir / "SKILL.md").exists():
                        available_skills.append(skill_dir.name)
                        logger.info(f"Found pre-existing skill: {skill_dir.name}")

            if skills_src.exists():
                try:
                    # Copy each skill directory individually, preserving existing ones
                    for skill_dir in skills_src.iterdir():
                        if skill_dir.is_dir():
                            dest_skill = skills_dest / skill_dir.name
                            if not dest_skill.exists():
                                shutil.copytree(skill_dir, dest_skill)
                                if (dest_skill / "SKILL.md").exists():
                                    available_skills.append(skill_dir.name)
                            else:
                                logger.info(f"Preserving existing skill: {skill_dir.name}")
                    logger.info(f"Copied skills from {skills_src} to {skills_dest}")
                    if on_event and available_skills:
                        on_event("skills_available", {
                            "skills": available_skills,
                            "message": f"Available skills: {', '.join(available_skills)}",
                        })
                except Exception as e:
                    logger.error(f"Failed to copy skills: {e}")
                    if on_event:
                        on_event("skills_warning", {
                            "message": f"Failed to load skills: {e}",
                            "error": str(e),
                        })
            else:
                logger.warning(f"Skills directory not found at {skills_src}")
                if on_event:
                    on_event("skills_warning", {
                        "message": "Skills directory not found - external data sources unavailable",
                        "path": str(skills_src),
                    })

            # For code mode without learning, try to execute existing transform.py first
            transform_path = work_dir / "transform.py"
            if (
                config.mode == "code"
                and not config.learn
                and transform_path.exists()
            ):
                logger.info("Found existing transform.py, attempting direct execution")
                success, replay_result, error = self._try_execute_transform_py(
                    work_dir=work_dir,
                    output_model=output_model,
                    output_format=config.output_format,
                    custom_validator=custom_validator,
                    on_event=on_event,
                )

                if success and replay_result:
                    elapsed = time.time() - start_time
                    replay_result.debug["elapsed_seconds"] = round(elapsed, 2)
                    logger.info("Direct execution of transform.py succeeded")
                    return replay_result
                else:
                    # Fall back to agent
                    logger.info(f"Direct execution failed ({error}), falling back to agent")
                    if on_event:
                        on_event("phase", {
                            "phase": "fallback",
                            "message": "Direct execution failed, falling back to agent",
                            "error": error,
                        })

            # Run the agent
            result = await self._run_agent(
                work_dir=work_dir,
                instruction=instruction,
                output_model=output_model,
                config=config,
                run_id=run_id,
                input_paths=[str(p) for p in input_paths],
                on_event=on_event,
                custom_validator=custom_validator,
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
        input_paths: list[str],
        on_event: EventCallback | None = None,
        custom_validator: Callable[[Any], list[CustomValidationError]] | None = None,
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

        # Add learning prompt if learn mode is enabled
        if config.learn:
            system_prompt += LEARNING_PROMPT

        # Remind agent about skills
        system_prompt += "\n\nRemember to check your available skills."

        # Create custom MCP tools
        mcp_server = create_transformer_tools(
            work_dir=work_dir,
            output_model=output_model,
            output_format=config.output_format,
            input_paths=input_paths,
            custom_validator=custom_validator,
        )

        # Build allowed tools list
        allowed_tools = [
            "Bash",
            "Read",
            "Write",
            "Glob",
            "Grep",
            "Skill",  # Enable skill invocation for Notion, Google Drive, etc.
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
                "input": tool_input,  # Keep full input in debug
            })

            # Emit dedicated skill event when Skill tool is invoked
            if tool_name == "Skill":
                skill_name = tool_input.get("skill", "unknown")
                skill_args = tool_input.get("args", "")
                emit("skill_invoked", {
                    "skill": skill_name,
                    "args": skill_args,
                    "message": f"Using skill: {skill_name}",
                })
                logger.info(f"Skill invoked: {skill_name} with args: {skill_args}")

            return {}  # Allow tool to proceed

        # Hook to emit events after tool execution
        async def post_tool_hook(input_data: dict, tool_use_id: str, context: Any) -> dict:
            nonlocal validation_result
            tool_name = input_data.get("tool_name", "unknown")
            # The correct key is tool_response (from PostToolUseHookInput)
            raw_response = input_data.get("tool_response", "")

            # Extract text from content block format if needed
            # Response may be: str, list of dicts with 'type'/'text', or other
            tool_result = ""
            if isinstance(raw_response, str):
                tool_result = raw_response
            elif isinstance(raw_response, list):
                # Extract text from content blocks: [{'type': 'text', 'text': '...'}]
                texts = []
                for block in raw_response:
                    if isinstance(block, dict) and block.get("type") == "text":
                        texts.append(block.get("text", ""))
                    elif isinstance(block, str):
                        texts.append(block)
                tool_result = "\n".join(texts)
            elif isinstance(raw_response, dict):
                # Might be a single content block
                if raw_response.get("type") == "text":
                    tool_result = raw_response.get("text", "")
                else:
                    tool_result = json.dumps(raw_response)

            result_str = str(tool_result)[:500] if tool_result else "(no result)"
            emit("tool_result", {"tool": tool_name, "result": result_str})

            # Emit dedicated skill result event
            if tool_name == "Skill":
                skill_name = input_data.get("tool_input", {}).get("skill", "unknown")
                emit("skill_result", {
                    "skill": skill_name,
                    "result": result_str,
                    "message": f"Skill {skill_name} completed",
                })

            # Check for validation results
            if "validate_artifact" in tool_name:
                try:
                    # Try to parse as JSON
                    if isinstance(tool_result, str):
                        parsed = json.loads(tool_result)
                    elif isinstance(tool_result, dict):
                        parsed = tool_result
                    else:
                        parsed = json.loads(str(tool_result))

                    if "valid" in parsed:
                        validation_result = parsed
                        emit("validation", {
                            "valid": validation_result.get("valid", False),
                            "item_count": validation_result.get("item_count", 0),
                            "errors": validation_result.get("errors", []),
                        })
                except (json.JSONDecodeError, TypeError) as e:
                    logger.warning(f"Failed to parse validation result: {e}")

            return {}

        # Build hooks for event emission
        hooks = {
            "PreToolUse": [HookMatcher(matcher="*", hooks=[pre_tool_hook])],
            "PostToolUse": [HookMatcher(matcher="*", hooks=[post_tool_hook])],
        }

        logger.info(f"Allowed tools: {allowed_tools}")
        logger.info(f"System prompt preview: {system_prompt[:200]}...")

        # Configure the agent with hooks
        options = ClaudeAgentOptions(
            model="claude-opus-4-5-20251101",
            system_prompt=system_prompt,
            cwd=str(work_dir),
            max_turns=config.max_iterations,
            allowed_tools=allowed_tools,
            permission_mode="acceptEdits",
            mcp_servers={"transformer-tools": mcp_server},
            hooks=hooks,
            setting_sources=["project"],  # Load skills from .claude/skills/
        )

        # Emit prompts for debugging visibility
        emit("system_prompt", {"prompt": system_prompt})
        emit("user_instruction", {"instruction": instruction})
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
            final_result = validate_artifact_with_custom(
                file_path=output_path,
                model=output_model,
                format=config.output_format,
                custom_validator=custom_validator,
            )
            validation_result = {
                "valid": final_result.valid,
                "item_count": final_result.item_count,
                "errors": final_result.errors,
                "custom_errors": [e.model_dump() for e in final_result.custom_errors],
                "sample": final_result.sample,
            }

        if validation_result is None:
            raise ValueError(f"Transformation failed: no output produced at {output_file}")

        if not validation_result.get("valid", False):
            all_errors = validation_result.get("errors", [])
            custom_errors = validation_result.get("custom_errors", [])
            if custom_errors:
                custom_msgs = [
                    f"{e.get('path', '')}: {e.get('message', '')}"
                    for e in custom_errors[:5]
                ]
                all_errors = all_errors + custom_msgs
            raise ValueError(f"Transformation failed. Validation errors: {all_errors}")

        # Parse items for small outputs
        items: list[T] | None = None
        item_count = validation_result.get("item_count", 0)

        logger.debug(
            f"Parsing output: item_count={item_count}, path={output_path}, "
            f"exists={output_path.exists()}"
        )

        if item_count <= 100 and output_path.exists():
            try:
                items = self._parse_output(output_path, output_model, config.output_format)
                logger.info(f"Parsed {len(items) if items else 0} items")
            except Exception as e:
                logger.error(f"Failed to parse output items: {e}", exc_info=True)
                # Re-raise so the caller knows parsing failed
                raise ValueError(f"Output validation passed but parsing failed: {e}") from e
        elif not output_path.exists():
            logger.error(f"Output file does not exist: {output_path}")
            raise ValueError(f"Output file not found at {output_path}")

        manifest = TransformManifest(
            artifact_path=str(output_path),
            artifact_format=config.output_format,
            item_count=item_count,
            schema_hash=compute_schema_hash(output_model),
            validation_passed=True,
            sample=validation_result.get("sample"),
            run_id=run_id,
        )

        emit("transform_complete", {
            "item_count": item_count,
            "artifact_path": str(output_path),
            "iterations": tool_call_count,
        })

        # Build learned assets if learn mode is enabled
        learned = None
        if config.learn:
            learned = LearnedAssets()

            # Capture transform.py in code mode
            if config.mode == "code":
                transform_path = work_dir / "transform.py"
                if transform_path.exists():
                    learned.transformer_code = transform_path.read_text()

            # Capture generated SKILL.md (REQUIRED in learn mode)
            skill_path = work_dir / "SKILL.md"
            if skill_path.exists():
                learned.skill_md = skill_path.read_text()
            else:
                raise ValueError(
                    "Learn mode enabled but agent did not generate SKILL.md. "
                    "The transformation succeeded but learnings are required."
                )

        return TransformRun(
            manifest=manifest,
            items=items,
            learned=learned,
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
