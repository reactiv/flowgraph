# Recursive Language Models (RLM) Analysis for Flowgraph

## Executive Summary

This report analyzes the implications of **Recursive Language Models (RLMs)**, a paradigm introduced by Alex Zhang (MIT CSAIL) in October 2025, for the Flowgraph workflow graph studio. RLMs represent the next milestone in inference-time scaling after Chain-of-Thought (CoT) and ReAct-style agents, offering significant opportunities to enhance the transformer module and broader LLM integration.

**Key Finding**: The Flowgraph architecture already implements many RLM-adjacent patterns (REPL-style code execution, graph APIs, iterative validation), making it well-positioned to adopt full RLM capabilities for dramatic improvements in large-scale data generation and context handling.

---

## 1. Understanding Recursive Language Models

### 1.1 Core Concept

RLMs are an inference strategy where language models can **decompose and recursively interact with input context of unbounded length through REPL environments**. Instead of the standard approach:

```python
# Traditional LLM call
result = llm.completion(prompt, model)  # Entire context in prompt
```

RLMs use:

```python
# RLM call
result = rlm.completion(prompt, model)  # Context stored as variable in REPL
```

The key insight: **store context as a variable in an external environment** (Python REPL) that the LLM can programmatically explore, query, and recursively call sub-tasks on.

### 1.2 How RLMs Work

1. **Context as Variable**: Instead of passing 100k+ tokens in the prompt, the context is loaded into a Python variable in a REPL environment
2. **REPL Interaction**: The LLM generates code to explore, partition, grep, or transform the context
3. **Recursive Sub-calls**: The LLM can launch recursive `rlm.completion()` calls on subsets of the context
4. **Variable Output**: Results are constructed iteratively as REPL variables, enabling unbounded output length

### 1.3 Benchmark Results

| Benchmark | RLM Performance | Comparison |
|-----------|-----------------|------------|
| OOLONG (132k tokens) | RLM(GPT-5-mini) | **110% better than GPT-5** |
| BrowseComp-Plus (1000 docs) | RLM(GPT-5) | Only model with **perfect performance** |
| 10M+ token inputs | No degradation | Flat scaling vs collapse for standard models |
| Cost per query | **2-3k tokens** | vs 95k+ for direct approaches |

### 1.4 Key Benefits

- **Unbounded context length**: No "context rot" or attention dispersion
- **Unbounded output length**: Iteratively build output variables
- **Cost efficiency**: Query only what's needed via recursive decomposition
- **Flat scaling**: Performance doesn't degrade with sequence length

---

## 2. Current Flowgraph Architecture Analysis

### 2.1 Transformer Module Overview

The current `DataTransformer` (`backend/app/llm/transformer/`) uses Claude Agent SDK with:

```
orchestrator.py ─── Claude Agent SDK ─── REPL-like environment
      │                                        │
      │                                   ┌────┴────┐
      ▼                                   │         │
 TransformConfig                       tools.py  graph_api.py
  ├─ mode: direct|code                    │         │
  ├─ output_format: json|jsonl           validate  search_nodes
  └─ max_iterations: 80                  artifact   get_neighbors
```

### 2.2 Existing RLM-Adjacent Patterns

The codebase already implements several patterns that align with RLM principles:

| Pattern | Current Implementation | RLM Parallel |
|---------|----------------------|--------------|
| **Code generation** | `transform.py` in code mode | REPL code execution |
| **Context as data** | `graph_api.py` queries database | Context as variable |
| **Iterative validation** | `validate_artifact` loop | Recursive refinement |
| **Tool use** | Bash, Read, Write, Glob, Grep | REPL interaction |
| **Skills system** | `.claude/skills/` | Modular capabilities |

### 2.3 Current Limitations

Despite these patterns, the current architecture has limitations that RLMs could address:

