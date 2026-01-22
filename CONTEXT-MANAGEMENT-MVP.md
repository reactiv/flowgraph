# Context Management MVP

A minimal viable implementation of external system integration for the flowgraph platform, enabling nodes to reference, cache, and snapshot data from external sources.

## Core Concepts

### Three-Layer Data Model

```
┌─────────────────────────────────────────────────────────────────────┐
│                         POINTER LAYER                                │
│  Durable references to external objects (never copy full content)   │
│  - System identifier, object type, external ID                      │
│  - Canonical URL/deeplink for navigation                            │
│  - Version info (ETag, revision, commit SHA)                        │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       PROJECTION LAYER                               │
│  Normalized partial copy optimized for graph traversal + AI         │
│  - Key fields for search/filtering                                  │
│  - Relationships to other objects                                   │
│  - Freshness metadata (last_fetched, stale_after)                   │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        SNAPSHOT LAYER                                │
│  Immutable copy for reproducibility and audit                       │
│  - Full content at a point in time                                  │
│  - Used when workflow execution depends on data                     │
│  - Content hash for integrity verification                          │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Models

### ExternalReference (Pointer)

```python
class ExternalReference(BaseModel):
    """Durable link to an external object without copying content."""
    id: str                          # Platform-issued reference ID
    system: str                      # e.g., "notion", "gdrive", "github", "jira"
    object_type: str                 # e.g., "page", "file", "issue", "document"
    external_id: str                 # System's native identifier
    canonical_url: str | None        # Deeplink for human navigation

    # Version tracking
    version: str | None              # ETag, revision, commit SHA
    version_type: str = "etag"       # "etag" | "revision" | "sha" | "timestamp"

    # Metadata
    display_name: str | None         # Human-readable name from source
    created_at: datetime
    last_seen_at: datetime           # Last time we verified it exists
```

### Projection (Cached Fields)

```python
class Projection(BaseModel):
    """Normalized partial copy for fast traversal and AI context."""
    id: str                          # Platform-issued projection ID
    reference_id: str                # FK to ExternalReference

    # Cached fields (system-specific but normalized)
    title: str | None
    status: str | None
    owner: str | None
    summary: str | None              # Short text safe for RAG/embeddings
    properties: dict[str, Any]       # Additional key fields
    relationships: list[str]         # IDs of related external references

    # Freshness tracking
    fetched_at: datetime
    stale_after: datetime            # When this projection expires
    freshness_slo: timedelta         # Target freshness (e.g., 1 hour)
    retrieval_mode: str = "cached"   # "cached" | "conditional" | "forced"

    # Change detection
    content_hash: str | None         # Hash of projected fields for diff
```

### Snapshot (Immutable Copy)

```python
class Snapshot(BaseModel):
    """Immutable artifact for audit and reproducibility."""
    id: str                          # Platform-issued snapshot ID
    reference_id: str                # FK to ExternalReference

    # Content
    content_type: str                # MIME type
    content_path: str | None         # Path to stored file (for large content)
    content_inline: str | None       # Inline content (for small text)
    content_hash: str                # SHA-256 for integrity

    # Metadata
    captured_at: datetime
    captured_by: str | None          # User/system that triggered capture
    capture_reason: str | None       # "workflow_execution" | "manual" | "scheduled"

    # Source version at capture time
    source_version: str | None
```

### NodeExternalRef (Node ↔ Reference Link)

```python
class NodeExternalRef(BaseModel):
    """Links a workflow node to an external reference."""
    node_id: str
    reference_id: str
    relationship: str = "source"     # "source" | "related" | "derived_from"
    added_at: datetime
    added_by: str | None             # User who created the link
