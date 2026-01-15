'use client';

import { ChevronRight, Link2 } from 'lucide-react';
import type { NeighborsResponse, NeighborResult, EdgeType } from '@/types/workflow';
import { RelationshipCard } from '../RelationshipCard';

interface RelationshipsTabProps {
  neighbors: NeighborsResponse | undefined;
  edgeTypes: EdgeType[];
  isLoading: boolean;
  onNodeClick: (nodeId: string) => void;
}

export function RelationshipsTab({
  neighbors,
  edgeTypes,
  isLoading,
  onNodeClick,
}: RelationshipsTabProps) {
  if (isLoading) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground">Loading relationships...</p>
      </div>
    );
  }

  if (!neighbors) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground">No relationships found.</p>
      </div>
    );
  }

  const { outgoing, incoming } = neighbors;
  const hasRelationships = outgoing.length > 0 || incoming.length > 0;

  // Group relationships by edge type
  const outgoingByType = groupByEdgeType(outgoing);
  const incomingByType = groupByEdgeType(incoming);

  if (!hasRelationships) {
    return (
      <div className="p-4 text-center py-8">
        <Link2 className="h-8 w-8 mx-auto text-gray-300 mb-2" />
        <p className="text-sm text-muted-foreground">
          This node has no relationships yet.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      {/* Outgoing relationships */}
      {Object.keys(outgoingByType).length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-500 mb-3 flex items-center gap-2">
            <ChevronRight className="h-4 w-4" />
            Outgoing
          </h3>
          <div className="space-y-4">
            {Object.entries(outgoingByType).map(([edgeType, items]) => {
              const edgeTypeDef = edgeTypes.find((et) => et.type === edgeType);
              const displayName = edgeTypeDef?.displayName || edgeType;

              return (
                <div key={edgeType}>
                  <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
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
          <h3 className="text-sm font-medium text-gray-500 mb-3 flex items-center gap-2">
            <ChevronRight className="h-4 w-4 rotate-180" />
            Incoming
          </h3>
          <div className="space-y-4">
            {Object.entries(incomingByType).map(([edgeType, items]) => {
              const edgeTypeDef = edgeTypes.find((et) => et.type === edgeType);
              const displayName = edgeTypeDef?.displayName || edgeType;

              return (
                <div key={edgeType}>
                  <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
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
