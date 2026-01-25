/**
 * TypeScript types for connector management.
 * Mirrors the backend Pydantic models from app/models/connector.py
 */

// ==================== Enums ====================

export type ConnectorType = 'builtin' | 'custom';

export type ConnectorStatus = 'active' | 'inactive' | 'learning' | 'error';

// ==================== Schema Types ====================

export interface SecretKeySchema {
  key: string;
  description: string;
  required: boolean;
  env_var?: string | null;
}

export interface ConnectorConfigSchema {
  secrets: SecretKeySchema[];
  settings: Record<string, unknown>;
}

// ==================== Connector Models ====================

export interface ConnectorCreate {
  name: string;
  system: string;
  description?: string | null;
  url_patterns?: string[];
  supported_types?: string[];
  config_schema?: ConnectorConfigSchema;
}

export interface ConnectorUpdate {
  name?: string | null;
  description?: string | null;
  url_patterns?: string[] | null;
  supported_types?: string[] | null;
  config_schema?: ConnectorConfigSchema | null;
  status?: ConnectorStatus | null;
}

export interface Connector {
  id: string;
  name: string;
  system: string;
  description: string | null;
  connector_type: ConnectorType;
  url_patterns: string[];
  supported_types: string[];
  config_schema: ConnectorConfigSchema;
  status: ConnectorStatus;
  learned_skill_md: string | null;
  learned_connector_code: string | null;
  created_at: string;
  updated_at: string;
  is_configured: boolean;
  has_learned: boolean;
}

export interface ConnectorSummary {
  id: string;
  name: string;
  system: string;
  description: string | null;
  connector_type: ConnectorType;
  status: ConnectorStatus;
  supported_types: string[];
  is_configured: boolean;
  has_learned: boolean;
}

export interface ConnectorsResponse {
  connectors: ConnectorSummary[];
  total: number;
}

// ==================== Secrets Models ====================

export interface SecretSet {
  key: string;
  value: string;
}

export interface SecretInfo {
  key: string;
  is_set: boolean;
  updated_at: string;
}

// ==================== Learning Models ====================

export interface ConnectorLearnRequest {
  api_docs_url?: string | null;
  sample_data?: string | null;
  instruction?: string | null;
}

export interface ConnectorLearnResponse {
  connector: Connector;
  skill_md?: string | null;
  suggested_secrets: SecretKeySchema[];
  status: string;
  message?: string | null;
}

// ==================== Test Models ====================

export interface ConnectorTestRequest {
  test_url?: string | null;
}

export interface ConnectorTestResponse {
  success: boolean;
  message: string;
  details?: Record<string, unknown> | null;
}

// ==================== Helper Functions ====================

export function getStatusColor(status: ConnectorStatus): string {
  switch (status) {
    case 'active':
      return 'text-green-600 bg-green-100';
    case 'inactive':
      return 'text-gray-600 bg-gray-100';
    case 'learning':
      return 'text-blue-600 bg-blue-100';
    case 'error':
      return 'text-red-600 bg-red-100';
    default:
      return 'text-gray-600 bg-gray-100';
  }
}

export function getTypeLabel(type: ConnectorType): string {
  return type === 'builtin' ? 'Built-in' : 'Custom';
}
