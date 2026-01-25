/**
 * TypeScript types for chat functionality.
 */

export interface ChatSession {
  session_id: string;
  workflow_id: string;
  created_at: string;
  last_activity?: string;
  message_count?: number;
  is_active?: boolean;
}

export interface CreateChatSessionRequest {
  system_prompt?: string;
  tools?: string[];
  include_graph_api?: boolean;
}

export interface CreateChatSessionResponse {
  session_id: string;
  workflow_id: string;
  created_at: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

export interface ChatEvent {
  event: string;
  tool?: string;
  input?: Record<string, unknown>;
  result?: string;
  text?: string;
  message?: string;
  [key: string]: unknown;
}
