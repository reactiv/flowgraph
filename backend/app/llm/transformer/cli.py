#!/usr/bin/env python3
"""CLI utility for testing the agentic data transformer.

Usage:
    ./scripts/dc exec -T backend uv run python -m app.llm.transformer.cli \
        --input ./path/to/inputs \
        --instruction "Convert CSV to Person records" \
        --model "name:str,age:int,email:str?"

Examples:
    # Basic usage with inline model
    ./scripts/dc exec -T backend uv run python -m app.llm.transformer.cli \
        --input /app/test_data \
        --instruction "Convert the CSV file to Person records"

    # With custom model definition
    ./scripts/dc exec -T backend uv run python -m app.llm.transformer.cli \
        --input /app/test_data \
        --instruction "Transform users" \
        --model "id:int,name:str,active:bool"

    # Code mode for larger outputs
    ./scripts/dc exec -T backend uv run python -m app.llm.transformer.cli \
        --input /app/test_data \
        --instruction "Transform all records" \
        --mode code

    # Chunked mode for very large outputs (RLM pattern)
    ./scripts/dc exec -T backend uv run python -m app.llm.transformer.cli \
        --input /app/test_data \
        --instruction "Generate 1000 records" \
        --mode chunked \
        --chunk-size 100 \
        --max-chunks 20
"""

import argparse
import asyncio
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

from pydantic import BaseModel, create_model

from app.llm.transformer import (
    ChunkConfig,
    ChunkedTransformer,
    DataTransformer,
    TransformConfig,
)


# ANSI color codes
class Colors:
    RESET = "\033[0m"
    BOLD = "\033[1m"
    DIM = "\033[2m"
    RED = "\033[31m"
    GREEN = "\033[32m"
    YELLOW = "\033[33m"
    BLUE = "\033[34m"
    MAGENTA = "\033[35m"
    CYAN = "\033[36m"


def colorize(text: str, color: str) -> str:
    """Apply ANSI color to text."""
    return f"{color}{text}{Colors.RESET}"


def import_model(import_path: str) -> type[BaseModel]:
    """Import a Pydantic model by module path.

    Format: "module.path:ClassName"

    Examples:
        "app.models.workflow:WorkflowDefinition"
        "app.models.node:Node"
    """
    if ":" not in import_path:
        raise ValueError(
            f"Invalid import path '{import_path}': expected 'module.path:ClassName'"
        )

    module_path, class_name = import_path.rsplit(":", 1)

    try:
        import importlib
        module = importlib.import_module(module_path)
        model_class = getattr(module, class_name)

        if not isinstance(model_class, type) or not issubclass(model_class, BaseModel):
            raise ValueError(f"'{class_name}' is not a Pydantic BaseModel")

        return model_class
    except ImportError as e:
        raise ValueError(f"Failed to import module '{module_path}': {e}") from e
    except AttributeError:
        raise ValueError(f"Class '{class_name}' not found in module '{module_path}'")


def parse_model_spec(spec: str) -> type[BaseModel]:
    """Parse a model specification string into a Pydantic model.

    Format: "field:type,field:type,..."
    Types: str, int, float, bool
    Append ? for optional fields: "email:str?"

    Examples:
        "name:str,age:int" -> class Model(BaseModel): name: str; age: int
        "name:str,email:str?" -> class Model(BaseModel): name: str; email: str | None = None
    """
    type_map = {
        "str": str,
        "int": int,
        "float": float,
        "bool": bool,
    }

    fields: dict[str, Any] = {}

    for field_spec in spec.split(","):
        field_spec = field_spec.strip()
        if not field_spec:
            continue

        if ":" not in field_spec:
            raise ValueError(f"Invalid field spec '{field_spec}': expected 'name:type'")

        name, type_str = field_spec.split(":", 1)
        name = name.strip()
        type_str = type_str.strip()

        optional = type_str.endswith("?")
        if optional:
            type_str = type_str[:-1]

        if type_str not in type_map:
            raise ValueError(
                f"Unknown type '{type_str}' for field '{name}'. "
                f"Supported: {', '.join(type_map.keys())}"
            )

        field_type = type_map[type_str]
        if optional:
            fields[name] = (field_type | None, None)
        else:
            fields[name] = (field_type, ...)

    return create_model("DynamicModel", **fields)


