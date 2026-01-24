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
        min-w-[180px] max-w-[220px] rounded-lg border-2 bg-card shadow-lg
        transition-all duration-200 cursor-pointer
        ${selected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : 'hover:shadow-xl hover:border-primary/50'}
      `}
      style={{ borderColor: selected ? undefined : typeColor }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-muted-foreground !w-2 !h-2 !border-card !border-2"
      />

      {/* Type badge header */}
      <div
        className="px-3 py-1.5 text-xs font-medium rounded-t-[6px] text-background"
        style={{
          backgroundColor: typeColor,
        }}
      >
        {nodeType.displayName}
      </div>

      {/* Content */}
      <div className="p-3">
        <div className="font-semibold text-sm text-foreground truncate" title={workflowNode.title}>
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
        className="!bg-muted-foreground !w-2 !h-2 !border-card !border-2"
      />
    </div>
  );
});
