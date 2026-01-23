'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link2, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { Node } from '@/types/workflow';
import type { NodeExternalRefWithDetails } from '@/types/external-reference';
import { ExternalReferenceCard } from '../ExternalReferenceCard';
import { LinkReferenceModal } from '../LinkReferenceModal';

interface ReferencesTabProps {
  workflowId: string;
  node: Node;
}

export function ReferencesTab({ workflowId, node }: ReferencesTabProps) {
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [refreshingRefs, setRefreshingRefs] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  // Fetch node references
  const {
    data: refsData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['node-refs', workflowId, node.id],
    queryFn: () => api.getNodeReferences(workflowId, node.id),
  });

  const references = refsData?.references || [];

  // Refresh projection mutation
  const refreshMutation = useMutation({
    mutationFn: (referenceId: string) => api.refreshProjection(referenceId),
    onSuccess: (data, referenceId) => {
      queryClient.invalidateQueries({ queryKey: ['node-refs', workflowId, node.id] });
      if (data.changed) {
        toast.success('Projection refreshed with new data');
      } else {
        toast.success('Projection is up to date');
      }
      setRefreshingRefs((prev) => {
        const next = new Set(prev);
        next.delete(referenceId);
        return next;
      });
    },
    onError: (err, referenceId) => {
      toast.error(err instanceof Error ? err.message : 'Failed to refresh');
      setRefreshingRefs((prev) => {
        const next = new Set(prev);
        next.delete(referenceId);
        return next;
      });
    },
  });

  // Create snapshot mutation
  const snapshotMutation = useMutation({
    mutationFn: (referenceId: string) => api.createSnapshot(referenceId, 'manual'),
    onSuccess: () => {
      toast.success('Snapshot created successfully');
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to create snapshot');
    },
  });

  // Unlink mutation
  const unlinkMutation = useMutation({
    mutationFn: (referenceId: string) =>
      api.unlinkNodeReference(workflowId, node.id, referenceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['node-refs', workflowId, node.id] });
      toast.success('Reference unlinked');
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to unlink');
    },
  });

  const handleRefresh = (referenceId: string) => {
    setRefreshingRefs((prev) => new Set(prev).add(referenceId));
    refreshMutation.mutate(referenceId);
  };

  const handleSnapshot = (referenceId: string) => {
    snapshotMutation.mutate(referenceId);
  };

  const handleUnlink = (referenceId: string) => {
    unlinkMutation.mutate(referenceId);
  };

  const handleLinkComplete = () => {
    queryClient.invalidateQueries({ queryKey: ['node-refs', workflowId, node.id] });
    toast.success('Reference linked successfully');
  };

  if (isLoading) {
    return (
      <div className="p-4 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        <span className="ml-2 text-sm text-muted-foreground">Loading references...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <p className="text-sm text-red-600">Failed to load references</p>
      </div>
    );
  }

  return (
    <>
      <div className="p-4 space-y-4">
        {/* Link new reference button */}
        <button
          onClick={() => setIsLinkModalOpen(true)}
          className="w-full flex items-center justify-center gap-2 p-3 rounded-lg border-2 border-dashed border-gray-300 text-gray-600 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
        >
          <Plus className="h-4 w-4" />
          <span className="text-sm font-medium">Link External Reference</span>
        </button>

        {/* Empty state */}
        {references.length === 0 && (
          <div className="text-center py-8">
            <Link2 className="h-8 w-8 mx-auto text-gray-300 mb-2" />
            <p className="text-sm text-muted-foreground mb-1">
              No external references linked
            </p>
            <p className="text-xs text-gray-400">
              Link content from Notion, Google Drive, and other sources
            </p>
          </div>
        )}

        {/* Reference list */}
        {references.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Linked References ({references.length})
            </h3>
            <div className="space-y-2">
              {references.map((nodeRef: NodeExternalRefWithDetails) => (
                <ExternalReferenceCard
                  key={nodeRef.reference_id}
                  nodeRef={nodeRef}
                  onRefresh={() => handleRefresh(nodeRef.reference_id)}
                  onSnapshot={() => handleSnapshot(nodeRef.reference_id)}
                  onUnlink={() => handleUnlink(nodeRef.reference_id)}
                  isRefreshing={refreshingRefs.has(nodeRef.reference_id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Link Reference Modal */}
      <LinkReferenceModal
        workflowId={workflowId}
        nodeId={node.id}
        isOpen={isLinkModalOpen}
        onClose={() => setIsLinkModalOpen(false)}
        onLink={handleLinkComplete}
      />
    </>
  );
}
