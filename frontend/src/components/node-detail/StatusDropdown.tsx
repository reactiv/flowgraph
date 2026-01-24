'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getStatusColorPartsWithBorder } from '@/lib/theme';
import type { NodeState } from '@/types/workflow';

interface StatusDropdownProps {
  currentStatus: string;
  states: NodeState;
  onChange: (status: string) => void;
  disabled?: boolean;
}

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

  const currentColor = getStatusColorPartsWithBorder(currentStatus);

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
          className="absolute top-full left-0 mt-1 w-40 rounded-md bg-card shadow-lg border border-border py-1 z-10"
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
            <div className="border-t border-border my-1" />
          )}

          {/* Valid transitions */}
          {validTransitions.map((status) => {
            const color = getStatusColorPartsWithBorder(status);
            return (
              <button
                key={status}
                onClick={() => {
                  onChange(status);
                  setIsOpen(false);
                }}
                className={cn(
                  'w-full flex items-center px-3 py-2 text-sm hover:bg-muted transition-colors',
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
