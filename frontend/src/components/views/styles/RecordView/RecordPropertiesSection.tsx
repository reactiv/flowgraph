'use client';

import type { Node, NodeType, Field } from '@/types/workflow';

interface RecordPropertiesSectionProps {
  node: Node;
  nodeType: NodeType;
  propertyFields: string[];
  title: string;
}

function formatValue(value: unknown, field?: Field): string {
  if (value === null || value === undefined) {
    return '—';
  }

  if (field?.kind === 'datetime' && typeof value === 'string') {
    try {
      return new Date(value).toLocaleString();
    } catch {
      return String(value);
    }
  }

  if (field?.kind === 'json') {
    return JSON.stringify(value, null, 2);
  }

  if (Array.isArray(value)) {
    return value.join(', ');
  }

  return String(value);
}

export function RecordPropertiesSection({
  node,
  nodeType,
  propertyFields,
  title,
}: RecordPropertiesSectionProps) {
  // Get field definitions for display
  const fields = propertyFields
    .map((key) => {
      const fieldDef = nodeType.fields.find((f) => f.key === key);
      const value = node.properties[key];
      return {
        key,
        label: fieldDef?.label || key,
        value,
        fieldDef,
      };
    })
    .filter((f) => f.value !== undefined && f.value !== null && f.value !== '');

  if (fields.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="mb-3 font-medium text-gray-900">{title}</h3>
        <p className="text-sm text-gray-500">No properties to display</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-3 font-medium text-gray-900">{title}</h3>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {fields.map(({ key, label, value, fieldDef }) => (
          <div key={key} className="overflow-hidden">
            <dt className="text-sm font-medium text-gray-500">{label}</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {fieldDef?.kind === 'json' ? (
                <pre className="max-h-32 overflow-auto rounded bg-gray-50 p-2 text-xs">
                  {formatValue(value, fieldDef)}
                </pre>
              ) : (
                <span className="break-words">{formatValue(value, fieldDef)}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
