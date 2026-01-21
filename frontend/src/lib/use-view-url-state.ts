'use client';

import { useCallback, useMemo } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import type { FilterGroup } from '@/types/view-templates';

// URL parameter names
const PARAM_VIEW = 'view';
const PARAM_NODE = 'node';
const PARAM_RECORD = 'record';
const PARAM_FILTERS = 'filters';
const PARAM_SORT = 'sort';
const PARAM_ORDER = 'order';
const PARAM_FOCAL = 'focal';
const PARAM_HOPS = 'hops';

// Built-in view identifiers
export const BUILTIN_VIEWS = ['list', 'schema', 'graph'] as const;
export type BuiltinView = (typeof BUILTIN_VIEWS)[number];

export interface ViewUrlState {
  viewId: string | null; // null = list view
  nodeId: string | null;
  recordId: string | null;
  filters: FilterGroup | null;
  sort: { field: string; order: 'asc' | 'desc' } | null;
  // Graph view focal node state
  focalNodeId: string | null;
  hopCount: number;
}

export interface ViewUrlStateActions {
  setView: (viewId: string | null) => void;
  setNode: (nodeId: string | null) => void;
  setRecord: (recordId: string | null) => void;
  setFilters: (filters: FilterGroup | null) => void;
  setSort: (field: string | null, order?: 'asc' | 'desc') => void;
  setFocalNode: (nodeId: string | null) => void;
  setHopCount: (hops: number) => void;
  updateMultiple: (updates: Partial<ViewUrlState>) => void;
  clearAll: () => void;
}

/**
 * Encode a FilterGroup to a URL-safe base64url string.
 * Uses base64url encoding (- and _ instead of + and /, no padding).
 */
