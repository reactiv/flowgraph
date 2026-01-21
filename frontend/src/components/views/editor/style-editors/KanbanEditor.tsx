'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { NodeType, WorkflowDefinition } from '@/types/workflow';
import type { KanbanConfig, SwimlanePath, FilterableField } from '@/types/view-templates';
import { FieldSelector } from '../FieldSelector';
import { ColumnOrderEditor } from '../ColumnOrderEditor';
import { CardTemplateEditor } from '../CardTemplateEditor';

interface KanbanEditorProps {
  nodeType: NodeType;
  workflowDefinition?: WorkflowDefinition;
  config: KanbanConfig;
  onChange: (config: KanbanConfig) => void;
  disabled?: boolean;
}

interface SwimlaneOption {
  value: string;
  label: string;
  isRelational: boolean;
  // For property-based swimlanes
  fieldKey?: string;
  // For relational swimlanes
  swimlanePath?: SwimlanePath;
}

/**
 * Build swimlane options from the field schema.
 * Filters to only include swimlane-appropriate fields:
 * - Direct properties: enum fields only
 * - Relational fields: title + enum fields
 */
function buildSwimlaneOptionsFromSchema(
  propertyFields: FilterableField[],
  relationalFields: FilterableField[]
): SwimlaneOption[] {
  const options: SwimlaneOption[] = [];

  // Add property-based options (enum fields only - they have finite values for grouping)
  propertyFields
    .filter((f) => f.kind === 'enum')
    .forEach((field) => {
      options.push({
        value: `property:${field.key}`,
        label: field.label,
        isRelational: false,
        fieldKey: field.key,
      });
    });

  // Add relational options - same fields as filters for consistency
  relationalFields.forEach((field) => {
      if (!field.relationPath) return;

      // Extract the field name from the key (format: EDGE_TYPE:direction:fieldName)
      const keyParts = field.key.split(':');
      const fieldName = keyParts[keyParts.length - 1];
      if (!fieldName) return;

      options.push({
        value: `relational:${field.relationPath.edgeType}:${field.relationPath.direction}:${fieldName}`,
        label: field.label,
        isRelational: true,
        swimlanePath: {
          edgeType: field.relationPath.edgeType,
          direction: field.relationPath.direction,
          targetType: field.relationPath.targetType,
          targetField: fieldName,
        },
      });
    });

  return options;
}

export function KanbanEditor({
  nodeType,
  workflowDefinition,
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

  // Fetch field schema from API - single source of truth for field options
  const { data: fieldSchema } = useQuery({
    queryKey: ['fieldSchema', workflowDefinition?.workflowId, nodeType.type],
    queryFn: () => api.getFieldSchema(workflowDefinition!.workflowId, nodeType.type),
    enabled: !!workflowDefinition?.workflowId,
  });

  // Get available values for a field
  const getFieldValues = (fieldKey: string | undefined): string[] => {
    if (!fieldKey) return [];
    if (fieldKey === 'status' && nodeType.states?.enabled) {
      return nodeType.states.values;
    }
    // Check if it's an enum field
    const enumField = nodeType.fields.find(
      (f) => f.key === fieldKey && f.kind === 'enum'
    );
    return enumField?.values || [];
  };

  // Build swimlane options from field schema (single source of truth)
  const swimlaneOptions = useMemo((): SwimlaneOption[] => {
    if (!fieldSchema) {
      return [];
    }

    return buildSwimlaneOptionsFromSchema(
      fieldSchema.propertyFields,
      fieldSchema.relationalFields
    );
  }, [fieldSchema]);

  // Get the current swimlane option value
  const currentSwimlaneValue = useMemo(() => {
    if (config.swimlanePath) {
      const { edgeType, direction, targetField } = config.swimlanePath;
      return `relational:${edgeType}:${direction}:${targetField}`;
    }
    if (config.swimlaneField) {
      return `property:${config.swimlaneField}`;
    }
    return '';
  }, [config.swimlaneField, config.swimlanePath]);

  // Handle swimlane option change
  const handleSwimlaneChange = (value: string) => {
    if (!value) {
      // Clear swimlane config
      onChange({
        ...config,
        swimlaneField: undefined,
        swimlanePath: undefined,
        swimlaneOrder: undefined,
        swimlaneColors: undefined,
      });
      return;
    }

    const option = swimlaneOptions.find((opt) => opt.value === value);
    if (!option) return;

    if (option.isRelational && option.swimlanePath) {
      // Relational swimlane
      onChange({
        ...config,
        swimlaneField: undefined,
        swimlanePath: option.swimlanePath,
        swimlaneOrder: undefined,
        swimlaneColors: undefined,
      });
    } else if (option.fieldKey) {
      // Property-based swimlane
      onChange({
        ...config,
        swimlaneField: option.fieldKey,
        swimlanePath: undefined,
        swimlaneOrder: undefined,
        swimlaneColors: undefined,
      });
    }
  };

  const columnValues = getFieldValues(config.groupByField);
  const swimlaneValues = getFieldValues(config.swimlaneField);

  // Check if swimlanes are configured (either property or relational)
  const hasSwimlanesConfig = Boolean(config.swimlaneField || config.swimlanePath);

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

      {/* Swimlane Field (Optional) - Uses field schema from API */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Swimlane Field (Optional)
        </label>
        <select
          value={currentSwimlaneValue}
          onChange={(e) => handleSwimlaneChange(e.target.value)}
          disabled={disabled || !fieldSchema}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
        >
          <option value="">No swimlanes</option>
          {swimlaneOptions.length > 0 && (
            <>
              {/* Property-based options */}
              {swimlaneOptions.some((opt) => !opt.isRelational) && (
                <optgroup label="Direct Properties">
                  {swimlaneOptions
                    .filter((opt) => !opt.isRelational)
                    .map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                </optgroup>
              )}
              {/* Relational options */}
              {swimlaneOptions.some((opt) => opt.isRelational) && (
                <optgroup label="Related Nodes">
                  {swimlaneOptions
                    .filter((opt) => opt.isRelational)
                    .map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                </optgroup>
              )}
            </>
          )}
        </select>
        <p className="text-xs text-gray-500 mt-1">
          Add horizontal swimlanes to group cards by a second field or related node
        </p>
        {config.swimlanePath && (
          <p className="text-xs text-blue-600 mt-1">
            Using relational swimlane via &quot;{config.swimlanePath.edgeType}&quot; edge
          </p>
        )}
      </div>

      {/* Swimlane Order & Colors - Only for property-based swimlanes */}
      {config.swimlaneField && swimlaneValues.length > 0 && (
        <ColumnOrderEditor
          values={swimlaneValues}
          order={config.swimlaneOrder}
          onChange={(order) => updateConfig('swimlaneOrder', order)}
          colors={config.swimlaneColors}
          onColorsChange={(colors) => updateConfig('swimlaneColors', colors)}
          label="Swimlane Order & Colors"
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

        {hasSwimlanesConfig && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.showEmptySwimlanes !== false}
              onChange={(e) => updateConfig('showEmptySwimlanes', e.target.checked)}
              disabled={disabled}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">Show empty swimlanes</span>
          </label>
        )}
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
