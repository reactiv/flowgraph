'use client';

import { X } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import type { Node, NodeType } from '@/types/workflow';
import { StatusDropdown } from './StatusDropdown';

interface NodeDetailHeaderProps {
  node: Node;
  nodeType: NodeType;
  onClose: () => void;
  onStatusChange: (status: string) => void;
  isUpdating: boolean;
}

export function NodeDetailHeader({
  node,
  nodeType,
  onClose,
  onStatusChange,
  isUpdating,
}: NodeDetailHeaderProps) {
  const author = node.properties?.author as string | undefined;

  return (
    <div className="border-b border-border p-4">
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 hover:bg-muted rounded-md transition-colors"
        aria-label="Close"
      >
        <X className="h-5 w-5 text-muted-foreground" />
      </button>

      {/* Title */}
      <h2
        id="node-detail-title"
        className="text-xl font-semibold text-foreground pr-12"
      >
        {node.title}
      </h2>

      {/* Type badge and status */}
      <div className="flex items-center gap-3 mt-2">
        {/* Type badge */}
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-foreground">
          {nodeType.displayName}
        </span>

        {/* Status dropdown */}
        {nodeType.states && node.status && (
          <StatusDropdown
            currentStatus={node.status}
            states={nodeType.states}
            onChange={onStatusChange}
            disabled={isUpdating}
          />
        )}
      </div>

      {/* Metadata row */}
      <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
        {author && (
          <span>
            By <span className="font-medium text-foreground">{author}</span>
          </span>
        )}
        <span title={`Created: ${formatDateTime(node.created_at)}`}>
          Created {formatDateTime(node.created_at)}
        </span>
        {node.updated_at !== node.created_at && (
          <span title={`Updated: ${formatDateTime(node.updated_at)}`}>
            Updated {formatDateTime(node.updated_at)}
          </span>
        )}
      </div>
    </div>
  );
}
