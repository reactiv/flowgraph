'use client';

import type { NodeType, Field } from '@/types/workflow';

type FieldKind = Field['kind'];

interface FieldSelectorProps {
  nodeType: NodeType;
  value: string | null | undefined;
  onChange: (fieldKey: string | null) => void;
  /** Filter to specific field kinds */
  filterKinds?: FieldKind[];
  /** Placeholder text */
  placeholder?: string;
  /** Allow clearing the selection */
  allowClear?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Include built-in fields (title, status) */
  includeBuiltIn?: boolean;
  /** Label for the field */
  label?: string;
}

/** Built-in fields that exist on all nodes */
const BUILT_IN_FIELDS: Array<{ key: string; label: string; kind: FieldKind }> = [
  { key: 'title', label: 'Title', kind: 'string' },
  { key: 'status', label: 'Status', kind: 'string' },
];

/** Get a human-readable label for field kind */
function getFieldKindLabel(kind: FieldKind): string {
  switch (kind) {
    case 'string':
      return 'Text';
    case 'number':
      return 'Number';
    case 'datetime':
      return 'Date/Time';
    case 'enum':
      return 'Enum';
    case 'person':
      return 'Person';
    case 'json':
      return 'JSON';
    case 'tag[]':
      return 'Tags';
    case 'file[]':
      return 'Files';
    default:
      return kind;
  }
}

export function FieldSelector({
  nodeType,
  value,
  onChange,
  filterKinds,
  placeholder = 'Select a field...',
  allowClear = true,
  disabled = false,
  includeBuiltIn = false,
  label,
}: FieldSelectorProps) {
  // Get filtered fields
  const schemaFields = nodeType.fields.filter((field) => {
    if (filterKinds && filterKinds.length > 0) {
      return filterKinds.includes(field.kind);
    }
    return true;
  });

  // Get filtered built-in fields
  const builtInFields = includeBuiltIn
    ? BUILT_IN_FIELDS.filter((field) => {
        if (filterKinds && filterKinds.length > 0) {
          return filterKinds.includes(field.kind);
        }
        return true;
      })
    : [];

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = e.target.value;
    onChange(newValue === '' ? null : newValue);
  };

  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      )}
      <select
        value={value || ''}
        onChange={handleChange}
        disabled={disabled}
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
      >
        {allowClear && <option value="">{placeholder}</option>}

        {builtInFields.length > 0 && (
          <optgroup label="Built-in">
            {builtInFields.map((field) => (
              <option key={field.key} value={field.key}>
                {field.label}
              </option>
            ))}
          </optgroup>
        )}

        {schemaFields.length > 0 && (
          <optgroup label={includeBuiltIn ? 'Properties' : undefined}>
            {schemaFields.map((field) => (
              <option key={field.key} value={field.key}>
                {field.label} ({getFieldKindLabel(field.kind)})
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </div>
  );
}

interface MultiFieldSelectorProps {
  nodeType: NodeType;
  value: string[];
  onChange: (fieldKeys: string[]) => void;
  filterKinds?: FieldKind[];
  placeholder?: string;
  disabled?: boolean;
  includeBuiltIn?: boolean;
  label?: string;
}

export function MultiFieldSelector({
  nodeType,
  value,
  onChange,
  filterKinds,
  placeholder = 'Select fields...',
  disabled = false,
  includeBuiltIn = false,
  label,
}: MultiFieldSelectorProps) {
  // Get filtered fields
  const schemaFields = nodeType.fields.filter((field) => {
    if (filterKinds && filterKinds.length > 0) {
      return filterKinds.includes(field.kind);
    }
    return true;
  });

  const builtInFields = includeBuiltIn
    ? BUILT_IN_FIELDS.filter((field) => {
        if (filterKinds && filterKinds.length > 0) {
          return filterKinds.includes(field.kind);
        }
        return true;
      })
    : [];

  const allFields = [...builtInFields, ...schemaFields];

  const toggleField = (fieldKey: string) => {
    if (value.includes(fieldKey)) {
      onChange(value.filter((k) => k !== fieldKey));
    } else {
      onChange([...value, fieldKey]);
    }
  };

  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      )}
      <div className="border border-gray-300 rounded-md p-2 space-y-1 max-h-48 overflow-y-auto">
        {allFields.length === 0 ? (
          <p className="text-sm text-gray-500 py-2 text-center">{placeholder}</p>
        ) : (
          allFields.map((field) => {
            const isSelected = value.includes(field.key);
            return (
              <label
                key={field.key}
                className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${
                  isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleField(field.key)}
                  disabled={disabled}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">{field.label}</span>
                <span className="text-xs text-gray-400 ml-auto">
                  {getFieldKindLabel(field.kind)}
                </span>
              </label>
            );
          })
        )}
      </div>
      {value.length > 0 && (
        <p className="text-xs text-gray-500 mt-1">{value.length} field(s) selected</p>
      )}
    </div>
  );
}
