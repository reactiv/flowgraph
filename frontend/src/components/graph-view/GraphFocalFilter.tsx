'use client';

import { useState, useMemo } from 'react';
import { Search, X, Target } from 'lucide-react';
import type { Node as WorkflowNode } from '@/types/workflow';

interface GraphFocalFilterProps {
  nodes: WorkflowNode[];
  focalNodeId: string | null;
  hopCount: number;
  onFocalNodeChange: (nodeId: string | null) => void;
  onHopCountChange: (hops: number) => void;
}

/**
 * Filter controls for focusing the graph on a specific node and its neighborhood.
 */
export function GraphFocalFilter({
  nodes,
  focalNodeId,
  hopCount,
  onFocalNodeChange,
  onHopCountChange,
}: GraphFocalFilterProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Filter nodes based on search query
  const filteredNodes = useMemo(() => {
    if (!searchQuery.trim()) return nodes.slice(0, 20); // Show first 20 by default
    const query = searchQuery.toLowerCase();
    return nodes
      .filter(
        (node) =>
          node.title.toLowerCase().includes(query) ||
          node.type.toLowerCase().includes(query) ||
          node.id.toLowerCase().includes(query)
      )
      .slice(0, 20); // Limit to 20 results
  }, [nodes, searchQuery]);

  // Get the selected focal node
  const focalNode = useMemo(
    () => (focalNodeId ? nodes.find((n) => n.id === focalNodeId) : null),
    [nodes, focalNodeId]
  );

  const handleNodeSelect = (nodeId: string) => {
    onFocalNodeChange(nodeId);
    setSearchQuery('');
    setIsDropdownOpen(false);
  };

  const handleClear = () => {
    onFocalNodeChange(null);
    setSearchQuery('');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Target className="w-4 h-4 text-gray-500" />
        <h3 className="text-sm font-semibold text-gray-700">Focus View</h3>
      </div>

      {/* Node Search/Selection */}
      <div className="relative">
        {focalNode ? (
          // Show selected node
          <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {focalNode.title}
              </p>
              <p className="text-xs text-gray-500 truncate">{focalNode.type}</p>
            </div>
            <button
              onClick={handleClear}
              className="p-1 text-gray-400 hover:text-gray-600 rounded"
              title="Clear focus"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          // Show search input
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search nodes..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsDropdownOpen(true);
              }}
              onFocus={() => setIsDropdownOpen(true)}
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        )}

        {/* Dropdown */}
        {isDropdownOpen && !focalNode && (
          <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-auto">
            {filteredNodes.length === 0 ? (
              <div className="p-3 text-sm text-gray-500 text-center">
                No nodes found
              </div>
            ) : (
              filteredNodes.map((node) => (
                <button
                  key={node.id}
                  onClick={() => handleNodeSelect(node.id)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                >
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {node.title}
                  </p>
                  <p className="text-xs text-gray-500">{node.type}</p>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Hop Count Slider - only show when a focal node is selected */}
      {focalNode && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm text-gray-600">Neighborhood depth</label>
            <span className="text-sm font-medium text-gray-900">
              {hopCount} {hopCount === 1 ? 'hop' : 'hops'}
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={5}
            value={hopCount}
            onChange={(e) => onHopCountChange(parseInt(e.target.value, 10))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
          <div className="flex justify-between text-xs text-gray-400">
            <span>1</span>
            <span>2</span>
            <span>3</span>
            <span>4</span>
            <span>5</span>
          </div>
        </div>
      )}

      {/* Click outside handler */}
      {isDropdownOpen && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setIsDropdownOpen(false)}
        />
      )}
    </div>
  );
}
