'use client';

import { ChevronRight } from 'lucide-react';
import type { Node } from '@/types/workflow';

interface RelationshipCardProps {
  node: Node;
  onClick: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  Draft: 'bg-muted text-muted-foreground',
  'In Progress': 'bg-blue-500/20 text-blue-400',
  Complete: 'bg-green-500/20 text-green-400',
  Archived: 'bg-purple-500/20 text-purple-400',
  Failed: 'bg-red-500/20 text-red-400',
  Pending: 'bg-yellow-500/20 text-yellow-400',
  Active: 'bg-blue-500/20 text-blue-400',
  Validated: 'bg-green-500/20 text-green-400',
  Rejected: 'bg-red-500/20 text-red-400',
  Dismissed: 'bg-muted text-muted-foreground',
  Proposed: 'bg-yellow-500/20 text-yellow-400',
  Deprecated: 'bg-orange-500/20 text-orange-400',
  Running: 'bg-blue-500/20 text-blue-400',
  Open: 'bg-yellow-500/20 text-yellow-400',
  Closed: 'bg-muted text-muted-foreground',
};

export function RelationshipCard({ node, onClick }: RelationshipCardProps) {
  const statusColorClass = node.status
    ? STATUS_COLORS[node.status] || 'bg-muted text-muted-foreground'
    : 'bg-muted text-muted-foreground';

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-3 rounded-lg border border-border bg-card hover:border-primary/50 hover:bg-muted transition-colors group"
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          {/* Title */}
          <div className="font-medium text-sm text-foreground truncate">
            {node.title}
          </div>

          {/* Type and status */}
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-muted-foreground">{node.type}</span>
            {node.status && (
              <span
                className={`inline-block px-1.5 py-0.5 text-xs font-medium rounded ${statusColorClass}`}
              >
                {node.status}
              </span>
            )}
          </div>
        </div>

        {/* Arrow */}
        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground flex-shrink-0 ml-2" />
      </div>
    </button>
  );
}
