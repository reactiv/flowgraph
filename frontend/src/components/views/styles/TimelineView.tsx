'use client';

import { useMemo } from 'react';
import type { Node } from '@/types/workflow';
import type { TimelineConfig } from '@/types/view-templates';
import { NodeCard } from '../cards/NodeCard';

interface TimelineViewProps {
  nodes: Node[];
  config: TimelineConfig;
  onNodeClick?: (node: Node) => void;
  onStatusChange?: (nodeId: string, newStatus: string) => Promise<void>;
}

interface TimelineGroup {
  key: string;
  label: string;
  date: Date;
  nodes: Node[];
}

/**
 * Format a date for display based on granularity
 */
function formatGroupLabel(date: Date, granularity: 'day' | 'week' | 'month'): string {
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
  };

  switch (granularity) {
    case 'day':
      options.weekday = 'short';
      options.month = 'short';
      options.day = 'numeric';
      break;
    case 'week':
      options.month = 'short';
      options.day = 'numeric';
      break;
    case 'month':
      options.month = 'long';
      break;
  }

  return date.toLocaleDateString('en-US', options);
}

/**
 * Get the group key for a date based on granularity
 */
function getGroupKey(date: Date, granularity: 'day' | 'week' | 'month'): string {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();

  switch (granularity) {
    case 'day':
      return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    case 'week': {
      // Get the Monday of the week
      const dayOfWeek = date.getDay();
      const diff = date.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      const monday = new Date(date);
      monday.setDate(diff);
      return `${monday.getFullYear()}-W${String(getWeekNumber(monday)).padStart(2, '0')}`;
    }
    case 'month':
      return `${year}-${String(month + 1).padStart(2, '0')}`;
  }
}

/**
 * Get ISO week number
 */
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * Get the start of the period for sorting
 */
function getGroupStartDate(date: Date, granularity: 'day' | 'week' | 'month'): Date {
  const result = new Date(date);

  switch (granularity) {
    case 'day':
      result.setHours(0, 0, 0, 0);
      break;
    case 'week': {
      const dayOfWeek = result.getDay();
      const diff = result.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      result.setDate(diff);
      result.setHours(0, 0, 0, 0);
      break;
    }
    case 'month':
      result.setDate(1);
      result.setHours(0, 0, 0, 0);
      break;
  }

  return result;
}

/**
 * Parse a date value from node properties
 */
function parseDateValue(value: unknown): Date | null {
  if (!value) return null;

  if (value instanceof Date) return value;

  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  if (typeof value === 'number') {
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  return null;
}

/**
 * Get the relative time label for a date
 */
function getRelativeTimeLabel(date: Date): string | null {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const targetDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (targetDate.getTime() === today.getTime()) return 'Today';
  if (targetDate.getTime() === yesterday.getTime()) return 'Yesterday';
  if (targetDate.getTime() === tomorrow.getTime()) return 'Tomorrow';

  return null;
}

export function TimelineView({ nodes, config, onNodeClick, onStatusChange: _onStatusChange }: TimelineViewProps) {
  const { dateField, granularity = 'day', showConnectors = true } = config;

  // Group and sort nodes by date
  const groups = useMemo(() => {
    const groupMap = new Map<string, TimelineGroup>();

    // Group nodes by date
    nodes.forEach((node) => {
      const dateValue = node.properties[dateField] ?? node.created_at;
      const date = parseDateValue(dateValue);

      if (!date) return;

      const key = getGroupKey(date, granularity);
      const existing = groupMap.get(key);

      if (existing) {
        existing.nodes.push(node);
      } else {
        groupMap.set(key, {
          key,
          label: formatGroupLabel(date, granularity),
          date: getGroupStartDate(date, granularity),
          nodes: [node],
        });
      }
    });

    // Sort groups chronologically (newest first)
    const sortedGroups = Array.from(groupMap.values()).sort(
      (a, b) => b.date.getTime() - a.date.getTime()
    );

    // Sort nodes within each group by date (newest first)
    sortedGroups.forEach((group) => {
      group.nodes.sort((a, b) => {
        const dateA = parseDateValue(a.properties[dateField] ?? a.created_at);
        const dateB = parseDateValue(b.properties[dateField] ?? b.created_at);
        if (!dateA || !dateB) return 0;
        return dateB.getTime() - dateA.getTime();
      });
    });

    return sortedGroups;
  }, [nodes, dateField, granularity]);

  // Use card template from config (includes statusColors)
  const cardTemplate = config.cardTemplate;

  if (nodes.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-gray-500">No items to display</div>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-gray-500">No items with valid dates</div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="relative mx-auto max-w-3xl">
        {/* Timeline vertical line */}
        {showConnectors && (
          <div className="absolute bottom-0 left-4 top-0 w-0.5 bg-gray-200" aria-hidden="true" />
        )}

        {/* Timeline groups */}
        <div className="space-y-8">
          {groups.map((group) => {
            const relativeLabel = granularity === 'day' ? getRelativeTimeLabel(group.date) : null;

            return (
              <div key={group.key} className="relative">
                {/* Date header */}
                <div className="sticky top-0 z-10 flex items-center gap-3 bg-white pb-3">
                  {showConnectors && (
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-gray-300 bg-white"
                      aria-hidden="true"
                    >
                      <div className="h-2 w-2 rounded-full bg-gray-400" />
                    </div>
                  )}
                  <div className={showConnectors ? '' : 'ml-0'}>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {relativeLabel || group.label}
                    </h3>
                    {relativeLabel && (
                      <p className="text-sm text-gray-500">{group.label}</p>
                    )}
                    <p className="text-xs text-gray-400">
                      {group.nodes.length} {group.nodes.length === 1 ? 'item' : 'items'}
                    </p>
                  </div>
                </div>

                {/* Nodes in this group */}
                <div className={`space-y-3 ${showConnectors ? 'ml-11' : 'ml-0'}`}>
                  {group.nodes.map((node) => {
                    return (
                      <div key={node.id} className="relative">
                        {/* Connector dot for each node */}
                        {showConnectors && (
                          <div
                            className="absolute -left-7 top-4 h-2 w-2 rounded-full bg-gray-300"
                            aria-hidden="true"
                          />
                        )}

                        {/* Node card */}
                        <NodeCard
                          node={node}
                          cardTemplate={cardTemplate}
                          onClick={() => onNodeClick?.(node)}
                        />

                        {/* Time label for the node */}
                        {granularity === 'day' && (
                          <TimeLabel node={node} dateField={dateField} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* End marker */}
        {showConnectors && (
          <div className="relative mt-4 flex items-center gap-3">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-gray-200 bg-gray-50"
              aria-hidden="true"
            >
              <svg
                className="h-4 w-4 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <span className="text-sm text-gray-400">End of timeline</span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Small component to show time for day-level granularity
 */
function TimeLabel({ node, dateField }: { node: Node; dateField: string }) {
  const dateValue = node.properties[dateField] ?? node.created_at;
  const date = parseDateValue(dateValue);

  if (!date) return null;

  const timeStr = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return (
    <p className="mt-1 text-xs text-gray-400">{timeStr}</p>
  );
}
