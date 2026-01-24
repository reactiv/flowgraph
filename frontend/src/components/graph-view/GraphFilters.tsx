'use client';

import type { NodeType, EdgeType } from '@/types/workflow';
import { getNodeTypeColor, getEdgeColor } from './utils/colorUtils';

interface GraphFiltersProps {
  nodeTypes: NodeType[];
  edgeTypes: EdgeType[];
  visibleNodeTypes: Set<string>;
  visibleEdgeTypes: Set<string>;
  onNodeTypeToggle: (type: string) => void;
  onEdgeTypeToggle: (type: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
}

/**
 * Filter controls for node and edge types in the graph view.
 */
export function GraphFilters({
  nodeTypes,
  edgeTypes,
  visibleNodeTypes,
  visibleEdgeTypes,
  onNodeTypeToggle,
  onEdgeTypeToggle,
  onSelectAll,
  onClearAll,
}: GraphFiltersProps) {
  return (
    <div className="space-y-6">
      {/* Quick actions */}
      <div className="flex gap-2">
        <button
          onClick={onSelectAll}
          className="flex-1 px-2 py-1 text-xs font-medium text-foreground bg-muted rounded hover:bg-muted/80 transition-colors"
        >
          Select All
        </button>
        <button
          onClick={onClearAll}
          className="flex-1 px-2 py-1 text-xs font-medium text-foreground bg-muted rounded hover:bg-muted/80 transition-colors"
        >
          Clear All
        </button>
      </div>

      {/* Node Types */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-2">Node Types</h3>
        <div className="space-y-1">
          {nodeTypes.map((nodeType) => {
            const isVisible = visibleNodeTypes.has(nodeType.type);
            const color = getNodeTypeColor(nodeType.type);

            return (
              <label
                key={nodeType.type}
                className="flex items-center gap-2 cursor-pointer group"
              >
                <input
                  type="checkbox"
                  checked={isVisible}
                  onChange={() => onNodeTypeToggle(nodeType.type)}
                  className="rounded border-border text-primary focus:ring-primary"
                />
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span
                  className={`text-sm ${isVisible ? 'text-foreground' : 'text-muted-foreground'} group-hover:text-foreground`}
                >
                  {nodeType.displayName}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Edge Types */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-2">Edge Types</h3>
        <div className="space-y-1">
          {edgeTypes.map((edgeType) => {
            const isVisible = visibleEdgeTypes.has(edgeType.type);
            const color = getEdgeColor(edgeType.type);

            return (
              <label
                key={edgeType.type}
                className="flex items-center gap-2 cursor-pointer group"
              >
                <input
                  type="checkbox"
                  checked={isVisible}
                  onChange={() => onEdgeTypeToggle(edgeType.type)}
                  className="rounded border-border text-primary focus:ring-primary"
                />
                <span
                  className="w-3 h-0.5 flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span
                  className={`text-sm ${isVisible ? 'text-foreground' : 'text-muted-foreground'} group-hover:text-foreground truncate`}
                  title={edgeType.displayName}
                >
                  {edgeType.displayName}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Stats */}
      <div className="pt-4 border-t border-border text-xs text-muted-foreground">
        <p>{visibleNodeTypes.size} of {nodeTypes.length} node types</p>
        <p>{visibleEdgeTypes.size} of {edgeTypes.length} edge types</p>
      </div>
    </div>
  );
}
