'use client';

import { useState, useCallback } from 'react';

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

/** Format tool input for collapsed view (brief summary) */
function formatToolInput(tool: string | undefined, input: Record<string, unknown>): string {
  // Special handling for run_transformer
  if (tool === 'mcp__transformer-tools__run_transformer') {
    return 'Running transform.py';
  }
  // Show relevant parts of tool input
  if ('pattern' in input) return `pattern: "${input.pattern}"`;
  if ('file_path' in input) return `${input.file_path}`;
  if ('command' in input) {
    const cmd = String(input.command);
    // Show first line only for multi-line commands
    const firstLine = cmd.split('\n')[0] ?? cmd;
    return firstLine.length > 60 ? firstLine.slice(0, 60) + '...' : firstLine;
  }
  return JSON.stringify(input).slice(0, 80) + (JSON.stringify(input).length > 80 ? '...' : '');
}

/** Format tool result for collapsed view (truncated) */
function formatToolResult(result: string): string {
  if (result.length > 100) {
    return result.slice(0, 100) + '...';
  }
  return result;
}

/** Format tool input for expanded view (full content) */
function formatExpandedInput(tool: string | undefined, input: Record<string, unknown>): string {
  // Special handling for run_transformer - show the code
  if (tool === 'mcp__transformer-tools__run_transformer') {
    if ('code' in input) {
      return String(input.code);
    }
  }
  // Bash commands - show full command
  if (tool === 'Bash' && 'command' in input) {
    return String(input.command);
  }
  // Write tool - show file path and content
  if (tool === 'Write' && 'file_path' in input) {
    const content = input.content ? String(input.content) : '(no content)';
    return `File: ${input.file_path}\n${'─'.repeat(40)}\n${content}`;
  }
  // Read tool - show file path
  if (tool === 'Read' && 'file_path' in input) {
    return `Reading: ${input.file_path}`;
  }
  // Default: pretty-print JSON
  return JSON.stringify(input, null, 2);
}

/** Check if an event has expandable content */
function hasExpandableContent(event: TransformerEvent): boolean {
  if (event.event === 'tool_call') {
    // All tool calls can be expanded to show full input
    return Boolean(event.input && Object.keys(event.input).length > 0);
  }
  if (event.event === 'tool_result') {
    // Results can be expanded if they're long
    return Boolean(event.result && event.result.length > 100);
  }
  if (event.event === 'text') {
    // Text messages can be expanded if long
    return Boolean(event.text && event.text.length > 150);
  }
  if (event.event === 'system_prompt') {
    // System prompts are always expandable
    return Boolean(event.prompt);
  }
  if (event.event === 'user_instruction') {
    // User instructions are always expandable
    return Boolean(event.instruction);
  }
  if (event.event === 'workspace_files') {
    // Workspace files are always expandable
    return Boolean(event.files && Array.isArray(event.files) && event.files.length > 0);
  }
  return false;
}

