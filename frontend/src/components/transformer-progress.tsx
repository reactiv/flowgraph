'use client';

import { useState } from 'react';

export interface TransformerEvent {
  event: string;
  tool?: string;
  input?: Record<string, unknown>;
  result?: string;
  phase?: string;
  message?: string;
  current?: number;
  total?: number;
  valid?: boolean;
  errors?: string[];
  item_count?: number;
  text?: string;
  [key: string]: unknown;
}

interface TransformerProgressProps {
  events: TransformerEvent[];
  isRunning: boolean;
  error?: string | null;
}

function formatToolInput(input: Record<string, unknown>): string {
  // Show relevant parts of tool input
  if ('pattern' in input) return `pattern: "${input.pattern}"`;
  if ('file_path' in input) return `${input.file_path}`;
  if ('command' in input) return `${input.command}`;
  return JSON.stringify(input).slice(0, 100);
}

function formatToolResult(result: string): string {
  if (result.length > 200) {
    return result.slice(0, 200) + '...';
  }
  return result;
}

export function TransformerProgress({
  events,
  isRunning,
  error,
}: TransformerProgressProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  // Filter to tool calls and relevant events
  const toolEvents = events.filter(
    (e) =>
      e.event === 'tool_call' ||
      e.event === 'tool_result' ||
      e.event === 'validation' ||
      e.event === 'phase' ||
      e.event === 'progress'
  );

  // Get the latest phase event (reverse to find last match)
  const latestPhase = [...events].reverse().find((e: TransformerEvent) => e.event === 'phase');
  const latestProgress = [...events].reverse().find((e: TransformerEvent) => e.event === 'progress');
  const latestValidation = [...events].reverse().find((e: TransformerEvent) => e.event === 'validation');

  // Count tool calls
  const toolCallCount = events.filter((e) => e.event === 'tool_call').length;

  // Determine status message
  let statusMessage = 'Starting...';
  if (latestPhase?.message) {
    statusMessage = latestPhase.message;
  } else if (latestProgress?.message) {
    statusMessage = latestProgress.message;
  } else if (toolCallCount > 0) {
    statusMessage = `Processing... (${toolCallCount} tool calls)`;
  }

  // Calculate progress percentage (rough estimate based on tool calls)
  let progressPercent = 0;
  if (latestProgress?.total && latestProgress?.current) {
    progressPercent = Math.round((latestProgress.current / latestProgress.total) * 100);
  } else if (toolCallCount > 0) {
    // Estimate based on tool calls (cap at 90% until validation)
    progressPercent = Math.min(Math.round(toolCallCount * 3), 90);
  }
  if (latestValidation?.valid) {
    progressPercent = 95;
  }
  if (!isRunning && !error) {
    progressPercent = 100;
  }

  return (
    <div className="space-y-3">
      {/* Status and progress */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          {isRunning && (
            <svg
              className="w-4 h-4 animate-spin text-primary"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          )}
          <span className="text-muted-foreground">{statusMessage}</span>
        </div>
        <span className="font-medium tabular-nums">{progressPercent}%</span>
      </div>

      {/* Progress bar */}
      <div className="relative h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`absolute inset-y-0 left-0 transition-all duration-300 ease-out ${
            error ? 'bg-destructive' : 'bg-primary'
          }`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Error display */}
      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Validation result */}
      {latestValidation && (
        <div
          className={`p-2 rounded-lg text-sm ${
            latestValidation.valid
              ? 'bg-green-500/10 text-green-700 dark:text-green-400'
              : 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400'
          }`}
        >
          {latestValidation.valid
            ? `Validation passed (${latestValidation.item_count || 0} items)`
            : `Validation: ${latestValidation.errors?.join(', ') || 'Issues found'}`}
        </div>
      )}

      {/* Collapsible tool activity log */}
      {toolEvents.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full flex items-center justify-between px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors"
          >
            <span className="text-sm font-medium">
              Agent Activity ({toolCallCount} tool calls)
            </span>
            <svg
              className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>

          {isExpanded && (
            <div className="max-h-64 overflow-y-auto p-2 space-y-1 text-xs font-mono">
              {toolEvents.slice(-30).map((event, index) => {
                if (event.event === 'tool_call') {
                  return (
                    <div key={index} className="flex items-start gap-2 text-muted-foreground">
                      <span className="text-blue-500 flex-shrink-0">{'>'}</span>
                      <span className="text-blue-600 dark:text-blue-400 font-semibold">
                        {event.tool}
                      </span>
                      <span className="truncate opacity-70">
                        {event.input ? formatToolInput(event.input) : ''}
                      </span>
                    </div>
                  );
                }
                if (event.event === 'tool_result') {
                  return (
                    <div
                      key={index}
                      className="flex items-start gap-2 text-muted-foreground/70 pl-4"
                    >
                      <span className="text-green-500 flex-shrink-0">{'<'}</span>
                      <span className="truncate">
                        {event.result ? formatToolResult(event.result) : '(empty)'}
                      </span>
                    </div>
                  );
                }
                if (event.event === 'validation') {
                  return (
                    <div
                      key={index}
                      className={`flex items-start gap-2 ${
                        event.valid ? 'text-green-600' : 'text-yellow-600'
                      }`}
                    >
                      <span>{event.valid ? 'V' : '!'}</span>
                      <span>
                        Validation: {event.valid ? 'passed' : 'failed'}{' '}
                        {event.item_count !== undefined && `(${event.item_count} items)`}
                      </span>
                    </div>
                  );
                }
                if (event.event === 'phase' || event.event === 'progress') {
                  return (
                    <div key={index} className="flex items-start gap-2 text-purple-500">
                      <span>*</span>
                      <span>{event.message}</span>
                    </div>
                  );
                }
                return null;
              })}

              {isRunning && (
                <div className="flex items-center gap-2 text-muted-foreground animate-pulse">
                  <span>...</span>
                  <span>Processing</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
