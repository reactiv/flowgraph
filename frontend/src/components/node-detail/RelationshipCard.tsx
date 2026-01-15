'use client';

import { ChevronRight } from 'lucide-react';
import type { Node } from '@/types/workflow';

interface RelationshipCardProps {
  node: Node;
  onClick: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  Draft: 'bg-gray-100 text-gray-700',
  'In Progress': 'bg-blue-100 text-blue-700',
  Complete: 'bg-green-100 text-green-700',
  Archived: 'bg-purple-100 text-purple-700',
  Failed: 'bg-red-100 text-red-700',
  Pending: 'bg-yellow-100 text-yellow-700',
  Active: 'bg-blue-100 text-blue-700',
  Validated: 'bg-green-100 text-green-700',
  Rejected: 'bg-red-100 text-red-700',
  Dismissed: 'bg-gray-100 text-gray-700',
  Proposed: 'bg-yellow-100 text-yellow-700',
  Deprecated: 'bg-orange-100 text-orange-700',
  Running: 'bg-blue-100 text-blue-700',
  Open: 'bg-yellow-100 text-yellow-700',
  Closed: 'bg-gray-100 text-gray-700',
};

export function RelationshipCard({ node, onClick }: RelationshipCardProps) {
  const statusColorClass = node.status
    ? STATUS_COLORS[node.status] || 'bg-gray-100 text-gray-700'
    : 'bg-gray-100 text-gray-700';

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors group"
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          {/* Title */}
          <div className="font-medium text-sm text-gray-900 truncate">
            {node.title}
          </div>

          {/* Type and status */}
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-gray-500">{node.type}</span>
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
        <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-gray-600 flex-shrink-0 ml-2" />
      </div>
    </button>
  );
}
