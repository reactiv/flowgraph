'use client';

import { useState } from 'react';
import { Eye, Settings, MessageSquare, Loader2 } from 'lucide-react';
import type { WorkflowDefinition } from '@/types/workflow';
import type { ContextPreview, ContextSelector } from '@/types/context-selector';
import { useContextPreview } from './hooks/useContextPreview';
import { ContextPreviewList } from './ContextPreviewList';
import { ContextEditorForm } from './ContextEditorForm';
import { ContextEditorNatural } from './ContextEditorNatural';

type TabId = 'preview' | 'form' | 'natural';

interface ContextViewProps {
  /** Workflow ID for API calls. */
  workflowId: string;

  /** Workflow definition for schema information. */
  workflowDefinition: WorkflowDefinition;

  /** Source node ID to gather context for. */
  sourceNodeId: string;

  /** Current context selector configuration. */
  contextSelector: ContextSelector;

  /** Callback when selector changes. */
  onContextSelectorChange: (selector: ContextSelector) => void;

  /** Layout mode: compact for embedding in modals, expanded for standalone. */
  mode?: 'compact' | 'expanded';

  /** Whether to show the graph visualization. */
  showGraph?: boolean;

  /** Whether to show the natural language editor tab. */
  showNaturalLanguage?: boolean;

  /** Callback when preview data is loaded. */
  onPreviewLoaded?: (preview: ContextPreview) => void;

  /** Source node type for LLM context (e.g., 'Sample'). */
  sourceType?: string;

  /** Edge type being created (e.g., 'HAS_ANALYSIS'). */
  edgeType?: string;

  /** Direction of the edge from source node. */
  direction?: 'outgoing' | 'incoming';

  /** Target node type being suggested (e.g., 'Analysis'). */
  targetType?: string;
}

/**
 * Reusable Context View component for configuring and previewing LLM context.
 *
 * Features three tabs:
 * - Preview: Shows the nodes that would be included in context
 * - Form: Structured editor for building traversal paths
 * - Natural Language: Text-based editor for describing context
 */
export function ContextView({
  workflowId,
  workflowDefinition,
  sourceNodeId,
  contextSelector,
  onContextSelectorChange,
  mode = 'compact',
  showGraph = true,
  showNaturalLanguage = true,
  onPreviewLoaded,
  sourceType,
  edgeType,
  direction,
  targetType,
}: ContextViewProps) {
  const [activeTab, setActiveTab] = useState<TabId>('preview');

  const { preview, isLoading, isError, error } = useContextPreview({
    workflowId,
    nodeId: sourceNodeId,
    contextSelector,
  });

  // Notify parent when preview loads
  if (preview && onPreviewLoaded) {
    onPreviewLoaded(preview);
  }

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'preview', label: 'Preview', icon: <Eye className="h-4 w-4" /> },
    { id: 'form', label: 'Form', icon: <Settings className="h-4 w-4" /> },
    ...(showNaturalLanguage
      ? [
          {
            id: 'natural' as TabId,
            label: 'Natural Language',
            icon: <MessageSquare className="h-4 w-4" />,
          },
        ]
      : []),
  ];

  const isCompact = mode === 'compact';
  const containerClass = isCompact ? 'max-h-[400px]' : 'h-full';

  return (
    <div className={`flex flex-col border rounded-lg bg-white ${containerClass}`}>
      {/* Tab header */}
      <div className="border-b px-3 py-2">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeTab === tab.id
                  ? 'bg-purple-100 text-purple-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {isLoading && (
          <div className="flex items-center justify-center h-32 text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading context preview...
          </div>
        )}

        {isError && (
          <div className="p-4 text-red-600 text-sm">
            Error loading preview: {error?.message || 'Unknown error'}
          </div>
        )}

        {!isLoading && !isError && (
          <>
            {activeTab === 'preview' && (
              <ContextPreviewList
                preview={preview}
                workflowDefinition={workflowDefinition}
                showGraph={showGraph}
                mode={mode}
              />
            )}

            {activeTab === 'form' && (
              <ContextEditorForm
                workflowDefinition={workflowDefinition}
                contextSelector={contextSelector}
                onChange={onContextSelectorChange}
              />
            )}

            {activeTab === 'natural' && showNaturalLanguage && (
              <ContextEditorNatural
                workflowId={workflowId}
                workflowDefinition={workflowDefinition}
                contextSelector={contextSelector}
                onChange={onContextSelectorChange}
                sourceType={sourceType}
                edgeType={edgeType}
                direction={direction}
                targetType={targetType}
              />
            )}
          </>
        )}
      </div>

      {/* Footer with stats */}
      {preview && (
        <div className="border-t px-3 py-2 text-xs text-gray-500 flex justify-between">
          <span>
            {preview.totalNodes} context node{preview.totalNodes !== 1 ? 's' : ''}
          </span>
          {preview.totalTokensEstimate && (
            <span>~{preview.totalTokensEstimate} tokens</span>
          )}
        </div>
      )}
    </div>
  );
}