def out(text: str = "") -> None:
    """Print with immediate flush for non-TTY environments."""
    print(text, flush=True)


def print_event(event_type: str, data: dict[str, Any]) -> None:
    """Print an event to the console with formatting."""
    timestamp = datetime.now().strftime("%H:%M:%S")

    if event_type == "iteration_start":
        out()
        out(colorize(f"[{timestamp}] ", Colors.DIM) +
            colorize(f"=== Iteration {data['iteration']}/{data['max']} ===", Colors.BOLD))

    elif event_type == "text":
        text = data.get("text", "")
        out(colorize(f"[{timestamp}] ", Colors.DIM) +
            colorize("Agent: ", Colors.CYAN) + text)

    elif event_type == "tool_call":
        tool = data.get("tool", "unknown")
        tool_input = data.get("input", {})
        # Make tool calls very prominent with a banner
        out()
        out(colorize("┌" + "─" * 60, Colors.YELLOW))
        out(colorize("│ ", Colors.YELLOW) +
            colorize("TOOL CALL: ", Colors.BOLD + Colors.YELLOW) +
            colorize(tool, Colors.BOLD))
        out(colorize("└" + "─" * 60, Colors.YELLOW))

        # Format input nicely based on SDK tool names
        if tool == "Write":
            file_path = tool_input.get("file_path", "")
            content = tool_input.get("content", "")
            preview = content[:200] + "..." if len(content) > 200 else content
            out(colorize(f"  → file: {file_path}", Colors.DIM))
            out(colorize(f"  → content: {preview!r}", Colors.DIM))
        elif tool == "Read":
            out(colorize(f"  → {tool_input.get('file_path', '')}", Colors.DIM))
        elif tool == "Glob":
            out(colorize(f"  → {tool_input.get('pattern', '*')}", Colors.DIM))
        elif tool == "Grep":
            pattern = tool_input.get("pattern", "")
            path = tool_input.get("path", ".")
            out(colorize(f"  → {pattern} in {path}", Colors.DIM))
        elif tool == "Bash":
            command = tool_input.get("command", "")
            preview = command[:100] + "..." if len(command) > 100 else command
            out(colorize(f"  → {preview}", Colors.DIM))
        elif "validate_artifact" in tool:
            out(colorize(f"  → {tool_input.get('file_path', '')}", Colors.DIM))
        elif "run_transformer" in tool:
            script = tool_input.get("script_path", "./transform.py")
            out(colorize(f"  → {script}", Colors.DIM))
        else:
            out(colorize(f"  → {json.dumps(tool_input)}", Colors.DIM))

    elif event_type == "tool_result":
        tool = data.get("tool", "unknown")
        result = data.get("result", "")

        # For SDK tools, result is typically a string summary
        result_str = str(result)[:200]

        if "validate_artifact" in tool:
            # Validation result is handled by the validation event
            pass
        elif "run_transformer" in tool:
            if "success" in result_str and "true" in result_str.lower():
                out(colorize("  ← Script executed successfully", Colors.GREEN))
            elif "error" in result_str.lower() or "false" in result_str.lower():
                out(colorize(f"  ← Script result: {result_str}", Colors.RED))
            else:
                out(colorize(f"  ← {result_str}", Colors.DIM))
        elif result_str:
            # Show truncated result for other tools
            out(colorize(f"  ← {result_str}", Colors.DIM))

    elif event_type == "validation":
        valid = data.get("valid", False)
        item_count = data.get("item_count", 0)
        errors = data.get("errors", [])

        out()
        if valid:
            out(colorize(f"[{timestamp}] ", Colors.DIM) +
                colorize(f"✓ Validation passed: {item_count} items", Colors.GREEN + Colors.BOLD))
        else:
            out(colorize(f"[{timestamp}] ", Colors.DIM) +
                colorize(f"✗ Validation failed: {len(errors)} errors", Colors.RED + Colors.BOLD))
            for error in errors[:5]:  # Show first 5 errors
                out(colorize(f"         • {error}", Colors.RED))
            if len(errors) > 5:
                out(colorize(f"         • ... and {len(errors) - 5} more", Colors.RED))

    elif event_type == "complete":
        item_count = data.get("item_count", 0)
        artifact_path = data.get("artifact_path", "")
        iterations = data.get("iterations", 0)
        out()
        out(colorize(f"[{timestamp}] ", Colors.DIM) +
            colorize("=== Complete ===", Colors.GREEN + Colors.BOLD))
        out(colorize(f"         Items: {item_count}", Colors.GREEN))
        out(colorize(f"         Output: {artifact_path}", Colors.GREEN))
        out(colorize(f"         Iterations: {iterations}", Colors.GREEN))

    elif event_type == "error":
        error = data.get("error", "Unknown error")
        out(colorize(f"[{timestamp}] ", Colors.DIM) +
            colorize(f"Error: {error}", Colors.RED))

    # Chunked mode events
    elif event_type == "chunked_start":
        chunk_size = data.get("chunk_size", 50)
        max_chunks = data.get("max_chunks", 100)
        out()
        out(colorize(f"[{timestamp}] ", Colors.DIM) +
            colorize("=== Chunked Generation Mode ===", Colors.MAGENTA + Colors.BOLD))
        out(colorize(f"         Chunk size: {chunk_size}, Max chunks: {max_chunks}",
                    Colors.MAGENTA))

    elif event_type == "chunk_start":
        chunk_num = data.get("chunk_num", 0)
        items_so_far = data.get("items_so_far", 0)
        out()
        out(colorize(f"[{timestamp}] ", Colors.DIM) +
            colorize(f"--- Chunk {chunk_num} ---", Colors.MAGENTA) +
            colorize(f" (items so far: {items_so_far})", Colors.DIM))

    elif event_type == "chunk_complete":
        chunk_num = data.get("chunk_num", 0)
        items_in_chunk = data.get("items_in_chunk", 0)
        total_so_far = data.get("total_so_far", 0)
        out(colorize(f"[{timestamp}] ", Colors.DIM) +
            colorize(f"Chunk {chunk_num} complete: +{items_in_chunk} items",
                    Colors.GREEN) +
            colorize(f" (total: {total_so_far})", Colors.DIM))

    elif event_type == "chunk_empty":
        out(colorize(f"[{timestamp}] ", Colors.DIM) +
            colorize("Empty chunk received, stopping generation", Colors.YELLOW))

    elif event_type == "chunk_underflow":
        expected = data.get("expected", 0)
        got = data.get("got", 0)
        out(colorize(f"[{timestamp}] ", Colors.DIM) +
            colorize(f"Underflow: expected ~{expected} items, got {got}",
                    Colors.YELLOW))

    elif event_type == "chunk_error":
        chunk_num = data.get("chunk_num", 0)
        error = data.get("error", "Unknown error")
        out(colorize(f"[{timestamp}] ", Colors.DIM) +
            colorize(f"Chunk {chunk_num} error: {error}", Colors.RED))

    elif event_type == "chunked_complete":
        total_chunks = data.get("total_chunks", 0)
        total_items = data.get("total_items", 0)
        out()
        out(colorize(f"[{timestamp}] ", Colors.DIM) +
            colorize("=== Chunked Generation Complete ===",
                    Colors.MAGENTA + Colors.BOLD))
        out(colorize(f"         Total chunks: {total_chunks}", Colors.MAGENTA))
        out(colorize(f"         Total items: {total_items}", Colors.MAGENTA))


