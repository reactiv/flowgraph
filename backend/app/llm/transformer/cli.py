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
"""

import argparse
import asyncio
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

from pydantic import BaseModel, create_model

from app.llm.transformer import DataTransformer, TransformConfig


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


def print_event(event_type: str, data: dict[str, Any]) -> None:
    """Print an event to the console with formatting."""
    timestamp = datetime.now().strftime("%H:%M:%S")

    if event_type == "iteration_start":
        print()
        print(colorize(f"[{timestamp}] ", Colors.DIM) +
              colorize(f"=== Iteration {data['iteration']}/{data['max']} ===", Colors.BOLD))

    elif event_type == "text":
        text = data.get("text", "")
        print(colorize(f"[{timestamp}] ", Colors.DIM) +
              colorize("Agent: ", Colors.CYAN) + text)

    elif event_type == "tool_call":
        tool = data.get("tool", "unknown")
        tool_input = data.get("input", {})
        print(colorize(f"[{timestamp}] ", Colors.DIM) +
              colorize(f"Tool: {tool}", Colors.YELLOW))

        # Format input nicely
        if tool == "write_file":
            # Truncate content for display
            file_path = tool_input.get("file_path", "")
            content = tool_input.get("content", "")
            preview = content[:200] + "..." if len(content) > 200 else content
            print(colorize(f"         → file: {file_path}", Colors.DIM))
            print(colorize(f"         → content: {preview!r}", Colors.DIM))
        elif tool == "read_file":
            print(colorize(f"         → {tool_input.get('file_path', '')}", Colors.DIM))
        elif tool == "list_files":
            print(colorize(f"         → {tool_input.get('directory', './inputs')}", Colors.DIM))
        elif tool == "validate_artifact":
            print(colorize(f"         → {tool_input.get('file_path', '')}", Colors.DIM))
        elif tool == "run_transformer":
            script = tool_input.get("script_path", "./transform.py")
            print(colorize(f"         → {script}", Colors.DIM))
        else:
            print(colorize(f"         → {json.dumps(tool_input)}", Colors.DIM))

    elif event_type == "tool_result":
        tool = data.get("tool", "unknown")
        result = data.get("result", {})

        if tool == "list_files" and result.get("success"):
            files = result.get("files", [])
            print(colorize(f"         ← Found {len(files)} files", Colors.DIM))
        elif tool == "read_file" and result.get("success"):
            lines = result.get("line_count", 0)
            print(colorize(f"         ← Read {lines} lines", Colors.DIM))
        elif tool == "write_file" and result.get("success"):
            bytes_written = result.get("bytes_written", 0)
            print(colorize(f"         ← Wrote {bytes_written} bytes", Colors.DIM))
        elif tool == "run_transformer":
            if result.get("success"):
                print(colorize("         ← Script executed successfully", Colors.GREEN))
            else:
                error = result.get("error") or result.get("stderr", "")[:100]
                print(colorize(f"         ← Script failed: {error}", Colors.RED))
        elif tool == "validate_artifact":
            # Validation result is handled by the validation event
            pass
        elif not result.get("success", True):
            error = result.get("error", "Unknown error")
            print(colorize(f"         ← Error: {error}", Colors.RED))

    elif event_type == "validation":
        valid = data.get("valid", False)
        item_count = data.get("item_count", 0)
        errors = data.get("errors", [])

        if valid:
            print(colorize(f"[{timestamp}] ", Colors.DIM) +
                  colorize(f"✓ Validation passed: {item_count} items", Colors.GREEN))
        else:
            print(colorize(f"[{timestamp}] ", Colors.DIM) +
                  colorize(f"✗ Validation failed: {len(errors)} errors", Colors.RED))
            for error in errors[:5]:  # Show first 5 errors
                print(colorize(f"         • {error}", Colors.RED))
            if len(errors) > 5:
                print(colorize(f"         • ... and {len(errors) - 5} more", Colors.RED))

    elif event_type == "complete":
        item_count = data.get("item_count", 0)
        artifact_path = data.get("artifact_path", "")
        iterations = data.get("iterations", 0)
        print()
        print(colorize(f"[{timestamp}] ", Colors.DIM) +
              colorize("=== Complete ===", Colors.GREEN + Colors.BOLD))
        print(colorize(f"         Items: {item_count}", Colors.GREEN))
        print(colorize(f"         Output: {artifact_path}", Colors.GREEN))
        print(colorize(f"         Iterations: {iterations}", Colors.GREEN))

    elif event_type == "error":
        error = data.get("error", "Unknown error")
        print(colorize(f"[{timestamp}] ", Colors.DIM) +
              colorize(f"Error: {error}", Colors.RED))


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
        default="name:str,value:str",
        help="Model specification: 'field:type,field:type,...' (default: name:str,value:str)",
    )
    parser.add_argument(
        "--mode",
        choices=["direct", "code"],
        default="direct",
        help="Transformation mode (default: direct)",
    )
    parser.add_argument(
        "--format", "-f",
        choices=["json", "jsonl"],
        default="jsonl",
        help="Output format (default: jsonl)",
    )
    parser.add_argument(
        "--max-iterations",
        type=int,
        default=5,
        help="Maximum iterations (default: 5)",
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

    args = parser.parse_args()

    # Validate input path
    input_path = Path(args.input)
    if not input_path.exists():
        print(colorize(f"Error: Input path not found: {input_path}", Colors.RED))
        sys.exit(1)

    # Parse model spec
    try:
        output_model = parse_model_spec(args.model)
    except ValueError as e:
        print(colorize(f"Error: {e}", Colors.RED))
        sys.exit(1)

    # Create config
    config = TransformConfig(
        mode=args.mode,
        output_format=args.format,
        max_iterations=args.max_iterations,
        work_dir=args.work_dir,
    )

    # Print header
    print(colorize("=== Agentic Data Transformer ===", Colors.BOLD))
    print(colorize(f"Input: {input_path}", Colors.DIM))
    print(colorize(f"Instruction: {args.instruction}", Colors.DIM))
    print(colorize(f"Model: {args.model}", Colors.DIM))
    print(colorize(f"Mode: {args.mode}, Format: {args.format}", Colors.DIM))
    print()

    # Determine input paths - convert to strings for API compatibility
    input_paths: list[str | Path] = []
    if input_path.is_dir():
        input_paths = [str(p) for p in input_path.iterdir()]
    else:
        input_paths = [str(input_path)]

    # Run transformation
    try:
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
            print(colorize("=== Complete ===", Colors.GREEN + Colors.BOLD))

        print()
        print(colorize("Manifest:", Colors.BOLD))
        print(json.dumps(result.manifest.model_dump(), indent=2))

        if result.items:
            print()
            print(colorize(f"Sample output ({len(result.items)} items):", Colors.BOLD))
            for item in result.items[:3]:
                print(json.dumps(item.model_dump(), indent=2))
            if len(result.items) > 3:
                print(f"... and {len(result.items) - 3} more")

    except ValueError as e:
        print(colorize(f"Transformation failed: {e}", Colors.RED))
        sys.exit(1)
    except KeyboardInterrupt:
        print(colorize("\nCancelled by user", Colors.YELLOW))
        sys.exit(130)


if __name__ == "__main__":
    asyncio.run(main())
