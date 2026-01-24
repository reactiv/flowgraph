/**
 * Color utilities for graph visualization.
 * Optimized for dark mode with 400-level colors for visibility.
 */

// Predefined color palette for node types (400-level for dark mode visibility)
const NODE_TYPE_COLORS = [
  '#a78bfa', // purple-400
  '#60a5fa', // blue-400
  '#34d399', // emerald-400
  '#fbbf24', // amber-400
  '#f87171', // red-400
  '#f472b6', // pink-400
  '#22d3ee', // cyan-400
  '#a3e635', // lime-400
  '#818cf8', // indigo-400
  '#fb923c', // orange-400
];

// Status colors optimized for dark mode (brighter for visibility)
export const STATUS_COLORS: Record<string, string> = {
  // Neutral/Draft states (slate-400)
  Draft: '#94a3b8',
  Queued: '#94a3b8',
  Dismissed: '#94a3b8',

  // Active/In-Progress states (blue-400)
  'In Progress': '#60a5fa',
  Active: '#60a5fa',
  Running: '#60a5fa',

  // Positive states (emerald-400)
  Complete: '#34d399',
  Completed: '#34d399',
  Validated: '#34d399',
  Pass: '#34d399',

  // Warning states (amber-400)
  Pending: '#fbbf24',
  Proposed: '#fbbf24',
  'On Hold': '#fbbf24',
  Scheduled: '#fbbf24',

  // Negative states (red-400)
  Failed: '#f87171',
  Rejected: '#f87171',
  Cancelled: '#f87171',
  Overdue: '#f87171',

  // Archive states (purple-400)
  Archived: '#a78bfa',
  Deprecated: '#fb923c',
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
  return NODE_TYPE_COLORS[index] ?? '#94a3b8';
}

/**
 * Generate a consistent color for an edge type based on its name.
 * Uses higher lightness for dark mode visibility.
 */
export function getEdgeColor(edgeType: string): string {
  let hash = 0;
  for (let i = 0; i < edgeType.length; i++) {
    hash = edgeType.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 60%, 60%)`; // Higher lightness for dark mode
}

/**
 * Get the color for a status, with fallback to slate.
 */
export function getStatusColor(status: string | undefined): string {
  if (!status) return '#94a3b8';
  return STATUS_COLORS[status] || '#94a3b8';
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
