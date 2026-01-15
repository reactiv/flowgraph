'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { SchemaGraphPreview } from '@/components/schema-graph';
import type {
  WorkflowDefinition,
  SchemaGenerationOptions,
  SchemaValidationResult,
} from '@/types/workflow';
import type { ViewTemplateCreate } from '@/types/view-templates';

// Example prompts to help users get started
const EXAMPLE_PROMPTS = [
  {
    label: 'Bug Tracking',
    description: 'A bug tracking system with bugs, features, and sprints',
  },
  {
    label: 'Clinical Trials',
    description: 'A clinical trial workflow with patients, visits, and adverse events',
  },
  {
    label: 'Recipe Management',
    description: 'A recipe management app with recipes, ingredients, and meal plans',
  },
  {
    label: 'Hiring Pipeline',
    description: 'A hiring pipeline with candidates, interviews, and offers',
  },
];

export default function CreateWorkflowPage() {
  const router = useRouter();

  // Form state
  const [description, setDescription] = useState('');
  const [options, setOptions] = useState<SchemaGenerationOptions>({
    includeStates: true,
    includeTags: true,
    scientificTerminology: false,
  });
  const [dataScale, setDataScale] = useState<'small' | 'medium' | 'large'>('medium');

  // Generation state
  const [generatedDefinition, setGeneratedDefinition] = useState<WorkflowDefinition | null>(null);
  const [generatedViews, setGeneratedViews] = useState<ViewTemplateCreate[]>([]);
  const [validation, setValidation] = useState<SchemaValidationResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle schema generation
  const handleGenerate = async () => {
    if (!description.trim()) {
      setError('Please enter a workflow description');
      return;
    }

    setError(null);
    setIsGenerating(true);

    try {
      const response = await api.generateSchemaFromLanguage(description, options);
      setGeneratedDefinition(response.definition);
      setValidation(response.validation);
      setGeneratedViews(response.view_templates || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate schema');
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle workflow creation
  const handleCreate = async () => {
    if (!generatedDefinition) return;

    setIsCreating(true);
    setError(null);

    try {
      // Merge generated views into the definition
      // Convert ViewTemplateCreate to ViewTemplate by adding generated IDs
      const viewTemplatesWithIds = generatedViews.map((view, index) => ({
        ...view,
        id: `view-${Date.now()}-${index}`,
        edges: view.edges || [],
      }));

      const definitionWithViews = {
        ...generatedDefinition,
        viewTemplates: viewTemplatesWithIds,
      };

      const workflow = await api.createFromDefinition(definitionWithViews);

      // Seed the workflow with demo data
      await api.seedWorkflow(workflow.id, dataScale);

      router.push(`/workflows/${workflow.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create workflow');
      setIsCreating(false);
    }
  };

  // Reset to start over
  const handleReset = () => {
    setGeneratedDefinition(null);
    setGeneratedViews([]);
    setValidation(null);
    setError(null);
  };

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground mb-4 inline-block"
          >
            &larr; Back to Home
          </Link>
          <h1 className="text-3xl font-bold mb-2">Create Workflow from Description</h1>
          <p className="text-muted-foreground">
            Describe your workflow in natural language and we&apos;ll generate a schema for you.
          </p>
        </div>

        {/* Step 1: Description Input (shown when no generated definition) */}
        {!generatedDefinition && (
          <div className="space-y-6">
            {/* Description Input */}
            <div>
              <label
                htmlFor="description"
                className="block text-sm font-medium mb-2"
              >
                Workflow Description
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your workflow... For example: A project management system with projects, tasks, and team members. Tasks have priorities and due dates, and can be assigned to team members."
                className="w-full h-32 px-4 py-3 border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={isGenerating}
              />
            </div>

            {/* Example Prompts */}
            <div>
              <p className="text-sm text-muted-foreground mb-2">
                Or try one of these examples:
              </p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_PROMPTS.map((example) => (
                  <button
                    key={example.label}
                    onClick={() => setDescription(example.description)}
                    className="px-3 py-1.5 text-sm border rounded-full hover:bg-muted transition-colors"
                    disabled={isGenerating}
                  >
                    {example.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Options */}
            <div className="border rounded-lg p-4">
              <p className="text-sm font-medium mb-3">Options</p>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={options.includeStates}
                    onChange={(e) =>
                      setOptions({ ...options, includeStates: e.target.checked })
                    }
                    disabled={isGenerating}
                    className="rounded"
                  />
                  Include state machines (status progressions)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={options.includeTags}
                    onChange={(e) =>
                      setOptions({ ...options, includeTags: e.target.checked })
                    }
                    disabled={isGenerating}
                    className="rounded"
                  />
                  Include tagging system
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={options.scientificTerminology}
                    onChange={(e) =>
                      setOptions({ ...options, scientificTerminology: e.target.checked })
                    }
                    disabled={isGenerating}
                    className="rounded"
                  />
                  Use scientific terminology
                </label>
              </div>
            </div>

            {/* Error Display */}
            {error && (
              <div className="p-4 border border-destructive rounded-lg bg-destructive/10 text-destructive">
                {error}
              </div>
            )}

            {/* Generate Button */}
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !description.trim()}
              className="w-full py-3 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isGenerating ? 'Generating Schema...' : 'Generate Schema'}
            </button>
          </div>
        )}

        {/* Step 2: Preview and Create (shown when definition is generated) */}
        {generatedDefinition && (
          <div className="space-y-6">
            {/* Schema Info */}
            <div className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-semibold">{generatedDefinition.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {generatedDefinition.description}
                  </p>
                </div>
                <div className="text-right text-sm text-muted-foreground">
                  <div>{generatedDefinition.nodeTypes?.length ?? 0} node types</div>
                  <div>{generatedDefinition.edgeTypes?.length ?? 0} edge types</div>
                </div>
              </div>

              {/* Schema Graph Preview */}
              <div className="border rounded-lg overflow-hidden">
                <SchemaGraphPreview definition={generatedDefinition} />
              </div>
            </div>

            {/* Validation Results */}
            {validation && (
              <div className="space-y-3">
                {/* Errors */}
                {validation.errors.length > 0 && (
                  <div className="p-4 border border-destructive rounded-lg bg-destructive/10">
                    <p className="font-medium text-destructive mb-2">Errors</p>
                    <ul className="list-disc list-inside text-sm text-destructive space-y-1">
                      {validation.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Warnings */}
                {validation.warnings.length > 0 && (
                  <div className="p-4 border border-yellow-500 rounded-lg bg-yellow-50">
                    <p className="font-medium text-yellow-700 mb-2">Warnings</p>
                    <ul className="list-disc list-inside text-sm text-yellow-700 space-y-1">
                      {validation.warnings.map((warn, i) => (
                        <li key={i}>{warn}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Fixes Applied */}
                {validation.fixesApplied.length > 0 && (
                  <div className="p-4 border border-blue-500 rounded-lg bg-blue-50">
                    <p className="font-medium text-blue-700 mb-2">Auto-fixes Applied</p>
                    <ul className="list-disc list-inside text-sm text-blue-700 space-y-1">
                      {validation.fixesApplied.map((fix, i) => (
                        <li key={i}>{fix}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Node Types List */}
            <div className="border rounded-lg p-4">
              <h3 className="font-medium mb-3">Node Types</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {generatedDefinition.nodeTypes?.map((nodeType) => (
                  <div
                    key={nodeType.type}
                    className="border rounded-lg p-3 bg-muted/30"
                  >
                    <div className="font-medium">{nodeType.displayName}</div>
                    <div className="text-sm text-muted-foreground">
                      {nodeType.fields?.length ?? 0} fields
                      {nodeType.states?.enabled && ` \u2022 ${nodeType.states.values.length} states`}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Generated View Templates */}
            {generatedViews.length > 0 && (
              <div className="border rounded-lg p-4">
                <h3 className="font-medium mb-3">Generated Views</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  These views will be created automatically with your workflow.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {generatedViews.map((view, index) => {
                    // Get the style from the first level config
                    const levelConfig = Object.values(view.levels)[0];
                    const style = levelConfig?.style || 'kanban';
                    const styleIcon = {
                      kanban: '📊',
                      cards: '🃏',
                      tree: '🌳',
                      timeline: '📅',
                      table: '📋',
                      gantt: '📈',
                    }[style] || '📊';

                    return (
                      <div
                        key={index}
                        className="border rounded-lg p-3 bg-muted/30"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{styleIcon}</span>
                          <div>
                            <div className="font-medium">{view.name}</div>
                            <div className="text-sm text-muted-foreground">
                              {view.rootType} • {style}
                            </div>
                          </div>
                        </div>
                        {view.description && (
                          <p className="text-sm text-muted-foreground mt-2">
                            {view.description}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Demo Data Settings */}
            <div className="border rounded-lg p-4">
              <h3 className="font-medium mb-3">Demo Data</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Generate realistic sample data to populate your workflow.
              </p>
              <div className="flex items-center gap-3">
                <label htmlFor="data-scale" className="text-sm font-medium">
                  Amount:
                </label>
                <select
                  id="data-scale"
                  value={dataScale}
                  onChange={(e) => setDataScale(e.target.value as 'small' | 'medium' | 'large')}
                  disabled={isCreating}
                  className="px-3 py-2 border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="small">Small (3-8 items per type)</option>
                  <option value="medium">Medium (10-25 items per type)</option>
                  <option value="large">Large (30-60 items per type)</option>
                </select>
              </div>
            </div>

            {/* Error Display */}
            {error && (
              <div className="p-4 border border-destructive rounded-lg bg-destructive/10 text-destructive">
                {error}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-4">
              <button
                onClick={handleReset}
                disabled={isCreating}
                className="flex-1 py-3 px-4 border rounded-lg font-medium hover:bg-muted transition-colors disabled:opacity-50"
              >
                Start Over
              </button>
              <button
                onClick={handleCreate}
                disabled={isCreating || (validation !== null && !validation.isValid)}
                className="flex-1 py-3 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isCreating ? 'Creating & Seeding...' : 'Create Workflow'}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
