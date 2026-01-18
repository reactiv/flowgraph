/**
 * TypeScript types for LLM-powered node suggestions.
 */

import type { NodeCreate } from './workflow';

export type SuggestionDirection = 'incoming' | 'outgoing';

export interface SuggestionOptions {
  include_similar?: boolean;
  num_suggestions?: number;
  max_similar_examples?: number;
  guidance?: string;
}

export interface SuggestionRequest {
  edge_type: string;
  direction: SuggestionDirection;
  options?: SuggestionOptions;
}

export interface NodeSuggestion {
  node: NodeCreate;
  rationale: string;
}

export interface SuggestionContext {
  source_node_id: string;
  source_node_title: string;
  source_node_type: string;
  edge_type: string;
  direction: SuggestionDirection;
  target_node_type: string;
  similar_nodes_count: number;
}

export interface SuggestionResponse {
  suggestions: NodeSuggestion[];
  context: SuggestionContext;
}

// Field Value Suggestion Types

export interface FieldValueSuggestionOptions {
  guidance?: string;
  num_suggestions?: number;
  include_similar?: boolean;
  max_similar_examples?: number;
}

export interface FieldValueSuggestionRequest {
  options?: FieldValueSuggestionOptions;
}

export interface FieldValueSuggestion {
  value: unknown;
  rationale: string;
}

export interface FieldValueSuggestionContext {
  node_id: string;
  node_title: string;
  node_type: string;
  field_key: string;
  field_kind: string;
  field_label: string;
  current_value: unknown | null;
  similar_values_count: number;
  neighbors_count: number;
}

export interface FieldValueSuggestionResponse {
  suggestions: FieldValueSuggestion[];
  context: FieldValueSuggestionContext;
}