1. **Context Window Constraints**: Large input files are passed directly to Claude, limited to ~200k tokens
2. **Batch Processing**: Scenarios generate 2-at-a-time; data batches 10-at-a-time
3. **No Recursive Decomposition**: Agent doesn't recursively sub-divide large tasks
4. **Linear Scaling**: Cost scales linearly with context size
5. **Schema Complexity**: Large WorkflowDefinitions with many node types strain context

---

## 3. Opportunities for RLM Integration

### 3.1 Opportunity: Large File Transformation

**Current State**: In code mode, the agent reads entire input files into context to understand structure.

**RLM Enhancement**:
```python
# Instead of loading entire CSV into context:
context = load_context("input.csv")  # Store as REPL variable

# Agent can explore programmatically:
headers = context[:1]  # Peek at structure
sample = context.grep("pattern")  # Search for patterns
chunk = context.partition(1000, 2000)  # Get specific rows

# Recursive sub-task:
transformed_chunk = rlm.completion(
    f"Transform this chunk: {chunk}",
    schema=output_model
)
```

**Impact**: Handle CSV/JSON files with millions of rows without context limits.

### 3.2 Opportunity: Graph-Aware Recursive Traversal

**Current State**: `graph_api.py` provides `search_nodes()` and `get_neighbors()` for querying existing data, but the agent must manually manage graph exploration.

**RLM Enhancement**:
```python
class GraphRLM:
    """RLM wrapper for graph exploration."""

    def explore_subgraph(self, root_node_id: str, depth: int = 2):
        """Recursively explore and summarize a subgraph."""
        node = get_node(root_node_id)
        neighbors = get_neighbors(root_node_id)

        # Recursive summarization of neighbors
        neighbor_summaries = []
        for n in neighbors["outgoing"][:10]:
            # Launch sub-RLM to summarize each neighbor's context
            summary = rlm.completion(
                f"Summarize the role of {n['node']['title']} in this workflow",
                context=n
            )
            neighbor_summaries.append(summary)

        return {"node": node, "neighbor_summaries": neighbor_summaries}
```

**Impact**: Enable intelligent graph exploration for large workflows (1000+ nodes).

### 3.3 Opportunity: Scenario Generation at Scale

**Current State**: `ScenarioGenerator` batches 2 scenarios at a time with full schema context.

**RLM Enhancement**:
```python
# Load schema as REPL context variable
schema_context = load_context(workflow_definition.model_dump_json())

# Generate scenarios recursively by node type
for node_type in schema_context.query("$.nodeTypes[*].name"):
    # Sub-RLM focused on one node type
    scenarios = rlm.completion(
        f"Generate scenarios for {node_type} nodes",
        context=schema_context.filter(f"$.nodeTypes[?(@.name == '{node_type}')]")
    )
```

**Impact**: Scale from 12 scenarios (large) to 100+ scenarios without context pressure.

### 3.4 Opportunity: Multi-Source Data Integration

**Current State**: FileSeeder processes one input source at a time.

**RLM Enhancement**:
```python
# Load multiple sources as context variables
notion_data = load_context(notion_export)
csv_data = load_context(uploaded_csv)
existing_graph = load_context(graph_api.search_nodes("*"))

# Agent decomposes the integration task
def integrate_sources():
    # Recursive mapping: find overlaps
    overlaps = rlm.completion(
        "Find entities that appear in both sources",
        context=[notion_data, csv_data]
    )

    # Recursive update: identify nodes to update vs create
    for entity in overlaps:
        action = rlm.completion(
            "Should this UPDATE or CREATE?",
            context=[entity, existing_graph]
        )
```

**Impact**: Intelligent multi-source data integration with deduplication.

### 3.5 Opportunity: Unbounded Output Generation

**Current State**: Direct mode limited to ~100 items; code mode generates all at once.

**RLM Enhancement**:
```python
# RLM with unbounded output capability
output_var = []  # REPL variable for results

# Generate in chunks, appending to output variable
while more_to_generate:
    chunk = rlm.completion(
        "Generate next batch of 50 nodes",
        context={"schema": schema, "generated_so_far": len(output_var)}
    )
    output_var.extend(chunk)

    # Validation as part of loop
    validation = validate_artifact(output_var)
    if not validation.valid:
        # Recursive fix
        fix = rlm.completion("Fix these validation errors", context=validation.errors)
```

