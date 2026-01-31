'use client';

import { useMemo } from 'react';
import {
  CheckCircle2,
  Circle,
  Clock,
  PlayCircle,
  XCircle,
  MinusCircle,
  ArrowDown,
} from 'lucide-react';
import type {
  TaskDefinition,
  TaskInstance,
  TaskStatus,
  TaskSetInstance,
  TaskSetDefinition,
} from '@/types/task';
import { cn } from '@/lib/utils';

interface TaskDAGProps {
  instance: TaskSetInstance;
  definition: TaskSetDefinition;
  onTaskClick?: (taskDefId: string) => void;
  className?: string;
}

const STATUS_COLORS: Record<TaskStatus, { bg: string; border: string; text: string }> = {
  pending: {
    bg: 'bg-gray-100 dark:bg-gray-800',
    border: 'border-gray-300 dark:border-gray-600',
    text: 'text-gray-600 dark:text-gray-400',
  },
  available: {
    bg: 'bg-yellow-50 dark:bg-yellow-950',
    border: 'border-yellow-400 dark:border-yellow-600',
    text: 'text-yellow-700 dark:text-yellow-300',
  },
  in_progress: {
    bg: 'bg-blue-50 dark:bg-blue-950',
    border: 'border-blue-400 dark:border-blue-600',
    text: 'text-blue-700 dark:text-blue-300',
  },
  completed: {
    bg: 'bg-green-50 dark:bg-green-950',
    border: 'border-green-400 dark:border-green-600',
    text: 'text-green-700 dark:text-green-300',
  },
  blocked: {
    bg: 'bg-red-50 dark:bg-red-950',
    border: 'border-red-400 dark:border-red-600',
    text: 'text-red-700 dark:text-red-300',
  },
  skipped: {
    bg: 'bg-gray-50 dark:bg-gray-900',
    border: 'border-gray-300 dark:border-gray-700',
    text: 'text-gray-400 dark:text-gray-500',
  },
};

function getStatusIcon(status: TaskStatus) {
  const iconClass = 'w-4 h-4';
  switch (status) {
    case 'completed':
      return <CheckCircle2 className={cn(iconClass, 'text-green-600 dark:text-green-400')} />;
    case 'in_progress':
      return <PlayCircle className={cn(iconClass, 'text-blue-600 dark:text-blue-400')} />;
    case 'available':
      return <Circle className={cn(iconClass, 'text-yellow-600 dark:text-yellow-400')} />;
    case 'pending':
      return <Clock className={cn(iconClass, 'text-gray-400')} />;
    case 'blocked':
      return <XCircle className={cn(iconClass, 'text-red-600 dark:text-red-400')} />;
    case 'skipped':
      return <MinusCircle className={cn(iconClass, 'text-gray-400')} />;
    default:
      return <Circle className={cn(iconClass, 'text-gray-400')} />;
  }
}

/**
 * Simple layered layout algorithm for DAG.
 * Assigns tasks to layers based on longest path from roots.
 */
function computeLayers(tasks: TaskDefinition[]): string[][] {
  // Build adjacency list
  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const task of tasks) {
    adjacency.set(task.id, []);
    inDegree.set(task.id, 0);
  }

  for (const task of tasks) {
    for (const depId of task.dependsOn) {
      const deps = adjacency.get(depId);
      if (deps) {
        deps.push(task.id);
      }
      inDegree.set(task.id, (inDegree.get(task.id) || 0) + 1);
    }
  }

  // Topological sort with layers
  const layers: string[][] = [];
  const remaining = new Set(tasks.map((t) => t.id));
  const currentInDegree = new Map(inDegree);

  while (remaining.size > 0) {
    // Find all nodes with in-degree 0
    const layer: string[] = [];
    for (const id of remaining) {
      if ((currentInDegree.get(id) || 0) === 0) {
        layer.push(id);
      }
    }

    if (layer.length === 0) {
      // Cycle detected or something wrong, just add remaining
      layer.push(...remaining);
      remaining.clear();
    } else {
      // Remove from remaining and update in-degrees
      for (const id of layer) {
        remaining.delete(id);
        for (const successor of adjacency.get(id) || []) {
          currentInDegree.set(successor, (currentInDegree.get(successor) || 1) - 1);
        }
      }
    }

    layers.push(layer);
  }

  return layers;
}

export function TaskDAG({ instance, definition, onTaskClick, className }: TaskDAGProps) {
  // Build task instance map
  const taskInstanceMap = useMemo(() => {
    const map = new Map<string, TaskInstance>();
    for (const ti of instance.taskInstances) {
      map.set(ti.taskDefinitionId, ti);
    }
    return map;
  }, [instance.taskInstances]);

  // Build task definition map
  const taskDefMap = useMemo(
    () => new Map(definition.tasks.map((t) => [t.id, t])),
    [definition.tasks]
  );

  // Compute layers
  const layers = useMemo(() => computeLayers(definition.tasks), [definition.tasks]);

  return (
    <div className={cn('w-full p-4 bg-background rounded-lg border overflow-auto', className)}>
      <div className="flex flex-col items-center gap-2 min-w-fit">
        {layers.map((layer, layerIndex) => (
          <div key={layerIndex}>
            {/* Tasks in this layer */}
            <div className="flex gap-4 justify-center">
              {layer.map((taskId) => {
                const taskDef = taskDefMap.get(taskId);
                if (!taskDef) return null;

                const taskInstance = taskInstanceMap.get(taskId);
                const status: TaskStatus = taskInstance?.status || 'pending';
                const colors = STATUS_COLORS[status];

                return (
                  <button
                    key={taskId}
                    className={cn(
                      'px-4 py-2 rounded-lg border-2 min-w-[160px] text-left',
                      'hover:shadow-md transition-shadow cursor-pointer',
                      colors.bg,
                      colors.border,
                      status === 'skipped' && 'opacity-50'
                    )}
                    onClick={() => onTaskClick?.(taskId)}
                  >
                    <div className="flex items-center gap-2">
                      {getStatusIcon(status)}
                      <span className={cn('text-sm font-medium truncate', colors.text)}>
                        {taskDef.name}
                      </span>
                    </div>
                    {taskDef.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                        {taskDef.description}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Arrows to next layer */}
            {layerIndex < layers.length - 1 && (
              <div className="flex justify-center py-2">
                <ArrowDown className="w-5 h-5 text-muted-foreground" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
