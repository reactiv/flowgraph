'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Endpoint, EndpointCreate } from '@/types/endpoint';
import { EndpointList } from '@/components/endpoints/EndpointList';
import { EndpointTester } from '@/components/endpoints/EndpointTester';
import { CreateEndpointModal } from '@/components/endpoints/CreateEndpointModal';

export default function EndpointsPage() {
  const params = useParams();
  const workflowId = params.id as string;
  const queryClient = useQueryClient();

  const [selectedEndpointId, setSelectedEndpointId] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingEndpoint, setEditingEndpoint] = useState<Endpoint | null>(null);

  // Fetch workflow
  const { data: workflow, isLoading: workflowLoading } = useQuery({
    queryKey: ['workflow', workflowId],
    queryFn: () => api.getWorkflow(workflowId),
  });

  // Fetch endpoints list
  const {
    data: endpointsData,
    isLoading: endpointsLoading,
    error: endpointsError,
  } = useQuery({
    queryKey: ['endpoints', workflowId],
    queryFn: () => api.listEndpoints(workflowId),
  });

  // Fetch selected endpoint details (includes learned assets)
  const { data: selectedEndpointDetail } = useQuery({
    queryKey: ['endpoint', workflowId, selectedEndpointId],
    queryFn: () => api.getEndpoint(workflowId, selectedEndpointId!),
    enabled: !!selectedEndpointId,
  });

  // Create endpoint mutation
  const createMutation = useMutation({
    mutationFn: (endpoint: EndpointCreate) => api.createEndpoint(workflowId, endpoint),
    onSuccess: (newEndpoint) => {
      queryClient.invalidateQueries({ queryKey: ['endpoints', workflowId] });
      setCreateModalOpen(false);
      setSelectedEndpointId(newEndpoint.id);
    },
  });

  // Delete endpoint mutation
  const deleteMutation = useMutation({
    mutationFn: (endpointId: string) => api.deleteEndpoint(workflowId, endpointId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['endpoints', workflowId] });
      if (selectedEndpointId === editingEndpoint?.id) {
        setSelectedEndpointId(null);
      }
    },
  });

  const endpoints = endpointsData?.endpoints || [];
  // Use detailed endpoint (with learned assets) if available, otherwise fall back to list item
  const selectedEndpoint = selectedEndpointDetail || endpoints.find((e) => e.id === selectedEndpointId);

  if (workflowLoading) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Loading workflow...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card p-4">
        <div className="mb-2">
          <Link
            href={`/workflows/${workflowId}`}
            className="text-sm text-muted-foreground hover:text-primary mb-2 inline-block"
          >
            &larr; Back to {workflow?.name || 'workflow'}
          </Link>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Endpoints</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Create API endpoints that transform data and modify the workflow graph
            </p>
          </div>
          <button
            onClick={() => setCreateModalOpen(true)}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            Create Endpoint
          </button>
        </div>
      </div>

      {/* Main content - two column layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left column: Endpoint list */}
        <div className="w-80 border-r border-border flex flex-col bg-muted/30 overflow-hidden">
          <div className="p-4 border-b border-border bg-card">
            <h2 className="font-medium text-sm text-muted-foreground">
              {endpoints.length} endpoint{endpoints.length !== 1 ? 's' : ''}
            </h2>
          </div>
          <div className="flex-1 overflow-auto p-2">
            {endpointsLoading ? (
              <p className="text-muted-foreground text-sm p-4">Loading endpoints...</p>
            ) : endpointsError ? (
              <p className="text-destructive text-sm p-4">Failed to load endpoints</p>
            ) : endpoints.length === 0 ? (
              <div className="text-center p-8">
                <p className="text-muted-foreground text-sm mb-4">No endpoints yet</p>
                <button
                  onClick={() => setCreateModalOpen(true)}
                  className="text-sm text-primary hover:underline"
                >
                  Create your first endpoint
                </button>
              </div>
            ) : (
              <EndpointList
                endpoints={endpoints}
                selectedId={selectedEndpointId}
                onSelect={setSelectedEndpointId}
                onEdit={setEditingEndpoint}
                onDelete={(id) => {
                  if (confirm('Are you sure you want to delete this endpoint?')) {
                    deleteMutation.mutate(id);
                  }
                }}
                workflowId={workflowId}
              />
            )}
          </div>
        </div>

        {/* Right column: Endpoint tester */}
        <div className="flex-1 overflow-hidden">
          {selectedEndpoint ? (
            <EndpointTester
              key={selectedEndpoint.id}
              endpoint={selectedEndpoint}
              workflowId={workflowId}
              onEndpointUpdated={() => {
                queryClient.invalidateQueries({ queryKey: ['endpoints', workflowId] });
                queryClient.invalidateQueries({ queryKey: ['endpoint', workflowId, selectedEndpointId] });
              }}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                  </svg>
                </div>
                <p className="text-sm">Select an endpoint to test it</p>
                <p className="text-xs mt-1">or create a new one to get started</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Modal */}
      <CreateEndpointModal
        isOpen={createModalOpen || editingEndpoint !== null}
        onClose={() => {
          setCreateModalOpen(false);
          setEditingEndpoint(null);
        }}
        onSubmit={async (data) => {
          if (editingEndpoint) {
            await api.updateEndpoint(workflowId, editingEndpoint.id, data);
            queryClient.invalidateQueries({ queryKey: ['endpoints', workflowId] });
            setEditingEndpoint(null);
          } else {
            createMutation.mutate(data as EndpointCreate);
          }
        }}
        endpoint={editingEndpoint}
        isLoading={createMutation.isPending}
      />
    </div>
  );
}
