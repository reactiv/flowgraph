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
  EdgesResponse,
  Event,
  NodesResponse,
  NeighborsResponse,
  SchemaGenerationOptions,
  CreateFromLanguageResponse,
  Rule,
  RuleViolation,
  ValidateTransitionResponse,
} from '@/types/workflow';
import type {
  FilterSchema,
  ViewFilterParams,
  ViewSubgraphResponse,
  ViewTemplate,
  ViewTemplateCreate,
  ViewTemplateUpdate,
} from '@/types/view-templates';
import type {
  FieldValueSuggestionOptions,
  FieldValueSuggestionResponse,
  SuggestionDirection,
  SuggestionOptions,
  SuggestionResponse,
} from '@/types/suggestion';
import type { ContextPreview, ContextPreviewNode, ContextSelector } from '@/types/context-selector';
import type {
  ApplyPreviewRequest,
  ApplyPreviewResponse,
  Endpoint,
  EndpointCreate,
  EndpointExecuteRequest,
  EndpointExecuteResponse,
  EndpointsResponse,
  EndpointUpdate,
  HttpMethod,
} from '@/types/endpoint';
import type {
  ExternalReference,
  NodeExternalRefCreate,
  NodeExternalRefWithDetails,
  NodeRefsResponse,
  Projection,
  ReferencesResponse,
  ReferenceRelationship,
  RefreshProjectionResponse,
  ResolveUrlResponse,
  Snapshot,
  SnapshotsResponse,
} from '@/types/external-reference';
import type {
  Connector,
  ConnectorCreate,
  ConnectorLearnRequest,
  ConnectorLearnResponse,
  ConnectorsResponse,
  ConnectorStatus,
  ConnectorTestRequest,
  ConnectorTestResponse,
  ConnectorType,
  ConnectorUpdate,
  SecretInfo,
  SecretSet,
} from '@/types/connector';
import type {
  AssigneeType,
  AssignTaskRequest,
  AvailableTasksResponse,
  CompleteTaskRequest,
  MyTasksResponse,
  NodeTaskProgressResponse,
  TaskInstance,
  TaskSetDefinition,
  TaskSetDefinitionCreate,
  TaskSetDefinitionsResponse,
  TaskSetInstance,
  TaskSetInstancesResponse,
  TaskSetInstanceStatus,
  TaskStatus,
} from '@/types/task';

const API_BASE = '/api/v1';

/**
 * Custom error class for rule violations.
 * Thrown when a status transition is blocked by workflow rules.
 */
export class RuleViolationApiError extends Error {
  public readonly isRuleViolation = true;
  public readonly violations: RuleViolation[];