```

## Freshness Model

### Freshness SLOs by Object Type

| Object Type | Default SLO | Retrieval Mode | Notes |
|-------------|-------------|----------------|-------|
| Machine status | 30 seconds | forced | Real-time operational data |
| Work order state | 5 minutes | conditional | Frequently updated |
| Task/Issue | 15 minutes | conditional | Moderate change frequency |
| Document metadata | 1 hour | cached | Slow-changing |
| Released spec | Immutable | cached | Never changes after release |

### Freshness States

```
FRESH      → stale_after > now()
STALE      → stale_after <= now() AND can serve cached
EXPIRED    → must refresh before serving
```

### Conditional Fetch

Use ETag/If-None-Match when available:
1. Send `If-None-Match: {stored_etag}`
2. If 304 Not Modified → extend staleness, return cached
3. If 200 → update projection, store new ETag

## Connector Contract

Every integration implements this interface:

```python
class BaseConnector(ABC):
    """Standard interface for external system connectors."""

    system: str  # Unique system identifier

    @abstractmethod
    async def identify(self, url_or_id: str) -> ExternalReference:
        """Map external object to stable pointer."""

    @abstractmethod
    async def read(
        self,
        reference: ExternalReference,
        include_content: bool = False
    ) -> tuple[Projection, bytes | None]:
        """Fetch object metadata and optionally full content."""

    @abstractmethod
    async def list_changes(
        self,
        since: datetime | str | None = None
    ) -> list[ExternalReference]:
        """Provide incremental updates since checkpoint."""

    @abstractmethod
    async def resolve_relationships(
        self,
        reference: ExternalReference
    ) -> list[ExternalReference]:
        """List outward links from this object."""

    async def check_permissions(
        self,
        reference: ExternalReference,
        principal: str
    ) -> bool:
        """Check if principal can access object. Default: True."""
        return True

    async def refresh_auth(self) -> None:
        """Refresh authentication tokens if needed."""
        pass
```

### MVP Connectors

1. **NotionConnector** (document-ish)
   - Pages and databases
   - Rich text extraction
   - Relation properties → relationships

2. **GoogleDriveConnector** (document-ish)
   - Files and folders
   - Export to standard formats
   - Folder hierarchy → relationships

## Context Packs

When building context for AI, produce a structured pack:

```python
class ContextPack(BaseModel):
    """Auditable context bundle for AI consumption."""
    id: str
    created_at: datetime

    # Source
    source_node_id: str
    traversal_rule: str              # Which ContextSelector was used

    # Included resources
    resources: list[ContextResource]

    # Freshness summary
    oldest_projection: datetime
    any_stale: bool

    # Token estimation
    estimated_tokens: int

class ContextResource(BaseModel):
    """Single resource in a context pack."""
    reference_id: str | None         # None for internal nodes
    node_id: str | None              # None for external-only

    # Data included
    projection: Projection | None
    snapshot_id: str | None          # If snapshot was used

    # Provenance
    retrieval_mode: str              # How it was fetched
    fetched_at: datetime
    version: str | None

    # What pulled it in
    path_name: str                   # ContextPath that included this
    hop_depth: int                   # Distance from source
```

## Database Schema Extensions

```sql
-- External references (pointers)
CREATE TABLE external_references (
    id TEXT PRIMARY KEY,
    system TEXT NOT NULL,
    object_type TEXT NOT NULL,
    external_id TEXT NOT NULL,
    canonical_url TEXT,
    version TEXT,
    version_type TEXT DEFAULT 'etag',
    display_name TEXT,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    UNIQUE(system, external_id)
);

-- Projections (cached fields)
CREATE TABLE projections (
    id TEXT PRIMARY KEY,
    reference_id TEXT NOT NULL REFERENCES external_references(id),
    title TEXT,
    status TEXT,
    owner TEXT,
    summary TEXT,
    properties_json TEXT,
    relationships_json TEXT,
    fetched_at TEXT NOT NULL,
    stale_after TEXT NOT NULL,
    freshness_slo_seconds INTEGER NOT NULL,
    retrieval_mode TEXT DEFAULT 'cached',
    content_hash TEXT,
    UNIQUE(reference_id)  -- One projection per reference
);

-- Snapshots (immutable copies)
CREATE TABLE snapshots (
    id TEXT PRIMARY KEY,
    reference_id TEXT NOT NULL REFERENCES external_references(id),
    content_type TEXT NOT NULL,
    content_path TEXT,
    content_inline TEXT,
    content_hash TEXT NOT NULL,
    captured_at TEXT NOT NULL,
    captured_by TEXT,
    capture_reason TEXT,
    source_version TEXT
);

-- Node ↔ Reference links
CREATE TABLE node_external_refs (
    node_id TEXT NOT NULL,
    reference_id TEXT NOT NULL REFERENCES external_references(id),
    workflow_id TEXT NOT NULL,
    relationship TEXT DEFAULT 'source',
    added_at TEXT NOT NULL,
    added_by TEXT,
    PRIMARY KEY (node_id, reference_id)
);

