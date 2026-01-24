"""Tests for the RLM kernel."""

import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest


class TestRLMKernel:
    """Tests for RLMKernel class."""

    @pytest.fixture
    def mock_kernel_manager(self):
        """Create a mock KernelManager."""
        with patch("app.llm.transformer.rlm_kernel.KernelManager") as mock_km_class:
            mock_km = MagicMock()
            mock_kc = MagicMock()

            mock_km.client.return_value = mock_kc
            mock_km_class.return_value = mock_km

            # Mock the iopub messages for initialization
            setup_messages = [
                {"msg_type": "stream", "content": {"name": "stdout", "text": "RLM utilities loaded"}},
                {"msg_type": "status", "content": {"execution_state": "idle"}},
            ]
            mock_kc.get_iopub_msg.side_effect = setup_messages

            yield mock_km_class, mock_km, mock_kc

    def test_kernel_initialization(self, mock_kernel_manager):
        """Test kernel initializes correctly."""
        mock_km_class, mock_km, mock_kc = mock_kernel_manager

        from app.llm.transformer.rlm_kernel import RLMKernel

        kernel = RLMKernel()

        # Verify kernel was started
        mock_km.start_kernel.assert_called_once()
        mock_kc.start_channels.assert_called_once()
        mock_kc.wait_for_ready.assert_called_once()

        # Cleanup
        kernel.shutdown()

    def test_kernel_execute(self, mock_kernel_manager):
        """Test code execution in kernel."""
        mock_km_class, mock_km, mock_kc = mock_kernel_manager

        from app.llm.transformer.rlm_kernel import RLMKernel

        # First set of messages for init
        init_messages = [
            {"msg_type": "stream", "content": {"name": "stdout", "text": "RLM utilities loaded"}},
            {"msg_type": "status", "content": {"execution_state": "idle"}},
        ]

        # Second set of messages for execute call
        execute_messages = [
            {"msg_type": "execute_result", "content": {"data": {"text/plain": "42"}}},
            {"msg_type": "status", "content": {"execution_state": "idle"}},
        ]

        mock_kc.get_iopub_msg.side_effect = init_messages + execute_messages

        kernel = RLMKernel()
        result = kernel.execute("1 + 1")

        assert result["result"] == "42"
        assert result["error"] is None

        kernel.shutdown()

    def test_kernel_execute_with_output(self, mock_kernel_manager):
        """Test execution with stdout/stderr."""
        mock_km_class, mock_km, mock_kc = mock_kernel_manager

        from app.llm.transformer.rlm_kernel import RLMKernel

        # Messages for init and execute
        all_messages = [
            # Init
            {"msg_type": "stream", "content": {"name": "stdout", "text": "RLM utilities loaded"}},
            {"msg_type": "status", "content": {"execution_state": "idle"}},
            # Execute
            {"msg_type": "stream", "content": {"name": "stdout", "text": "Hello, World!\n"}},
            {"msg_type": "status", "content": {"execution_state": "idle"}},
        ]

        mock_kc.get_iopub_msg.side_effect = all_messages

        kernel = RLMKernel()
        result = kernel.execute('print("Hello, World!")')

        assert "Hello, World!" in result["stdout"]

        kernel.shutdown()

    def test_kernel_execute_with_error(self, mock_kernel_manager):
        """Test execution with error."""
        mock_km_class, mock_km, mock_kc = mock_kernel_manager

        from app.llm.transformer.rlm_kernel import RLMKernel

        all_messages = [
            # Init
            {"msg_type": "stream", "content": {"name": "stdout", "text": "RLM utilities loaded"}},
            {"msg_type": "status", "content": {"execution_state": "idle"}},
            # Execute with error
            {"msg_type": "error", "content": {"traceback": ["NameError: name 'x' is not defined"]}},
            {"msg_type": "status", "content": {"execution_state": "idle"}},
        ]

        mock_kc.get_iopub_msg.side_effect = all_messages

        kernel = RLMKernel()
        result = kernel.execute("print(x)")

        assert "NameError" in result["error"]

        kernel.shutdown()

    def test_load_context(self, mock_kernel_manager):
        """Test loading context into kernel."""
        mock_km_class, mock_km, mock_kc = mock_kernel_manager

        from app.llm.transformer.rlm_kernel import RLMKernel

        all_messages = [
            # Init
            {"msg_type": "stream", "content": {"name": "stdout", "text": "RLM utilities loaded"}},
            {"msg_type": "status", "content": {"execution_state": "idle"}},
            # Load context (two execute calls)
            {"msg_type": "status", "content": {"execution_state": "idle"}},
            {"msg_type": "stream", "content": {"name": "stdout", "text": "context loaded: 100 chars"}},
            {"msg_type": "status", "content": {"execution_state": "idle"}},
        ]

        mock_kc.get_iopub_msg.side_effect = all_messages

        kernel = RLMKernel()
        result = kernel.load_context("test data" * 10)

        # Verify execute was called to set the variable
        assert mock_kc.execute.call_count >= 2  # Init + at least 2 for load_context

        kernel.shutdown()

    def test_load_context_from_file(self, mock_kernel_manager):
        """Test loading context from file."""
        mock_km_class, mock_km, mock_kc = mock_kernel_manager

        from app.llm.transformer.rlm_kernel import RLMKernel

        all_messages = [
            # Init
            {"msg_type": "stream", "content": {"name": "stdout", "text": "RLM utilities loaded"}},
            {"msg_type": "status", "content": {"execution_state": "idle"}},
            # Load from file
            {"msg_type": "status", "content": {"execution_state": "idle"}},
            {"msg_type": "stream", "content": {"name": "stdout", "text": "context loaded: 50 chars"}},
            {"msg_type": "status", "content": {"execution_state": "idle"}},
        ]

        mock_kc.get_iopub_msg.side_effect = all_messages

        # Create a temp file
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
            f.write("test content from file")
            temp_path = f.name

        try:
            kernel = RLMKernel()
            kernel.load_context_from_file(temp_path)

            # Verify execute was called
            assert mock_kc.execute.call_count >= 2

            kernel.shutdown()
        finally:
            Path(temp_path).unlink()

    def test_context_manager(self, mock_kernel_manager):
        """Test kernel as context manager."""
        mock_km_class, mock_km, mock_kc = mock_kernel_manager

        from app.llm.transformer.rlm_kernel import RLMKernel

        all_messages = [
            {"msg_type": "stream", "content": {"name": "stdout", "text": "RLM utilities loaded"}},
            {"msg_type": "status", "content": {"execution_state": "idle"}},
        ]
        mock_kc.get_iopub_msg.side_effect = all_messages

        with RLMKernel() as kernel:
            assert kernel is not None

        # Verify shutdown was called
        mock_km.shutdown_kernel.assert_called_once()


