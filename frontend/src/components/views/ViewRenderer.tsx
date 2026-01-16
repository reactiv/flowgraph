'use client';

import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Node } from '@/types/workflow';
import type {
  ViewTemplate,
  KanbanConfig,
  CardsConfig,
  TimelineConfig,
  TreeConfig,
  TableConfig,
  GanttConfig,
  FilterGroup,
  ViewFilterParams,
} from '@/types/view-templates';
import { KanbanView } from './styles/KanbanView';
import { CardsView } from './styles/CardsView';
import { TimelineView } from './styles/TimelineView';
import { TreeView } from './styles/TreeView';
import { TableView } from './styles/TableView';
import { GanttView } from './styles/GanttView';
import { FilterBar } from './FilterBar';

interface ViewRendererProps {
  workflowId: string;
  viewTemplate: ViewTemplate;
  onNodeClick?: (node: Node) => void;
}

export function ViewRenderer({ workflowId, viewTemplate, onNodeClick }: ViewRendererProps) {
  const queryClient = useQueryClient();

  // Filter state
  const [filterGroup, setFilterGroup] = useState<FilterGroup | null>(null);

  // Build filter params for API call
  const filterParams = useMemo<ViewFilterParams | undefined>(() => {
    if (!filterGroup || filterGroup.filters.length === 0) {
      return undefined;
    }
    return { filters: filterGroup };
  }, [filterGroup]);

  // Stable serialization for query key
  const filterKey = filterParams ? JSON.stringify(filterParams) : null;

  // Handle filter changes
  const handleFiltersChange = useCallback((filters: FilterGroup | null) => {
    setFilterGroup(filters);
  }, []);

  // Fetch the subgraph data for this view
  const { data, isLoading, error } = useQuery({
    queryKey: ['view', workflowId, viewTemplate.id, filterKey],
    queryFn: () => api.getViewSubgraph(workflowId, viewTemplate.id, { filters: filterParams }),
  });

  // Mutation for updating node status (for drag-drop in Kanban)
  const updateNodeMutation = useMutation({
    mutationFn: ({ nodeId, status }: { nodeId: string; status: string }) =>
      api.updateNode(workflowId, nodeId, { status }),
    onSuccess: () => {
      // Invalidate both the view query (with any filter) and the nodes query
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

  // Render the view content based on style
  const renderViewContent = () => {
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
        return (
          <CardsView
            nodes={rootNodes}
            config={rootLevelConfig.styleConfig as CardsConfig}
            onNodeClick={onNodeClick}
            onStatusChange={handleNodeDrop}
          />
        );

      case 'timeline':
        return (
          <TimelineView
            nodes={rootNodes}
            config={rootLevelConfig.styleConfig as TimelineConfig}
            onNodeClick={onNodeClick}
            onStatusChange={handleNodeDrop}
          />
        );

      case 'tree': {
        // Collect all edges from the data levels for tree structure
        const allEdges = Object.values(data.levels).flatMap((level) => level.edges || []);
        return (
          <TreeView
            nodes={rootNodes}
            edges={allEdges}
            config={rootLevelConfig.styleConfig as TreeConfig}
            onNodeClick={onNodeClick}
            onStatusChange={handleNodeDrop}
          />
        );
      }

      case 'table':
        return (
          <TableView
            nodes={rootNodes}
            config={rootLevelConfig.styleConfig as TableConfig}
            onNodeClick={onNodeClick}
            onStatusChange={handleNodeDrop}
          />
        );

      case 'gantt': {
        // Collect all edges for dependency arrows
        const allEdges = Object.values(data.levels).flatMap((level) => level.edges || []);
        const ganttConfig = rootLevelConfig.styleConfig as GanttConfig;
        return (
          <GanttView
            nodes={rootNodes}
            edges={allEdges}
            config={ganttConfig}
            onNodeClick={onNodeClick}
            onNodeUpdate={async (nodeId, updates) => {
              // Convert date updates to property updates
              const propertyUpdates: Record<string, unknown> = {};
              if (updates.start) {
                propertyUpdates[ganttConfig.startDateField] = updates.start;
              }
              if (updates.end) {
                propertyUpdates[ganttConfig.endDateField] = updates.end;
              }
              await api.updateNode(workflowId, nodeId, { properties: propertyUpdates });
              queryClient.invalidateQueries({ queryKey: ['view', workflowId, viewTemplate.id] });
              queryClient.invalidateQueries({ queryKey: ['nodes', workflowId] });
            }}
            onStatusChange={handleNodeDrop}
          />
        );
      }

      default:
        return (
          <div className="flex h-64 items-center justify-center">
            <div className="text-red-500">Unknown view style: {rootLevelConfig.style}</div>
          </div>
        );
    }
  };

  // Render with FilterBar
  return (
    <div className="flex flex-col h-full">
      <FilterBar
        workflowId={workflowId}
        viewId={viewTemplate.id}
        onFiltersChange={handleFiltersChange}
      />
      <div className="flex-1 overflow-auto">{renderViewContent()}</div>
    </div>
  );
}