-- Context packs (for audit)
CREATE TABLE context_packs (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    source_node_id TEXT NOT NULL,
    traversal_rule TEXT,
    resources_json TEXT NOT NULL,
    oldest_projection TEXT,
    any_stale INTEGER,
    estimated_tokens INTEGER,
    created_at TEXT NOT NULL
);

-- Indexes
CREATE INDEX idx_refs_system_type ON external_references(system, object_type);
CREATE INDEX idx_projections_stale ON projections(stale_after);
CREATE INDEX idx_node_refs_workflow ON node_external_refs(workflow_id);
CREATE INDEX idx_snapshots_reference ON snapshots(reference_id);
```

## API Endpoints

### Reference Management

```
POST   /api/v1/references                    # Create/upsert reference
GET    /api/v1/references/{id}               # Get reference + projection
POST   /api/v1/references/{id}/refresh       # Force refresh projection
POST   /api/v1/references/{id}/snapshot      # Create snapshot
GET    /api/v1/references/{id}/snapshots     # List snapshots

POST   /api/v1/references/resolve            # Resolve URL → reference
GET    /api/v1/references/search             # Search by system/type
```

### Node ↔ Reference Links

```
POST   /api/v1/workflows/{id}/nodes/{node_id}/refs     # Link reference to node
GET    /api/v1/workflows/{id}/nodes/{node_id}/refs     # Get node's references
DELETE /api/v1/workflows/{id}/nodes/{node_id}/refs/{ref_id}
```

### Context Packs

```
POST   /api/v1/workflows/{id}/nodes/{node_id}/context-pack
       # Build context pack with freshness checks
       # Body: { selector: ContextSelector, require_fresh: bool }

GET    /api/v1/context-packs/{id}            # Retrieve stored pack
```

## Implementation Phases

### Phase 1: Core Models + Storage (This MVP)

1. Add data models for ExternalReference, Projection, Snapshot
2. Extend database schema
3. Implement GraphStore methods for CRUD
4. Basic reference resolution API

### Phase 2: Connectors

1. Implement BaseConnector interface
2. NotionConnector with incremental sync
3. GoogleDriveConnector with OAuth refresh
4. Freshness tracking and conditional fetch

### Phase 3: Context Integration

1. Extend ContextGatherer to include external references
2. Context pack generation with provenance
3. Staleness warnings in UI
4. Snapshot capture on workflow execution

### Phase 4: Writeback (Future)

1. Intent/Command model for writes
2. Optimistic concurrency with ETag checks
3. Conflict resolution workflow tasks
4. AI-assisted drafts with approval gates

## File Structure

```
backend/app/
├── models/
│   ├── external_reference.py    # NEW: Pointer, Projection, Snapshot models
│   └── context_pack.py          # NEW: ContextPack, ContextResource
├── db/
│   ├── database.py              # EXTEND: Add new tables
│   └── graph_store.py           # EXTEND: Reference CRUD methods
├── connectors/                   # NEW: Connector implementations
│   ├── base.py                  # BaseConnector ABC
│   ├── notion.py                # NotionConnector
│   └── gdrive.py                # GoogleDriveConnector
├── api/
│   └── references.py            # NEW: Reference API routes
└── llm/
    └── context_gatherer.py      # EXTEND: Context pack generation
```

## Success Criteria

1. **Pointer creation** - Can create references to Notion pages and Google Drive files
2. **Projection caching** - References have cached projections with freshness tracking
3. **Node linking** - Can link workflow nodes to external references
4. **Context traversal** - ContextGatherer includes external references in context
5. **Provenance** - Context packs record what was fetched and when
6. **Staleness awareness** - System knows when projections are stale

## Example Usage

```python
# 1. Create reference from URL
ref = await connector.identify("https://notion.so/My-Page-abc123")
await store.create_reference(ref)

# 2. Fetch and cache projection
projection, _ = await connector.read(ref)
await store.upsert_projection(projection)

# 3. Link to workflow node
await store.link_node_reference(
    workflow_id="wf_123",
    node_id="node_456",
    reference_id=ref.id,
    relationship="source"
)

# 4. Build context pack for AI
pack = await context_gatherer.build_context_pack(
    workflow_id="wf_123",
    source_node_id="node_456",
    selector=my_context_selector,
    require_fresh=True
)

# 5. Use in LLM prompt
context_text = pack.to_prompt_text()
```
