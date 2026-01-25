'use client';

import { useState, useEffect } from 'react';
import type { ConnectorCreate, ConnectorSummary, ConnectorUpdate, SecretKeySchema } from '@/types/connector';

interface CreateConnectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: ConnectorCreate | ConnectorUpdate) => Promise<void>;
  connector?: ConnectorSummary | null;
  isLoading: boolean;
}

export function CreateConnectorModal({
  isOpen,
  onClose,
  onSubmit,
  connector,
  isLoading,
}: CreateConnectorModalProps) {
  const isEditing = !!connector;

  const [name, setName] = useState('');
  const [system, setSystem] = useState('');
  const [description, setDescription] = useState('');
  const [urlPatterns, setUrlPatterns] = useState<string[]>([]);
  const [supportedTypes, setSupportedTypes] = useState<string[]>([]);
  const [secrets, setSecrets] = useState<SecretKeySchema[]>([]);

  const [newUrlPattern, setNewUrlPattern] = useState('');
  const [newSupportedType, setNewSupportedType] = useState('');
  const [newSecretKey, setNewSecretKey] = useState('');
  const [newSecretDescription, setNewSecretDescription] = useState('');
  const [newSecretRequired, setNewSecretRequired] = useState(true);
  const [newSecretEnvVar, setNewSecretEnvVar] = useState('');

  // Reset form when modal opens/closes or connector changes
  useEffect(() => {
    if (isOpen && connector) {
      setName(connector.name);
      setSystem(connector.system);
      setDescription(connector.description || '');
      setSupportedTypes(connector.supported_types);
      // Note: full connector data needed for url_patterns and secrets
    } else if (isOpen && !connector) {
      setName('');
      setSystem('');
      setDescription('');
      setUrlPatterns([]);
      setSupportedTypes([]);
      setSecrets([]);
    }
  }, [isOpen, connector]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isEditing) {
      await onSubmit({
        name,
        description: description || null,
        url_patterns: urlPatterns,
        supported_types: supportedTypes,
        config_schema: {
          secrets,
          settings: {},
        },
      } as ConnectorUpdate);
    } else {
      await onSubmit({
        name,
        system,
        description: description || undefined,
        url_patterns: urlPatterns,
        supported_types: supportedTypes,
        config_schema: {
          secrets,
          settings: {},
        },
      } as ConnectorCreate);
    }
  };

  const addUrlPattern = () => {
    if (newUrlPattern && !urlPatterns.includes(newUrlPattern)) {
      setUrlPatterns([...urlPatterns, newUrlPattern]);
      setNewUrlPattern('');
    }
  };

  const addSupportedType = () => {
    if (newSupportedType && !supportedTypes.includes(newSupportedType)) {
      setSupportedTypes([...supportedTypes, newSupportedType]);
      setNewSupportedType('');
    }
  };

  const addSecret = () => {
    if (newSecretKey && !secrets.some((s) => s.key === newSecretKey)) {
      setSecrets([
        ...secrets,
        {
          key: newSecretKey,
          description: newSecretDescription || newSecretKey,
          required: newSecretRequired,
          env_var: newSecretEnvVar || null,
        },
      ]);
      setNewSecretKey('');
      setNewSecretDescription('');
      setNewSecretRequired(true);
      setNewSecretEnvVar('');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden border border-border">
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              {isEditing ? 'Edit Connector' : 'Create Connector'}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="p-1 hover:bg-muted rounded"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4 max-h-[calc(90vh-140px)] overflow-auto">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                  placeholder="My Connector"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  System ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={system}
                  onChange={(e) => setSystem(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background font-mono disabled:opacity-50"
                  placeholder="my-connector"
                  required
                  disabled={isEditing}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Lowercase, no spaces. Cannot be changed after creation.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg bg-background resize-none"
                rows={2}
                placeholder="What does this connector integrate with?"
              />
            </div>

            {/* URL Patterns */}
            <div>
              <label className="block text-sm font-medium mb-1">URL Patterns</label>
              <p className="text-xs text-muted-foreground mb-2">
                Regex patterns to match URLs this connector handles
              </p>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={newUrlPattern}
                  onChange={(e) => setNewUrlPattern(e.target.value)}
                  className="flex-1 px-3 py-2 border border-border rounded-lg bg-background font-mono text-sm"
                  placeholder="https?://api\.example\.com/.*"
                />
                <button
                  type="button"
                  onClick={addUrlPattern}
                  className="px-3 py-2 bg-muted hover:bg-muted/80 rounded-lg text-sm"
                >
                  Add
                </button>
              </div>
              {urlPatterns.length > 0 && (
                <div className="space-y-1">
                  {urlPatterns.map((pattern, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 bg-muted/50 rounded">
                      <code className="flex-1 text-xs">{pattern}</code>
                      <button
                        type="button"
                        onClick={() => setUrlPatterns(urlPatterns.filter((_, idx) => idx !== i))}
                        className="text-red-500 hover:text-red-700"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Supported Types */}
            <div>
              <label className="block text-sm font-medium mb-1">Supported Object Types</label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={newSupportedType}
                  onChange={(e) => setNewSupportedType(e.target.value)}
                  className="flex-1 px-3 py-2 border border-border rounded-lg bg-background text-sm"
                  placeholder="page, document, file, etc."
                />
                <button
                  type="button"
                  onClick={addSupportedType}
                  className="px-3 py-2 bg-muted hover:bg-muted/80 rounded-lg text-sm"
                >
                  Add
                </button>
              </div>
              {supportedTypes.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {supportedTypes.map((type) => (
                    <span
                      key={type}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-blue-500/15 text-blue-400 border border-blue-500/30 rounded text-sm"
                    >
                      {type}
                      <button
                        type="button"
                        onClick={() => setSupportedTypes(supportedTypes.filter((t) => t !== type))}
                        className="hover:text-blue-900"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Required Secrets */}
            <div>
              <label className="block text-sm font-medium mb-1">Required Secrets</label>
              <p className="text-xs text-muted-foreground mb-2">
                Define what credentials this connector needs
              </p>
              <div className="p-3 border border-border rounded-lg space-y-3 bg-muted/30">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Key name</label>
                    <input
                      type="text"
                      value={newSecretKey}
                      onChange={(e) => setNewSecretKey(e.target.value)}
                      className="w-full px-2 py-1.5 border border-border rounded text-sm font-mono bg-background"
                      placeholder="api_token"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Display label</label>
                    <input
                      type="text"
                      value={newSecretDescription}
                      onChange={(e) => setNewSecretDescription(e.target.value)}
                      className="w-full px-2 py-1.5 border border-border rounded text-sm bg-background"
                      placeholder="API Token"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={newSecretRequired}
                      onChange={(e) => setNewSecretRequired(e.target.checked)}
                      className="rounded"
                    />
                    Required
                  </label>
                  <div className="flex-1">
                    <label className="block text-xs text-muted-foreground mb-1">Fallback env var (optional)</label>
                    <input
                      type="text"
                      value={newSecretEnvVar}
                      onChange={(e) => setNewSecretEnvVar(e.target.value)}
                      className="w-full px-2 py-1.5 border border-border rounded text-sm font-mono bg-background"
                      placeholder="MY_API_TOKEN"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={addSecret}
                    disabled={!newSecretKey}
                    className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90 disabled:opacity-50 self-end"
                  >
                    Add Secret
                  </button>
                </div>
              </div>
              {secrets.length > 0 && (
                <div className="mt-2 space-y-1">
                  {secrets.map((secret) => (
                    <div key={secret.key} className="flex items-center gap-2 p-2 bg-muted/50 rounded">
                      <span className="font-mono text-sm">{secret.key}</span>
                      {secret.required && <span className="text-xs text-red-500">*</span>}
                      <span className="text-xs text-muted-foreground">- {secret.description}</span>
                      {secret.env_var && (
                        <span className="text-xs text-muted-foreground">
                          (env: <code>{secret.env_var}</code>)
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setSecrets(secrets.filter((s) => s.key !== secret.key))}
                        className="ml-auto text-red-500 hover:text-red-700"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-border flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name || !system || isLoading}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              {isLoading ? 'Saving...' : isEditing ? 'Update Connector' : 'Create Connector'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
