'use client';

import { useState } from 'react';
import { ChevronRight, Link2, Sparkles } from 'lucide-react';
import type { NeighborsResponse, NeighborResult, EdgeType, Node, WorkflowDefinition, NodeCreate } from '@/types/workflow';
import type { SuggestionDirection } from '@/types/suggestion';
import { RelationshipCard } from '../RelationshipCard';
import { SuggestNodeModal } from '../SuggestNodeModal';

interface RelationshipsTabProps {
  workflowId: string;
  workflowDefinition: WorkflowDefinition;
  node: Node;
  neighbors: NeighborsResponse | undefined;
  edgeTypes: EdgeType[];
  isLoading: boolean;
  onNodeClick: (nodeId: string) => void;
  onSuggestAccept: (node: NodeCreate, edgeType: string, direction: SuggestionDirection) => Promise<void>;
}

export function RelationshipsTab({
  workflowId,
  workflowDefinition,
  node,
  neighbors,
  edgeTypes,
  isLoading,
  onNodeClick,
  onSuggestAccept,
}: RelationshipsTabProps) {
  // State for suggest modal
  const [suggestModal, setSuggestModal] = useState<{
    isOpen: boolean;
    edgeType: EdgeType | null;
    direction: SuggestionDirection;
  }>({
    isOpen: false,
    edgeType: null,
    direction: 'outgoing',
  });

  // Calculate possible edge types for this node
  const possibleOutgoingEdges = edgeTypes.filter((et) => et.from === node.type);
  const possibleIncomingEdges = edgeTypes.filter((et) => et.to === node.type);

  const handleSuggestClick = (edgeType: EdgeType, direction: SuggestionDirection) => {
    setSuggestModal({ isOpen: true, edgeType, direction });
  };

  const handleSuggestClose = () => {
    setSuggestModal({ isOpen: false, edgeType: null, direction: 'outgoing' });
  };

  if (isLoading) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground">Loading relationships...</p>
      </div>
    );
  }

  const { outgoing, incoming } = neighbors || { outgoing: [], incoming: [] };

  // Group relationships by edge type
  const outgoingByType = groupByEdgeType(outgoing);
  const incomingByType = groupByEdgeType(incoming);

  const hasRelationships = outgoing.length > 0 || incoming.length > 0;
  const hasPossibleEdges = possibleOutgoingEdges.length > 0 || possibleIncomingEdges.length > 0;

  return (
    <>
      <div className="p-4 space-y-6">
        {/* Suggest new relationships section */}
        {hasPossibleEdges && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
            <h3 className="text-sm font-medium text-primary mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Suggest New Relationships
            </h3>
            <div className="flex flex-wrap gap-2">
              {possibleOutgoingEdges.map((et) => {
                const targetType = workflowDefinition.nodeTypes.find((nt) => nt.type === et.to);
                return (
                  <button
                    key={`out-${et.type}`}
                    onClick={() => handleSuggestClick(et, 'outgoing')}
                    className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary border border-primary/30 hover:bg-primary/20 transition-colors"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {targetType?.displayName || et.to}
                  </button>
                );
              })}
              {possibleIncomingEdges.map((et) => {
                const sourceType = workflowDefinition.nodeTypes.find((nt) => nt.type === et.from);
                return (
                  <button
                    key={`in-${et.type}`}
                    onClick={() => handleSuggestClick(et, 'incoming')}
                    className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary border border-primary/30 hover:bg-primary/20 transition-colors"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {sourceType?.displayName || et.from}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!hasRelationships && !hasPossibleEdges && (
          <div className="text-center py-8">
            <Link2 className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">
              This node has no relationships yet.
            </p>
          </div>
        )}

        {/* Outgoing relationships */}
        {Object.keys(outgoingByType).length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <ChevronRight className="h-4 w-4" />
              Outgoing
            </h3>
            <div className="space-y-4">
              {Object.entries(outgoingByType).map(([edgeType, items]) => {
                const edgeTypeDef = edgeTypes.find((et) => et.type === edgeType);
                const displayName = edgeTypeDef?.displayName || edgeType;

                return (
                  <div key={edgeType}>
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                      {displayName} ({items.length})
                    </h4>
                    <div className="space-y-2">
                      {items.map((item) => (
                        <RelationshipCard
                          key={item.node.id}
                          node={item.node}
                          onClick={() => onNodeClick(item.node.id)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Incoming relationships */}
        {Object.keys(incomingByType).length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <ChevronRight className="h-4 w-4 rotate-180" />
              Incoming
            </h3>
            <div className="space-y-4">
              {Object.entries(incomingByType).map(([edgeType, items]) => {
                const edgeTypeDef = edgeTypes.find((et) => et.type === edgeType);
                const displayName = edgeTypeDef?.displayName || edgeType;

                return (
                  <div key={edgeType}>
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                      {displayName} ({items.length})
                    </h4>
                    <div className="space-y-2">
                      {items.map((item) => (
                        <RelationshipCard
                          key={item.node.id}
                          node={item.node}
                          onClick={() => onNodeClick(item.node.id)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Suggest Node Modal */}
      {suggestModal.edgeType && (
        <SuggestNodeModal
          workflowId={workflowId}
          workflowDefinition={workflowDefinition}
          sourceNode={node}
          edgeType={suggestModal.edgeType}
          direction={suggestModal.direction}
          isOpen={suggestModal.isOpen}
          onClose={handleSuggestClose}
          onAccept={async (nodeCreate, edgeType, direction) => {
            await onSuggestAccept(nodeCreate, edgeType, direction);
            handleSuggestClose();
          }}
        />
      )}
    </>
  );
}

function groupByEdgeType(
  items: NeighborResult[]
): Record<string, NeighborResult[]> {
  const grouped: Record<string, NeighborResult[]> = {};

  for (const item of items) {
    const type = item.edge.type;
    if (!grouped[type]) {
      grouped[type] = [];
    }
    grouped[type].push(item);
  }

  return grouped;
}
