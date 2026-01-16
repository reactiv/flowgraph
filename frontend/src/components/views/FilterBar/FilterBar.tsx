'use client';

import { useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Filter, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { ActiveFilter, FilterGroup, NodeFilter } from '@/types/view-templates';
import { FilterChip } from './FilterChip';
import { FilterBuilder } from './FilterBuilder/FilterBuilder';
import { generateFilterId } from './filterUtils';

interface FilterBarProps {
  workflowId: string;
  viewId: string;
  onFiltersChange: (filters: FilterGroup | null) => void;
}

export function FilterBar({ workflowId, viewId, onFiltersChange }: FilterBarProps) {
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);

  // Fetch filter schema for this view
  const { data: filterSchema, isLoading } = useQuery({
    queryKey: ['filterSchema', workflowId, viewId],
    queryFn: () => api.getViewFilterSchema(workflowId, viewId),
  });

  // Sync filter state to parent whenever activeFilters changes
  useEffect(() => {
    if (activeFilters.length === 0) {
      onFiltersChange(null);
    } else {
      onFiltersChange({
        logic: 'and',
        filters: activeFilters.map((af) => af.filter),
      });
    }
  }, [activeFilters, onFiltersChange]);

  // Add a new filter (using functional update to avoid stale closure)
  const handleAddFilter = useCallback(
    (filter: NodeFilter, displayLabel: string) => {
      setActiveFilters((prevFilters) => [
        ...prevFilters,
        {
          id: generateFilterId(),
          filter,
          displayLabel,
        },
      ]);
      setIsBuilderOpen(false);
    },
    []
  );

  // Remove a filter
  const handleRemoveFilter = useCallback((filterId: string) => {
    setActiveFilters((prevFilters) => prevFilters.filter((f) => f.id !== filterId));
  }, []);

  // Clear all filters
  const handleClearAll = useCallback(() => {
    setActiveFilters([]);
  }, []);

  // Don't render if schema is loading or unavailable
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b animate-pulse">
        <div className="h-4 w-20 bg-gray-200 rounded" />
      </div>
    );
  }

  if (!filterSchema) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b flex-wrap">
      {/* Filter icon and label */}
      <div className="flex items-center gap-1.5 text-sm text-gray-500">
        <Filter className="h-4 w-4" />
        <span>Filter</span>
      </div>

      {/* Active filter chips */}
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {activeFilters.map((filter) => (
            <FilterChip
              key={filter.id}
              label={filter.displayLabel}
              onRemove={() => handleRemoveFilter(filter.id)}
            />
          ))}
        </div>
      )}

      {/* Add filter button */}
      <button
        onClick={() => setIsBuilderOpen(true)}
        className="px-2 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors"
      >
        + Add filter
      </button>

      {/* Clear all button (only show if filters exist) */}
      {activeFilters.length > 0 && (
        <button
          onClick={handleClearAll}
          className="px-2 py-1 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors flex items-center gap-1"
        >
          <X className="h-3 w-3" />
          Clear all
        </button>
      )}

      {/* Filter builder modal */}
      {isBuilderOpen && filterSchema && (
        <FilterBuilder
          workflowId={workflowId}
          viewId={viewId}
          schema={filterSchema}
          onAddFilter={handleAddFilter}
          onClose={() => setIsBuilderOpen(false)}
        />
      )}
    </div>
  );
}
