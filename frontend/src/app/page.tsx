'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { WorkflowSummary, TemplateSummary } from '@/types/workflow';

export default function Home() {
  const {
    data: workflows,
    isLoading: workflowsLoading,
    error: workflowsError,
  } = useQuery({
    queryKey: ['workflows'],
    queryFn: api.listWorkflows,
  });

  const {
    data: templates,
    isLoading: templatesLoading,
    error: templatesError,
  } = useQuery({
    queryKey: ['templates'],
    queryFn: api.listTemplates,
  });

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Workflow Graph Studio</h1>
        <p className="text-muted-foreground mb-8">
          Turn workflow templates into working apps with realistic data and polished UI
        </p>

        {/* Templates Section */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold mb-4">Templates</h2>
          {templatesLoading ? (
            <p className="text-muted-foreground">Loading templates...</p>
          ) : templatesError ? (
            <p className="text-destructive">Failed to load templates</p>
          ) : templates && templates.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((template: TemplateSummary) => (
                <div
                  key={template.id}
                  className="border rounded-lg p-4 hover:border-primary transition-colors"
                >
                  <h3 className="font-medium">{template.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{template.description}</p>
                  <div className="flex gap-2 mt-3 text-xs text-muted-foreground">
                    <span>{template.node_type_count} node types</span>
                    <span>&middot;</span>
                    <span>{template.edge_type_count} edge types</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="border rounded-lg p-8 text-center">
              <p className="text-muted-foreground">No templates available yet.</p>
              <p className="text-sm text-muted-foreground mt-1">
                Templates will appear here once added to the backend.
              </p>
            </div>
          )}
        </section>

        {/* Workflows Section */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Your Workflows</h2>
          {workflowsLoading ? (
            <p className="text-muted-foreground">Loading workflows...</p>
          ) : workflowsError ? (
            <p className="text-destructive">Failed to load workflows</p>
          ) : workflows && workflows.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {workflows.map((workflow: WorkflowSummary) => (
                <div
                  key={workflow.id}
                  className="border rounded-lg p-4 hover:border-primary transition-colors cursor-pointer"
                >
                  <h3 className="font-medium">{workflow.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{workflow.description}</p>
                  <div className="flex gap-2 mt-3 text-xs text-muted-foreground">
                    <span>v{workflow.version}</span>
                    <span>&middot;</span>
                    <span>{workflow.node_type_count} node types</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="border rounded-lg p-8 text-center">
              <p className="text-muted-foreground">No workflows yet.</p>
              <p className="text-sm text-muted-foreground mt-1">
                Create a workflow from a template to get started.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
