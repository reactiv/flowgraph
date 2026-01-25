"""Chat API endpoints for multi-turn conversations."""

import json
import logging
from typing import Any

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from app.db import graph_store
from app.llm.chat.manager import get_session_manager
from app.llm.chat.models import (
    ChatSessionInfo,
    CreateChatSessionRequest,
    CreateChatSessionResponse,
)
from app.llm.transformer.schema_dsl import workflow_to_dsl

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/workflows/{workflow_id}/chat/sessions")
async def create_chat_session(
    workflow_id: str,
    request: CreateChatSessionRequest | None = None,
) -> CreateChatSessionResponse:
    """Create a new chat session for multi-turn conversation.

    The session maintains state between messages and can be used
    with the WebSocket endpoint for interactive chat.
    """
    request = request or CreateChatSessionRequest()
    manager = get_session_manager()

    # Fetch workflow definition for schema context
    definition = await graph_store.get_workflow(workflow_id)
    if not definition:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Convert definition to compact DSL for system prompt context
    schema_dsl: str | None = None
    try:
        schema_dsl = workflow_to_dsl(definition)
        logger.info(f"Generated schema DSL for workflow {workflow_id}")
    except Exception as e:
        logger.warning(f"Failed to generate schema DSL: {e}")

    session = await manager.create_session(
        workflow_id=workflow_id,
        system_prompt=request.system_prompt,
        tools=request.tools,
        include_graph_api=request.include_graph_api,
        schema_dsl=schema_dsl,
    )

    return CreateChatSessionResponse(
        session_id=session.session_id,
        workflow_id=session.workflow_id,
        created_at=session.created_at,
    )


@router.get("/workflows/{workflow_id}/chat/sessions")
async def list_chat_sessions(workflow_id: str) -> list[ChatSessionInfo]:
    """List active chat sessions for a workflow."""
    manager = get_session_manager()
    sessions = manager.get_sessions_for_workflow(workflow_id)

    return [
        ChatSessionInfo(
            session_id=s.session_id,
            workflow_id=s.workflow_id,
            created_at=s.created_at,
            last_activity=s.last_activity,
            message_count=len(s.messages),
            is_active=s.is_active,
        )
        for s in sessions
    ]


@router.get("/workflows/{workflow_id}/chat/sessions/{session_id}")
async def get_chat_session(workflow_id: str, session_id: str) -> ChatSessionInfo:
    """Get information about a specific chat session."""
    manager = get_session_manager()
    session = manager.get_session(session_id)

    if not session or session.workflow_id != workflow_id:
        raise HTTPException(status_code=404, detail="Session not found")

    return ChatSessionInfo(
        session_id=session.session_id,
        workflow_id=session.workflow_id,
        created_at=session.created_at,
        last_activity=session.last_activity,
        message_count=len(session.messages),
        is_active=session.is_active,
    )


@router.delete("/workflows/{workflow_id}/chat/sessions/{session_id}")
async def close_chat_session(workflow_id: str, session_id: str) -> dict[str, str]:
    """Explicitly close a chat session."""
    manager = get_session_manager()
    session = manager.get_session(session_id)

    if not session or session.workflow_id != workflow_id:
        raise HTTPException(status_code=404, detail="Session not found")

    await manager.close_session(session_id)
    return {"status": "closed", "session_id": session_id}


@router.websocket("/workflows/{workflow_id}/chat/ws/{session_id}")
async def chat_websocket(
    websocket: WebSocket,
    workflow_id: str,
    session_id: str,
) -> None:
    """WebSocket endpoint for multi-turn chat.

    Message format from client:
    {"message": "user message text"}

    Events sent to client (same format as transformer SSE):
    {"event": "text", "text": "..."}
    {"event": "tool_call", "tool": "...", "input": {...}}
    {"event": "tool_result", "tool": "...", "result": "..."}
    {"event": "message_complete"}
    {"event": "error", "message": "..."}
    """
    await websocket.accept()

    manager = get_session_manager()
    session = manager.get_session(session_id)

    if not session:
        await websocket.close(code=4004, reason="Session not found")
        return

    if session.workflow_id != workflow_id:
        await websocket.close(code=4004, reason="Session workflow mismatch")
        return

    logger.info(f"WebSocket connected for session {session_id}")

    try:
        while True:
            # Receive user message
            try:
                data = await websocket.receive_json()
            except json.JSONDecodeError:
                await websocket.send_json({
                    "event": "error",
                    "message": "Invalid JSON",
                })
                continue

            message = data.get("message", "").strip()
            if not message:
                await websocket.send_json({
                    "event": "error",
                    "message": "Empty message",
                })
                continue

            # Check if session is still active
            if not session.is_active:
                await websocket.send_json({
                    "event": "error",
                    "message": "Session is no longer active",
                })
                break

            # Check if already processing
            if session.is_processing:
                await websocket.send_json({
                    "event": "error",
                    "message": "Session is busy processing another message",
                })
                continue

            # Stream agent response
            try:
                async for event in session.query(message):
                    await websocket.send_json(event)
            except Exception as e:
                logger.error(f"Error processing message: {e}")
                await websocket.send_json({
                    "event": "error",
                    "message": str(e),
                })

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for session {session_id}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        # Don't close the session on disconnect - it can be reconnected
        # Session will be cleaned up by timeout
        pass


# Optional: SSE endpoint for single-shot chat (no session persistence)
@router.post("/workflows/{workflow_id}/chat/query")
async def chat_query_stream(
    workflow_id: str,
    request: dict[str, Any],
) -> Any:
    """Single-shot chat query with SSE streaming.

    This creates a temporary session, sends one message, and closes it.
    Use the WebSocket endpoint for multi-turn conversations.

    Request body:
    {
        "message": "user message",
        "system_prompt": "optional custom prompt",
        "tools": ["optional", "tool", "list"]
    }
    """
    from fastapi.responses import StreamingResponse

    message = request.get("message", "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message is required")

    system_prompt = request.get("system_prompt")
    tools = request.get("tools")

    # Fetch workflow definition for schema context
    definition = await graph_store.get_workflow(workflow_id)
    if not definition:
        raise HTTPException(status_code=404, detail="Workflow not found")

    schema_dsl: str | None = None
    try:
        schema_dsl = workflow_to_dsl(definition)
    except Exception as e:
        logger.warning(f"Failed to generate schema DSL: {e}")

    manager = get_session_manager()

    async def event_generator():
        session = await manager.create_session(
            workflow_id=workflow_id,
            system_prompt=system_prompt,
            tools=tools,
            schema_dsl=schema_dsl,
        )

        try:
            async for event in session.query(message):
                yield f"data: {json.dumps(event)}\n\n"

            # Send complete event
            yield f"data: {json.dumps({'event': 'complete'})}\n\n"
        except Exception as e:
            logger.error(f"Error in chat query: {e}")
            yield f"data: {json.dumps({'event': 'error', 'message': str(e)})}\n\n"
        finally:
            # Clean up single-shot session
            await manager.close_session(session.session_id)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# Admin endpoint for monitoring
@router.get("/chat/stats")
async def get_chat_stats() -> dict[str, Any]:
    """Get chat session statistics (admin endpoint)."""
    manager = get_session_manager()
    return manager.get_stats()
