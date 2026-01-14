"""FastAPI application entry point."""

import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db.database import init_database, close_database


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan handler for startup and shutdown."""
    # Startup
    db_path = os.getenv("DATABASE_PATH", "./data/workflow.db")
    await init_database(db_path)
    yield
    # Shutdown
    await close_database()


app = FastAPI(
    title="Workflow Graph Studio",
    description="Turn workflow templates into working apps with realistic data and polished UI",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://frontend:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "healthy"}


# Import and include routers after app is created to avoid circular imports
from app.api import templates, workflows  # noqa: E402

app.include_router(templates.router, prefix="/api/v1", tags=["templates"])
app.include_router(workflows.router, prefix="/api/v1", tags=["workflows"])
