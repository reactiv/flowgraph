"""Chunked transformer for large output generation.

Uses iterative generation to produce outputs larger than what
fits in a single context window. Each chunk is validated before
continuing, enabling generation of 10,000+ items.

This is an RLM-inspired pattern for unbounded output generation.
"""

import json
import logging
from collections.abc import Callable
from pathlib import Path
from typing import Any, TypeVar

from pydantic import BaseModel

from app.llm.transformer.models import (
    TransformConfig,
    TransformManifest,
    TransformRun,
    compute_schema_hash,
)
from app.llm.transformer.orchestrator import DataTransformer, EventCallback
from app.llm.transformer.validator import CustomValidationError

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


class ChunkConfig(BaseModel):
    """Configuration for chunked generation."""

    chunk_size: int = 50
    """Number of items to generate per chunk."""

    max_chunks: int = 100
    """Maximum number of chunks to generate (safety limit)."""

    overlap_context: int = 5
    """Number of items from previous chunk to include as context for consistency."""

    validate_each_chunk: bool = True
    """Whether to validate each chunk before continuing."""

    stop_on_underflow: bool = True
    """Stop generation when receiving significantly fewer items than requested."""

    underflow_threshold: float = 0.5
    """Threshold for underflow detection (0.5 = stop if < 50% of chunk_size)."""


