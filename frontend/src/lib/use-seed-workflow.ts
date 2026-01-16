'use client';

import { useState, useCallback, useRef } from 'react';
import type { SeedProgressData } from '@/components/seed-progress';

interface SeedResult {
  workflow_id: string;
  scale: string;
  scenarios_generated: number;
  nodes_created: number;
  edges_created: number;
}

interface UseSeedWorkflowReturn {
  /** Start seeding with progress tracking via SSE */
  seedWithProgress: (workflowId: string, scale: 'small' | 'medium' | 'large') => Promise<SeedResult>;
  /** Current progress data, or null if not seeding */
  progress: SeedProgressData | null;
  /** Whether seeding is in progress */
  isSeeding: boolean;
  /** Error message if seeding failed */
  error: string | null;
  /** Cancel the current seeding operation */
  cancel: () => void;
}

/**
 * Hook for seeding workflows with real-time progress updates via SSE.
 *
 * @example
 * ```tsx
 * const { seedWithProgress, progress, isSeeding, error } = useSeedWorkflow();
 *
 * const handleCreate = async () => {
 *   try {
 *     const result = await seedWithProgress(workflowId, 'medium');
 *     console.log('Seeding complete:', result);
 *   } catch (err) {
 *     console.error('Seeding failed:', err);
 *   }
 * };
 * ```
 */
export function useSeedWorkflow(): UseSeedWorkflowReturn {
  const [progress, setProgress] = useState<SeedProgressData | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const cancel = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsSeeding(false);
    setProgress(null);
  }, []);

  const seedWithProgress = useCallback(
    (workflowId: string, scale: 'small' | 'medium' | 'large'): Promise<SeedResult> => {
      return new Promise((resolve, reject) => {
        // Clean up any existing connection
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
        }

        setIsSeeding(true);
        setError(null);
        setProgress({
          phase: 'scenarios',
          current: 0,
          total: 0,
          message: 'Starting...',
        });

        // Create EventSource for SSE
        // Connect directly to backend to avoid Next.js proxy buffering SSE
        // Frontend port = backend port + 1 (see scripts/dc)
        const frontendPort = parseInt(window.location.port || '3000', 10);
        const backendPort = frontendPort === 3000 ? 8000 : frontendPort - 1;
        const backendUrl = `http://${window.location.hostname}:${backendPort}`;
        const url = `${backendUrl}/api/v1/workflows/${workflowId}/seed/stream?scale=${scale}`;
        const eventSource = new EventSource(url);
        eventSourceRef.current = eventSource;

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            // Update progress
            setProgress({
              phase: data.phase || 'scenarios',
              current: data.current || 0,
              total: data.total || 0,
              message: data.message || '',
            });

            // Handle completion
            if (data.phase === 'complete') {
              eventSource.close();
              eventSourceRef.current = null;
              setIsSeeding(false);
              resolve({
                workflow_id: data.workflow_id,
                scale: data.scale,
                scenarios_generated: data.scenarios_generated,
                nodes_created: data.nodes_created,
                edges_created: data.edges_created,
              });
            }

            // Handle error
            if (data.phase === 'error') {
              eventSource.close();
              eventSourceRef.current = null;
              setIsSeeding(false);
              setError(data.message || 'Seeding failed');
              reject(new Error(data.message || 'Seeding failed'));
            }
          } catch (parseError) {
            console.error('Failed to parse SSE event:', parseError);
          }
        };

        eventSource.onerror = (err) => {
          console.error('SSE connection error:', err);
          eventSource.close();
          eventSourceRef.current = null;
          setIsSeeding(false);
          setError('Connection lost during seeding');
          reject(new Error('Connection lost during seeding'));
        };
      });
    },
    []
  );

  return {
    seedWithProgress,
    progress,
    isSeeding,
    error,
    cancel,
  };
}
