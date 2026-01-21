'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ReactFlowProvider } from '@xyflow/react';
import { api } from '@/lib/api';
import type { Node as WorkflowNode, Edge, WorkflowDefinition } from '@/types/workflow';
import { GraphCanvas } from './GraphCanvas';
import { GraphControls } from './GraphControls';
import { GraphFilters } from './GraphFilters';
import { GraphFocalFilter } from './GraphFocalFilter';
import type { LayoutType } from './utils/layoutUtils';

interface GraphViewProps {
  workflowId: string;
  workflowDefinition: WorkflowDefinition;
  onNodeClick?: (node: WorkflowNode) => void;
  // URL state props for focal node filtering
  initialFocalNodeId?: string | null;
  initialHopCount?: number;
  onFocalNodeChange?: (nodeId: string | null) => void;
  onHopCountChange?: (hops: number) => void;
}

/**
 * Find all nodes within N hops of a focal node using BFS.
 */
function findNodesWithinHops(
  focalNodeId: string,
  allEdges: Edge[],
  maxHops: number
): Set<string> {
  const nodeIds = new Set<string>([focalNodeId]);
  const visited = new Set<string>([focalNodeId]);
  let frontier = [focalNodeId];

  // Build adjacency list for faster traversal
  const adjacency = new Map<string, string[]>();
  for (const edge of allEdges) {
    // Add both directions for undirected traversal
    if (!adjacency.has(edge.from_node_id)) {
      adjacency.set(edge.from_node_id, []);
    }
    if (!adjacency.has(edge.to_node_id)) {
      adjacency.set(edge.to_node_id, []);
    }
    adjacency.get(edge.from_node_id)!.push(edge.to_node_id);
    adjacency.get(edge.to_node_id)!.push(edge.from_node_id);
  }

  // BFS for maxHops iterations
  for (let hop = 0; hop < maxHops; hop++) {
    const nextFrontier: string[] = [];
    for (const nodeId of frontier) {
      const neighbors = adjacency.get(nodeId) || [];
      for (const neighborId of neighbors) {
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          nodeIds.add(neighborId);
          nextFrontier.push(neighborId);
        }
      }
    }
    frontier = nextFrontier;
    if (frontier.length === 0) break; // No more nodes to explore
  }

  return nodeIds;
}

/**
 * Main Graph View component that visualizes all workflow nodes and their connections.
 */
