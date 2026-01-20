'use client';

import type { NodeType } from '@/types/workflow';
import type { CardsConfig } from '@/types/view-templates';
import { CardTemplateEditor } from '../CardTemplateEditor';

interface CardsEditorProps {
  nodeType: NodeType;
  config: CardsConfig;
  onChange: (config: CardsConfig) => void;
  disabled?: boolean;
}

const LAYOUT_OPTIONS: Array<{ value: CardsConfig['layout']; label: string; description: string }> = [
  { value: 'grid', label: 'Grid', description: 'Responsive grid of cards' },
  { value: 'list', label: 'List', description: 'Vertical stack of cards' },
  { value: 'single', label: 'Single', description: 'One large card focused' },
  { value: 'inline-chips', label: 'Inline Chips', description: 'Compact inline badges' },
];

export function CardsEditor({
  nodeType,
  config,
  onChange,
  disabled = false,
}: CardsEditorProps) {
  const updateConfig = <K extends keyof CardsConfig>(
    key: K,
    value: CardsConfig[K]
  ) => {
    onChange({
      ...config,
      [key]: value,
    });
  };

  return (
    <div className="space-y-6">
      {/* Layout */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Layout</label>
        <div className="grid grid-cols-2 gap-2">
          {LAYOUT_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`flex flex-col p-3 border rounded-md cursor-pointer transition-colors ${
                config.layout === option.value
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <input
                type="radio"
                name="cards-layout"
                value={option.value}
                checked={config.layout === option.value}
                onChange={() => updateConfig('layout', option.value)}
                disabled={disabled}
                className="sr-only"
              />
              <span className="text-sm font-medium text-gray-900">{option.label}</span>
              <span className="text-xs text-gray-500 mt-0.5">{option.description}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Grid Columns (only for grid layout) */}
      {config.layout === 'grid' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Grid Columns
          </label>
          <select
            value={config.columns || ''}
            onChange={(e) =>
              updateConfig('columns', e.target.value ? Number(e.target.value) : undefined)
            }
            disabled={disabled}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
          >
            <option value="">Auto (responsive)</option>
            <option value="1">1 column</option>
            <option value="2">2 columns</option>
            <option value="3">3 columns</option>
            <option value="4">4 columns</option>
            <option value="5">5 columns</option>
            <option value="6">6 columns</option>
          </select>
          <p className="text-xs text-gray-500 mt-1">
            Leave as Auto for responsive layout
          </p>
        </div>
      )}

      {/* Card Template */}
      <CardTemplateEditor
        nodeType={nodeType}
        value={config.cardTemplate}
        onChange={(template) => updateConfig('cardTemplate', template)}
        disabled={disabled}
      />
    </div>
  );
}
