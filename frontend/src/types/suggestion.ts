/**
 * TypeScript types for LLM-powered node suggestions.
 */

import type { NodeCreate } from './workflow';
import type { ContextSelector } from './context-selector';

export type SuggestionDirection = 'incoming' | 'outgoing';

export interface SuggestionOptions {
  num_suggestions?: number;
  guidance?: string;
  context_selector?: ContextSelector;
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
  context_nodes_count: number;
}

export interface SuggestionResponse {
  suggestions: NodeSuggestion[];
  context: SuggestionContext;
}

// Field Value Suggestion Types

export interface FieldValueSuggestionOptions {
  guidance?: string;
  num_suggestions?: number;
  context_selector?: ContextSelector;
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
  context_nodes_count: number;
}

export interface FieldValueSuggestionResponse {
  suggestions: FieldValueSuggestion[];
  context: FieldValueSuggestionContext;
}
