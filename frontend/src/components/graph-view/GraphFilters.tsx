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
          className="flex-1 px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
        >
          Select All
        </button>
        <button
          onClick={onClearAll}
          className="flex-1 px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
        >
          Clear All
        </button>
      </div>

      {/* Node Types */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Node Types</h3>
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
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span
                  className={`text-sm ${isVisible ? 'text-gray-900' : 'text-gray-400'} group-hover:text-gray-900`}
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
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Edge Types</h3>
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
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span
                  className="w-3 h-0.5 flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span
                  className={`text-sm ${isVisible ? 'text-gray-900' : 'text-gray-400'} group-hover:text-gray-900 truncate`}
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
      <div className="pt-4 border-t text-xs text-gray-500">
        <p>{visibleNodeTypes.size} of {nodeTypes.length} node types</p>
        <p>{visibleEdgeTypes.size} of {edgeTypes.length} edge types</p>
      </div>
    </div>
  );
}
