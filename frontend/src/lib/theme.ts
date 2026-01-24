/**
 * Centralized theme utilities for dark mode styling.
 * Import these constants and use them consistently across all components.
 */

// =============================================================================
// CARD STYLES
// =============================================================================

/** Standard card with dark background */
export const card = {
  base: 'bg-card border border-border rounded-lg',
  hover: 'hover:border-primary/30 hover:bg-card/80',
  selected: 'bg-primary/10 border-primary/30',
  interactive: 'bg-card border border-border rounded-lg cursor-pointer transition-all duration-200 hover:border-primary/30 hover:bg-muted/50',
} as const;

/** Elevated card (modal, panel, dropdown) */
export const elevatedCard = {
  base: 'bg-card border border-border rounded-lg shadow-lg',
  modal: 'bg-card border border-border rounded-lg shadow-2xl',
} as const;

// =============================================================================
// INPUT STYLES
// =============================================================================

/** Standard input field */
export const input = {
  base: 'bg-input border border-border text-foreground placeholder:text-muted-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary',
  sm: 'px-2 py-1 text-sm',
  md: 'px-3 py-2 text-sm',
  lg: 'px-4 py-3',
  mono: 'font-mono',
} as const;

/** Textarea */
export const textarea = {
  base: 'bg-input border border-border text-foreground placeholder:text-muted-foreground rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary',
} as const;

/** Select/dropdown */
export const select = {
  base: 'bg-input border border-border text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary',
} as const;

// =============================================================================
// BUTTON STYLES
// =============================================================================

export const button = {
  /** Primary action button */
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md font-medium transition-colors',
  /** Secondary/outline button */
  secondary: 'bg-transparent border border-border text-foreground hover:bg-muted px-4 py-2 rounded-md font-medium transition-colors',
  /** Ghost/text button */
  ghost: 'text-muted-foreground hover:text-foreground hover:bg-muted px-3 py-1.5 rounded-md transition-colors',
  /** Destructive action */
  destructive: 'text-destructive hover:text-destructive/80 hover:bg-destructive/10 px-3 py-1.5 rounded-md transition-colors',
  /** Icon-only button */
  icon: 'p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors',
} as const;

// =============================================================================
// STATUS BADGE STYLES
// =============================================================================

/**
 * Comprehensive status color mappings for dark mode.
 * Uses 500-level colors at 15% opacity for backgrounds, 400-level for text.
 * This is the single source of truth for status colors across the app.
 */
export const statusColors: Record<string, string> = {
  // Neutral/Draft states (slate)
  Draft: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  Queued: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  Dismissed: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  Closed: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  Planned: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  Todo: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  Unknown: 'bg-slate-500/15 text-slate-400 border-slate-500/30',

  // Active/In-Progress states (blue)
  'In Progress': 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  Active: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
  Running: 'bg-blue-500/15 text-blue-400 border-blue-500/30',

  // Scheduled states (cyan)
  Scheduled: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  'On Order': 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',

  // Positive states (emerald)
  Complete: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  Completed: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  Done: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  Validated: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  Approved: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  Operational: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  'In Stock': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  Pass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',

  // Warning states (amber)
  Pending: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  Proposed: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  Open: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  'On Hold': 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  Degraded: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  'Low Stock': 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  'Pass with Observations': 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  'Pending Review': 'bg-amber-500/15 text-amber-400 border-amber-500/30',

  // Negative states (red)
  Failed: 'bg-red-500/15 text-red-400 border-red-500/30',
  Fail: 'bg-red-500/15 text-red-400 border-red-500/30',
  Rejected: 'bg-red-500/15 text-red-400 border-red-500/30',
  Blocked: 'bg-red-500/15 text-red-400 border-red-500/30',
  Down: 'bg-red-500/15 text-red-400 border-red-500/30',
  'Out of Stock': 'bg-red-500/15 text-red-400 border-red-500/30',
  Cancelled: 'bg-red-500/15 text-red-400 border-red-500/30',
  Overdue: 'bg-red-500/15 text-red-400 border-red-500/30',

  // Review states (indigo/teal/purple)
  Submitted: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
  Reviewed: 'bg-teal-500/15 text-teal-400 border-teal-500/30',
  Review: 'bg-purple-500/15 text-purple-400 border-purple-500/30',

  // Archive/Inactive states (slate muted)
  Archived: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  Decommissioned: 'bg-slate-600/15 text-slate-500 border-slate-600/30',
  Obsolete: 'bg-slate-600/15 text-slate-500 border-slate-600/30',
  Inactive: 'bg-slate-600/15 text-slate-500 border-slate-600/30',

  // Equipment-specific (orange)
  'Under Maintenance': 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  Deprecated: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
};