**Impact**: Generate 10,000+ seed data items with consistent quality.

---

## 4. Architectural Recommendations

### 4.1 Short-Term: Enhanced Code Mode

Evolve the current code mode to be more RLM-like:

```python
# backend/app/llm/transformer/rlm_mode.py

RLM_MODE_PROMPT = """You are an expert data transformer using recursive decomposition.

## Strategy
1. Load large inputs as variables, don't read entire content
2. Explore structure with targeted queries (head, grep, sample)
3. Decompose large tasks into recursive sub-tasks
4. Build output incrementally in a variable
5. Validate chunks as you go

## Available Functions
- load_context(path) → ContextVariable
- context.head(n), context.tail(n), context.sample(n)
- context.grep(pattern), context.partition(start, end)
- sub_transform(instruction, context) → result
- append_output(items)

## Output
Write results to output variable, then save to file when complete.
"""
```

### 4.2 Medium-Term: RLM Orchestrator

Create a dedicated RLM orchestrator alongside the existing transformer:

```
backend/app/llm/
├── transformer/           # Existing agent-based transformer
│   ├── orchestrator.py
│   └── ...
└── rlm/                   # New RLM-based transformer
    ├── orchestrator.py    # RLM orchestration
    ├── repl.py           # REPL environment management
    ├── context.py        # Context variable handling
    └── recursive.py      # Recursive decomposition helpers
```

Key components:

```python
# backend/app/llm/rlm/context.py

class ContextVariable:
    """A context stored as a REPL variable, not in prompt."""

    def __init__(self, data: Any, name: str = "context"):
        self.data = data
        self.name = name
        self._index = build_index(data)  # For fast queries

    def head(self, n: int = 10) -> str:
        """Preview first n items."""

    def grep(self, pattern: str) -> list:
        """Search for pattern in context."""

    def partition(self, start: int, end: int) -> "ContextVariable":
        """Get a slice of the context."""

    def summarize(self) -> str:
        """Quick summary: type, size, structure."""
```

```python
# backend/app/llm/rlm/recursive.py

class RecursiveTransformer:
    """Recursive decomposition for large transformations."""

    async def transform(
        self,
        instruction: str,
        context: ContextVariable,
        output_model: type[BaseModel],
        max_depth: int = 5,
    ) -> TransformRun:
        # Check if context is small enough for direct processing
        if context.size < DIRECT_THRESHOLD:
            return await self._direct_transform(instruction, context, output_model)

        # Decompose into sub-tasks
        decomposition = await self._decompose(instruction, context)

        # Recursive processing
        results = []
        for sub_task in decomposition.sub_tasks:
            sub_result = await self.transform(
                sub_task.instruction,
                context.partition(sub_task.start, sub_task.end),
                output_model,
                max_depth=max_depth - 1,
            )
            results.append(sub_result)

        # Merge results
        return await self._merge(results, decomposition.merge_strategy)
```

### 4.3 Long-Term: Full RLM Integration

Integrate the official RLM library for production use:

```python
# backend/app/llm/rlm/client.py

from rlm import RLM

class FlowgraphRLM:
    """RLM client configured for Flowgraph transformations."""

    def __init__(self):
        self.rlm = RLM(
            backend="anthropic",
            backend_kwargs={"model_name": "claude-opus-4-5-20251101"},
            environment="docker",  # Isolated REPL
            verbose=True,
        )

    async def transform(
        self,
        input_paths: list[Path],
        instruction: str,
        output_model: type[BaseModel],
    ):
        # Load inputs as context variables
        context = self._prepare_context(input_paths)

        # RLM completion with recursive decomposition
        result = await self.rlm.completion(
            prompt=self._build_prompt(instruction, output_model),
            context=context,
        )

        return self._validate_and_parse(result, output_model)
```

