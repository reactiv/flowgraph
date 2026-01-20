"""Skill generator for learnable transformations.

Generates Claude skill markdown files from successful transformations,
making them quickly repeatable.
"""

import re
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from app.llm.transformer.models import LearnConfig, LearnedAssets
from app.llm.transformer.validator import get_schema_description


def slugify(text: str) -> str:
    """Convert text to a URL-friendly slug."""
    text = text.lower()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[-\s]+", "-", text)
    return text.strip("-")


def generate_skill_name(instruction: str) -> str:
    """Generate a skill name from the instruction."""
    # Extract key verbs and nouns
    words = instruction.lower().split()[:6]
    return slugify(" ".join(words))


def generate_skill_description(instruction: str, output_model: type[BaseModel]) -> str:
    """Generate a skill description from the instruction and output model."""
    model_name = output_model.__name__
    # Truncate instruction if too long
    short_instruction = instruction[:150] + "..." if len(instruction) > 150 else instruction
    return f"Transform data into {model_name} format. {short_instruction}"


def generate_skill_markdown(
    instruction: str,
    output_model: type[BaseModel],
    transformer_code: str | None,
    config: dict[str, Any],
    learn_config: LearnConfig,
    input_files: list[str] | None = None,
) -> str:
    """Generate a SKILL.md file for a learnable transformation.

    Args:
        instruction: The original transformation instruction.
        output_model: The Pydantic output model class.
        transformer_code: Generated Python code (in code mode).
        config: Transformation config dict.
        learn_config: Learning configuration.
        input_files: List of input file patterns/examples.

    Returns:
        The complete SKILL.md content as a string.
    """
    skill_name = learn_config.skill_name or generate_skill_name(instruction)
    skill_description = learn_config.skill_description or generate_skill_description(
        instruction, output_model
    )

    # Get schema description
    schema_json = get_schema_description(output_model)
    model_name = output_model.__name__
    model_module = output_model.__module__

    # Build the skill markdown
    lines = [
        "---",
        f"name: {skill_name}",
        f"description: {skill_description}",
        "---",
        "",
        f"# {skill_name.replace('-', ' ').title()}",
        "",
        "This skill was learned from a successful transformation and can be quickly repeated.",
        "",
        "## Original Instruction",
        "",
        f"> {instruction}",
        "",
        "## Output Schema",
        "",
        f"**Model**: `{model_module}:{model_name}`",
        "",
        "```json",
        schema_json,
        "```",
        "",
    ]

    # Add usage section
    lines.extend([
        "## Usage",
        "",
        "### Quick Repeat",
        "",
        "To repeat this transformation with similar input files:",
        "",
        "```bash",
        f"./scripts/dc exec -T backend uv run python -m app.llm.transformer.cli \\",
        f"    --input /path/to/input \\",
        f"    --instruction \"{instruction[:100]}...\" \\",
        f"    --model-import \"{model_module}:{model_name}\" \\",
        f"    --mode {config.get('mode', 'direct')} \\",
        f"    --format {config.get('output_format', 'jsonl')}",
        "```",
        "",
    ])

    # Add transformer code section if in code mode
    if transformer_code:
        lines.extend([
            "## Generated Transformer",
            "",
            "The following Python code was generated and validated during the transformation.",
            "You can use this directly or adapt it for similar transformations.",
            "",
            "### transform.py",
            "",
            "```python",
            transformer_code,
            "```",
            "",
            "### Running the Transformer",
            "",
            "```python",
            "import subprocess",
            "",
            "# Save the transform.py code above, then run:",
            "result = subprocess.run(",
            '    ["python", "transform.py"],',
            "    capture_output=True,",
            "    text=True,",
            "    cwd=\"/path/to/work_dir\"  # Directory with input files",
            ")",
            "print(result.stdout)",
            "```",
            "",
        ])

    # Add input file patterns if provided
    if input_files:
        lines.extend([
            "## Input Patterns",
            "",
            "This transformation was designed for the following input patterns:",
            "",
        ])
        for f in input_files[:5]:
            lines.append(f"- `{Path(f).name}`")
        lines.append("")

    # Add notes section
    lines.extend([
        "## Notes",
        "",
        "- This skill was auto-generated from a successful transformation",
        "- The transformer code (if present) passed validation against the output schema",
        "- Adapt the instruction and code as needed for different input formats",
        "",
    ])

    return "\n".join(lines)


def save_learned_skill(
    learned_assets: LearnedAssets,
    learn_config: LearnConfig,
    work_dir: Path,
) -> Path:
    """Save the learned skill to disk.

    Args:
        learned_assets: The generated skill assets.
        learn_config: Learning configuration.
        work_dir: Working directory.

    Returns:
        Path to the saved SKILL.md file.
    """
    if not learned_assets.skill_markdown:
        raise ValueError("No skill markdown to save")

    skill_name = learned_assets.skill_name or "learned-transform"

    # Determine output directory
    if learn_config.output_dir:
        output_dir = Path(learn_config.output_dir) / skill_name
    else:
        output_dir = work_dir / ".claude" / "skills" / skill_name

    output_dir.mkdir(parents=True, exist_ok=True)

    # Write SKILL.md
    skill_path = output_dir / "SKILL.md"
    skill_path.write_text(learned_assets.skill_markdown)

    # Write transform.py if present
    if learned_assets.transformer_code:
        transform_path = output_dir / "transform.py"
        transform_path.write_text(learned_assets.transformer_code)

    return skill_path
