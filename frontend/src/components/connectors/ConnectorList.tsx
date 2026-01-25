'use client';

import type { ConnectorSummary } from '@/types/connector';
import { getStatusColor, getTypeLabel } from '@/types/connector';

interface ConnectorListProps {
  connectors: ConnectorSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onEdit: (connector: ConnectorSummary) => void;
  onDelete: (id: string) => void;
}

export function ConnectorList({
  connectors,
  selectedId,
  onSelect,
  onEdit,
  onDelete,
}: ConnectorListProps) {
  return (
    <div className="space-y-2">
      {connectors.map((connector) => (
        <div
          key={connector.id}
          className={`
            rounded-lg border p-3 cursor-pointer transition-all
            ${selectedId === connector.id
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/50 hover:bg-muted/50'
            }
          `}
          onClick={() => onSelect(connector.id)}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-sm truncate">{connector.name}</h3>
                <span className={`text-xs px-1.5 py-0.5 rounded ${getStatusColor(connector.status)}`}>
                  {connector.status}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                {connector.system}
              </p>
              {connector.description && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {connector.description}
                </p>
              )}
            </div>
            <div className="flex-shrink-0">
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(connector);
                  }}
                  className="p-1 hover:bg-muted rounded"
                  title="Edit connector"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                  </svg>
                </button>
                {connector.connector_type !== 'builtin' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(connector.id);
                    }}
                    className="p-1 hover:bg-destructive/10 hover:text-destructive rounded"
                    title="Delete connector"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Tags row */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            <span className="text-xs px-1.5 py-0.5 bg-muted rounded">
              {getTypeLabel(connector.connector_type)}
            </span>
            {connector.is_configured ? (
              <span className="text-xs px-1.5 py-0.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded">
                Configured
              </span>
            ) : (
              <span className="text-xs px-1.5 py-0.5 bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded">
                Needs Setup
              </span>
            )}
            {connector.has_learned && (
              <span className="text-xs px-1.5 py-0.5 bg-purple-500/15 text-purple-400 border border-purple-500/30 rounded">
                Learned
              </span>
            )}
            {connector.supported_types.length > 0 && (
              <span className="text-xs px-1.5 py-0.5 bg-blue-500/15 text-blue-400 border border-blue-500/30 rounded">
                {connector.supported_types.join(', ')}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
