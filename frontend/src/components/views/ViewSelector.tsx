'use client';

import type { ViewTemplate } from '@/types/view-templates';

interface ViewSelectorProps {
  viewTemplates: ViewTemplate[];
  selectedViewId: string | null;
  onViewChange: (viewId: string | null) => void;
}

export function ViewSelector({ viewTemplates, selectedViewId, onViewChange }: ViewSelectorProps) {
  if (viewTemplates.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="view-selector" className="text-sm font-medium text-gray-700">
        View:
      </label>
      <select
        id="view-selector"
        value={selectedViewId || ''}
        onChange={(e) => onViewChange(e.target.value || null)}
        className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <option value="">List View</option>
        {viewTemplates.map((template) => (
          <option key={template.id} value={template.id}>
            {template.name}
          </option>
        ))}
      </select>
    </div>
  );
}
