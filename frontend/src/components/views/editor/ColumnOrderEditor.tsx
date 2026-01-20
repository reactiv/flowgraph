'use client';

import { useState } from 'react';
import { GripVertical, X } from 'lucide-react';
import { ColorPicker } from './ColorPicker';

interface ColumnOrderEditorProps {
  /** Available values that can be ordered */
  values: string[];
  /** Current order (subset of values) */
  order: string[] | undefined;
  /** Callback when order changes */
  onChange: (order: string[]) => void;
  /** Optional colors for each column */
  colors?: Record<string, string>;
  /** Callback when colors change */
  onColorsChange?: (colors: Record<string, string>) => void;
  disabled?: boolean;
  label?: string;
  /** Show color pickers inline */
  showColors?: boolean;
}

export function ColumnOrderEditor({
  values,
  order,
  onChange,
  colors,
  onColorsChange,
  disabled = false,
  label,
  showColors = false,
}: ColumnOrderEditorProps) {
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [dragOverItem, setDragOverItem] = useState<string | null>(null);

  // Use order if provided, otherwise use values in original order
  const currentOrder = order && order.length > 0 ? order : values;

  // Find values not in current order (can be added)
  const availableValues = values.filter((v) => !currentOrder.includes(v));

  const handleDragStart = (e: React.DragEvent, item: string) => {
    setDraggedItem(item);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', item);
  };

  const handleDragOver = (e: React.DragEvent, item: string) => {
    e.preventDefault();
    if (draggedItem && draggedItem !== item) {
      setDragOverItem(item);
    }
  };

  const handleDragLeave = () => {
    setDragOverItem(null);
  };

  const handleDrop = (e: React.DragEvent, targetItem: string) => {
    e.preventDefault();
    setDragOverItem(null);

    if (!draggedItem || draggedItem === targetItem) {
      setDraggedItem(null);
      return;
    }

    const newOrder = [...currentOrder];
    const draggedIndex = newOrder.indexOf(draggedItem);
    const targetIndex = newOrder.indexOf(targetItem);

    if (draggedIndex !== -1 && targetIndex !== -1) {
      // Remove dragged item and insert at target position
      newOrder.splice(draggedIndex, 1);
      newOrder.splice(targetIndex, 0, draggedItem);
      onChange(newOrder);
    }

    setDraggedItem(null);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragOverItem(null);
  };

  const handleRemove = (item: string) => {
    onChange(currentOrder.filter((v) => v !== item));
  };

  const handleAdd = (item: string) => {
    onChange([...currentOrder, item]);
  };

  const handleColorChange = (item: string, color: string) => {
    if (onColorsChange) {
      onColorsChange({
        ...colors,
        [item]: color,
      });
    }
  };

  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      )}

      {/* Ordered items */}
      <div className="space-y-1 border border-gray-200 rounded-md p-2 bg-gray-50 min-h-[60px]">
        {currentOrder.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-2">No items. Add from below.</p>
        ) : (
          currentOrder.map((item) => (
            <div
              key={item}
              draggable={!disabled}
              onDragStart={(e) => handleDragStart(e, item)}
              onDragOver={(e) => handleDragOver(e, item)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, item)}
              onDragEnd={handleDragEnd}
              className={`flex items-center gap-2 px-2 py-1.5 bg-white rounded border transition-all ${
                draggedItem === item
                  ? 'opacity-50 border-blue-300'
                  : dragOverItem === item
                    ? 'border-blue-500 border-2'
                    : 'border-gray-200'
              } ${disabled ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'}`}
            >
              {!disabled && (
                <GripVertical className="h-4 w-4 text-gray-400 flex-shrink-0" />
              )}

              {/* Color indicator/picker */}
              {showColors && (
                <div
                  className="w-4 h-4 rounded flex-shrink-0 border border-gray-300"
                  style={{ backgroundColor: colors?.[item] || '#64748b' }}
                />
              )}

              <span className="text-sm text-gray-700 flex-1 truncate">{item}</span>

              {/* Inline color picker */}
              {showColors && onColorsChange && !disabled && (
                <ColorPicker
                  value={colors?.[item] || '#64748b'}
                  onChange={(color) => handleColorChange(item, color)}
                  disabled={disabled}
                />
              )}

              {/* Remove button */}
              {!disabled && availableValues.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleRemove(item)}
                  className="p-0.5 text-gray-400 hover:text-red-500 flex-shrink-0"
                  title="Remove"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Available items to add */}
      {availableValues.length > 0 && !disabled && (
        <div className="mt-2">
          <p className="text-xs text-gray-500 mb-1">Add columns:</p>
          <div className="flex flex-wrap gap-1">
            {availableValues.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => handleAdd(item)}
                className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded border border-gray-200"
              >
                + {item}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
