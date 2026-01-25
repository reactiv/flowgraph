"""Base connector interface for external system integration.

All connectors must implement this interface to provide a consistent way to:
1. Identify external objects (URL/ID → ExternalReference)
2. Read object data (ExternalReference → Projection + optional content)
3. List changes since a checkpoint (incremental sync)
4. Resolve relationships (outward links)
5. Check permissions
"""

import hashlib
import re
from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any, ClassVar

from app.models.external_reference import (
    ExternalReference,
    ExternalReferenceCreate,
    ProjectionCreate,
    get_default_freshness_slo,
)


class ConnectorError(Exception):
    """Base exception for connector errors."""

    def __init__(self, message: str, system: str | None = None, retriable: bool = False):
        super().__init__(message)
        self.system = system
        self.retriable = retriable


class AuthenticationError(ConnectorError):
    """Authentication failed (token expired, invalid credentials)."""

    pass


class NotFoundError(ConnectorError):
    """External object not found."""

    pass


class RateLimitError(ConnectorError):
    """Rate limit exceeded."""

    def __init__(self, message: str, retry_after: int | None = None, **kwargs: Any):
        super().__init__(message, retriable=True, **kwargs)
        self.retry_after = retry_after


class BaseConnector(ABC):
    """Abstract base class for external system connectors.

    Connectors provide a standardized way to interact with external systems,
    converting system-specific data into the Pointer/Projection/Snapshot model.

    Example implementation:
        class NotionConnector(BaseConnector):
            system = "notion"
            supported_types = ["page", "database"]

            async def identify(self, url_or_id: str) -> ExternalReferenceCreate:
                # Parse Notion URL or ID
                page_id = self._extract_page_id(url_or_id)
                page = await self._client.pages.retrieve(page_id)
                return ExternalReferenceCreate(
                    system="notion",
                    object_type="page",
                    external_id=page_id,
                    canonical_url=page["url"],
                    display_name=self._extract_title(page),
                )
    """

    # Class-level configuration
    system: ClassVar[str]  # Unique system identifier (e.g., "notion", "gdrive")
    supported_types: ClassVar[list[str]]  # Object types this connector handles

    # URL patterns for automatic identification
    url_patterns: ClassVar[list[str]] = []  # Regex patterns to match URLs

    def __init__(self, connector_id: str | None = None) -> None:
        """Initialize the connector.

        Args:
            connector_id: Optional database connector ID for loading secrets from DB
        """
        self._authenticated = False
        self._connector_id = connector_id
        self._secrets_cache: dict[str, str] = {}

    async def _get_secret(self, key: str, env_fallback: str | None = None) -> str | None:
        """Get a secret value, checking DB first, then environment.

        Args:
            key: The secret key name
            env_fallback: Optional environment variable to check as fallback

        Returns:
            The secret value or None if not found
        """
        # Check cache first
        if key in self._secrets_cache:
            return self._secrets_cache[key]

        # Try database if we have a connector ID
        if self._connector_id:
            try:
                from app.db import connector_store

                value = await connector_store.get_secret(self._connector_id, key)
                if value:
                    self._secrets_cache[key] = value
                    return value
            except Exception:
                pass  # Fall through to env var

        # Try environment variable
        if env_fallback:
            import os

            value = os.environ.get(env_fallback)
            if value:
                self._secrets_cache[key] = value
                return value

        return None

    # =========================================================================
    # Abstract Methods (must implement)
    # =========================================================================

    @abstractmethod
    async def identify(self, url_or_id: str) -> ExternalReferenceCreate:
        """Map external object (URL or ID) to a reference.

        This is the primary entry point for creating references. It should:
        1. Parse the URL or ID to extract the object identifier
        2. Optionally fetch minimal metadata (name, type)
        3. Return a reference without fetching full content

        Args:
            url_or_id: URL, deeplink, or native object ID

        Returns:
            ExternalReferenceCreate ready to be persisted

        Raises:
            NotFoundError: If object doesn't exist
            AuthenticationError: If authentication fails
        """
        pass

    @abstractmethod
    async def read(
        self,
        reference: ExternalReference,
        include_content: bool = False,
        if_none_match: str | None = None,
    ) -> tuple[ProjectionCreate | None, bytes | None]:
        """Fetch object data and optionally full content.

        This method should:
        1. Fetch metadata and key fields for the projection
        2. Optionally fetch full content (for snapshots)
        3. Support conditional fetch via if_none_match (ETag)

        Args:
            reference: The external reference to read
            include_content: Whether to fetch full content
            if_none_match: ETag for conditional fetch (returns None if unchanged)

        Returns:
            Tuple of (ProjectionCreate or None if unchanged, content bytes or None)

        Raises:
            NotFoundError: If object no longer exists
            AuthenticationError: If authentication fails
        """
        pass

    @abstractmethod
    async def list_changes(
        self,
        since: datetime | str | None = None,
        object_types: list[str] | None = None,
        limit: int = 100,
    ) -> list[ExternalReferenceCreate]:
        """List objects changed since a checkpoint.

        Used for incremental sync. Should return objects that:
        1. Were created after `since`
        2. Were modified after `since`
        3. Optionally deleted (if the system supports it)

        Args:
            since: Checkpoint (datetime or cursor string)
            object_types: Filter to specific object types
            limit: Maximum number of results

        Returns:
            List of references to changed objects
        """
        pass

    # =========================================================================
    # Optional Methods (can override)
    # =========================================================================

    async def resolve_relationships(
        self, reference: ExternalReference
    ) -> list[ExternalReferenceCreate]:
        """List outward links from this object.

        Override to extract relationships from the object:
        - Notion: relation properties, mentions, links
        - Google Drive: folder contents, linked files
        - GitHub: linked issues, PRs, commits

        Args:
            reference: The source object

        Returns:
            List of references to related objects
        """
        return []

    async def check_permissions(
        self, reference: ExternalReference, principal: str
    ) -> bool:
        """Check if principal can access the object.

        Override to implement permission checking if the system
        provides ACL information.

        Args:
            reference: The object to check
            principal: User identifier

        Returns:
            True if access is allowed
        """
        return True

    async def refresh_auth(self) -> None:
        """Refresh authentication tokens if needed.

        Override to implement token refresh for OAuth systems.
        """
        pass

    async def write(
        self,
        reference: ExternalReference,
        updates: dict[str, Any],
        if_match: str | None = None,
    ) -> ExternalReference:
        """Write updates back to the external system.

        Override to implement writeback with optimistic concurrency.

        Args:
            reference: The object to update
            updates: Dictionary of field updates
            if_match: ETag for optimistic concurrency

        Returns:
            Updated reference with new version

        Raises:
            NotImplementedError: If writeback not supported
        """
        raise NotImplementedError(f"{self.system} connector does not support writes")

    # =========================================================================
    # Helper Methods
    # =========================================================================

    def matches_url(self, url: str) -> bool:
        """Check if this connector can handle the given URL."""
        for pattern in self.url_patterns:
            if re.match(pattern, url):
                return True
        return False

    def create_projection(
        self,
        reference_id: str,
        title: str | None = None,
        status: str | None = None,
        owner: str | None = None,
        summary: str | None = None,
        properties: dict[str, Any] | None = None,
        relationships: list[str] | None = None,
    ) -> ProjectionCreate:
        """Helper to create a projection with default freshness settings."""
        slo_seconds, mode = get_default_freshness_slo(
            self.system,
            "document",  # Default type
        )

        return ProjectionCreate(
            reference_id=reference_id,
            title=title,
            status=status,
            owner=owner,
            summary=summary,
            properties=properties or {},
            relationships=relationships or [],
            freshness_slo_seconds=slo_seconds,
            retrieval_mode=mode,
        )

    @staticmethod
    def compute_content_hash(content: bytes | str) -> str:
        """Compute SHA-256 hash for content integrity."""
        if isinstance(content, str):
            content = content.encode("utf-8")
        return hashlib.sha256(content).hexdigest()

    @staticmethod
    def compute_projection_hash(projection: ProjectionCreate) -> str:
        """Compute hash of projection fields for change detection."""
        # Hash the key fields
        data = {
            "title": projection.title,
            "status": projection.status,
            "owner": projection.owner,
            "summary": projection.summary,
            "properties": projection.properties,
        }
        content = str(sorted(data.items())).encode("utf-8")
        return hashlib.sha256(content).hexdigest()[:16]


