'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  CheckCircle2,
  Circle,
  Clock,
  PlayCircle,
  XCircle,
  MinusCircle,
  MoreHorizontal,
  User,
  Bot,
} from 'lucide-react';
import type {
  TaskDefinition,
  TaskInstance,
  TaskStatus,
  TaskSetInstance,
  TaskSetDefinition,
} from '@/types/task';
import { cn } from '@/lib/utils';

interface TaskBoardProps {
  instance: TaskSetInstance;
  definition: TaskSetDefinition;
  onStartTask?: (taskDefId: string) => Promise<void>;
  onCompleteTask?: (taskDefId: string) => void | Promise<void>;
  onSkipTask?: (taskDefId: string) => Promise<void>;
  className?: string;
}

const COLUMN_CONFIG: { status: TaskStatus; label: string; color: string }[] = [
  { status: 'pending', label: 'Pending', color: 'bg-gray-500' },
  { status: 'available', label: 'Ready', color: 'bg-yellow-500' },
  { status: 'in_progress', label: 'In Progress', color: 'bg-blue-500' },
  { status: 'completed', label: 'Done', color: 'bg-green-500' },
];

function getStatusIcon(status: TaskStatus, size = 'w-4 h-4') {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className={cn(size, 'text-green-600 dark:text-green-400')} />;
    case 'in_progress':
      return <PlayCircle className={cn(size, 'text-blue-600 dark:text-blue-400')} />;
    case 'available':
      return <Circle className={cn(size, 'text-yellow-600 dark:text-yellow-400')} />;
    case 'pending':
      return <Clock className={cn(size, 'text-gray-400')} />;
    case 'blocked':
      return <XCircle className={cn(size, 'text-red-600 dark:text-red-400')} />;
    case 'skipped':
      return <MinusCircle className={cn(size, 'text-gray-400')} />;
    default:
      return <Circle className={cn(size, 'text-gray-400')} />;
  }
}

