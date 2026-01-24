'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Filter, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { ActiveFilter, FilterGroup, NodeFilter, FilterSchema, PropertyFilter, RelationalFilter } from '@/types/view-templates';
import { FilterChip } from './FilterChip';
import { FilterBuilder } from './FilterBuilder/FilterBuilder';
import { generateFilterId, buildFilterDisplayLabel, getOperatorLabel } from './filterUtils';

interface FilterBarProps {
  workflowId: string;
  viewId: string;
  onFiltersChange: (filters: FilterGroup | null) => void;
  initialFilters?: FilterGroup | null;
}

/**
 * Restore ActiveFilter[] from a FilterGroup using the filter schema.
 * This allows us to rebuild the UI state from URL-persisted filters.
 */
function restoreActiveFiltersFromGroup(
  filterGroup: FilterGroup,
  schema: FilterSchema
): ActiveFilter[] {
  const allFields = [...schema.propertyFields, ...schema.relationalFields];

  return filterGroup.filters
    .filter((f): f is PropertyFilter | RelationalFilter => 'type' in f)
    .map((filter) => {
      let displayLabel = 'Unknown filter';

      if (filter.type === 'property') {
        // Find matching field in schema
        const field = allFields.find(
          (f) => !f.isRelational && f.key === filter.field
        );
        if (field) {
          displayLabel = buildFilterDisplayLabel(field, filter.operator, filter.value);
        } else {
          // Fallback label if field not found in schema
          const operatorLabel = getOperatorLabel(filter.operator);
          displayLabel = `${filter.field} ${operatorLabel} "${filter.value ?? ''}"`;
        }
      } else if (filter.type === 'relational') {
        // Find matching relational field in schema
        const field = allFields.find(
          (f) =>
            f.isRelational &&
            f.relationPath?.edgeType === filter.edgeType &&
            f.relationPath?.direction === filter.direction &&
            f.relationPath?.targetType === filter.targetType
        );
        if (field) {
          displayLabel = buildFilterDisplayLabel(
            field,
            filter.targetFilter.operator,
            filter.targetFilter.value
          );
        } else {
          // Fallback label
          const operatorLabel = getOperatorLabel(filter.targetFilter.operator);
          displayLabel = `${filter.targetType}.${filter.targetFilter.field} ${operatorLabel} "${filter.targetFilter.value ?? ''}"`;
        }
      }

      return {
        id: generateFilterId(),
        filter,
        displayLabel,
      };
    });
}

export function FilterBar({ workflowId, viewId, onFiltersChange, initialFilters }: FilterBarProps) {
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const hasRestoredFromUrl = useRef(false);

  // Fetch filter schema for this view
  const { data: filterSchema, isLoading } = useQuery({
    queryKey: ['filterSchema', workflowId, viewId],
    queryFn: () => api.getViewFilterSchema(workflowId, viewId),
  });

  // Restore filters from URL when schema is loaded (only once per view)
  useEffect(() => {
    if (filterSchema && initialFilters && initialFilters.filters.length > 0 && !hasRestoredFromUrl.current) {
      const restored = restoreActiveFiltersFromGroup(initialFilters, filterSchema);
      if (restored.length > 0) {
        setActiveFilters(restored);
        hasRestoredFromUrl.current = true;
      }
    }
  }, [filterSchema, initialFilters]);

  // Reset restoration flag when view changes
  useEffect(() => {
    hasRestoredFromUrl.current = false;
  }, [viewId]);

  // Sync filter state to parent whenever activeFilters changes
  // Skip initial sync if we're restoring from URL to avoid double-triggering
  useEffect(() => {
    if (activeFilters.length === 0) {
      onFiltersChange(null);
    } else {
      const filterGroup = {
        logic: 'and' as const,
        filters: activeFilters.map((af) => af.filter),
      };
      onFiltersChange(filterGroup);
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
      <div className="flex items-center gap-2 px-4 py-2 bg-card border-b border-border animate-pulse">
        <div className="h-4 w-20 bg-muted rounded" />
      </div>
    );
  }

  if (!filterSchema) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-card border-b border-border flex-wrap">
      {/* Filter icon and label */}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
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
        className="px-2 py-1 text-sm text-primary hover:bg-primary/10 rounded transition-colors"
      >
        + Add filter
      </button>

      {/* Clear all button (only show if filters exist) */}
      {activeFilters.length > 0 && (
        <button
          onClick={handleClearAll}
          className="px-2 py-1 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors flex items-center gap-1"
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
