'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeType } from '@/types/workflow';

interface NodeTypeCardProps {
  data: {
    nodeType: NodeType;
  };
}

/**
 * Custom React Flow node component for displaying a NodeType in the schema graph.
 */
export const NodeTypeCard = memo(function NodeTypeCard({
  data,
}: NodeTypeCardProps) {
  const { nodeType } = data;

  // Get field count and state count for display
  const fieldCount = nodeType.fields?.length ?? 0;
  const stateCount = nodeType.states?.values?.length ?? 0;

  return (
    <div className="min-w-[200px] rounded-lg border border-slate-200 bg-white p-4 shadow-md">
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-slate-400 !w-3 !h-3"
      />

      {/* Header */}
      <div className="mb-2">
        <div className="font-semibold text-slate-900">{nodeType.displayName}</div>
        <div className="text-xs text-slate-500">
          {fieldCount} field{fieldCount !== 1 ? 's' : ''}
          {stateCount > 0 && ` \u2022 ${stateCount} states`}
        </div>
      </div>

      {/* Field preview */}
      <div className="space-y-1 text-xs text-slate-600">
        {nodeType.fields?.slice(0, 4).map((field) => (
          <div key={field.key} className="flex items-center gap-2 truncate">
            <span className="font-medium text-slate-700">{field.label}</span>
            <span className="text-slate-400">({field.kind})</span>
          </div>
        ))}
        {fieldCount > 4 && (
          <div className="text-slate-400">+{fieldCount - 4} more fields</div>
        )}
      </div>

      {/* States preview */}
      {nodeType.states && nodeType.states.enabled && (
        <div className="mt-3 pt-2 border-t border-slate-100">
          <div className="text-xs font-medium text-slate-500 mb-1">States:</div>
          <div className="flex flex-wrap gap-1">
            {nodeType.states.values.slice(0, 4).map((state) => (
              <span
                key={state}
                className="px-1.5 py-0.5 text-xs rounded bg-slate-100 text-slate-600"
              >
                {state}
              </span>
            ))}
            {stateCount > 4 && (
              <span className="px-1.5 py-0.5 text-xs text-slate-400">
                +{stateCount - 4}
              </span>
            )}
          </div>
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-slate-400 !w-3 !h-3"
      />
    </div>
  );
});
