'use client';

import type { NodeType } from '@/types/workflow';
import type { TimelineConfig } from '@/types/view-templates';
import { FieldSelector } from '../FieldSelector';
import { CardTemplateEditor } from '../CardTemplateEditor';

interface TimelineEditorProps {
  nodeType: NodeType;
  config: TimelineConfig;
  onChange: (config: TimelineConfig) => void;
  disabled?: boolean;
}

const GRANULARITY_OPTIONS: Array<{
  value: TimelineConfig['granularity'];
  label: string;
}> = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

export function TimelineEditor({
  nodeType,
  config,
  onChange,
  disabled = false,
}: TimelineEditorProps) {
  const updateConfig = <K extends keyof TimelineConfig>(
    key: K,
    value: TimelineConfig[K]
  ) => {
    onChange({
      ...config,
      [key]: value,
    });
  };

  return (
    <div className="space-y-6">
      {/* Date Field */}
      <div>
        <FieldSelector
          nodeType={nodeType}
          value={config.dateField}
          onChange={(v) => updateConfig('dateField', v || '')}
          label="Date Field"
          placeholder="Select date field..."
          filterKinds={['datetime']}
          allowClear={false}
          disabled={disabled}
        />
        <p className="text-xs text-gray-500 mt-1">
          Items will be grouped on the timeline by this date
        </p>
      </div>

      {/* Granularity */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Time Granularity
        </label>
        <div className="flex gap-2">
          {GRANULARITY_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`flex-1 text-center px-3 py-2 border rounded-md cursor-pointer transition-colors ${
                config.granularity === option.value
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 hover:border-gray-300 text-gray-700'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <input
                type="radio"
                name="timeline-granularity"
                value={option.value}
                checked={config.granularity === option.value}
                onChange={() => updateConfig('granularity', option.value)}
                disabled={disabled}
                className="sr-only"
              />
              <span className="text-sm font-medium">{option.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Group By Field (optional) */}
      <FieldSelector
        nodeType={nodeType}
        value={config.groupByField}
        onChange={(v) => updateConfig('groupByField', v || undefined)}
        label="Group By Field (optional)"
        placeholder="No grouping"
        allowClear={true}
        filterKinds={['enum', 'string']}
        includeBuiltIn={true}
        disabled={disabled}
      />

      {/* Display Options */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-gray-700">Display Options</h4>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={config.showConnectors !== false}
            onChange={(e) => updateConfig('showConnectors', e.target.checked)}
            disabled={disabled}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700">Show connecting lines</span>
        </label>
      </div>

      {/* Card Template */}
      <CardTemplateEditor
        nodeType={nodeType}
        value={config.cardTemplate}
        onChange={(template) => updateConfig('cardTemplate', template)}
        disabled={disabled}
      />
    </div>
  );
}
