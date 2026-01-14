"""Pytest configuration and fixtures."""

import asyncio
import os
import tempfile
from typing import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient

from app.db.database import init_database, close_database
from app.main import app


@pytest.fixture(scope="session")
def event_loop():
    """Create an event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(autouse=True)
async def setup_test_db():
    """Set up a test database for each test."""
    # Create a temporary database file
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name

    # Initialize the database
    await init_database(db_path)

    yield

    # Clean up
    await close_database()
    os.unlink(db_path)


@pytest.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    """Create an async test client."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        yield client
