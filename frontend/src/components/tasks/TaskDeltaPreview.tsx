'use client';

import { Plus, ArrowRight, Link2, Edit3, Layers } from 'lucide-react';
import type {
  TaskDelta,
  CreateNodeDelta,
  UpdateNodeStatusDelta,
  UpdateNodeFieldDelta,
  CreateEdgeDelta,
  CompoundDelta,
  TaskSetInstance,
} from '@/types/task';
import { isCompoundDelta } from '@/types/task';
import { useResolveNodeReference } from '@/hooks/useResolveNodeReference';

interface TaskDeltaPreviewProps {
  delta: TaskDelta;
  workflowId: string;
  taskSetInstance?: TaskSetInstance;
  isNested?: boolean; // For nested previews within compound deltas
}

/**
 * Shows a preview of what will happen when a task is completed.
 * Renders different UI based on delta type.
 */
export function TaskDeltaPreview({
  delta,
  workflowId,
  taskSetInstance,
  isNested = false,
}: TaskDeltaPreviewProps) {
  // Handle compound deltas
  if (isCompoundDelta(delta)) {
    return (
      <CompoundDeltaPreview
        delta={delta}
        workflowId={workflowId}
        taskSetInstance={taskSetInstance}
      />
    );
  }

  const deltaType = delta.deltaType;

  switch (deltaType) {
    case 'create_node':
      return (
        <CreateNodePreview delta={delta as CreateNodeDelta} isNested={isNested} />
      );
    case 'update_node_status':
      return (
        <UpdateStatusPreview
          delta={delta as UpdateNodeStatusDelta}
          workflowId={workflowId}
          taskSetInstance={taskSetInstance}
          isNested={isNested}
        />
      );
    case 'update_node_field':
      return (
        <UpdateFieldPreview
          delta={delta as UpdateNodeFieldDelta}
          workflowId={workflowId}
          taskSetInstance={taskSetInstance}
          isNested={isNested}
        />
      );
    case 'create_edge':
      return (
        <CreateEdgePreview
          delta={delta as CreateEdgeDelta}
          workflowId={workflowId}
          taskSetInstance={taskSetInstance}
          isNested={isNested}
        />
      );
    default:
      return (
        <div className="text-sm text-muted-foreground">
          Unknown delta type
        </div>
      );
  }
}

/**
 * Preview for compound deltas that shows all steps.
 */
