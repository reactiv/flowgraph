'use client';

import { useState, useEffect } from 'react';
import type { Endpoint, EndpointCreate, EndpointUpdate, HttpMethod, TransformMode } from '@/types/endpoint';

interface CreateEndpointModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: EndpointCreate | EndpointUpdate) => Promise<void>;
  endpoint?: Endpoint | null; // If provided, we're editing
  isLoading?: boolean;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);
}

export function CreateEndpointModal({
  isOpen,
  onClose,
  onSubmit,
  endpoint,
  isLoading,
}: CreateEndpointModalProps) {
  const isEditing = !!endpoint;

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [autoSlug, setAutoSlug] = useState(true);
  const [description, setDescription] = useState('');
  const [httpMethod, setHttpMethod] = useState<HttpMethod>('POST');
  const [instruction, setInstruction] = useState('');
  const [mode, setMode] = useState<TransformMode>('direct');

  // Reset form when modal opens/closes or endpoint changes
  useEffect(() => {
    if (isOpen) {
      if (endpoint) {
        setName(endpoint.name);
        setSlug(endpoint.slug);
        setAutoSlug(false);
        setDescription(endpoint.description || '');
        setHttpMethod(endpoint.httpMethod);
        setInstruction(endpoint.instruction);
        setMode(endpoint.mode);
      } else {
        setName('');
        setSlug('');
        setAutoSlug(true);
        setDescription('');
        setHttpMethod('POST');
        setInstruction('');
        setMode('direct');
      }
    }
  }, [isOpen, endpoint]);

  // Auto-generate slug from name
  useEffect(() => {
    if (autoSlug && !isEditing) {
      setSlug(slugify(name));
    }
  }, [name, autoSlug, isEditing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const data: EndpointCreate | EndpointUpdate = isEditing
      ? { name, description: description || undefined, httpMethod, instruction, mode }
      : { name, slug, description: description || undefined, httpMethod, instruction, mode };

    await onSubmit(data);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-auto">
        <div className="p-6">
          <h2 className="text-lg font-semibold mb-4">
            {isEditing ? 'Edit Endpoint' : 'Create Endpoint'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Ingest Customer Feedback"
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                required
              />
            </div>

            {/* Slug */}
            {!isEditing && (
              <div>
                <label className="block text-sm font-medium mb-1">
                  Slug
                  <span className="text-muted-foreground font-normal ml-1">
                    (URL path)
                  </span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => {
                      setSlug(e.target.value);
                      setAutoSlug(false);
                    }}
                    placeholder="ingest-customer-feedback"
                    pattern="^[a-z0-9-]+$"
                    className="flex-1 px-3 py-2 border rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
                    required
                  />
                  {!autoSlug && (
                    <button
                      type="button"
                      onClick={() => {
                        setAutoSlug(true);
                        setSlug(slugify(name));
                      }}
                      className="text-xs text-primary hover:underline"
                    >
                      Auto
                    </button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Lowercase letters, numbers, and hyphens only
                </p>
              </div>
            )}

            {/* HTTP Method */}
            <div>
              <label className="block text-sm font-medium mb-1">HTTP Method</label>
              <div className="flex gap-2">
                {(['GET', 'POST', 'PUT', 'DELETE'] as HttpMethod[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setHttpMethod(m)}
                    className={`px-3 py-1.5 text-sm font-mono rounded-md border transition-colors ${
                      httpMethod === m
                        ? m === 'GET'
                          ? 'bg-green-100 text-green-700 border-green-300'
                          : m === 'POST'
                            ? 'bg-blue-100 text-blue-700 border-blue-300'
                            : m === 'PUT'
                              ? 'bg-yellow-100 text-yellow-700 border-yellow-300'
                              : 'bg-red-100 text-red-700 border-red-300'
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {httpMethod === 'GET' && 'Query data from the workflow graph'}
                {httpMethod === 'POST' && 'Create new nodes and edges'}
                {httpMethod === 'PUT' && 'Update existing nodes'}
                {httpMethod === 'DELETE' && 'Delete nodes from the graph'}
              </p>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Description
                <span className="text-muted-foreground font-normal ml-1">(optional)</span>
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of what this endpoint does"
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            {/* Instruction */}
            <div>
              <label className="block text-sm font-medium mb-1">Instruction</label>
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="Describe what this endpoint should do in natural language. E.g., 'Parse incoming customer feedback emails, extract the sentiment and key topics, and create a FeedbackItem node linked to the appropriate Customer.'"
                rows={4}
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                required
              />
              <p className="text-xs text-muted-foreground mt-1">
                The transformer will use this instruction to process incoming data
              </p>
            </div>

            {/* Mode */}
            <div>
              <label className="block text-sm font-medium mb-1">Transform Mode</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="mode"
                    value="direct"
                    checked={mode === 'direct'}
                    onChange={() => setMode('direct')}
                    className="text-primary"
                  />
                  <span className="text-sm">Direct</span>
                  <span className="text-xs text-muted-foreground">
                    (faster, for small outputs)
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="mode"
                    value="code"
                    checked={mode === 'code'}
                    onChange={() => setMode('code')}
                    className="text-primary"
                  />
                  <span className="text-sm">Code</span>
                  <span className="text-xs text-muted-foreground">
                    (for complex transforms)
                  </span>
                </label>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {isLoading ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Endpoint'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
