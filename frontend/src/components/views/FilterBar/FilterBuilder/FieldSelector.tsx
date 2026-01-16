'use client';

import type { FilterableField, FilterSchema } from '@/types/view-templates';

interface FieldSelectorProps {
  schema: FilterSchema;
  selectedField: FilterableField | null;
  onFieldChange: (field: FilterableField | null) => void;
}

export function FieldSelector({
  schema,
  selectedField,
  onFieldChange,
}: FieldSelectorProps) {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const key = e.target.value;
    if (!key) {
      onFieldChange(null);
      return;
    }

    // Find the field in property fields or relational fields
    const field =
      schema.propertyFields.find((f) => f.key === key) ||
      schema.relationalFields.find((f) => f.key === key);

    onFieldChange(field || null);
  };

  return (
    <select
      value={selectedField?.key || ''}
      onChange={handleChange}
      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
    >
      <option value="">Select a field...</option>

      {schema.propertyFields.length > 0 && (
        <optgroup label="Properties">
          {schema.propertyFields.map((field) => (
            <option key={field.key} value={field.key}>
              {field.label}
            </option>
          ))}
        </optgroup>
      )}

      {schema.relationalFields.length > 0 && (
        <optgroup label="Related">
          {schema.relationalFields.map((field) => (
            <option key={field.key} value={field.key}>
              {field.label}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