class ConnectorRegistry:
    """Registry of available connectors.

    Use this to look up connectors by system name or URL pattern.
    """

    _connectors: dict[str, type[BaseConnector]] = {}

    @classmethod
    def register(cls, connector_class: type[BaseConnector]) -> type[BaseConnector]:
        """Register a connector class.

        Can be used as a decorator:
            @ConnectorRegistry.register
            class NotionConnector(BaseConnector):
                system = "notion"
        """
        cls._connectors[connector_class.system] = connector_class
        return connector_class

    @classmethod
    def get(cls, system: str) -> type[BaseConnector] | None:
        """Get connector class by system name."""
        return cls._connectors.get(system)

    @classmethod
    async def get_instance(cls, system: str) -> BaseConnector | None:
        """Get a connector instance with database secrets support.

        This method looks up the connector's database ID and passes it
        to the connector so it can load secrets from the database.
        """
        connector_class = cls._connectors.get(system)
        if not connector_class:
            return None

        # Try to get the connector ID from the database
        connector_id = None
        try:
            from app.db import connector_store

            db_connector = await connector_store.get_connector_by_system(system)
            if db_connector:
                connector_id = db_connector.id
        except Exception:
            pass  # Database not available, proceed without ID

        return connector_class(connector_id=connector_id)

    @classmethod
    def get_for_url(cls, url: str) -> type[BaseConnector] | None:
        """Get connector class that can handle the given URL.

        NOTE: This only checks hardcoded connectors. For database connectors,
        use get_instance_for_url() which also checks the database.
        """
        for connector_class in cls._connectors.values():
            # Create temporary instance to check URL
            if any(re.match(p, url) for p in connector_class.url_patterns):
                return connector_class
        return None

    @classmethod
    async def get_instance_for_url(cls, url: str) -> BaseConnector | None:
        """Get a connector instance for a URL with database secrets support.

        Checks both hardcoded connectors and database-stored custom connectors.
        """
        # First check hardcoded connectors
        connector_class = cls.get_for_url(url)
        if connector_class:
            return await cls.get_instance(connector_class.system)

        # Check database for custom connectors with matching URL patterns
        try:
            from app.db import connector_store

            db_connector = await connector_store.get_connector_for_url(url)
            if db_connector and db_connector.has_learned:
                # Return a DynamicConnector that uses the learned transformer
                return DynamicConnector(db_connector)
        except Exception:
            pass

        return None

    @classmethod
    def list_systems(cls) -> list[str]:
        """List registered system names."""
        return list(cls._connectors.keys())

    @classmethod
    def list_connectors(cls) -> list[type[BaseConnector]]:
        """List all registered connector classes."""
        return list(cls._connectors.values())


