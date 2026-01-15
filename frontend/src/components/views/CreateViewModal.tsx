'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import type { WorkflowDefinition } from '@/types/workflow';
import type { ViewTemplateCreate } from '@/types/view-templates';

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

  // Editable fields for the generated view
  const [editedName, setEditedName] = useState('');
  const [editedDescription, setEditedDescription] = useState('');

  const handleGenerate = async () => {
    if (!description.trim()) return;

    setIsGenerating(true);
    setError(null);

    try {
      const view = await api.generateView(workflowId, description);
      setGeneratedView(view);
      setEditedName(view.name);
      setEditedDescription(view.description || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate view');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = () => {
    if (!generatedView) return;

    const viewToSave: ViewTemplateCreate = {
      ...generatedView,
      name: editedName || generatedView.name,
      description: editedDescription || generatedView.description,
    };

    onViewCreated(viewToSave);
  };

  const handleClose = () => {
    setDescription('');
    setGeneratedView(null);
    setEditedName('');
    setEditedDescription('');
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
      <div className="relative z-10 w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-xl font-semibold text-gray-900">Create New View</h2>
        <p className="mt-1 text-sm text-gray-500">
          Describe the view you want to create, and AI will generate it for you.
        </p>

        {!generatedView ? (
          // Step 1: Description input
          <>
            <div className="mt-4">
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
              <p className="mt-1 text-xs text-gray-500">
                Available types: {nodeTypes}
              </p>
            </div>

            {error && (
              <div className="mt-3 rounded-md bg-red-50 p-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
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
            </div>
          </>
        ) : (
          // Step 2: Preview and edit
          <>
            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="view-name" className="block text-sm font-medium text-gray-700">
                  View Name
                </label>
                <input
                  id="view-name"
                  type="text"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label htmlFor="view-desc-edit" className="block text-sm font-medium text-gray-700">
                  Description
                </label>
                <input
                  id="view-desc-edit"
                  type="text"
                  value={editedDescription}
                  onChange={(e) => setEditedDescription(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Preview info */}
              <div className="rounded-md bg-gray-50 p-3">
                <h4 className="text-sm font-medium text-gray-700">Preview</h4>
                <div className="mt-2 space-y-1 text-sm text-gray-600">
                  <p>
                    <span className="font-medium">Type:</span> {generatedView.rootType}
                  </p>
                  <p>
                    <span className="font-medium">Style:</span>{' '}
                    {Object.values(generatedView.levels)[0]?.style || 'kanban'}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setGeneratedView(null);
                  setEditedName('');
                  setEditedDescription('');
                }}
                className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                disabled={isCreating}
              >
                Back
              </button>
              <button
                onClick={handleSave}
                disabled={isCreating || !editedName.trim()}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-blue-300"
              >
                {isCreating ? 'Creating...' : 'Create View'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
