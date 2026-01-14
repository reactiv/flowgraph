"""Pydantic models for Event instances."""

from typing import Any

from pydantic import BaseModel, Field


class EventCreate(BaseModel):
    """Request model for creating an event."""

    subject_node_id: str | None = None
    event_type: str
    payload: dict[str, Any] = Field(default_factory=dict)


class Event(BaseModel):
    """An event in the workflow timeline."""

    id: str
    workflow_id: str
    subject_node_id: str | None = None
    event_type: str
    payload: dict[str, Any] = Field(default_factory=dict)
    created_at: str
