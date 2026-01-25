"""FastAPI application entry point."""

import asyncio
import logging
import os
import sys
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db.database import close_database, init_database
from app.llm.chat.manager import init_session_manager, shutdown_session_manager
from app.storage.upload_store import get_upload_store

# Configure logging
log_level = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, log_level, logging.INFO),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    stream=sys.stdout,
)

logger = logging.getLogger(__name__)

# Background task handle
_cleanup_task: asyncio.Task | None = None


async def cleanup_uploads_periodically() -> None:
    """Background task to clean up expired uploads every 15 minutes."""
    store = get_upload_store()
    while True:
        try:
            deleted = await store.cleanup_expired()
            if deleted > 0:
                logger.info(f"Cleanup task removed {deleted} expired upload(s)")
        except Exception as e:
            logger.exception(f"Error in cleanup task: {e}")

        # Wait 15 minutes before next cleanup
        await asyncio.sleep(15 * 60)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan handler for startup and shutdown."""
    global _cleanup_task

    # Startup
    db_path = os.getenv("DATABASE_PATH", "./data/workflow.db")
    await init_database(db_path)

    # Start background cleanup task
    _cleanup_task = asyncio.create_task(cleanup_uploads_periodically())
    logger.info("Started upload cleanup background task")

    # Start chat session manager
    await init_session_manager()

    yield

    # Shutdown
    if _cleanup_task:
        _cleanup_task.cancel()
        try:
            await _cleanup_task
        except asyncio.CancelledError:
            pass
        logger.info("Stopped upload cleanup background task")

    # Shutdown chat session manager
    await shutdown_session_manager()

    await close_database()


app = FastAPI(
    title="Workflow Graph Studio",
    description="Turn workflow templates into working apps with realistic data and polished UI",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS middleware - allow any localhost port for worktree setups
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^http://localhost(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "healthy"}


# Import and include routers after app is created to avoid circular imports
from app.api import chat, endpoints, execute, files, references, templates, workflows  # noqa: E402

app.include_router(files.router, prefix="/api/v1", tags=["files"])
app.include_router(references.router, prefix="/api/v1", tags=["references"])
app.include_router(templates.router, prefix="/api/v1", tags=["templates"])
app.include_router(workflows.router, prefix="/api/v1", tags=["workflows"])
app.include_router(endpoints.router, prefix="/api/v1", tags=["endpoints"])
app.include_router(chat.router, prefix="/api/v1", tags=["chat"])
app.include_router(execute.router, tags=["execute"])
