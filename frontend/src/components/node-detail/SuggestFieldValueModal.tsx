'use client';

import { useState, useEffect } from 'react';
import { Sparkles, Loader2, AlertCircle, Check } from 'lucide-react';
import { api } from '@/lib/api';
import type { Node, Field } from '@/types/workflow';
import type { FieldValueSuggestion } from '@/types/suggestion';

interface SuggestFieldValueModalProps {
  workflowId: string;
  node: Node;
  field: Field;
  currentValue: unknown;
  isOpen: boolean;
  onClose: () => void;
  onAccept: (value: unknown) => void;
}

export function SuggestFieldValueModal({
  workflowId,
  node,
  field,
  currentValue,
  isOpen,
  onClose,
  onAccept,
}: SuggestFieldValueModalProps) {
  const [suggestion, setSuggestion] = useState<FieldValueSuggestion | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guidance, setGuidance] = useState('');

  // Editable value
  const [editedValue, setEditedValue] = useState<unknown>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSuggestion(null);
      setEditedValue(null);
      setError(null);
      setGuidance('');
      setIsGenerating(false);
    }
  }, [isOpen]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const response = await api.suggestFieldValue(
        workflowId,
        node.id,
        field.key,
        { guidance: guidance.trim() || undefined }
      );

      const firstSuggestion = response.suggestions[0];
      if (firstSuggestion) {
        setSuggestion(firstSuggestion);
        setEditedValue(firstSuggestion.value);
      } else {
        setError('No suggestions were generated. Try again.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate suggestion');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRegenerate = async () => {
    setSuggestion(null);
    await handleGenerate();
  };

  const handleAccept = () => {
    if (editedValue === null && suggestion === null) return;
    onAccept(editedValue ?? suggestion?.value);
    handleClose();
  };

  const handleClose = () => {
    setSuggestion(null);
    setEditedValue(null);
    setError(null);
    setGuidance('');
    setIsGenerating(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center gap-3 border-b px-6 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100">
            <Sparkles className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Suggest {field.label}
            </h2>
            <p className="text-sm text-gray-500">
              Generate a value based on node context
            </p>
          </div>
        </div>

        <div className="px-6 py-4">
          {/* Current value info */}
          {currentValue !== null && currentValue !== undefined && currentValue !== '' && (
            <div className="mb-4 rounded-md bg-gray-50 p-3">
              <p className="text-xs font-medium text-gray-500 uppercase mb-1">Current Value</p>
              <p className="text-sm text-gray-700">{formatValue(currentValue)}</p>
            </div>
          )}

          {!suggestion ? (
            // Initial state: Generate button
            <>
              <div className="rounded-lg bg-gray-50 p-4 text-center">
                <p className="text-sm text-gray-600 mb-4">
                  Use AI to suggest a value for <strong>{field.label}</strong> ({field.kind}) based on:
                </p>
                <ul className="text-sm text-gray-500 text-left space-y-1 mb-4">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    Current node properties
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    Connected nodes for context
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    Similar nodes&apos; values as examples
                  </li>
                </ul>

                {/* Field constraints info */}
                {field.values && field.values.length > 0 && (
                  <div className="mb-4 text-left">
                    <p className="text-xs font-medium text-gray-500 uppercase mb-1">Allowed Values</p>
                    <div className="flex flex-wrap gap-1">
                      {field.values.map((v) => (
                        <span
                          key={v}
                          className="inline-flex items-center rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700"
                        >
                          {v}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Guidance input */}
                <div className="mb-4 text-left">
                  <label htmlFor="guidance" className="block text-sm font-medium text-gray-700 mb-1">
                    Guidance (optional)
                  </label>
                  <textarea
                    id="guidance"
                    value={guidance}
                    onChange={(e) => setGuidance(e.target.value)}
                    placeholder="e.g., Focus on recent experiments, or Keep it brief..."
                    className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                    rows={2}
                    disabled={isGenerating}
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    Add specific instructions to guide the AI suggestion
                  </p>
                </div>

                {error && (
                  <div className="mb-4 flex items-center gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700">
                    <AlertCircle className="h-4 w-4" />
                    {error}
                  </div>
                )}

                <button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="inline-flex items-center gap-2 rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:bg-purple-300"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Generate Suggestion
                    </>
                  )}
                </button>
              </div>
            </>
          ) : (
            // Suggestion preview and edit
            <div className="space-y-4">
              {/* Suggested value (editable) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Suggested Value
                </label>
                {renderEditableValue(field, editedValue, setEditedValue)}
              </div>

              {/* Rationale */}
              <div className="rounded-md bg-purple-50 p-3">
                <h4 className="text-sm font-medium text-purple-800 mb-1">Why this suggestion?</h4>
                <p className="text-sm text-purple-700">{suggestion.rationale}</p>
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700">
                  <AlertCircle className="h-4 w-4" />
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t px-6 py-4">
          <button
            onClick={handleClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
            disabled={isGenerating}
          >
            Cancel
          </button>
          {suggestion && (
            <>
              <button
                onClick={handleRegenerate}
                disabled={isGenerating}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="inline h-4 w-4 animate-spin mr-1" />
                    Regenerating...
                  </>
                ) : (
                  'Regenerate'
                )}
              </button>
              <button
                onClick={handleAccept}
                disabled={isGenerating}
                className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:bg-purple-300"
              >
                Accept
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : '(empty)';
  if (typeof value === 'object') {
    const str = JSON.stringify(value, null, 2);
    return str.length > 200 ? str.slice(0, 200) + '...' : str;
  }
  return String(value);
}

function renderEditableValue(
  field: Field,
  value: unknown,
  onChange: (value: unknown) => void
): React.ReactNode {
  const kind = field.kind;

  switch (kind) {
    case 'string':
    case 'person':
      return (
        <input
          type="text"
          value={(value as string) || ''}
          onChange={(e) => onChange(e.target.value)}
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
        />
      );

    case 'number':
      return (
        <input
          type="number"
          value={value !== null && value !== undefined ? String(value) : ''}
          onChange={(e) => {
            const num = parseFloat(e.target.value);
            onChange(isNaN(num) ? null : num);
          }}
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
        />
      );

    case 'datetime':
      return (
        <input
          type="datetime-local"
          value={formatDateTimeForInput(value as string | null)}
          onChange={(e) => {
            if (e.target.value) {
              onChange(new Date(e.target.value).toISOString());
            } else {
              onChange(null);
            }
          }}
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
        />
      );

    case 'enum':
      return (
        <select
          value={(value as string) || ''}
          onChange={(e) => onChange(e.target.value || null)}
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
        >
          <option value="">Select a value...</option>
          {field.values?.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      );

    case 'tag[]':
      const tags = Array.isArray(value) ? value : [];
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1">
            {tags.map((tag, index) => (
              <span
                key={index}
                className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => {
                    const newTags = tags.filter((_, i) => i !== index);
                    onChange(newTags);
                  }}
                  className="ml-1 text-purple-500 hover:text-purple-700"
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
          <input
            type="text"
            placeholder="Add tag and press Enter"
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
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
        </div>
      );

    case 'json':
      return (
        <textarea
          value={typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
          onChange={(e) => {
            try {
              const parsed = JSON.parse(e.target.value);
              onChange(parsed);
            } catch {
              // Keep raw string while editing invalid JSON
            }
          }}
          rows={4}
          className="block w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm shadow-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
        />
      );

    default:
      return (
        <input
          type="text"
          value={formatValue(value)}
          onChange={(e) => onChange(e.target.value)}
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
        />
      );
  }
}

function formatDateTimeForInput(isoString: string | null): string {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    // Format as YYYY-MM-DDTHH:MM for datetime-local input
    return date.toISOString().slice(0, 16);
  } catch {
    return '';
  }
}
