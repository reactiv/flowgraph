/**
 * TypeScript types mirroring the backend Pydantic models.
 */

import type { ViewTemplate, ViewTemplateCreate } from './view-templates';

// ==================== Field Kinds ====================

export type FieldKind =
  | 'string'
  | 'number'
  | 'datetime'
  | 'enum'
  | 'person'
  | 'json'
  | 'tag[]'
  | 'file[]';

// ==================== Workflow Definition (Schema) ====================

export interface Field {
  key: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  unique?: boolean;
  values?: string[]; // For enum fields
  default?: unknown;
}

export interface StateTransition {
  from: string;
  to: string;
}

export interface NodeState {
  enabled: boolean;
  initial: string;
  values: string[];
  transitions: StateTransition[];
}

export interface UIHints {
  defaultViews: string[];
  primarySections: string[];
  listColumns: string[];
  quickActions: string[];
}

export interface NodeType {
  type: string;
  displayName: string;
  titleField: string;
  subtitleField?: string;
  fields: Field[];
  states?: NodeState;
  ui: UIHints;
}

export interface EdgeType {
  type: string;
  displayName: string;
  from: string;
  to: string;
  direction: string;
}

export interface RuleCondition {
  nodeType: string;
  transitionTo?: string;
}

export interface EdgeRequirement {
  edgeType: string;
  minCount: number;
}

export interface Rule {
  id: string;
  when: RuleCondition;
  requireEdges: EdgeRequirement[];
  message: string;
}

export interface WorkflowDefinition {
  workflowId: string;
  name: string;
  description: string;
  nodeTypes: NodeType[];
  edgeTypes: EdgeType[];
  rules: Rule[];
  viewTemplates?: ViewTemplate[];
}

export interface WorkflowSummary {
  id: string;
  name: string;
  description: string;
  version: number;
  node_type_count: number;
  edge_type_count: number;
  created_at: string;
  updated_at: string;
}

// ==================== Template ====================

export interface TemplateSummary {
  id: string;
  name: string;
  description: string;
  node_type_count: number;
  edge_type_count: number;
  tags: string[];
}

// ==================== Node Instances ====================

export interface NodeCreate {
  type: string;
  title: string;
  status?: string;
  properties?: Record<string, unknown>;
}

export interface NodeUpdate {
  title?: string;
  status?: string;
  properties?: Record<string, unknown>;
}

export interface Node {
  id: string;
  workflow_id: string;
  type: string;
  title: string;
  status?: string;
  properties: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface NodesResponse {
  nodes: Node[];
  total: number;
  limit: number;
  offset: number;
}

// ==================== Edge Instances ====================

export interface EdgeCreate {
  type: string;
  from_node_id: string;
  to_node_id: string;
  properties?: Record<string, unknown>;
}

export interface Edge {
  id: string;
  workflow_id: string;
  type: string;
  from_node_id: string;
  to_node_id: string;
  properties: Record<string, unknown>;
  created_at: string;
}

export interface EdgesResponse {
  edges: Edge[];
  total: number;
  limit: number;
  offset: number;
}

// ==================== Neighbors ====================

export interface NeighborResult {
  edge: Edge;
  node: Node;
}

export interface NeighborsResponse {
  outgoing: NeighborResult[];
  incoming: NeighborResult[];
}

// ==================== Events ====================

export interface EventCreate {
  subject_node_id?: string;
  event_type: string;
  payload?: Record<string, unknown>;
}

export interface Event {
  id: string;
  workflow_id: string;
  subject_node_id?: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

// ==================== Schema Generation ====================

export interface SchemaGenerationOptions {
  includeStates?: boolean;
  includeTags?: boolean;
  scientificTerminology?: boolean;
}

export interface SchemaValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  fixesApplied: string[];
}

export interface CreateFromLanguageRequest {
  description: string;
  options?: SchemaGenerationOptions;
}

export interface CreateFromLanguageResponse {
  definition: WorkflowDefinition;
  validation: SchemaValidationResult;
  view_templates: ViewTemplateCreate[];
}
