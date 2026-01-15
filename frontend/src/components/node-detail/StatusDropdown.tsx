'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NodeState } from '@/types/workflow';

interface StatusDropdownProps {
  currentStatus: string;
  states: NodeState;
  onChange: (status: string) => void;
  disabled?: boolean;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Draft: { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-300' },
  'In Progress': { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300' },
  Complete: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300' },
  Archived: { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-300' },
  Failed: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300' },
  Pending: { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300' },
  Active: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300' },
  Validated: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300' },
  Rejected: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300' },
  Dismissed: { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-300' },
  Proposed: { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300' },
  Deprecated: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300' },
  Running: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300' },
  Open: { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300' },
  Closed: { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-300' },
};

const DEFAULT_COLOR = { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-300' };

export function StatusDropdown({
  currentStatus,
  states,
  onChange,
  disabled = false,
}: StatusDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Get valid transitions from current status
  const validTransitions = states.transitions
    .filter((t) => t.from === currentStatus)
    .map((t) => t.to);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentColor = STATUS_COLORS[currentStatus] || DEFAULT_COLOR;

  // If no valid transitions, just show the status badge
  if (validTransitions.length === 0) {
    return (
      <span
        className={cn(
          'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
          currentColor.bg,
          currentColor.text
        )}
      >
        {currentStatus}
      </span>
    );
  }

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={cn(
          'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors',
          currentColor.bg,
          currentColor.text,
          currentColor.border,
          disabled ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-80 cursor-pointer'
        )}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        {currentStatus}
        <ChevronDown className="h-3 w-3" />
      </button>

      {isOpen && (
        <div
          className="absolute top-full left-0 mt-1 w-40 rounded-md bg-white shadow-lg border py-1 z-10"
          role="listbox"
        >
          {/* Current status */}
          <div
            className={cn(
              'flex items-center justify-between px-3 py-2 text-sm',
              currentColor.bg,
              currentColor.text
            )}
            role="option"
            aria-selected="true"
          >
            {currentStatus}
            <Check className="h-4 w-4" />
          </div>

          {/* Divider if there are transitions */}
          {validTransitions.length > 0 && (
            <div className="border-t my-1" />
          )}

          {/* Valid transitions */}
          {validTransitions.map((status) => {
            const color = STATUS_COLORS[status] || DEFAULT_COLOR;
            return (
              <button
                key={status}
                onClick={() => {
                  onChange(status);
                  setIsOpen(false);
                }}
                className={cn(
                  'w-full flex items-center px-3 py-2 text-sm hover:bg-gray-50 transition-colors',
                  color.text
                )}
                role="option"
                aria-selected="false"
              >
                <span
                  className={cn(
                    'w-2 h-2 rounded-full mr-2',
                    color.bg
                  )}
                />
                {status}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
