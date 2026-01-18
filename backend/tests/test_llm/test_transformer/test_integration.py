"""Integration tests for transformer module.

These tests verify the tool execution flow without calling the Claude API.
Full end-to-end tests require ANTHROPIC_API_KEY and are marked with @pytest.mark.integration.
"""

import json
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic import BaseModel

from app.llm.transformer import (
    DataTransformer,
    TransformConfig,
    ValidationResult,
    validate_artifact,
)
from app.llm.transformer.tools import (
    ToolContext,
    execute_list_files,
    execute_read_file,
    execute_run_transformer,
    execute_tool,
    execute_validate_artifact,
    execute_write_file,
)


class Person(BaseModel):
    """Test model for transformation."""

    name: str
    age: int
    email: str | None = None


class TestToolContext:
    """Tests for ToolContext."""

    def test_resolve_relative_path(self, tmp_path: Path):
        """Test resolving a relative path."""
        ctx = ToolContext(work_dir=tmp_path, output_model=Person)

        resolved = ctx.resolve_path("./inputs/file.csv")
        assert resolved == tmp_path / "inputs" / "file.csv"

    def test_resolve_path_without_dot_slash(self, tmp_path: Path):
        """Test resolving a path without './' prefix."""
        ctx = ToolContext(work_dir=tmp_path, output_model=Person)

        resolved = ctx.resolve_path("inputs/file.csv")
        assert resolved == tmp_path / "inputs" / "file.csv"

    def test_path_escape_blocked(self, tmp_path: Path):
        """Test that paths escaping work_dir are blocked."""
        ctx = ToolContext(work_dir=tmp_path, output_model=Person)

        with pytest.raises(ValueError, match="escapes work directory"):
            ctx.resolve_path("../outside/file.txt")


class TestExecuteListFiles:
    """Tests for execute_list_files tool."""

    def test_list_files(self, tmp_path: Path):
        """Test listing files in a directory."""
        inputs_dir = tmp_path / "inputs"
        inputs_dir.mkdir()
        (inputs_dir / "data.csv").write_text("name,age\nAlice,30")
        (inputs_dir / "config.json").write_text("{}")

        ctx = ToolContext(work_dir=tmp_path, output_model=Person)
        result = execute_list_files(ctx, "./inputs")

        assert result["success"] is True
        assert len(result["files"]) == 2
        names = [f["name"] for f in result["files"]]
        assert "data.csv" in names
        assert "config.json" in names

    def test_list_nonexistent_dir(self, tmp_path: Path):
        """Test listing a non-existent directory."""
        ctx = ToolContext(work_dir=tmp_path, output_model=Person)
        result = execute_list_files(ctx, "./nonexistent")

        assert result["success"] is False
        assert "not found" in result["error"].lower()


class TestExecuteReadFile:
    """Tests for execute_read_file tool."""

    def test_read_file(self, tmp_path: Path):
        """Test reading a file."""
        inputs_dir = tmp_path / "inputs"
        inputs_dir.mkdir()
        (inputs_dir / "data.csv").write_text("name,age\nAlice,30\nBob,25")

        ctx = ToolContext(work_dir=tmp_path, output_model=Person)
        result = execute_read_file(ctx, "./inputs/data.csv")

        assert result["success"] is True
        assert "name,age" in result["content"]
        assert "Alice,30" in result["content"]

    def test_read_file_truncation(self, tmp_path: Path):
        """Test that large files are truncated."""
        inputs_dir = tmp_path / "inputs"
        inputs_dir.mkdir()
        lines = [f"line{i}" for i in range(200)]
        (inputs_dir / "large.txt").write_text("\n".join(lines))

        ctx = ToolContext(work_dir=tmp_path, output_model=Person)
        result = execute_read_file(ctx, "./inputs/large.txt", max_lines=50)

        assert result["success"] is True
        assert "truncated" in result["content"]

    def test_read_nonexistent_file(self, tmp_path: Path):
        """Test reading a non-existent file."""
        ctx = ToolContext(work_dir=tmp_path, output_model=Person)
        result = execute_read_file(ctx, "./nonexistent.txt")

        assert result["success"] is False
        assert "not found" in result["error"].lower()


class TestExecuteWriteFile:
    """Tests for execute_write_file tool."""

    def test_write_file(self, tmp_path: Path):
        """Test writing a file."""
        ctx = ToolContext(work_dir=tmp_path, output_model=Person)
        content = '{"name": "Alice", "age": 30}'

        result = execute_write_file(ctx, "./output.json", content)

        assert result["success"] is True
        assert (tmp_path / "output.json").read_text() == content

    def test_write_creates_parent_dirs(self, tmp_path: Path):
        """Test that write creates parent directories."""
        ctx = ToolContext(work_dir=tmp_path, output_model=Person)
        content = "test content"

        result = execute_write_file(ctx, "./nested/dir/file.txt", content)

        assert result["success"] is True
        assert (tmp_path / "nested" / "dir" / "file.txt").read_text() == content


class TestExecuteValidateArtifact:
    """Tests for execute_validate_artifact tool."""

    def test_validate_valid_jsonl(self, tmp_path: Path):
        """Test validating valid JSONL."""
        output_file = tmp_path / "output.jsonl"
        output_file.write_text(
            '{"name": "Alice", "age": 30}\n'
            '{"name": "Bob", "age": 25}\n'
        )

        ctx = ToolContext(
            work_dir=tmp_path,
            output_model=Person,
            output_format="jsonl",
        )
        result = execute_validate_artifact(ctx, "./output.jsonl")

        assert result["valid"] is True
        assert result["item_count"] == 2

    def test_validate_invalid_jsonl(self, tmp_path: Path):
        """Test validating invalid JSONL."""
        output_file = tmp_path / "output.jsonl"
        output_file.write_text(
            '{"name": "Alice"}\n'  # Missing age
        )

        ctx = ToolContext(
            work_dir=tmp_path,
            output_model=Person,
            output_format="jsonl",
        )
        result = execute_validate_artifact(ctx, "./output.jsonl")

        assert result["valid"] is False
        assert len(result["errors"]) > 0


