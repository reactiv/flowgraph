/**
 * Layout utilities for graph visualization.
 */

import dagre from 'dagre';
import type { Node as ReactFlowNode, Edge as ReactFlowEdge } from '@xyflow/react';
import type { Node as WorkflowNode, Edge as WorkflowEdge, WorkflowDefinition, NodeType } from '@/types/workflow';
import { getEdgeColor } from './colorUtils';

export type LayoutType = 'force' | 'dagre';

export interface InstanceNodeData {
  workflowNode: WorkflowNode;
  nodeType: NodeType;
  [key: string]: unknown; // Index signature for React Flow compatibility
}

const NODE_WIDTH = 200;
const NODE_HEIGHT = 80;

/**
 * Convert workflow nodes to React Flow nodes.
 */
export function convertToReactFlowNodes(
  workflowNodes: WorkflowNode[],
  workflowDefinition: WorkflowDefinition
): ReactFlowNode<InstanceNodeData>[] {
  const nodeTypeMap = new Map(
    workflowDefinition.nodeTypes.map((nt) => [nt.type, nt])
  );

  return workflowNodes.map((node) => ({
    id: node.id,
    type: 'instanceNode',
    position: { x: 0, y: 0 }, // Will be set by layout algorithm
    data: {
      workflowNode: node,
      nodeType: nodeTypeMap.get(node.type) || {
        type: node.type,
        displayName: node.type,
        titleField: 'title',
        fields: [],
        ui: { defaultViews: [], primarySections: [], listColumns: [], quickActions: [] },
      },
    },
  }));
}

/**
 * Convert workflow edges to React Flow edges.
 */
export function convertToReactFlowEdges(
  workflowEdges: WorkflowEdge[],
  workflowDefinition: WorkflowDefinition
): ReactFlowEdge[] {
  const edgeTypeMap = new Map(
    workflowDefinition.edgeTypes.map((et) => [et.type, et])
  );

  return workflowEdges.map((edge) => {
    const edgeType = edgeTypeMap.get(edge.type);
    const color = getEdgeColor(edge.type);

    return {
      id: edge.id,
      source: edge.from_node_id,
      target: edge.to_node_id,
      label: edgeType?.displayName || edge.type,
      labelStyle: { fill: 'hsl(var(--muted-foreground))', fontWeight: 500, fontSize: 11 },
      labelBgStyle: { fill: 'hsl(var(--card))', fillOpacity: 0.95 },
      labelBgPadding: [4, 6] as [number, number],
      labelBgBorderRadius: 4,
      style: { stroke: color, strokeWidth: 2 },
      markerEnd: { type: 'arrowclosed' as const, color },
    };
  });
}

/**
 * Apply dagre (hierarchical) layout to nodes.
 */
export function applyDagreLayout(
  nodes: ReactFlowNode<InstanceNodeData>[],
  edges: ReactFlowEdge[],
  direction: 'TB' | 'LR' = 'TB'
): ReactFlowNode<InstanceNodeData>[] {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: direction, nodesep: 80, ranksep: 100 });

  // Add nodes to dagre graph
  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  // Add edges to dagre graph
  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  // Run layout
  dagre.layout(dagreGraph);

  // Apply positions back to nodes
  return nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    if (!nodeWithPosition) {
      return node;
    }
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - NODE_WIDTH / 2,
        y: nodeWithPosition.y - NODE_HEIGHT / 2,
      },
    };
  });
}

/**
 * Apply force-directed layout to nodes (grid with some randomization).
 * For a true force simulation, we'd use d3-force, but this simple layout
 * works well for initial positioning before user interaction.
 */
export function applyForceLayout(
  nodes: ReactFlowNode<InstanceNodeData>[],
  _edges: ReactFlowEdge[]
): ReactFlowNode<InstanceNodeData>[] {
  // Group nodes by type for clustering
  const nodesByType: Map<string, ReactFlowNode<InstanceNodeData>[]> = new Map();

  nodes.forEach((node) => {
    const nodeType = node.data.workflowNode.type;
    if (!nodesByType.has(nodeType)) {
      nodesByType.set(nodeType, []);
    }
    nodesByType.get(nodeType)!.push(node);
  });

  const result: ReactFlowNode<InstanceNodeData>[] = [];
  let clusterX = 0;

  // Position nodes in clusters by type
  nodesByType.forEach((typeNodes) => {
    const cols = Math.ceil(Math.sqrt(typeNodes.length));
    const clusterWidth = cols * (NODE_WIDTH + 40);

    typeNodes.forEach((node, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);

      result.push({
        ...node,
        position: {
          x: clusterX + col * (NODE_WIDTH + 40) + Math.random() * 20 - 10,
          y: row * (NODE_HEIGHT + 60) + Math.random() * 20 - 10,
        },
      });
    });

    clusterX += clusterWidth + 100; // Space between clusters
  });

  return result;
}

/**
 * Apply the selected layout algorithm to nodes.
 */
export function applyLayout(
  nodes: ReactFlowNode<InstanceNodeData>[],
  edges: ReactFlowEdge[],
  layout: LayoutType
): ReactFlowNode<InstanceNodeData>[] {
  if (nodes.length === 0) return nodes;

  switch (layout) {
    case 'dagre':
      return applyDagreLayout(nodes, edges);
    case 'force':
    default:
      return applyForceLayout(nodes, edges);
  }
}
