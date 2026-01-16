/**
 * Utility functions for filter operations.
 */

import type {
  FilterableField,
  FilterOperator,
  NodeFilter,
  PropertyFilter,
  RelationalFilter,
} from '@/types/view-templates';

/**
 * Generate a unique ID for a filter.
 */
export function generateFilterId(): string {
  return `filter-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Get available operators for a given field kind.
 */
export function getOperatorsForFieldKind(
  kind: string
): { value: FilterOperator; label: string }[] {
  const baseOperators: { value: FilterOperator; label: string }[] = [
    { value: 'eq', label: 'equals' },
    { value: 'neq', label: 'not equals' },
    { value: 'isNull', label: 'is empty' },
    { value: 'isNotNull', label: 'is not empty' },
  ];

  switch (kind) {
    case 'string':
    case 'person':
      return [
        ...baseOperators,
        { value: 'contains', label: 'contains' },
        { value: 'startsWith', label: 'starts with' },
        { value: 'endsWith', label: 'ends with' },
      ];

    case 'number':
      return [
        ...baseOperators,
        { value: 'gt', label: 'greater than' },
        { value: 'gte', label: 'greater or equal' },
        { value: 'lt', label: 'less than' },
        { value: 'lte', label: 'less or equal' },
      ];

    case 'datetime':
      return [
        ...baseOperators,
        { value: 'gt', label: 'after' },
        { value: 'gte', label: 'on or after' },
        { value: 'lt', label: 'before' },
        { value: 'lte', label: 'on or before' },
      ];

    case 'enum':
      return [
        { value: 'eq', label: 'is' },
        { value: 'neq', label: 'is not' },
        { value: 'in', label: 'is any of' },
        { value: 'notIn', label: 'is none of' },
        { value: 'isNull', label: 'is empty' },
        { value: 'isNotNull', label: 'is not empty' },
      ];

    default:
      return baseOperators;
  }
}

/**
 * Get a human-readable label for an operator.
 */
export function getOperatorLabel(operator: FilterOperator): string {
  const labels: Record<FilterOperator, string> = {
    eq: 'is',
    neq: 'is not',
    contains: 'contains',
    startsWith: 'starts with',
    endsWith: 'ends with',
    gt: '>',
    gte: '>=',
    lt: '<',
    lte: '<=',
    in: 'is any of',
    notIn: 'is none of',
    isNull: 'is empty',
    isNotNull: 'is not empty',
  };
  return labels[operator] || operator;
}

/**
 * Build a display label for a filter.
 */
export function buildFilterDisplayLabel(
  field: FilterableField,
  operator: FilterOperator,
  value: unknown
): string {
  const operatorLabel = getOperatorLabel(operator);

  // For null operators, don't show value
  if (operator === 'isNull' || operator === 'isNotNull') {
    return `${field.label} ${operatorLabel}`;
  }

  // Format value for display
  let valueStr: string;
  if (Array.isArray(value)) {
    valueStr = value.join(', ');
  } else if (value === null || value === undefined) {
    valueStr = '';
  } else {
    valueStr = String(value);
  }

  // Truncate long values
  if (valueStr.length > 30) {
    valueStr = valueStr.slice(0, 27) + '...';
  }

  return `${field.label} ${operatorLabel} "${valueStr}"`;
}

/**
 * Check if an operator requires a value input.
 */
export function operatorNeedsValue(operator: FilterOperator): boolean {
  return operator !== 'isNull' && operator !== 'isNotNull';
}

/**
 * Check if a filter is a property filter.
 */
export function isPropertyFilter(filter: NodeFilter): filter is PropertyFilter {
  return filter.type === 'property';
}

/**
 * Check if a filter is a relational filter.
 */
export function isRelationalFilter(filter: NodeFilter): filter is RelationalFilter {
  return filter.type === 'relational';
}
