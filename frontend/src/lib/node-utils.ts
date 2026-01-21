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
 * Get a field value from a node as a string (for display purposes).
 * Returns a fallback string for null/undefined values.
 */
export function getNodeFieldValueAsString(
  node: Node,
  field: string,
  fallback: string = 'Unknown'
): string {
  const value = getNodeFieldValue(node, field);
  if (value === null || value === undefined) {
    return fallback;
  }
  return String(value);
}
