/**
 * Utility functions for working with Node objects.
 * Provides a single source of truth for field extraction logic.
 */

import type { Node } from '@/types/workflow';

/**
 * Get a field value from a node by field name.
 * Handles both built-in top-level fields (title, status, type, etc.)
 * and custom property fields.
 *
 * This is the single source of truth for field extraction - use this
 * instead of directly accessing node properties to ensure consistency.
 */
export function getNodeFieldValue(node: Node, field: string): unknown {
  // Handle built-in top-level fields
  switch (field) {
    case 'title':
      return node.title;
    case 'type':
      return node.type;
    case 'status':
      return node.status;
    case 'id':
      return node.id;
    case 'created_at':
      return node.created_at;
    case 'updated_at':
      return node.updated_at;
    case 'workflow_id':
      return node.workflow_id;
    default:
      // Look in properties
      return node.properties[field];
  }
}

/**
 * Extract a display string from a value that might be an "annotated value" object.
 * Annotated values have the structure { content, generated_at, author } where
 * the actual value is in the `content` field.
 */
export function extractDisplayValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  // Check for annotated value object with content key
  if (
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'content' in value &&
    typeof (value as Record<string, unknown>).content !== 'undefined'
  ) {
    return (value as Record<string, unknown>).content;
  }
  return value;
}

/**
 * Safely convert any value to a display string.
 * Handles annotated values, arrays, objects, and primitives.
 */
export function toDisplayString(value: unknown, fallback: string = ''): string {
  const extracted = extractDisplayValue(value);
  if (extracted === null || extracted === undefined) {
    return fallback;
  }
  if (typeof extracted === 'string') {
    return extracted;
  }
  if (typeof extracted === 'number' || typeof extracted === 'boolean') {
    return String(extracted);
  }
  if (Array.isArray(extracted)) {
    return extracted.map((v) => toDisplayString(v)).join(', ');
  }
  if (typeof extracted === 'object') {
    return JSON.stringify(extracted);
  }
  return String(extracted);
}

/**
 * Get a field value from a node as a string (for display purposes).
 * Returns a fallback string for null/undefined values.
 */
export function getNodeFieldValueAsString(
  node: Node,
  field: string,
  fallback: string = 'Unknown'
): string {
  const value = getNodeFieldValue(node, field);
  return toDisplayString(value, fallback);
}
