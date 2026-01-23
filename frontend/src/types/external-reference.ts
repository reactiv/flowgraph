/**
 * TypeScript types for external references, projections, and snapshots.
 * Mirrors the backend Pydantic models from app/models/external_reference.py
 */

// ==================== Enums ====================

export type VersionType = 'etag' | 'revision' | 'sha' | 'timestamp';

export type RetrievalMode = 'cached' | 'conditional' | 'forced';

export type ReferenceRelationship = 'source' | 'related' | 'derived_from';

export type CaptureReason = 'workflow_execution' | 'manual' | 'scheduled';

// ==================== Pointer Layer: ExternalReference ====================

export interface ExternalReferenceCreate {
  system: string;
  object_type: string;
  external_id: string;
  canonical_url?: string | null;
  version?: string | null;
  version_type?: VersionType;
  display_name?: string | null;
}

export interface ExternalReference extends ExternalReferenceCreate {
  id: string;
  created_at: string;
  last_seen_at: string;
}

// ==================== Projection Layer: Cached Fields ====================

export interface ProjectionCreate {
  reference_id: string;
  title?: string | null;
  status?: string | null;
  owner?: string | null;
  summary?: string | null;
  properties?: Record<string, unknown>;
  relationships?: string[];
  freshness_slo_seconds?: number;
  retrieval_mode?: RetrievalMode;
}

export interface Projection extends ProjectionCreate {
  id: string;
  fetched_at: string;
  stale_after: string;
  content_hash?: string | null;
}

export interface ExternalReferenceWithProjection extends ExternalReference {
  projection: Projection | null;
}

// ==================== Snapshot Layer: Immutable Copies ====================

export interface SnapshotCreate {
  reference_id: string;
  content_type: string;
  content_path?: string | null;
  content_inline?: string | null;
  content_hash: string;
  captured_by?: string | null;
  capture_reason?: CaptureReason;
  source_version?: string | null;
}

export interface Snapshot extends SnapshotCreate {
  id: string;
  captured_at: string;
}

// ==================== Node ↔ Reference Links ====================

export interface NodeExternalRefCreate {
  reference_id: string;
  relationship?: ReferenceRelationship;
  added_by?: string | null;
}

export interface NodeExternalRef {
  node_id: string;
  reference_id: string;
  workflow_id: string;
  relationship: ReferenceRelationship;
  added_at: string;
  added_by: string | null;
}

export interface NodeExternalRefWithDetails extends NodeExternalRef {
  reference: ExternalReferenceWithProjection;
}

// ==================== API Response Types ====================

export interface ReferencesResponse {
  references: ExternalReference[];
  total: number;
  limit: number;
  offset: number;
}

export interface ResolveUrlRequest {
  url: string;
}

export interface ResolveUrlResponse {
  reference: ExternalReference;
  projection: Projection | null;
  is_new: boolean;
}

export interface RefreshProjectionResponse {
  projection: Projection;
  was_stale: boolean;
  changed: boolean;
}

export interface NodeRefsResponse {
  references: NodeExternalRefWithDetails[];
}

export interface SnapshotsResponse {
  snapshots: Snapshot[];
}

// ==================== Connector Types ====================

export interface Connector {
  system: string;
  supported_types: string[];
  url_patterns: string[];
}

export interface ConnectorsResponse {
  connectors: Connector[];
}

// ==================== Freshness Helpers ====================

/**
 * Check if a projection is fresh (not yet stale).
 */
export function isProjectionFresh(projection: Projection): boolean {
  return new Date(projection.stale_after) > new Date();
}

/**
 * Get freshness status for display.
 */
export function getProjectionFreshnessStatus(
  projection: Projection | null
): 'fresh' | 'stale' | 'unknown' {
  if (!projection) return 'unknown';
  return isProjectionFresh(projection) ? 'fresh' : 'stale';
}

/**
 * Format time since last fetch.
 */
export function formatTimeSinceFetch(projection: Projection): string {
  const fetchedAt = new Date(projection.fetched_at);
  const now = new Date();
  const diffMs = now.getTime() - fetchedAt.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