export function TransformerProgress({
  events,
  isRunning,
  error,
}: TransformerProgressProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set());

  const toggleEventExpanded = useCallback((index: number) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  // Filter to tool calls and relevant events (including text for agent messages)
  const toolEvents = events.filter(
    (e) =>
      e.event === 'tool_call' ||
      e.event === 'tool_result' ||
      e.event === 'validation' ||
      e.event === 'phase' ||
      e.event === 'progress' ||
      e.event === 'text' ||
      e.event === 'system_prompt' ||
      e.event === 'user_instruction' ||
      e.event === 'workspace_files' ||
      e.event === 'skills_available'
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
            <div className="max-h-96 overflow-y-auto p-2 space-y-1 text-xs font-mono">
              {toolEvents.slice(-50).map((event, index) => {
                const globalIndex = toolEvents.length - 50 + index;
                const eventIndex = globalIndex >= 0 ? globalIndex : index;
                const isEventExpanded = expandedEvents.has(eventIndex);
                const canExpand = hasExpandableContent(event);

                // Agent text messages
                if (event.event === 'text') {
                  const text = event.text || '';
                  const isLong = text.length > 150;
                  return (
                    <div
                      key={index}
                      className={`text-muted-foreground pl-4 border-l-2 border-muted/50 py-1 ${canExpand ? 'cursor-pointer hover:bg-muted/30 rounded-r' : ''}`}
                      onClick={canExpand ? () => toggleEventExpanded(eventIndex) : undefined}
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-slate-400 flex-shrink-0 italic">Agent:</span>
                        <span className="italic opacity-80">
                          {isEventExpanded || !isLong ? text : text.slice(0, 150) + '...'}
                        </span>
                        {isLong && (
                          <span className="text-muted-foreground/50 flex-shrink-0">
                            {isEventExpanded ? '[-]' : '[+]'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                }

                // Tool calls - expandable
                if (event.event === 'tool_call') {
                  return (
                    <div key={index} className="space-y-1">
                      <div
                        className={`flex items-start gap-2 text-muted-foreground ${canExpand ? 'cursor-pointer hover:bg-muted/30 rounded px-1 -mx-1' : ''}`}
                        onClick={canExpand ? () => toggleEventExpanded(eventIndex) : undefined}
                      >
                        <span className="text-blue-500 flex-shrink-0">{'>'}</span>
                        <span className="text-blue-600 dark:text-blue-400 font-semibold flex-shrink-0">
                          {event.tool}
                        </span>
                        <span className="truncate opacity-70 flex-1">
                          {event.input ? formatToolInput(event.tool, event.input) : ''}
                        </span>
                        {canExpand && (
                          <span className="text-muted-foreground/50 flex-shrink-0">
                            {isEventExpanded ? '[-]' : '[+]'}
                          </span>
                        )}
                      </div>
                      {isEventExpanded && event.input && (
                        <div className="ml-6 p-2 bg-muted/40 rounded border border-muted overflow-x-auto">
                          <pre className="whitespace-pre-wrap text-[11px] max-h-64 overflow-y-auto">
                            {formatExpandedInput(event.tool, event.input)}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                }

                // Tool results - expandable
                if (event.event === 'tool_result') {
                  const result = event.result || '(empty)';
                  return (
                    <div key={index} className="space-y-1">
                      <div
                        className={`flex items-start gap-2 text-muted-foreground/70 pl-4 ${canExpand ? 'cursor-pointer hover:bg-muted/30 rounded px-1 -mx-1' : ''}`}
                        onClick={canExpand ? () => toggleEventExpanded(eventIndex) : undefined}
                      >
                        <span className="text-green-500 flex-shrink-0">{'<'}</span>
                        <span className="truncate flex-1">
                          {formatToolResult(result)}
                        </span>
                        {canExpand && (
                          <span className="text-muted-foreground/50 flex-shrink-0">
                            {isEventExpanded ? '[-]' : '[+]'}
                          </span>
                        )}
                      </div>
                      {isEventExpanded && (
                        <div className="ml-6 p-2 bg-green-500/5 rounded border border-green-500/20 overflow-x-auto">
                          <pre className="whitespace-pre-wrap text-[11px] max-h-64 overflow-y-auto text-muted-foreground">
                            {result}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                }

                // Validation results
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

                // Phase/progress messages
                if (event.event === 'phase' || event.event === 'progress') {
                  return (
                    <div key={index} className="flex items-start gap-2 text-purple-500">
                      <span>*</span>
                      <span>{event.message}</span>
                    </div>
                  );
                }

                // System prompt - collapsible
                if (event.event === 'system_prompt') {
                  const prompt = (event.prompt as string) || '';
                  return (
                    <div key={index} className="space-y-1">
                      <div
                        className="flex items-start gap-2 text-orange-600 dark:text-orange-400 cursor-pointer hover:bg-muted/30 rounded px-1 -mx-1"
                        onClick={() => toggleEventExpanded(eventIndex)}
                      >
                        <span className="flex-shrink-0">⚙</span>
                        <span className="font-semibold flex-shrink-0">System Prompt</span>
                        <span className="truncate opacity-70 flex-1">
                          {prompt.slice(0, 60)}...
                        </span>
                        <span className="text-muted-foreground/50 flex-shrink-0">
                          {isEventExpanded ? '[-]' : '[+]'}
                        </span>
                      </div>
                      {isEventExpanded && (
                        <div className="ml-6 p-2 bg-orange-500/5 rounded border border-orange-500/20 overflow-x-auto">
                          <pre className="whitespace-pre-wrap text-[11px] max-h-96 overflow-y-auto text-muted-foreground">
                            {prompt}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                }

                // User instruction - collapsible
                if (event.event === 'user_instruction') {
                  const instruction = (event.instruction as string) || '';
                  return (
                    <div key={index} className="space-y-1">
                      <div
                        className="flex items-start gap-2 text-cyan-600 dark:text-cyan-400 cursor-pointer hover:bg-muted/30 rounded px-1 -mx-1"
                        onClick={() => toggleEventExpanded(eventIndex)}
                      >
                        <span className="flex-shrink-0">📝</span>
                        <span className="font-semibold flex-shrink-0">User Instruction</span>
                        <span className="truncate opacity-70 flex-1">
                          {instruction.slice(0, 60)}...
                        </span>
                        <span className="text-muted-foreground/50 flex-shrink-0">
                          {isEventExpanded ? '[-]' : '[+]'}
                        </span>
                      </div>
                      {isEventExpanded && (
                        <div className="ml-6 p-2 bg-cyan-500/5 rounded border border-cyan-500/20 overflow-x-auto">
                          <pre className="whitespace-pre-wrap text-[11px] max-h-96 overflow-y-auto text-muted-foreground">
                            {instruction}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                }

                // Workspace files - collapsible list
                if (event.event === 'workspace_files') {
                  const files = (event.files as Array<{ name: string; path: string; is_dir: boolean; size?: number }>) || [];
                  return (
                    <div key={index} className="space-y-1">
                      <div
                        className="flex items-start gap-2 text-emerald-600 dark:text-emerald-400 cursor-pointer hover:bg-muted/30 rounded px-1 -mx-1"
                        onClick={() => toggleEventExpanded(eventIndex)}
                      >
                        <span className="flex-shrink-0">📁</span>
                        <span className="font-semibold flex-shrink-0">Workspace Files</span>
                        <span className="opacity-70 flex-1">
                          {files.length} file{files.length !== 1 ? 's' : ''} prepared
                        </span>
                        <span className="text-muted-foreground/50 flex-shrink-0">
                          {isEventExpanded ? '[-]' : '[+]'}
                        </span>
                      </div>
                      {isEventExpanded && (
                        <div className="ml-6 p-2 bg-emerald-500/5 rounded border border-emerald-500/20">
                          <ul className="space-y-1 text-[11px] text-muted-foreground">
                            {files.map((file, i) => (
                              <li key={i} className="flex items-center gap-2">
                                <span>{file.is_dir ? '📂' : '📄'}</span>
                                <span className="font-mono">{file.path}</span>
                                {file.size !== undefined && (
                                  <span className="text-muted-foreground/50">
                                    ({file.size} bytes)
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                }

                // Skills available
                if (event.event === 'skills_available') {
                  const skills = (event.skills as string[]) || [];
                  return (
                    <div key={index} className="flex items-start gap-2 text-violet-600 dark:text-violet-400">
                      <span className="flex-shrink-0">🧠</span>
                      <span className="font-semibold flex-shrink-0">Skills:</span>
                      <span className="opacity-80">{skills.join(', ')}</span>
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
