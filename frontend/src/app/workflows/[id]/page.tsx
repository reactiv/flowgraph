'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import type { Node } from '@/types/workflow';
import { ViewSelector, ViewRenderer } from '@/components/views';

export default function WorkflowPage() {
  const params = useParams();
  const workflowId = params.id as string;
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedViewId, setSelectedViewId] = useState<string | null>(null);

  // Fetch workflow definition
  const {
    data: workflow,
    isLoading: workflowLoading,
    error: workflowError,
  } = useQuery({
    queryKey: ['workflow', workflowId],
    queryFn: () => api.getWorkflow(workflowId),
  });

  // Fetch nodes (filtered by selected type) - only when in list view
  const {
    data: nodesResponse,
    isLoading: nodesLoading,
  } = useQuery({
    queryKey: ['nodes', workflowId, selectedType],
    queryFn: () => api.listNodes(workflowId, { type: selectedType || undefined, limit: 100 }),
    enabled: !!workflow && !selectedViewId, // Only fetch for list view
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
        <div className="flex items-start justify-between">
          <div>
            <Link href="/" className="text-sm text-muted-foreground hover:text-primary mb-2 inline-block">
              &larr; Back to home
            </Link>
            <h1 className="text-2xl font-bold">{workflow.name}</h1>
            <p className="text-muted-foreground text-sm mt-1">{workflow.description}</p>
          </div>

          {/* View Selector */}
          <ViewSelector
            viewTemplates={viewTemplates}
            selectedViewId={selectedViewId}
            onViewChange={setSelectedViewId}
          />
        </div>
      </div>

      {/* Content Area */}
      {selectedViewTemplate ? (
        // Render the selected semantic view
        <div className="flex-1 overflow-hidden">
          <ViewRenderer
            workflowId={workflowId}
            viewTemplate={selectedViewTemplate}
            onNodeClick={(node) => {
              // TODO: Open node detail panel
              console.log('Node clicked:', node);
            }}
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
                    <tr key={node.id} className="hover:bg-muted/30">
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
