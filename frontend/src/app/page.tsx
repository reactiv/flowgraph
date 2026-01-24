'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { WorkflowSummary, TemplateSummary } from '@/types/workflow';

export default function Home() {
  const router = useRouter();

  const handleCreateFromTemplate = (templateId: string) => {
    router.push(`/create?template=${encodeURIComponent(templateId)}`);
  };

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
        <h1 className="text-3xl font-heading font-bold mb-2 text-foreground">Workflow Graph Studio</h1>
        <p className="text-muted-foreground mb-8">
          Turn workflow templates into working apps with realistic data and polished UI
        </p>

        {/* Create from Description CTA */}
        <section className="mb-12">
          <Link
            href="/create"
            className="group block border border-primary/30 rounded-lg p-6 bg-primary/5 hover:border-primary hover:bg-primary/10 transition-all duration-200"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center group-hover:bg-primary/30 transition-colors">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="w-6 h-6 text-primary"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="font-heading font-semibold text-lg text-foreground">Create from Description</h3>
                <p className="text-muted-foreground text-sm">
                  Describe your workflow in natural language and AI will generate a schema for you
                </p>
              </div>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.25 4.5l7.5 7.5-7.5 7.5"
                />
              </svg>
            </div>
          </Link>
        </section>

        {/* Templates Section */}
        <section className="mb-12">
          <h2 className="text-xl font-heading font-semibold mb-4 text-foreground">Templates</h2>
          {templatesLoading ? (
            <p className="text-muted-foreground">Loading templates...</p>
          ) : templatesError ? (
            <p className="text-destructive">Failed to load templates</p>
          ) : templates && templates.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((template: TemplateSummary) => (
                <button
                  key={template.id}
                  onClick={() => handleCreateFromTemplate(template.id)}
                  className="border border-border rounded-lg p-4 bg-card hover:border-primary/50 hover:bg-card/80 transition-all duration-200 text-left"
                >
                  <h3 className="font-medium text-foreground">{template.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{template.description}</p>
                  <div className="flex gap-2 mt-3 text-xs text-muted-foreground font-mono">
                    <span>{template.node_type_count} node types</span>
                    <span>&middot;</span>
                    <span>{template.edge_type_count} edge types</span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="border border-border rounded-lg p-8 text-center bg-card">
              <p className="text-muted-foreground">No templates available yet.</p>
              <p className="text-sm text-muted-foreground mt-1">
                Templates will appear here once added to the backend.
              </p>
            </div>
          )}
        </section>

        {/* Workflows Section */}
        <section>
          <h2 className="text-xl font-heading font-semibold mb-4 text-foreground">Your Workflows</h2>
          {workflowsLoading ? (
            <p className="text-muted-foreground">Loading workflows...</p>
          ) : workflowsError ? (
            <p className="text-destructive">Failed to load workflows</p>
          ) : workflows && workflows.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {workflows.map((workflow: WorkflowSummary) => (
                <Link
                  key={workflow.id}
                  href={`/workflows/${workflow.id}`}
                  className="block border border-border rounded-lg p-4 bg-card hover:border-primary/50 hover:bg-card/80 transition-all duration-200"
                >
                  <h3 className="font-medium text-foreground">{workflow.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{workflow.description}</p>
                  <div className="flex gap-2 mt-3 text-xs text-muted-foreground font-mono">
                    <span>v{workflow.version}</span>
                    <span>&middot;</span>
                    <span>{workflow.node_type_count} node types</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="border border-border rounded-lg p-8 text-center bg-card">
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
