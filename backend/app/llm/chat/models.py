"""Pydantic models for chat sessions."""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class ChatRole(str, Enum):
    """Role of a chat message sender."""

    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class ChatMessage(BaseModel):
    """A single message in a chat session."""

    role: ChatRole
    content: str
    timestamp: datetime = Field(default_factory=datetime.now)

    class Config:
        use_enum_values = True


class ChatSessionConfig(BaseModel):
    """Configuration for creating a chat session."""

    workflow_id: str
    system_prompt: str | None = None
    tools: list[str] | None = None
    max_turns: int = 80
    model: str = "claude-opus-4-5-20251101"
    schema_dsl: str | None = None  # Workflow schema in compact DSL format


class ChatSessionInfo(BaseModel):
    """Information about an active chat session."""

    session_id: str
    workflow_id: str
    created_at: datetime
    last_activity: datetime
    message_count: int
    is_active: bool = True


class CreateChatSessionRequest(BaseModel):
    """Request to create a new chat session."""

    system_prompt: str | None = Field(
        default=None,
        description="Custom system prompt for the session",
    )
    tools: list[str] | None = Field(
        default=None,
        description="List of allowed tools (uses defaults if not specified)",
    )
    include_graph_api: bool = Field(
        default=True,
        description="Whether to include graph_api.py for querying workflow data",
    )


class CreateChatSessionResponse(BaseModel):
    """Response after creating a chat session."""

    session_id: str
    workflow_id: str
    created_at: datetime


class ChatEvent(BaseModel):
    """An event emitted during chat processing.

    Uses the same format as transformer events for compatibility.
    """

    event: str
    tool: str | None = None
    input: dict | None = None
    result: str | None = None
    text: str | None = None
    message: str | None = None

    class Config:
        extra = "allow"  # Allow additional fields for flexibility