async def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Test the agentic data transformer",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--input", "-i",
        required=True,
        help="Path to input file or directory",
    )
    parser.add_argument(
        "--instruction",
        required=True,
        help="Natural language instruction for the transformation",
    )
    parser.add_argument(
        "--model", "-m",
        default=None,
        help="Model specification: 'field:type,field:type,...' (e.g., 'name:str,age:int')",
    )
    parser.add_argument(
        "--model-import", "-M",
        default=None,
        help="Import model: 'module:Class' (e.g., 'app.models.workflow:WorkflowDefinition')",
    )
    parser.add_argument(
        "--mode",
        choices=["direct", "code", "chunked"],
        default="direct",
        help="Transformation mode: direct, code, or chunked (default: direct)",
    )
    parser.add_argument(
        "--format", "-f",
        choices=["json", "jsonl"],
        default="jsonl",
        help="Output format (default: jsonl)",
    )
    parser.add_argument(
        "--max-turns",
        type=int,
        default=80,
        help="Maximum agent turns (default: 80)",
    )
    # Chunked mode options
    parser.add_argument(
        "--chunk-size",
        type=int,
        default=50,
        help="For chunked mode: items per chunk (default: 50)",
    )
    parser.add_argument(
        "--max-chunks",
        type=int,
        default=100,
        help="For chunked mode: maximum chunks to generate (default: 100)",
    )
    parser.add_argument(
        "--work-dir", "-w",
        help="Working directory (default: temp dir)",
    )
    parser.add_argument(
        "--quiet", "-q",
        action="store_true",
        help="Suppress streaming output, only show final result",
    )
    parser.add_argument(
        "--learn",
        action="store_true",
        help="Generate a SKILL.md documenting how to repeat this transformation",
    )

    args = parser.parse_args()

    # Validate input path
    input_path = Path(args.input)
    if not input_path.exists():
        out(colorize(f"Error: Input path not found: {input_path}", Colors.RED))
        sys.exit(1)

    # Load output model
    if args.model_import:
        try:
            output_model = import_model(args.model_import)
            model_display = args.model_import
        except ValueError as e:
            out(colorize(f"Error: {e}", Colors.RED))
            sys.exit(1)
    elif args.model:
        try:
            output_model = parse_model_spec(args.model)
            model_display = args.model
        except ValueError as e:
            out(colorize(f"Error: {e}", Colors.RED))
            sys.exit(1)
    else:
        out(colorize("Error: Must specify either --model or --model-import", Colors.RED))
        sys.exit(1)

    # Create config - use "direct" for base config even in chunked mode
    base_mode = "direct" if args.mode == "chunked" else args.mode
    config = TransformConfig(
        mode=base_mode,
        output_format=args.format,
        max_iterations=args.max_turns,
        work_dir=args.work_dir,
        learn=args.learn if args.mode != "chunked" else False,  # No learning in chunked
    )

    # Print header
    out(colorize("=== Agentic Data Transformer ===", Colors.BOLD))
    out(colorize(f"Input: {input_path}", Colors.DIM))
    out(colorize(f"Instruction: {args.instruction}", Colors.DIM))
    out(colorize(f"Model: {model_display}", Colors.DIM))
    if args.mode == "chunked":
        out(colorize(f"Mode: chunked (chunk_size={args.chunk_size}, "
                    f"max_chunks={args.max_chunks})", Colors.DIM))
    else:
        out(colorize(f"Mode: {args.mode}, Format: {args.format}", Colors.DIM))
    out()

    # Determine input paths - convert to strings for API compatibility
    input_paths: list[str | Path] = []
    if input_path.is_dir():
        input_paths = [str(p) for p in input_path.iterdir()]
    else:
        input_paths = [str(input_path)]

    # Run transformation
    try:
        if args.mode == "chunked":
            # Use ChunkedTransformer for chunked mode
            chunk_config = ChunkConfig(
                chunk_size=args.chunk_size,
                max_chunks=args.max_chunks,
            )
            chunked_transformer = ChunkedTransformer()
            result = await chunked_transformer.transform_chunked(
                input_paths=input_paths,
                instruction=args.instruction,
                output_model=output_model,
                chunk_config=chunk_config,
                transform_config=config,
                on_event=None if args.quiet else print_event,
            )
        else:
            # Use regular DataTransformer
            transformer = DataTransformer()
            result = await transformer.transform(
                input_paths=input_paths,
                instruction=args.instruction,
                output_model=output_model,
                config=config,
                on_event=None if args.quiet else print_event,
            )

        # Print final summary
        if args.quiet:
            out(colorize("=== Complete ===", Colors.GREEN + Colors.BOLD))

        out()
        out(colorize("Manifest:", Colors.BOLD))
        out(json.dumps(result.manifest.model_dump(), indent=2))

        if result.items:
            out()
            out(colorize(f"Sample output ({len(result.items)} items):", Colors.BOLD))
            for item in result.items[:3]:
                out(json.dumps(item.model_dump(), indent=2))
            if len(result.items) > 3:
                out(f"... and {len(result.items) - 3} more")

        # Display generated skill if learn mode was enabled
        if result.learned and result.learned.skill_md:
            out()
            out(colorize("Generated SKILL.md:", Colors.BOLD))
            out(result.learned.skill_md)

    except ValueError as e:
        out(colorize(f"Transformation failed: {e}", Colors.RED))
        sys.exit(1)
    except KeyboardInterrupt:
        out(colorize("\nCancelled by user", Colors.YELLOW))
        sys.exit(130)


if __name__ == "__main__":
    asyncio.run(main())
