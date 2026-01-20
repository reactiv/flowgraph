'use client';

import { useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import type { NodeType, WorkflowDefinition } from '@/types/workflow';
import type { RecordConfig, RecordSectionConfig, RecordSelectorStyle } from '@/types/view-templates';
import { MultiFieldSelector } from '../FieldSelector';

interface RecordEditorProps {
  nodeType: NodeType;
  workflowDefinition: WorkflowDefinition;
  config: RecordConfig;
  onChange: (config: RecordConfig) => void;
  disabled?: boolean;
}

const SELECTOR_STYLE_OPTIONS: Array<{
  value: RecordSelectorStyle;
  label: string;
  description: string;
}> = [
  { value: 'list', label: 'List', description: 'Simple list of records' },
  { value: 'cards', label: 'Cards', description: 'Card grid view' },
  { value: 'dropdown', label: 'Dropdown', description: 'Dropdown selector' },
];

export function RecordEditor({
  nodeType,
  workflowDefinition,
  config,
  onChange,
  disabled = false,
}: RecordEditorProps) {
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set([0]));

  const updateConfig = <K extends keyof RecordConfig>(
    key: K,
    value: RecordConfig[K]
  ) => {
    onChange({
      ...config,
      [key]: value,
    });
  };

  const toggleSectionExpanded = (index: number) => {
    const next = new Set(expandedSections);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    setExpandedSections(next);
  };

  const updateSection = (index: number, section: RecordSectionConfig) => {
    const newSections = [...config.sections];
    newSections[index] = section;
    updateConfig('sections', newSections);
  };

  const addSection = () => {
    // Find a node type that isn't already used
    const usedTypes = new Set(config.sections.map((s) => s.targetType));
    const availableType = workflowDefinition.nodeTypes.find(
      (nt) => nt.type !== nodeType.type && !usedTypes.has(nt.type)
    );

    if (availableType) {
      const newSection: RecordSectionConfig = {
        targetType: availableType.type,
        title: availableType.displayName,
        collapsedByDefault: false,
        allowCreate: true,
      };
      updateConfig('sections', [...config.sections, newSection]);
      setExpandedSections(new Set([...expandedSections, config.sections.length]));
    }
  };

  const removeSection = (index: number) => {
    const newSections = config.sections.filter((_, i) => i !== index);
    updateConfig('sections', newSections);
  };

  // Available node types for sections (excluding the root type)
  const availableNodeTypes = workflowDefinition.nodeTypes.filter(
    (nt) => nt.type !== nodeType.type
  );

  return (
    <div className="space-y-6">
      {/* Selector Style */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Record Selector Style
        </label>
        <div className="grid grid-cols-3 gap-2">
          {SELECTOR_STYLE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`flex flex-col p-3 border rounded-md cursor-pointer transition-colors ${
                config.selectorStyle === option.value
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <input
                type="radio"
                name="record-selector-style"
                value={option.value}
                checked={config.selectorStyle === option.value}
                onChange={() => updateConfig('selectorStyle', option.value)}
                disabled={disabled}
                className="sr-only"
              />
              <span className="text-sm font-medium text-gray-900">{option.label}</span>
              <span className="text-xs text-gray-500 mt-0.5">{option.description}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Properties Section */}
      <div className="space-y-3 border border-gray-200 rounded-md p-4 bg-gray-50">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={config.showProperties !== false}
            onChange={(e) => updateConfig('showProperties', e.target.checked)}
            disabled={disabled}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm font-medium text-gray-700">Show Properties Section</span>
        </label>

        {config.showProperties !== false && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Properties Section Title
              </label>
              <input
                type="text"
                value={config.propertiesTitle || 'Properties'}
                onChange={(e) => updateConfig('propertiesTitle', e.target.value)}
                disabled={disabled}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
              />
            </div>

            <MultiFieldSelector
              nodeType={nodeType}
              value={config.propertyFields || []}
              onChange={(fields) =>
                updateConfig('propertyFields', fields.length > 0 ? fields : undefined)
              }
              label="Property Fields (leave empty for all)"
              placeholder="All fields shown"
              disabled={disabled}
            />
          </>
        )}
      </div>

      {/* Related Sections */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-gray-700">
            Related Sections
          </label>
          {!disabled && availableNodeTypes.length > config.sections.length && (
            <button
              type="button"
              onClick={addSection}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded"
            >
              <Plus className="h-3 w-3" />
              Add Section
            </button>
          )}
        </div>

        <div className="space-y-2">
          {config.sections.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4 border border-dashed border-gray-300 rounded-md">
              No related sections. Click &quot;Add Section&quot; to add one.
            </p>
          ) : (
            config.sections.map((section, index) => (
              <SectionEditor
                key={index}
                section={section}
                availableNodeTypes={availableNodeTypes}
                isExpanded={expandedSections.has(index)}
                onToggleExpand={() => toggleSectionExpanded(index)}
                onChange={(s) => updateSection(index, s)}
                onRemove={() => removeSection(index)}
                disabled={disabled}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

interface SectionEditorProps {
  section: RecordSectionConfig;
  availableNodeTypes: NodeType[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onChange: (section: RecordSectionConfig) => void;
  onRemove: () => void;
  disabled: boolean;
}

function SectionEditor({
  section,
  availableNodeTypes,
  isExpanded,
  onToggleExpand,
  onChange,
  onRemove,
  disabled,
}: SectionEditorProps) {
  const updateField = <K extends keyof RecordSectionConfig>(
    key: K,
    value: RecordSectionConfig[K]
  ) => {
    onChange({
      ...section,
      [key]: value,
    });
  };

  const nodeType = availableNodeTypes.find((nt) => nt.type === section.targetType);

  return (
    <div className="border border-gray-200 rounded-md bg-white">
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50"
        onClick={onToggleExpand}
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-gray-400" />
        )}
        <span className="text-sm font-medium text-gray-700 flex-1">
          {section.title || nodeType?.displayName || section.targetType}
        </span>
        <span className="text-xs text-gray-400">{section.targetType}</span>
        {!disabled && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="p-1 text-gray-400 hover:text-red-500"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="px-3 py-3 border-t border-gray-100 space-y-3">
          {/* Target Type */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Node Type
            </label>
            <select
              value={section.targetType}
              onChange={(e) => updateField('targetType', e.target.value)}
              disabled={disabled}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
            >
              {availableNodeTypes.map((nt) => (
                <option key={nt.type} value={nt.type}>
                  {nt.displayName}
                </option>
              ))}
            </select>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Section Title
            </label>
            <input
              type="text"
              value={section.title || ''}
              onChange={(e) => updateField('title', e.target.value || undefined)}
              placeholder={nodeType?.displayName}
              disabled={disabled}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Description (optional)
            </label>
            <input
              type="text"
              value={section.description || ''}
              onChange={(e) => updateField('description', e.target.value || undefined)}
              placeholder="Optional description"
              disabled={disabled}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
            />
          </div>

          {/* Max Items */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Max Items (optional)
            </label>
            <input
              type="number"
              min={1}
              value={section.maxItems || ''}
              onChange={(e) =>
                updateField('maxItems', e.target.value ? Number(e.target.value) : undefined)
              }
              placeholder="No limit"
              disabled={disabled}
              className="w-24 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
            />
          </div>

          {/* Checkboxes */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={section.collapsedByDefault || false}
                onChange={(e) => updateField('collapsedByDefault', e.target.checked)}
                disabled={disabled}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Collapsed by default</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={section.allowCreate !== false}
                onChange={(e) => updateField('allowCreate', e.target.checked)}
                disabled={disabled}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Allow creating new items</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={section.displayNested || false}
                onChange={(e) => updateField('displayNested', e.target.checked)}
                disabled={disabled}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Display nested items</span>
            </label>
          </div>

          {/* Empty Message */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Empty Message (optional)
            </label>
            <input
              type="text"
              value={section.emptyMessage || ''}
              onChange={(e) => updateField('emptyMessage', e.target.value || undefined)}
              placeholder="No items found"
              disabled={disabled}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
            />
          </div>
        </div>
      )}
    </div>
  );
}
