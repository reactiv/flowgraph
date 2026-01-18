'use client';

import { useState, useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import type { Node, NodeType, Field } from '@/types/workflow';
import { SuggestFieldValueModal } from '../SuggestFieldValueModal';

interface PropertiesTabProps {
  workflowId: string;
  node: Node;
  nodeType: NodeType;
  onSave: (properties: Record<string, unknown>) => void;
  isSaving: boolean;
}

export function PropertiesTab({ workflowId, node, nodeType, onSave, isSaving }: PropertiesTabProps) {
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [suggestModal, setSuggestModal] = useState<{
    isOpen: boolean;
    field: Field | null;
  }>({ isOpen: false, field: null });

  // Initialize form data from node properties
  useEffect(() => {
    setFormData({ ...node.properties });
    setIsDirty(false);
  }, [node.properties]);

  const handleFieldChange = (key: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

  const handleSave = () => {
    onSave(formData);
    setIsDirty(false);
  };

  const handleReset = () => {
    setFormData({ ...node.properties });
    setIsDirty(false);
  };

  const handleSuggestClick = (field: Field) => {
    setSuggestModal({ isOpen: true, field });
  };

  const handleSuggestClose = () => {
    setSuggestModal({ isOpen: false, field: null });
  };

  const handleSuggestAccept = (value: unknown) => {
    if (suggestModal.field) {
      handleFieldChange(suggestModal.field.key, value);
    }
    handleSuggestClose();
  };

  return (
    <div className="p-4">
      <form onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
        <div className="space-y-4">
          {nodeType.fields.map((field) => (
            <FieldInput
              key={field.key}
              field={field}
              value={formData[field.key]}
              onChange={(value) => handleFieldChange(field.key, value)}
              disabled={isSaving}
              onSuggestClick={() => handleSuggestClick(field)}
            />
          ))}
        </div>

        {/* Save/Reset buttons */}
        {isDirty && (
          <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
            <button
              type="button"
              onClick={handleReset}
              disabled={isSaving}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md disabled:opacity-50"
            >
              Reset
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:bg-blue-300"
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}
      </form>

      {/* Suggest Field Value Modal */}
      {suggestModal.field && (
        <SuggestFieldValueModal
          workflowId={workflowId}
          node={node}
          field={suggestModal.field}
          currentValue={formData[suggestModal.field.key]}
          isOpen={suggestModal.isOpen}
          onClose={handleSuggestClose}
          onAccept={handleSuggestAccept}
        />
      )}
    </div>
  );
}

interface FieldInputProps {
  field: Field;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  onSuggestClick?: () => void;
}

function FieldInput({ field, value, onChange, disabled, onSuggestClick }: FieldInputProps) {
  // Can suggest for all field types except file[]
  const canSuggest = field.kind !== 'file[]';
  const inputClasses =
    'w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500';

  const renderInput = () => {
    switch (field.kind) {
      case 'string':
      case 'person':
        return (
          <input
            type="text"
            id={field.key}
            value={(value as string) || ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className={inputClasses}
            placeholder={field.label}
          />
        );

      case 'number':
        return (
          <input
            type="number"
            id={field.key}
            value={value !== undefined && value !== null ? String(value) : ''}
            onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
            disabled={disabled}
            className={inputClasses}
            placeholder={field.label}
          />
        );

      case 'datetime':
        // Convert to datetime-local format
        const dateValue = value
          ? new Date(value as string).toISOString().slice(0, 16)
          : '';
        return (
          <input
            type="datetime-local"
            id={field.key}
            value={dateValue}
            onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)}
            disabled={disabled}
            className={inputClasses}
          />
        );

      case 'enum':
        return (
          <select
            id={field.key}
            value={(value as string) || ''}
            onChange={(e) => onChange(e.target.value || null)}
            disabled={disabled}
            className={inputClasses}
          >
            <option value="">Select {field.label}</option>
            {field.values?.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        );

      case 'tag[]':
        const tags = Array.isArray(value) ? value : [];
        return (
          <div>
            <div className="flex flex-wrap gap-1 mb-2">
              {tags.map((tag, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700"
                >
                  {String(tag)}
                  {!disabled && (
                    <button
                      type="button"
                      onClick={() => {
                        const newTags = [...tags];
                        newTags.splice(i, 1);
                        onChange(newTags);
                      }}
                      className="text-gray-500 hover:text-gray-700"
                    >
                      &times;
                    </button>
                  )}
                </span>
              ))}
            </div>
            <input
              type="text"
              id={field.key}
              placeholder="Type and press Enter to add tag"
              disabled={disabled}
              className={inputClasses}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const input = e.target as HTMLInputElement;
                  const newTag = input.value.trim();
                  if (newTag && !tags.includes(newTag)) {
                    onChange([...tags, newTag]);
                    input.value = '';
                  }
                }
              }}
            />
          </div>
        );

      case 'json':
        const jsonString = value ? JSON.stringify(value, null, 2) : '';
        return (
          <textarea
            id={field.key}
            value={jsonString}
            onChange={(e) => {
              try {
                const parsed = JSON.parse(e.target.value);
                onChange(parsed);
              } catch {
                // Invalid JSON, keep raw string for editing
                // Don't update onChange until valid
              }
            }}
            disabled={disabled}
            className={`${inputClasses} font-mono text-xs`}
            rows={4}
            placeholder="{}"
          />
        );

      case 'file[]':
        // File arrays are read-only in properties view
        const files = Array.isArray(value) ? value : [];
        return (
          <div className="text-sm text-gray-500">
            {files.length > 0 ? (
              <ul className="list-disc list-inside">
                {files.map((file, i) => (
                  <li key={i}>
                    {typeof file === 'object' && file !== null
                      ? String((file as Record<string, unknown>).name || `File ${i + 1}`)
                      : String(file)}
                  </li>
                ))}
              </ul>
            ) : (
              <span>No files attached</span>
            )}
          </div>
        );

      default:
        return (
          <input
            type="text"
            id={field.key}
            value={String(value || '')}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className={inputClasses}
          />
        );
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label htmlFor={field.key} className="block text-sm font-medium text-gray-700">
          {field.label}
          {field.required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        {canSuggest && onSuggestClick && (
          <button
            type="button"
            onClick={onSuggestClick}
            disabled={disabled}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-purple-600 hover:text-purple-700 hover:bg-purple-50 rounded-md disabled:opacity-50 disabled:hover:bg-transparent"
            title={`Suggest ${field.label}`}
          >
            <Sparkles className="h-3 w-3" />
            Suggest
          </button>
        )}
      </div>
      {renderInput()}
    </div>
  );
}
