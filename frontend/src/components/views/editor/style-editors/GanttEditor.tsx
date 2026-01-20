'use client';

import type { NodeType } from '@/types/workflow';
import type { GanttConfig } from '@/types/view-templates';
import { FieldSelector } from '../FieldSelector';
import { StatusColorEditor } from '../StatusColorEditor';
import { CardTemplateEditor } from '../CardTemplateEditor';

interface GanttEditorProps {
  nodeType: NodeType;
  config: GanttConfig;
  onChange: (config: GanttConfig) => void;
  disabled?: boolean;
}

const TIME_SCALE_OPTIONS: Array<{
  value: GanttConfig['timeScale'];
  label: string;
}> = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

export function GanttEditor({
  nodeType,
  config,
  onChange,
  disabled = false,
}: GanttEditorProps) {
  const updateConfig = <K extends keyof GanttConfig>(
    key: K,
    value: GanttConfig[K]
  ) => {
    onChange({
      ...config,
      [key]: value,
    });
  };

  return (
    <div className="space-y-6">
      {/* Date Fields */}
      <div className="grid grid-cols-2 gap-4">
        <FieldSelector
          nodeType={nodeType}
          value={config.startDateField}
          onChange={(v) => updateConfig('startDateField', v || '')}
          label="Start Date Field"
          placeholder="Select start date..."
          filterKinds={['datetime']}
          allowClear={false}
          disabled={disabled}
        />

        <FieldSelector
          nodeType={nodeType}
          value={config.endDateField}
          onChange={(v) => updateConfig('endDateField', v || '')}
          label="End Date Field"
          placeholder="Select end date..."
          filterKinds={['datetime']}
          allowClear={false}
          disabled={disabled}
        />
      </div>

      {/* Progress Field (optional) */}
      <FieldSelector
        nodeType={nodeType}
        value={config.progressField}
        onChange={(v) => updateConfig('progressField', v || undefined)}
        label="Progress Field (optional)"
        placeholder="No progress tracking"
        filterKinds={['number']}
        allowClear={true}
        disabled={disabled}
      />

      {/* Label Field (optional) */}
      <FieldSelector
        nodeType={nodeType}
        value={config.labelField}
        onChange={(v) => updateConfig('labelField', v || undefined)}
        label="Label Field (optional)"
        placeholder="Use title"
        allowClear={true}
        includeBuiltIn={true}
        disabled={disabled}
      />

      {/* Group By Field (optional) */}
      <FieldSelector
        nodeType={nodeType}
        value={config.groupByField}
        onChange={(v) => updateConfig('groupByField', v || undefined)}
        label="Group By Field (optional)"
        placeholder="No grouping"
        filterKinds={['enum', 'string']}
        includeBuiltIn={true}
        allowClear={true}
        disabled={disabled}
      />

      {/* Time Scale */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Time Scale
        </label>
        <div className="flex gap-2">
          {TIME_SCALE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`flex-1 text-center px-3 py-2 border rounded-md cursor-pointer transition-colors ${
                config.timeScale === option.value
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 hover:border-gray-300 text-gray-700'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <input
                type="radio"
                name="gantt-timescale"
                value={option.value}
                checked={config.timeScale === option.value}
                onChange={() => updateConfig('timeScale', option.value)}
                disabled={disabled}
                className="sr-only"
              />
              <span className="text-sm font-medium">{option.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Bar Height */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Bar Height
        </label>
        <input
          type="number"
          min={20}
          max={60}
          value={config.barHeight || 32}
          onChange={(e) => updateConfig('barHeight', Number(e.target.value))}
          disabled={disabled}
          className="w-24 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
        />
        <span className="text-sm text-gray-500 ml-2">pixels</span>
      </div>

      {/* Display Options */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-gray-700">Display Options</h4>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={config.showTodayMarker !== false}
            onChange={(e) => updateConfig('showTodayMarker', e.target.checked)}
            disabled={disabled}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700">Show today marker</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={config.allowDrag !== false}
            onChange={(e) => updateConfig('allowDrag', e.target.checked)}
            disabled={disabled}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700">Allow drag to reschedule</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={config.allowResize !== false}
            onChange={(e) => updateConfig('allowResize', e.target.checked)}
            disabled={disabled}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700">Allow resize to change duration</span>
        </label>
      </div>

      {/* Status Colors */}
      {nodeType.states?.enabled && (
        <StatusColorEditor
          nodeType={nodeType}
          value={config.statusColors}
          onChange={(colors) => updateConfig('statusColors', colors)}
          label="Bar Colors (by status)"
          disabled={disabled}
        />
      )}

      {/* Card Template (for hover/tooltip) */}
      <CardTemplateEditor
        nodeType={nodeType}
        value={config.cardTemplate}
        onChange={(template) => updateConfig('cardTemplate', template)}
        disabled={disabled}
      />
    </div>
  );
}
