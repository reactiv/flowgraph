'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { DeltaPreview } from './DeltaPreview';
import type { PendingResult } from '@/types/endpoint';

interface ConfirmationDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  pendingResult: PendingResult;
  isApplying?: boolean;
}

type TabId = 'delta' | 'code' | 'skill';

export function ConfirmationDialog({
  open,
  onConfirm,
  onCancel,
  pendingResult,
  isApplying = false,
}: ConfirmationDialogProps) {
  const [activeTab, setActiveTab] = useState<TabId>('delta');

  // Reset to delta tab when dialog opens
  useEffect(() => {
    if (open) {
      setActiveTab('delta');
    }
  }, [open]);

  if (!open) return null;

  const { httpMethod, nodesCreated = 0, edgesCreated = 0, nodesUpdated = 0, nodesDeleted = 0, matchResult } = pendingResult;

  // Build summary based on HTTP method and matching results
  let summary = '';
  if (httpMethod === 'POST') {
    if (matchResult) {
      // Use match result counts for accurate summary
      const parts = [];
      if (matchResult.nodes_to_create > 0) {
        parts.push(`Create ${matchResult.nodes_to_create} node${matchResult.nodes_to_create !== 1 ? 's' : ''}`);
      }
      if (matchResult.nodes_to_update > 0) {
        parts.push(`Update ${matchResult.nodes_to_update} node${matchResult.nodes_to_update !== 1 ? 's' : ''}`);
      }
      if (matchResult.nodes_to_skip > 0) {
        parts.push(`Skip ${matchResult.nodes_to_skip} duplicate${matchResult.nodes_to_skip !== 1 ? 's' : ''}`);
      }
      if (matchResult.edges_to_create > 0) {
        parts.push(`${matchResult.edges_to_create} edge${matchResult.edges_to_create !== 1 ? 's' : ''}`);
      }
      summary = parts.length > 0 ? parts.join(', ') : 'No changes';
    } else {
      const parts = [];
      if (nodesCreated > 0) parts.push(`${nodesCreated} node${nodesCreated !== 1 ? 's' : ''}`);
      if (edgesCreated > 0) parts.push(`${edgesCreated} edge${edgesCreated !== 1 ? 's' : ''}`);
      summary = parts.length > 0 ? `Create ${parts.join(' and ')}` : 'No changes';
    }
  } else if (httpMethod === 'PUT') {
    summary = nodesUpdated > 0 ? `Update ${nodesUpdated} node${nodesUpdated !== 1 ? 's' : ''}` : 'No updates';
  } else if (httpMethod === 'DELETE') {
    summary = nodesDeleted > 0 ? `Delete ${nodesDeleted} node${nodesDeleted !== 1 ? 's' : ''}` : 'No deletions';
  } else if (httpMethod === 'GET') {
    summary = 'Query results (no changes)';
  }

  const tabs: { id: TabId; label: string; available: boolean }[] = [
    {
      id: 'delta',
      label: 'Changes',
      available: true,
    },
    {
      id: 'code',
      label: 'transform.py',
      available: !!pendingResult.transformCode,
    },
    {
      id: 'skill',
      label: 'SKILL.md',
      available: !!pendingResult.skillMd,
    },
  ];

  const availableTabs = tabs.filter((t) => t.available);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />

      {/* Dialog */}
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col mx-4">
        {/* Header */}
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold">Confirm Changes</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Review the changes before applying them to the workflow.
          </p>
          <div className="mt-3 text-sm font-medium">{summary}</div>
        </div>

        {/* Tabs */}
        {availableTabs.length > 1 && (
          <div className="border-b bg-muted/30 px-6 flex gap-1">
            {availableTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {activeTab === 'delta' && <DeltaPreview result={pendingResult} />}

          {activeTab === 'code' && pendingResult.transformCode && (
            <div className="bg-muted/50 rounded-md p-4 overflow-auto">
              <pre className="text-xs font-mono whitespace-pre-wrap">{pendingResult.transformCode}</pre>
            </div>
          )}

          {activeTab === 'skill' && pendingResult.skillMd && (
            <div className="bg-muted/50 rounded-md p-4 overflow-auto">
              <pre className="text-xs font-mono whitespace-pre-wrap">{pendingResult.skillMd}</pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isApplying}
            className="px-4 py-2 text-sm font-medium border rounded-md hover:bg-muted transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isApplying || httpMethod === 'GET'}
            className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isApplying ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Applying...
              </>
            ) : (
              'Apply Changes'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
