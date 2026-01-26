'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import type { WorkflowSummary } from '@/types/workflow';

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function LinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
    </svg>
  );
}

function BoltIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

function ViewIcon({ className, style }: { className?: string; style?: string }) {
  // Return different icons based on view style
  switch (style) {
    case 'kanban':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15M4.5 4.5h15v15h-15z" />
        </svg>
      );
    case 'table':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125" />
        </svg>
      );
    case 'timeline':
    case 'gantt':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
        </svg>
      );
    case 'cards':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
        </svg>
      );
    case 'record':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      );
    default:
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
  }
}

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [expandedWorkflowId, setExpandedWorkflowId] = useState<string | null>(null);

  // Parse current workflow from URL
  const workflowMatch = pathname.match(/^\/workflows\/([^/]+)/);
  const currentWorkflowId = workflowMatch?.[1] || null;
  const currentViewId = searchParams.get('view');
  const isOnEndpoints = pathname.includes('/endpoints');

  // Fetch workflows list
  const { data: workflows, isLoading: workflowsLoading } = useQuery({
    queryKey: ['workflows'],
    queryFn: api.listWorkflows,
  });

  // Fetch expanded workflow details (for views)
  const { data: workflowDetail } = useQuery({
    queryKey: ['workflow', expandedWorkflowId],
    queryFn: () => (expandedWorkflowId ? api.getWorkflow(expandedWorkflowId) : null),
    enabled: !!expandedWorkflowId,
  });

  // Track previous URL workflow to detect navigation
  const prevUrlWorkflowRef = useRef<string | null>(null);

  // Auto-expand workflow only when URL changes to a different workflow
  useEffect(() => {
    if (currentWorkflowId && currentWorkflowId !== prevUrlWorkflowRef.current) {
      setExpandedWorkflowId(currentWorkflowId);
      prevUrlWorkflowRef.current = currentWorkflowId;
    }
  }, [currentWorkflowId]);

  const handleWorkflowClick = (workflowId: string) => {
    setExpandedWorkflowId(expandedWorkflowId === workflowId ? null : workflowId);
  };

  const isConnectorsActive = pathname === '/connectors';

  return (
    <aside className="w-64 border-r border-border bg-card flex flex-col">
      {/* Logo area */}
      <div className="p-4 border-b border-border">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
            <BoltIcon className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-heading font-semibold text-foreground">Curie Omni</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 overflow-y-auto">
        {/* Workflows section */}
        <div className="mb-4">
          <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Workflows
          </div>

          {workflowsLoading ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">Loading...</div>
          ) : workflows && workflows.length > 0 ? (
            <div className="space-y-0.5">
              {workflows.map((workflow: WorkflowSummary) => {
                const isExpanded = expandedWorkflowId === workflow.id;
                const isCurrentWorkflow = currentWorkflowId === workflow.id;

                return (
                  <div key={workflow.id}>
                    {/* Workflow row */}
                    <button
                      onClick={() => handleWorkflowClick(workflow.id)}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 text-left',
                        isCurrentWorkflow
                          ? 'bg-primary/10 text-foreground'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      )}
                    >
                      {isExpanded ? (
                        <ChevronDownIcon className="w-4 h-4 flex-shrink-0" />
                      ) : (
                        <ChevronRightIcon className="w-4 h-4 flex-shrink-0" />
                      )}
                      <span className="truncate">{workflow.name}</span>
                    </button>

                    {/* Expanded workflow: schema, views, endpoints */}
                    {isExpanded && (
                      <div className="ml-4 pl-2 border-l border-border/50 mt-0.5">
                        {/* Schema Graph - top level */}
                        <Link
                          href={`/workflows/${workflow.id}?view=schema`}
                          className={cn(
                            'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-all duration-200',
                            isCurrentWorkflow && currentViewId === 'schema' && !isOnEndpoints
                              ? 'bg-primary/15 text-primary'
                              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                          )}
                        >
                          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                          </svg>
                          <span>Schema Graph</span>
                        </Link>

                        {/* Views section header */}
                        <div className="px-3 py-1.5 mt-2 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
                          Views
                        </div>

                        {/* Views list */}
                        <div className="space-y-0.5">
                          {workflowDetail?.viewTemplates?.map((view) => {
                            const isActiveView =
                              isCurrentWorkflow && currentViewId === view.id && !isOnEndpoints;
                            const viewStyle = view.levels?.[view.rootType]?.style;

                            return (
                              <Link
                                key={view.id}
                                href={`/workflows/${workflow.id}?view=${view.id}`}
                                className={cn(
                                  'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-all duration-200',
                                  isActiveView
                                    ? 'bg-primary/15 text-primary'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                                )}
                              >
                                <ViewIcon className="w-4 h-4 flex-shrink-0" style={viewStyle} />
                                <span className="truncate">{view.name}</span>
                              </Link>
                            );
                          })}
                        </div>

                        {/* Endpoints - separated */}
                        <div className="mt-2 pt-2 border-t border-border/30">
                          <Link
                            href={`/workflows/${workflow.id}/endpoints`}
                            className={cn(
                              'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-all duration-200',
                              isCurrentWorkflow && isOnEndpoints
                                ? 'bg-primary/15 text-primary'
                                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                            )}
                          >
                            <BoltIcon className="w-4 h-4 flex-shrink-0" />
                            <span>Endpoints</span>
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="px-3 py-2 text-sm text-muted-foreground">No workflows yet</div>
          )}

          {/* New Workflow button */}
          <Link
            href="/create"
            className="mt-2 flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200"
          >
            <PlusIcon className="w-4 h-4" />
            <span>New Workflow</span>
          </Link>
        </div>

        {/* Connectors (global) */}
        <div className="mt-auto pt-2 border-t border-border">
          <Link
            href="/connectors"
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200',
              isConnectorsActive
                ? 'bg-primary/15 text-primary border border-primary/30'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent'
            )}
          >
            <LinkIcon className="w-5 h-5" />
            <span>Connectors</span>
          </Link>
        </div>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border">
        <p className="text-xs text-muted-foreground font-mono">Curie Omni</p>
        <p className="text-xs text-muted-foreground/60 font-mono">v0.1.0</p>
      </div>
    </aside>
  );
}
