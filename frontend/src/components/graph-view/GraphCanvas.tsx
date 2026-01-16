'use client';

import { useCallback, useMemo, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import type { Node as WorkflowNode, Edge as WorkflowEdge, WorkflowDefinition } from '@/types/workflow';
import { InstanceNode } from './nodes/InstanceNode';
import type { InstanceNodeData } from './utils/layoutUtils';
import {
  convertToReactFlowNodes,
  convertToReactFlowEdges,
  applyLayout,
  type LayoutType,
} from './utils/layoutUtils';
import { getNodeTypeColor } from './utils/colorUtils';

// Register custom node types
const nodeTypes = {
  instanceNode: InstanceNode,
};

interface GraphCanvasProps {
  workflowNodes: WorkflowNode[];
  workflowEdges: WorkflowEdge[];
  workflowDefinition: WorkflowDefinition;
  layout: LayoutType;
  onNodeClick?: (node: WorkflowNode) => void;
}

/**
 * The main React Flow canvas for the graph view.
 */
export function GraphCanvas({
  workflowNodes,
  workflowEdges,
  workflowDefinition,
  layout,
  onNodeClick,
}: GraphCanvasProps) {
  // Convert and layout nodes/edges
  const { layoutedNodes, layoutedEdges } = useMemo(() => {
    const rfNodes = convertToReactFlowNodes(workflowNodes, workflowDefinition);
    const rfEdges = convertToReactFlowEdges(workflowEdges, workflowDefinition);
    const layoutedNodes = applyLayout(rfNodes, rfEdges, layout);
    return { layoutedNodes, layoutedEdges: rfEdges };
  }, [workflowNodes, workflowEdges, workflowDefinition, layout]);

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges);

  // Update nodes when layout changes
  useEffect(() => {
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [layoutedNodes, layoutedEdges, setNodes, setEdges]);

  // Handle node click
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const data = node.data as InstanceNodeData | undefined;
      if (onNodeClick && data?.workflowNode) {
        onNodeClick(data.workflowNode);
      }
    },
    [onNodeClick]
  );

  // MiniMap node color based on type
  const miniMapNodeColor = useCallback((node: Node) => {
    const data = node.data as InstanceNodeData | undefined;
    if (data?.workflowNode?.type) {
      return getNodeTypeColor(data.workflowNode.type);
    }
    return '#64748b';
  }, []);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={handleNodeClick}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      proOptions={{ hideAttribution: true }}
      minZoom={0.1}
      maxZoom={2}
      defaultEdgeOptions={{
        type: 'smoothstep',
      }}
    >
      <Background color="#e2e8f0" gap={20} />
      <Controls position="bottom-right" />
      <MiniMap
        nodeColor={miniMapNodeColor}
        maskColor="rgba(0, 0, 0, 0.1)"
        pannable
        zoomable
        position="bottom-left"
      />
    </ReactFlow>
  );
}
