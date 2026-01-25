"""ChatSessionManager handles session lifecycle and storage."""

import asyncio
import logging
import tempfile
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from app.llm.chat.models import ChatSessionConfig, ChatSessionInfo
from app.llm.chat.session import ChatSession

logger = logging.getLogger(__name__)

# Singleton manager instance
_manager: "ChatSessionManager | None" = None


class ChatSessionManager:
    """Manages chat session lifecycle.

    Responsibilities:
    - Create sessions with workflow context
    - Store active sessions (in-memory)
    - Cleanup expired sessions
    - Get/delete sessions by ID
    """

    def __init__(self, session_timeout_minutes: int = 30):
        """Initialize the session manager.

        Args:
            session_timeout_minutes: How long idle sessions live before cleanup.
        """
        self._sessions: dict[str, ChatSession] = {}
        self._session_timeout = timedelta(minutes=session_timeout_minutes)
        self._cleanup_task: asyncio.Task | None = None

    @property
    def active_session_count(self) -> int:
        """Number of active sessions."""
        return len(self._sessions)

    async def create_session(
        self,
        workflow_id: str,
        system_prompt: str | None = None,
        tools: list[str] | None = None,
        include_graph_api: bool = True,
        schema_dsl: str | None = None,
    ) -> ChatSession:
        """Create a new chat session for a workflow.

        Args:
            workflow_id: The workflow to associate with this session.
            system_prompt: Optional custom system prompt.
            tools: Optional list of allowed tools.
            include_graph_api: Whether to set up graph_api.py.
            schema_dsl: Workflow schema in compact DSL format for context.

        Returns:
            An initialized ChatSession.
        """
        from app.llm.chat.session import create_session

        # Build config
        config = ChatSessionConfig(
            workflow_id=workflow_id,
            system_prompt=system_prompt,
            tools=tools,
            schema_dsl=schema_dsl,
        )

        # Create work directory
        work_dir = Path(tempfile.mkdtemp(prefix=f"chat_{workflow_id[:8]}_"))

        # Create and initialize session
        session = await create_session(
            workflow_id=workflow_id,
            work_dir=work_dir,
            config=config,
        )

        # Store session
        self._sessions[session.session_id] = session
        logger.info(
            f"Created chat session {session.session_id} for workflow {workflow_id} "
            f"(total sessions: {len(self._sessions)})"
        )

        return session

    def get_session(self, session_id: str) -> ChatSession | None:
        """Get a session by ID.

        Args:
            session_id: The session ID to look up.

        Returns:
            The ChatSession if found, None otherwise.
        """
        session = self._sessions.get(session_id)
        if session:
            # Update last activity for keepalive
            session.last_activity = datetime.now()
        return session

    def get_sessions_for_workflow(self, workflow_id: str) -> list[ChatSession]:
        """Get all sessions for a workflow.

        Args:
            workflow_id: The workflow ID to filter by.

        Returns:
            List of active sessions for the workflow.
        """
        return [
            s for s in self._sessions.values()
            if s.workflow_id == workflow_id
        ]

    def list_sessions(self) -> list[ChatSessionInfo]:
        """List all active sessions.

        Returns:
            List of session info objects.
        """
        return [
            ChatSessionInfo(
                session_id=s.session_id,
                workflow_id=s.workflow_id,
                created_at=s.created_at,
                last_activity=s.last_activity,
                message_count=len(s.messages),
                is_active=s.is_active,
            )
            for s in self._sessions.values()
        ]

    async def close_session(self, session_id: str) -> bool:
        """Close and remove a session.

        Args:
            session_id: The session ID to close.

        Returns:
            True if session was found and closed, False otherwise.
        """
        session = self._sessions.pop(session_id, None)
        if session:
            await session.close()
            logger.info(f"Closed chat session {session_id}")
            return True
        return False

    async def close_workflow_sessions(self, workflow_id: str) -> int:
        """Close all sessions for a workflow.

        Args:
            workflow_id: The workflow ID to close sessions for.

        Returns:
            Number of sessions closed.
        """
        sessions_to_close = [
            sid for sid, s in self._sessions.items()
            if s.workflow_id == workflow_id
        ]

        for session_id in sessions_to_close:
            await self.close_session(session_id)

        return len(sessions_to_close)

    async def cleanup_expired(self) -> int:
        """Close sessions that have been idle too long.

        Returns:
            Number of sessions cleaned up.
        """
        now = datetime.now()
        expired_ids = [
            sid for sid, s in self._sessions.items()
            if now - s.last_activity > self._session_timeout
        ]

        for session_id in expired_ids:
            logger.info(f"Cleaning up expired session {session_id}")
            await self.close_session(session_id)

        if expired_ids:
            logger.info(f"Cleaned up {len(expired_ids)} expired chat session(s)")

        return len(expired_ids)

    async def start_cleanup_task(self) -> None:
        """Start the background cleanup task."""
        if self._cleanup_task is None:
            self._cleanup_task = asyncio.create_task(self._cleanup_loop())
            logger.info("Started chat session cleanup background task")

    async def stop_cleanup_task(self) -> None:
        """Stop the background cleanup task."""
        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass
            self._cleanup_task = None
            logger.info("Stopped chat session cleanup background task")

    async def _cleanup_loop(self) -> None:
        """Background loop that cleans up expired sessions."""
        while True:
            try:
                await asyncio.sleep(60)  # Check every minute
                await self.cleanup_expired()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.exception(f"Error in chat cleanup task: {e}")

    async def shutdown(self) -> None:
        """Shutdown the manager and close all sessions."""
        await self.stop_cleanup_task()

        # Close all sessions
        session_ids = list(self._sessions.keys())
        for session_id in session_ids:
            await self.close_session(session_id)

        logger.info("Chat session manager shutdown complete")

    def get_stats(self) -> dict[str, Any]:
        """Get manager statistics.

        Returns:
            Dictionary of stats.
        """
        now = datetime.now()
        return {
            "active_sessions": len(self._sessions),
            "sessions_by_workflow": self._count_by_workflow(),
            "oldest_session_age_seconds": self._oldest_session_age(now),
            "cleanup_task_running": self._cleanup_task is not None,
        }

    def _count_by_workflow(self) -> dict[str, int]:
        """Count sessions by workflow ID."""
        counts: dict[str, int] = {}
        for s in self._sessions.values():
            counts[s.workflow_id] = counts.get(s.workflow_id, 0) + 1
        return counts

    def _oldest_session_age(self, now: datetime) -> float | None:
        """Get age of oldest session in seconds."""
        if not self._sessions:
            return None
        oldest = min(s.created_at for s in self._sessions.values())
        return (now - oldest).total_seconds()


def get_session_manager() -> ChatSessionManager:
    """Get the singleton session manager instance.

    Returns:
        The global ChatSessionManager.
    """
    global _manager
    if _manager is None:
        _manager = ChatSessionManager()
    return _manager


async def init_session_manager() -> ChatSessionManager:
    """Initialize the session manager and start background tasks.

    Returns:
        The initialized ChatSessionManager.
    """
    manager = get_session_manager()
    await manager.start_cleanup_task()
    return manager


async def shutdown_session_manager() -> None:
    """Shutdown the session manager."""
    global _manager
    if _manager:
        await _manager.shutdown()
        _manager = None
