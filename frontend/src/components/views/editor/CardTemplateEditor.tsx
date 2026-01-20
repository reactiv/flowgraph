'use client';

import type { NodeType } from '@/types/workflow';
import type { CardTemplate } from '@/types/view-templates';
import { FieldSelector, MultiFieldSelector } from './FieldSelector';
import { StatusColorEditor } from './StatusColorEditor';

interface CardTemplateEditorProps {
  nodeType: NodeType;
  value: CardTemplate | undefined;
  onChange: (template: CardTemplate) => void;
  disabled?: boolean;
}

const DEFAULT_CARD_TEMPLATE: CardTemplate = {
  titleField: 'title',
  subtitleField: undefined,
  statusField: undefined,
  bodyFields: [],
  showInlineChildren: false,
  statusColors: undefined,
};

export function CardTemplateEditor({
  nodeType,
  value,
  onChange,
  disabled = false,
}: CardTemplateEditorProps) {
  const template = value || DEFAULT_CARD_TEMPLATE;

  const updateField = <K extends keyof CardTemplate>(
    key: K,
    fieldValue: CardTemplate[K]
  ) => {
    onChange({
      ...template,
      [key]: fieldValue,
    });
  };

  return (
    <div className="space-y-4 border border-gray-200 rounded-md p-4 bg-white">
      <h4 className="text-sm font-medium text-gray-900">Card Template</h4>

      {/* Title Field */}
      <FieldSelector
        nodeType={nodeType}
        value={template.titleField}
        onChange={(v) => updateField('titleField', v || 'title')}
        label="Title Field"
        placeholder="Select title field..."
        includeBuiltIn={true}
        disabled={disabled}
      />

      {/* Subtitle Field */}
      <FieldSelector
        nodeType={nodeType}
        value={template.subtitleField}
        onChange={(v) => updateField('subtitleField', v || undefined)}
        label="Subtitle Field (optional)"
        placeholder="None"
        allowClear={true}
        includeBuiltIn={true}
        disabled={disabled}
      />

      {/* Status Field */}
      <FieldSelector
        nodeType={nodeType}
        value={template.statusField}
        onChange={(v) => updateField('statusField', v || undefined)}
        label="Status Badge Field (optional)"
        placeholder="None"
        allowClear={true}
        filterKinds={['enum', 'string']}
        includeBuiltIn={true}
        disabled={disabled}
      />

      {/* Body Fields */}
      <MultiFieldSelector
        nodeType={nodeType}
        value={template.bodyFields || []}
        onChange={(v) => updateField('bodyFields', v)}
        label="Body Fields (shown in card body)"
        placeholder="No additional fields"
        disabled={disabled}
      />

      {/* Show Inline Children */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={template.showInlineChildren || false}
          onChange={(e) => updateField('showInlineChildren', e.target.checked)}
          disabled={disabled}
          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="text-sm text-gray-700">Show inline children</span>
      </label>

      {/* Status Colors */}
      {nodeType.states?.enabled && (
        <StatusColorEditor
          nodeType={nodeType}
          value={template.statusColors}
          onChange={(colors) => updateField('statusColors', colors)}
          label="Status Badge Colors"
          disabled={disabled}
        />
      )}
    </div>
  );
}
