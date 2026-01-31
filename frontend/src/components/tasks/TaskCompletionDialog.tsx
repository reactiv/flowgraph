'use client';

import { useState, useCallback, useMemo } from 'react';
import { X, Eye, FileText } from 'lucide-react';
import type {
  TaskDefinition,
  TaskSetInstance,
  CreateNodeDelta,
  DeltaType,
  CompoundDelta,
} from '@/types/task';
import { isCompoundDelta } from '@/types/task';
import type { WorkflowDefinition, NodeType } from '@/types/workflow';
import { TaskDeltaPreview } from './TaskDeltaPreview';
import { TaskFieldForm, type CompoundFormStep } from './TaskFieldForm';
import { cn } from '@/lib/utils';

interface TaskCompletionDialogProps {
  isOpen: boolean;
  taskDefinition: TaskDefinition;
  taskSetInstance: TaskSetInstance;
  workflowId: string;
  workflowDefinition: WorkflowDefinition;
  onConfirm: (initialValues?: Record<string, unknown>) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

type TabId = 'preview' | 'details';

/**
 * Main dialog for task completion confirmation.
 * Shows delta preview and form fields for create_node deltas.
 * Supports both single create_node deltas and compound deltas.
 */
export function TaskCompletionDialog({
  isOpen,
  taskDefinition,
  taskSetInstance,
  workflowId,
  workflowDefinition,
  onConfirm,
  onCancel,
  isSubmitting = false,
}: TaskCompletionDialogProps) {
  const [activeTab, setActiveTab] = useState<TabId>('preview');
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const [isFormValid, setIsFormValid] = useState(true);

  const delta = taskDefinition.delta;
  const deltaType = delta.deltaType as DeltaType;
  const isCreateNode = deltaType === 'create_node';
  const isCompound = isCompoundDelta(delta);

  // Get the node type for single create_node deltas
  const nodeType: NodeType | undefined = isCreateNode
    ? workflowDefinition.nodeTypes.find(
        (nt) => nt.type === (delta as CreateNodeDelta).nodeType
      )
    : undefined;

  // Extract create_node steps from compound deltas for form generation
  const compoundFormSteps: CompoundFormStep[] = useMemo(() => {
    if (!isCompound) return [];

    const compoundDelta = delta as CompoundDelta;
    return compoundDelta.steps
      .filter((step) => step.delta.deltaType === 'create_node')
      .map((step) => {
        const createNodeDelta = step.delta as CreateNodeDelta;
        const stepNodeType = workflowDefinition.nodeTypes.find(
          (nt) => nt.type === createNodeDelta.nodeType
        );
        return {
          key: step.key,
          label: step.label,
          nodeType: stepNodeType!,
          delta: createNodeDelta,
        };
      })
      .filter((step) => step.nodeType !== undefined);
  }, [delta, isCompound, workflowDefinition.nodeTypes]);

  // Determine if we need a form (has editable fields)
  const hasEditableFields = useMemo(() => {
    if (isCreateNode && nodeType) {
      return nodeType.fields.length > 0;
    }
    if (isCompound && compoundFormSteps.length > 0) {
      return compoundFormSteps.some((step) => step.nodeType.fields.length > 0);
    }
    return false;
  }, [isCreateNode, nodeType, isCompound, compoundFormSteps]);

  // Handle form values change
  const handleValuesChange = useCallback(
    (values: Record<string, unknown>, isValid: boolean) => {
      setFormValues(values);
      setIsFormValid(isValid);
    },
    []
  );

  // Handle confirm
  const handleConfirm = () => {
    if (hasEditableFields) {
      // Include form values
      onConfirm(formValues);
    } else {
      // No additional values needed
      onConfirm();
    }
  };

  // Check if confirm should be disabled
  const isConfirmDisabled = isSubmitting || (hasEditableFields && !isFormValid);

  // Get delta type badge color
  const getDeltaTypeBadge = () => {
    switch (deltaType) {
      case 'create_node':
        return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
      case 'update_node_status':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'update_node_field':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
      case 'create_edge':
        return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
      case 'compound':
        return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  // Format delta type for display
  const formatDeltaType = (type: DeltaType): string => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onCancel}
      />

      {/* Dialog */}
      <div className="relative bg-background rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">{taskDefinition.name}</h2>
            <span
              className={cn(
                'px-2 py-0.5 rounded text-xs font-medium',
                getDeltaTypeBadge()
              )}
            >
              {formatDeltaType(deltaType)}
            </span>
          </div>
          <button
            onClick={onCancel}
            className="p-1 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs (show if there are editable fields) */}
        {hasEditableFields && (
          <div className="flex border-b border-border">
            <button
              onClick={() => setActiveTab('preview')}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors',
                activeTab === 'preview'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Eye className="h-4 w-4" />
              Preview
            </button>
            <button
              onClick={() => setActiveTab('details')}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors',
                activeTab === 'details'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <FileText className="h-4 w-4" />
              Details
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {/* Description */}
          {taskDefinition.description && (
            <p className="text-sm text-muted-foreground mb-4">
              {taskDefinition.description}
            </p>
          )}

          {/* Preview Tab or Default Content */}
          {(!hasEditableFields || activeTab === 'preview') && (
            <TaskDeltaPreview
              delta={delta}
              workflowId={workflowId}
              taskSetInstance={taskSetInstance}
            />
          )}

          {/* Details Tab (for single create_node) */}
          {isCreateNode && nodeType && activeTab === 'details' && (
            <TaskFieldForm
              nodeType={nodeType}
              delta={delta as CreateNodeDelta}
              onValuesChange={handleValuesChange}
              disabled={isSubmitting}
            />
          )}

          {/* Details Tab (for compound deltas with create_node steps) */}
          {isCompound && compoundFormSteps.length > 0 && activeTab === 'details' && (
            <TaskFieldForm
              compoundSteps={compoundFormSteps}
              onValuesChange={handleValuesChange}
              disabled={isSubmitting}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-foreground hover:bg-muted rounded-md disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isConfirmDisabled}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-md transition-colors',
              'bg-primary text-primary-foreground hover:bg-primary/90',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {isSubmitting ? 'Completing...' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Check if a delta type requires showing the confirmation dialog.
 * Currently shows dialog for all delta types that change the graph.
 */
export function shouldShowCompletionDialog(deltaType: DeltaType): boolean {
  return [
    'create_node',
    'update_node_status',
    'update_node_field',
    'create_edge',
    'compound',
  ].includes(deltaType);
}
