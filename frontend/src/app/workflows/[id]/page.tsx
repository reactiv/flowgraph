'use client';

import { useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { useViewUrlState } from '@/lib/use-view-url-state';
import type { Node } from '@/types/workflow';
import type { ViewTemplate, ViewTemplateCreate } from '@/types/view-templates';
import { ViewRenderer } from '@/components/views';
import { ViewCardGrid } from '@/components/views/ViewCardGrid';
import { CreateViewModal } from '@/components/views/CreateViewModal';
import { EditViewModal } from '@/components/views/EditViewModal';
import { DeleteViewDialog } from '@/components/views/DeleteViewDialog';
import { NodeDetailPanel } from '@/components/node-detail';
import { SchemaGraphPreview } from '@/components/schema-graph/SchemaGraphPreview';
import { GraphView } from '@/components/graph-view';

export default function WorkflowPage() {
  const params = useParams();
  const workflowId = params.id as string;
  const queryClient = useQueryClient();

  // URL state management for view, filters, sort, node, and record selection
  const [urlState, urlActions] = useViewUrlState();
  const { viewId: selectedViewId, nodeId: selectedNodeId, filters: urlFilters, sort: urlSort, recordId: urlRecordId } = urlState;

  const [selectedType, setSelectedType] = useState<string | null>(null);

  // Modal states
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingView, setEditingView] = useState<ViewTemplate | null>(null);
  const [deletingViewId, setDeletingViewId] = useState<string | null>(null);

  // Fetch workflow definition
  const {
    data: workflow,
    isLoading: workflowLoading,
    error: workflowError,
  } = useQuery({
    queryKey: ['workflow', workflowId],
    queryFn: () => api.getWorkflow(workflowId),
  });

  // Create view mutation
  const createViewMutation = useMutation({
    mutationFn: (view: ViewTemplateCreate) => api.createView(workflowId, view),
    onSuccess: (newView) => {
      queryClient.invalidateQueries({ queryKey: ['workflow', workflowId] });
      setCreateModalOpen(false);
      urlActions.setView(newView.id);
    },
  });

  // Delete view mutation
  const deleteViewMutation = useMutation({
    mutationFn: (viewId: string) => api.deleteView(workflowId, viewId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow', workflowId] });
      setDeletingViewId(null);
      if (selectedViewId === deletingViewId) {
        urlActions.setView(null);
      }
    },
  });

  // Update view mutation
  const updateViewMutation = useMutation({
    mutationFn: ({ viewId, update }: { viewId: string; update: { name?: string; description?: string } }) =>
      api.updateView(workflowId, viewId, update),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow', workflowId] });
      setEditingView(null);
    },
  });

  // Node detail panel handlers
  const handleNodeClick = useCallback((node: Node) => {
    urlActions.setNode(node.id);
  }, [urlActions]);

  const handleNodeSelect = useCallback((nodeId: string) => {
    urlActions.setNode(nodeId);
  }, [urlActions]);

  const handlePanelClose = useCallback(() => {
    urlActions.setNode(null);
  }, [urlActions]);

  // Filter change handler for ViewRenderer
  const handleFiltersChange = useCallback((filters: import('@/types/view-templates').FilterGroup | null) => {
    urlActions.setFilters(filters);
  }, [urlActions]);

  // Sort change handler for ViewRenderer
  const handleSortChange = useCallback((field: string | null, order: 'asc' | 'desc' = 'asc') => {
    urlActions.setSort(field, order);
  }, [urlActions]);

  // Record selection handler for RecordView
  const handleRecordSelect = useCallback((recordId: string | null) => {
    urlActions.setRecord(recordId);
  }, [urlActions]);

  // Fetch nodes (filtered by selected type) - only when in list view (not graph or semantic views)
  const {
    data: nodesResponse,
    isLoading: nodesLoading,
  } = useQuery({
    queryKey: ['nodes', workflowId, selectedType],
    queryFn: () => api.listNodes(workflowId, { type: selectedType || undefined, limit: 100 }),
    enabled: !!workflow && selectedViewId === null, // Only fetch for list view
  });

  // Set default selected type once workflow loads
  const firstNodeType = workflow?.nodeTypes?.[0];
  if (workflow && !selectedType && firstNodeType) {
    setSelectedType(firstNodeType.type);
  }

  // Get the selected view template
  const selectedViewTemplate = selectedViewId
    ? workflow?.viewTemplates?.find((vt) => vt.id === selectedViewId)
    : null;

  if (workflowLoading) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Loading workflow...</p>
      </div>
    );
  }

  if (workflowError || !workflow) {
    return (
      <div className="p-8">
        <p className="text-destructive">Failed to load workflow</p>
        <Link href="/" className="text-sm text-primary hover:underline mt-2 inline-block">
          &larr; Back to home
        </Link>
      </div>
    );
  }

  const nodes = nodesResponse?.nodes || [];
  const viewTemplates = workflow.viewTemplates || [];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b bg-white p-4">
        <div className="mb-4">
          <Link href="/" className="text-sm text-muted-foreground hover:text-primary mb-2 inline-block">
            &larr; Back to home
          </Link>
          <h1 className="text-2xl font-bold">{workflow.name}</h1>
          <p className="text-muted-foreground text-sm mt-1">{workflow.description}</p>
        </div>

        {/* View Cards */}
        <ViewCardGrid
          viewTemplates={viewTemplates}
          selectedViewId={selectedViewId}
          onViewSelect={urlActions.setView}
          onCreateClick={() => setCreateModalOpen(true)}
          onEditView={(view) => setEditingView(view)}
          onDeleteView={(viewId) => setDeletingViewId(viewId)}
        />
      </div>

      {/* Content Area */}
      {selectedViewId === 'schema' ? (
        // Render the schema graph view
        <div className="flex-1 overflow-hidden p-4">
          <SchemaGraphPreview
            definition={workflow}
            className="rounded-lg border bg-white"
            height="100%"
          />
        </div>
      ) : selectedViewId === 'graph' ? (
        // Render the instance graph view
        <div className="flex-1 overflow-hidden">
          <GraphView
            workflowId={workflowId}
            workflowDefinition={workflow}
            onNodeClick={handleNodeClick}
          />
        </div>
      ) : selectedViewTemplate ? (
        // Render the selected semantic view
        <div className="flex-1 overflow-hidden">
          <ViewRenderer
            workflowId={workflowId}
            viewTemplate={selectedViewTemplate}
            workflowDefinition={workflow}
            onNodeClick={handleNodeClick}
            initialFilters={urlFilters}
            onFiltersChange={handleFiltersChange}
            initialSort={urlSort}
            onSortChange={handleSortChange}
            initialRecordId={urlRecordId}
            onRecordSelect={handleRecordSelect}
          />
        </div>
      ) : (
        // Render the default list view
        <div className="flex-1 overflow-auto p-4">
          {/* Node Type Tabs */}
          <div className="border-b mb-6">
            <div className="flex gap-1 -mb-px">
              {workflow.nodeTypes.map((nodeType) => (
                <button
                  key={nodeType.type}
                  onClick={() => setSelectedType(nodeType.type)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    selectedType === nodeType.type
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {nodeType.displayName}
                </button>
              ))}
            </div>
          </div>

          {/* Nodes Table */}
          {nodesLoading ? (
            <p className="text-muted-foreground">Loading nodes...</p>
          ) : nodes.length === 0 ? (
            <div className="border rounded-lg p-8 text-center">
              <p className="text-muted-foreground">No {selectedType} nodes yet.</p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-3 text-sm font-medium">Title</th>
                    <th className="text-left px-4 py-3 text-sm font-medium">Status</th>
                    <th className="text-left px-4 py-3 text-sm font-medium">Author</th>
                    <th className="text-left px-4 py-3 text-sm font-medium">Summary</th>
                    <th className="text-left px-4 py-3 text-sm font-medium">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {nodes.map((node: Node) => (
                    <tr
                      key={node.id}
                      className="hover:bg-muted/30 cursor-pointer"
                      onClick={() => handleNodeClick(node)}
                    >
                      <td className="px-4 py-3 font-medium">{node.title}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={node.status || 'Unknown'} />
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {(node.properties?.author as string) || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground max-w-md truncate">
                        {(node.properties?.summary as string) || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {formatDate(node.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Stats */}
          {nodesResponse && (
            <p className="text-sm text-muted-foreground mt-4">
              Showing {nodes.length} of {nodesResponse.total} {selectedType} nodes
            </p>
          )}
        </div>
      )}

      {/* Modals */}
      <CreateViewModal
        workflowId={workflowId}
        workflowDefinition={workflow}
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onViewCreated={(view) => createViewMutation.mutate(view)}
        isCreating={createViewMutation.isPending}
      />

      {editingView && workflow && (
        <EditViewModal
          view={editingView}
          workflowDefinition={workflow}
          isOpen={true}
          onClose={() => setEditingView(null)}
          onSave={(update) =>
            updateViewMutation.mutate({ viewId: editingView.id, update })
          }
          isSaving={updateViewMutation.isPending}
        />
      )}

      <DeleteViewDialog
        viewId={deletingViewId}
        isOpen={!!deletingViewId}
        onClose={() => setDeletingViewId(null)}
        onConfirm={() => deletingViewId && deleteViewMutation.mutate(deletingViewId)}
        isDeleting={deleteViewMutation.isPending}
      />

      {/* Node Detail Panel */}
      {selectedNodeId && (
        <NodeDetailPanel
          workflowId={workflowId}
          workflowDefinition={workflow}
          nodeId={selectedNodeId}
          onClose={handlePanelClose}
          onNodeSelect={handleNodeSelect}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    Draft: 'bg-gray-100 text-gray-700',
    'In Progress': 'bg-blue-100 text-blue-700',
    Complete: 'bg-green-100 text-green-700',
    Archived: 'bg-purple-100 text-purple-700',
    Failed: 'bg-red-100 text-red-700',
    Pending: 'bg-yellow-100 text-yellow-700',
    Active: 'bg-blue-100 text-blue-700',
    Validated: 'bg-green-100 text-green-700',
    Rejected: 'bg-red-100 text-red-700',
    Dismissed: 'bg-gray-100 text-gray-700',
    Proposed: 'bg-yellow-100 text-yellow-700',
    Deprecated: 'bg-orange-100 text-orange-700',
  };

  const colorClass = colors[status] || 'bg-gray-100 text-gray-700';

  return (
    <span className={`inline-block px-2 py-1 text-xs font-medium rounded ${colorClass}`}>
      {status}
    </span>
  );
}
