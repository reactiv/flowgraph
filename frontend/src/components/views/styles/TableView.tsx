'use client';

import { useState, useMemo, useCallback } from 'react';
import type { Node } from '@/types/workflow';
import type { TableConfig } from '@/types/view-templates';
import { getNodeFieldValue } from '@/lib/node-utils';

type SortDirection = 'asc' | 'desc';

interface SortState {
  column: string | null;
  direction: SortDirection;
}

interface TableViewProps {
  nodes: Node[];
  config: TableConfig;
  onNodeClick?: (node: Node) => void;
  onStatusChange?: (nodeId: string, newStatus: string) => Promise<void>;
  onSelectionChange?: (selectedIds: Set<string>) => void;
}

// Status badge color mapping
const statusColors: Record<string, { bg: string; text: string }> = {
  // Positive states (green)
  'complete': { bg: 'bg-green-100', text: 'text-green-700' },
  'completed': { bg: 'bg-green-100', text: 'text-green-700' },
  'done': { bg: 'bg-green-100', text: 'text-green-700' },
  'validated': { bg: 'bg-green-100', text: 'text-green-700' },
  'approved': { bg: 'bg-green-100', text: 'text-green-700' },
  'operational': { bg: 'bg-green-100', text: 'text-green-700' },
  'in_stock': { bg: 'bg-green-100', text: 'text-green-700' },
  'pass': { bg: 'bg-green-100', text: 'text-green-700' },

  // Active/in-progress states (blue/violet)
  'active': { bg: 'bg-violet-100', text: 'text-violet-700' },
  'in_progress': { bg: 'bg-blue-100', text: 'text-blue-700' },
  'in-progress': { bg: 'bg-blue-100', text: 'text-blue-700' },
  'running': { bg: 'bg-blue-100', text: 'text-blue-700' },
  'scheduled': { bg: 'bg-cyan-100', text: 'text-cyan-700' },
  'on_order': { bg: 'bg-cyan-100', text: 'text-cyan-700' },

  // Warning states (amber/yellow)
  'degraded': { bg: 'bg-amber-100', text: 'text-amber-700' },
  'low_stock': { bg: 'bg-amber-100', text: 'text-amber-700' },
  'on_hold': { bg: 'bg-amber-100', text: 'text-amber-700' },
  'pending': { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  'pass_with_observations': { bg: 'bg-amber-100', text: 'text-amber-700' },
  'pending_review': { bg: 'bg-amber-100', text: 'text-amber-700' },

  // Negative/error states (red)
  'failed': { bg: 'bg-red-100', text: 'text-red-700' },
  'fail': { bg: 'bg-red-100', text: 'text-red-700' },
  'rejected': { bg: 'bg-red-100', text: 'text-red-700' },
  'blocked': { bg: 'bg-red-100', text: 'text-red-700' },
  'down': { bg: 'bg-red-100', text: 'text-red-700' },
  'out_of_stock': { bg: 'bg-red-100', text: 'text-red-700' },
  'overdue': { bg: 'bg-red-100', text: 'text-red-700' },
  'cancelled': { bg: 'bg-red-100', text: 'text-red-700' },

  // Neutral/pending states (slate/gray)
  'draft': { bg: 'bg-slate-100', text: 'text-slate-700' },
  'planned': { bg: 'bg-slate-100', text: 'text-slate-700' },
  'proposed': { bg: 'bg-slate-100', text: 'text-slate-700' },
  'todo': { bg: 'bg-slate-100', text: 'text-slate-700' },

  // Review states (indigo/teal/purple)
  'submitted': { bg: 'bg-indigo-100', text: 'text-indigo-700' },
  'reviewed': { bg: 'bg-teal-100', text: 'text-teal-700' },
  'review': { bg: 'bg-purple-100', text: 'text-purple-700' },

  // Archived/inactive states (gray)
  'archived': { bg: 'bg-slate-100', text: 'text-slate-600' },
  'dismissed': { bg: 'bg-slate-100', text: 'text-slate-600' },
  'decommissioned': { bg: 'bg-slate-100', text: 'text-slate-600' },
  'obsolete': { bg: 'bg-slate-100', text: 'text-slate-600' },
  'inactive': { bg: 'bg-slate-100', text: 'text-slate-500' },

  // Equipment-specific
  'under_maintenance': { bg: 'bg-orange-100', text: 'text-orange-700' },
};

// Convert hex to rgba for background (with alpha for lighter background)
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getStatusColors(status: string): { bg: string; text: string } {
  const normalized = status.toLowerCase().replace(/\s+/g, '_');
  return statusColors[normalized] || { bg: 'bg-gray-100', text: 'text-gray-700' };
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '-';
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  if (value instanceof Date) {
    return value.toLocaleDateString();
  }
  if (typeof value === 'object') {
    if (Array.isArray(value)) {
      return value.join(', ');
    }
    return JSON.stringify(value);
  }
  return String(value);
}

// Use shared utility for field value extraction
const getNodeValue = getNodeFieldValue;

function compareValues(a: unknown, b: unknown, direction: SortDirection): number {
  // Handle null/undefined
  if (a === null || a === undefined) return direction === 'asc' ? 1 : -1;
  if (b === null || b === undefined) return direction === 'asc' ? -1 : 1;

  // Compare strings case-insensitively
  if (typeof a === 'string' && typeof b === 'string') {
    const comparison = a.toLowerCase().localeCompare(b.toLowerCase());
    return direction === 'asc' ? comparison : -comparison;
  }

  // Compare numbers
  if (typeof a === 'number' && typeof b === 'number') {
    return direction === 'asc' ? a - b : b - a;
  }

  // Compare dates
  if (a instanceof Date && b instanceof Date) {
    return direction === 'asc' ? a.getTime() - b.getTime() : b.getTime() - a.getTime();
  }

  // Fallback to string comparison
  const strA = String(a);
  const strB = String(b);
  const comparison = strA.localeCompare(strB);
  return direction === 'asc' ? comparison : -comparison;
}

function SortIcon({ direction }: { direction: SortDirection | null }) {
  if (direction === null) {
    return (
      <svg className="ml-1 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    );
  }

  if (direction === 'asc') {
    return (
      <svg className="ml-1 h-4 w-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    );
  }

  return (
    <svg className="ml-1 h-4 w-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

export function TableView({
  nodes,
  config,
  onNodeClick,
  onSelectionChange,
}: TableViewProps) {
  const [sortState, setSortState] = useState<SortState>({ column: null, direction: 'asc' });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const columns = config.columns.length > 0 ? config.columns : ['title', 'type', 'status'];
  const sortable = config.sortable !== false;
  const selectable = config.selectable === true;
  const configStatusColors = config.statusColors;

  // Sort nodes
  const sortedNodes = useMemo(() => {
    if (!sortState.column) {
      return nodes;
    }

    return [...nodes].sort((a, b) => {
      const aValue = getNodeValue(a, sortState.column!);
      const bValue = getNodeValue(b, sortState.column!);
      return compareValues(aValue, bValue, sortState.direction);
    });
  }, [nodes, sortState]);

  // Handle column header click for sorting
  const handleHeaderClick = useCallback((column: string) => {
    if (!sortable) return;

    setSortState((prev) => {
      if (prev.column === column) {
        // Toggle direction or clear sort
        if (prev.direction === 'asc') {
          return { column, direction: 'desc' };
        } else {
          return { column: null, direction: 'asc' };
        }
      }
      // New column, start with ascending
      return { column, direction: 'asc' };
    });
  }, [sortable]);

  // Handle row selection
  const handleRowSelect = useCallback((nodeId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(nodeId);
      } else {
        next.delete(nodeId);
      }
      onSelectionChange?.(next);
      return next;
    });
  }, [onSelectionChange]);

  // Handle select all
  const handleSelectAll = useCallback((checked: boolean) => {
    if (checked) {
      const allIds = new Set(nodes.map((n) => n.id));
      setSelectedIds(allIds);
      onSelectionChange?.(allIds);
    } else {
      const emptySet = new Set<string>();
      setSelectedIds(emptySet);
      onSelectionChange?.(emptySet);
    }
  }, [nodes, onSelectionChange]);

  const allSelected = nodes.length > 0 && selectedIds.size === nodes.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < nodes.length;

  // Format column header label
  const formatColumnLabel = (column: string): string => {
    return column
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  return (
    <div className="h-full overflow-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50 sticky top-0">
          <tr>
            {selectable && (
              <th scope="col" className="w-12 px-4 py-3">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                />
              </th>
            )}
            {columns.map((column) => (
              <th
                key={column}
                scope="col"
                className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 ${
                  sortable ? 'cursor-pointer select-none hover:bg-gray-100' : ''
                }`}
                onClick={() => handleHeaderClick(column)}
              >
                <div className="flex items-center">
                  {formatColumnLabel(column)}
                  {sortable && (
                    <SortIcon
                      direction={sortState.column === column ? sortState.direction : null}
                    />
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {sortedNodes.map((node) => (
            <tr
              key={node.id}
              className={`transition-colors hover:bg-gray-50 ${
                selectedIds.has(node.id) ? 'bg-blue-50' : ''
              } ${onNodeClick ? 'cursor-pointer' : ''}`}
              onClick={() => onNodeClick?.(node)}
            >
              {selectable && (
                <td
                  className="w-12 px-4 py-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    checked={selectedIds.has(node.id)}
                    onChange={(e) => handleRowSelect(node.id, e.target.checked)}
                  />
                </td>
              )}
              {columns.map((column) => {
                const value = getNodeValue(node, column);
                const isStatus = column === 'status' && typeof value === 'string';

                // Get color from config or fallback to hardcoded
                const configColor = isStatus && configStatusColors?.[value as string];
                const statusStyle = configColor
                  ? {
                      backgroundColor: hexToRgba(configColor, 0.15),
                      color: configColor,
                    }
                  : undefined;

                return (
                  <td key={column} className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                    {isStatus ? (
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                          configColor ? '' : `${getStatusColors(value as string).bg} ${getStatusColors(value as string).text}`
                        }`}
                        style={statusStyle}
                      >
                        {formatCellValue(value)}
                      </span>
                    ) : (
                      formatCellValue(value)
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
          {sortedNodes.length === 0 && (
            <tr>
              <td
                colSpan={columns.length + (selectable ? 1 : 0)}
                className="px-4 py-8 text-center text-sm text-gray-500"
              >
                No items to display
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
