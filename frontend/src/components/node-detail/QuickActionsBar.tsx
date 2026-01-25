'use client';

import { Sparkles } from 'lucide-react';
import type { QuickAction, EdgeType, WorkflowDefinition } from '@/types/workflow';
import type { SuggestionDirection } from '@/types/suggestion';

interface QuickActionsBarProps {
  quickActions: QuickAction[];
  workflowDefinition: WorkflowDefinition;
  onSuggestClick: (edgeType: EdgeType, direction: SuggestionDirection) => void;
}

/**
 * Renders quick action buttons for a node based on its type's quickActions config.
 * Currently only supports 'suggest' action type (LLM-powered node creation).
 */
export function QuickActionsBar({
  quickActions,
  workflowDefinition,
  onSuggestClick,
}: QuickActionsBarProps) {
  // Filter to only supported action types (suggest for now)
  const supportedActions = quickActions.filter((action) => action.type === 'suggest');

  // No actions to show
  if (supportedActions.length === 0) {
    return null;
  }

  const handleActionClick = (action: QuickAction) => {
    if (action.type === 'suggest' && action.edgeType && action.direction) {
      // Find the edge type from the workflow definition
      const edgeType = workflowDefinition.edgeTypes.find(
        (et) => et.type === action.edgeType
      );
      if (edgeType) {
        onSuggestClick(edgeType, action.direction);
      }
    }
  };

  return (
    <div className="px-4 py-3 border-b border-border bg-muted/30">
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Quick Actions
        </span>
        <div className="flex flex-wrap gap-2">
          {supportedActions.map((action, index) => (
            <button
              key={`${action.type}-${action.edgeType}-${index}`}
              onClick={() => handleActionClick(action)}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary border border-primary/30 hover:bg-primary/20 transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