---

## 5. Implementation Priorities

### Priority 1: Context Variable Pattern (High Impact, Low Effort)

Add a context variable abstraction to the existing code mode:

```python
# In orchestrator.py CODE_MODE_PROMPT

"""
## Working with Large Inputs

For files > 1MB, use context variable pattern:

```python
# Don't do this:
with open("huge_file.csv") as f:
    all_data = f.read()  # Loads everything into memory/context

# Do this:
import csv
def process_in_chunks(path, chunk_size=1000):
    with open(path) as f:
        reader = csv.DictReader(f)
        chunk = []
        for row in reader:
            chunk.append(row)
            if len(chunk) >= chunk_size:
                yield chunk
                chunk = []
        if chunk:
            yield chunk

# Process and validate chunks
for chunk in process_in_chunks("huge_file.csv"):
    transformed = transform_chunk(chunk)
    output.extend(transformed)
```
"""
```

### Priority 2: Recursive Graph Exploration (High Impact, Medium Effort)

Extend `graph_api.py` with recursive exploration:

```python
# backend/app/llm/transformer/graph_api.py

def explore_graph(
    node_type: str | None = None,
    max_nodes: int = 100,
    summarize: bool = True,
) -> dict[str, Any]:
    """Explore the graph structure with optional summarization.

    Returns structure overview without loading all data into context.
    """
    counts = count_nodes_by_type()

    if summarize:
        return {
            "overview": f"Graph has {sum(counts.values())} nodes across {len(counts)} types",
            "node_types": counts,
            "sample_per_type": {
                nt: search_nodes(nt, limit=3)
                for nt in list(counts.keys())[:5]
            }
        }

    return {"node_types": counts}


def recursive_subgraph(
    root_id: str,
    depth: int = 2,
    max_per_level: int = 10,
) -> dict[str, Any]:
    """Get a subgraph rooted at node, limited by depth and breadth.

    Use this to explore around a specific node without loading
    the entire graph.
    """
    node = get_node(root_id)
    if not node or depth <= 0:
        return node

    neighbors = get_neighbors(root_id)

    return {
        "node": node,
        "outgoing": [
            recursive_subgraph(n["node"]["id"], depth - 1, max_per_level)
            for n in neighbors["outgoing"][:max_per_level]
        ],
        "incoming": [
            recursive_subgraph(n["node"]["id"], depth - 1, max_per_level)
            for n in neighbors["incoming"][:max_per_level]
        ],
    }
```

### Priority 3: Chunked Output Generation (Medium Impact, Medium Effort)

Add a chunked generation mode for large outputs:

```python
# backend/app/llm/transformer/chunked.py

class ChunkedTransformer:
    """Generate large outputs in validated chunks."""

    async def transform_chunked(
        self,
        input_paths: list[Path],
        instruction: str,
        output_model: type[BaseModel],
        chunk_size: int = 50,
        max_chunks: int = 100,
    ) -> TransformRun:
        all_items = []
        chunk_num = 0

        while chunk_num < max_chunks:
            # Generate next chunk with context about what's already generated
            chunk_instruction = f"""
            {instruction}

            Already generated: {len(all_items)} items
            Generate next {chunk_size} items (chunk {chunk_num + 1}).
            Ensure consistency with previously generated items.
            """

            chunk_result = await self.transformer.transform(
                input_paths=input_paths,
                instruction=chunk_instruction,
                output_model=output_model,
                config=TransformConfig(mode="direct", output_format="jsonl"),
            )

            if not chunk_result.items:
                break  # No more items to generate

            all_items.extend(chunk_result.items)
            chunk_num += 1

            # Check for completion signal
            if len(chunk_result.items) < chunk_size:
                break

        return self._combine_results(all_items)
```

### Priority 4: Full RLM Library Integration (High Impact, High Effort)

After validating patterns with custom implementation, integrate the official library:

```bash
# Add to backend/pyproject.toml
uv add rlm
```

---

## 6. Specific Use Cases

