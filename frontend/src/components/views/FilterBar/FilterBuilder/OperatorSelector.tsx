'use client';

import type { FilterOperator } from '@/types/view-templates';

interface OperatorSelectorProps {
  operators: { value: FilterOperator; label: string }[];
  selectedOperator: FilterOperator | null;
  onOperatorChange: (operator: FilterOperator | null) => void;
}

export function OperatorSelector({
  operators,
  selectedOperator,
  onOperatorChange,
}: OperatorSelectorProps) {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (!value) {
      onOperatorChange(null);
      return;
    }
    onOperatorChange(value as FilterOperator);
  };

  return (
    <select
      value={selectedOperator || ''}
      onChange={handleChange}
      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
    >
      <option value="">Select condition...</option>
      {operators.map((op) => (
        <option key={op.value} value={op.value}>
          {op.label}
        </option>
      ))}
    </select>
  );
}
