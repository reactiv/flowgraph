'use client';

import { useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight, GripVertical } from 'lucide-react';
import type { WorkflowDefinition } from '@/types/workflow';
import type {
  ContextSelector,
  ContextPath,
  EdgeStep,
  Direction,
} from '@/types/context-selector';

interface ContextEditorFormProps {
  /** Workflow definition for available edge/node types. */
  workflowDefinition: WorkflowDefinition;

  /** Current context selector. */
  contextSelector: ContextSelector;

  /** Callback when selector changes. */
  onChange: (selector: ContextSelector) => void;
}

interface PathEditorProps {
  path: ContextPath;
  index: number;
  workflowDefinition: WorkflowDefinition;
  availableFromPaths: string[];
  onUpdate: (path: ContextPath) => void;
  onDelete: () => void;
}

function PathEditor({
  path,
  workflowDefinition,
  availableFromPaths,
  onUpdate,
  onDelete,
}: PathEditorProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const edgeTypes = workflowDefinition.edgeTypes;
  const nodeTypes = workflowDefinition.nodeTypes;

  const handleNameChange = (name: string) => {
    onUpdate({ ...path, name });
  };

  const handleFromPathChange = (fromPath: string | null) => {
    onUpdate({ ...path, fromPath });
  };

  const handleTargetTypeChange = (targetType: string | null) => {
    onUpdate({ ...path, targetType });
  };

  const handleMaxCountChange = (maxCount: number) => {
    onUpdate({ ...path, maxCount: Math.max(1, Math.min(50, maxCount)) });
  };

  const handleAddStep = () => {
    const newStep: EdgeStep = {
      edgeType: edgeTypes[0]?.type || '',
      direction: 'outgoing',
    };
    onUpdate({ ...path, steps: [...path.steps, newStep] });
  };

  const handleUpdateStep = (stepIndex: number, step: EdgeStep) => {
    const newSteps = [...path.steps];
    newSteps[stepIndex] = step;
    onUpdate({ ...path, steps: newSteps });
  };

  const handleDeleteStep = (stepIndex: number) => {
    onUpdate({ ...path, steps: path.steps.filter((_, i) => i !== stepIndex) });
  };

  return (
    <div className="border rounded-lg bg-white">
      {/* Path header */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <GripVertical className="h-4 w-4 text-gray-300" />
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-gray-500" />
        ) : (
          <ChevronRight className="h-4 w-4 text-gray-500" />
        )}
        <input
          type="text"
          value={path.name}
          onChange={(e) => handleNameChange(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 text-sm font-medium bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-purple-300 rounded px-1"
          placeholder="Path name"
        />
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-1 text-gray-400 hover:text-red-500 rounded"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Path details */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-3 border-t">
          {/* From path selector */}
          <div className="pt-3">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Start from
            </label>
            <select
              value={path.fromPath || ''}
              onChange={(e) => handleFromPathChange(e.target.value || null)}
              className="w-full text-sm border rounded px-2 py-1.5 bg-white"
            >
              <option value="">Source node</option>
              {availableFromPaths.map((p) => (
                <option key={p} value={p}>
                  Results of "{p}"
                </option>
              ))}
            </select>
          </div>

          {/* Steps */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Traversal steps
            </label>
            <div className="space-y-2">
              {path.steps.map((step, stepIndex) => (
                <div key={stepIndex} className="flex items-center gap-2">
                  <select
                    value={step.direction}
                    onChange={(e) =>
                      handleUpdateStep(stepIndex, {
                        ...step,
                        direction: e.target.value as Direction,
                      })
                    }
                    className="text-sm border rounded px-2 py-1.5 bg-white w-28"
                  >
                    <option value="outgoing">out:</option>
                    <option value="incoming">in:</option>
                  </select>
                  <select
                    value={step.edgeType}
                    onChange={(e) =>
                      handleUpdateStep(stepIndex, { ...step, edgeType: e.target.value })
                    }
                    className="flex-1 text-sm border rounded px-2 py-1.5 bg-white"
                  >
                    {edgeTypes.map((et) => (
                      <option key={et.type} value={et.type}>
                        {et.displayName || et.type}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleDeleteStep(stepIndex)}
                    className="p-1 text-gray-400 hover:text-red-500 rounded"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <button
                onClick={handleAddStep}
                className="text-sm text-purple-600 hover:text-purple-700 flex items-center gap-1"
              >
                <Plus className="h-3.5 w-3.5" />
                Add step
              </button>
            </div>
          </div>

          {/* Target type and max count */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Target type
              </label>
              <select
                value={path.targetType || ''}
                onChange={(e) => handleTargetTypeChange(e.target.value || null)}
                className="w-full text-sm border rounded px-2 py-1.5 bg-white"
              >
                <option value="">Any type</option>
                {nodeTypes.map((nt) => (
                  <option key={nt.type} value={nt.type}>
                    {nt.displayName || nt.type}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-24">
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Max count
              </label>
              <input
                type="number"
                value={path.maxCount || 10}
                onChange={(e) => handleMaxCountChange(parseInt(e.target.value) || 10)}
                min={1}
                max={50}
                className="w-full text-sm border rounded px-2 py-1.5"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Form-based editor for building context selector paths.
 */
export function ContextEditorForm({
  workflowDefinition,
  contextSelector,
  onChange,
}: ContextEditorFormProps) {
  const handleAddPath = () => {
    const existingNames = contextSelector.paths.map((p) => p.name);
    let newName = 'path';
    let counter = 1;
    while (existingNames.includes(newName)) {
      newName = `path_${counter}`;
      counter++;
    }

    const newPath: ContextPath = {
      name: newName,
      steps: [],
      maxCount: 10,
    };

    onChange({
      ...contextSelector,
      paths: [...contextSelector.paths, newPath],
    });
  };

  const handleUpdatePath = (index: number, path: ContextPath) => {
    const newPaths = [...contextSelector.paths];
    newPaths[index] = path;
    onChange({ ...contextSelector, paths: newPaths });
  };

  const handleDeletePath = (index: number) => {
    onChange({
      ...contextSelector,
      paths: contextSelector.paths.filter((_, i) => i !== index),
    });
  };

  // Get available from_path options (paths defined before each path)
  const getAvailableFromPaths = (index: number) => {
    return contextSelector.paths.slice(0, index).map((p) => p.name);
  };

  return (
    <div className="p-4 space-y-4">
      {/* Paths section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-gray-700">Context Paths</h4>
          <button
            onClick={handleAddPath}
            className="text-sm text-purple-600 hover:text-purple-700 flex items-center gap-1"
          >
            <Plus className="h-4 w-4" />
            Add Path
          </button>
        </div>

        <div className="space-y-2">
          {contextSelector.paths.length === 0 ? (
            <p className="text-sm text-gray-500 italic py-2">
              No paths configured. Add a path to define which nodes to include.
            </p>
          ) : (
            contextSelector.paths.map((path, index) => (
              <PathEditor
                key={`${path.name}-${index}`}
                path={path}
                index={index}
                workflowDefinition={workflowDefinition}
                availableFromPaths={getAvailableFromPaths(index)}
                onUpdate={(p) => handleUpdatePath(index, p)}
                onDelete={() => handleDeletePath(index)}
              />
            ))
          )}
        </div>
      </div>

      {/* Presets section */}
      <div className="border-t pt-4">
        <h4 className="text-sm font-semibold text-gray-700 mb-2">Presets</h4>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() =>
              onChange({
                paths: [{ name: 'neighbors', steps: [], maxCount: 5 }],
                sourceProperties: { mode: 'all', fields: [] },
                contextProperties: { mode: 'all', fields: [] },
              })
            }
            className="text-xs px-3 py-1.5 border rounded-full hover:bg-gray-50 text-gray-600"
          >
            Default (neighbors)
          </button>
          <button
            onClick={() =>
              onChange({
                paths: [],
                sourceProperties: { mode: 'all', fields: [] },
                contextProperties: { mode: 'all', fields: [] },
              })
            }
            className="text-xs px-3 py-1.5 border rounded-full hover:bg-gray-50 text-gray-600"
          >
            Minimal
          </button>
        </div>
      </div>
    </div>
  );
}
