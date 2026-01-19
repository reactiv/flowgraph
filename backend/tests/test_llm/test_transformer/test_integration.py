"""Integration tests for transformer module.

These tests verify the custom MCP tool and orchestrator setup.
Full end-to-end tests require Claude Code CLI and are marked with @pytest.mark.integration.
"""

from pathlib import Path

from pydantic import BaseModel

from app.llm.transformer import (
    DataTransformer,
    TransformConfig,
    validate_artifact,
)
from app.llm.transformer.tools import create_transformer_tools


class Person(BaseModel):
    """Test model for transformation."""

    name: str
    age: int
    email: str | None = None


class TestCreateTransformerTools:
    """Tests for the custom MCP tool creation."""

    def test_creates_mcp_server(self, tmp_path: Path):
        """Test that create_transformer_tools returns an MCP server."""
        server = create_transformer_tools(
            work_dir=tmp_path,
            output_model=Person,
            output_format="jsonl",
        )
        # Server should be created (it's an SDK MCP server object)
        assert server is not None


class TestValidateArtifactTool:
    """Tests for the validate_artifact function directly."""

    def test_validate_valid_jsonl(self, tmp_path: Path):
        """Test validating valid JSONL."""
        output_file = tmp_path / "output.jsonl"
        output_file.write_text(
            '{"name": "Alice", "age": 30}\n'
            '{"name": "Bob", "age": 25}\n'
        )

        result = validate_artifact(output_file, Person, "jsonl")

        assert result.valid is True
        assert result.item_count == 2

    def test_validate_invalid_jsonl(self, tmp_path: Path):
        """Test validating invalid JSONL."""
        output_file = tmp_path / "output.jsonl"
        output_file.write_text(
            '{"name": "Alice"}\n'  # Missing age
        )

        result = validate_artifact(output_file, Person, "jsonl")

        assert result.valid is False
        assert len(result.errors) > 0

    def test_validate_valid_json(self, tmp_path: Path):
        """Test validating valid JSON."""
        output_file = tmp_path / "output.json"
        output_file.write_text('{"name": "Alice", "age": 30}')

        result = validate_artifact(output_file, Person, "json")

        assert result.valid is True
        assert result.item_count == 1


class TestDataTransformerSetup:
    """Tests for DataTransformer initialization."""

    def test_can_instantiate(self):
        """Test that DataTransformer can be instantiated."""
        transformer = DataTransformer()
        assert transformer is not None

    def test_transform_config_defaults(self):
        """Test TransformConfig default values."""
        config = TransformConfig()
        assert config.mode == "direct"
        assert config.output_format == "jsonl"
        assert config.max_iterations == 80
