/**
 * TypeScript types for learnable workflow endpoints.
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';
export type TransformMode = 'direct' | 'code';

/**
 * Full endpoint model returned from API.
 */
export interface Endpoint {
  id: string;
  workflowId: string;
  name: string;
  slug: string;
  description?: string;
  httpMethod: HttpMethod;
  instruction: string;
  mode: TransformMode;

  // Learning status
  isLearned: boolean;
  learnedAt?: string;
  learnedSkillMd?: string; // Only included on detail requests
  learnedTransformerCode?: string; // Only for code mode, detail requests

  // Metadata
  createdAt: string;
  updatedAt: string;
  lastExecutedAt?: string;
  executionCount: number;
}

/**
 * Request to create a new endpoint.
 */
export interface EndpointCreate {
  name: string;
  slug: string;
  description?: string;
  httpMethod?: HttpMethod;
  instruction: string;
  mode?: TransformMode;
}

/**
 * Request to update an endpoint.
 */
export interface EndpointUpdate {
  name?: string;
  description?: string;
  httpMethod?: HttpMethod;
  instruction?: string;
  mode?: TransformMode;
}

/**
 * Response for listing endpoints.
 */
export interface EndpointsResponse {
  endpoints: Endpoint[];
  total: number;
}

/**
 * Request body for executing an endpoint.
 */
export interface EndpointExecuteRequest {
  inputData?: Record<string, unknown> | unknown[] | string;
  learn?: boolean;
  apply?: boolean;
}

/**
 * Response from endpoint execution.
 */
export interface EndpointExecuteResponse {
  success: boolean;
  result?: Record<string, unknown> | unknown[];
  nodesCreated: number;
  nodesUpdated: number;
  nodesDeleted: number;
  edgesCreated: number;
  errors: string[];
  executionTimeMs: number;
}

/**
 * SSE event from endpoint execution stream.
 */
export interface EndpointExecutionEvent {
  event: string;
  phase?: string;
  message?: string;
  tool?: string;
  input?: Record<string, unknown>;
  result?: string;
  valid?: boolean;
  itemCount?: number;
  errors?: string[];
  skillMd?: string;
  nodesCreated?: number;
  nodesUpdated?: number;
  nodesDeleted?: number;
  edgesCreated?: number;
  executionTimeMs?: number;
}

/**
 * Saved request preset for API tester.
 */
export interface RequestPreset {
  id: string;
  name: string;
  endpointId: string;
  headers: Record<string, string>;
  params: Record<string, string>;
  body: string;
  createdAt: string;
}

/**
 * Request history entry for API tester.
 */
export interface RequestHistoryEntry {
  id: string;
  endpointId: string;
  endpointSlug: string;
  httpMethod: HttpMethod;
  url: string;
  headers: Record<string, string>;
  body: string;
  response: {
    status: number;
    body: string;
    timeMs: number;
  };
  timestamp: string;
}

/**
 * Seed node from transformer output (for POST endpoints).
 */
export interface SeedNode {
  temp_id: string;
  node_type: string;
  title: string;
  status?: string;
  properties: Record<string, unknown>;
}

/**
 * Seed edge from transformer output (for POST endpoints).
 */
export interface SeedEdge {
  edge_type: string;
  from_temp_id: string;
  to_temp_id: string;
  properties?: Record<string, unknown>;
}

/**
 * SeedData result from POST endpoint preview.
 */
export interface SeedData {
  nodes: SeedNode[];
  edges: SeedEdge[];
}

/**
 * Query result from GET endpoint.
 */
export interface QueryResult {
  nodes: Record<string, unknown>[];
  count: number;
}

/**
 * Update result from PUT endpoint.
 */
export interface UpdateResult {
  updates: Array<{
    node_id: string;
    properties: Record<string, unknown>;
  }>;
}

/**
 * Delete result from DELETE endpoint.
 */
export interface DeleteResult {
  node_ids: string[];
}

/**
 * Pending result from preview mode execution.
 */
export interface PendingResult {
  transformResult: SeedData | QueryResult | UpdateResult | DeleteResult;
  transformCode?: string;
  skillMd?: string;
  httpMethod: HttpMethod;
  // Preview counts
  nodesCreated?: number;
  edgesCreated?: number;
  nodesUpdated?: number;
  nodesDeleted?: number;
  nodesToCreate?: SeedNode[];
  edgesToCreate?: SeedEdge[];
  updatesToApply?: Array<{ node_id: string; properties: Record<string, unknown> }>;
  nodesToDelete?: string[];
}

/**
 * Request body for applying a previewed result.
 */
export interface ApplyPreviewRequest {
  transformResult: Record<string, unknown>;
}

/**
 * Response from applying a previewed result.
 */
export interface ApplyPreviewResponse {
  success: boolean;
  nodesCreated: number;
  nodesUpdated: number;
  nodesDeleted: number;
  edgesCreated: number;
  errors: string[];
}