class TestExecuteRunTransformer:
    """Tests for execute_run_transformer tool."""

    def test_run_valid_script(self, tmp_path: Path):
        """Test running a valid Python script."""
        script = tmp_path / "transform.py"
        script.write_text(
            'import json\n'
            'with open("output.jsonl", "w") as f:\n'
            '    f.write(json.dumps({"name": "Alice", "age": 30}) + "\\n")\n'
        )

        ctx = ToolContext(work_dir=tmp_path, output_model=Person)
        result = execute_run_transformer(ctx, "./transform.py")

        assert result["success"] is True
        assert result["exit_code"] == 0
        assert (tmp_path / "output.jsonl").exists()

    def test_run_failing_script(self, tmp_path: Path):
        """Test running a script that fails."""
        script = tmp_path / "transform.py"
        script.write_text('raise ValueError("test error")')

        ctx = ToolContext(work_dir=tmp_path, output_model=Person)
        result = execute_run_transformer(ctx, "./transform.py")

        assert result["success"] is False
        assert result["exit_code"] != 0
        assert "ValueError" in result["stderr"]

    def test_run_nonexistent_script(self, tmp_path: Path):
        """Test running a non-existent script."""
        ctx = ToolContext(work_dir=tmp_path, output_model=Person)
        result = execute_run_transformer(ctx, "./nonexistent.py")

        assert result["success"] is False
        assert "not found" in result["error"].lower()


class TestExecuteTool:
    """Tests for the execute_tool dispatcher."""

    def test_dispatch_to_correct_tool(self, tmp_path: Path):
        """Test that tools are dispatched correctly."""
        inputs_dir = tmp_path / "inputs"
        inputs_dir.mkdir()
        (inputs_dir / "test.txt").write_text("hello")

        ctx = ToolContext(work_dir=tmp_path, output_model=Person)

        # Test list_files
        result = execute_tool(ctx, "list_files", {"directory": "./inputs"})
        assert result["success"] is True

        # Test read_file
        result = execute_tool(ctx, "read_file", {"file_path": "./inputs/test.txt"})
        assert result["success"] is True

        # Test write_file
        result = execute_tool(ctx, "write_file", {"file_path": "./out.txt", "content": "test"})
        assert result["success"] is True

    def test_unknown_tool(self, tmp_path: Path):
        """Test handling unknown tool."""
        ctx = ToolContext(work_dir=tmp_path, output_model=Person)
        result = execute_tool(ctx, "unknown_tool", {})

        assert "error" in result
        assert "Unknown tool" in result["error"]


class TestDataTransformerEndToEnd:
    """End-to-end tests for DataTransformer.

    These tests mock the Claude API to avoid actual API calls.
    """

    @pytest.mark.asyncio
    async def test_direct_mode_flow(self, tmp_path: Path):
        """Test the direct mode transformation flow with mocked Claude."""
        # Create input file
        inputs_dir = tmp_path / "inputs"
        inputs_dir.mkdir()
        (inputs_dir / "data.csv").write_text("name,age\nAlice,30\nBob,25")

        # Mock Claude to return tool calls that produce valid output
        with patch("app.llm.transformer.orchestrator.anthropic.Anthropic") as mock_client_class:
            mock_client = MagicMock()
            mock_client_class.return_value = mock_client

            # Set up mock responses
            responses = [
                # First call: Claude explores files
                _mock_response([
                    _tool_use("list_files", {"directory": "./inputs"}),
                ]),
                # Second call: Claude reads the CSV
                _mock_response([
                    _tool_use("read_file", {"file_path": "./inputs/data.csv"}),
                ]),
                # Third call: Claude writes output
                _mock_response([
                    _tool_use(
                        "write_file",
                        {
                            "file_path": "./output.jsonl",
                            "content": '{"name": "Alice", "age": 30}\n{"name": "Bob", "age": 25}\n',
                        },
                    ),
                ]),
                # Fourth call: Claude validates
                _mock_response([
                    _tool_use("validate_artifact", {"file_path": "./output.jsonl"}),
                ]),
                # Fifth call: Claude finishes (no more tool calls)
                _mock_response([_text_block("Transformation complete!")]),
            ]
            mock_client.messages.create.side_effect = responses

            # Run transformation
            transformer = DataTransformer(api_key="test-key")
            transformer._client = mock_client

            config = TransformConfig(
                mode="direct",
                output_format="jsonl",
                work_dir=str(tmp_path / "work"),
            )

            result = await transformer.transform(
                input_paths=[str(inputs_dir / "data.csv")],
                instruction="Convert CSV to Person records",
                output_model=Person,
                config=config,
            )

            # Verify result
            assert result.manifest.validation_passed is True
            assert result.manifest.item_count == 2
            assert len(result.items) == 2
            assert result.items[0].name == "Alice"
            assert result.items[1].name == "Bob"


def _mock_response(content_blocks):
    """Create a mock Claude response."""
    mock = MagicMock()
    mock.content = content_blocks
    return mock


def _tool_use(name: str, input_args: dict):
    """Create a mock tool_use block."""
    mock = MagicMock()
    mock.type = "tool_use"
    mock.name = name
    mock.input = input_args
    mock.id = f"tool_{name}_{id(input_args)}"
    return mock


def _text_block(text: str):
    """Create a mock text block."""
    mock = MagicMock()
    mock.type = "text"
    mock.text = text
    return mock
