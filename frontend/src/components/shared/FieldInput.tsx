'use client';

import { Sparkles } from 'lucide-react';
import type { Field } from '@/types/workflow';

export interface FieldInputProps {
  field: Field;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  onSuggestClick?: () => void;
  showSuggestButton?: boolean;
}

/**
 * Reusable field input component that renders the appropriate input type
 * based on the field's kind (string, number, enum, tag[], etc.)
 */
export function FieldInput({
  field,
  value,
  onChange,
  disabled,
  onSuggestClick,
  showSuggestButton = true,
}: FieldInputProps) {
  // Can suggest for all field types except file[]
  const canSuggest = field.kind !== 'file[]' && showSuggestButton;
  const inputClasses =
    'w-full rounded-md border border-border bg-input text-foreground px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:bg-muted disabled:text-muted-foreground placeholder:text-muted-foreground';

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

      case 'datetime': {
        // Convert to datetime-local format
        const dateValue = value ? new Date(value as string).toISOString().slice(0, 16) : '';
        return (
          <input
            type="datetime-local"
            id={field.key}
            value={dateValue}
            onChange={(e) =>
              onChange(e.target.value ? new Date(e.target.value).toISOString() : null)
            }
            disabled={disabled}
            className={inputClasses}
          />
        );
      }

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

      case 'tag[]': {
        const tags = Array.isArray(value) ? value : [];
        return (
          <div>
            <div className="flex flex-wrap gap-1 mb-2">
              {tags.map((tag, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-muted text-foreground"
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
                      className="text-muted-foreground hover:text-foreground"
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
      }

      case 'json': {
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
      }

      case 'file[]': {
        // File arrays are read-only in properties view
        const files = Array.isArray(value) ? value : [];
        return (
          <div className="text-sm text-muted-foreground">
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
      }

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
        <label htmlFor={field.key} className="block text-sm font-medium text-foreground">
          {field.label}
          {field.required && <span className="text-destructive ml-0.5">*</span>}
        </label>
        {canSuggest && onSuggestClick && (
          <button
            type="button"
            onClick={onSuggestClick}
            disabled={disabled}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-primary hover:text-primary/80 hover:bg-primary/10 rounded-md disabled:opacity-50 disabled:hover:bg-transparent"
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
