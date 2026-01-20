'use client';

import { AlertTriangle, Link as LinkIcon, Plus, X } from 'lucide-react';
import type { RuleViolation } from '@/types/workflow';

interface RuleViolationToastProps {
  violations: RuleViolation[];
  onAddEdge?: (edgeType: string) => void;
  onDismiss?: () => void;
}

/**
 * Toast component for displaying rule violation details.
 *
 * Shows a rich error message when a status transition is blocked
 * by workflow rules, including what edges are missing and quick
 * actions to resolve the issue.
 */
export function RuleViolationToast({
  violations,
  onAddEdge,
  onDismiss,
}: RuleViolationToastProps) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg shadow-lg p-4 max-w-md">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 text-red-700">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <span className="font-semibold">Status Change Blocked</span>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-red-400 hover:text-red-600 transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Violations */}
      <div className="space-y-3">
        {violations.map((violation) => (
          <div key={violation.ruleId} className="border-t border-red-200 pt-3 first:border-t-0 first:pt-0">
            <p className="text-sm text-gray-700 mb-2">{violation.message}</p>

            {/* Missing edges breakdown */}
            {violation.missingEdges.length > 0 && (
              <div className="space-y-1.5">
                {violation.missingEdges.map((edge) => (
                  <div
                    key={edge.edgeType}
                    className="flex items-center justify-between text-xs bg-red-100/50 rounded px-2.5 py-1.5"
                  >
                    <span className="flex items-center gap-1.5 text-red-700">
                      <LinkIcon className="h-3 w-3" />
                      <span className="font-medium">{edge.edgeType}</span>
                      <span className="text-red-500">
                        ({edge.actual} of {edge.required} required)
                      </span>
                    </span>
                    {onAddEdge && (
                      <button
                        onClick={() => onAddEdge(edge.edgeType)}
                        className="flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium transition-colors"
                      >
                        <Plus className="h-3 w-3" />
                        Add
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Hint */}
      <p className="text-xs text-gray-500 mt-3 border-t border-red-200 pt-3">
        Create the required relationships to proceed with this status change.
      </p>
    </div>
  );
}
