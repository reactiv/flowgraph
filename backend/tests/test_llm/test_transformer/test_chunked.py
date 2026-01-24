"""Tests for ChunkedTransformer and ChunkConfig."""

import pytest
from pydantic import BaseModel

from app.llm.transformer.chunked import ChunkConfig, ChunkedTransformer


class TestChunkConfig:
    """Tests for ChunkConfig."""

    def test_default_values(self):
        """Test default configuration values."""
        config = ChunkConfig()
        assert config.chunk_size == 50
        assert config.max_chunks == 100
        assert config.overlap_context == 5
        assert config.validate_each_chunk is True
        assert config.stop_on_underflow is True
        assert config.underflow_threshold == 0.5

    def test_custom_values(self):
        """Test custom configuration values."""
        config = ChunkConfig(
            chunk_size=100,
            max_chunks=20,
            overlap_context=10,
            validate_each_chunk=False,
            stop_on_underflow=False,
            underflow_threshold=0.3,
        )
        assert config.chunk_size == 100
        assert config.max_chunks == 20
        assert config.overlap_context == 10
        assert config.validate_each_chunk is False
        assert config.stop_on_underflow is False
        assert config.underflow_threshold == 0.3


class TestChunkedTransformerInstructions:
    """Tests for ChunkedTransformer instruction building."""

    def test_first_chunk_instruction(self):
        """Test first chunk instruction includes chunk size."""
        transformer = ChunkedTransformer()
        instruction = transformer._build_first_chunk_instruction(
            "Transform CSV to records",
            50,
        )

        assert "Transform CSV to records" in instruction
        assert "chunk 1" in instruction.lower()
        assert "50" in instruction

    def test_continuation_instruction_with_context(self):
        """Test continuation instruction includes context items."""

        class Person(BaseModel):
            name: str
            age: int

        transformer = ChunkedTransformer()
        context_items = [
            Person(name="Alice", age=30),
            Person(name="Bob", age=25),
        ]
        instruction = transformer._build_continuation_instruction(
            "Transform CSV to records",
            50,
            100,  # items so far
            context_items,
        )

        assert "Transform CSV to records" in instruction
        assert "100" in instruction  # items so far
        assert "50" in instruction  # chunk size
        assert "Alice" in instruction  # context item
        assert "Bob" in instruction  # context item
        assert "101" in instruction or "item 101" in instruction  # start position

    def test_continuation_instruction_empty_context(self):
        """Test continuation instruction with empty context."""
        transformer = ChunkedTransformer()
        instruction = transformer._build_continuation_instruction(
            "Transform data",
            50,
            100,
            [],  # empty context
        )

        assert "Transform data" in instruction
        assert "100" in instruction


class TestChunkedTransformerExports:
    """Test that ChunkedTransformer is properly exported."""

    def test_import_from_package(self):
        """Test that ChunkedTransformer can be imported from package."""
        from app.llm.transformer import ChunkedTransformer, ChunkConfig

        assert ChunkedTransformer is not None
        assert ChunkConfig is not None

    def test_instantiation(self):
        """Test that ChunkedTransformer can be instantiated."""
        from app.llm.transformer import ChunkedTransformer

        transformer = ChunkedTransformer()
        assert transformer is not None
        assert hasattr(transformer, "transform_chunked")
        assert hasattr(transformer, "transformer")


class TestChunkConfigValidation:
    """Tests for ChunkConfig validation."""

    def test_small_chunk_size(self):
        """Test that small chunk sizes are allowed."""
        config = ChunkConfig(chunk_size=1)
        assert config.chunk_size == 1

    def test_large_chunk_size(self):
        """Test that large chunk sizes are allowed."""
        config = ChunkConfig(chunk_size=1000)
        assert config.chunk_size == 1000

    def test_zero_overlap_context(self):
        """Test zero overlap context."""
        config = ChunkConfig(overlap_context=0)
        assert config.overlap_context == 0

    def test_underflow_threshold_bounds(self):
        """Test underflow threshold at boundaries."""
        config_low = ChunkConfig(underflow_threshold=0.0)
        assert config_low.underflow_threshold == 0.0

        config_high = ChunkConfig(underflow_threshold=1.0)
        assert config_high.underflow_threshold == 1.0