class DynamicConnector(BaseConnector):
    """Connector that executes learned transformer code.

    This class wraps a database-stored connector and executes its
    learned transform.py code to perform identify/read operations.
    """

    def __init__(self, db_connector: Any) -> None:
        """Initialize with a database connector record.

        Args:
            db_connector: A Connector model from the database
        """
        super().__init__(connector_id=db_connector.id)
        self._db_connector = db_connector

    @property
    def system(self) -> str:
        """Return the system identifier."""
        return self._db_connector.system

    @property
    def supported_types(self) -> list[str]:
        """Return supported object types."""
        return self._db_connector.supported_types

    @property
    def url_patterns(self) -> list[str]:
        """Return URL patterns."""
        return self._db_connector.url_patterns

    async def identify(self, url_or_id: str) -> ExternalReferenceCreate:
        """Identify an external object by running the learned transform.py.

        Args:
            url_or_id: URL to identify

        Returns:
            ExternalReferenceCreate with parsed metadata
        """
        output = await self._run_transform(url_or_id)

        return ExternalReferenceCreate(
            system=output.get("system", self._db_connector.system),
            object_type=output.get("object_type", "document"),
            external_id=output.get("external_id", url_or_id),
            canonical_url=output.get("canonical_url", url_or_id),
            display_name=output.get("display_name"),
        )

    async def read(
        self,
        reference: ExternalReference,
        include_content: bool = False,
        if_none_match: str | None = None,
    ) -> tuple[ProjectionCreate | None, bytes | None]:
        """Read external object data by running the learned transform.py.

        Args:
            reference: The reference to read
            include_content: Whether to include raw content
            if_none_match: ETag for conditional fetch

        Returns:
            Tuple of (ProjectionCreate, content bytes)
        """
        output = await self._run_transform(reference.canonical_url or reference.external_id)

        projection = self.create_projection(
            reference_id=reference.id,
            title=output.get("title") or output.get("display_name"),
            status=output.get("status"),
            owner=output.get("owner"),
            summary=None,  # Could generate from properties
            properties=output.get("properties", {}),
        )

        # No raw content available from transformer
        return projection, None

    async def list_changes(
        self,
        since: datetime | str | None = None,
        object_types: list[str] | None = None,
        limit: int = 100,
    ) -> list[ExternalReferenceCreate]:
        """List changes - not supported for dynamic connectors."""
        return []

    async def _run_transform(self, url: str) -> dict[str, Any]:
        """Execute the learned transform.py code with the given URL.

        Args:
            url: The URL to pass to the transform

        Returns:
            The parsed output from the transform
        """
        import json
        import subprocess
        import tempfile
        from pathlib import Path

        transformer_code = self._db_connector.learned_connector_code
        if not transformer_code:
            raise ConnectorError(
                f"Connector '{self._db_connector.system}' has no learned code",
                system=self._db_connector.system,
            )

        # Get secrets for this connector
        from app.db import connector_store

        secrets = await connector_store.get_all_secrets(self._db_connector.id)

        with tempfile.TemporaryDirectory() as temp_dir:
            work_dir = Path(temp_dir)

            # Write input.json
            input_path = work_dir / "input.json"
            input_path.write_text(json.dumps({"url": url}))

            # Write transform.py
            transform_path = work_dir / "transform.py"
            transform_path.write_text(transformer_code)

            # Build environment with secrets
            import os

            env = os.environ.copy()
            if secrets:
                env.update(secrets)

            # Execute transform.py
            try:
                result = subprocess.run(
                    ["python", str(transform_path)],
                    cwd=str(work_dir),
                    capture_output=True,
                    text=True,
                    timeout=30,
                    env=env,
                )
            except subprocess.TimeoutExpired:
                raise ConnectorError(
                    f"Transform timed out for {self._db_connector.system}",
                    system=self._db_connector.system,
                    retriable=True,
                )

            if result.returncode != 0:
                raise ConnectorError(
                    f"Transform failed: {result.stderr}",
                    system=self._db_connector.system,
                )

            # Read output.json
            output_path = work_dir / "output.json"
            if not output_path.exists():
                raise ConnectorError(
                    "Transform did not produce output.json",
                    system=self._db_connector.system,
                )

            try:
                output = json.loads(output_path.read_text())
                return output
            except json.JSONDecodeError as e:
                raise ConnectorError(
                    f"Invalid JSON in output.json: {e}",
                    system=self._db_connector.system,
                )
