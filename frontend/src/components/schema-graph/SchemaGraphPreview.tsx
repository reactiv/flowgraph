'use client';

import { useMemo, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import type { WorkflowDefinition } from '@/types/workflow';
import { NodeTypeCard } from './NodeTypeCard';

interface SchemaGraphPreviewProps {
  definition: WorkflowDefinition;
  className?: string;
  height?: number | string;
}

// Register custom node types - using type assertion for compatibility
const nodeTypes = {
  nodeType: NodeTypeCard,
} as const;

/**
 * Calculate node positions in a circular layout.
 */
function calculatePosition(
  index: number,
  total: number
): { x: number; y: number } {
  if (total === 1) {
    return { x: 300, y: 200 };
  }

  const radius = Math.max(200, total * 50);
  const angle = (2 * Math.PI * index) / total - Math.PI / 2;

  return {
    x: 350 + radius * Math.cos(angle),
    y: 300 + radius * Math.sin(angle),
  };
}

/**
 * Generate a color for an edge based on its type.
 */
function getEdgeColor(edgeType: string): string {
  // Simple hash-based color generation
  let hash = 0;
  for (let i = 0; i < edgeType.length; i++) {
    hash = edgeType.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = hash % 360;
  return `hsl(${hue}, 60%, 60%)`;
}

/**
 * React Flow visualization of a WorkflowDefinition schema.
 * Shows node types as nodes and edge types as connections.
 */
export function SchemaGraphPreview({
  definition,
  className,
  height = 400,
}: SchemaGraphPreviewProps) {
  // Convert WorkflowDefinition to React Flow nodes and edges
  const { initialNodes, initialEdges } = useMemo(() => {
    const nodeCount = definition.nodeTypes?.length ?? 0;

    // Create nodes from nodeTypes
    const nodes: Node[] = (definition.nodeTypes ?? []).map((nodeType, index) => ({
      id: nodeType.type,
      type: 'nodeType',
      position: calculatePosition(index, nodeCount),
      data: { nodeType },
    }));

    // Create edges from edgeTypes - use dark mode compatible colors
    const edges: Edge[] = (definition.edgeTypes ?? []).map((edgeType) => ({
      id: edgeType.type,
      source: edgeType.from,
      target: edgeType.to,
      label: edgeType.displayName,
      labelStyle: { fill: 'hsl(var(--muted-foreground))', fontWeight: 500, fontSize: 12 },
      labelBgStyle: { fill: 'hsl(var(--card))', fillOpacity: 0.95 },
      labelBgPadding: [4, 8] as [number, number],
      labelBgBorderRadius: 4,
      style: {
        stroke: getEdgeColor(edgeType.type),
        strokeWidth: 2,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: getEdgeColor(edgeType.type),
      },
      animated: false,
    }));

    return { initialNodes: nodes, initialEdges: edges };
  }, [definition]);

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  // Fit view on initial load
  const onInit = useCallback((reactFlowInstance: { fitView: () => void }) => {
    setTimeout(() => reactFlowInstance.fitView(), 0);
  }, []);

  return (
    <div className={className} style={{ height, width: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onInit={onInit}
        fitView
        proOptions={{ hideAttribution: true }}
        minZoom={0.2}
        maxZoom={2}
      >
        <Background color="hsl(var(--border))" gap={16} />
        <Controls />
        <MiniMap
          nodeColor={() => 'hsl(var(--muted-foreground))'}
          maskColor="rgba(0, 0, 0, 0.2)"
          pannable
          zoomable
        />
      </ReactFlow>
    </div>
  );
}