/** Default status color for unknown statuses */
export const defaultStatusColor = 'bg-slate-500/15 text-slate-400 border-slate-500/30';

/**
 * Get status color classes, handling case-insensitive and underscore variants.
 * @param status - The status string (e.g., "In Progress", "in_progress", "IN_PROGRESS")
 * @returns Tailwind classes for bg, text, and border colors
 */
export function getStatusColor(status: string): string {
  // Try exact match first
  if (statusColors[status]) {
    return statusColors[status];
  }

  // Try normalized version (replace underscores with spaces, title case)
  const normalized = status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return statusColors[normalized] || defaultStatusColor;
}

export const statusBadge = {
  base: 'inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border',
  getColor: (status: string) => getStatusColor(status),
} as const;

/**
 * Get status colors as separate bg and text classes.
 * Useful for components that need to apply these separately.
 * @param status - The status string
 * @returns Object with bg and text class strings
 */
export function getStatusColorParts(status: string): { bg: string; text: string } {
  const classes = getStatusColor(status);
  const parts = classes.split(' ');

  const bg = parts.find((p) => p.startsWith('bg-')) || 'bg-slate-500/15';
  const text = parts.find((p) => p.startsWith('text-')) || 'text-slate-400';

  return { bg, text };
}

/**
 * Get status colors as separate bg, text, and border classes.
 * Useful for components like StatusDropdown that need all three parts.
 * @param status - The status string
 * @returns Object with bg, text, and border class strings
 */
export function getStatusColorPartsWithBorder(status: string): { bg: string; text: string; border: string } {
  const classes = getStatusColor(status);
  const parts = classes.split(' ');

  const bg = parts.find((p) => p.startsWith('bg-')) || 'bg-slate-500/15';
  const text = parts.find((p) => p.startsWith('text-')) || 'text-slate-400';
  const border = parts.find((p) => p.startsWith('border-')) || 'border-slate-500/30';

  return { bg, text, border };
}

// =============================================================================
// TAB STYLES
// =============================================================================

export const tabs = {
  container: 'border-b border-border',
  list: 'flex gap-1 -mb-px',
  tab: {
    base: 'px-4 py-2.5 text-sm font-medium border-b-2 transition-all duration-200',
    active: 'border-primary text-primary',
    inactive: 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
  },
} as const;

// =============================================================================
// TABLE STYLES
// =============================================================================

export const table = {
  container: 'border border-border rounded-lg overflow-hidden',
  header: 'bg-muted/50',
  headerCell: 'text-left px-4 py-3 text-sm font-medium text-foreground',
  body: 'divide-y divide-border',
  row: 'hover:bg-muted/30 cursor-pointer transition-colors',
  cell: 'px-4 py-3 text-sm',
} as const;

// =============================================================================
// PANEL / MODAL STYLES
// =============================================================================

export const panel = {
  backdrop: 'fixed inset-0 z-40 bg-black/60 backdrop-blur-sm',
  container: 'bg-card border-l border-border shadow-2xl',
  header: 'p-4 border-b border-border bg-card',
  content: 'flex-1 overflow-auto bg-background',
  section: 'p-4 border-b border-border',
} as const;

export const modal = {
  backdrop: 'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center',
  container: 'bg-card border border-border rounded-lg shadow-2xl max-w-lg w-full mx-4',
  header: 'p-4 border-b border-border',
  content: 'p-4',
  footer: 'p-4 border-t border-border flex justify-end gap-2',
} as const;

// =============================================================================
// SUGGESTION / AI PANEL STYLES
// =============================================================================

export const suggestionPanel = {
  container: 'bg-card border border-primary/30 rounded-lg p-4',
  header: 'text-primary font-medium flex items-center gap-2 mb-3',
  chip: 'inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 border border-primary/30 text-primary rounded-full text-sm hover:bg-primary/20 transition-colors cursor-pointer',
} as const;

// =============================================================================
// FILTER STYLES
// =============================================================================

export const filter = {
  container: 'flex items-center gap-2 p-2 bg-card border-b border-border',
  chip: 'inline-flex items-center gap-1 px-2 py-1 bg-muted text-muted-foreground rounded text-xs',
  addButton: 'text-primary text-sm hover:text-primary/80 transition-colors',
} as const;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/** Combine class names with the cn utility */
export function getInputClasses(size: 'sm' | 'md' | 'lg' = 'md', mono = false) {
  return `${input.base} ${input[size]} ${mono ? input.mono : ''}`;
}

/** Get status badge classes */
export function getStatusBadgeClasses(status: string) {
  return `${statusBadge.base} ${statusBadge.getColor(status)}`;
}

/** Get tab classes based on active state */
export function getTabClasses(isActive: boolean) {
  return `${tabs.tab.base} ${isActive ? tabs.tab.active : tabs.tab.inactive}`;
}
