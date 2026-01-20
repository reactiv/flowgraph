'use client';

import { useState, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Node, WorkflowDefinition, NodeCreate, EdgeCreate } from '@/types/workflow';
import type { ViewTemplate, RecordConfig } from '@/types/view-templates';
import { RecordSelector } from './RecordSelector';
import { RecordDetail } from './RecordDetail';

interface RecordViewProps {
  workflowId: string;
  viewTemplate: ViewTemplate;
  workflowDefinition: WorkflowDefinition;
  onNodeClick?: (node: Node) => void;
}

export function RecordView({
  workflowId,
  viewTemplate,
  workflowDefinition,
  onNodeClick,
}: RecordViewProps) {
  const queryClient = useQueryClient();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Get the root level config (should be RecordConfig)
  const rootLevelConfig = viewTemplate.levels[viewTemplate.rootType];
  const recordConfig = rootLevelConfig?.styleConfig as RecordConfig;

  // Fetch all root nodes for the selector
  const { data: allRootData, isLoading: isLoadingRoots } = useQuery({
    queryKey: ['view', workflowId, viewTemplate.id, 'all-roots'],
    queryFn: () => api.getViewSubgraph(workflowId, viewTemplate.id, {}),
  });

  const rootNodes = useMemo(() => {
    return allRootData?.levels[viewTemplate.rootType]?.nodes || [];
  }, [allRootData, viewTemplate.rootType]);

  // Fetch scoped data when a node is selected
  const { data: scopedData, isLoading: isLoadingScoped } = useQuery({
    queryKey: ['view', workflowId, viewTemplate.id, 'scoped', selectedNodeId],
    queryFn: () =>
      api.getViewSubgraph(workflowId, viewTemplate.id, {
        rootNodeId: selectedNodeId!,
      }),
    enabled: !!selectedNodeId,
  });

  // Get the selected node from root nodes
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return rootNodes.find((n) => n.id === selectedNodeId) || null;
  }, [rootNodes, selectedNodeId]);

  // Handle node selection
  const handleSelectNode = useCallback((node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  // Handle clicking a node within sections (navigates to detail panel)
  const handleSectionNodeClick = useCallback(
    (node: Node) => {
      onNodeClick?.(node);
    },
    [onNodeClick]
  );

  // Handle creating a new node in a section
  const handleCreateNode = useCallback(
    async (targetType: string, parentNodeId: string) => {
      // Find the edge config for this target type
      const edgeConfig = viewTemplate.edges.find((e) => e.targetType === targetType);
      if (!edgeConfig) {
        console.error(`No edge config found for target type: ${targetType}`);
        return;
      }

      // Get target node type definition for default status
      const targetNodeType = workflowDefinition.nodeTypes.find((nt) => nt.type === targetType);
      const defaultStatus = targetNodeType?.states?.enabled
        ? targetNodeType.states.values[0]
        : undefined;

      // Create the node
      const nodeCreate: NodeCreate = {
        type: targetType,
        title: `New ${targetNodeType?.displayName || targetType}`,
        status: defaultStatus,
        properties: {},
      };

      try {
        const createdNode = await api.createNode(workflowId, nodeCreate);

        // Create the edge linking to parent
        // Direction is from the parent's perspective, so we need to flip for edge creation
        const edgeCreate: EdgeCreate =
          edgeConfig.direction === 'outgoing'
            ? { type: edgeConfig.edgeType, from_node_id: parentNodeId, to_node_id: createdNode.id }
            : { type: edgeConfig.edgeType, from_node_id: createdNode.id, to_node_id: parentNodeId };

        await api.createEdge(workflowId, edgeCreate);

        // Invalidate queries to refresh the UI
        queryClient.invalidateQueries({ queryKey: ['view', workflowId, viewTemplate.id] });
        queryClient.invalidateQueries({ queryKey: ['nodes', workflowId] });

        // Open the new node in the detail panel
        onNodeClick?.(createdNode);
      } catch (error) {
        console.error('Failed to create node:', error);
      }
    },
    [workflowId, viewTemplate, workflowDefinition.nodeTypes, queryClient, onNodeClick]
  );

  // Get node type definition for the selected node
  const selectedNodeType = useMemo(() => {
    if (!selectedNode) return null;
    return workflowDefinition.nodeTypes.find((nt) => nt.type === selectedNode.type);
  }, [selectedNode, workflowDefinition.nodeTypes]);

  if (isLoadingRoots) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex h-full gap-4 p-4">
      {/* Selector Panel */}
      <div className="w-72 shrink-0">
        <RecordSelector
          nodes={rootNodes}
          selectedNodeId={selectedNodeId}
          onSelectNode={handleSelectNode}
          selectorStyle={recordConfig?.selectorStyle || 'list'}
          nodeTypeName={
            workflowDefinition.nodeTypes.find((nt) => nt.type === viewTemplate.rootType)
              ?.displayName || viewTemplate.rootType
          }
        />
      </div>

      {/* Detail Panel */}
      <div className="flex-1 overflow-auto">
        {selectedNode && selectedNodeType ? (
          <RecordDetail
            node={selectedNode}
            nodeType={selectedNodeType}
            levelData={scopedData?.levels || {}}
            viewTemplate={viewTemplate}
            workflowDefinition={workflowDefinition}
            recordConfig={recordConfig}
            isLoading={isLoadingScoped}
            onNodeClick={handleSectionNodeClick}
            onCreateNode={handleCreateNode}
          />
        ) : (
          <div className="flex h-full items-center justify-center rounded-lg border-2 border-dashed border-gray-200">
            <div className="text-center text-gray-500">
              <p className="text-lg font-medium">Select a {viewTemplate.rootType}</p>
              <p className="text-sm">Choose from the list on the left to view details</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
