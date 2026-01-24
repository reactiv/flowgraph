"""MCP tools for RLM REPL access.

This module provides the `repl` MCP tool that allows Claude to execute
Python code in a persistent IPython kernel. The kernel maintains state
across calls, enabling iterative data exploration.
"""

from typing import Any

from claude_agent_sdk import create_sdk_mcp_server, tool

from app.llm.transformer.rlm_kernel import RLMKernel

# Maximum output size to prevent context overflow
MAX_OUTPUT_SIZE = 15000


def create_rlm_tools(kernel: RLMKernel):
    """Create MCP server with REPL tool bound to kernel.

    Args:
        kernel: An initialized RLMKernel instance.

    Returns:
        SDK MCP server with the repl tool.
    """

    @tool(
        "repl",
        "Execute Python code in a persistent REPL. Variables persist across calls. "
        "Pre-loaded utilities:\n"
        "- `context`: The input data (potentially millions of tokens - DO NOT print it all)\n"
        "- `llm(query, ctx)`: Call an LLM on a subset of context\n"
        "- `chunk(data, size)`: Split into ~size character chunks\n"
        "- `chunk_lines(data, n)`: Split into n-line chunks\n\n"
        "STRATEGY: 1) PEEK with context[:2000], 2) MEASURE with len(), "
        "3) FILTER with Python, 4) RECURSE with llm() on subsets, 5) AGGREGATE results.",
        {"code": str},
    )
    async def repl(args: dict[str, Any]) -> dict[str, Any]:
        """Execute Python code in the persistent kernel."""
        code = args.get("code", "")

        if not code.strip():
            return {
                "content": [{"type": "text", "text": "Error: No code provided"}]
            }

        result = kernel.execute(code)

        # Format output parts
        output_parts = []
        if result["stdout"]:
            output_parts.append(f"stdout:\n{result['stdout']}")
        if result["stderr"]:
            output_parts.append(f"stderr:\n{result['stderr']}")
        if result["result"]:
            output_parts.append(f"result:\n{result['result']}")
        if result["error"]:
            output_parts.append(f"error:\n{result['error']}")

        output = "\n\n".join(output_parts) or "(no output)"

        # Truncate if too long (keep head + tail for visibility)
        if len(output) > MAX_OUTPUT_SIZE:
            head_size = MAX_OUTPUT_SIZE // 2 - 50
            tail_size = MAX_OUTPUT_SIZE // 2 - 50
            output = (
                output[:head_size]
                + f"\n\n... truncated ({len(output):,} chars total) ...\n\n"
                + output[-tail_size:]
            )

        return {"content": [{"type": "text", "text": output}]}

    return create_sdk_mcp_server(
        name="rlm",
        version="1.0.0",
        tools=[repl],
    )


# RLM mode system prompt addition
RLM_MODE_PROMPT = """
## RLM Mode (Recursive Language Model)

You are operating with access to a persistent Python REPL that has massive context
loaded into memory. The context is NOT in your context window - it's in the kernel.

### Pre-loaded Variables and Functions

- `context`: The full input data (potentially millions of tokens - NEVER print it all)
- `llm(query, ctx)`: Call an LLM on a subset of context
- `chunk(data, size)`: Split into ~size character chunks
- `chunk_lines(data, n)`: Split into n-line chunks

### Recommended Strategy

1. **PEEK**: First examine structure with `context[:2000]` or `context.splitlines()[:10]`
2. **MEASURE**: Check size with `len(context)`, `len(context.splitlines())`
3. **FILTER**: Use Python (grep, regex, list comprehensions) to narrow down
4. **RECURSE**: Use `llm(query, subset)` on manageable chunks when you need semantic understanding
5. **AGGREGATE**: Combine results programmatically

### Critical Rules

- NEVER load the full context into your response - always work through the REPL
- Variables persist between REPL calls - build up your analysis iteratively
- When done, write your output to the expected output file using standard Python file I/O
- The `llm()` function calls a fast model for sub-queries - use it for semantic analysis

### Example Workflow

```python
# 1. PEEK at the data
context[:1000]

# 2. MEASURE the size
len(context), len(context.splitlines())

# 3. Parse if structured
import json
data = json.loads(context)
len(data), list(data.keys()) if isinstance(data, dict) else type(data)

# 4. FILTER to relevant parts
relevant = [item for item in data if 'error' in str(item).lower()]

# 5. RECURSE with llm() for semantic understanding
summaries = []
for chunk_data in chunk(str(relevant), 4000):
    summary = llm("Summarize the key errors:", chunk_data)
    summaries.append(summary)

# 6. AGGREGATE and write output
result = {"summaries": summaries, "count": len(relevant)}
with open('output.json', 'w') as f:
    json.dump(result, f, indent=2)
```
"""
