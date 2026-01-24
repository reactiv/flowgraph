'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Connector, ConnectorTestResponse, SecretInfo } from '@/types/connector';
import { getStatusColor, getTypeLabel } from '@/types/connector';

interface ConnectorDetailProps {
  connector: Connector;
  onUpdate: () => void;
}

export function ConnectorDetail({ connector, onUpdate }: ConnectorDetailProps) {
  const queryClient = useQueryClient();
  const [testUrl, setTestUrl] = useState('');
  const [secretInputs, setSecretInputs] = useState<Record<string, string>>({});
  const [showSecretForm, setShowSecretForm] = useState(false);

  // Fetch configured secrets
  const { data: secrets = [], isLoading: secretsLoading } = useQuery({
    queryKey: ['connector-secrets', connector.id],
    queryFn: () => api.listConnectorSecrets(connector.id),
  });

  // Test mutation
  const testMutation = useMutation({
    mutationFn: () => api.testConnector(connector.id, testUrl ? { test_url: testUrl } : undefined),
    onSuccess: (result) => {
      setTestResult(result);
    },
  });

  // Set secret mutation
  const setSecretMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      api.setConnectorSecret(connector.id, { key, value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connector-secrets', connector.id] });
      queryClient.invalidateQueries({ queryKey: ['connectors'] });
      setSecretInputs({});
      setShowSecretForm(false);
      onUpdate();
    },
  });

  // Delete secret mutation
  const deleteSecretMutation = useMutation({
    mutationFn: (key: string) => api.deleteConnectorSecret(connector.id, key),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connector-secrets', connector.id] });
      queryClient.invalidateQueries({ queryKey: ['connectors'] });
      onUpdate();
    },
  });

  // Learn mutation
  const learnMutation = useMutation({
    mutationFn: () => api.learnConnector(connector.id, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connectors'] });
      queryClient.invalidateQueries({ queryKey: ['connector', connector.id] });
      onUpdate();
    },
  });

  const [testResult, setTestResult] = useState<ConnectorTestResponse | null>(null);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b bg-white">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold">{connector.name}</h2>
              <span className={`text-xs px-2 py-0.5 rounded ${getStatusColor(connector.status)}`}>
                {connector.status}
              </span>
            </div>
            <p className="text-sm text-muted-foreground font-mono mt-0.5">
              {connector.system}
            </p>
          </div>
          <span className="text-xs px-2 py-1 bg-muted rounded">
            {getTypeLabel(connector.connector_type)}
          </span>
        </div>
        {connector.description && (
          <p className="text-sm text-muted-foreground mt-2">{connector.description}</p>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-6">
        {/* Configuration Status */}
        <section>
          <h3 className="text-sm font-medium mb-2">Configuration Status</h3>
          <div className={`p-3 rounded-lg ${connector.is_configured ? 'bg-green-50' : 'bg-amber-50'}`}>
            <div className="flex items-center gap-2">
              {connector.is_configured ? (
                <>
                  <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm text-green-700 font-medium">Fully configured</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span className="text-sm text-amber-700 font-medium">Missing required secrets</span>
                </>
              )}
            </div>
          </div>
        </section>

        {/* Secrets Management */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium">Secrets</h3>
            <button
              onClick={() => setShowSecretForm(!showSecretForm)}
              className="text-xs text-primary hover:underline"
            >
              {showSecretForm ? 'Cancel' : '+ Add Secret'}
            </button>
          </div>

          {/* Required secrets from schema */}
          {connector.config_schema.secrets.length > 0 && (
            <div className="space-y-2 mb-3">
              {connector.config_schema.secrets.map((secretDef) => {
                const isSet = secrets.some((s) => s.key === secretDef.key);
                return (
                  <div key={secretDef.key} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                    <div>
                      <span className="text-sm font-mono">{secretDef.key}</span>
                      {secretDef.required && (
                        <span className="text-xs text-red-500 ml-1">*</span>
                      )}
                      <p className="text-xs text-muted-foreground">{secretDef.description}</p>
                      {secretDef.env_var && (
                        <p className="text-xs text-muted-foreground">
                          Fallback: <code className="bg-muted px-1 rounded">{secretDef.env_var}</code>
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {isSet ? (
                        <>
                          <span className="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded">Set</span>
                          <button
                            onClick={() => deleteSecretMutation.mutate(secretDef.key)}
                            className="text-xs text-red-600 hover:underline"
                          >
                            Remove
                          </button>
                        </>
                      ) : (
                        <span className="text-xs text-amber-600 bg-amber-100 px-2 py-0.5 rounded">Not Set</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Additional configured secrets */}
          {secrets.filter((s) => !connector.config_schema.secrets.some((def) => def.key === s.key)).length > 0 && (
            <div className="space-y-2 mb-3">
              <p className="text-xs text-muted-foreground">Additional secrets:</p>
              {secrets
                .filter((s) => !connector.config_schema.secrets.some((def) => def.key === s.key))
                .map((secret) => (
                  <div key={secret.key} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                    <span className="text-sm font-mono">{secret.key}</span>
                    <button
                      onClick={() => deleteSecretMutation.mutate(secret.key)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                ))}
            </div>
          )}

          {/* Add secret form */}
          {showSecretForm && (
            <div className="p-3 border rounded-lg space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">Key</label>
                <input
                  type="text"
                  value={secretInputs.key || ''}
                  onChange={(e) => setSecretInputs({ ...secretInputs, key: e.target.value })}
                  className="w-full px-2 py-1 text-sm border rounded"
                  placeholder="api_token"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Value</label>
                <input
                  type="password"
                  value={secretInputs.value || ''}
                  onChange={(e) => setSecretInputs({ ...secretInputs, value: e.target.value })}
                  className="w-full px-2 py-1 text-sm border rounded"
                  placeholder="Enter secret value..."
                />
              </div>
              <button
                onClick={() => {
                  if (secretInputs.key && secretInputs.value) {
                    setSecretMutation.mutate({ key: secretInputs.key, value: secretInputs.value });
                  }
                }}
                disabled={!secretInputs.key || !secretInputs.value || setSecretMutation.isPending}
                className="w-full py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
              >
                {setSecretMutation.isPending ? 'Saving...' : 'Save Secret'}
              </button>
            </div>
          )}
        </section>

        {/* Test Connection */}
        <section>
          <h3 className="text-sm font-medium mb-2">Test Connection</h3>
          <div className="space-y-2">
            <input
              type="text"
              value={testUrl}
              onChange={(e) => setTestUrl(e.target.value)}
              className="w-full px-3 py-2 text-sm border rounded-lg"
              placeholder="Optional: Enter a URL to test identification..."
            />
            <button
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending}
              className="w-full py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              {testMutation.isPending ? 'Testing...' : 'Test Connector'}
            </button>
            {testResult && (
              <div className={`p-3 rounded-lg ${testResult.success ? 'bg-green-50' : 'bg-red-50'}`}>
                <p className={`text-sm font-medium ${testResult.success ? 'text-green-700' : 'text-red-700'}`}>
                  {testResult.success ? 'Success' : 'Failed'}
                </p>
                <p className="text-sm text-muted-foreground mt-1">{testResult.message}</p>
                {testResult.details && (
                  <pre className="text-xs mt-2 p-2 bg-white/50 rounded overflow-auto">
                    {JSON.stringify(testResult.details, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Learning */}
        {connector.connector_type === 'custom' && (
          <section>
            <h3 className="text-sm font-medium mb-2">Learning</h3>
            {connector.has_learned ? (
              <div className="p-3 bg-purple-50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  <span className="text-sm text-purple-700 font-medium">Connector has learned skills</span>
                </div>
                {connector.learned_skill_md && (
                  <details className="mt-2">
                    <summary className="text-xs text-purple-600 cursor-pointer hover:underline">
                      View learned skill
                    </summary>
                    <pre className="mt-2 p-2 bg-white/50 rounded text-xs overflow-auto whitespace-pre-wrap">
                      {connector.learned_skill_md}
                    </pre>
                  </details>
                )}
              </div>
            ) : (
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground mb-2">
                  Use AI to learn how to use this connector from API documentation.
                </p>
                <button
                  onClick={() => learnMutation.mutate()}
                  disabled={learnMutation.isPending}
                  className="w-full py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                >
                  {learnMutation.isPending ? 'Learning...' : 'Start Learning'}
                </button>
              </div>
            )}
          </section>
        )}

        {/* URL Patterns */}
        {connector.url_patterns.length > 0 && (
          <section>
            <h3 className="text-sm font-medium mb-2">URL Patterns</h3>
            <div className="space-y-1">
              {connector.url_patterns.map((pattern, i) => (
                <code key={i} className="block text-xs p-2 bg-muted rounded">
                  {pattern}
                </code>
              ))}
            </div>
          </section>
        )}

        {/* Supported Types */}
        {connector.supported_types.length > 0 && (
          <section>
            <h3 className="text-sm font-medium mb-2">Supported Types</h3>
            <div className="flex flex-wrap gap-1">
              {connector.supported_types.map((type) => (
                <span key={type} className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded">
                  {type}
                </span>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
