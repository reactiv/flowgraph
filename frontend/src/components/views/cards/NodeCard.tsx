'use client';

import type { Node } from '@/types/workflow';
import type { CardTemplate } from '@/types/view-templates';
import { toDisplayString } from '@/lib/node-utils';

interface NodeCardProps {
  node: Node;
  cardTemplate?: CardTemplate;
  onClick?: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
}

const STATUS_COLORS: Record<string, string> = {
  // Generic positive states
  Complete: 'bg-green-100 text-green-700 border-green-200',
  Completed: 'bg-green-100 text-green-700 border-green-200',
  Validated: 'bg-green-100 text-green-700 border-green-200',
  Operational: 'bg-green-100 text-green-700 border-green-200',
  'In Stock': 'bg-green-100 text-green-700 border-green-200',
  Pass: 'bg-green-100 text-green-700 border-green-200',

  // Generic active/in-progress states
  Active: 'bg-violet-100 text-violet-700 border-violet-200',
  'In Progress': 'bg-blue-100 text-blue-700 border-blue-200',
  Running: 'bg-blue-100 text-blue-700 border-blue-200',
  Scheduled: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  'On Order': 'bg-cyan-100 text-cyan-700 border-cyan-200',

  // Generic warning states
  Degraded: 'bg-amber-100 text-amber-700 border-amber-200',
  'Low Stock': 'bg-amber-100 text-amber-700 border-amber-200',
  'On Hold': 'bg-amber-100 text-amber-700 border-amber-200',
  'Pass with Observations': 'bg-amber-100 text-amber-700 border-amber-200',
  'Pending Review': 'bg-amber-100 text-amber-700 border-amber-200',

  // Generic negative/error states
  Failed: 'bg-red-100 text-red-700 border-red-200',
  Rejected: 'bg-red-100 text-red-700 border-red-200',
  Down: 'bg-red-100 text-red-700 border-red-200',
  'Out of Stock': 'bg-red-100 text-red-700 border-red-200',
  Overdue: 'bg-red-100 text-red-700 border-red-200',
  Fail: 'bg-red-100 text-red-700 border-red-200',
  Cancelled: 'bg-red-100 text-red-700 border-red-200',

  // Generic neutral/pending states
  Draft: 'bg-slate-100 text-slate-700 border-slate-200',
  Pending: 'bg-slate-100 text-slate-700 border-slate-200',
  Planned: 'bg-slate-100 text-slate-700 border-slate-200',
  Proposed: 'bg-slate-100 text-slate-700 border-slate-200',
  Submitted: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  Reviewed: 'bg-teal-100 text-teal-700 border-teal-200',

  // Generic archived/inactive states
  Archived: 'bg-slate-100 text-slate-600 border-slate-200',
  Dismissed: 'bg-slate-100 text-slate-600 border-slate-200',
  Decommissioned: 'bg-slate-100 text-slate-600 border-slate-200',
  Obsolete: 'bg-slate-100 text-slate-600 border-slate-200',

  // Equipment-specific
  'Under Maintenance': 'bg-orange-100 text-orange-700 border-orange-200',
};

export function NodeCard({ node, cardTemplate, onClick, draggable, onDragStart }: NodeCardProps) {
  // Get title from cardTemplate or fall back to node.title
  const title = cardTemplate?.titleField
    ? toDisplayString(node.properties[cardTemplate.titleField]) || node.title
    : node.title;

  // Get subtitle from cardTemplate
  const subtitle = cardTemplate?.subtitleField
    ? toDisplayString(node.properties[cardTemplate.subtitleField]) || null
    : null;

  // Get status
  const status = cardTemplate?.statusField
    ? toDisplayString(node.properties[cardTemplate.statusField]) || node.status
    : node.status;

  // Get body fields
  const bodyFields = cardTemplate?.bodyFields || [];

  // Get status color - prefer config colors, fall back to hardcoded
  const configColor = status && cardTemplate?.statusColors?.[status];
  const statusColorClass = configColor
    ? ''
    : status
      ? STATUS_COLORS[status] || 'bg-gray-100 text-gray-700 border-gray-200'
      : '';

  // Convert hex to rgba for background (with alpha for lighter background)
  const hexToRgba = (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const statusStyle = configColor
    ? {
        backgroundColor: hexToRgba(configColor, 0.15),
        color: configColor,
        borderColor: hexToRgba(configColor, 0.3),
      }
    : undefined;

  return (
    <div
      className={`rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md ${
        onClick ? 'cursor-pointer' : ''
      } ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h4 className="truncate font-medium text-gray-900">{title}</h4>
          {subtitle && <p className="mt-0.5 truncate text-sm text-gray-500">{subtitle}</p>}
        </div>
        {status && (
          <span
            className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusColorClass}`}
            style={statusStyle}
          >
            {status}
          </span>
        )}
      </div>

      {bodyFields.length > 0 && (
        <div className="mt-2 space-y-1">
          {bodyFields.map((field) => {
            const value = node.properties[field];
            if (value === undefined || value === null) return null;
            return (
              <p key={field} className="truncate text-sm text-gray-600">
                <span className="font-medium capitalize">{field.replace(/_/g, ' ')}:</span>{' '}
                {toDisplayString(value)}
              </p>
            );
          })}
        </div>
      )}
    </div>
  );
}
