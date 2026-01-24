'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ConnectorCreate, ConnectorSummary, ConnectorUpdate } from '@/types/connector';
import { ConnectorList } from '@/components/connectors/ConnectorList';
import { ConnectorDetail } from '@/components/connectors/ConnectorDetail';
import { CreateConnectorModal } from '@/components/connectors/CreateConnectorModal';

export default function ConnectorsPage() {
  const queryClient = useQueryClient();

  const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingConnector, setEditingConnector] = useState<ConnectorSummary | null>(null);

  // Fetch connectors list
  const {
    data: connectorsData,
    isLoading: connectorsLoading,
    error: connectorsError,
  } = useQuery({
    queryKey: ['connectors'],
    queryFn: () => api.listConnectors(),
  });

  // Fetch selected connector details
  const { data: selectedConnectorDetail } = useQuery({
    queryKey: ['connector', selectedConnectorId],
    queryFn: () => api.getConnector(selectedConnectorId!),
    enabled: !!selectedConnectorId,
  });

  // Create connector mutation
  const createMutation = useMutation({
    mutationFn: (data: ConnectorCreate) => api.createConnector(data),
    onSuccess: (newConnector: { id: string }) => {
      queryClient.invalidateQueries({ queryKey: ['connectors'] });
      setCreateModalOpen(false);
      setSelectedConnectorId(newConnector.id);
    },
  });

  // Update connector mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ConnectorUpdate }) => api.updateConnector(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connectors'] });
      queryClient.invalidateQueries({ queryKey: ['connector', editingConnector?.id] });
      setEditingConnector(null);
    },
  });

  // Delete connector mutation
  const deleteMutation = useMutation({
    mutationFn: (connectorId: string) => api.deleteConnector(connectorId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connectors'] });
      if (selectedConnectorId === editingConnector?.id) {
        setSelectedConnectorId(null);
      }
    },
  });

  const connectors = connectorsData?.connectors || [];
  const selectedConnector = selectedConnectorDetail;

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <div className="border-b bg-white p-4">
        <div className="mb-2">
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-primary mb-2 inline-block"
          >
            &larr; Back to Home
          </Link>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Connectors</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Manage integrations with external systems like Notion, Google Drive, and more
            </p>
          </div>
          <button
            onClick={() => setCreateModalOpen(true)}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            Create Connector
          </button>
        </div>
      </div>

      {/* Main content - two column layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left column: Connector list */}
        <div className="w-80 border-r flex flex-col bg-muted/30 overflow-hidden">
          <div className="p-4 border-b bg-white">
            <h2 className="font-medium text-sm text-muted-foreground">
              {connectors.length} connector{connectors.length !== 1 ? 's' : ''}
            </h2>
          </div>
          <div className="flex-1 overflow-auto p-2">
            {connectorsLoading ? (
              <p className="text-muted-foreground text-sm p-4">Loading connectors...</p>
            ) : connectorsError ? (
              <p className="text-destructive text-sm p-4">Failed to load connectors</p>
            ) : connectors.length === 0 ? (
              <div className="text-center p-8">
                <p className="text-muted-foreground text-sm mb-4">No connectors yet</p>
                <button
                  onClick={() => setCreateModalOpen(true)}
                  className="text-sm text-primary hover:underline"
                >
                  Create your first connector
                </button>
              </div>
            ) : (
              <ConnectorList
                connectors={connectors}
                selectedId={selectedConnectorId}
                onSelect={setSelectedConnectorId}
                onEdit={setEditingConnector}
                onDelete={(id) => {
                  if (confirm('Are you sure you want to delete this connector?')) {
                    deleteMutation.mutate(id);
                  }
                }}
              />
            )}
          </div>
        </div>

        {/* Right column: Connector detail */}
        <div className="flex-1 overflow-hidden">
          {selectedConnector ? (
            <ConnectorDetail
              key={selectedConnector.id}
              connector={selectedConnector}
              onUpdate={() => {
                queryClient.invalidateQueries({ queryKey: ['connectors'] });
                queryClient.invalidateQueries({ queryKey: ['connector', selectedConnectorId] });
              }}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                  </svg>
                </div>
                <p className="text-sm">Select a connector to view details</p>
                <p className="text-xs mt-1">or create a new one to get started</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Modal */}
      <CreateConnectorModal
        isOpen={createModalOpen || editingConnector !== null}
        onClose={() => {
          setCreateModalOpen(false);
          setEditingConnector(null);
        }}
        onSubmit={async (data) => {
          if (editingConnector) {
            await updateMutation.mutateAsync({ id: editingConnector.id, data });
          } else {
            await createMutation.mutateAsync(data as ConnectorCreate);
          }
        }}
        connector={editingConnector}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}
