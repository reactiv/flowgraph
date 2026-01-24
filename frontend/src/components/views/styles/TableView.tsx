'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import type { Node } from '@/types/workflow';
import type { TableConfig } from '@/types/view-templates';
import { getNodeFieldValue, extractDisplayValue, toDisplayString } from '@/lib/node-utils';
import { getStatusColorParts } from '@/lib/theme';

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
  // URL state props
  initialSort?: { field: string; order: 'asc' | 'desc' } | null;
  onSortChange?: (field: string | null, order: 'asc' | 'desc') => void;
}

// Convert hex to rgba for background (with alpha for lighter background)
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function formatCellValue(value: unknown): string {
  // Extract display value (handles annotated values with content key)
  const displayValue = extractDisplayValue(value);

  if (displayValue === null || displayValue === undefined) {
    return '-';
  }
  if (typeof displayValue === 'boolean') {
    return displayValue ? 'Yes' : 'No';
  }
  if (displayValue instanceof Date) {
    return displayValue.toLocaleDateString();
  }
  if (typeof displayValue === 'object') {
    if (Array.isArray(displayValue)) {
      return displayValue.map((v) => toDisplayString(v)).join(', ');
    }
    return JSON.stringify(displayValue);
  }
  return String(displayValue);
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
      <svg className="ml-1 h-4 w-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    );
  }

  if (direction === 'asc') {
    return (
      <svg className="ml-1 h-4 w-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    );
  }

  return (
    <svg className="ml-1 h-4 w-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

export function TableView({
  nodes,
  config,
  onNodeClick,
  onSelectionChange,
  initialSort,
  onSortChange,
}: TableViewProps) {
  // Initialize sort state from URL if provided
  const [sortState, setSortState] = useState<SortState>(() => {
    if (initialSort) {
      return { column: initialSort.field, direction: initialSort.order };
    }
    return { column: null, direction: 'asc' };
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const columns = config.columns.length > 0 ? config.columns : ['title', 'type', 'status'];
  const sortable = config.sortable !== false;
  const selectable = config.selectable === true;
  const configStatusColors = config.statusColors;

  // Sync sort state with URL when initialSort changes
  useEffect(() => {
    if (initialSort) {
      setSortState({ column: initialSort.field, direction: initialSort.order });
    } else {
      setSortState({ column: null, direction: 'asc' });
    }
  }, [initialSort]);

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
      let newState: SortState;
      if (prev.column === column) {
        // Toggle direction or clear sort
        if (prev.direction === 'asc') {
          newState = { column, direction: 'desc' };
        } else {
          newState = { column: null, direction: 'asc' };
        }
      } else {
        // New column, start with ascending
        newState = { column, direction: 'asc' };
      }
      // Notify parent of sort change
      onSortChange?.(newState.column, newState.direction);
      return newState;
    });
  }, [sortable, onSortChange]);

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
      <table className="min-w-full divide-y divide-border">
        <thead className="bg-card sticky top-0 z-10">
          <tr>
            {selectable && (
              <th scope="col" className="w-12 px-4 py-3">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border bg-input text-primary focus:ring-primary focus:ring-offset-background"
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
                className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground ${
                  sortable ? 'cursor-pointer select-none hover:bg-muted transition-colors' : ''
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
        <tbody className="divide-y divide-border bg-background">
          {sortedNodes.map((node) => (
            <tr
              key={node.id}
              className={`transition-colors hover:bg-muted/50 ${
                selectedIds.has(node.id) ? 'bg-primary/10' : ''
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
                    className="h-4 w-4 rounded border-border bg-input text-primary focus:ring-primary focus:ring-offset-background"
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
                  <td key={column} className="whitespace-nowrap px-4 py-3 text-sm text-foreground">
                    {isStatus ? (
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                          configColor ? '' : `${getStatusColorParts(value as string).bg} ${getStatusColorParts(value as string).text}`
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
                className="px-4 py-8 text-center text-sm text-muted-foreground"
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
