'use client';

import { ColorPicker } from './ColorPicker';
import type { NodeType } from '@/types/workflow';

interface StatusColorEditorProps {
  nodeType: NodeType;
  value: Record<string, string> | undefined;
  onChange: (colors: Record<string, string>) => void;
  disabled?: boolean;
  label?: string;
}

/** Default colors for common status values */
const DEFAULT_STATUS_COLORS: Record<string, string> = {
  // Pending/Initial states - gray
  pending: '#64748b',
  draft: '#64748b',
  new: '#64748b',
  proposed: '#64748b',
  planned: '#64748b',
  backlog: '#64748b',
  'to do': '#64748b',
  // Active states - blue/violet
  'in progress': '#3b82f6',
  active: '#8b5cf6',
  running: '#3b82f6',
  'in review': '#3b82f6',
  submitted: '#3b82f6',
  processing: '#3b82f6',
  // Success states - green
  complete: '#22c55e',
  completed: '#22c55e',
  done: '#22c55e',
  validated: '#22c55e',
  approved: '#22c55e',
  successful: '#22c55e',
  passed: '#22c55e',
  // Error/Negative states - red
  failed: '#ef4444',
  rejected: '#ef4444',
  error: '#ef4444',
  blocked: '#ef4444',
  // Archived/Closed states - dark gray
  archived: '#475569',
  cancelled: '#475569',
  closed: '#475569',
  dismissed: '#475569',
  'on hold': '#f59e0b',
};

function getDefaultColor(statusValue: string): string {
  const normalized = statusValue.toLowerCase();
  return DEFAULT_STATUS_COLORS[normalized] || '#64748b';
}

export function StatusColorEditor({
  nodeType,
  value,
  onChange,
  disabled = false,
  label,
}: StatusColorEditorProps) {
  // Get status values from node type states
  const statusValues = nodeType.states?.enabled
    ? nodeType.states.values
    : [];

  if (statusValues.length === 0) {
    return (
      <div>
        {label && (
          <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
        )}
        <p className="text-sm text-gray-500 italic">
          No status values defined for {nodeType.displayName}
        </p>
      </div>
    );
  }

  const handleColorChange = (statusKey: string, color: string) => {
    onChange({
      ...value,
      [statusKey]: color,
    });
  };

  const currentColors = value || {};

  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      )}
      <div className="space-y-2 border border-gray-200 rounded-md p-3 bg-gray-50">
        {statusValues.map((status) => (
          <div key={status} className="flex items-center justify-between gap-3">
            <span className="text-sm text-gray-700 min-w-0 truncate flex-1">{status}</span>
            <ColorPicker
              value={currentColors[status] || getDefaultColor(status)}
              onChange={(color) => handleColorChange(status, color)}
              disabled={disabled}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

interface EnumColorEditorProps {
  values: string[];
  colorMap: Record<string, string> | undefined;
  onChange: (colors: Record<string, string>) => void;
  disabled?: boolean;
  label?: string;
}

/** Editor for enum field value colors (not status-specific) */
export function EnumColorEditor({
  values,
  colorMap,
  onChange,
  disabled = false,
  label,
}: EnumColorEditorProps) {
  if (values.length === 0) {
    return (
      <div>
        {label && (
          <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
        )}
        <p className="text-sm text-gray-500 italic">No values to configure</p>
      </div>
    );
  }

  const handleColorChange = (key: string, color: string) => {
    onChange({
      ...colorMap,
      [key]: color,
    });
  };

  const currentColors = colorMap || {};

  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      )}
      <div className="space-y-2 border border-gray-200 rounded-md p-3 bg-gray-50">
        {values.map((val) => (
          <div key={val} className="flex items-center justify-between gap-3">
            <span className="text-sm text-gray-700 min-w-0 truncate flex-1">{val}</span>
            <ColorPicker
              value={currentColors[val] || getDefaultColor(val)}
              onChange={(color) => handleColorChange(val, color)}
              disabled={disabled}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
