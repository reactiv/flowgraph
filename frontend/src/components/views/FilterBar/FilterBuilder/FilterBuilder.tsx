'use client';

import { useState, useMemo } from 'react';
import { X } from 'lucide-react';
import type {
  FilterableField,
  FilterOperator,
  FilterSchema,
  NodeFilter,
  PropertyFilter,
  RelationalFilter,
} from '@/types/view-templates';
import {
  getOperatorsForFieldKind,
  buildFilterDisplayLabel,
  operatorNeedsValue,
} from '../filterUtils';
import { FieldSelector } from './FieldSelector';
import { OperatorSelector } from './OperatorSelector';
import { ValueInput } from './ValueInput';

interface FilterBuilderProps {
  workflowId: string;
  viewId: string;
  schema: FilterSchema;
  onAddFilter: (filter: NodeFilter, displayLabel: string) => void;
  onClose: () => void;
}

export function FilterBuilder({ workflowId, viewId, schema, onAddFilter, onClose }: FilterBuilderProps) {
  const [selectedField, setSelectedField] = useState<FilterableField | null>(null);
  const [selectedOperator, setSelectedOperator] = useState<FilterOperator | null>(null);
  const [filterValue, setFilterValue] = useState<unknown>(null);

  // Get available operators based on field type
  const availableOperators = useMemo(() => {
    if (!selectedField) return [];
    return getOperatorsForFieldKind(selectedField.kind);
  }, [selectedField]);

  // Reset operator and value when field changes
  const handleFieldChange = (field: FilterableField | null) => {
    setSelectedField(field);
    setSelectedOperator(null);
    setFilterValue(null);
  };

  // Check if filter is complete
  const isComplete = useMemo(() => {
    if (!selectedField || !selectedOperator) return false;
    // isNull and isNotNull don't need a value
    if (!operatorNeedsValue(selectedOperator)) return true;
    return filterValue !== null && filterValue !== undefined && filterValue !== '';
  }, [selectedField, selectedOperator, filterValue]);

  // Build and add the filter
  const handleAddFilter = () => {
    if (!selectedField || !selectedOperator) return;

    let filter: NodeFilter;

    if (selectedField.isRelational && selectedField.relationPath) {
      // Extract field name from the key (e.g., "EDGE_TYPE.field_name" -> "field_name")
      const fieldParts = selectedField.key.split('.');
      const targetFieldName = fieldParts.length > 1 ? fieldParts[1] : selectedField.key;

      // Relational filter
      filter = {
        type: 'relational',
        edgeType: selectedField.relationPath.edgeType,
        direction: selectedField.relationPath.direction,
        targetType: selectedField.relationPath.targetType,
        targetFilter: {
          type: 'property',
          field: targetFieldName,
          operator: selectedOperator,
          value: filterValue,
        },
        matchMode: 'any',
      } as RelationalFilter;
    } else {
      // Property filter
      filter = {
        type: 'property',
        field: selectedField.key,
        operator: selectedOperator,
        value: filterValue,
      } as PropertyFilter;
    }

    const displayLabel = buildFilterDisplayLabel(
      selectedField,
      selectedOperator,
      filterValue
    );
    onAddFilter(filter, displayLabel);
  };

  return (
    <div className="fixed inset-0 bg-black/20 flex items-start justify-center pt-20 z-50">
      <div className="bg-white rounded-lg shadow-xl p-4 w-96 max-w-[calc(100vw-2rem)]">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-gray-900">Add Filter</h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Field selection */}
        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">Field</label>
          <FieldSelector
            schema={schema}
            selectedField={selectedField}
            onFieldChange={handleFieldChange}
          />
        </div>

        {/* Operator selection (only show after field selected) */}
        {selectedField && (
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Condition
            </label>
            <OperatorSelector
              operators={availableOperators}
              selectedOperator={selectedOperator}
              onOperatorChange={setSelectedOperator}
            />
          </div>
        )}

        {/* Value input (only show for operators that need values) */}
        {selectedField &&
          selectedOperator &&
          operatorNeedsValue(selectedOperator) && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Value
              </label>
              <ValueInput
                workflowId={workflowId}
                viewId={viewId}
                field={selectedField}
                operator={selectedOperator}
                value={filterValue}
                onChange={setFilterValue}
              />
            </div>
          )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t">
          <button
            onClick={onClose}
            className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAddFilter}
            disabled={!isComplete}
            className="px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            Add Filter
          </button>
        </div>
      </div>
    </div>
  );
}
