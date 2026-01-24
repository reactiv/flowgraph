'use client';

import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import type { Node, NodeType } from '@/types/workflow';
import type {
  LevelConfig,
  LevelData,
  KanbanConfig,
  CardsConfig,
  TableConfig,
} from '@/types/view-templates';
import { KanbanView } from '../KanbanView';
import { CardsView } from '../CardsView';
import { TableView } from '../TableView';

interface RecordRelatedSectionProps {
  title: string;
  description?: string;
  levelData?: LevelData;
  levelConfig?: LevelConfig;
  targetNodeType?: NodeType;
  parentNode: Node;
  displayNested?: boolean;
  collapsedByDefault?: boolean;
  maxItems?: number;
  emptyMessage?: string;
  allowCreate?: boolean;
  onNodeClick?: (node: Node) => void;
  onCreateNode?: (nodeType: string, parentNodeId: string) => void;
}

export function RecordRelatedSection({
  title,
  description,
  levelData,
  levelConfig,
  targetNodeType,
  parentNode,
  displayNested,
  collapsedByDefault,
  maxItems,
  emptyMessage,
  allowCreate,
  onNodeClick,
  onCreateNode,
}: RecordRelatedSectionProps) {
  const [isExpanded, setIsExpanded] = useState(!collapsedByDefault);

  // Memoize derived values to ensure stable references
  const nodes = useMemo(() => levelData?.nodes || [], [levelData?.nodes]);
  const parentMap = useMemo(() => levelData?.parent_map || {}, [levelData?.parent_map]);
  const count = levelData?.count ?? nodes.length;

  // Group nodes by parent if displayNested is true
  const groupedNodes = useMemo(() => {
    if (!displayNested || Object.keys(parentMap).length === 0) {
      return null;
    }

    // Group by parent ID
    const groups: Record<string, Node[]> = {};
    for (const node of nodes) {
      const parentId = parentMap[node.id];
      if (parentId) {
        if (!groups[parentId]) {
          groups[parentId] = [];
        }
        groups[parentId].push(node);
      } else {
        // No parent found, put in a default group
        if (!groups['__ungrouped__']) {
          groups['__ungrouped__'] = [];
        }
        groups['__ungrouped__'].push(node);
      }
    }
    return groups;
  }, [nodes, parentMap, displayNested]);

  // Apply maxItems limit
  const displayNodes = maxItems ? nodes.slice(0, maxItems) : nodes;
  const hasMore = maxItems && nodes.length > maxItems;

  // Render section content based on view style
  const renderContent = () => {
    if (nodes.length === 0) {
      return (
        <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
          {emptyMessage || `No ${title.toLowerCase()} yet`}
        </div>
      );
    }

    // If nested display and we have groups, render grouped
    if (groupedNodes) {
      return (
        <div className="space-y-4">
          {Object.entries(groupedNodes).map(([parentId, groupNodes]) => {
            // Find the parent node title for display
            const parentTitle =
              parentId === '__ungrouped__'
                ? 'Other'
                : `Parent: ${parentId.slice(0, 8)}...`;

            return (
              <div key={parentId} className="rounded-lg bg-muted p-3">
                <h4 className="mb-2 text-sm font-medium text-foreground">{parentTitle}</h4>
                {renderViewStyle(groupNodes)}
              </div>
            );
          })}
        </div>
      );
    }

    return renderViewStyle(displayNodes);
  };

  // Render the appropriate view style
  const renderViewStyle = (nodesToRender: Node[]) => {
    if (!levelConfig) {
      // Default to simple cards if no config
      return (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {nodesToRender.map((node) => (
            <button
              key={node.id}
              onClick={() => onNodeClick?.(node)}
              className="rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-muted-foreground hover:bg-muted"
            >
              <div className="font-medium text-foreground truncate">{node.title}</div>
              {node.status && (
                <div className="mt-1 text-xs text-muted-foreground">{node.status}</div>
              )}
            </button>
          ))}
        </div>
      );
    }

    switch (levelConfig.style) {
      case 'kanban':
        return (
          <div className="max-h-80 overflow-auto">
            <KanbanView
              nodes={nodesToRender}
              config={levelConfig.styleConfig as KanbanConfig}
              onNodeClick={onNodeClick}
            />
          </div>
        );

      case 'cards':
        return (
          <CardsView
            nodes={nodesToRender}
            config={levelConfig.styleConfig as CardsConfig}
            onNodeClick={onNodeClick}
          />
        );

      case 'table':
        return (
          <TableView
            nodes={nodesToRender}
            config={levelConfig.styleConfig as TableConfig}
            onNodeClick={onNodeClick}
          />
        );

      default:
        // Fallback to simple list
        return (
          <div className="divide-y divide-border">
            {nodesToRender.map((node) => (
              <button
                key={node.id}
                onClick={() => onNodeClick?.(node)}
                className="flex w-full items-center justify-between px-2 py-2 text-left transition-colors hover:bg-muted"
              >
                <span className="font-medium text-foreground">{node.title}</span>
                {node.status && (
                  <span className="text-xs text-muted-foreground">{node.status}</span>
                )}
              </button>
            ))}
          </div>
        );
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Section Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <h3 className="font-medium text-foreground">{title}</h3>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {count}
          </span>
        </div>
        {allowCreate && onCreateNode && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCreateNode(targetNodeType?.type || '', parentNode.id);
            }}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </button>

      {/* Section Description */}
      {description && isExpanded && (
        <div className="border-t border-border px-4 py-2">
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      )}

      {/* Section Content */}
      {isExpanded && (
        <div className="border-t border-border p-4">
          {renderContent()}
          {hasMore && (
            <div className="mt-3 text-center text-sm text-muted-foreground">
              Showing {maxItems} of {nodes.length} items
            </div>
          )}
        </div>
      )}
    </div>
  );
}
