"""Persistent IPython kernel for RLM operations.

This module provides a managed IPython kernel that maintains state across
code executions. It pre-loads utility functions (llm, chunk, chunk_lines)
for processing large context data.

The key insight is that massive context is loaded into kernel memory, not
the LLM context window. Claude interacts via a REPL tool, writing Python
that executes in the kernel.
"""

import logging
from queue import Empty
from typing import Any

from jupyter_client import KernelManager

logger = logging.getLogger(__name__)


class RLMKernel:
    """Manages a persistent IPython kernel with RLM utilities.

    The kernel maintains state across executions, allowing iterative
    data exploration and transformation. Pre-loaded utilities include:

    - llm(query, context): Call an LLM on a subset of context
    - chunk(data, size): Split string into character-based chunks
    - chunk_lines(data, n): Split string into line-based chunks

    Usage:
        kernel = RLMKernel()
        kernel.load_context("...massive input data...")
        result = kernel.execute("print(len(context))")
        kernel.shutdown()
    """

    def __init__(self, anthropic_api_key: str | None = None):
        """Initialize the IPython kernel.

        Args:
            anthropic_api_key: Optional API key for the llm() function.
                If not provided, uses ANTHROPIC_API_KEY from environment.
        """
        self.km = KernelManager(kernel_name="python3")
        self.km.start_kernel()
        self.kc = self.km.client()
        self.kc.start_channels()
        self.kc.wait_for_ready(timeout=60)
        self._inject_builtins(anthropic_api_key)
        logger.info("RLM kernel started and ready")

    def _inject_builtins(self, api_key: str | None = None) -> None:
        """Inject llm(), chunk(), chunk_lines() into kernel namespace."""
        # Build the setup code with optional API key injection
        api_key_line = f'_api_key = "{api_key}"' if api_key else "_api_key = None"

        setup_code = f'''
import anthropic
import json
import re
from typing import List

{api_key_line}
_client = anthropic.Anthropic(api_key=_api_key) if _api_key else anthropic.Anthropic()

def llm(query: str, context: str = "", model: str = "claude-sonnet-4-20250514") -> str:
    """Call an LLM on a subset of context.

    Args:
        query: The question or instruction for the LLM.
        context: Optional context string to include.
        model: Model to use (default: claude-sonnet-4-20250514).

    Returns:
        The LLM's response text.
    """
    content = f"{{query}}\\n\\nContext:\\n{{context}}" if context else query
    resp = _client.messages.create(
        model=model,
        max_tokens=4096,
        messages=[{{"role": "user", "content": content}}]
    )
    return resp.content[0].text

def chunk(data: str, size: int = 5000) -> list:
    """Split string into chunks of approximately `size` characters.

    Chunks at line boundaries to avoid splitting mid-line.

    Args:
        data: The string to chunk.
        size: Approximate chunk size in characters (default: 5000).

    Returns:
        List of string chunks.
    """
    lines = data.split('\\n')
    chunks, current = [], []
    current_size = 0
    for line in lines:
        if current_size + len(line) > size and current:
            chunks.append('\\n'.join(current))
            current, current_size = [], 0
        current.append(line)
        current_size += len(line) + 1
    if current:
        chunks.append('\\n'.join(current))
    return chunks

def chunk_lines(data: str, n: int = 100) -> list:
    """Split string into chunks of n lines each.

    Args:
        data: The string to chunk.
        n: Number of lines per chunk (default: 100).

    Returns:
        List of string chunks.
    """
    lines = data.split('\\n')
    return ['\\n'.join(lines[i:i+n]) for i in range(0, len(lines), n)]

print("RLM utilities loaded: llm(), chunk(), chunk_lines()")
'''
        result = self.execute(setup_code)
        if result.get("error"):
            logger.error(f"Failed to inject RLM builtins: {result['error']}")
            raise RuntimeError(f"Failed to initialize RLM kernel: {result['error']}")

    def load_context(self, context: str, var_name: str = "context") -> dict[str, Any]:
        """Load massive context into kernel memory.

        Args:
            context: The context string to load.
            var_name: Variable name to assign (default: "context").

        Returns:
            Execution result dict.
        """
        # Use repr() to safely escape the string
        result = self.execute(f"{var_name} = {repr(context)}")
        if result.get("error"):
            return result

        # Print summary
        return self.execute(
            f"print(f'{var_name} loaded: {{len({var_name}):,}} chars, "
            f"{{len({var_name}.splitlines()):,}} lines')"
        )

    def load_context_from_file(
        self, file_path: str, var_name: str = "context"
    ) -> dict[str, Any]:
        """Load context from a file.

        Args:
            file_path: Path to the file to load.
            var_name: Variable name to assign (default: "context").

        Returns:
            Execution result dict.
        """
        # Escape the file path for safety
        safe_path = file_path.replace("\\", "\\\\").replace('"', '\\"')
        result = self.execute(f'with open("{safe_path}") as f: {var_name} = f.read()')
        if result.get("error"):
            return result

        return self.execute(
            f"print(f'{var_name} loaded: {{len({var_name}):,}} chars, "
            f"{{len({var_name}.splitlines()):,}} lines')"
        )

    def execute(self, code: str, timeout: int = 600) -> dict[str, Any]:
        """Execute code in the kernel and return output.

        Args:
            code: Python code to execute.
            timeout: Execution timeout in seconds (default: 600).

        Returns:
            Dict with keys:
            - stdout: Standard output text
            - stderr: Standard error text
            - result: Expression result (if any)
            - error: Error traceback (if any)
        """
        _msg_id = self.kc.execute(code)  # noqa: F841 - msg_id not needed, we track via iopub
        output: dict[str, Any] = {"stdout": "", "stderr": "", "result": None, "error": None}

        while True:
            try:
                msg = self.kc.get_iopub_msg(timeout=timeout)
                msg_type = msg["msg_type"]
                content = msg["content"]

                if msg_type == "stream":
                    stream_name = content.get("name", "stdout")
                    output[stream_name] += content.get("text", "")
                elif msg_type == "execute_result":
                    output["result"] = content.get("data", {}).get("text/plain", "")
                elif msg_type == "error":
                    output["error"] = "\n".join(content.get("traceback", []))
                elif msg_type == "status" and content.get("execution_state") == "idle":
                    break
            except Empty:
                output["error"] = f"Execution timed out after {timeout} seconds"
                break

        return output

    def shutdown(self) -> None:
        """Shutdown the kernel and clean up resources."""
        try:
            self.kc.stop_channels()
            self.km.shutdown_kernel(now=True)
            logger.info("RLM kernel shutdown complete")
        except Exception as e:
            logger.warning(f"Error during kernel shutdown: {e}")

    def __enter__(self) -> "RLMKernel":
        """Context manager entry."""
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Context manager exit - ensures kernel shutdown."""
        self.shutdown()
