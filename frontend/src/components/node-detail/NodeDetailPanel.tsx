'use client';

import { useEffect, useCallback, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { RuleViolationToast } from './RuleViolationToast';
import type { WorkflowDefinition, NodeType, NodeCreate, EdgeCreate, RuleViolation } from '@/types/workflow';
import type { SuggestionDirection } from '@/types/suggestion';
import { NodeDetailHeader } from './NodeDetailHeader';
import { SummaryTab } from './tabs/SummaryTab';
import { PropertiesTab } from './tabs/PropertiesTab';
import { RelationshipsTab } from './tabs/RelationshipsTab';
import { ReferencesTab } from './tabs/ReferencesTab';
import { RulesTab } from './tabs/RulesTab';

type TabId = 'summary' | 'properties' | 'relationships' | 'references' | 'rules';

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
    onError: (error: Error & { isRuleViolation?: boolean; violations?: RuleViolation[] }) => {
      if (error.isRuleViolation && error.violations) {
        // Show rich toast for rule violations
        toast.custom(
          (toastId) => (
            <RuleViolationToast
              violations={error.violations!}
              onAddEdge={() => {
                // Switch to relationships tab to add missing edges
                setActiveTab('relationships');
                toast.dismiss(toastId);
              }}
              onDismiss={() => toast.dismiss(toastId)}
            />
          ),
          { duration: 15000 }
        );
      } else {
        // Show simple error toast for other errors
        toast.error(error.message || 'Failed to update node');
      }
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

  // Handle accepting a suggested node
  const handleSuggestAccept = useCallback(async (
    nodeCreate: NodeCreate,
    edgeType: string,
    direction: SuggestionDirection
  ) => {
    // Create the node first
    const createdNode = await api.createNode(workflowId, nodeCreate);

    // Then create the edge
    const edgeCreate: EdgeCreate = direction === 'outgoing'
      ? { type: edgeType, from_node_id: nodeId!, to_node_id: createdNode.id }
      : { type: edgeType, from_node_id: createdNode.id, to_node_id: nodeId! };

    await api.createEdge(workflowId, edgeCreate);

    // Invalidate queries to refresh the UI
    queryClient.invalidateQueries({ queryKey: ['neighbors', workflowId, nodeId] });
    queryClient.invalidateQueries({ queryKey: ['nodes', workflowId] });

    // Navigate to the newly created node
    if (onNodeSelect) {
      onNodeSelect(createdNode.id);
    }
  }, [workflowId, nodeId, queryClient, onNodeSelect]);

  if (!nodeId) return null;

  // Build tabs - include Rules tab only if there are rules for this node type
  const hasApplicableRules = node
    ? workflowDefinition.rules.some((r) => r.when.nodeType === node.type)
    : false;

  const tabs: { id: TabId; label: string }[] = [
    { id: 'summary', label: 'Summary' },
    { id: 'properties', label: 'Properties' },
    { id: 'relationships', label: 'Relationships' },
    { id: 'references', label: 'References' },
    ...(hasApplicableRules ? [{ id: 'rules' as TabId, label: 'Rules' }] : []),
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="fixed right-0 top-0 bottom-0 z-50 w-full sm:w-[480px] bg-card border-l border-border shadow-2xl flex flex-col"
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
              className="absolute top-4 right-4 p-2 hover:bg-muted rounded-md transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5 text-muted-foreground" />
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
            <div className="border-b border-border px-4 bg-card">
              <div className="flex gap-1 -mb-px">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      'px-4 py-2.5 text-sm font-medium border-b-2 transition-all duration-200',
                      activeTab === tab.id
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-auto bg-background">
              {activeTab === 'summary' && (
                <SummaryTab node={node} nodeType={nodeType} />
              )}
              {activeTab === 'properties' && (
                <PropertiesTab
                  workflowId={workflowId}
                  workflowDefinition={workflowDefinition}
                  node={node}
                  nodeType={nodeType}
                  onSave={handlePropertiesSave}
                  isSaving={updateNodeMutation.isPending}
                />
              )}
              {activeTab === 'relationships' && (
                <RelationshipsTab
                  workflowId={workflowId}
                  workflowDefinition={workflowDefinition}
                  node={node}
                  neighbors={neighbors}
                  edgeTypes={workflowDefinition.edgeTypes}
                  isLoading={neighborsLoading}
                  onNodeClick={handleRelatedNodeClick}
                  onSuggestAccept={handleSuggestAccept}
                />
              )}
              {activeTab === 'references' && (
                <ReferencesTab
                  workflowId={workflowId}
                  node={node}
                />
              )}
              {activeTab === 'rules' && (
                <RulesTab
                  node={node}
                  rules={workflowDefinition.rules}
                  neighbors={neighbors}
                />
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
