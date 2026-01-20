'use client';

import type { NodeType } from '@/types/workflow';
import type { TreeConfig } from '@/types/view-templates';
import { CardTemplateEditor } from '../CardTemplateEditor';

interface TreeEditorProps {
  nodeType: NodeType;
  config: TreeConfig;
  onChange: (config: TreeConfig) => void;
  disabled?: boolean;
}

export function TreeEditor({
  nodeType,
  config,
  onChange,
  disabled = false,
}: TreeEditorProps) {
  const updateConfig = <K extends keyof TreeConfig>(
    key: K,
    value: TreeConfig[K]
  ) => {
    onChange({
      ...config,
      [key]: value,
    });
  };

  return (
    <div className="space-y-6">
      {/* Display Options */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-gray-700">Display Options</h4>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={config.expandable !== false}
            onChange={(e) => updateConfig('expandable', e.target.checked)}
            disabled={disabled}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700">Allow expand/collapse</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={config.showDepthLines !== false}
            onChange={(e) => updateConfig('showDepthLines', e.target.checked)}
            disabled={disabled}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700">Show depth connector lines</span>
        </label>
      </div>

      {/* Card Template */}
      <CardTemplateEditor
        nodeType={nodeType}
        value={config.cardTemplate}
        onChange={(template) => updateConfig('cardTemplate', template)}
        disabled={disabled}
      />

      {/* Info about tree structure */}
      <div className="rounded-md bg-blue-50 p-3">
        <p className="text-sm text-blue-700">
          <strong>Note:</strong> Tree structure is determined by the edge traversals
          defined in the view template. The tree will show parent-child relationships
          based on the configured edges.
        </p>
      </div>
    </div>
  );
}
