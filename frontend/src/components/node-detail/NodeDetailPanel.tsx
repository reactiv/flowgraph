'use client';

import { useEffect, useCallback, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { WorkflowDefinition, NodeType } from '@/types/workflow';
import { NodeDetailHeader } from './NodeDetailHeader';
import { SummaryTab } from './tabs/SummaryTab';
import { PropertiesTab } from './tabs/PropertiesTab';
import { RelationshipsTab } from './tabs/RelationshipsTab';

type TabId = 'summary' | 'properties' | 'relationships';

interface NodeDetailPanelProps {
  workflowId: string;
  workflowDefinition: WorkflowDefinition;
  nodeId: string | null;
  onClose: () => void;
  onNodeSelect?: (nodeId: string) => void;
}

export function NodeDetailPanel({
  workflowId,
  workflowDefinition,
  nodeId,
  onClose,
  onNodeSelect,
}: NodeDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('summary');
  const queryClient = useQueryClient();

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && nodeId) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [nodeId, onClose]);

  // Fetch node data
  const {
    data: node,
    isLoading: nodeLoading,
    error: nodeError,
  } = useQuery({
    queryKey: ['node', workflowId, nodeId],
    queryFn: () => api.getNode(workflowId, nodeId!),
    enabled: !!nodeId,
  });

  // Fetch neighbors
  const {
    data: neighbors,
    isLoading: neighborsLoading,
  } = useQuery({
    queryKey: ['neighbors', workflowId, nodeId],
    queryFn: () => api.getNeighbors(workflowId, nodeId!),
    enabled: !!nodeId,
  });

  // Update node mutation
  const updateNodeMutation = useMutation({
    mutationFn: (update: { title?: string; status?: string; properties?: Record<string, unknown> }) =>
      api.updateNode(workflowId, nodeId!, update),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['node', workflowId, nodeId] });
      queryClient.invalidateQueries({ queryKey: ['nodes', workflowId] });
    },
  });

  // Get node type definition
  const nodeType: NodeType | undefined = node
    ? workflowDefinition.nodeTypes.find((nt) => nt.type === node.type)
    : undefined;

  // Handle status change
  const handleStatusChange = useCallback((newStatus: string) => {
    updateNodeMutation.mutate({ status: newStatus });
  }, [updateNodeMutation]);

  // Handle properties save
  const handlePropertiesSave = useCallback((properties: Record<string, unknown>) => {
    updateNodeMutation.mutate({ properties });
  }, [updateNodeMutation]);

  // Handle clicking on a related node
  const handleRelatedNodeClick = useCallback((relatedNodeId: string) => {
    if (onNodeSelect) {
      onNodeSelect(relatedNodeId);
    }
  }, [onNodeSelect]);

  if (!nodeId) return null;

  const tabs: { id: TabId; label: string }[] = [
    { id: 'summary', label: 'Summary' },
    { id: 'properties', label: 'Properties' },
    { id: 'relationships', label: 'Relationships' },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="fixed right-0 top-0 bottom-0 z-50 w-full sm:w-[480px] bg-white shadow-xl flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="node-detail-title"
      >
        {/* Loading state */}
        {nodeLoading && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-muted-foreground">Loading...</p>
          </div>
        )}

        {/* Error state */}
        {nodeError && (
          <div className="p-4">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-md"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
            <p className="text-destructive">Failed to load node</p>
          </div>
        )}

        {/* Node content */}
        {node && nodeType && (
          <>
            {/* Header */}
            <NodeDetailHeader
              node={node}
              nodeType={nodeType}
              onClose={onClose}
              onStatusChange={handleStatusChange}
              isUpdating={updateNodeMutation.isPending}
            />

            {/* Tabs */}
            <div className="border-b px-4">
              <div className="flex gap-1 -mb-px">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
                      activeTab === tab.id
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-auto">
              {activeTab === 'summary' && (
                <SummaryTab node={node} nodeType={nodeType} />
              )}
              {activeTab === 'properties' && (
                <PropertiesTab
                  node={node}
                  nodeType={nodeType}
                  onSave={handlePropertiesSave}
                  isSaving={updateNodeMutation.isPending}
                />
              )}
              {activeTab === 'relationships' && (
                <RelationshipsTab
                  neighbors={neighbors}
                  edgeTypes={workflowDefinition.edgeTypes}
                  isLoading={neighborsLoading}
                  onNodeClick={handleRelatedNodeClick}
                />
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