### 6.1 Large CSV Import

**Scenario**: User uploads 100MB CSV with 500,000 rows for workflow seeding.

**Current Limitation**: Agent tries to read entire file, hits context limits.

**RLM Solution**:
1. Load CSV as context variable (stored externally)
2. Agent queries structure: `context.head(5)` to see columns
3. Recursive decomposition: process in 1000-row chunks
4. Each chunk: transform → validate → append to output
5. Final: merge all chunks with deduplication

### 6.2 Complex Schema Generation

**Scenario**: User describes enterprise workflow with 50+ node types.

**Current Limitation**: Full schema context + generation prompt approaches limits.

**RLM Solution**:
1. Decompose by domain: "Generate HR node types", "Generate Finance node types"
2. Recursive generation per domain
3. Merge with cross-domain edge type generation
4. Validate completeness recursively

### 6.3 Intelligent Data Seeding

**Scenario**: Generate 10,000 realistic nodes for load testing.

**Current Limitation**: Large scale (12 scenarios × 15 nodes = 180 max).

**RLM Solution**:
1. Generate scenario clusters (Technology, Research, Operations, etc.)
2. Recursively expand each cluster to 20-50 scenarios
3. Generate nodes per scenario in parallel sub-tasks
4. Maintain referential integrity via shared context variable

### 6.4 Multi-File Analysis

**Scenario**: Analyze Notion export + uploaded spreadsheets + existing graph.

**Current Limitation**: Each source processed independently; integration is manual.

**RLM Solution**:
1. Load each source as context variable
2. Recursive entity extraction per source
3. Cross-source entity matching via sub-queries
4. Intelligent merge with conflict resolution

---

## 7. Metrics & Success Criteria

### 7.1 Performance Targets

| Metric | Current | RLM Target | Improvement |
|--------|---------|------------|-------------|
| Max input file size | ~50MB | 1GB+ | 20x |
| Max seed data items | 180 | 10,000+ | 55x |
| Context efficiency | 95k tokens/query | 3k tokens/query | 30x cheaper |
| Generation time (large) | Linear | Sub-linear | Faster at scale |

### 7.2 Quality Metrics

- **Consistency**: Cross-reference validation across chunks
- **Coherence**: Scenarios maintain narrative through recursion
- **Coverage**: All node types represented in large generations

---

## 8. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Recursive depth explosion | Max depth parameter, tail-call optimization |
| Chunk boundary inconsistency | Overlap buffers, validation at merge |
| Increased latency | Parallel sub-task execution, caching |
| Debugging complexity | Structured logging, visualization of recursion tree |
| REPL security | Docker isolation (already supported by RLM lib) |

---

## 9. Conclusion

Recursive Language Models represent a paradigm shift that aligns remarkably well with Flowgraph's existing architecture. The transformer module already implements REPL-like patterns (code generation, tool use, iterative validation), making RLM adoption a natural evolution rather than a fundamental redesign.

**Recommended Next Steps**:
1. **Immediate**: Add context variable patterns to code mode prompts
2. **Short-term**: Implement recursive graph exploration in `graph_api.py`
3. **Medium-term**: Build chunked generation for large outputs
4. **Long-term**: Integrate official RLM library for full capabilities

The potential impact is significant: **55x more seed data**, **20x larger file support**, and **30x cost reduction** for large-scale operations—positioning Flowgraph as a leader in LLM-powered workflow automation.

---

## Sources

- [Recursive Language Models | Alex L. Zhang](https://alexzhang13.github.io/blog/2025/rlm/)
- [Recursive Language Models: the paradigm of 2026 | Prime Intellect](https://www.primeintellect.ai/blog/rlm)
- [GitHub - alexzhang13/rlm](https://github.com/alexzhang13/rlm)
- [arXiv: Recursive Language Models](https://arxiv.org/abs/2512.24601)
- [MIT's Recursive Language Models Improve Performance | InfoQ](https://www.infoq.com/news/2026/01/mit-recursive-lm/)
