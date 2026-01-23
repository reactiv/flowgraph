"""External system connectors.

This module provides a standardized interface for integrating with external systems
(Notion, Google Drive, GitHub, Jira, etc.) using the Pointer/Projection/Snapshot model.
"""

from app.connectors.base import BaseConnector, ConnectorError, ConnectorRegistry

__all__ = ["BaseConnector", "ConnectorError", "ConnectorRegistry"]
