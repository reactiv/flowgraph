'use client';

import { useState } from 'react';
import { Sparkles, Loader2, AlertCircle, Check } from 'lucide-react';
import type { WorkflowDefinition } from '@/types/workflow';
import type { ContextSelector } from '@/types/context-selector';
import { api } from '@/lib/api';

interface ContextEditorNaturalProps {
  /** Workflow ID for API calls. */
  workflowId: string;

  /** Workflow definition for schema context. */
  workflowDefinition: WorkflowDefinition;

  /** Current context selector. */
  contextSelector: ContextSelector;

  /** Callback when selector changes. */
  onChange: (selector: ContextSelector) => void;

  /** Source node type for context (e.g., 'Sample'). */
  sourceType?: string;

  /** Edge type being created (e.g., 'HAS_ANALYSIS'). */
  edgeType?: string;

  /** Direction of the edge from source node. */
  direction?: 'outgoing' | 'incoming';

  /** Target node type being suggested (e.g., 'Analysis'). */
  targetType?: string;
}

const EXAMPLE_PROMPTS = [
  'Include all Issues in the same Project',
  'Show my documents and my siblings\' documents',
  'Find all Tasks assigned to people on my team',
  'Include experiments that test the same hypothesis',
  'Get direct neighbors only',
];

/**
 * Natural language editor for context selector.
 * Uses LLM to parse descriptions into ContextSelector configurations.
 */
export function ContextEditorNatural({
  workflowId,
  workflowDefinition,
  contextSelector,
  onChange,
  sourceType,
  edgeType,
  direction,
  targetType,
}: ContextEditorNaturalProps) {
  const [description, setDescription] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastParsed, setLastParsed] = useState<ContextSelector | null>(null);

  // Use current selector for display when nothing has been parsed yet
  const displaySelector = lastParsed || contextSelector;

  const handleParse = async () => {
    if (!description.trim()) return;

    setIsParsing(true);
    setError(null);

    try {
      const parsed = await api.parseContextSelector(workflowId, description, {
        sourceType,
        edgeType,
        direction,
        targetType,
      });
      setLastParsed(parsed);
      onChange(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse description');
    } finally {
      setIsParsing(false);
    }
  };

  const handleExampleClick = (example: string) => {
    setDescription(example);
  };

  // Get node and edge type names for context
  const nodeTypeNames = workflowDefinition.nodeTypes.map((nt) => nt.displayName || nt.type);
  const edgeTypeNames = workflowDefinition.edgeTypes.map((et) => et.displayName || et.type);

  return (
    <div className="p-4 space-y-4">
      {/* Description input */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">
          Describe the context you want
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g., Include all Issues in the same Project, or Show my documents and my siblings' documents"
          className="w-full h-24 text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          disabled={isParsing}
        />
      </div>

      {/* Apply button */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleParse}
          disabled={isParsing || !description.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isParsing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Parsing...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Apply
            </>
          )}
        </button>

        {lastParsed && (
          <span className="text-sm text-green-500 flex items-center gap-1">
            <Check className="h-4 w-4" />
            Applied
          </span>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Current configuration */}
      <div className="p-3 bg-primary/10 border border-primary/30 rounded-lg">
        <h4 className="text-sm font-medium text-primary mb-2">
          Current Configuration
        </h4>
        <ul className="text-sm text-primary/80 space-y-1">
          <li>
            <strong>Paths:</strong>{' '}
            {displaySelector.paths.length > 0
              ? displaySelector.paths.map((p) => p.name).join(', ')
              : 'None'}
          </li>
        </ul>
      </div>

      {/* Example prompts */}
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
          Example prompts
        </h4>
        <div className="flex flex-wrap gap-2">
          {EXAMPLE_PROMPTS.map((example) => (
            <button
              key={example}
              onClick={() => handleExampleClick(example)}
              className="text-xs px-3 py-1.5 border border-border rounded-full hover:bg-muted text-muted-foreground hover:text-foreground"
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      {/* Available schema context */}
      <div className="border-t border-border pt-4">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
          Available in this workflow
        </h4>
        <div className="text-xs text-muted-foreground space-y-1">
          <p>
            <strong>Node types:</strong> {nodeTypeNames.join(', ')}
          </p>
          <p>
            <strong>Relationships:</strong> {edgeTypeNames.join(', ')}
          </p>
        </div>
      </div>
    </div>
  );
}
