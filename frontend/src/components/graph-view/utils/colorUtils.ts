/**
 * Color utilities for graph visualization.
 */

// Predefined color palette for node types
const NODE_TYPE_COLORS = [
  '#8b5cf6', // purple
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#6366f1', // indigo
  '#f97316', // orange
];

// Status colors (matching existing patterns in the codebase)
export const STATUS_COLORS: Record<string, string> = {
  Draft: '#6b7280',
  'In Progress': '#3b82f6',
  Complete: '#22c55e',
  Archived: '#8b5cf6',
  Failed: '#ef4444',
  Pending: '#f59e0b',
  Active: '#3b82f6',
  Validated: '#22c55e',
  Rejected: '#ef4444',
  Dismissed: '#6b7280',
  Proposed: '#f59e0b',
  Deprecated: '#f97316',
  Running: '#3b82f6',
  Queued: '#6b7280',
};

/**
 * Generate a consistent color for a node type based on its name.
 */
export function getNodeTypeColor(nodeType: string): string {
  let hash = 0;
  for (let i = 0; i < nodeType.length; i++) {
    hash = nodeType.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % NODE_TYPE_COLORS.length;
  return NODE_TYPE_COLORS[index] ?? '#6b7280';
}

/**
 * Generate a consistent color for an edge type based on its name.
 */
export function getEdgeColor(edgeType: string): string {
  let hash = 0;
  for (let i = 0; i < edgeType.length; i++) {
    hash = edgeType.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 50%, 50%)`;
}

/**
 * Get the color for a status, with fallback to gray.
 */
export function getStatusColor(status: string | undefined): string {
  if (!status) return '#6b7280';
  return STATUS_COLORS[status] || '#6b7280';
}

/**
 * Convert a hex color to rgba with optional alpha.
 */
export function hexToRgba(hex: string, alpha: number = 1): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result || !result[1] || !result[2] || !result[3]) return hex;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