class TestChunkFunctions:
    """Test the chunk utility functions (via string exec)."""

    def test_chunk_function_logic(self):
        """Test chunk function logic directly."""
        # This tests the logic of the chunk function that gets injected
        def chunk(data: str, size: int = 5000) -> list:
            lines = data.split("\n")
            chunks, current = [], []
            current_size = 0
            for line in lines:
                if current_size + len(line) > size and current:
                    chunks.append("\n".join(current))
                    current, current_size = [], 0
                current.append(line)
                current_size += len(line) + 1
            if current:
                chunks.append("\n".join(current))
            return chunks

        data = "\n".join([f"line {i}" for i in range(100)])
        chunks = chunk(data, size=100)

        assert len(chunks) > 1
        assert all(len(c) <= 110 for c in chunks)  # Approximate due to line boundaries

    def test_chunk_lines_function_logic(self):
        """Test chunk_lines function logic directly."""

        def chunk_lines(data: str, n: int = 100) -> list:
            lines = data.split("\n")
            return ["\n".join(lines[i : i + n]) for i in range(0, len(lines), n)]

        data = "\n".join([f"line {i}" for i in range(250)])
        chunks = chunk_lines(data, n=100)

        assert len(chunks) == 3
        assert len(chunks[0].split("\n")) == 100
        assert len(chunks[1].split("\n")) == 100
        assert len(chunks[2].split("\n")) == 50


class TestRLMTools:
    """Tests for RLM MCP tools."""

    @pytest.fixture
    def mock_kernel(self):
        """Create a mock RLMKernel."""
        kernel = MagicMock()
        kernel.execute.return_value = {
            "stdout": "Hello from kernel\n",
            "stderr": "",
            "result": None,
            "error": None,
        }
        return kernel

    def test_create_rlm_tools_returns_mcp_config(self, mock_kernel):
        """Test create_rlm_tools returns MCP server configuration."""
        from app.llm.transformer.rlm_tools import create_rlm_tools

        server = create_rlm_tools(mock_kernel)

        # The SDK returns an MCP server config dict
        assert server is not None

    def test_rlm_mode_prompt_exists(self):
        """Test RLM mode prompt is defined."""
        from app.llm.transformer.rlm_tools import RLM_MODE_PROMPT

        assert "RLM Mode" in RLM_MODE_PROMPT
        assert "context" in RLM_MODE_PROMPT
        assert "llm(" in RLM_MODE_PROMPT
        assert "chunk(" in RLM_MODE_PROMPT
        assert "PEEK" in RLM_MODE_PROMPT

    def test_rlm_mode_prompt_strategy(self):
        """Test RLM mode prompt includes strategy."""
        from app.llm.transformer.rlm_tools import RLM_MODE_PROMPT

        # Verify the key strategy steps are documented
        assert "PEEK" in RLM_MODE_PROMPT
        assert "MEASURE" in RLM_MODE_PROMPT
        assert "FILTER" in RLM_MODE_PROMPT
        assert "RECURSE" in RLM_MODE_PROMPT
        assert "AGGREGATE" in RLM_MODE_PROMPT

    def test_max_output_size_constant(self):
        """Test max output size is reasonable."""
        from app.llm.transformer.rlm_tools import MAX_OUTPUT_SIZE

        # Should be large enough for useful output, small enough to avoid context overflow
        assert MAX_OUTPUT_SIZE >= 10000
        assert MAX_OUTPUT_SIZE <= 50000


class TestTransformConfigRLM:
    """Test TransformConfig with enable_rlm flag."""

    def test_default_rlm_disabled(self):
        """Test RLM is disabled by default."""
        from app.llm.transformer.models import TransformConfig

        config = TransformConfig()
        assert config.enable_rlm is False

    def test_enable_rlm(self):
        """Test RLM can be enabled."""
        from app.llm.transformer.models import TransformConfig

        config = TransformConfig(enable_rlm=True)
        assert config.enable_rlm is True

    def test_rlm_with_other_options(self):
        """Test RLM works with other config options."""
        from app.llm.transformer.models import TransformConfig

        config = TransformConfig(
            mode="code",
            output_format="json",
            enable_rlm=True,
            max_iterations=100,
        )

        assert config.enable_rlm is True
        assert config.mode == "code"
        assert config.output_format == "json"
        assert config.max_iterations == 100
