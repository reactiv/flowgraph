'use client';

import { useState, useCallback, useRef } from 'react';
import type { TransformerEvent } from '@/components/transformer-progress';

interface StartOptions {
  /** HTTP method (default: GET) */
  method?: 'GET' | 'POST';
  /** Request body for POST requests */
  body?: string;
}

interface UseTransformerStreamReturn<T> {
  /** Start streaming from a URL */
  start: (url: string, options?: StartOptions) => Promise<T>;
  /** All received events */
  events: TransformerEvent[];
  /** Final result (available after completion) */
  result: T | null;
  /** Whether stream is active */
  isRunning: boolean;
  /** Error message if failed */
  error: string | null;
  /** Cancel the stream */
  cancel: () => void;
  /** Reset state */
  reset: () => void;
}

/**
 * Hook for streaming transformer events via SSE.
 *
 * @example
 * ```tsx
 * const { start, events, result, isRunning, error } = useTransformerStream<SchemaResult>();
 *
 * const handleGenerate = async () => {
 *   const result = await start(
 *     `/api/v1/workflows/from-files/stream?upload_id=${uploadId}&description=${desc}`
 *   );
 *   console.log('Generated schema:', result.definition);
 * };
 *
 * // Show progress
 * <TransformerProgress events={events} isRunning={isRunning} error={error} />
 * ```
 */
export function useTransformerStream<T>(): UseTransformerStreamReturn<T> {
  const [events, setEvents] = useState<TransformerEvent[]>([]);
  const [result, setResult] = useState<T | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsRunning(false);
  }, []);

  const reset = useCallback(() => {
    cancel();
    setEvents([]);
    setResult(null);
    setError(null);
  }, [cancel]);

  /**
   * Process SSE data from a fetch response body.
   * Returns a promise that resolves with the complete event data.
   */
  const processSSEStream = useCallback(
    async (
      reader: ReadableStreamDefaultReader<Uint8Array>,
      resolve: (value: T) => void,
      reject: (reason: Error) => void
    ) => {
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            setIsRunning(false);
            reject(new Error('Stream ended unexpectedly'));
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6)) as TransformerEvent;
                setEvents((prev) => [...prev, data]);

                if (data.event === 'complete') {
                  setIsRunning(false);
                  setResult(data as unknown as T);
                  resolve(data as unknown as T);
                  return;
                }

                if (data.event === 'error') {
                  setIsRunning(false);
                  const errorMessage =
                    (data.message as string) || 'Transformation failed';
                  setError(errorMessage);
                  reject(new Error(errorMessage));
                  return;
                }
              } catch (parseError) {
                console.error('Failed to parse SSE event:', parseError);
              }
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          // Cancelled by user
          return;
        }
        setIsRunning(false);
        const errorMessage = (err as Error).message || 'Connection lost';
        setError(errorMessage);
        reject(new Error(errorMessage));
      }
    },
    []
  );

  const start = useCallback(
    (url: string, options?: StartOptions): Promise<T> => {
      return new Promise((resolve, reject) => {
        // Clean up any existing connection
        cancel();

        setIsRunning(true);
        setError(null);
        setEvents([]);
        setResult(null);

        // Connect directly to backend to avoid Next.js proxy buffering SSE
        // Use NEXT_PUBLIC_BACKEND_URL if set, otherwise calculate from frontend port
        let backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) {
          const frontendPort = parseInt(window.location.port || '3000', 10);
          const backendPort = frontendPort === 3000 ? 8000 : frontendPort - 1;
          backendUrl = `http://${window.location.hostname}:${backendPort}`;
        }

        // If URL starts with /, prepend backend URL
        const fullUrl = url.startsWith('/') ? `${backendUrl}${url}` : url;

        const method = options?.method || 'GET';

        if (method === 'POST') {
          // Use fetch for POST requests
          const abortController = new AbortController();
          abortControllerRef.current = abortController;

          fetch(fullUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: options?.body,
            signal: abortController.signal,
          })
            .then((response) => {
              if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
              }
              if (!response.body) {
                throw new Error('Response body is null');
              }
              const reader = response.body.getReader();
              return processSSEStream(reader, resolve, reject);
            })
            .catch((err) => {
              if ((err as Error).name === 'AbortError') {
                return;
              }
              setIsRunning(false);
              const errorMessage = (err as Error).message || 'Connection failed';
              setError(errorMessage);
              reject(new Error(errorMessage));
            });
        } else {
          // Use EventSource for GET requests
          const eventSource = new EventSource(fullUrl);
          eventSourceRef.current = eventSource;

          eventSource.onmessage = (msgEvent) => {
            try {
              const data = JSON.parse(msgEvent.data) as TransformerEvent;

              // Add to events list
              setEvents((prev) => [...prev, data]);

              // Handle completion
              if (data.event === 'complete') {
                eventSource.close();
                eventSourceRef.current = null;
                setIsRunning(false);
                setResult(data as unknown as T);
                resolve(data as unknown as T);
              }

              // Handle error
              if (data.event === 'error') {
                eventSource.close();
                eventSourceRef.current = null;
                setIsRunning(false);
                const errorMessage =
                  (data.message as string) || 'Transformation failed';
                setError(errorMessage);
                reject(new Error(errorMessage));
              }
            } catch (parseError) {
              console.error('Failed to parse SSE event:', parseError);
            }
          };

          eventSource.onerror = (err) => {
            console.error('SSE connection error:', err);
            eventSource.close();
            eventSourceRef.current = null;
            setIsRunning(false);
            setError('Connection lost');
            reject(new Error('Connection lost'));
          };
        }
      });
    },
    [cancel, processSSEStream]
  );

  return {
    start,
    events,
    result,
    isRunning,
    error,
    cancel,
    reset,
  };
}
