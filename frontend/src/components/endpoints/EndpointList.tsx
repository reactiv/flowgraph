'use client';

import { cn } from '@/lib/utils';
import type { Endpoint, HttpMethod } from '@/types/endpoint';
import { api } from '@/lib/api';

interface EndpointListProps {
  endpoints: Endpoint[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onEdit: (endpoint: Endpoint) => void;
  onDelete: (id: string) => void;
  workflowId: string;
}

const methodColors: Record<HttpMethod, string> = {
  GET: 'bg-green-100 text-green-700 border-green-200',
  POST: 'bg-blue-100 text-blue-700 border-blue-200',
  PUT: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  DELETE: 'bg-red-100 text-red-700 border-red-200',
};

export function EndpointList({
  endpoints,
  selectedId,
  onSelect,
  onEdit,
  onDelete,
  workflowId,
}: EndpointListProps) {
  return (
    <div className="space-y-2">
      {endpoints.map((endpoint) => (
        <div
          key={endpoint.id}
          onClick={() => onSelect(endpoint.id)}
          className={cn(
            'p-3 rounded-lg cursor-pointer transition-colors border',
            selectedId === endpoint.id
              ? 'bg-primary/10 border-primary/30'
              : 'bg-white hover:bg-muted/50 border-transparent'
          )}
        >
          <div className="flex items-start gap-2">
            <span
              className={cn(
                'text-xs font-mono font-medium px-1.5 py-0.5 rounded border',
                methodColors[endpoint.httpMethod]
              )}
            >
              {endpoint.httpMethod}
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">{endpoint.name}</div>
              <div className="text-xs text-muted-foreground font-mono truncate">
                /{endpoint.slug}
              </div>
            </div>
          </div>

          {endpoint.description && (
            <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
              {endpoint.description}
            </p>
          )}

          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            {endpoint.isLearned ? (
              <span className="flex items-center gap-1 text-green-600">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                Learned
              </span>
            ) : (
              <span className="flex items-center gap-1 text-amber-600">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Not learned
              </span>
            )}
            {endpoint.executionCount > 0 && (
              <span>{endpoint.executionCount} calls</span>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 mt-2 pt-2 border-t">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit(endpoint);
              }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Edit
            </button>
            <span className="text-muted-foreground">|</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(api.getEndpointUrl(workflowId, endpoint.slug));
              }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Copy URL
            </button>
            <span className="text-muted-foreground">|</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(endpoint.id);
              }}
              className="text-xs text-destructive hover:text-destructive/80 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
