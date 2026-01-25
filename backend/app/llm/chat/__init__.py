"""Chat session infrastructure for multi-turn conversations.

This module provides the core abstractions for session-based chat:
- ChatSession: Wraps ClaudeSDKClient for multi-turn conversations
- ChatSessionManager: Manages session lifecycle

The transformer uses this infrastructure internally - single-shot transformer
operations are just sessions with one message that auto-close.
"""

from app.llm.chat.manager import ChatSessionManager, get_session_manager
from app.llm.chat.models import (
    ChatMessage,
    ChatSessionConfig,
    ChatSessionInfo,
    CreateChatSessionRequest,
    CreateChatSessionResponse,
)
from app.llm.chat.session import ChatSession

__all__ = [
    "ChatMessage",
    "ChatSession",
    "ChatSessionConfig",
    "ChatSessionInfo",
    "ChatSessionManager",
    "CreateChatSessionRequest",
    "CreateChatSessionResponse",
    "get_session_manager",
]