export function encodeFilters(filterGroup: FilterGroup): string {
  const json = JSON.stringify(filterGroup);
  // btoa doesn't work with unicode, so we need to encode first
  const base64 = btoa(unescape(encodeURIComponent(json)));
  // Convert to base64url
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Decode a base64url string back to a FilterGroup.
 * Returns null if decoding fails.
 */
export function decodeFilters(encoded: string): FilterGroup | null {
  try {
    // Add padding if needed
    const padded = encoded + '=='.slice(0, (4 - (encoded.length % 4)) % 4);
    // Convert from base64url to base64
    const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(escape(atob(base64)));
    const parsed = JSON.parse(json);
    // Basic validation - must have logic and filters array
    if (parsed && typeof parsed.logic === 'string' && Array.isArray(parsed.filters)) {
      return parsed as FilterGroup;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Hook for managing view-related URL state.
 * Provides reactive state from URL params and actions to update them.
 */
export function useViewUrlState(): [ViewUrlState, ViewUrlStateActions] {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Parse current state from URL
  const state = useMemo<ViewUrlState>(() => {
    const viewParam = searchParams.get(PARAM_VIEW);
    const nodeParam = searchParams.get(PARAM_NODE);
    const recordParam = searchParams.get(PARAM_RECORD);
    const filtersParam = searchParams.get(PARAM_FILTERS);
    const sortParam = searchParams.get(PARAM_SORT);
    const orderParam = searchParams.get(PARAM_ORDER);
    const focalParam = searchParams.get(PARAM_FOCAL);
    const hopsParam = searchParams.get(PARAM_HOPS);

    // Parse view - null means list view (default)
    let viewId: string | null = null;
    if (viewParam === 'schema' || viewParam === 'graph') {
      viewId = viewParam;
    } else if (viewParam && viewParam !== 'list') {
      viewId = viewParam; // Custom view ID
    }

    // Parse filters
    const filters = filtersParam ? decodeFilters(filtersParam) : null;

    // Parse sort
    const sortOrder: 'asc' | 'desc' = orderParam === 'desc' ? 'desc' : 'asc';
    const sort = sortParam ? { field: sortParam, order: sortOrder } : null;

    // Parse focal node and hop count
    const focalNodeId = focalParam || null;
    const hopCount = hopsParam ? parseInt(hopsParam, 10) : 2;

    return {
      viewId,
      nodeId: nodeParam,
      recordId: recordParam,
      filters,
      sort,
      focalNodeId,
      hopCount: isNaN(hopCount) ? 2 : Math.max(1, Math.min(5, hopCount)),
    };
  }, [searchParams]);

  // Helper to build new URL from state updates
  const buildUrl = useCallback(
    (updates: Partial<ViewUrlState>, clearViewSpecific = false): string => {
      const newParams = new URLSearchParams(searchParams.toString());

      // Handle view changes
      if ('viewId' in updates) {
        const viewId = updates.viewId;
        if (viewId === null || viewId === undefined) {
          newParams.delete(PARAM_VIEW);
        } else {
          newParams.set(PARAM_VIEW, viewId);
        }
        // Clear view-specific state when changing views
        if (clearViewSpecific) {
          newParams.delete(PARAM_FILTERS);
          newParams.delete(PARAM_SORT);
          newParams.delete(PARAM_ORDER);
          newParams.delete(PARAM_RECORD);
          newParams.delete(PARAM_FOCAL);
          newParams.delete(PARAM_HOPS);
        }
      }

      // Handle node changes
      if ('nodeId' in updates) {
        const nodeId = updates.nodeId;
        if (nodeId === null || nodeId === undefined) {
          newParams.delete(PARAM_NODE);
        } else {
          newParams.set(PARAM_NODE, nodeId);
        }
      }

      // Handle record changes
      if ('recordId' in updates) {
        const recordId = updates.recordId;
        if (recordId === null || recordId === undefined) {
          newParams.delete(PARAM_RECORD);
        } else {
          newParams.set(PARAM_RECORD, recordId);
        }
      }

      // Handle filter changes
      if ('filters' in updates) {
        const filters = updates.filters;
        if (filters === null || filters === undefined || filters.filters.length === 0) {
          newParams.delete(PARAM_FILTERS);
        } else {
          const encoded = encodeFilters(filters);
          // Warn if encoded filters are getting long
          if (encoded.length > 1500) {
            console.warn(
              `[useViewUrlState] Filter encoding is ${encoded.length} chars. Consider simplifying filters.`
            );
          }
          newParams.set(PARAM_FILTERS, encoded);
        }
      }

      // Handle sort changes
      if ('sort' in updates) {
        const sort = updates.sort;
        if (sort === null || sort === undefined) {
          newParams.delete(PARAM_SORT);
          newParams.delete(PARAM_ORDER);
        } else {
          newParams.set(PARAM_SORT, sort.field);
          newParams.set(PARAM_ORDER, sort.order);
        }
      }

      // Handle focal node changes
      if ('focalNodeId' in updates) {
        const focalNodeId = updates.focalNodeId;
        if (focalNodeId === null || focalNodeId === undefined) {
          newParams.delete(PARAM_FOCAL);
          newParams.delete(PARAM_HOPS); // Also clear hops when clearing focal
        } else {
          newParams.set(PARAM_FOCAL, focalNodeId);
        }
      }

      // Handle hop count changes
      if ('hopCount' in updates) {
        const hopCount = updates.hopCount;
        if (hopCount === undefined || hopCount === 2) {
          // Don't include default value in URL
          newParams.delete(PARAM_HOPS);
        } else {
          newParams.set(PARAM_HOPS, String(hopCount));
        }
      }

      const query = newParams.toString();
      return query ? `${pathname}?${query}` : pathname;
    },
    [searchParams, pathname]
  );

  // Actions for updating URL state
  const actions = useMemo<ViewUrlStateActions>(
    () => ({
      setView: (viewId) => {
        router.push(buildUrl({ viewId }, true), { scroll: false });
      },
      setNode: (nodeId) => {
        router.push(buildUrl({ nodeId }), { scroll: false });
      },
      setRecord: (recordId) => {
        router.push(buildUrl({ recordId }), { scroll: false });
      },
      setFilters: (filters) => {
        router.push(buildUrl({ filters }), { scroll: false });
      },
      setSort: (field, order = 'asc') => {
        const sort = field ? { field, order } : null;
        router.push(buildUrl({ sort }), { scroll: false });
      },
      setFocalNode: (nodeId) => {
        router.push(buildUrl({ focalNodeId: nodeId }), { scroll: false });
      },
      setHopCount: (hops) => {
        router.push(buildUrl({ hopCount: hops }), { scroll: false });
      },
      updateMultiple: (updates) => {
        const clearViewSpecific = 'viewId' in updates;
        router.push(buildUrl(updates, clearViewSpecific), { scroll: false });
      },
      clearAll: () => {
        router.push(pathname, { scroll: false });
      },
    }),
    [router, buildUrl, pathname]
  );

  return [state, actions];
}
