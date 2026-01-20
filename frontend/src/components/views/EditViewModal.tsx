'use client';

import { useState, useEffect, useMemo } from 'react';
import type { WorkflowDefinition } from '@/types/workflow';
import type { ViewTemplate, ViewTemplateCreate, ViewTemplateUpdate } from '@/types/view-templates';
import { ViewEditor } from './editor/ViewEditor';

interface EditViewModalProps {
  view: ViewTemplate;
  workflowDefinition: WorkflowDefinition;
  isOpen: boolean;
  onClose: () => void;
  onSave: (update: ViewTemplateUpdate) => void;
  isSaving: boolean;
}

/** Convert a ViewTemplate to ViewTemplateCreate for editing */
function viewToEditable(view: ViewTemplate): ViewTemplateCreate {
  return {
    name: view.name,
    description: view.description,
    icon: view.icon,
    rootType: view.rootType,
    edges: view.edges,
    levels: view.levels,
    filters: view.filters,
  };
}

/** Compute the update payload by comparing original and edited views */
function computeUpdate(original: ViewTemplate, edited: ViewTemplateCreate): ViewTemplateUpdate {
  const update: ViewTemplateUpdate = {};

  // Basic fields
  if (edited.name !== original.name) {
    update.name = edited.name;
  }
  if (edited.description !== original.description) {
    update.description = edited.description;
  }
  if (edited.icon !== original.icon) {
    update.icon = edited.icon;
  }

  // Structural fields - compare by JSON serialization for simplicity
  if (JSON.stringify(edited.edges) !== JSON.stringify(original.edges)) {
    update.edges = edited.edges;
  }
  if (JSON.stringify(edited.levels) !== JSON.stringify(original.levels)) {
    update.levels = edited.levels;
  }
  if (JSON.stringify(edited.filters) !== JSON.stringify(original.filters)) {
    update.filters = edited.filters;
  }

  return update;
}

export function EditViewModal({
  view,
  workflowDefinition,
  isOpen,
  onClose,
  onSave,
  isSaving,
}: EditViewModalProps) {
  const [editedView, setEditedView] = useState<ViewTemplateCreate>(() => viewToEditable(view));

  // Reset form when view changes
  useEffect(() => {
    setEditedView(viewToEditable(view));
  }, [view]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editedView.name.trim()) return;

    const update = computeUpdate(view, editedView);

    if (Object.keys(update).length > 0) {
      onSave(update);
    } else {
      onClose();
    }
  };

  // Check if there are any changes
  const hasChanges = useMemo(() => {
    const update = computeUpdate(view, editedView);
    return Object.keys(update).length > 0;
  }, [view, editedView]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] rounded-lg bg-white shadow-xl flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-xl font-semibold text-gray-900">Edit View</h2>
          <p className="mt-1 text-sm text-gray-500">
            Modify the view configuration below.
          </p>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-6 overflow-y-auto flex-1">
            <ViewEditor
              view={editedView}
              workflowDefinition={workflowDefinition}
              onChange={setEditedView}
              mode="edit"
              disabled={isSaving}
            />
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-gray-200 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-500">
                {hasChanges ? (
                  <span className="text-amber-600">Unsaved changes</span>
                ) : (
                  <span>No changes</span>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving || !editedView.name.trim() || !hasChanges}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-blue-300"
                >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
