'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Node } from '@/types/workflow';
import type { ViewTemplate, KanbanConfig } from '@/types/view-templates';
import { KanbanView } from './styles/KanbanView';

interface ViewRendererProps {
  workflowId: string;
  viewTemplate: ViewTemplate;
  onNodeClick?: (node: Node) => void;
}

export function ViewRenderer({ workflowId, viewTemplate, onNodeClick }: ViewRendererProps) {
  const queryClient = useQueryClient();

  // Fetch the subgraph data for this view
  const { data, isLoading, error } = useQuery({
    queryKey: ['view', workflowId, viewTemplate.id],
    queryFn: () => api.getViewSubgraph(workflowId, viewTemplate.id),
  });

  // Mutation for updating node status (for drag-drop in Kanban)
  const updateNodeMutation = useMutation({
    mutationFn: ({ nodeId, status }: { nodeId: string; status: string }) =>
      api.updateNode(workflowId, nodeId, { status }),
    onSuccess: () => {
      // Invalidate both the view query and the nodes query
      queryClient.invalidateQueries({ queryKey: ['view', workflowId, viewTemplate.id] });
      queryClient.invalidateQueries({ queryKey: ['nodes', workflowId] });
    },
  });

  const handleNodeDrop = async (nodeId: string, newStatus: string) => {
    await updateNodeMutation.mutateAsync({ nodeId, status: newStatus });
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-gray-500">Loading view...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-red-500">Error loading view: {error.message}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-gray-500">No data available</div>
      </div>
    );
  }

  // Get the root level config
  const rootLevelConfig = viewTemplate.levels[viewTemplate.rootType];
  if (!rootLevelConfig) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-red-500">Invalid view template: missing root level config</div>
      </div>
    );
  }

  // Get the nodes for the root level
  const rootNodes = data.levels[viewTemplate.rootType]?.nodes || [];

  // Render based on style
  switch (rootLevelConfig.style) {
    case 'kanban':
      return (
        <KanbanView
          nodes={rootNodes}
          config={rootLevelConfig.styleConfig as KanbanConfig}
          onNodeClick={onNodeClick}
          onNodeDrop={handleNodeDrop}
        />
      );

    case 'cards':
    case 'tree':
    case 'timeline':
    case 'table':
      // TODO: Implement other view styles in Phase 2/3
      return (
        <div className="flex h-64 items-center justify-center">
          <div className="text-gray-500">
            View style &quot;{rootLevelConfig.style}&quot; coming soon
          </div>
        </div>
      );

    default:
      return (
        <div className="flex h-64 items-center justify-center">
          <div className="text-red-500">Unknown view style: {rootLevelConfig.style}</div>
        </div>
      );
  }
}
