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
