'use client';

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Node, NodeType, WorkflowDefinition, NodeCreate, EdgeCreate, EdgeType } from '@/types/workflow';
import type {
  ViewTemplate,
  RecordConfig,
  LevelData,
} from '@/types/view-templates';
import type { SuggestionDirection } from '@/types/suggestion';
import { RecordPropertiesSection } from './RecordPropertiesSection';
import { RecordRelatedSection } from './RecordRelatedSection';
import { QuickActionsBar } from '@/components/node-detail/QuickActionsBar';
import { SuggestNodeModal } from '@/components/node-detail/SuggestNodeModal';

interface RecordDetailProps {
  workflowId: string;
  node: Node;
  nodeType: NodeType;
  levelData: Record<string, LevelData>;
  viewTemplate: ViewTemplate;
  workflowDefinition: WorkflowDefinition;
  recordConfig: RecordConfig;
  isLoading: boolean;
  onNodeClick?: (node: Node) => void;
  onCreateNode?: (nodeType: string, parentNodeId: string) => void;
}

export function RecordDetail({
  workflowId,
  node,
  nodeType,
  levelData,
  viewTemplate,
  workflowDefinition,
  recordConfig,
  isLoading,
  onNodeClick,
  onCreateNode,
}: RecordDetailProps) {
  const queryClient = useQueryClient();
  const [suggestModal, setSuggestModal] = useState<{
    isOpen: boolean;
    edgeType: EdgeType | null;
    direction: SuggestionDirection;
  }>({
    isOpen: false,
    edgeType: null,
    direction: 'outgoing',
  });

  // Determine which property fields to show
  const propertyFields = recordConfig?.propertyFields || nodeType.fields.map((f) => f.key);

  // Handle quick action suggest click
  const handleQuickActionSuggest = useCallback((edgeType: EdgeType, direction: SuggestionDirection) => {
    setSuggestModal({ isOpen: true, edgeType, direction });
  }, []);

  // Handle closing the suggest modal
  const handleSuggestModalClose = useCallback(() => {
    setSuggestModal({ isOpen: false, edgeType: null, direction: 'outgoing' });
  }, []);

  // Handle accepting a suggested node
  const handleSuggestAccept = useCallback(async (
    nodeCreate: NodeCreate,
    edgeType: string,
    direction: SuggestionDirection
  ) => {
    // Create the node
    const createdNode = await api.createNode(workflowId, nodeCreate);

    // Create the edge based on direction
    const edgeCreate: EdgeCreate = direction === 'outgoing'
      ? { type: edgeType, from_node_id: node.id, to_node_id: createdNode.id }
      : { type: edgeType, from_node_id: createdNode.id, to_node_id: node.id };

    await api.createEdge(workflowId, edgeCreate);

    // Invalidate queries
    queryClient.invalidateQueries({ queryKey: ['view', workflowId, viewTemplate.id] });
    queryClient.invalidateQueries({ queryKey: ['nodes', workflowId] });

    // Open the new node in the detail panel
    onNodeClick?.(createdNode);
  }, [workflowId, node.id, viewTemplate.id, queryClient, onNodeClick]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-semibold text-foreground">{node.title}</h2>
              <p className="text-sm text-muted-foreground">{nodeType.displayName}</p>
            </div>
            {node.status && (
              <span className="rounded-full bg-muted px-3 py-1 text-sm font-medium text-foreground">
                {node.status}
              </span>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        {nodeType.ui.quickActions.length > 0 && (
          <QuickActionsBar
            quickActions={nodeType.ui.quickActions}
            workflowDefinition={workflowDefinition}
            onSuggestClick={handleQuickActionSuggest}
          />
        )}
      </div>

      {/* Properties Section */}
      {recordConfig?.showProperties !== false && (
        <RecordPropertiesSection
          node={node}
          nodeType={nodeType}
          propertyFields={propertyFields}
          title={recordConfig?.propertiesTitle || 'Properties'}
        />
      )}

      {/* Related Sections */}
      {isLoading ? (
        <div className="rounded-lg border border-border bg-card p-8">
          <div className="flex items-center justify-center text-muted-foreground">
            Loading related items...
          </div>
        </div>
      ) : (
        recordConfig?.sections?.map((sectionConfig) => {
          const levelConfig = viewTemplate.levels[sectionConfig.targetType];
          const sectionLevelData = levelData[sectionConfig.targetType];

          // Get the target node type definition
          const targetNodeType = workflowDefinition.nodeTypes.find(
            (nt) => nt.type === sectionConfig.targetType
          );

          return (
            <RecordRelatedSection
              key={sectionConfig.targetType}
              title={sectionConfig.title || targetNodeType?.displayName || sectionConfig.targetType}
              description={sectionConfig.description}
              levelData={sectionLevelData}
              levelConfig={levelConfig}
              targetNodeType={targetNodeType}
              parentNode={node}
              displayNested={sectionConfig.displayNested}
              collapsedByDefault={sectionConfig.collapsedByDefault}
              maxItems={sectionConfig.maxItems}
              emptyMessage={sectionConfig.emptyMessage}
              allowCreate={sectionConfig.allowCreate}
              onNodeClick={onNodeClick}
              onCreateNode={onCreateNode}
            />
          );
        })
      )}

      {/* Suggest Node Modal */}
      {suggestModal.edgeType && (
        <SuggestNodeModal
          workflowId={workflowId}
          workflowDefinition={workflowDefinition}
          sourceNode={node}
          edgeType={suggestModal.edgeType}
          direction={suggestModal.direction}
          isOpen={suggestModal.isOpen}
          onClose={handleSuggestModalClose}
          onAccept={handleSuggestAccept}
        />
      )}
    </div>
  );
}