export function GraphView({
  workflowId,
  workflowDefinition,
  onNodeClick,
  initialFocalNodeId,
  initialHopCount = 2,
  onFocalNodeChange,
  onHopCountChange,
}: GraphViewProps) {
  const [layout, setLayout] = useState<LayoutType>('force');
  const [visibleNodeTypes, setVisibleNodeTypes] = useState<Set<string>>(
    () => new Set(workflowDefinition.nodeTypes.map((nt) => nt.type))
  );
  const [visibleEdgeTypes, setVisibleEdgeTypes] = useState<Set<string>>(
    () => new Set(workflowDefinition.edgeTypes.map((et) => et.type))
  );

  // Focal node filtering state
  const [focalNodeId, setFocalNodeId] = useState<string | null>(initialFocalNodeId ?? null);
  const [hopCount, setHopCount] = useState<number>(initialHopCount);

  // Sync with URL state when initial values change
  useEffect(() => {
    setFocalNodeId(initialFocalNodeId ?? null);
  }, [initialFocalNodeId]);

  useEffect(() => {
    if (initialHopCount !== undefined) {
      setHopCount(initialHopCount);
    }
  }, [initialHopCount]);

  // Handle focal node change
  const handleFocalNodeChange = useCallback((nodeId: string | null) => {
    setFocalNodeId(nodeId);
    onFocalNodeChange?.(nodeId);
  }, [onFocalNodeChange]);

  // Handle hop count change
  const handleHopCountChange = useCallback((hops: number) => {
    setHopCount(hops);
    onHopCountChange?.(hops);
  }, [onHopCountChange]);

  // Fetch all nodes
  const { data: nodesResponse, isLoading: nodesLoading } = useQuery({
    queryKey: ['nodes', workflowId, 'all'],
    queryFn: () => api.listNodes(workflowId, { limit: 1000 }),
  });

  // Fetch all edges
  const { data: edgesResponse, isLoading: edgesLoading } = useQuery({
    queryKey: ['edges', workflowId, 'all'],
    queryFn: () => api.listEdges(workflowId, { limit: 5000 }),
  });

  // Filter nodes/edges based on visibility and focal node
  const filteredData = useMemo(() => {
    const allNodes = nodesResponse?.nodes || [];
    const allEdges = edgesResponse?.edges || [];

    // First, filter by node/edge types
    let nodes = allNodes.filter((n) => visibleNodeTypes.has(n.type));

    // Then, if a focal node is selected, filter to only nodes within N hops
    if (focalNodeId) {
      // Make sure to include all edges for BFS (not just visible edge types)
      const nodesWithinHops = findNodesWithinHops(focalNodeId, allEdges, hopCount);
      nodes = nodes.filter((n) => nodesWithinHops.has(n.id));
    }

    const nodeIds = new Set(nodes.map((n) => n.id));
    const edges = allEdges.filter(
      (e) =>
        visibleEdgeTypes.has(e.type) &&
        nodeIds.has(e.from_node_id) &&
        nodeIds.has(e.to_node_id)
    );
    return { nodes, edges };
  }, [nodesResponse, edgesResponse, visibleNodeTypes, visibleEdgeTypes, focalNodeId, hopCount]);

  // Handlers
  const handleNodeTypeToggle = useCallback((type: string) => {
    setVisibleNodeTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  const handleEdgeTypeToggle = useCallback((type: string) => {
    setVisibleEdgeTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setVisibleNodeTypes(
      new Set(workflowDefinition.nodeTypes.map((nt) => nt.type))
    );
    setVisibleEdgeTypes(
      new Set(workflowDefinition.edgeTypes.map((et) => et.type))
    );
  }, [workflowDefinition]);

  const handleClearAll = useCallback(() => {
    setVisibleNodeTypes(new Set());
    setVisibleEdgeTypes(new Set());
  }, []);

  if (nodesLoading || edgesLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-300 border-t-blue-600 mb-3" />
          <p className="text-gray-600">Loading graph...</p>
        </div>
      </div>
    );
  }

  const totalNodes = nodesResponse?.nodes?.length || 0;

  if (totalNodes === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-200 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-1">No data yet</h3>
          <p className="text-gray-500 text-sm">
            Seed this workflow with demo data to see the graph visualization.
          </p>
        </div>
      </div>
    );
  }

  // Get all nodes for focal filter dropdown
  const allNodes = nodesResponse?.nodes || [];

  return (
    <div className="flex h-full">
      {/* Sidebar with filters */}
      <div className="w-56 border-r bg-gray-50 p-4 overflow-auto flex-shrink-0">
        {/* Focal Node Filter */}
        <div className="mb-6">
          <GraphFocalFilter
            nodes={allNodes}
            focalNodeId={focalNodeId}
            hopCount={hopCount}
            onFocalNodeChange={handleFocalNodeChange}
            onHopCountChange={handleHopCountChange}
          />
        </div>

        {/* Divider */}
        <hr className="mb-4 border-gray-200" />

        {/* Type Filters */}
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Type Filters</h2>
        <GraphFilters
          nodeTypes={workflowDefinition.nodeTypes}
          edgeTypes={workflowDefinition.edgeTypes}
          visibleNodeTypes={visibleNodeTypes}
          visibleEdgeTypes={visibleEdgeTypes}
          onNodeTypeToggle={handleNodeTypeToggle}
          onEdgeTypeToggle={handleEdgeTypeToggle}
          onSelectAll={handleSelectAll}
          onClearAll={handleClearAll}
        />
      </div>

      {/* Main canvas */}
      <div className="flex-1 relative">
        <GraphControls
          layout={layout}
          onLayoutChange={setLayout}
          nodeCount={filteredData.nodes.length}
          edgeCount={filteredData.edges.length}
        />
        <ReactFlowProvider>
          <GraphCanvas
            workflowNodes={filteredData.nodes}
            workflowEdges={filteredData.edges}
            workflowDefinition={workflowDefinition}
            layout={layout}
            onNodeClick={onNodeClick}
          />
        </ReactFlowProvider>
      </div>
    </div>
  );
}
