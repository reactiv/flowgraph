'use client';

import { useState, useEffect } from 'react';
import { Code, FileText, Loader2, AlertCircle, Check, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import { TransformerProgress, TransformerEvent } from './transformer-progress';

export interface TransformPreview {
  node_count: number;
  edge_count: number;
  sample_nodes: Array<{
    node_type: string;
    title: string;
    status?: string | null;
  }>;
}

interface TransformConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onRegenerate: (instruction: string) => void;
  scriptContent: string;
  preview: TransformPreview;
  instruction: string;
  onInstructionChange: (instruction: string) => void;
  isRegenerating: boolean;
  isConfirming: boolean;
  regenerateEvents: TransformerEvent[];
  confirmEvents: TransformerEvent[];
  error?: string | null;
}

export function TransformConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  onRegenerate,
  scriptContent,
  preview,
  instruction,
  onInstructionChange,
  isRegenerating,
  isConfirming,
  regenerateEvents,
  confirmEvents,
  error,
}: TransformConfirmationModalProps) {
  const [showScript, setShowScript] = useState(false);
  const [localInstruction, setLocalInstruction] = useState(instruction);
  const instructionChanged = localInstruction !== instruction;

  // Sync local instruction with prop when modal opens or instruction changes externally
  useEffect(() => {
    setLocalInstruction(instruction);
  }, [instruction, isOpen]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setShowScript(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isLoading = isRegenerating || isConfirming;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={isLoading ? undefined : onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-lg bg-white shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 border-b px-6 py-4 flex-shrink-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
            <FileText className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Confirm Data Import
            </h2>
            <p className="text-sm text-gray-500">
              Review the transformation before importing
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Preview Stats */}
          <div className="rounded-lg bg-blue-50 p-4">
            <h3 className="text-sm font-medium text-blue-800 mb-3">
              Import Preview
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100">
                  <span className="text-sm font-bold text-blue-700">
                    {preview.node_count}
                  </span>
                </div>
                <span className="text-sm text-blue-700">nodes to create</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100">
                  <span className="text-sm font-bold text-blue-700">
                    {preview.edge_count}
                  </span>
                </div>
                <span className="text-sm text-blue-700">edges to create</span>
              </div>
            </div>
          </div>

          {/* Sample Nodes */}
          {preview.sample_nodes.length > 0 && (
            <div className="rounded-lg border p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">
                Sample Nodes ({Math.min(preview.sample_nodes.length, 10)} of {preview.node_count})
              </h3>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {preview.sample_nodes.slice(0, 10).map((node, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 text-sm py-1 border-b border-gray-100 last:border-0"
                  >
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                      {node.node_type}
                    </span>
                    <span className="text-gray-900 truncate flex-1">
                      {node.title}
                    </span>
                    {node.status && (
                      <span className="inline-flex items-center rounded-full bg-gray-50 px-2 py-0.5 text-xs text-gray-500">
                        {node.status}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Transform Script (collapsible) */}
          <div className="rounded-lg border">
            <button
              onClick={() => setShowScript(!showScript)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Code className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">
                  Transform Script
                </span>
                <span className="text-xs text-gray-400">
                  ({scriptContent.split('\n').length} lines)
                </span>
              </div>
              {showScript ? (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronRight className="h-4 w-4 text-gray-400" />
              )}
            </button>
            {showScript && (
              <div className="border-t">
                <pre className="p-4 text-xs font-mono bg-gray-900 text-gray-100 overflow-x-auto max-h-64">
                  {scriptContent}
                </pre>
              </div>
            )}
          </div>

          {/* Instruction Editor */}
          <div>
            <label
              htmlFor="instruction"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Transformation Instructions
            </label>
            <textarea
              id="instruction"
              value={localInstruction}
              onChange={(e) => {
                setLocalInstruction(e.target.value);
                onInstructionChange(e.target.value);
              }}
              placeholder="e.g., Extract all messages and their authors..."
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              rows={3}
              disabled={isLoading}
            />
            {instructionChanged && (
              <p className="mt-1 text-xs text-amber-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Instructions changed. Click &quot;Regenerate&quot; to apply.
              </p>
            )}
          </div>

          {/* Progress during regeneration */}
          {isRegenerating && regenerateEvents.length > 0 && (
            <div className="rounded-lg border p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">
                Regenerating...
              </h3>
              <TransformerProgress
                events={regenerateEvents}
                isRunning={isRegenerating}
                error={null}
              />
            </div>
          )}

          {/* Progress during confirmation */}
          {isConfirming && confirmEvents.length > 0 && (
            <div className="rounded-lg border p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">
                Importing Data...
              </h3>
              <TransformerProgress
                events={confirmEvents}
                isRunning={isConfirming}
                error={null}
              />
            </div>
          )}

          {/* Error display */}
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between gap-3 border-t px-6 py-4 flex-shrink-0 bg-gray-50">
          <button
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
            disabled={isLoading}
          >
            Cancel
          </button>
          <div className="flex gap-3">
            <button
              onClick={() => onRegenerate(localInstruction)}
              disabled={isLoading}
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {isRegenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Regenerating...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Regenerate
                </>
              )}
            </button>
            <button
              onClick={onConfirm}
              disabled={isLoading || instructionChanged}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-blue-300"
              title={instructionChanged ? 'Regenerate first to apply new instructions' : undefined}
            >
              {isConfirming ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Confirm & Import
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