function CompoundDeltaPreview({
  delta,
  workflowId,
  taskSetInstance,
}: {
  delta: CompoundDelta;
  workflowId: string;
  taskSetInstance?: TaskSetInstance;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <div className="p-1.5 rounded-md bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
          <Layers className="h-4 w-4" />
        </div>
        <span className="font-medium">Compound operation</span>
        <span className="text-muted-foreground">({delta.steps.length} steps)</span>
      </div>

      <div className="space-y-2 pl-4 border-l-2 border-muted">
        {delta.steps.map((step, index) => (
          <div key={step.key} className="relative">
            {/* Step indicator */}
            <div className="absolute -left-[21px] w-4 h-4 rounded-full bg-muted flex items-center justify-center">
              <span className="text-[10px] font-medium">{index + 1}</span>
            </div>

            {/* Step label */}
            {step.label && (
              <div className="text-xs font-medium text-muted-foreground mb-1">
                {step.label}
              </div>
            )}

            {/* Step delta preview (recursive) */}
            <div className="bg-muted/30 rounded-md p-2">
              <TaskDeltaPreview
                delta={step.delta}
                workflowId={workflowId}
                taskSetInstance={taskSetInstance}
                isNested
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CreateNodePreview({
  delta,
  isNested = false,
}: {
  delta: CreateNodeDelta;
  isNested?: boolean;
}) {
  const initialValues = delta.initialValues || {};
  const hasInitialValues = Object.keys(initialValues).length > 0;

  return (
    <div className={isNested ? 'space-y-1' : 'space-y-3'}>
      <div className="flex items-center gap-2 text-sm">
        {!isNested && (
          <div className="p-1.5 rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
            <Plus className="h-4 w-4" />
          </div>
        )}
        <span className={isNested ? 'text-xs' : 'font-medium'}>
          {isNested ? `+ ${delta.nodeType}` : `Create ${delta.nodeType} node`}
        </span>
        {delta.initialStatus && (
          <span className="text-xs text-muted-foreground">
            ({delta.initialStatus})
          </span>
        )}
      </div>

      {!isNested && delta.initialStatus && (
        <div className="text-xs text-muted-foreground ml-8">
          Initial status: <span className="font-medium">{delta.initialStatus}</span>
        </div>
      )}

      {hasInitialValues && !isNested && (
        <div className="ml-8 space-y-1">
          <div className="text-xs text-muted-foreground mb-2">Pre-filled values:</div>
          <div className="bg-muted/50 rounded-md p-2 space-y-1">
            {Object.entries(initialValues).map(([key, value]) => (
              <div key={key} className="text-xs flex gap-2">
                <span className="text-muted-foreground">{key}:</span>
                <span className="font-mono">{formatValue(value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function UpdateStatusPreview({
  delta,
  workflowId,
  taskSetInstance,
  isNested = false,
}: {
  delta: UpdateNodeStatusDelta;
  workflowId: string;
  taskSetInstance?: TaskSetInstance;
  isNested?: boolean;
}) {
  const { node, isLoading } = useResolveNodeReference({
    workflowId,
    nodeRef: delta.targetNode,
    taskSetInstance,
  });

  const fromStatus = Array.isArray(delta.fromStatus)
    ? delta.fromStatus.join(' or ')
    : delta.fromStatus || 'any';

  // Get target label (for step_output references, show the step key)
  const targetLabel = delta.targetNode.type === 'step_output'
    ? `Step "${delta.targetNode.stepKey}"`
    : node?.title || 'Target node';

  if (isNested) {
    return (
      <div className="flex items-center gap-2 text-xs flex-wrap">
        <span className="text-muted-foreground">{targetLabel}:</span>
        <span className="px-1.5 py-0.5 rounded bg-muted">{fromStatus}</span>
        <ArrowRight className="h-3 w-3 text-muted-foreground" />
        <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
          {delta.toStatus}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <div className="p-1.5 rounded-md bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
          <ArrowRight className="h-4 w-4" />
        </div>
        <span className="font-medium">Update node status</span>
      </div>

      <div className="ml-8 bg-muted/50 rounded-md p-3">
        {isLoading ? (
          <div className="text-xs text-muted-foreground">Loading...</div>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">{targetLabel}</span>
            <span className="text-muted-foreground">:</span>
            <span className="px-1.5 py-0.5 rounded bg-muted text-xs">
              {fromStatus}
            </span>
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-xs font-medium">
              {delta.toStatus}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function UpdateFieldPreview({
  delta,
  workflowId,
  taskSetInstance,
  isNested = false,
}: {
  delta: UpdateNodeFieldDelta;
  workflowId: string;
  taskSetInstance?: TaskSetInstance;
  isNested?: boolean;
}) {
  const { node, isLoading } = useResolveNodeReference({
    workflowId,
    nodeRef: delta.targetNode,
    taskSetInstance,
  });

  // Get target label (for step_output references, show the step key)
  const targetLabel = delta.targetNode.type === 'step_output'
    ? `Step "${delta.targetNode.stepKey}"`
    : node?.title || 'Target node';

  if (isNested) {
    return (
      <div className="text-xs">
        <span className="text-muted-foreground">{targetLabel}: Set </span>
        <span className="font-mono px-1 py-0.5 rounded bg-muted">
          {delta.fieldKey}
        </span>
        {delta.expectedValue !== undefined && (
          <>
            <span className="text-muted-foreground"> to </span>
            <span className="font-mono px-1 py-0.5 rounded bg-primary/10 text-primary">
              {formatValue(delta.expectedValue)}
            </span>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <div className="p-1.5 rounded-md bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
          <Edit3 className="h-4 w-4" />
        </div>
        <span className="font-medium">Update node field</span>
      </div>

      <div className="ml-8 bg-muted/50 rounded-md p-3">
        {isLoading ? (
          <div className="text-xs text-muted-foreground">Loading...</div>
        ) : (
          <div className="text-sm">
            <span className="font-medium">{targetLabel}</span>
            <span className="text-muted-foreground">: Set </span>
            <span className="font-mono text-xs px-1 py-0.5 rounded bg-muted">
              {delta.fieldKey}
            </span>
            {delta.expectedValue !== undefined && (
              <>
                <span className="text-muted-foreground"> to </span>
                <span className="font-mono text-xs px-1 py-0.5 rounded bg-primary/10 text-primary">
                  {formatValue(delta.expectedValue)}
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CreateEdgePreview({
  delta,
  workflowId,
  taskSetInstance,
  isNested = false,
}: {
  delta: CreateEdgeDelta;
  workflowId: string;
  taskSetInstance?: TaskSetInstance;
  isNested?: boolean;
}) {
  const { node: fromNode, isLoading: isLoadingFrom } = useResolveNodeReference({
    workflowId,
    nodeRef: delta.fromNode,
    taskSetInstance,
  });

  const { node: toNode, isLoading: isLoadingTo } = useResolveNodeReference({
    workflowId,
    nodeRef: delta.toNode,
    taskSetInstance,
  });

  const isLoading = isLoadingFrom || isLoadingTo;

  // Get labels for step_output references
  const getNodeLabel = (
    node: typeof fromNode,
    ref: typeof delta.fromNode,
    fallback: string
  ) => {
    if (ref.type === 'step_output') {
      return `Step "${ref.stepKey}"`;
    }
    return node?.title || ref.nodeType || fallback;
  };

  const fromLabel = getNodeLabel(fromNode, delta.fromNode, 'From Node');
  const toLabel = getNodeLabel(toNode, delta.toNode, 'To Node');

  if (isNested) {
    return (
      <div className="flex items-center gap-1 text-xs flex-wrap">
        <span className="px-1.5 py-0.5 rounded bg-muted font-medium">{fromLabel}</span>
        <span className="text-muted-foreground">--</span>
        <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
          {delta.edgeType}
        </span>
        <span className="text-muted-foreground">--&gt;</span>
        <span className="px-1.5 py-0.5 rounded bg-muted font-medium">{toLabel}</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <div className="p-1.5 rounded-md bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
          <Link2 className="h-4 w-4" />
        </div>
        <span className="font-medium">Create edge</span>
      </div>

      <div className="ml-8 bg-muted/50 rounded-md p-3">
        {isLoading ? (
          <div className="text-xs text-muted-foreground">Loading...</div>
        ) : (
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <span className="px-2 py-1 rounded bg-muted text-xs font-medium">
              {fromLabel}
            </span>
            <span className="text-muted-foreground">--</span>
            <span className="px-2 py-1 rounded bg-primary/10 text-primary text-xs font-medium">
              {delta.edgeType}
            </span>
            <span className="text-muted-foreground">--&gt;</span>
            <span className="px-2 py-1 rounded bg-muted text-xs font-medium">
              {toLabel}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) return `[${value.length} items]`;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
