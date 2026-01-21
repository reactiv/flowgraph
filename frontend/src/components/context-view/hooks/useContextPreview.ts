/**
 * React Query hook for fetching context preview.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ContextPreview, ContextSelector } from '@/types/context-selector';

interface UseContextPreviewOptions {
  workflowId: string;
  nodeId: string;
  contextSelector: ContextSelector;
  enabled?: boolean;
}

interface UseContextPreviewResult {
  preview: ContextPreview | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Hook to fetch a preview of what context would be included for a suggestion.
 *
 * @param options - Configuration for the preview request
 * @returns The context preview data and loading/error state
 */
export function useContextPreview({
  workflowId,
  nodeId,
  contextSelector,
  enabled = true,
}: UseContextPreviewOptions): UseContextPreviewResult {
  // Serialize contextSelector for stable queryKey (object references change on re-render)
  const contextSelectorKey = useMemo(
    () => JSON.stringify(contextSelector),
    [contextSelector]
  );

  const {
    data: preview,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['context-preview', workflowId, nodeId, contextSelectorKey],
    queryFn: () => api.previewContext(workflowId, nodeId, contextSelector),
    enabled: enabled && !!workflowId && !!nodeId,
    staleTime: 30000, // Consider data fresh for 30 seconds
  });

  return {
    preview,
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
  };
}
