'use client';

import { useState } from 'react';
import { GripVertical, X, Plus } from 'lucide-react';
import type { NodeType } from '@/types/workflow';
import type { TableConfig } from '@/types/view-templates';
import { StatusColorEditor } from '../StatusColorEditor';

interface TableEditorProps {
  nodeType: NodeType;
  config: TableConfig;
  onChange: (config: TableConfig) => void;
  disabled?: boolean;
}

/** Built-in column options */
const BUILT_IN_COLUMNS = [
  { key: 'title', label: 'Title' },
  { key: 'status', label: 'Status' },
  { key: 'created_at', label: 'Created At' },
  { key: 'updated_at', label: 'Updated At' },
];

export function TableEditor({
  nodeType,
  config,
  onChange,
  disabled = false,
}: TableEditorProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const updateConfig = <K extends keyof TableConfig>(
    key: K,
    value: TableConfig[K]
  ) => {
    onChange({
      ...config,
      [key]: value,
    });
  };

  // All available columns (built-in + schema fields)
  const allColumns = [
    ...BUILT_IN_COLUMNS,
    ...nodeType.fields.map((f) => ({ key: f.key, label: f.label })),
  ];

  const currentColumns = config.columns || [];
  const availableColumns = allColumns.filter((c) => !currentColumns.includes(c.key));

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const newColumns = [...currentColumns];
    const removed = newColumns.splice(draggedIndex, 1)[0];
    if (removed) {
      newColumns.splice(targetIndex, 0, removed);
      updateConfig('columns', newColumns);
    }

    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleRemoveColumn = (index: number) => {
    const newColumns = [...currentColumns];
    newColumns.splice(index, 1);
    updateConfig('columns', newColumns);
  };

  const handleAddColumn = (key: string) => {
    updateConfig('columns', [...currentColumns, key]);
  };

  const getColumnLabel = (key: string): string => {
    const builtIn = BUILT_IN_COLUMNS.find((c) => c.key === key);
    if (builtIn) return builtIn.label;
    const field = nodeType.fields.find((f) => f.key === key);
    return field?.label || key;
  };

  return (
    <div className="space-y-6">
      {/* Columns */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Table Columns
        </label>

        {/* Current columns (reorderable) */}
        <div className="space-y-1 border border-gray-200 rounded-md p-2 bg-gray-50 min-h-[60px]">
          {currentColumns.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-2">
              No columns selected. Add columns below.
            </p>
          ) : (
            currentColumns.map((col, index) => (
              <div
                key={col}
                draggable={!disabled}
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragLeave={() => setDragOverIndex(null)}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={() => {
                  setDraggedIndex(null);
                  setDragOverIndex(null);
                }}
                className={`flex items-center gap-2 px-2 py-1.5 bg-white rounded border transition-all ${
                  draggedIndex === index
                    ? 'opacity-50 border-blue-300'
                    : dragOverIndex === index
                      ? 'border-blue-500 border-2'
                      : 'border-gray-200'
                } ${disabled ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'}`}
              >
                {!disabled && (
                  <GripVertical className="h-4 w-4 text-gray-400 flex-shrink-0" />
                )}
                <span className="text-sm text-gray-700 flex-1">{getColumnLabel(col)}</span>
                <span className="text-xs text-gray-400">{col}</span>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => handleRemoveColumn(index)}
                    className="p-0.5 text-gray-400 hover:text-red-500"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {/* Add columns */}
        {availableColumns.length > 0 && !disabled && (
          <div className="mt-2">
            <p className="text-xs text-gray-500 mb-1">Add columns:</p>
            <div className="flex flex-wrap gap-1">
              {availableColumns.map((col) => (
                <button
                  key={col.key}
                  type="button"
                  onClick={() => handleAddColumn(col.key)}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded border border-gray-200"
                >
                  <Plus className="h-3 w-3" />
                  {col.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Display Options */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-gray-700">Display Options</h4>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={config.sortable !== false}
            onChange={(e) => updateConfig('sortable', e.target.checked)}
            disabled={disabled}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700">Allow column sorting</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={config.selectable || false}
            onChange={(e) => updateConfig('selectable', e.target.checked)}
            disabled={disabled}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700">Show row selection checkboxes</span>
        </label>
      </div>

      {/* Status Colors */}
      {nodeType.states?.enabled && (
        <StatusColorEditor
          nodeType={nodeType}
          value={config.statusColors}
          onChange={(colors) => updateConfig('statusColors', colors)}
          label="Status Badge Colors"
          disabled={disabled}
        />
      )}
    </div>
  );
}
