'use client';

import { useState } from 'react';
import type { FilterableField, FilterOperator } from '@/types/view-templates';

interface ValueInputProps {
  field: FilterableField;
  operator: FilterOperator;
  value: unknown;
  onChange: (value: unknown) => void;
}

export function ValueInput({ field, operator, value, onChange }: ValueInputProps) {
  // For multi-select operators with enum fields
  const isMultiSelect = (operator === 'in' || operator === 'notIn') && field.values;

  // Track selected values for multi-select
  const [selectedValues, setSelectedValues] = useState<string[]>(
    Array.isArray(value) ? value : []
  );

  // Handle string/text input
  if (field.kind === 'string' || field.kind === 'person') {
    return (
      <input
        type="text"
        value={(value as string) || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Enter value..."
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    );
  }

  // Handle number input
  if (field.kind === 'number') {
    return (
      <input
        type="number"
        value={(value as number) ?? ''}
        onChange={(e) => {
          const val = e.target.value;
          onChange(val === '' ? null : Number(val));
        }}
        placeholder="Enter number..."
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    );
  }

  // Handle datetime input
  if (field.kind === 'datetime') {
    return (
      <input
        type="datetime-local"
        value={(value as string) || ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    );
  }

  // Handle enum fields
  if (field.kind === 'enum' && field.values) {
    // Multi-select for 'in' and 'notIn' operators
    if (isMultiSelect) {
      const toggleValue = (v: string) => {
        const newValues = selectedValues.includes(v)
          ? selectedValues.filter((sv) => sv !== v)
          : [...selectedValues, v];
        setSelectedValues(newValues);
        onChange(newValues);
      };

      return (
        <div className="space-y-1 max-h-40 overflow-y-auto border border-gray-300 rounded-md p-2">
          {field.values.map((v) => (
            <label
              key={v}
              className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded"
            >
              <input
                type="checkbox"
                checked={selectedValues.includes(v)}
                onChange={() => toggleValue(v)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span>{v}</span>
            </label>
          ))}
        </div>
      );
    }

    // Single select for other operators
    return (
      <select
        value={(value as string) || ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      >
        <option value="">Select value...</option>
        {field.values.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    );
  }

  // Default text input for other types
  return (
    <input
      type="text"
      value={(value as string) || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Enter value..."
      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
    />
  );
}
