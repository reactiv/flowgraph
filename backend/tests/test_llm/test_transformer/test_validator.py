"""Tests for transformer validator."""

import tempfile
from pathlib import Path

import pytest
from pydantic import BaseModel

from app.llm.transformer.validator import (
    ValidationResult,
    get_schema_description,
    validate_artifact,
    validate_json_file,
    validate_jsonl_file,
)


class Person(BaseModel):
    """Test model for validation."""

    name: str
    age: int


class TestValidateJsonFile:
    """Tests for validate_json_file."""

    def test_valid_json(self, tmp_path: Path):
        """Test validating a valid JSON file."""
        file_path = tmp_path / "valid.json"
        file_path.write_text('{"name": "Alice", "age": 30}')

        result = validate_json_file(file_path, Person)
        assert result.valid is True
        assert result.item_count == 1
        assert result.errors == []
        assert result.sample == [{"name": "Alice", "age": 30}]

    def test_invalid_json_syntax(self, tmp_path: Path):
        """Test validating a file with invalid JSON syntax."""
        file_path = tmp_path / "invalid.json"
        file_path.write_text('{"name": "Alice", age: 30}')  # Missing quotes around age

        result = validate_json_file(file_path, Person)
        assert result.valid is False
        assert result.item_count == 0
        assert len(result.errors) == 1
        assert "Invalid JSON" in result.errors[0]

    def test_invalid_schema(self, tmp_path: Path):
        """Test validating JSON that doesn't match schema."""
        file_path = tmp_path / "wrong_schema.json"
        file_path.write_text('{"name": "Alice"}')  # Missing required 'age' field

        result = validate_json_file(file_path, Person)
        assert result.valid is False
        assert result.item_count == 0
        assert len(result.errors) == 1
        assert "age" in result.errors[0]

    def test_wrong_type(self, tmp_path: Path):
        """Test validating JSON with wrong field type."""
        file_path = tmp_path / "wrong_type.json"
        file_path.write_text('{"name": "Alice", "age": "thirty"}')  # age should be int

        result = validate_json_file(file_path, Person)
        assert result.valid is False
        assert "age" in result.errors[0]

    def test_file_not_found(self, tmp_path: Path):
        """Test validating a non-existent file."""
        file_path = tmp_path / "nonexistent.json"

        result = validate_json_file(file_path, Person)
        assert result.valid is False
        assert "not found" in result.errors[0].lower()


class TestValidateJsonlFile:
    """Tests for validate_jsonl_file."""

    def test_valid_jsonl(self, tmp_path: Path):
        """Test validating a valid JSONL file."""
        file_path = tmp_path / "valid.jsonl"
        file_path.write_text(
            '{"name": "Alice", "age": 30}\n'
            '{"name": "Bob", "age": 25}\n'
            '{"name": "Charlie", "age": 35}\n'
        )

        result = validate_jsonl_file(file_path, Person)
        assert result.valid is True
        assert result.item_count == 3
        assert result.errors == []
        assert len(result.sample) == 3

    def test_valid_jsonl_with_empty_lines(self, tmp_path: Path):
        """Test that empty lines are skipped."""
        file_path = tmp_path / "with_empty.jsonl"
        file_path.write_text(
            '{"name": "Alice", "age": 30}\n'
            "\n"
            '{"name": "Bob", "age": 25}\n'
        )

        result = validate_jsonl_file(file_path, Person)
        assert result.valid is True
        assert result.item_count == 2

    def test_invalid_line(self, tmp_path: Path):
        """Test JSONL with an invalid line."""
        file_path = tmp_path / "invalid_line.jsonl"
        file_path.write_text(
            '{"name": "Alice", "age": 30}\n'
            '{"name": "Bob"}\n'  # Missing age
            '{"name": "Charlie", "age": 35}\n'
        )

        result = validate_jsonl_file(file_path, Person)
        assert result.valid is False
        assert result.item_count == 2  # Only 2 valid items
        assert len(result.errors) >= 1
        assert "Line 2" in result.errors[0]

    def test_max_errors(self, tmp_path: Path):
        """Test that error collection stops at max_errors."""
        file_path = tmp_path / "many_errors.jsonl"
        # Create 20 lines, all invalid
        lines = ['{"name": "Person"}\n' for _ in range(20)]  # All missing age
        file_path.write_text("".join(lines))

        result = validate_jsonl_file(file_path, Person, max_errors=5)
        assert result.valid is False
        assert len(result.errors) == 6  # 5 errors + truncation message

    def test_sample_size(self, tmp_path: Path):
        """Test that sample is limited to sample_size."""
        file_path = tmp_path / "large.jsonl"
        lines = [f'{{"name": "Person{i}", "age": {i}}}\n' for i in range(10)]
        file_path.write_text("".join(lines))

        result = validate_jsonl_file(file_path, Person, sample_size=2)
        assert result.valid is True
        assert result.item_count == 10
        assert len(result.sample) == 2

    def test_file_not_found(self, tmp_path: Path):
        """Test validating a non-existent file."""
        file_path = tmp_path / "nonexistent.jsonl"

        result = validate_jsonl_file(file_path, Person)
        assert result.valid is False
        assert "not found" in result.errors[0].lower()


class TestValidateArtifact:
    """Tests for validate_artifact."""

    def test_json_format(self, tmp_path: Path):
        """Test validation with json format."""
        file_path = tmp_path / "test.json"
        file_path.write_text('{"name": "Alice", "age": 30}')

        result = validate_artifact(file_path, Person, format="json")
        assert result.valid is True

    def test_jsonl_format(self, tmp_path: Path):
        """Test validation with jsonl format."""
        file_path = tmp_path / "test.jsonl"
        file_path.write_text('{"name": "Alice", "age": 30}\n')

        result = validate_artifact(file_path, Person, format="jsonl")
        assert result.valid is True

    def test_unknown_format(self, tmp_path: Path):
        """Test validation with unknown format."""
        file_path = tmp_path / "test.csv"
        file_path.write_text("name,age\nAlice,30")

        result = validate_artifact(file_path, Person, format="csv")
        assert result.valid is False
        assert "Unknown format" in result.errors[0]


class TestGetSchemaDescription:
    """Tests for get_schema_description."""

    def test_returns_json_schema(self):
        """Test that it returns valid JSON schema."""
        import json

        schema_str = get_schema_description(Person)
        schema = json.loads(schema_str)

        assert "properties" in schema
        assert "name" in schema["properties"]
        assert "age" in schema["properties"]
        assert schema["properties"]["name"]["type"] == "string"
        assert schema["properties"]["age"]["type"] == "integer"

    def test_nested_model(self):
        """Test schema description for nested model."""
        import json

        class Address(BaseModel):
            street: str
            city: str

        class PersonWithAddress(BaseModel):
            name: str
            address: Address

        schema_str = get_schema_description(PersonWithAddress)
        schema = json.loads(schema_str)

        assert "properties" in schema
        assert "name" in schema["properties"]
        assert "address" in schema["properties"]
