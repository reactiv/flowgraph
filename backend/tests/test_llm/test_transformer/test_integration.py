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


class TestRunTransformerValidation:
    """Tests for run_transformer integrated validation."""

    def test_run_transformer_fails_when_output_invalid(self, tmp_path: Path):
        """Test that run_transformer returns success=false when output is invalid."""
        from app.llm.transformer.tools import run_and_validate_transformer

        # Create a script that produces invalid output (missing required 'age' field)
        script = tmp_path / "transform.py"
        script.write_text(
            'import json\n'
            'with open("output.json", "w") as f:\n'
            '    json.dump({"name": "Alice"}, f)\n'  # Missing 'age'
        )

        # Run the transformer
        response = run_and_validate_transformer(
            script_path=script,
            work_dir=tmp_path,
            output_model=Person,
            output_format="json",
            input_paths=[],
        )

        # Should fail because output is invalid
        assert response["success"] is False
        assert response["exit_code"] == 0  # Script ran successfully
        assert "validation" in response
        assert response["validation"]["valid"] is False
        assert len(response["validation"]["errors"]) > 0

    def test_run_transformer_succeeds_when_output_valid(self, tmp_path: Path):
        """Test that run_transformer returns success=true when output is valid."""
        from app.llm.transformer.tools import run_and_validate_transformer

        # Create a script that produces valid output
        script = tmp_path / "transform.py"
        script.write_text(
            'import json\n'
            'with open("output.json", "w") as f:\n'
            '    json.dump({"name": "Alice", "age": 30}, f)\n'
        )

        # Run the transformer
        response = run_and_validate_transformer(
            script_path=script,
            work_dir=tmp_path,
            output_model=Person,
            output_format="json",
            input_paths=[],
        )

        # Should succeed because output is valid
        assert response["success"] is True
        assert response["exit_code"] == 0
        assert "validation" in response
        assert response["validation"]["valid"] is True
        assert response["validation"]["item_count"] == 1

    def test_run_transformer_fails_when_script_fails(self, tmp_path: Path):
        """Test that run_transformer returns success=false when script exits non-zero."""
        from app.llm.transformer.tools import run_and_validate_transformer

        # Create a script that exits with error
        script = tmp_path / "transform.py"
        script.write_text('import sys; sys.exit(1)\n')

        # Run the transformer
        response = run_and_validate_transformer(
            script_path=script,
            work_dir=tmp_path,
            output_model=Person,
            output_format="json",
            input_paths=[],
        )

        # Should fail because script failed
        assert response["success"] is False
        assert response["exit_code"] == 1
        # No validation section since script failed
        assert "validation" not in response

    def test_run_transformer_fails_when_no_output_produced(self, tmp_path: Path):
        """Test that run_transformer returns success=false when no output is produced."""
        from app.llm.transformer.tools import run_and_validate_transformer

        # Create a script that runs but produces no output
        script = tmp_path / "transform.py"
        script.write_text('print("Hello, world!")\n')

        # Run the transformer
        response = run_and_validate_transformer(
            script_path=script,
            work_dir=tmp_path,
            output_model=Person,
            output_format="json",
            input_paths=[],
        )

        # Should fail because no output was produced
        assert response["success"] is False
        assert response["exit_code"] == 0  # Script ran successfully
        assert "output.json" in response["error"]


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
