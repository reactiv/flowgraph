/**
 * API client for the Workflow Graph Studio backend.
 */

import type {
  WorkflowSummary,
  WorkflowDefinition,
  TemplateSummary,
  Node,
  NodeCreate,
  NodeUpdate,
  Edge,
  EdgeCreate,
  Event,
  NodesResponse,
} from '@/types/workflow';

const API_BASE = '/api/v1';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

export const api = {
  // Templates
  listTemplates: () => fetchJson<TemplateSummary[]>('/templates'),

  getTemplate: (templateId: string) =>
    fetchJson<WorkflowDefinition>(`/templates/${templateId}`),

  // Workflows
  listWorkflows: () => fetchJson<WorkflowSummary[]>('/workflows'),

  createFromTemplate: (templateId: string) =>
    fetchJson<WorkflowSummary>('/workflows/from-template', {
      method: 'POST',
      body: JSON.stringify({ template_id: templateId }),
    }),

  getWorkflow: (workflowId: string) =>
    fetchJson<WorkflowDefinition>(`/workflows/${workflowId}`),

  deleteWorkflow: (workflowId: string) =>
    fetchJson<{ deleted: boolean }>(`/workflows/${workflowId}`, {
      method: 'DELETE',
    }),

  // Nodes
  listNodes: (
    workflowId: string,
    params?: { type?: string; status?: string; limit?: number; offset?: number }
  ) => {
    const searchParams = new URLSearchParams();
    if (params?.type) searchParams.set('type', params.type);
    if (params?.status) searchParams.set('status', params.status);
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.offset) searchParams.set('offset', params.offset.toString());

    const query = searchParams.toString();
    return fetchJson<NodesResponse>(`/workflows/${workflowId}/nodes${query ? `?${query}` : ''}`);
  },

  createNode: (workflowId: string, node: NodeCreate) =>
    fetchJson<Node>(`/workflows/${workflowId}/nodes`, {
      method: 'POST',
      body: JSON.stringify(node),
    }),

  getNode: (workflowId: string, nodeId: string) =>
    fetchJson<Node>(`/workflows/${workflowId}/nodes/${nodeId}`),

  updateNode: (workflowId: string, nodeId: string, update: NodeUpdate) =>
    fetchJson<Node>(`/workflows/${workflowId}/nodes/${nodeId}`, {
      method: 'PATCH',
      body: JSON.stringify(update),
    }),

  deleteNode: (workflowId: string, nodeId: string) =>
    fetchJson<{ deleted: boolean }>(`/workflows/${workflowId}/nodes/${nodeId}`, {
      method: 'DELETE',
    }),

  getNeighbors: (
    workflowId: string,
    nodeId: string,
    params?: { depth?: number; edgeTypes?: string[] }
  ) => {
    const searchParams = new URLSearchParams();
    if (params?.depth) searchParams.set('depth', params.depth.toString());
    if (params?.edgeTypes) searchParams.set('edge_types', params.edgeTypes.join(','));

    const query = searchParams.toString();
    return fetchJson<{ outgoing: unknown[]; incoming: unknown[] }>(
      `/workflows/${workflowId}/nodes/${nodeId}/neighbors${query ? `?${query}` : ''}`
    );
  },

  // Edges
  createEdge: (workflowId: string, edge: EdgeCreate) =>
    fetchJson<Edge>(`/workflows/${workflowId}/edges`, {
      method: 'POST',
      body: JSON.stringify(edge),
    }),

  deleteEdge: (workflowId: string, edgeId: string) =>
    fetchJson<{ deleted: boolean }>(`/workflows/${workflowId}/edges/${edgeId}`, {
      method: 'DELETE',
    }),

  // Events
  listEvents: (
    workflowId: string,
    params?: { nodeId?: string; eventType?: string; limit?: number; offset?: number }
  ) => {
    const searchParams = new URLSearchParams();
    if (params?.nodeId) searchParams.set('node_id', params.nodeId);
    if (params?.eventType) searchParams.set('event_type', params.eventType);
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.offset) searchParams.set('offset', params.offset.toString());

    const query = searchParams.toString();
    return fetchJson<Event[]>(`/workflows/${workflowId}/events${query ? `?${query}` : ''}`);
  },

  // Seeding
  seedWorkflow: (workflowId: string, scale: 'small' | 'medium' | 'large' = 'small') =>
    fetchJson<{
      workflow_id: string;
      scale: string;
      nodes_created: number;
      edges_created: number;
      llm_used: boolean;
    }>(`/workflows/${workflowId}/seed`, {
      method: 'POST',
      body: JSON.stringify({ scale }),
    }),

  resetWorkflow: (workflowId: string) =>
    fetchJson<{ reset: boolean }>(`/workflows/${workflowId}/reset`, {
      method: 'POST',
    }),
};
