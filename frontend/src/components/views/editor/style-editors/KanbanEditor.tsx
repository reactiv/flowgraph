'use client';

import type { NodeType } from '@/types/workflow';
import type { KanbanConfig } from '@/types/view-templates';
import { FieldSelector } from '../FieldSelector';
import { ColumnOrderEditor } from '../ColumnOrderEditor';
import { CardTemplateEditor } from '../CardTemplateEditor';

interface KanbanEditorProps {
  nodeType: NodeType;
  config: KanbanConfig;
  onChange: (config: KanbanConfig) => void;
  disabled?: boolean;
}

export function KanbanEditor({
  nodeType,
  config,
  onChange,
  disabled = false,
}: KanbanEditorProps) {
  const updateConfig = <K extends keyof KanbanConfig>(
    key: K,
    value: KanbanConfig[K]
  ) => {
    onChange({
      ...config,
      [key]: value,
    });
  };

  // Get available values for groupByField
  const getGroupByValues = (): string[] => {
    const field = config.groupByField;
    if (field === 'status' && nodeType.states?.enabled) {
      return nodeType.states.values;
    }
    // Check if it's an enum field
    const enumField = nodeType.fields.find(
      (f) => f.key === field && f.kind === 'enum'
    );
    return enumField?.values || [];
  };

  const columnValues = getGroupByValues();

  return (
    <div className="space-y-6">
      {/* Group By Field */}
      <div>
        <FieldSelector
          nodeType={nodeType}
          value={config.groupByField}
          onChange={(v) => updateConfig('groupByField', v || 'status')}
          label="Group By Field"
          placeholder="Select grouping field..."
          filterKinds={['enum']}
          includeBuiltIn={true}
          allowClear={false}
          disabled={disabled}
        />
        <p className="text-xs text-gray-500 mt-1">
          Cards will be grouped into columns by this field&apos;s values
        </p>
      </div>

      {/* Column Order & Colors */}
      {columnValues.length > 0 && (
        <ColumnOrderEditor
          values={columnValues}
          order={config.columnOrder}
          onChange={(order) => updateConfig('columnOrder', order)}
          colors={config.columnColors}
          onColorsChange={(colors) => updateConfig('columnColors', colors)}
          label="Column Order & Colors"
          showColors={true}
          disabled={disabled}
        />
      )}

      {/* Display Options */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-gray-700">Display Options</h4>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={config.allowDrag !== false}
            onChange={(e) => updateConfig('allowDrag', e.target.checked)}
            disabled={disabled}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700">Allow drag and drop</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={config.showCounts !== false}
            onChange={(e) => updateConfig('showCounts', e.target.checked)}
            disabled={disabled}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700">Show item counts in headers</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={config.showEmptyColumns !== false}
            onChange={(e) => updateConfig('showEmptyColumns', e.target.checked)}
            disabled={disabled}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700">Show empty columns</span>
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
