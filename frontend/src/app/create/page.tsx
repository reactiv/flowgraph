'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useSeedWorkflow } from '@/lib/use-seed-workflow';
import { useFileUpload } from '@/lib/use-file-upload';
import { useTransformerStream } from '@/lib/use-transformer-stream';
import { SchemaGraphPreview } from '@/components/schema-graph';
import { SeedProgress } from '@/components/seed-progress';
import { FileDropzone } from '@/components/file-dropzone';
import { TransformerProgress } from '@/components/transformer-progress';
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

// Type for schema generation result from SSE
interface SchemaStreamResult {
  event: string;
  definition?: WorkflowDefinition;
  validation?: SchemaValidationResult;
  view_templates?: ViewTemplateCreate[];
}

// Type for file-based seeding result from SSE
interface SeedFromFilesResult {
  event: string;
  nodes_created?: number;
  edges_created?: number;
}

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
  const [seedSource, setSeedSource] = useState<'synthetic' | 'files'>('synthetic');

  // Generation state
  const [generatedDefinition, setGeneratedDefinition] = useState<WorkflowDefinition | null>(null);
  const [generatedViews, setGeneratedViews] = useState<ViewTemplateCreate[]>([]);
  const [validation, setValidation] = useState<SchemaValidationResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // File upload state
  const {
    selectedFiles,
    addFiles,
    removeFile,
    clearFiles,
    upload,
    isUploading,
    uploadId,
    error: uploadError,
  } = useFileUpload();

  // Transformer stream for schema generation
  const schemaStream = useTransformerStream<SchemaStreamResult>();

  // Transformer stream for file-based seeding
  const seedStream = useTransformerStream<SeedFromFilesResult>();

  // Seeding with progress (synthetic data)
  const { seedWithProgress, progress: seedProgress, isSeeding } = useSeedWorkflow();

  // Check if we have files that can be used for seeding
  const hasUploadedFiles = uploadId !== null;

  // Handle schema generation
  const handleGenerate = async () => {
    if (!description.trim()) {
      setError('Please enter a workflow description');
      return;
    }

    setError(null);
    setIsGenerating(true);

    try {
      // If files are selected, upload them first
      let currentUploadId = uploadId;
      if (selectedFiles.length > 0 && !uploadId) {
        const uploadResult = await upload();
        currentUploadId = uploadResult.upload_id;
      }

      // If we have uploaded files, use the transformer SSE endpoint
      if (currentUploadId) {
        const params = new URLSearchParams({
          upload_id: currentUploadId,
          description: description,
          include_states: String(options.includeStates ?? true),
          include_tags: String(options.includeTags ?? true),
          scientific_terminology: String(options.scientificTerminology ?? false),
        });

        const result = await schemaStream.start(
          `/api/v1/workflows/from-files/stream?${params.toString()}`
        );

        if (result.definition) {
          setGeneratedDefinition(result.definition);
          setValidation(result.validation || null);
          setGeneratedViews(result.view_templates || []);
        } else {
          throw new Error('No definition received from transformer');
        }
      } else {
        // Use the regular endpoint
        const response = await api.generateSchemaFromLanguage(description, options);
        setGeneratedDefinition(response.definition);
        setValidation(response.validation);
        setGeneratedViews(response.view_templates || []);
      }
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

      // Seed based on selected source
      if (seedSource === 'files' && uploadId) {
        // Seed from uploaded files
        const params = new URLSearchParams({
          upload_id: uploadId,
        });

        await seedStream.start(
          `/api/v1/workflows/${workflow.id}/seed-from-files/stream?${params.toString()}`
        );
      } else {
        // Seed with synthetic demo data using SSE for progress
        await seedWithProgress(workflow.id, dataScale);
      }

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
    clearFiles();
    schemaStream.reset();
    seedStream.reset();
  };

  const isProcessing = isGenerating || isUploading || schemaStream.isRunning;
  const isSeedingFromFiles = seedStream.isRunning;
  const displayError = error || uploadError || schemaStream.error || seedStream.error;

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
            Optionally upload files to help inform the schema or seed with real data.
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
                disabled={isProcessing}
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
                    disabled={isProcessing}
                  >
                    {example.label}
                  </button>
                ))}
              </div>
            </div>

            {/* File Upload */}
            <div className="border rounded-lg p-4">
              <p className="text-sm font-medium mb-2">Reference Files (optional)</p>
              <p className="text-sm text-muted-foreground mb-3">
                Upload files to help generate a more accurate schema and optionally seed with real data.
              </p>
              <FileDropzone
                onFilesSelected={addFiles}
                selectedFiles={selectedFiles}
                onRemoveFile={removeFile}
                disabled={isProcessing}
                error={uploadError}
              />
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
                    disabled={isProcessing}
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
                    disabled={isProcessing}
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
                    disabled={isProcessing}
                    className="rounded"
                  />
                  Use scientific terminology
                </label>
              </div>
            </div>

            {/* Error Display */}
            {displayError && (
              <div className="p-4 border border-destructive rounded-lg bg-destructive/10 text-destructive">
                {displayError}
              </div>
            )}

            {/* Transformer Progress (shown during file-based generation or on error) */}
            {(schemaStream.isRunning || schemaStream.error || schemaStream.events.length > 0) && (
              <div className="border rounded-lg p-4 bg-muted/30">
                <h3 className="font-medium mb-3">Analyzing Files</h3>
                <TransformerProgress
                  events={schemaStream.events}
                  isRunning={schemaStream.isRunning}
                  error={schemaStream.error}
                />
              </div>
            )}

            {/* Generate Button */}
            <button
              onClick={handleGenerate}
              disabled={isProcessing || !description.trim()}
              className="w-full py-3 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isUploading
                ? 'Uploading Files...'
                : schemaStream.isRunning
                ? 'Analyzing Files...'
                : isGenerating
                ? 'Generating Schema...'
                : 'Generate Schema'}
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
                {validation.errors && validation.errors.length > 0 && (
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
                {validation.warnings && validation.warnings.length > 0 && (
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
                {validation.fixesApplied && validation.fixesApplied.length > 0 && (
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
                      kanban: '\uD83D\uDCCA',
                      cards: '\uD83C\uDCCF',
                      tree: '\uD83C\uDF33',
                      timeline: '\uD83D\uDCC5',
                      table: '\uD83D\uDCCB',
                      gantt: '\uD83D\uDCC8',
                    }[style] || '\uD83D\uDCCA';

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
                              {view.rootType} \u2022 {style}
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
                {hasUploadedFiles
                  ? 'Choose how to populate your workflow with data.'
                  : 'Generate realistic sample data to populate your workflow.'}
              </p>

              {/* Seed Source Toggle (only shown if files were uploaded) */}
              {hasUploadedFiles && (
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => setSeedSource('synthetic')}
                    disabled={isCreating || isSeeding || isSeedingFromFiles}
                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                      seedSource === 'synthetic'
                        ? 'bg-primary text-primary-foreground'
                        : 'border hover:bg-muted'
                    }`}
                  >
                    Synthetic Data
                  </button>
                  <button
                    onClick={() => setSeedSource('files')}
                    disabled={isCreating || isSeeding || isSeedingFromFiles}
                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                      seedSource === 'files'
                        ? 'bg-primary text-primary-foreground'
                        : 'border hover:bg-muted'
                    }`}
                  >
                    Import from Files
                  </button>
                </div>
              )}

              {/* Scale selector (only for synthetic data) */}
              {seedSource === 'synthetic' && (
                <div className="flex items-center gap-3">
                  <label htmlFor="data-scale" className="text-sm font-medium">
                    Amount:
                  </label>
                  <select
                    id="data-scale"
                    value={dataScale}
                    onChange={(e) => setDataScale(e.target.value as 'small' | 'medium' | 'large')}
                    disabled={isCreating || isSeeding || isSeedingFromFiles}
                    className="px-3 py-2 border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="small">Small (3-8 items per type)</option>
                    <option value="medium">Medium (10-25 items per type)</option>
                    <option value="large">Large (30-60 items per type)</option>
                  </select>
                </div>
              )}

              {/* Info for file-based seeding */}
              {seedSource === 'files' && (
                <p className="text-sm text-muted-foreground">
                  Data will be extracted from your uploaded files and imported into the workflow.
                </p>
              )}
            </div>

            {/* Error Display */}
            {displayError && (
              <div className="p-4 border border-destructive rounded-lg bg-destructive/10 text-destructive">
                {displayError}
              </div>
            )}

            {/* Seeding Progress (synthetic) */}
            {isSeeding && seedProgress && (
              <div className="border rounded-lg p-4 bg-muted/30">
                <h3 className="font-medium mb-3">Generating Demo Data</h3>
                <SeedProgress progress={seedProgress} />
              </div>
            )}

            {/* Seeding Progress (from files) */}
            {(isSeedingFromFiles || seedStream.error || seedStream.events.length > 0) && (
              <div className="border rounded-lg p-4 bg-muted/30">
                <h3 className="font-medium mb-3">Importing Data from Files</h3>
                <TransformerProgress
                  events={seedStream.events}
                  isRunning={seedStream.isRunning}
                  error={seedStream.error}
                />
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-4">
              <button
                onClick={handleReset}
                disabled={isCreating || isSeeding || isSeedingFromFiles}
                className="flex-1 py-3 px-4 border rounded-lg font-medium hover:bg-muted transition-colors disabled:opacity-50"
              >
                Start Over
              </button>
              <button
                onClick={handleCreate}
                disabled={isCreating || isSeeding || isSeedingFromFiles || (validation !== null && !validation.isValid)}
                className="flex-1 py-3 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSeedingFromFiles
                  ? 'Importing Data...'
                  : isSeeding
                  ? 'Seeding Data...'
                  : isCreating
                  ? 'Creating Workflow...'
                  : 'Create Workflow'}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