  constructor(message: string, violations: RuleViolation[]) {
    super(message);
    this.name = 'RuleViolationApiError';
    this.violations = violations;
  }
}

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

    // Check for rule violation (422 with violations array)
    if (response.status === 422 && error.detail?.violations) {
      throw new RuleViolationApiError(
        error.detail.message || 'Status transition blocked by rules',
        error.detail.violations
      );
    }

    throw new Error(
      typeof error.detail === 'string'
        ? error.detail
        : error.detail?.message || `HTTP ${response.status}`
    );
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

  // Schema Generation
  generateSchemaFromLanguage: (description: string, options?: SchemaGenerationOptions) =>
    fetchJson<CreateFromLanguageResponse>('/workflows/from-language', {
      method: 'POST',
      body: JSON.stringify({ description, options }),
    }),

  createFromDefinition: (definition: WorkflowDefinition) =>
    fetchJson<WorkflowSummary>('/workflows/from-definition', {
      method: 'POST',
      body: JSON.stringify(definition),
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
    return fetchJson<NeighborsResponse>(
      `/workflows/${workflowId}/nodes/${nodeId}/neighbors${query ? `?${query}` : ''}`
    );
  },

  /**
   * Preview what context would be included for a suggestion.
   * Useful for visualizing and iterating on context configuration.
   */
  previewContext: async (
    workflowId: string,
    nodeId: string,
    contextSelector: ContextSelector
  ): Promise<ContextPreview> => {
    // API returns snake_case - define inline types for the response
    interface ApiNode {
      id: string;
      type: string;
      title: string;
      status?: string | null;
      properties: Record<string, unknown>;
      path_name?: string | null;
      traversal_depth: number;
    }

    interface ApiResponse {
      source_node: ApiNode;
      path_results: Record<string, ApiNode[]>;
      total_nodes: number;
      total_tokens_estimate?: number | null;
    }

    const response = await fetchJson<ApiResponse>(
      `/workflows/${workflowId}/nodes/${nodeId}/context-preview`,
      {
        method: 'POST',
        body: JSON.stringify({ contextSelector }),
      }
    );

    // Transform snake_case node properties to camelCase
    const transformNode = (node: ApiNode): ContextPreviewNode => ({
      id: node.id,
      type: node.type,
      title: node.title,
      status: node.status,
      properties: node.properties,
      pathName: node.path_name,
      traversalDepth: node.traversal_depth,
    });

    return {
      sourceNode: transformNode(response.source_node),
      pathResults: Object.fromEntries(
        Object.entries(response.path_results || {}).map(([key, nodes]) => [
          key,
          nodes.map(transformNode),
        ])
      ),
      totalNodes: response.total_nodes,
      totalTokensEstimate: response.total_tokens_estimate,
    };
  },

  /**
   * Parse natural language description into a ContextSelector.
   * Uses LLM to interpret the user's intent.
   */
  parseContextSelector: async (
    workflowId: string,
    description: string,
    context?: {
      sourceType?: string;
      edgeType?: string;
      direction?: 'outgoing' | 'incoming';
      targetType?: string;
    }
  ): Promise<ContextSelector> => {
    // API returns snake_case - define inline types for the response
    interface ApiEdgeStep {
      edge_type: string;
      direction: 'outgoing' | 'incoming';
    }

    interface ApiContextPath {
      name: string;
      steps: ApiEdgeStep[];
      target_type?: string | null;
      max_count?: number;
      from_path?: string | null;
      include_intermediate?: boolean;
      global_query?: boolean;
    }

    interface ApiPropertySelector {
      mode: 'all' | 'include' | 'exclude';
      fields: string[];
    }

    interface ApiContextSelector {
      paths: ApiContextPath[];
      source_properties: ApiPropertySelector;
      context_properties: ApiPropertySelector;
    }

    const response = await fetchJson<ApiContextSelector>(
      `/workflows/${workflowId}/parse-context-selector`,
      {
        method: 'POST',
        body: JSON.stringify({
          description,
          sourceType: context?.sourceType,
          edgeType: context?.edgeType,
          direction: context?.direction,
          targetType: context?.targetType,
        }),
      }
    );

    // Transform snake_case to camelCase
    return {
      paths: response.paths.map((path) => ({
        name: path.name,
        steps: path.steps.map((step) => ({
          edgeType: step.edge_type,
          direction: step.direction,
        })),
        targetType: path.target_type,
        maxCount: path.max_count,
        fromPath: path.from_path,
        includeIntermediate: path.include_intermediate,
        globalQuery: path.global_query,
      })),
      sourceProperties: {
        mode: response.source_properties.mode,
        fields: response.source_properties.fields,
      },
      contextProperties: {
        mode: response.context_properties.mode,
        fields: response.context_properties.fields,
      },
    };
  },

  suggestNode: (
    workflowId: string,
    nodeId: string,
    edgeType: string,
    direction: SuggestionDirection,
    options?: SuggestionOptions
  ) =>
    fetchJson<SuggestionResponse>(`/workflows/${workflowId}/nodes/${nodeId}/suggest`, {
      method: 'POST',
      body: JSON.stringify({ edge_type: edgeType, direction, options }),
    }),

  suggestFieldValue: (
    workflowId: string,
    nodeId: string,
    fieldKey: string,
    options?: FieldValueSuggestionOptions
  ) =>
    fetchJson<FieldValueSuggestionResponse>(
      `/workflows/${workflowId}/nodes/${nodeId}/fields/${encodeURIComponent(fieldKey)}/suggest`,
      {
        method: 'POST',
        body: JSON.stringify({ options }),
      }
    ),

  // Edges
  listEdges: (
    workflowId: string,
    params?: { type?: string; limit?: number; offset?: number }
  ) => {
    const searchParams = new URLSearchParams();
    if (params?.type) searchParams.set('type', params.type);
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.offset) searchParams.set('offset', params.offset.toString());

    const query = searchParams.toString();
    return fetchJson<EdgesResponse>(`/workflows/${workflowId}/edges${query ? `?${query}` : ''}`);
  },

  createEdge: (workflowId: string, edge: EdgeCreate) =>
    fetchJson<Edge>(`/workflows/${workflowId}/edges`, {
      method: 'POST',
      body: JSON.stringify(edge),
    }),

  deleteEdge: (workflowId: string, edgeId: string) =>
    fetchJson<{ deleted: boolean }>(`/workflows/${workflowId}/edges/${edgeId}`, {
      method: 'DELETE',
    }),

  // Views
  listViews: (workflowId: string) =>
    fetchJson<ViewTemplate[]>(`/workflows/${workflowId}/views`),

  createView: (workflowId: string, view: ViewTemplateCreate) =>
    fetchJson<ViewTemplate>(`/workflows/${workflowId}/views`, {
      method: 'POST',
      body: JSON.stringify(view),
    }),

  updateView: (workflowId: string, viewId: string, update: ViewTemplateUpdate) =>
    fetchJson<ViewTemplate>(`/workflows/${workflowId}/views/${viewId}`, {
      method: 'PUT',
      body: JSON.stringify(update),
    }),

  deleteView: (workflowId: string, viewId: string) =>
    fetchJson<{ deleted: boolean }>(`/workflows/${workflowId}/views/${viewId}`, {
      method: 'DELETE',
    }),

  generateView: (workflowId: string, description: string) =>
    fetchJson<ViewTemplateCreate>(`/workflows/${workflowId}/views/generate`, {
      method: 'POST',
      body: JSON.stringify({ description }),
    }),

  getViewSubgraph: (
    workflowId: string,
    viewId: string,
    params?: { rootNodeId?: string; filters?: ViewFilterParams }
  ) => {
    const searchParams = new URLSearchParams();
    if (params?.rootNodeId) searchParams.set('root_node_id', params.rootNodeId);
    if (params?.filters) searchParams.set('filters', JSON.stringify(params.filters));

    const query = searchParams.toString();
    return fetchJson<ViewSubgraphResponse>(
      `/workflows/${workflowId}/views/${viewId}${query ? `?${query}` : ''}`
    );
  },

  getViewFilterSchema: (workflowId: string, viewId: string) =>
    fetchJson<FilterSchema>(`/workflows/${workflowId}/views/${viewId}/filter-schema`),

  // Get field schema for a node type (used by editors like KanbanEditor for swimlane options)
  getFieldSchema: (workflowId: string, rootType: string) =>
    fetchJson<FilterSchema>(`/workflows/${workflowId}/field-schema?rootType=${encodeURIComponent(rootType)}`),

  getFilterValues: (
    workflowId: string,
    viewId: string,
    nodeType: string,
    field: string,
    limit: number = 50
  ) =>
    fetchJson<{ values: string[] }>(
      `/workflows/${workflowId}/views/${viewId}/filter-values?node_type=${encodeURIComponent(nodeType)}&field=${encodeURIComponent(field)}&limit=${limit}`
    ),

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

  // Rules
  validateTransition: (workflowId: string, nodeId: string, targetStatus: string) =>
    fetchJson<ValidateTransitionResponse>(
      `/workflows/${workflowId}/nodes/${nodeId}/validate-transition`,
      {
        method: 'POST',
        body: JSON.stringify({ target_status: targetStatus }),
      }
    ),

  listRules: (workflowId: string) => fetchJson<Rule[]>(`/workflows/${workflowId}/rules`),

  generateRule: (workflowId: string, description: string) =>
    fetchJson<Rule>(`/workflows/${workflowId}/rules/generate`, {
      method: 'POST',
      body: JSON.stringify({ description }),
    }),

  addRule: (workflowId: string, rule: Rule) =>
    fetchJson<Rule>(`/workflows/${workflowId}/rules`, {
      method: 'POST',
      body: JSON.stringify({ rule }),
    }),

  deleteRule: (workflowId: string, ruleId: string) =>
    fetchJson<{ deleted: boolean }>(`/workflows/${workflowId}/rules/${ruleId}`, {
      method: 'DELETE',
    }),

  // Endpoints
  listEndpoints: (workflowId: string) =>
    fetchJson<EndpointsResponse>(`/workflows/${workflowId}/endpoints`),

  createEndpoint: (workflowId: string, endpoint: EndpointCreate) =>
    fetchJson<Endpoint>(`/workflows/${workflowId}/endpoints`, {
      method: 'POST',
      body: JSON.stringify(endpoint),
    }),

  getEndpoint: (workflowId: string, endpointId: string) =>
    fetchJson<Endpoint>(`/workflows/${workflowId}/endpoints/${endpointId}`),

  updateEndpoint: (workflowId: string, endpointId: string, update: EndpointUpdate) =>
    fetchJson<Endpoint>(`/workflows/${workflowId}/endpoints/${endpointId}`, {
      method: 'PUT',
      body: JSON.stringify(update),
    }),

  deleteEndpoint: (workflowId: string, endpointId: string) =>
    fetchJson<{ deleted: boolean }>(`/workflows/${workflowId}/endpoints/${endpointId}`, {
      method: 'DELETE',
    }),

  resetEndpointLearning: (workflowId: string, endpointId: string) =>
    fetchJson<Endpoint>(`/workflows/${workflowId}/endpoints/${endpointId}/reset-learning`, {
      method: 'POST',
    }),

  /**
   * Execute an endpoint synchronously.
   * For streaming progress, use executeEndpointStream instead.
   */
  executeEndpoint: async (
    workflowId: string,
    slug: string,
    method: HttpMethod,
    data?: EndpointExecuteRequest
  ): Promise<EndpointExecuteResponse> => {
    const url = `/x/${workflowId}/${slug}${data?.learn ? '?learn=true' : ''}`;

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: data?.inputData ? JSON.stringify(data.inputData) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(
        typeof error.detail === 'string'
          ? error.detail
          : error.detail?.message || `HTTP ${response.status}`
      );
    }

    return response.json();
  },

  /**
   * Get the URL for an endpoint (for display/copy).
   */
  getEndpointUrl: (workflowId: string, slug: string) =>
    `${window.location.origin}/x/${workflowId}/${slug}`,

  /**
   * Apply a previously previewed endpoint result.
   * Note: Uses fetch directly since /x/ routes are not prefixed with /api/v1
   */
  applyEndpointPreview: async (
    workflowId: string,
    slug: string,
    request: ApplyPreviewRequest
  ): Promise<ApplyPreviewResponse> => {
    const response = await fetch(`/x/${workflowId}/${slug}/apply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(
        typeof error.detail === 'string'
          ? error.detail
          : error.detail?.message || `HTTP ${response.status}`
      );
    }

    return response.json();
  },

  // ==================== External References ====================

  /**
   * List all external references with optional filters.
   */
  listReferences: (params?: { system?: string; object_type?: string; limit?: number; offset?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.system) searchParams.set('system', params.system);
    if (params?.object_type) searchParams.set('object_type', params.object_type);
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.offset) searchParams.set('offset', params.offset.toString());

    const query = searchParams.toString();
    return fetchJson<ReferencesResponse>(`/references${query ? `?${query}` : ''}`);
  },

  /**
   * Get an external reference by ID, including its projection.
   */
  getReference: (referenceId: string) =>
    fetchJson<ExternalReference & { projection: Projection | null }>(`/references/${referenceId}`),

  /**
   * Delete an external reference.
   */
  deleteReference: (referenceId: string) =>
    fetchJson<{ deleted: boolean }>(`/references/${referenceId}`, {
      method: 'DELETE',
    }),

  /**
   * Resolve a URL to an external reference.
   * Identifies the appropriate connector, extracts metadata, creates/updates reference.
   */
  resolveUrl: (url: string) =>
    fetchJson<ResolveUrlResponse>('/references/resolve', {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),

  /**
   * Force refresh the projection for an external reference.
   */
  refreshProjection: (referenceId: string) =>
    fetchJson<RefreshProjectionResponse>(`/references/${referenceId}/refresh`, {
      method: 'POST',
    }),

  /**
   * Get the cached projection for an external reference.
   */
  getProjection: (referenceId: string) =>
    fetchJson<Projection | null>(`/references/${referenceId}/projection`),

  /**
   * Create an immutable snapshot of external content.
   */
  createSnapshot: (referenceId: string, captureReason: string = 'manual', capturedBy?: string) => {
    const params = new URLSearchParams();
    params.set('capture_reason', captureReason);
    if (capturedBy) params.set('captured_by', capturedBy);

    return fetchJson<Snapshot>(`/references/${referenceId}/snapshot?${params.toString()}`, {
      method: 'POST',
    });
  },

  /**
   * List snapshots for an external reference.
   */
  listSnapshots: (referenceId: string, limit: number = 10) =>
    fetchJson<SnapshotsResponse>(`/references/${referenceId}/snapshots?limit=${limit}`),

  /**
   * Get a snapshot by ID.
   */
  getSnapshot: (snapshotId: string) =>
    fetchJson<Snapshot>(`/snapshots/${snapshotId}`),

  // ==================== Node ↔ Reference Links ====================

  /**
   * Get all external references linked to a node.
   */
  getNodeReferences: (workflowId: string, nodeId: string) =>
    fetchJson<NodeRefsResponse>(`/workflows/${workflowId}/nodes/${nodeId}/refs`),

  /**
   * Link an external reference to a workflow node.
   */
  linkNodeReference: (
    workflowId: string,
    nodeId: string,
    referenceId: string,
    relationship: ReferenceRelationship = 'source',
    addedBy?: string
  ) =>
    fetchJson<NodeExternalRefWithDetails>(`/workflows/${workflowId}/nodes/${nodeId}/refs`, {
      method: 'POST',
      body: JSON.stringify({
        reference_id: referenceId,
        relationship,
        added_by: addedBy,
      } as NodeExternalRefCreate),
    }),

  /**
   * Remove link between a node and external reference.
   */
  unlinkNodeReference: (workflowId: string, nodeId: string, referenceId: string) =>
    fetchJson<{ deleted: boolean }>(`/workflows/${workflowId}/nodes/${nodeId}/refs/${referenceId}`, {
      method: 'DELETE',
    }),

  // ==================== Connectors ====================

  /**
   * List all connectors with optional filters.
   */
  listConnectors: (params?: {
    status?: ConnectorStatus;
    connector_type?: ConnectorType;
    limit?: number;
    offset?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.connector_type) searchParams.set('connector_type', params.connector_type);
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.offset) searchParams.set('offset', params.offset.toString());

    const query = searchParams.toString();
    return fetchJson<ConnectorsResponse>(`/connectors${query ? `?${query}` : ''}`);
  },

  /**
   * Create a new connector.
   */
  createConnector: (data: ConnectorCreate) =>
    fetchJson<Connector>('/connectors', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /**
   * Get a connector by ID.
   */
  getConnector: (connectorId: string) =>
    fetchJson<Connector>(`/connectors/${connectorId}`),

  /**
   * Get a connector by system name.
   */
  getConnectorBySystem: (system: string) =>
    fetchJson<Connector>(`/connectors/by-system/${system}`),

  /**
   * Update a connector.
   */
  updateConnector: (connectorId: string, data: ConnectorUpdate) =>
    fetchJson<Connector>(`/connectors/${connectorId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  /**
   * Delete a connector.
   */
  deleteConnector: (connectorId: string) =>
    fetchJson<{ deleted: boolean }>(`/connectors/${connectorId}`, {
      method: 'DELETE',
    }),

  /**
   * List secrets for a connector (values not exposed).
   */
  listConnectorSecrets: (connectorId: string) =>
    fetchJson<SecretInfo[]>(`/connectors/${connectorId}/secrets`),

  /**
   * Set or update a secret.
   */
  setConnectorSecret: (connectorId: string, data: SecretSet) =>
    fetchJson<SecretInfo>(`/connectors/${connectorId}/secrets`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /**
   * Delete a secret.
   */
  deleteConnectorSecret: (connectorId: string, key: string) =>
    fetchJson<{ deleted: boolean }>(`/connectors/${connectorId}/secrets/${key}`, {
      method: 'DELETE',
    }),

  /**
   * Test a connector's configuration.
   */
  testConnector: (connectorId: string, data?: ConnectorTestRequest) =>
    fetchJson<ConnectorTestResponse>(`/connectors/${connectorId}/test`, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    }),

  /**
   * Learn connector configuration from API docs.
   */
  learnConnector: (connectorId: string, data: ConnectorLearnRequest) =>
    fetchJson<ConnectorLearnResponse>(`/connectors/${connectorId}/learn`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /**
   * Clear learned assets from a connector.
   */
  unlearnConnector: (connectorId: string) =>
    fetchJson<{ success: boolean }>(`/connectors/${connectorId}/learn`, {
      method: 'DELETE',
    }),

  // ==================== Task Execution Engine ====================

  // TaskSet Definition CRUD
  listTaskSetDefinitions: (workflowId: string) =>
    fetchJson<TaskSetDefinitionsResponse>(`/workflows/${workflowId}/task-sets`),

  createTaskSetDefinition: (workflowId: string, definition: TaskSetDefinitionCreate) =>
    fetchJson<TaskSetDefinition>(`/workflows/${workflowId}/task-sets`, {
      method: 'POST',
      body: JSON.stringify(definition),
    }),

  getTaskSetDefinition: (workflowId: string, taskSetId: string) =>
    fetchJson<TaskSetDefinition>(`/workflows/${workflowId}/task-sets/${taskSetId}`),

  deleteTaskSetDefinition: (workflowId: string, taskSetId: string) =>
    fetchJson<{ deleted: boolean }>(`/workflows/${workflowId}/task-sets/${taskSetId}`, {
      method: 'DELETE',
    }),

  // TaskSet Instance Management
  startTaskSetInstance: (workflowId: string, taskSetId: string, rootNodeId?: string) => {
    const params = rootNodeId ? `?root_node_id=${encodeURIComponent(rootNodeId)}` : '';
    return fetchJson<TaskSetInstance>(`/workflows/${workflowId}/task-sets/${taskSetId}/start${params}`, {
      method: 'POST',
    });
  },

  listTaskSetInstances: (
    workflowId: string,
    params?: { status?: TaskSetInstanceStatus; rootNodeId?: string }
  ) => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.rootNodeId) searchParams.set('root_node_id', params.rootNodeId);

    const query = searchParams.toString();
    return fetchJson<TaskSetInstancesResponse>(
      `/workflows/${workflowId}/task-set-instances${query ? `?${query}` : ''}`
    );
  },

  getTaskSetInstance: (workflowId: string, instanceId: string) =>
    fetchJson<TaskSetInstance>(`/workflows/${workflowId}/task-set-instances/${instanceId}`),

  refreshTaskSetInstance: (workflowId: string, instanceId: string) =>
    fetchJson<TaskSetInstance>(`/workflows/${workflowId}/task-set-instances/${instanceId}/refresh`, {
      method: 'POST',
    }),

  cancelTaskSetInstance: (workflowId: string, instanceId: string) =>
    fetchJson<TaskSetInstance>(`/workflows/${workflowId}/task-set-instances/${instanceId}/cancel`, {
      method: 'POST',
    }),

  // Task Operations
  getAvailableTasks: (workflowId: string, instanceId: string) =>
    fetchJson<AvailableTasksResponse>(
      `/workflows/${workflowId}/task-set-instances/${instanceId}/available-tasks`
    ),

  assignTask: (
    workflowId: string,
    instanceId: string,
    taskDefId: string,
    request: AssignTaskRequest
  ) =>
    fetchJson<TaskInstance>(
      `/workflows/${workflowId}/task-set-instances/${instanceId}/tasks/${taskDefId}/assign`,
      {
        method: 'POST',
        body: JSON.stringify(request),
      }
    ),

  startTask: (workflowId: string, instanceId: string, taskDefId: string) =>
    fetchJson<TaskInstance>(
      `/workflows/${workflowId}/task-set-instances/${instanceId}/tasks/${taskDefId}/start`,
      { method: 'POST' }
    ),

  completeTask: (
    workflowId: string,
    instanceId: string,
    taskDefId: string,
    request?: CompleteTaskRequest
  ) => {
    // Convert camelCase to snake_case for API
    const body = request
      ? JSON.stringify({
          output_node_id: request.outputNodeId,
          notes: request.notes,
          initial_values: request.initialValues,
        })
      : undefined;

    return fetchJson<TaskSetInstance>(
      `/workflows/${workflowId}/task-set-instances/${instanceId}/tasks/${taskDefId}/complete`,
      {
        method: 'POST',
        body,
      }
    );
  },

  skipTask: (workflowId: string, instanceId: string, taskDefId: string, notes?: string) => {
    const params = notes ? `?notes=${encodeURIComponent(notes)}` : '';
    return fetchJson<TaskSetInstance>(
      `/workflows/${workflowId}/task-set-instances/${instanceId}/tasks/${taskDefId}/skip${params}`,
      { method: 'POST' }
    );
  },

  // Progress Queries
  getNodeTaskProgress: (workflowId: string, nodeId: string) =>
    fetchJson<NodeTaskProgressResponse>(`/workflows/${workflowId}/nodes/${nodeId}/task-progress`),

  getMyTasks: (
    workflowId: string,
    assigneeId: string,
    params?: { assigneeType?: AssigneeType; status?: TaskStatus }
  ) => {
    const searchParams = new URLSearchParams();
    searchParams.set('assignee_id', assigneeId);
    if (params?.assigneeType) searchParams.set('assignee_type', params.assigneeType);
    if (params?.status) searchParams.set('status', params.status);

    return fetchJson<MyTasksResponse>(`/workflows/${workflowId}/my-tasks?${searchParams.toString()}`);
  },
};
