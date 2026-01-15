'use client';

import type { Node } from '@/types/workflow';
import type { CardsConfig } from '@/types/view-templates';
import { NodeCard } from '../cards/NodeCard';

interface CardsViewProps {
  nodes: Node[];
  config: CardsConfig;
  onNodeClick?: (node: Node) => void;
  onStatusChange?: (nodeId: string, newStatus: string) => Promise<void>;
}

/**
 * CardsView component renders nodes in different card layouts:
 * - grid: Responsive grid of cards
 * - list: Vertical list of cards
 * - single: Full-width single card focus (shows first node)
 * - inline-chips: Compact inline chip display
 */
export function CardsView({ nodes, config, onNodeClick, onStatusChange: _onStatusChange }: CardsViewProps) {
  const { layout, columns, cardTemplate } = config;

  // Get grid columns class based on config
  const getGridColumnsClass = () => {
    if (columns) {
      // Map specific column counts to Tailwind classes
      const columnClasses: Record<number, string> = {
        1: 'grid-cols-1',
        2: 'grid-cols-1 sm:grid-cols-2',
        3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
        4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
        5: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
        6: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6',
      };
      return columnClasses[columns] || 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
    }
    // Default responsive grid
    return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
  };

  // Render grid layout
  if (layout === 'grid') {
    return (
      <div className="p-4">
        <div className={`grid gap-4 ${getGridColumnsClass()}`}>
          {nodes.map((node) => (
            <NodeCard
              key={node.id}
              node={node}
              cardTemplate={cardTemplate}
              onClick={() => onNodeClick?.(node)}
            />
          ))}
        </div>
        {nodes.length === 0 && (
          <div className="flex h-48 items-center justify-center rounded-lg border-2 border-dashed border-gray-200 text-gray-400">
            No items to display
          </div>
        )}
      </div>
    );
  }

  // Render list layout
  if (layout === 'list') {
    return (
      <div className="p-4">
        <div className="mx-auto max-w-3xl space-y-3">
          {nodes.map((node) => (
            <NodeCard
              key={node.id}
              node={node}
              cardTemplate={cardTemplate}
              onClick={() => onNodeClick?.(node)}
            />
          ))}
        </div>
        {nodes.length === 0 && (
          <div className="flex h-48 items-center justify-center rounded-lg border-2 border-dashed border-gray-200 text-gray-400">
            No items to display
          </div>
        )}
      </div>
    );
  }

  // Render single card layout (focus on first node)
  if (layout === 'single') {
    const focusedNode = nodes[0];

    if (!focusedNode) {
      return (
        <div className="flex h-64 items-center justify-center p-4">
          <div className="rounded-lg border-2 border-dashed border-gray-200 p-12 text-gray-400">
            No item selected
          </div>
        </div>
      );
    }

    // Get title and subtitle using cardTemplate or fallbacks
    const title = cardTemplate?.titleField
      ? (focusedNode.properties[cardTemplate.titleField] as string) || focusedNode.title
      : focusedNode.title;

    const subtitle = cardTemplate?.subtitleField
      ? (focusedNode.properties[cardTemplate.subtitleField] as string)
      : null;

    const bodyFields = cardTemplate?.bodyFields || [];
    const status = cardTemplate?.statusField
      ? (focusedNode.properties[cardTemplate.statusField] as string) || focusedNode.status
      : focusedNode.status;

    return (
      <div className="p-4">
        <div
          className="mx-auto max-w-2xl cursor-pointer rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
          onClick={() => onNodeClick?.(focusedNode)}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
              {subtitle && <p className="mt-1 text-gray-500">{subtitle}</p>}
            </div>
            {status && (
              <span className="inline-flex shrink-0 items-center rounded-full border bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
                {status}
              </span>
            )}
          </div>

          {bodyFields.length > 0 && (
            <div className="mt-4 space-y-2 border-t border-gray-100 pt-4">
              {bodyFields.map((field) => {
                const value = focusedNode.properties[field];
                if (value === undefined || value === null) return null;
                return (
                  <p key={field} className="text-gray-600">
                    <span className="font-medium capitalize text-gray-700">
                      {field.replace(/_/g, ' ')}:
                    </span>{' '}
                    {String(value)}
                  </p>
                );
              })}
            </div>
          )}

          <div className="mt-4 border-t border-gray-100 pt-4 text-xs text-gray-400">
            ID: {focusedNode.id} | Type: {focusedNode.type}
          </div>
        </div>

        {/* Show count of other items if there are more */}
        {nodes.length > 1 && (
          <p className="mt-4 text-center text-sm text-gray-400">
            Showing 1 of {nodes.length} items
          </p>
        )}
      </div>
    );
  }

  // Render inline-chips layout
  if (layout === 'inline-chips') {
    return (
      <div className="p-4">
        <div className="flex flex-wrap gap-2">
          {nodes.map((node) => {
            // Get title using cardTemplate or fallback
            const chipTitle = cardTemplate?.titleField
              ? (node.properties[cardTemplate.titleField] as string) || node.title
              : node.title;

            const status = cardTemplate?.statusField
              ? (node.properties[cardTemplate.statusField] as string) || node.status
              : node.status;

            return (
              <button
                key={node.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition-all hover:border-gray-300 hover:bg-gray-50 hover:shadow"
                onClick={() => onNodeClick?.(node)}
              >
                <span className="max-w-[200px] truncate">{chipTitle}</span>
                {status && (
                  <span className="inline-flex h-2 w-2 shrink-0 rounded-full bg-slate-400" title={status} />
                )}
              </button>
            );
          })}
        </div>
        {nodes.length === 0 && (
          <div className="flex h-16 items-center justify-center text-gray-400">
            No items to display
          </div>
        )}
      </div>
    );
  }

  // Fallback for unknown layout
  return (
    <div className="flex h-64 items-center justify-center p-4">
      <div className="text-red-500">Unknown cards layout: {layout}</div>
    </div>
  );
}
