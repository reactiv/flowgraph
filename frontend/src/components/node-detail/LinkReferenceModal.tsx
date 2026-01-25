'use client';

import { useState } from 'react';
import { Link2, Loader2, AlertCircle, CheckCircle, FileText, Folder, Database } from 'lucide-react';
import { api } from '@/lib/api';
import { modal, input, button, card } from '@/lib/theme';
import type { ReferenceRelationship, ResolveUrlResponse } from '@/types/external-reference';

interface LinkReferenceModalProps {
  workflowId: string;
  nodeId: string;
  isOpen: boolean;
  onClose: () => void;
  onLink: () => void;
}

const SYSTEM_CONFIG: Record<string, { icon: typeof FileText; label: string; bgColor: string; textColor: string }> = {
  notion: {
    icon: FileText,
    label: 'Notion',
    bgColor: 'bg-gray-900',
    textColor: 'text-white',
  },
  gdrive: {
    icon: Folder,
    label: 'Google Drive',
    bgColor: 'bg-green-600',
    textColor: 'text-white',
  },
  github: {
    icon: Database,
    label: 'GitHub',
    bgColor: 'bg-gray-800',
    textColor: 'text-white',
  },
};

const RELATIONSHIP_OPTIONS: { value: ReferenceRelationship; label: string; description: string }[] = [
  {
    value: 'source',
    label: 'Source',
    description: 'This node was created from or represents this external content',
  },
  {
    value: 'related',
    label: 'Related',
    description: 'This node is related to this external content',
  },
  {
    value: 'derived_from',
    label: 'Derived From',
    description: 'This node\'s data was derived from this external content',
  },
];

export function LinkReferenceModal({
  workflowId,
  nodeId,
  isOpen,
  onClose,
  onLink,
}: LinkReferenceModalProps) {
  const [url, setUrl] = useState('');
  const [relationship, setRelationship] = useState<ReferenceRelationship>('source');
  const [isResolving, setIsResolving] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<ResolveUrlResponse | null>(null);

  const handleResolve = async () => {
    if (!url.trim()) {
      setError('Please enter a URL');
      return;
    }

    setIsResolving(true);
    setError(null);
    setResolved(null);

    try {
      const response = await api.resolveUrl(url.trim());
      setResolved(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve URL');
    } finally {
      setIsResolving(false);
    }
  };

  const handleLink = async () => {
    if (!resolved) return;

    setIsLinking(true);
    setError(null);

    try {
      await api.linkNodeReference(workflowId, nodeId, resolved.reference.id, relationship);
      onLink();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link reference');
      setIsLinking(false);
    }
  };

  const handleClose = () => {
    setUrl('');
    setRelationship('source');
    setIsResolving(false);
    setIsLinking(false);
    setError(null);
    setResolved(null);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!resolved) {
        handleResolve();
      } else {
        handleLink();
      }
    }
  };

  if (!isOpen) return null;

  // Get system config for resolved reference
  const systemConfig = resolved
    ? SYSTEM_CONFIG[resolved.reference.system] || {
        icon: FileText,
        label: resolved.reference.system,
        bgColor: 'bg-gray-600',
        textColor: 'text-white',
      }
    : null;
  const SystemIcon = systemConfig?.icon || FileText;

  return (
    <div className={modal.backdrop}>
      {/* Backdrop click to close */}
      <div className="absolute inset-0" onClick={handleClose} />

      {/* Modal */}
      <div className={`relative ${modal.container}`}>
        {/* Header */}
        <div className={`flex items-center gap-3 ${modal.header}`}>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <Link2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Link External Reference
            </h2>
            <p className="text-sm text-muted-foreground">
              Connect this node to external content from Notion, Google Drive, etc.
            </p>
          </div>
        </div>

        <div className={`${modal.content} space-y-4`}>
          {/* URL Input */}
          <div>
            <label htmlFor="reference-url" className="block text-sm font-medium text-foreground mb-1">
              URL
            </label>
            <div className="flex gap-2">
              <input
                id="reference-url"
                type="url"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setResolved(null);
                  setError(null);
                }}
                onKeyDown={handleKeyDown}
                placeholder="https://notion.so/... or https://drive.google.com/..."
                className={`flex-1 ${input.base} ${input.md}`}
                disabled={isResolving || isLinking}
              />
              <button
                onClick={handleResolve}
                disabled={isResolving || !url.trim()}
                className={button.secondary}
              >
                {isResolving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Resolve'
                )}
              </button>
            </div>
          </div>

          {/* Resolved Preview */}
          {resolved && systemConfig && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  <CheckCircle className="h-5 w-5 text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className={`flex items-center justify-center w-6 h-6 rounded ${systemConfig.bgColor}`}
                    >
                      <SystemIcon className={`h-3.5 w-3.5 ${systemConfig.textColor}`} />
                    </div>
                    <span className="text-sm font-medium text-foreground">
                      {systemConfig.label} {resolved.reference.object_type}
                    </span>
                    {resolved.is_new && (
                      <span className="inline-block px-1.5 py-0.5 text-xs font-medium rounded bg-blue-500/15 text-blue-400 border border-blue-500/30">
                        New
                      </span>
                    )}
                  </div>

                  {/* Reference details */}
                  <div className="space-y-1 text-sm">
                    <div>
                      <span className="font-medium text-foreground">
                        {resolved.projection?.title || resolved.reference.display_name || 'Untitled'}
                      </span>
                    </div>
                    {resolved.projection?.summary && (
                      <p className="text-muted-foreground line-clamp-2">{resolved.projection.summary}</p>
                    )}
                    {resolved.projection?.owner && (
                      <div className="text-muted-foreground">
                        Owner: {resolved.projection.owner}
                      </div>
                    )}
                    {resolved.projection?.status && (
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Status:</span>
                        <span className="inline-block px-1.5 py-0.5 text-xs font-medium rounded bg-blue-500/15 text-blue-400 border border-blue-500/30">
                          {resolved.projection.status}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Relationship Selection */}
          {resolved && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Relationship Type
              </label>
              <div className="space-y-2">
                {RELATIONSHIP_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      relationship === option.value
                        ? 'border-primary bg-primary/10'
                        : `${card.base} hover:border-primary/30`
                    }`}
                  >
                    <input
                      type="radio"
                      name="relationship"
                      value={option.value}
                      checked={relationship === option.value}
                      onChange={(e) => setRelationship(e.target.value as ReferenceRelationship)}
                      className="mt-0.5 accent-primary"
                    />
                    <div>
                      <div className="text-sm font-medium text-foreground">{option.label}</div>
                      <div className="text-xs text-muted-foreground">{option.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 rounded-md bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={modal.footer}>
          <button
            onClick={handleClose}
            className={button.ghost}
            disabled={isResolving || isLinking}
          >
            Cancel
          </button>
          {resolved && (
            <button
              onClick={handleLink}
              disabled={isLinking}
              className={`${button.primary} disabled:opacity-50`}
            >
              {isLinking ? (
                <>
                  <Loader2 className="inline h-4 w-4 animate-spin mr-1" />
                  Linking...
                </>
              ) : (
                'Link to Node'
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
