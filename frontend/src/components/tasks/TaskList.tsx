'use client';

import { useMemo } from 'react';
import {
  CheckCircle2,
  Circle,
  Clock,
  PlayCircle,
  XCircle,
  MinusCircle,
  User,
  Bot,
  ChevronRight,
} from 'lucide-react';
import type {
  TaskDefinition,
  TaskInstance,
  TaskStatus,
  TaskSetInstance,
  TaskSetDefinition,
  TaskWithDefinition,
} from '@/types/task';
import { cn } from '@/lib/utils';

interface TaskListProps {
  instance: TaskSetInstance;
  definition: TaskSetDefinition;
  onTaskClick?: (task: TaskWithDefinition) => void;
  onStartTask?: (taskDefId: string) => void;
  onCompleteTask?: (taskDefId: string) => void;
  className?: string;
}

function getStatusIcon(status: TaskStatus) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />;
    case 'in_progress':
      return <PlayCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" />;
    case 'available':
      return <Circle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />;
    case 'pending':
      return <Clock className="w-4 h-4 text-gray-400" />;
    case 'blocked':
      return <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />;
    case 'skipped':
      return <MinusCircle className="w-4 h-4 text-gray-400" />;
    default:
      return <Circle className="w-4 h-4 text-gray-400" />;
  }
}

function getAssigneeIcon(type?: string) {
  if (type === 'user') {
    return <User className="w-3 h-3" />;
  }
  if (type === 'agent') {
    return <Bot className="w-3 h-3" />;
  }
  return null;
}

function getDeltaTypeLabel(delta: TaskDefinition['delta']): string {
  switch (delta.deltaType) {
    case 'create_node':
      return `Create ${delta.nodeType}`;
    case 'update_node_status':
      return `Update to ${delta.toStatus}`;
    case 'update_node_field':
      return `Update ${delta.fieldKey}`;
    case 'create_edge':
      return `Link ${delta.edgeType}`;
    default:
      return 'Task';
  }
}

export function TaskList({
  instance,
  definition,
  onTaskClick,
  onStartTask,
  onCompleteTask,
  className,
}: TaskListProps) {
  // Build task list with definitions
  const tasks = useMemo(() => {
    const taskMap = new Map<string, TaskInstance>();
    for (const ti of instance.taskInstances) {
      taskMap.set(ti.taskDefinitionId, ti);
    }

    return definition.tasks.map((taskDef) => ({
      definition: taskDef,
      instance: taskMap.get(taskDef.id),
    }));
  }, [instance.taskInstances, definition.tasks]);

  // Group by status for better organization
  const groupedTasks = useMemo(() => {
    const groups: Record<TaskStatus, typeof tasks> = {
      in_progress: [],
      available: [],
      pending: [],
      completed: [],
      blocked: [],
      skipped: [],
    };

    for (const task of tasks) {
      const status = task.instance?.status || 'pending';
      groups[status].push(task);
    }

    return groups;
  }, [tasks]);

  const statusOrder: TaskStatus[] = [
    'in_progress',
    'available',
    'pending',
    'blocked',
    'completed',
    'skipped',
  ];

  return (
    <div className={cn('space-y-4', className)}>
      {statusOrder.map((status) => {
        const statusTasks = groupedTasks[status];
        if (statusTasks.length === 0) return null;

        return (
          <div key={status} className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground capitalize flex items-center gap-2">
              {getStatusIcon(status)}
              {status.replace('_', ' ')} ({statusTasks.length})
            </h3>
            <div className="space-y-2">
              {statusTasks.map(({ definition: taskDef, instance: taskInstance }) => (
                <TaskListItem
                  key={taskDef.id}
                  definition={taskDef}
                  instance={taskInstance}
                  onClick={() =>
                    onTaskClick?.({
                      definition: taskDef,
                      instance: taskInstance!,
                    })
                  }
                  onStart={() => onStartTask?.(taskDef.id)}
                  onComplete={() => onCompleteTask?.(taskDef.id)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface TaskListItemProps {
  definition: TaskDefinition;
  instance?: TaskInstance;
  onClick?: () => void;
  onStart?: () => void;
  onComplete?: () => void;
}

function TaskListItem({ definition, instance, onClick, onStart, onComplete }: TaskListItemProps) {
  const status = instance?.status || 'pending';
  const canStart = status === 'available' || status === 'pending';
  const canComplete = status === 'in_progress' || status === 'available';

  return (
    <div
      className={cn(
        'border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors',
        status === 'completed' && 'opacity-60',
        status === 'skipped' && 'opacity-40'
      )}
      onClick={onClick}
    >
      <div className="py-3 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3 min-w-0">
            {getStatusIcon(status)}
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{definition.name}</div>
              {definition.description && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                  {definition.description}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {instance?.assignment && instance.assignment.assigneeType !== 'unassigned' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border">
                {getAssigneeIcon(instance.assignment.assigneeType)}
                {instance.assignment.assigneeId || instance.assignment.assigneeType}
              </span>
            )}
            <span className="inline-flex px-2 py-0.5 rounded-full text-xs bg-muted">
              {getDeltaTypeLabel(definition.delta)}
            </span>
          </div>
        </div>
      </div>
      {(canStart || canComplete) && (
        <div className="py-2 px-4 pt-0 flex gap-2 border-t">
          {canStart && (
            <button
              className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md border hover:bg-muted transition-colors"
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                onStart?.();
              }}
            >
              <PlayCircle className="w-3 h-3 mr-1" />
              Start
            </button>
          )}
          {canComplete && (
            <button
              className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                onComplete?.();
              }}
            >
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Complete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Compact list view for sidebars
interface CompactTaskListProps {
  tasks: TaskWithDefinition[];
  onTaskClick?: (task: TaskWithDefinition) => void;
  className?: string;
}

export function CompactTaskList({ tasks, onTaskClick, className }: CompactTaskListProps) {
  return (
    <div className={cn('space-y-1', className)}>
      {tasks.map((task) => (
        <button
          key={task.instance.id}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted transition-colors text-left"
          onClick={() => onTaskClick?.(task)}
        >
          {getStatusIcon(task.instance.status)}
          <span className="text-sm truncate flex-1">{task.definition.name}</span>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </button>
      ))}
    </div>
  );
}
