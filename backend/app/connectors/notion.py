"""Notion connector for pages and databases.

This connector integrates with Notion using the official notion-client SDK,
converting Notion pages and databases into the Pointer/Projection model.
"""

import re
from datetime import datetime
from typing import Any, ClassVar

from app.connectors.base import (
    AuthenticationError,
    BaseConnector,
    ConnectorError,
    ConnectorRegistry,
    NotFoundError,
)
from app.models.external_reference import (
    ExternalReference,
    ExternalReferenceCreate,
    ProjectionCreate,
    VersionType,
    get_default_freshness_slo,
)


@ConnectorRegistry.register
class NotionConnector(BaseConnector):
    """Connector for Notion pages and databases."""

    system: ClassVar[str] = "notion"
    supported_types: ClassVar[list[str]] = ["page", "database"]
    url_patterns: ClassVar[list[str]] = [
        r"https?://(?:www\.)?notion\.so/.*",
        r"https?://(?:www\.)?notion\.site/.*",
    ]

    def __init__(self, connector_id: str | None = None) -> None:
        super().__init__(connector_id)
        self._client: Any = None

    async def _ensure_client(self) -> Any:
        """Ensure Notion client is initialized."""
        if self._client is None:
            # Try to get token from DB first, then fall back to env var
            token = await self._get_secret("api_token", env_fallback="NOTION_TOKEN")
            if not token:
                raise AuthenticationError(
                    "Notion API token not configured. Set it via the Connectors "
                    "page or NOTION_TOKEN environment variable.",
                    system=self.system,
                )
            try:
                from notion_client import Client

                self._client = Client(auth=token)
            except ImportError:
                raise ConnectorError(
                    "notion-client package not installed. Run: pip install notion-client",
                    system=self.system,
                )
        return self._client

    def _extract_id_from_url(self, url: str) -> tuple[str, str]:
        """Extract page/database ID and type from Notion URL.

        Notion URLs can be:
        - https://notion.so/Page-Title-abc123def456...
        - https://notion.so/workspace/abc123def456...
        - https://www.notion.so/username/Page-abc123def456?v=xyz
        - notion://notion.so/Page-abc123def456

        Returns:
            Tuple of (id, object_type)
        """
        # Remove query params and fragments
        url = url.split("?")[0].split("#")[0]

        # Try to find a 32-character hex ID (without dashes)
        hex_pattern = r"[a-f0-9]{32}"
        matches = re.findall(hex_pattern, url.lower())

        if matches:
            # Take the last match (usually the page/database ID)
            raw_id = matches[-1]
            # Convert to UUID format
            formatted_id = (
                f"{raw_id[:8]}-{raw_id[8:12]}-{raw_id[12:16]}-"
                f"{raw_id[16:20]}-{raw_id[20:]}"
            )
            return formatted_id, "page"  # Default to page, will verify later

        # Try UUID format directly
        uuid_pattern = r"[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}"
        uuid_matches = re.findall(uuid_pattern, url.lower())
        if uuid_matches:
            return uuid_matches[-1], "page"

        raise ConnectorError(
            f"Could not extract Notion ID from URL: {url}",
            system=self.system,
        )

    def _extract_title(self, page_or_db: dict[str, Any]) -> str | None:
        """Extract title from a Notion page or database."""
        # Database title
        if "title" in page_or_db and isinstance(page_or_db["title"], list):
            return "".join(t.get("plain_text", "") for t in page_or_db["title"])

        # Page title from properties
        props = page_or_db.get("properties", {})
        for prop in props.values():
            if prop.get("type") == "title":
                title_list = prop.get("title", [])
                if title_list:
                    return "".join(t.get("plain_text", "") for t in title_list)

        return None

    def _extract_property_value(self, prop: dict[str, Any]) -> Any:
        """Extract value from a Notion property."""
        prop_type = prop.get("type")

        if prop_type == "title":
            return "".join(t.get("plain_text", "") for t in prop.get("title", []))
        elif prop_type == "rich_text":
            return "".join(t.get("plain_text", "") for t in prop.get("rich_text", []))
        elif prop_type == "number":
            return prop.get("number")
        elif prop_type == "select":
            select = prop.get("select")
            return select.get("name") if select else None
        elif prop_type == "multi_select":
            return [s.get("name") for s in prop.get("multi_select", [])]
        elif prop_type == "date":
            date = prop.get("date")
            return date.get("start") if date else None
        elif prop_type == "checkbox":
            return prop.get("checkbox")
        elif prop_type == "url":
            return prop.get("url")
        elif prop_type == "email":
            return prop.get("email")
        elif prop_type == "phone_number":
            return prop.get("phone_number")
        elif prop_type == "relation":
            return [r.get("id") for r in prop.get("relation", [])]
        elif prop_type == "people":
            people = prop.get("people", [])
            return [p.get("name") or p.get("id") for p in people]
        elif prop_type == "created_time":
            return prop.get("created_time")
        elif prop_type == "last_edited_time":
            return prop.get("last_edited_time")
        elif prop_type == "status":
            status = prop.get("status")
            return status.get("name") if status else None
        else:
            return None

    async def identify(self, url_or_id: str) -> ExternalReferenceCreate:
        """Map Notion URL or ID to an external reference."""
        client = await self._ensure_client()

        # Handle URLs vs raw IDs
        if url_or_id.startswith("http"):
            object_id, object_type = self._extract_id_from_url(url_or_id)
        else:
            # Assume it's a raw ID
            object_id = url_or_id.replace("-", "")
            if len(object_id) == 32:
                object_id = (
                    f"{object_id[:8]}-{object_id[8:12]}-{object_id[12:16]}-"
                    f"{object_id[16:20]}-{object_id[20:]}"
                )
            object_type = "page"

        # Try to retrieve as page first, then as database
        page_data = None
        db_data = None

        try:
            page_data = client.pages.retrieve(page_id=object_id)
            object_type = "page"
        except Exception:
            pass

        if page_data is None:
            try:
                db_data = client.databases.retrieve(database_id=object_id)
                object_type = "database"
            except Exception:
                pass

        data = page_data or db_data
        if data is None:
            raise NotFoundError(
                f"Could not find Notion page or database: {object_id}",
                system=self.system,
            )

        title = self._extract_title(data)
        canonical_url = data.get("url")

        return ExternalReferenceCreate(
            system=self.system,
            object_type=object_type,
            external_id=object_id,
            canonical_url=canonical_url,
            display_name=title,
            version=data.get("last_edited_time"),
            version_type=VersionType.TIMESTAMP,
        )

    async def read(
        self,
        reference: ExternalReference,
        include_content: bool = False,
        if_none_match: str | None = None,
    ) -> tuple[ProjectionCreate | None, bytes | None]:
        """Fetch Notion page/database data."""
        client = await self._ensure_client()

        object_id = reference.external_id
        object_type = reference.object_type

        # Fetch the object
        try:
            if object_type == "database":
                data = client.databases.retrieve(database_id=object_id)
            else:
                data = client.pages.retrieve(page_id=object_id)
        except Exception as e:
            raise NotFoundError(str(e), system=self.system)

        # Check if unchanged (conditional fetch)
        last_edited = data.get("last_edited_time")
        if if_none_match and last_edited == if_none_match:
            return None, None

        # Extract projection fields
        title = self._extract_title(data)
        properties: dict[str, Any] = {}
        relationships: list[str] = []

        # Extract all properties
        for name, prop in data.get("properties", {}).items():
            value = self._extract_property_value(prop)
            if value is not None:
                properties[name] = value

            # Track relation properties as relationships
            if prop.get("type") == "relation":
                for rel_id in prop.get("relation", []):
                    if rel_id.get("id"):
                        relationships.append(rel_id["id"])

        # Extract status if present
        status = None
        for name, prop in data.get("properties", {}).items():
            if prop.get("type") in ("status", "select"):
                val = self._extract_property_value(prop)
                if val:
                    status = val
                    break

        # Extract owner (created_by or last_edited_by)
        owner = None
        if "created_by" in data:
            owner = data["created_by"].get("name") or data["created_by"].get("id")
        elif "last_edited_by" in data:
            owner = data["last_edited_by"].get("name") or data["last_edited_by"].get("id")

        # Get freshness settings
        slo_seconds, mode = get_default_freshness_slo(self.system, object_type)

        projection = ProjectionCreate(
            reference_id=reference.id,
            title=title,
            status=status,
            owner=owner,
            summary=None,  # Would need to fetch blocks for summary
            properties=properties,
            relationships=relationships,
            freshness_slo_seconds=slo_seconds,
            retrieval_mode=mode,
        )

        # Optionally fetch full content (blocks)
        content = None
        if include_content and object_type == "page":
            try:
                blocks = client.blocks.children.list(block_id=object_id)
                text_parts = []
                for block in blocks.get("results", []):
                    text = self._extract_block_text(block)
                    if text:
                        text_parts.append(text)
                if text_parts:
                    content = "\n".join(text_parts).encode("utf-8")
                    # Update summary with first few paragraphs
                    projection.summary = "\n".join(text_parts[:3])[:500]
            except Exception:
                pass  # Content fetch is optional

        return projection, content

    def _extract_block_text(self, block: dict[str, Any]) -> str | None:
        """Extract plain text from a Notion block."""
        block_type = block.get("type")
        content = block.get(block_type, {})

        if "rich_text" in content:
            return "".join(t.get("plain_text", "") for t in content["rich_text"])
        elif "text" in content:
            return "".join(t.get("plain_text", "") for t in content["text"])

        return None

    async def list_changes(
        self,
        since: datetime | str | None = None,
        object_types: list[str] | None = None,
        limit: int = 100,
    ) -> list[ExternalReferenceCreate]:
        """List Notion objects changed since a checkpoint.

        Note: Notion's API doesn't provide a native "changes since" endpoint,
        so this queries recently modified pages/databases.
        """
        client = await self._ensure_client()

        # Convert datetime to ISO string
        if isinstance(since, datetime):
            since_str = since.isoformat()
        else:
            since_str = since

        results: list[ExternalReferenceCreate] = []

        # Search for recently modified content
        try:
            # Notion search API
            search_results = client.search(
                sort={
                    "direction": "descending",
                    "timestamp": "last_edited_time",
                },
                page_size=min(limit, 100),
            )

            for item in search_results.get("results", []):
                object_type = item.get("object")  # "page" or "database"

                # Filter by object type if specified
                if object_types and object_type not in object_types:
                    continue

                # Filter by modification time if since specified
                last_edited = item.get("last_edited_time")
                if since_str and last_edited and last_edited < since_str:
                    continue

                title = self._extract_title(item)
                results.append(
                    ExternalReferenceCreate(
                        system=self.system,
                        object_type=object_type,
                        external_id=item["id"],
                        canonical_url=item.get("url"),
                        display_name=title,
                        version=last_edited,
                        version_type=VersionType.TIMESTAMP,
                    )
                )

                if len(results) >= limit:
                    break

        except Exception as e:
            raise ConnectorError(str(e), system=self.system)

        return results

    async def resolve_relationships(
        self, reference: ExternalReference
    ) -> list[ExternalReferenceCreate]:
        """Extract related pages from Notion relations and links."""
        client = await self._ensure_client()

        results: list[ExternalReferenceCreate] = []

        try:
            # Fetch the page
            if reference.object_type == "page":
                page = client.pages.retrieve(page_id=reference.external_id)

                # Find relation properties
                for name, prop in page.get("properties", {}).items():
                    if prop.get("type") == "relation":
                        for rel in prop.get("relation", []):
                            rel_id = rel.get("id")
                            if rel_id:
                                # Fetch minimal info for the related page
                                try:
                                    related = client.pages.retrieve(page_id=rel_id)
                                    results.append(
                                        ExternalReferenceCreate(
                                            system=self.system,
                                            object_type="page",
                                            external_id=rel_id,
                                            canonical_url=related.get("url"),
                                            display_name=self._extract_title(related),
                                            version=related.get("last_edited_time"),
                                            version_type=VersionType.TIMESTAMP,
                                        )
                                    )
                                except Exception:
                                    pass

            elif reference.object_type == "database":
                # For databases, list the pages it contains
                db_pages = client.databases.query(
                    database_id=reference.external_id,
                    page_size=50,
                )

                for page in db_pages.get("results", []):
                    results.append(
                        ExternalReferenceCreate(
                            system=self.system,
                            object_type="page",
                            external_id=page["id"],
                            canonical_url=page.get("url"),
                            display_name=self._extract_title(page),
                            version=page.get("last_edited_time"),
                            version_type=VersionType.TIMESTAMP,
                        )
                    )

        except Exception as e:
            raise ConnectorError(str(e), system=self.system)

        return results
