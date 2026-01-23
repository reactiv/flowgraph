/**
 * TypeScript types for LLM-powered node suggestions.
 */

import type { NodeCreate } from './workflow';
import type { ContextSelector } from './context-selector';

export type SuggestionDirection = 'incoming' | 'outgoing';

/**
 * Options for including external reference content in suggestions.
 */
export interface ExternalContentOptions {
  /** Include projection summary and properties for nodes with external references. */
  include_projections?: boolean;
  /** Include full snapshot content if available (heavier but more complete). */
  include_full_content?: boolean;
  /** Whether to refresh stale projections before gathering context. */
  refresh_stale?: boolean;
}

export interface SuggestionOptions {
  num_suggestions?: number;
  guidance?: string;
  context_selector?: ContextSelector;
  /** Options for including external reference content in the suggestion context. */
  external_content?: ExternalContentOptions;
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
  /** Number of nodes with external reference content included. */
  external_refs_included?: number;
  /** Number of external references that were stale. */
  stale_refs_count?: number;
  /** Warnings about external content. */
  external_warnings?: string[];
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
  /** Options for including external reference content in the suggestion context. */
  external_content?: ExternalContentOptions;
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
  /** Number of nodes with external reference content included. */
  external_refs_included?: number;
  /** Number of external references that were stale. */
  stale_refs_count?: number;
  /** Warnings about external content. */
  external_warnings?: string[];
}

export interface FieldValueSuggestionResponse {
  suggestions: FieldValueSuggestion[];
  context: FieldValueSuggestionContext;
}
