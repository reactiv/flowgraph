'use client';

import { useState, useMemo } from 'react';
import { Sparkles, Loader2, AlertCircle, ChevronLeft, ChevronDown, ChevronUp, Settings } from 'lucide-react';
import { api } from '@/lib/api';
import type { WorkflowDefinition, NodeCreate, EdgeType, Node } from '@/types/workflow';
import type { SuggestionDirection, NodeSuggestion } from '@/types/suggestion';
import type { ContextSelector } from '@/types/context-selector';
import { createDefaultContextSelector } from '@/types/context-selector';
import { ContextView } from '@/components/context-view/ContextView';

interface SuggestNodeModalProps {
  workflowId: string;
  workflowDefinition: WorkflowDefinition;
  sourceNode: Node;
  edgeType: EdgeType;
  direction: SuggestionDirection;
  isOpen: boolean;
  onClose: () => void;
  onAccept: (node: NodeCreate, edgeType: string, direction: SuggestionDirection) => Promise<void>;
}

export function SuggestNodeModal({
  workflowId,
  workflowDefinition,
  sourceNode,
  edgeType,
  direction,
  isOpen,
  onClose,
  onAccept,
}: SuggestNodeModalProps) {
  // Compute target type and default context selector based on edge configuration
  const targetTypeName = direction === 'outgoing' ? edgeType.to : edgeType.from;

  const defaultContextSelector = useMemo(
    () => createDefaultContextSelector(edgeType.type, direction, targetTypeName),
    [edgeType.type, direction, targetTypeName]
  );

  const [suggestion, setSuggestion] = useState<NodeSuggestion | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guidance, setGuidance] = useState('');
  const [contextSelector, setContextSelector] = useState<ContextSelector | null>(null);
  const [isContextExpanded, setIsContextExpanded] = useState(false);

  // Use default context selector if not customized
  const effectiveContextSelector = contextSelector ?? defaultContextSelector;

  // Editable fields for the suggested node
  const [editedTitle, setEditedTitle] = useState('');
  const [editedStatus, setEditedStatus] = useState<string | undefined>(undefined);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const response = await api.suggestNode(
        workflowId,
        sourceNode.id,
        edgeType.type,
        direction,
        {
          guidance: guidance.trim() || undefined,
          context_selector: effectiveContextSelector,
        }
      );

      const firstSuggestion = response.suggestions[0];
      if (firstSuggestion) {
        setSuggestion(firstSuggestion);
        setEditedTitle(firstSuggestion.node.title);
        setEditedStatus(firstSuggestion.node.status || undefined);
      } else {
        setError('No suggestions were generated. Try again.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate suggestion');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRegenerate = async () => {
    setSuggestion(null);
    await handleGenerate();
  };

  const handleAccept = async () => {
    if (!suggestion) return;

    setIsAccepting(true);
    setError(null);

    try {
      const nodeToCreate: NodeCreate = {
        ...suggestion.node,
        title: editedTitle || suggestion.node.title,
        status: editedStatus || suggestion.node.status,
      };

      await onAccept(nodeToCreate, edgeType.type, direction);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create node');
      setIsAccepting(false);
    }
  };

  const handleClose = () => {
    setSuggestion(null);
    setEditedTitle('');
    setEditedStatus(undefined);
    setError(null);
    setGuidance('');
    setContextSelector(null);
    setIsContextExpanded(false);
    setIsGenerating(false);
    setIsAccepting(false);
    onClose();
  };

  if (!isOpen) return null;

  // Get target node type info (targetTypeName computed above for context selector)
  const targetNodeType = workflowDefinition.nodeTypes.find((nt) => nt.type === targetTypeName);
  const targetDisplayName = targetNodeType?.displayName || targetTypeName;

  // Get available statuses for the target type
  const availableStatuses = targetNodeType?.states?.enabled ? targetNodeType.states.values : [];

  // Get relationship display name
  const relationshipDisplay = edgeType.displayName || edgeType.type.toLowerCase().replace(/_/g, ' ');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center gap-3 border-b px-6 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100">
            <Sparkles className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Suggest {targetDisplayName}
            </h2>
            <p className="text-sm text-gray-500">
              {direction === 'outgoing'
                ? `Create a ${targetDisplayName} that ${relationshipDisplay} "${sourceNode.title}"`
                : `Create a ${targetDisplayName} that ${relationshipDisplay} "${sourceNode.title}"`}
            </p>
          </div>
        </div>

        <div className="px-6 py-4">
          {!suggestion ? (
            // Initial state: Generate button
            <>
              <div className="space-y-4">
                {/* Context Configuration Section */}
                <div className="rounded-lg border border-gray-200 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setIsContextExpanded(!isContextExpanded)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Settings className="h-4 w-4 text-gray-500" />
                      <span className="text-sm font-medium text-gray-700">
                        Configure Context
                      </span>
                    </div>
                    {isContextExpanded ? (
                      <ChevronUp className="h-4 w-4 text-gray-500" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-gray-500" />
                    )}
                  </button>

                  {isContextExpanded && (
                    <div className="p-4 border-t border-gray-200">
                      <ContextView
                        workflowId={workflowId}
                        workflowDefinition={workflowDefinition}
                        sourceNodeId={sourceNode.id}
                        contextSelector={effectiveContextSelector}
                        onContextSelectorChange={setContextSelector}
                        mode="compact"
                        showGraph={false}
                        showNaturalLanguage={true}
                        sourceType={sourceNode.type}
                        edgeType={edgeType.type}
                        direction={direction}
                        targetType={targetTypeName}
                      />
                    </div>
                  )}
                </div>

                {/* Guidance input */}
                <div className="text-left">
                  <label htmlFor="guidance" className="block text-sm font-medium text-gray-700 mb-1">
                    Guidance (optional)
                  </label>
                  <textarea
                    id="guidance"
                    value={guidance}
                    onChange={(e) => setGuidance(e.target.value)}
                    placeholder="e.g., Focus on temperature optimization, or Include a control group..."
                    className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                    rows={2}
                    disabled={isGenerating}
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    Add specific instructions to guide the AI suggestion
                  </p>
                </div>

                {error && (
                  <div className="flex items-center gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700">
                    <AlertCircle className="h-4 w-4" />
                    {error}
                  </div>
                )}

                <div className="text-center">
                  <button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="inline-flex items-center gap-2 rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:bg-purple-300"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        Generate Suggestion
                      </>
                    )}
                  </button>
                </div>
              </div>
            </>
          ) : (
            // Suggestion preview and edit
            <>
              {/* Back button */}
              <button
                onClick={() => setSuggestion(null)}
                className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </button>

              {/* Editable fields */}
              <div className="space-y-4">
                <div>
                  <label htmlFor="node-title" className="block text-sm font-medium text-gray-700">
                    Title
                  </label>
                  <input
                    id="node-title"
                    type="text"
                    value={editedTitle}
                    onChange={(e) => setEditedTitle(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>

                {availableStatuses.length > 0 && (
                  <div>
                    <label htmlFor="node-status" className="block text-sm font-medium text-gray-700">
                      Status
                    </label>
                    <select
                      id="node-status"
                      value={editedStatus || ''}
                      onChange={(e) => setEditedStatus(e.target.value || undefined)}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                    >
                      {availableStatuses.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Rationale */}
                <div className="rounded-md bg-purple-50 p-3">
                  <h4 className="text-sm font-medium text-purple-800 mb-1">Why this suggestion?</h4>
                  <p className="text-sm text-purple-700">{suggestion.rationale}</p>
                </div>

                {/* Properties preview */}
                {suggestion.node.properties && Object.keys(suggestion.node.properties).length > 0 && (
                  <div className="rounded-md bg-gray-50 p-3">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Generated Properties</h4>
                    <div className="space-y-1 text-sm text-gray-600 max-h-32 overflow-y-auto">
                      {Object.entries(suggestion.node.properties).map(([key, value]) => (
                        <div key={key} className="flex gap-2">
                          <span className="font-medium text-gray-500 min-w-[100px]">{key}:</span>
                          <span className="truncate">{formatPropertyValue(value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {error && (
                <div className="mt-4 flex items-center gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700">
                  <AlertCircle className="h-4 w-4" />
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t px-6 py-4">
          <button
            onClick={handleClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
            disabled={isGenerating || isAccepting}
          >
            Cancel
          </button>
          {suggestion && (
            <>
              <button
                onClick={handleRegenerate}
                disabled={isGenerating || isAccepting}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="inline h-4 w-4 animate-spin mr-1" />
                    Regenerating...
                  </>
                ) : (
                  'Regenerate'
                )}
              </button>
              <button
                onClick={handleAccept}
                disabled={isAccepting || !editedTitle.trim()}
                className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:bg-purple-300"
              >
                {isAccepting ? (
                  <>
                    <Loader2 className="inline h-4 w-4 animate-spin mr-1" />
                    Creating...
                  </>
                ) : (
                  'Accept & Create'
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function formatPropertyValue(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : '(empty)';
  if (typeof value === 'object') return JSON.stringify(value).slice(0, 50) + '...';
  return String(value);
}
