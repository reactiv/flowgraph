'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import type { WorkflowDefinition } from '@/types/workflow';
import type { ViewTemplateCreate } from '@/types/view-templates';
import { ViewEditor } from './editor/ViewEditor';

interface CreateViewModalProps {
  workflowId: string;
  workflowDefinition: WorkflowDefinition;
  isOpen: boolean;
  onClose: () => void;
  onViewCreated: (view: ViewTemplateCreate) => void;
  isCreating: boolean;
}

export function CreateViewModal({
  workflowId,
  workflowDefinition,
  isOpen,
  onClose,
  onViewCreated,
  isCreating,
}: CreateViewModalProps) {
  const [description, setDescription] = useState('');
  const [generatedView, setGeneratedView] = useState<ViewTemplateCreate | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!description.trim()) return;

    setIsGenerating(true);
    setError(null);

    try {
      const view = await api.generateView(workflowId, description);
      setGeneratedView(view);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate view');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = () => {
    if (!generatedView) return;
    onViewCreated(generatedView);
  };

  const handleClose = () => {
    setDescription('');
    setGeneratedView(null);
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  // Get available node types for hint
  const nodeTypes = workflowDefinition.nodeTypes.map((nt) => nt.displayName).join(', ');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      {/* Modal */}
      <div
        className={`relative z-10 w-full rounded-lg bg-white shadow-xl flex flex-col ${
          generatedView ? 'max-w-2xl max-h-[90vh]' : 'max-w-lg'
        }`}
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-xl font-semibold text-gray-900">Create New View</h2>
          <p className="mt-1 text-sm text-gray-500">
            {generatedView
              ? 'Configure your view settings below.'
              : 'Describe the view you want to create, and AI will generate it for you.'}
          </p>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {!generatedView ? (
            // Step 1: Description input
            <>
              <div>
                <label htmlFor="view-description" className="block text-sm font-medium text-gray-700">
                  Describe your view
                </label>
                <textarea
                  id="view-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={`e.g., "Show ${nodeTypes.split(',')[0] || 'items'} grouped by status" or "Display all items by author"`}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  rows={3}
                  disabled={isGenerating}
                />
                <p className="mt-1 text-xs text-gray-500">Available types: {nodeTypes}</p>
              </div>

              {error && (
                <div className="mt-3 rounded-md bg-red-50 p-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
            </>
          ) : (
            // Step 2: Full editor
            <ViewEditor
              view={generatedView}
              workflowDefinition={workflowDefinition}
              onChange={setGeneratedView}
              mode="create"
              disabled={isCreating}
            />
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 flex-shrink-0">
          <div className="flex justify-end gap-3">
            {!generatedView ? (
              <>
                <button
                  onClick={handleClose}
                  className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                  disabled={isGenerating}
                >
                  Cancel
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={!description.trim() || isGenerating}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-blue-300"
                >
                  {isGenerating ? 'Generating...' : 'Generate View'}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setGeneratedView(null)}
                  className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                  disabled={isCreating}
                >
                  Back
                </button>
                <button
                  onClick={handleSave}
                  disabled={isCreating || !generatedView.name.trim()}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-blue-300"
                >
                  {isCreating ? 'Creating...' : 'Create View'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
