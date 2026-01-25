"""ChatSession wraps ClaudeSDKClient for multi-turn conversations."""

import json
import logging
import shutil
import uuid
from collections.abc import AsyncGenerator
from datetime import datetime
from pathlib import Path
from typing import Any

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ClaudeSDKClient,
    ResultMessage,
    TextBlock,
    ToolResultBlock,
    ToolUseBlock,
)

from app.llm.chat.models import ChatMessage, ChatRole, ChatSessionConfig

logger = logging.getLogger(__name__)

# Default tools available for chat sessions
DEFAULT_CHAT_TOOLS = [
    "Bash",
    "Read",
    "Write",
    "Glob",
    "Grep",
    "Skill",
]

# System prompt template for workflow chat (with schema)
SYSTEM_PROMPT_WITH_SCHEMA = """You are an expert assistant helping users interact with a workflow graph.

You have access to the workflow's data through graph_api.py. This module provides READ-ONLY access to query the workflow graph.

## Workflow Schema

{schema_dsl}

## Graph Query API

Available functions in graph_api.py:
- search_nodes(node_type, properties=None, title_contains=None, title_exact=None, status=None, limit=100) - Search for nodes
- get_node(node_id) - Get a specific node by ID
- get_neighbors(node_id, edge_type=None) - Get connected nodes (incoming and outgoing)
- count_nodes(node_type=None) - Count nodes, optionally by type

Example usage - write a Python script and run it with Bash:
```python
from graph_api import search_nodes, get_node, get_neighbors, count_nodes

# Count all nodes
total = count_nodes()
print(f"Total nodes: {{total}}")

# Search for nodes by type (use types from schema above)
nodes = search_nodes("NodeType")
print(f"Found {{len(nodes)}} nodes")

# Search with filters
pending = search_nodes("NodeType", status="Pending")
matching = search_nodes("NodeType", title_contains="keyword")

# Get a specific node
node = get_node("node-uuid-here")
if node:
    print(f"Found: {{node['title']}}")
    print(f"Properties: {{node['properties']}}")

# Get neighbors (connected nodes)
neighbors = get_neighbors("node-id")
print(f"Incoming: {{len(neighbors['incoming'])}}, Outgoing: {{len(neighbors['outgoing'])}}")
```

To query the graph:
1. Write a Python script that imports from graph_api
2. Run it with Bash: python script.py

Use the node types, edge types, and field definitions from the schema above when querying.
Be helpful and concise. When showing results, format them clearly.
"""

# Default system prompt (fallback when no schema)
DEFAULT_SYSTEM_PROMPT = """You are an expert assistant helping users interact with a workflow graph.

You have access to the workflow's data through graph_api.py. This module provides READ-ONLY access to query the workflow graph.

Available functions:
- search_nodes(node_type, properties=None, title_contains=None, title_exact=None, status=None, limit=100) - Search for nodes
- get_node(node_id) - Get a specific node by ID
- get_neighbors(node_id, edge_type=None) - Get connected nodes (incoming and outgoing)
- count_nodes(node_type=None) - Count nodes, optionally by type

Example usage - write a Python script and run it with Bash:
```python
from graph_api import search_nodes, get_node, get_neighbors, count_nodes

# Count all nodes
total = count_nodes()
print(f"Total nodes: {total}")

# Search for nodes by type
nodes = search_nodes("NodeType")
print(f"Found {len(nodes)} nodes")
```

To query the graph:
1. Write a Python script that imports from graph_api
2. Run it with Bash: python script.py

Be helpful and concise. When showing results, format them clearly.
"""


