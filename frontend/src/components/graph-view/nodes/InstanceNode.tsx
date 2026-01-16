'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { getNodeTypeColor, getStatusColor, hexToRgba } from '../utils/colorUtils';
import type { InstanceNodeData } from '../utils/layoutUtils';

interface InstanceNodeProps {
  data: InstanceNodeData;
  selected?: boolean;
}

/**
 * Custom React Flow node for rendering workflow instance nodes.
 */
export const InstanceNode = memo(function InstanceNode({
  data,
  selected,
}: InstanceNodeProps) {
  const { workflowNode, nodeType } = data;
  const typeColor = getNodeTypeColor(workflowNode.type);
  const statusColor = getStatusColor(workflowNode.status);

  return (
    <div
      className={`
        min-w-[180px] max-w-[220px] rounded-lg border-2 bg-white shadow-md
        transition-all duration-200 cursor-pointer
        ${selected ? 'ring-2 ring-blue-500 ring-offset-2' : 'hover:shadow-lg'}
      `}
      style={{ borderColor: typeColor }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-gray-400 !w-2 !h-2 !border-white !border-2"
      />

      {/* Type badge header */}
      <div
        className="px-3 py-1.5 text-xs font-medium text-white rounded-t-[6px]"
        style={{ backgroundColor: typeColor }}
      >
        {nodeType.displayName}
      </div>

      {/* Content */}
      <div className="p-3">
        <div className="font-semibold text-sm text-gray-900 truncate" title={workflowNode.title}>
          {workflowNode.title}
        </div>

        {/* Status badge */}
        {workflowNode.status && (
          <span
            className="mt-2 inline-block px-2 py-0.5 text-xs rounded-full font-medium"
            style={{
              backgroundColor: hexToRgba(statusColor, 0.15),
              color: statusColor,
              border: `1px solid ${hexToRgba(statusColor, 0.3)}`,
            }}
          >
            {workflowNode.status}
          </span>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-gray-400 !w-2 !h-2 !border-white !border-2"
      />
    </div>
  );
});
