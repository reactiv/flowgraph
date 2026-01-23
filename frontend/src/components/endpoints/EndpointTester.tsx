'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { useTransformerStream } from '@/lib/use-transformer-stream';
import { TransformerProgress } from '@/components/transformer-progress';
import { LearnedAssetsViewer } from '@/components/endpoints/LearnedAssetsViewer';
import { ConfirmationDialog } from '@/components/endpoints/ConfirmationDialog';
import type { Endpoint, HttpMethod, PendingResult, RequestHistoryEntry, EndpointExecuteResponse } from '@/types/endpoint';

interface EndpointTesterProps {
  endpoint: Endpoint;
  workflowId: string;
  onEndpointUpdated?: () => void;
}

type Tab = 'body' | 'headers' | 'params' | 'instruction';

const methodColors: Record<HttpMethod, string> = {
  GET: 'bg-green-500',
  POST: 'bg-blue-500',
  PUT: 'bg-yellow-500',
  DELETE: 'bg-red-500',
};

const HISTORY_KEY = 'endpoint-tester-history';
const MAX_HISTORY = 20;
const MAX_RESPONSE_BODY_SIZE = 10000; // 10KB max for history storage

export function EndpointTester({ endpoint, workflowId, onEndpointUpdated }: EndpointTesterProps) {
  const [activeTab, setActiveTab] = useState<Tab>('body');
  const [body, setBody] = useState('{\n  \n}');
  const [headers, setHeaders] = useState<Array<{ key: string; value: string }>>([
    { key: 'Content-Type', value: 'application/json' },
  ]);
  const [params, setParams] = useState<Array<{ key: string; value: string }>>([]);
  const [learnMode, setLearnMode] = useState(false);
  const [confirmFirst, setConfirmFirst] = useState(false);
  const [pendingResult, setPendingResult] = useState<PendingResult | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  // Instruction editing
  const [instruction, setInstruction] = useState(endpoint.instruction);
  const [isSavingInstruction, setIsSavingInstruction] = useState(false);
  const [isResettingLearning, setIsResettingLearning] = useState(false);
  const instructionModified = instruction !== endpoint.instruction;

  // Sync instruction when endpoint changes
  useEffect(() => {
    setInstruction(endpoint.instruction);
  }, [endpoint.instruction]);

  const [response, setResponse] = useState<{
    status: number;
    body: string;
    timeMs: number;
    headers?: Record<string, string>;
  } | null>(null);

  const [history, setHistory] = useState<RequestHistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Streaming support for long-running operations
  const stream = useTransformerStream<EndpointExecuteResponse>();

  // Load history from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(HISTORY_KEY);
    if (stored) {
      try {
        setHistory(JSON.parse(stored));
      } catch {
        // Ignore invalid JSON
      }
    }
  }, []);

  const saveHistory = useCallback((entries: RequestHistoryEntry[]) => {
    setHistory(entries);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
    } catch {
      // If quota exceeded, try clearing old entries
      const trimmed = entries.slice(0, Math.max(5, entries.length - 5));
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
        setHistory(trimmed);
      } catch {
        // If still failing, clear history entirely
        localStorage.removeItem(HISTORY_KEY);
        setHistory([]);
      }
    }
  }, []);

  const url = api.getEndpointUrl(workflowId, endpoint.slug);

  const buildCurl = () => {
    const parts = ['curl'];

    if (endpoint.httpMethod !== 'GET') {
      parts.push(`-X ${endpoint.httpMethod}`);
    }

    // Add headers
    headers.forEach(({ key, value }) => {
      if (key && value) {
        parts.push(`-H '${key}: ${value}'`);
      }
    });

    // Add body
    if (['POST', 'PUT'].includes(endpoint.httpMethod) && body.trim()) {
      parts.push(`-d '${body.replace(/'/g, "'\\''")}'`);
    }

    // Add URL with params
    let fullUrl = url;
    const queryParams = params.filter((p) => p.key && p.value);
    if (queryParams.length > 0 || learnMode) {
      const searchParams = new URLSearchParams();
      if (learnMode) searchParams.set('learn', 'true');
      queryParams.forEach(({ key, value }) => searchParams.set(key, value));
      fullUrl += '?' + searchParams.toString();
    }
    parts.push(`'${fullUrl}'`);

    return parts.join(' \\\n  ');
  };

  const handleSend = async () => {
    stream.reset();
    setResponse(null);

    const startTime = Date.now();

    // Build URL for streaming endpoint
    const streamUrl = `/x/${workflowId}/${endpoint.slug}/stream`;

    // Build headers
    const reqHeaders: Record<string, string> = {};
    headers.forEach(({ key, value }) => {
      if (key && value) reqHeaders[key] = value;
    });

    // Build request body for the stream endpoint
    const requestBody = JSON.stringify({
      inputData: body.trim() ? JSON.parse(body) : null,
      learn: learnMode,
      apply: !confirmFirst, // Don't apply if confirm first is enabled
    });

    try {
      // Result is the raw "complete" event from SSE stream
      // Type assertion needed because the stream returns TransformerEvent, not EndpointExecuteResponse
      const result = (await stream.start(streamUrl, {
        method: 'POST',
        body: requestBody,
      })) as unknown as Record<string, unknown>;

      const timeMs = Date.now() - startTime;
      const formattedBody = JSON.stringify(result, null, 2);

      // Determine status: "complete" event means success, "error" means failure
      const isSuccess = result.event === 'complete';
      const status = isSuccess ? 200 : 500;

      // Check if this is a preview result
      const isPreview = result.preview === true && confirmFirst;

      if (isPreview && isSuccess) {
        // Extract learned assets from the result or stream events
        // The backend now includes learned_skill_md and learned_transformer_code in the response
        const skillMd = (result.learned_skill_md as string | undefined) ||
          (stream.events.find((e) => e.event === 'skill_saved')?.skillMd as string | undefined);
        const transformCode = result.learned_transformer_code as string | undefined;

        // Set pending result for confirmation dialog
        setPendingResult({
          transformResult: result.transform_result as PendingResult['transformResult'],
          skillMd,
          transformCode,
          httpMethod: endpoint.httpMethod,
          nodesCreated: result.nodes_created as number | undefined,
          edgesCreated: result.edges_created as number | undefined,
          nodesUpdated: result.nodes_updated as number | undefined,
          nodesDeleted: result.nodes_deleted as number | undefined,
          nodesToCreate: result.nodes_to_create as PendingResult['nodesToCreate'],
          edgesToCreate: result.edges_to_create as PendingResult['edgesToCreate'],
          updatesToApply: result.updates_to_apply as PendingResult['updatesToApply'],
          nodesToDelete: result.nodes_to_delete as PendingResult['nodesToDelete'],
          matchResult: result.match_result as PendingResult['matchResult'],
        });
        // Don't set response yet - wait for confirmation
        return;
      }

      setResponse({
        status,
        body: formattedBody,
        timeMs,
      });

      // Add to history (truncate large response bodies to avoid localStorage quota issues)
      const truncatedResponseBody =
        formattedBody.length > MAX_RESPONSE_BODY_SIZE
          ? formattedBody.slice(0, MAX_RESPONSE_BODY_SIZE) +
            `\n\n... [truncated, ${formattedBody.length - MAX_RESPONSE_BODY_SIZE} more characters]`
          : formattedBody;

      // Build display URL for history
      let displayUrl = `/x/${workflowId}/${endpoint.slug}`;
      const queryParams = params.filter((p) => p.key && p.value);
      if (queryParams.length > 0 || learnMode) {
        const searchParams = new URLSearchParams();
        if (learnMode) searchParams.set('learn', 'true');
        queryParams.forEach(({ key, value }) => searchParams.set(key, value));
        displayUrl += '?' + searchParams.toString();
      }

      const historyEntry: RequestHistoryEntry = {
        id: crypto.randomUUID(),
        endpointId: endpoint.id,
        endpointSlug: endpoint.slug,
        httpMethod: endpoint.httpMethod,
        url: displayUrl,
        headers: reqHeaders,
        body,
        response: {
          status,
          body: truncatedResponseBody,
          timeMs,
        },
        timestamp: new Date().toISOString(),
      };
      const newHistory = [historyEntry, ...history].slice(0, MAX_HISTORY);
      saveHistory(newHistory);

      // Notify parent if we learned
      if (learnMode && isSuccess && onEndpointUpdated) {
        onEndpointUpdated();
      }
    } catch (err) {
      // Error is already set in stream.error
      const timeMs = Date.now() - startTime;
      setResponse({
        status: 500,
        body: JSON.stringify({ error: err instanceof Error ? err.message : 'Request failed' }, null, 2),
        timeMs,
      });
    }
  };

  const loadFromHistory = (entry: RequestHistoryEntry) => {
    setBody(entry.body);
    setHeaders(Object.entries(entry.headers).map(([key, value]) => ({ key, value })));
    setShowHistory(false);
  };

  const addHeader = () => setHeaders([...headers, { key: '', value: '' }]);
  const removeHeader = (index: number) => setHeaders(headers.filter((_, i) => i !== index));
  const updateHeader = (index: number, field: 'key' | 'value', value: string) => {
    const newHeaders = [...headers];
    const header = newHeaders[index];
    if (header) {
      header[field] = value;
      setHeaders(newHeaders);
    }
  };

  const addParam = () => setParams([...params, { key: '', value: '' }]);
  const removeParam = (index: number) => setParams(params.filter((_, i) => i !== index));
  const updateParam = (index: number, field: 'key' | 'value', value: string) => {
    const newParams = [...params];
    const param = newParams[index];
    if (param) {
      param[field] = value;
      setParams(newParams);
    }
  };

  const endpointHistory = history.filter((h) => h.endpointId === endpoint.id);

  const handleSaveInstruction = async () => {
    setIsSavingInstruction(true);
    try {
      await api.updateEndpoint(workflowId, endpoint.id, { instruction });
      onEndpointUpdated?.();
    } catch (err) {
      console.error('Failed to save instruction:', err);
    } finally {
      setIsSavingInstruction(false);
    }
  };

  const handleResetLearning = async () => {
    if (!confirm('This will clear the learned SKILL.md and transformer code. Continue?')) {
      return;
    }
    setIsResettingLearning(true);
    try {
      await api.resetEndpointLearning(workflowId, endpoint.id);
      onEndpointUpdated?.();
    } catch (err) {
      console.error('Failed to reset learning:', err);
    } finally {
      setIsResettingLearning(false);
    }
  };

  const handleConfirmApply = async () => {
    if (!pendingResult) return;

    setIsApplying(true);
    const startTime = Date.now();

    try {
      const result = await api.applyEndpointPreview(workflowId, endpoint.slug, {
        transformResult: pendingResult.transformResult as unknown as Record<string, unknown>,
        matchResult: pendingResult.matchResult as unknown as Record<string, unknown> | undefined,
      });

      const timeMs = Date.now() - startTime;
      const formattedBody = JSON.stringify(result, null, 2);

      setResponse({
        status: result.success ? 200 : 500,
        body: formattedBody,
        timeMs,
      });

      // Notify parent if changes were applied
      if (result.success && onEndpointUpdated) {
        onEndpointUpdated();
      }
    } catch (err) {
      const timeMs = Date.now() - startTime;
      setResponse({
        status: 500,
        body: JSON.stringify(
          { error: err instanceof Error ? err.message : 'Failed to apply changes' },
          null,
          2
        ),
        timeMs,
      });
    } finally {
      setIsApplying(false);
      setPendingResult(null);
    }
  };

  const handleCancelPreview = () => {
    setPendingResult(null);
    stream.reset();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b bg-white">
        <div className="flex items-center gap-3 mb-3">
          <span
            className={cn(
              'text-xs font-mono font-bold px-2 py-1 rounded text-white',
              methodColors[endpoint.httpMethod]
            )}
          >
            {endpoint.httpMethod}
          </span>
          <div className="flex-1 font-mono text-sm bg-muted px-3 py-1.5 rounded truncate">
            {url}
          </div>
          <button
            onClick={() => navigator.clipboard.writeText(url)}
            className="text-xs text-muted-foreground hover:text-foreground"
            title="Copy URL"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={learnMode}
                onChange={(e) => setLearnMode(e.target.checked)}
                className="rounded"
              />
              <span>Learn mode</span>
              {!endpoint.isLearned && (
                <span className="text-xs text-amber-600">(recommended for first run)</span>
              )}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={confirmFirst}
                onChange={(e) => setConfirmFirst(e.target.checked)}
                className="rounded"
              />
              <span>Confirm first</span>
            </label>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              History ({endpointHistory.length})
            </button>
            <button
              onClick={() => navigator.clipboard.writeText(buildCurl())}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy cURL
            </button>
            {stream.isRunning ? (
              <button
                onClick={stream.cancel}
                className="px-4 py-1.5 bg-destructive text-destructive-foreground rounded text-sm font-medium hover:bg-destructive/90 transition-colors"
              >
                Cancel
              </button>
            ) : (
              <button
                onClick={handleSend}
                className="px-4 py-1.5 bg-primary text-primary-foreground rounded text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Send
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Request/Response split */}
      <div className="flex-1 flex overflow-hidden">
        {/* Request panel */}
        <div className="w-1/2 border-r flex flex-col overflow-hidden">
          {/* Tabs */}
          <div className="border-b bg-muted/30 px-4 flex gap-1">
            {(['body', 'headers', 'params'] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'px-3 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px',
                  activeTab === tab
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {tab}
                {tab === 'headers' && headers.filter((h) => h.key).length > 0 && (
                  <span className="ml-1 text-xs bg-muted px-1.5 rounded">
                    {headers.filter((h) => h.key).length}
                  </span>
                )}
                {tab === 'params' && params.filter((p) => p.key).length > 0 && (
                  <span className="ml-1 text-xs bg-muted px-1.5 rounded">
                    {params.filter((p) => p.key).length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-auto p-4">
            {activeTab === 'body' && (
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder='{"key": "value"}'
                className="w-full h-full font-mono text-sm p-3 border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
                spellCheck={false}
              />
            )}

            {activeTab === 'headers' && (
              <div className="space-y-2">
                {headers.map((header, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      value={header.key}
                      onChange={(e) => updateHeader(index, 'key', e.target.value)}
                      placeholder="Header name"
                      className="flex-1 px-3 py-1.5 border rounded text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <input
                      type="text"
                      value={header.value}
                      onChange={(e) => updateHeader(index, 'value', e.target.value)}
                      placeholder="Value"
                      className="flex-1 px-3 py-1.5 border rounded text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <button
                      onClick={() => removeHeader(index)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
                <button
                  onClick={addHeader}
                  className="text-sm text-primary hover:underline"
                >
                  + Add header
                </button>
              </div>
            )}

            {activeTab === 'params' && (
              <div className="space-y-2">
                {params.map((param, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      value={param.key}
                      onChange={(e) => updateParam(index, 'key', e.target.value)}
                      placeholder="Parameter name"
                      className="flex-1 px-3 py-1.5 border rounded text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <input
                      type="text"
                      value={param.value}
                      onChange={(e) => updateParam(index, 'value', e.target.value)}
                      placeholder="Value"
                      className="flex-1 px-3 py-1.5 border rounded text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <button
                      onClick={() => removeParam(index)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
                <button
                  onClick={addParam}
                  className="text-sm text-primary hover:underline"
                >
                  + Add parameter
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Response panel */}
        <div className="w-1/2 flex flex-col overflow-hidden">
          <div className="border-b bg-muted/30 px-4 py-2 flex items-center justify-between">
            <span className="text-sm font-medium">Response</span>
            {response && (
              <div className="flex items-center gap-3 text-xs">
                <span
                  className={cn(
                    'font-medium',
                    response.status >= 200 && response.status < 300
                      ? 'text-green-600'
                      : response.status >= 400
                        ? 'text-red-600'
                        : 'text-yellow-600'
                  )}
                >
                  {response.status}
                </span>
                <span className="text-muted-foreground">{response.timeMs}ms</span>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-auto p-4">
            {stream.isRunning || (stream.error && stream.events.length > 0) ? (
              <div className="space-y-4">
                <TransformerProgress
                  events={stream.events}
                  isRunning={stream.isRunning}
                  error={stream.error}
                />
              </div>
            ) : stream.error ? (
              <div className="p-4 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
                {stream.error}
              </div>
            ) : response ? (
              <pre className="font-mono text-xs whitespace-pre-wrap bg-muted/50 p-3 rounded-md overflow-auto">
                {response.body}
              </pre>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                Send a request to see the response
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Learned assets section */}
      {endpoint.isLearned && (
        <LearnedAssetsViewer
          skillMd={endpoint.learnedSkillMd}
          transformerCode={endpoint.learnedTransformerCode}
          mode={endpoint.mode}
          learnedAt={endpoint.learnedAt}
        />
      )}

      {/* History panel */}
      {showHistory && (
        <div className="absolute top-0 right-0 w-80 h-full bg-white border-l shadow-lg z-10 flex flex-col">
          <div className="p-4 border-b flex items-center justify-between">
            <h3 className="font-medium">Request History</h3>
            <button
              onClick={() => setShowHistory(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-auto">
            {endpointHistory.length === 0 ? (
              <div className="p-4 text-muted-foreground text-sm text-center">
                No history yet
              </div>
            ) : (
              <div className="divide-y">
                {endpointHistory.map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => loadFromHistory(entry)}
                    className="w-full p-3 text-left hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={cn(
                          'text-xs font-mono font-medium',
                          entry.response.status >= 200 && entry.response.status < 300
                            ? 'text-green-600'
                            : 'text-red-600'
                        )}
                      >
                        {entry.response.status}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {entry.response.timeMs}ms
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {new Date(entry.timestamp).toLocaleString()}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          {endpointHistory.length > 0 && (
            <div className="p-3 border-t">
              <button
                onClick={() => {
                  const filtered = history.filter((h) => h.endpointId !== endpoint.id);
                  saveHistory(filtered);
                }}
                className="text-xs text-destructive hover:underline"
              >
                Clear history for this endpoint
              </button>
            </div>
          )}
        </div>
      )}

      {/* Confirmation Dialog */}
      {pendingResult && (
        <ConfirmationDialog
          open={!!pendingResult}
          onConfirm={handleConfirmApply}
          onCancel={handleCancelPreview}
          pendingResult={pendingResult}
          isApplying={isApplying}
        />
      )}
    </div>
  );
}