export function TaskBoard({
  instance,
  definition,
  onStartTask,
  onCompleteTask,
  onSkipTask,
  className,
}: TaskBoardProps) {
  const [loadingTasks, setLoadingTasks] = useState<Set<string>>(new Set());

  // Build task map
  const taskInstanceMap = useMemo(() => {
    const map = new Map<string, TaskInstance>();
    for (const ti of instance.taskInstances) {
      map.set(ti.taskDefinitionId, ti);
    }
    return map;
  }, [instance.taskInstances]);

  // Group tasks by status
  const tasksByStatus = useMemo(() => {
    const groups: Record<TaskStatus, { def: TaskDefinition; instance?: TaskInstance }[]> = {
      pending: [],
      available: [],
      in_progress: [],
      completed: [],
      blocked: [],
      skipped: [],
    };

    for (const taskDef of definition.tasks) {
      const taskInstance = taskInstanceMap.get(taskDef.id);
      const status = taskInstance?.status || 'pending';
      groups[status].push({ def: taskDef, instance: taskInstance });
    }

    return groups;
  }, [definition.tasks, taskInstanceMap]);

  const handleAction = async (taskDefId: string, action: () => void | Promise<void>) => {
    setLoadingTasks((prev) => new Set(prev).add(taskDefId));
    try {
      await action();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Action failed');
    } finally {
      setLoadingTasks((prev) => {
        const next = new Set(prev);
        next.delete(taskDefId);
        return next;
      });
    }
  };

  return (
    <div className={cn('flex gap-4 overflow-x-auto pb-4', className)}>
      {COLUMN_CONFIG.map(({ status, label, color }) => {
        const tasks = tasksByStatus[status];
        const blockedTasks = status === 'pending' ? tasksByStatus.blocked : [];
        const skippedTasks = status === 'completed' ? tasksByStatus.skipped : [];
        const allTasks = [...tasks, ...blockedTasks, ...skippedTasks];

        return (
          <div key={status} className="flex-shrink-0 w-72">
            <div className="flex items-center gap-2 mb-3">
              <div className={cn('w-3 h-3 rounded-full', color)} />
              <h3 className="text-sm font-medium">{label}</h3>
              <span className="ml-auto px-2 py-0.5 rounded-full text-xs bg-muted">
                {allTasks.length}
              </span>
            </div>
            <div className="space-y-2 min-h-[200px] p-2 bg-muted/30 rounded-lg">
              {allTasks.map(({ def: taskDef, instance: taskInstance }) => (
                <TaskCard
                  key={taskDef.id}
                  definition={taskDef}
                  instance={taskInstance}
                  isLoading={loadingTasks.has(taskDef.id)}
                  onStart={
                    onStartTask ? () => handleAction(taskDef.id, () => onStartTask(taskDef.id)) : undefined
                  }
                  onComplete={
                    onCompleteTask
                      ? () => handleAction(taskDef.id, () => onCompleteTask(taskDef.id))
                      : undefined
                  }
                  onSkip={
                    onSkipTask ? () => handleAction(taskDef.id, () => onSkipTask(taskDef.id)) : undefined
                  }
                />
              ))}
              {allTasks.length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-8">No tasks</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface TaskCardProps {
  definition: TaskDefinition;
  instance?: TaskInstance;
  isLoading?: boolean;
  onStart?: () => void;
  onComplete?: () => void;
  onSkip?: () => void;
}

function TaskCard({ definition, instance, isLoading, onStart, onComplete, onSkip }: TaskCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const status = instance?.status || 'pending';
  const canStart = status === 'available';
  const canComplete = status === 'in_progress' || status === 'available';
  const canSkip = status === 'available' || status === 'pending' || status === 'in_progress';

  return (
    <div
      className={cn(
        'border rounded-lg bg-background transition-all',
        isLoading && 'opacity-50 pointer-events-none',
        status === 'completed' && 'opacity-70',
        status === 'skipped' && 'opacity-50',
        status === 'blocked' && 'border-red-500/50'
      )}
    >
      <div className="p-3 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0">
            {getStatusIcon(status)}
            <div className="min-w-0">
              <div className="text-sm font-medium leading-tight">{definition.name}</div>
            </div>
          </div>
          {(canStart || canComplete || canSkip) && (
            <div className="relative">
              <button
                className="p-1 rounded hover:bg-muted transition-colors"
                onClick={() => setMenuOpen(!menuOpen)}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 z-20 min-w-[140px] bg-popover border rounded-md shadow-md py-1">
                    {canStart && (
                      <button
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted transition-colors"
                        onClick={() => {
                          setMenuOpen(false);
                          onStart?.();
                        }}
                      >
                        <PlayCircle className="w-4 h-4" />
                        Start Task
                      </button>
                    )}
                    {canComplete && (
                      <button
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted transition-colors"
                        onClick={() => {
                          setMenuOpen(false);
                          onComplete?.();
                        }}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Mark Complete
                      </button>
                    )}
                    {canSkip && (
                      <button
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted transition-colors"
                        onClick={() => {
                          setMenuOpen(false);
                          onSkip?.();
                        }}
                      >
                        <MinusCircle className="w-4 h-4" />
                        Skip Task
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="p-3 pt-0">
        {definition.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{definition.description}</p>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex px-2 py-0.5 rounded-full text-xs border">
            {getDeltaLabel(definition.delta)}
          </span>
          {instance?.assignment && instance.assignment.assigneeType !== 'unassigned' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-muted">
              {instance.assignment.assigneeType === 'user' ? (
                <User className="w-3 h-3" />
              ) : (
                <Bot className="w-3 h-3" />
              )}
              {instance.assignment.assigneeId || instance.assignment.assigneeType}
            </span>
          )}
          {status === 'blocked' && (
            <span className="inline-flex px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
              Blocked
            </span>
          )}
        </div>
        {definition.dependsOn.length > 0 && status === 'pending' && (
          <p className="text-xs text-muted-foreground mt-2">
            Waiting on {definition.dependsOn.length} task(s)
          </p>
        )}
        {instance?.notes && (
          <p className="text-xs text-muted-foreground mt-2 italic">{instance.notes}</p>
        )}
      </div>
    </div>
  );
}

function getDeltaLabel(delta: TaskDefinition['delta']): string {
  switch (delta.deltaType) {
    case 'create_node':
      return `Create ${delta.nodeType}`;
    case 'update_node_status':
      return `→ ${delta.toStatus}`;
    case 'update_node_field':
      return `Set ${delta.fieldKey}`;
    case 'create_edge':
      return `Link ${delta.edgeType}`;
    default:
      return 'Task';
  }
}
