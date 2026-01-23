"""External system connectors.

This module provides a standardized interface for integrating with external systems
(Notion, Google Drive, GitHub, Jira, etc.) using the Pointer/Projection/Snapshot model.
"""

from app.connectors.base import BaseConnector, ConnectorError, ConnectorRegistry

# Import connectors to trigger registration via @ConnectorRegistry.register decorator
from app.connectors.notion import NotionConnector  # noqa: F401

__all__ = ["BaseConnector", "ConnectorError", "ConnectorRegistry", "NotionConnector"]
