'use client';

import { useState, useCallback, useRef } from 'react';
import type { TransformerEvent } from '@/components/transformer-progress';

interface UseTransformerStreamReturn<T> {
  /** Start streaming from a URL */
  start: (url: string) => Promise<T>;
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

  const cancel = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsRunning(false);
  }, []);

  const reset = useCallback(() => {
    cancel();
    setEvents([]);
    setResult(null);
    setError(null);
  }, [cancel]);

  const start = useCallback(
    (url: string): Promise<T> => {
      return new Promise((resolve, reject) => {
        // Clean up any existing connection
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
        }

        setIsRunning(true);
        setError(null);
        setEvents([]);
        setResult(null);

        // Connect directly to backend to avoid Next.js proxy buffering SSE
        const frontendPort = parseInt(window.location.port || '3000', 10);
        const backendPort = frontendPort === 3000 ? 8000 : frontendPort - 1;
        const backendUrl = `http://${window.location.hostname}:${backendPort}`;

        // If URL starts with /, prepend backend URL
        const fullUrl = url.startsWith('/') ? `${backendUrl}${url}` : url;

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
              const errorMessage = (data.message as string) || 'Transformation failed';
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
      });
    },
    []
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
