"""Tests for transformer models."""

from pydantic import BaseModel

from app.llm.transformer.models import (
    LearnedAssets,
    TransformConfig,
    TransformManifest,
    TransformRun,
    compute_schema_hash,
)


class TestTransformConfig:
    """Tests for TransformConfig."""

    def test_default_values(self):
        """Test default configuration values."""
        config = TransformConfig()
        assert config.mode == "direct"
        assert config.output_format == "jsonl"
        assert config.max_iterations == 80
        assert config.timeout_seconds == 300
        assert config.work_dir is None

    def test_custom_values(self):
        """Test custom configuration values."""
        config = TransformConfig(
            mode="code",
            output_format="json",
            max_iterations=10,
            timeout_seconds=600,
            work_dir="/tmp/work",
        )
        assert config.mode == "code"
        assert config.output_format == "json"
        assert config.max_iterations == 10
        assert config.timeout_seconds == 600
        assert config.work_dir == "/tmp/work"


class TestTransformManifest:
    """Tests for TransformManifest."""

    def test_minimal_manifest(self):
        """Test creating a manifest with required fields only."""
        manifest = TransformManifest(
            artifact_path="/path/to/output.jsonl",
            item_count=10,
            schema_hash="abc123",
            validation_passed=True,
            run_id="test-run",
        )
        assert manifest.artifact_path == "/path/to/output.jsonl"
        assert manifest.artifact_format == "jsonl"
        assert manifest.item_count == 10
        assert manifest.schema_hash == "abc123"
        assert manifest.validation_passed is True
        assert manifest.sample is None
        assert manifest.recipe_id is None
        assert manifest.run_id == "test-run"

    def test_full_manifest(self):
        """Test creating a manifest with all fields."""
        sample = [{"name": "Alice", "age": 30}]
        manifest = TransformManifest(
            artifact_path="/path/to/output.json",
            artifact_format="json",
            item_count=1,
            schema_hash="def456",
            validation_passed=True,
            sample=sample,
            recipe_id="recipe-1",
            run_id="test-run-2",
        )
        assert manifest.artifact_format == "json"
        assert manifest.sample == sample
        assert manifest.recipe_id == "recipe-1"


class TestLearnedAssets:
    """Tests for LearnedAssets."""

    def test_default_values(self):
        """Test default values."""
        learned = LearnedAssets()
        assert learned.transformer_code is None
        assert learned.prompt_refinements == []

    def test_with_code(self):
        """Test with transformer code."""
        code = "import json\nprint('hello')"
        learned = LearnedAssets(
            transformer_code=code,
            prompt_refinements=["Added date parsing"],
        )
        assert learned.transformer_code == code
        assert learned.prompt_refinements == ["Added date parsing"]


class TestTransformRun:
    """Tests for TransformRun."""

    def test_minimal_run(self):
        """Test creating a run with minimal fields."""
        manifest = TransformManifest(
            artifact_path="/output.jsonl",
            item_count=5,
            schema_hash="hash",
            validation_passed=True,
            run_id="run-1",
        )
        run: TransformRun[BaseModel] = TransformRun(manifest=manifest)
        assert run.manifest == manifest
        assert run.items is None
        assert run.learned is None
        assert run.session_id is None
        assert run.cost_usd is None
        assert run.debug == {}

    def test_full_run(self):
        """Test creating a run with all fields."""

        class Person(BaseModel):
            name: str
            age: int

        manifest = TransformManifest(
            artifact_path="/output.jsonl",
            item_count=2,
            schema_hash="hash",
            validation_passed=True,
            run_id="run-2",
        )
        items = [Person(name="Alice", age=30), Person(name="Bob", age=25)]
        learned = LearnedAssets(transformer_code="print('hi')")

        run: TransformRun[Person] = TransformRun(
            manifest=manifest,
            items=items,
            learned=learned,
            session_id="sess-1",
            cost_usd=0.05,
            debug={"iterations": 3},
        )
        assert run.items == items
        assert run.learned == learned
        assert run.session_id == "sess-1"
        assert run.cost_usd == 0.05
        assert run.debug == {"iterations": 3}


class TestComputeSchemaHash:
    """Tests for compute_schema_hash."""

    def test_consistent_hash(self):
        """Test that same schema produces same hash."""

        class Person(BaseModel):
            name: str
            age: int

        hash1 = compute_schema_hash(Person)
        hash2 = compute_schema_hash(Person)
        assert hash1 == hash2

    def test_different_schemas_different_hash(self):
        """Test that different schemas produce different hashes."""

        class Person(BaseModel):
            name: str
            age: int

        class Animal(BaseModel):
            species: str
            weight: float

        hash1 = compute_schema_hash(Person)
        hash2 = compute_schema_hash(Animal)
        assert hash1 != hash2

    def test_hash_length(self):
        """Test that hash is the expected length."""

        class Simple(BaseModel):
            value: str

        hash_val = compute_schema_hash(Simple)
        assert len(hash_val) == 16  # 16 hex chars = 64 bits