class ChunkedTransformer:
    """Generate large outputs in validated chunks.

    Wraps DataTransformer to enable generation of outputs larger
    than what fits in a single context window.

    Strategy:
    1. Generate first chunk with full instruction
    2. For subsequent chunks:
       - Provide summary of what's been generated
       - Include last N items as context for consistency
       - Ask for next batch
    3. Validate each chunk before continuing
    4. Merge all chunks into final output

    Example:
        transformer = ChunkedTransformer()
        result = await transformer.transform_chunked(
            input_paths=["data.csv"],
            instruction="Transform each row into a Person record",
            output_model=Person,
            chunk_config=ChunkConfig(chunk_size=100, max_chunks=50),
        )
        # result.items contains up to 5000 Person objects
    """

    def __init__(self) -> None:
        self.transformer = DataTransformer()

    async def transform_chunked(
        self,
        input_paths: list[str | Path],
        instruction: str,
        output_model: type[T],
        chunk_config: ChunkConfig | None = None,
        transform_config: TransformConfig | None = None,
        on_event: EventCallback | None = None,
        custom_validator: Callable[[Any], list[CustomValidationError]] | None = None,
    ) -> TransformRun[T]:
        """Transform input files into validated output using chunked generation.

        Args:
            input_paths: Paths to input files.
            instruction: Natural language transformation instruction.
            output_model: Pydantic model for each output item.
            chunk_config: Configuration for chunking behavior.
            transform_config: Base transformer configuration.
            on_event: Callback for streaming events.
            custom_validator: Optional domain-specific validator.

        Returns:
            TransformRun with all generated items merged.

        Raises:
            ValueError: If the first chunk fails to generate.
        """
        chunk_config = chunk_config or ChunkConfig()
        transform_config = transform_config or TransformConfig(
            mode="direct",
            output_format="jsonl",
        )

        # Ensure we're using jsonl for chunked output
        if transform_config.output_format != "jsonl":
            logger.warning("Chunked mode works best with jsonl format, switching...")
            transform_config = TransformConfig(
                mode=transform_config.mode,
                output_format="jsonl",
                max_iterations=transform_config.max_iterations,
                learn=False,  # Don't learn in chunked mode
                work_dir=transform_config.work_dir,
                workflow_id=transform_config.workflow_id,
                db_path=transform_config.db_path,
            )

        all_items: list[T] = []
        chunk_num = 0
        last_chunk_result: TransformRun[T] | None = None

        def emit(event_type: str, data: dict[str, Any]) -> None:
            if on_event:
                on_event(event_type, data)

        emit("chunked_start", {
            "chunk_size": chunk_config.chunk_size,
            "max_chunks": chunk_config.max_chunks,
            "overlap_context": chunk_config.overlap_context,
        })

        while chunk_num < chunk_config.max_chunks:
            emit("chunk_start", {
                "chunk_num": chunk_num + 1,
                "items_so_far": len(all_items),
            })

            # Build chunk-specific instruction
            if chunk_num == 0:
                chunk_instruction = self._build_first_chunk_instruction(
                    instruction,
                    chunk_config.chunk_size,
                )
            else:
                # Get context items from previous chunk
                context_items = all_items[-chunk_config.overlap_context:] if all_items else []
                chunk_instruction = self._build_continuation_instruction(
                    instruction,
                    chunk_config.chunk_size,
                    len(all_items),
                    context_items,
                )

            try:
                chunk_result = await self.transformer.transform(
                    input_paths=[str(p) for p in input_paths],
                    instruction=chunk_instruction,
                    output_model=output_model,
                    config=transform_config,
                    on_event=on_event,
                    custom_validator=custom_validator,
                )
                last_chunk_result = chunk_result

            except ValueError as e:
                emit("chunk_error", {
                    "chunk_num": chunk_num + 1,
                    "error": str(e),
                })
                # If first chunk fails, re-raise
                if chunk_num == 0:
                    raise
                # Otherwise, stop with what we have
                logger.warning(f"Chunk {chunk_num + 1} failed, stopping: {e}")
                break

            # Extract items from chunk
            chunk_items = chunk_result.items or []

            if not chunk_items:
                emit("chunk_empty", {
                    "chunk_num": chunk_num + 1,
                    "message": "Received empty chunk, stopping generation",
                })
                break

            emit("chunk_complete", {
                "chunk_num": chunk_num + 1,
                "items_in_chunk": len(chunk_items),
                "total_so_far": len(all_items) + len(chunk_items),
            })

            all_items.extend(chunk_items)
            chunk_num += 1

            # Check for underflow (signal to stop)
            if chunk_config.stop_on_underflow:
                threshold = chunk_config.chunk_size * chunk_config.underflow_threshold
                if len(chunk_items) < threshold:
                    emit("chunk_underflow", {
                        "expected": chunk_config.chunk_size,
                        "got": len(chunk_items),
                        "threshold": threshold,
                        "message": "Received fewer items than expected, stopping generation",
                    })
                    break

        emit("chunked_complete", {
            "total_chunks": chunk_num,
            "total_items": len(all_items),
        })

        # Build final manifest
        schema_hash = ""
        if last_chunk_result:
            schema_hash = last_chunk_result.manifest.schema_hash
        else:
            schema_hash = compute_schema_hash(output_model)

        manifest = TransformManifest(
            artifact_path="(chunked)",
            artifact_format="jsonl",
            item_count=len(all_items),
            schema_hash=schema_hash,
            validation_passed=True,
            sample=[all_items[0].model_dump()] if all_items else None,
            run_id=f"chunked-{chunk_num}",
        )

        return TransformRun(
            manifest=manifest,
            items=all_items,
            learned=None,  # No learning in chunked mode
            debug={
                "mode": "chunked",
                "chunks_generated": chunk_num,
                "chunk_size": chunk_config.chunk_size,
                "total_items": len(all_items),
            },
        )

    def _build_first_chunk_instruction(
        self,
        base_instruction: str,
        chunk_size: int,
    ) -> str:
        """Build instruction for the first chunk."""
        return f"""{base_instruction}

## Chunked Generation Mode

This is chunk 1 of a multi-chunk generation. Generate the FIRST {chunk_size} items.

Focus on:
1. Establishing consistent patterns and naming conventions
2. Creating a diverse, representative sample
3. Following the schema exactly

Generate up to {chunk_size} items. If the input has fewer items, generate all of them.
"""

    def _build_continuation_instruction(
        self,
        base_instruction: str,
        chunk_size: int,
        items_so_far: int,
        context_items: list[T],
    ) -> str:
        """Build instruction for continuation chunks."""
        context_json = ""
        if context_items:
            try:
                context_examples = [
                    item.model_dump() if hasattr(item, "model_dump") else dict(item)
                    for item in context_items
                ]
                context_json = json.dumps(context_examples, indent=2, default=str)
            except Exception:
                context_json = "(context serialization failed)"

        return f"""{base_instruction}

## Chunked Generation Mode - Continuation

This is a CONTINUATION of a multi-chunk generation.

**Progress:** {items_so_far} items already generated.

**Generate next:** Up to {chunk_size} items (items {items_so_far + 1}+)

**Last {len(context_items)} items from previous chunk (maintain consistency):**
```json
{context_json}
```

CRITICAL REQUIREMENTS:
1. Continue the established patterns and naming conventions
2. Do NOT repeat any items already generated
3. Maintain referential consistency if items reference each other
4. Generate up to {chunk_size} NEW items
5. If you've processed all input data, generate fewer items or stop

Start generating from item {items_so_far + 1}.
"""