class ChatSession:
    """A chat session wrapping ClaudeSDKClient for multi-turn conversations.

    The session maintains:
    - A work directory with input files and utilities
    - Message history for context
    - Client state for streaming responses
    """

    def __init__(
        self,
        session_id: str,
        workflow_id: str,
        work_dir: Path,
        config: ChatSessionConfig,
    ):
        self.session_id = session_id
        self.workflow_id = workflow_id
        self.work_dir = work_dir
        self.config = config
        self.messages: list[ChatMessage] = []
        self.created_at = datetime.now()
        self.last_activity = datetime.now()
        self._client: ClaudeSDKClient | None = None
        self._is_processing = False
        self._context_emitted = False  # Track if we've emitted context events
        self._system_prompt: str | None = None  # Store for emitting as event

    @property
    def is_active(self) -> bool:
        """Whether the session is active and can accept messages."""
        return self._client is not None

    @property
    def is_processing(self) -> bool:
        """Whether the session is currently processing a message."""
        return self._is_processing

    async def initialize(self) -> None:
        """Initialize the session and start the Claude client.

        Sets up the work directory with required files and creates the client.
        """
        # Ensure work directory exists
        self.work_dir.mkdir(parents=True, exist_ok=True)

        # Copy graph_api.py if requested
        if self.config.workflow_id:
            self._setup_graph_api()

        # Copy skills directory
        self._setup_skills()

        # Build allowed tools
        allowed_tools = self.config.tools or DEFAULT_CHAT_TOOLS

        # Build system prompt - use schema-aware prompt if schema is available
        if self.config.system_prompt:
            system_prompt = self.config.system_prompt
        elif self.config.schema_dsl:
            system_prompt = SYSTEM_PROMPT_WITH_SCHEMA.format(
                schema_dsl=self.config.schema_dsl
            )
            logger.info(f"Using schema-aware system prompt for session {self.session_id}")
        else:
            system_prompt = DEFAULT_SYSTEM_PROMPT
            logger.warning(f"No schema_dsl provided for session {self.session_id}, using default prompt")

        # Store system prompt for emitting as event
        self._system_prompt = system_prompt

        # Configure agent options
        options = ClaudeAgentOptions(
            model=self.config.model,
            system_prompt=system_prompt,
            cwd=str(self.work_dir),
            max_turns=self.config.max_turns,
            allowed_tools=allowed_tools,
            permission_mode="acceptEdits",
            setting_sources=["project"],
        )

        # Create and enter the client context
        self._client = ClaudeSDKClient(options=options)
        await self._client.__aenter__()

        logger.info(f"Chat session {self.session_id} initialized for workflow {self.workflow_id}")

    def _setup_graph_api(self) -> None:
        """Set up graph_api.py for querying workflow data."""
        import os

        # Copy graph_api.py from transformer module
        transformer_dir = Path(__file__).parent.parent / "transformer"
        graph_api_src = transformer_dir / "graph_api.py"

        if graph_api_src.exists():
            shutil.copy(graph_api_src, self.work_dir / "graph_api.py")
            logger.info(f"Copied graph_api.py to {self.work_dir}")
        else:
            logger.warning(f"graph_api.py not found at {graph_api_src}")

        # Write graph config for graph_api.py
        # Make db_path absolute since agent runs from temp work directory
        db_path = os.getenv("DATABASE_PATH", "./data/workflow.db")
        db_path = str(Path(db_path).resolve())

        graph_config = {
            "workflow_id": self.workflow_id,
            "db_path": db_path,
        }
        config_path = self.work_dir / ".graph_config.json"
        with open(config_path, "w") as f:
            json.dump(graph_config, f)
        logger.info(f"Wrote graph config: {graph_config} to {config_path}")

    def _setup_skills(self) -> None:
        """Copy skills directory to work directory."""
        skills_src = Path(__file__).parent.parent.parent.parent / ".claude" / "skills"
        skills_dest = self.work_dir / ".claude" / "skills"

        if skills_src.exists():
            skills_dest.mkdir(parents=True, exist_ok=True)
            for skill_dir in skills_src.iterdir():
                if skill_dir.is_dir():
                    dest = skills_dest / skill_dir.name
                    if not dest.exists():
                        shutil.copytree(skill_dir, dest)
            logger.debug(f"Copied skills to {skills_dest}")

    async def query(self, message: str) -> AsyncGenerator[dict[str, Any], None]:
        """Send a message and yield events as the agent responds.

        Args:
            message: The user message to send.

        Yields:
            Event dictionaries in the same format as transformer events:
            - {"event": "text", "text": "..."}
            - {"event": "tool_call", "tool": "...", "input": {...}}
            - {"event": "tool_result", "tool": "...", "result": "..."}
            - {"event": "message_complete"}
        """
        if not self._client:
            raise RuntimeError("Session not initialized. Call initialize() first.")

        if self._is_processing:
            raise RuntimeError("Session is already processing a message.")

        self._is_processing = True
        self.last_activity = datetime.now()

        # Emit context events on first query
        if not self._context_emitted:
            self._context_emitted = True
            if self._system_prompt:
                yield {"event": "system_prompt", "prompt": self._system_prompt}

        # Record user message
        self.messages.append(ChatMessage(role=ChatRole.USER, content=message))

        try:
            # Send query to Claude
            await self._client.query(message)

            # Track tool calls for event emission
            tool_call_count = 0

            # Hook to emit events before tool execution
            async def pre_tool_hook(input_data: dict, tool_use_id: str, context: Any) -> dict:
                nonlocal tool_call_count
                tool_call_count += 1
                return {}

            # Process response stream
            async for msg in self._client.receive_response():
                if isinstance(msg, AssistantMessage):
                    for block in msg.content:
                        if isinstance(block, TextBlock):
                            yield {"event": "text", "text": block.text}
                        elif isinstance(block, ToolUseBlock):
                            tool_call_count += 1
                            yield {
                                "event": "tool_call",
                                "tool": block.name,
                                "input": block.input if hasattr(block, "input") else {},
                            }
                        elif isinstance(block, ToolResultBlock):
                            result = str(block.content)[:500] if hasattr(block, "content") else ""
                            yield {
                                "event": "tool_result",
                                "tool": getattr(block, "tool_use_id", "unknown"),
                                "result": result,
                            }

                elif isinstance(msg, ResultMessage):
                    # Agent completed this turn
                    pass

            # Collect assistant response text for history
            # (simplified - could aggregate text blocks)
            self.messages.append(ChatMessage(
                role=ChatRole.ASSISTANT,
                content=f"[Response with {tool_call_count} tool calls]",
            ))

            # Signal message complete
            yield {"event": "message_complete"}

        except Exception as e:
            logger.error(f"Error in chat query: {e}")
            yield {"event": "error", "message": str(e)}
            raise

        finally:
            self._is_processing = False

    async def close(self) -> None:
        """Close the session and cleanup resources."""
        if self._client:
            try:
                await self._client.__aexit__(None, None, None)
            except Exception as e:
                logger.warning(f"Error closing client: {e}")
            self._client = None

        # Optionally cleanup work directory
        # For now, keep it for debugging
        logger.info(f"Chat session {self.session_id} closed")

    def get_info(self) -> dict[str, Any]:
        """Get session information."""
        return {
            "session_id": self.session_id,
            "workflow_id": self.workflow_id,
            "created_at": self.created_at.isoformat(),
            "last_activity": self.last_activity.isoformat(),
            "message_count": len(self.messages),
            "is_active": self.is_active,
            "is_processing": self.is_processing,
        }


async def create_session(
    workflow_id: str,
    work_dir: Path | None = None,
    config: ChatSessionConfig | None = None,
) -> ChatSession:
    """Factory function to create and initialize a chat session.

    Args:
        workflow_id: The workflow this session is for.
        work_dir: Optional work directory (temp dir created if not specified).
        config: Optional session configuration.

    Returns:
        An initialized ChatSession ready to receive messages.
    """
    import tempfile

    session_id = str(uuid.uuid4())[:12]

    if work_dir is None:
        work_dir = Path(tempfile.mkdtemp(prefix=f"chat_{session_id}_"))

    if config is None:
        config = ChatSessionConfig(workflow_id=workflow_id)
    else:
        # Ensure workflow_id is set
        config = config.model_copy(update={"workflow_id": workflow_id})

    session = ChatSession(
        session_id=session_id,
        workflow_id=workflow_id,
        work_dir=work_dir,
        config=config,
    )

    await session.initialize()
    return session
