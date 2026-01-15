'use client';

import { useState, useEffect } from 'react';
import type { ViewTemplate, ViewTemplateUpdate } from '@/types/view-templates';

interface EditViewModalProps {
  view: ViewTemplate;
  isOpen: boolean;
  onClose: () => void;
  onSave: (update: ViewTemplateUpdate) => void;
  isSaving: boolean;
}

export function EditViewModal({ view, isOpen, onClose, onSave, isSaving }: EditViewModalProps) {
  const [name, setName] = useState(view.name);
  const [description, setDescription] = useState(view.description || '');

  // Reset form when view changes
  useEffect(() => {
    setName(view.name);
    setDescription(view.description || '');
  }, [view]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const update: ViewTemplateUpdate = {};
    if (name !== view.name) update.name = name;
    if (description !== (view.description || '')) update.description = description;

    if (Object.keys(update).length > 0) {
      onSave(update);
    } else {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-xl font-semibold text-gray-900">Edit View</h2>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label htmlFor="edit-view-name" className="block text-sm font-medium text-gray-700">
              Name
            </label>
            <input
              id="edit-view-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              disabled={isSaving}
            />
          </div>

          <div>
            <label htmlFor="edit-view-description" className="block text-sm font-medium text-gray-700">
              Description
            </label>
            <input
              id="edit-view-description"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              disabled={isSaving}
            />
          </div>

          {/* Read-only info */}
          <div className="rounded-md bg-gray-50 p-3">
            <p className="text-sm text-gray-600">
              <span className="font-medium">Root Type:</span> {view.rootType}
            </p>
            <p className="text-sm text-gray-600 mt-1">
              <span className="font-medium">Style:</span>{' '}
              {Object.values(view.levels)[0]?.style || 'unknown'}
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-2">
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
              disabled={isSaving || !name.trim()}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-blue-300"
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
