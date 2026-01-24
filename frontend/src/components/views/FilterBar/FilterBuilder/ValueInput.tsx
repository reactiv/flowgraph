'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { FilterableField, FilterOperator } from '@/types/view-templates';

interface ValueInputProps {
  workflowId: string;
  viewId: string;
  field: FilterableField;
  operator: FilterOperator;
  value: unknown;
  onChange: (value: unknown) => void;
}

export function ValueInput({
  workflowId,
  viewId,
  field,
  operator,
  value,
  onChange,
}: ValueInputProps) {
  // For multi-select operators with enum fields
  const isMultiSelect = (operator === 'in' || operator === 'notIn') && field.values;

  // Track selected values for multi-select
  const [selectedValues, setSelectedValues] = useState<string[]>(
    Array.isArray(value) ? value : []
  );

  // Autocomplete state
  const [inputValue, setInputValue] = useState<string>((value as string) || '');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Determine the field name for the API call
  // For relational fields, we need to extract the actual field name (e.g., "EDGE_TYPE:out:title" -> "title")
  const actualFieldName = field.isRelational
    ? field.key.split(':').pop() || field.key
    : field.key;

  // Fetch suggestions for string/person fields
  const shouldFetchSuggestions =
    (field.kind === 'string' || field.kind === 'person') && !field.values;

  const { data: suggestionsData } = useQuery({
    queryKey: ['filterValues', workflowId, viewId, field.nodeType, actualFieldName],
    queryFn: () =>
      api.getFilterValues(workflowId, viewId, field.nodeType, actualFieldName, 50),
    enabled: shouldFetchSuggestions,
    staleTime: 30000, // Cache for 30 seconds
  });

  const suggestions = suggestionsData?.values || [];

  // Filter suggestions based on current input
  const filteredSuggestions = suggestions.filter(
    (s) =>
      s.toLowerCase().includes(inputValue.toLowerCase()) &&
      s.toLowerCase() !== inputValue.toLowerCase()
  );

  // Sync inputValue with external value changes
  useEffect(() => {
    setInputValue((value as string) || '');
  }, [value]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle string/text input with autocomplete
  if (field.kind === 'string' || field.kind === 'person') {
    return (
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            onChange(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          placeholder="Enter value..."
          className="w-full px-3 py-2 border border-border bg-input text-foreground rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        />
        {/* Suggestions dropdown */}
        {showSuggestions && filteredSuggestions.length > 0 && (
          <div
            ref={suggestionsRef}
            className="absolute z-10 w-full mt-1 bg-card border border-border rounded-md shadow-lg max-h-48 overflow-y-auto"
          >
            {filteredSuggestions.map((suggestion, index) => (
              <button
                key={index}
                type="button"
                onClick={() => {
                  setInputValue(suggestion);
                  onChange(suggestion);
                  setShowSuggestions(false);
                }}
                className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-muted focus:bg-muted focus:outline-none"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>
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
        className="w-full px-3 py-2 border border-border bg-input text-foreground rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
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
        className="w-full px-3 py-2 border border-border bg-input text-foreground rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
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
        <div className="space-y-1 max-h-40 overflow-y-auto border border-border bg-input rounded-md p-2">
          {field.values.map((v) => (
            <label
              key={v}
              className="flex items-center gap-2 text-sm text-foreground cursor-pointer hover:bg-muted px-1 py-0.5 rounded"
            >
              <input
                type="checkbox"
                checked={selectedValues.includes(v)}
                onChange={() => toggleValue(v)}
                className="rounded border-border text-primary focus:ring-primary"
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
        className="w-full px-3 py-2 border border-border bg-input text-foreground rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
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
      className="w-full px-3 py-2 border border-border bg-input text-foreground rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
    />
  );
}
