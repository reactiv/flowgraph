'use client';

import { useMemo } from 'react';
import { ChevronDown, Globe, Target, CheckCircle2, Pause, XCircle, PlayCircle } from 'lucide-react';
import type {
  TaskSetInstance,
  TaskSetDefinition,
  TaskSetInstanceStatus,
} from '@/types/task';
import { cn } from '@/lib/utils';

export interface NodeInfo {
  id: string;
  title: string;
  type: string;
}

interface TaskSetInstanceSelectorProps {
  instances: TaskSetInstance[];
  definitions: TaskSetDefinition[];
  nodeInfo?: Map<string, NodeInfo>; // Map of nodeId -> node info
  selectedInstanceId: string | undefined;
  onSelectInstance: (instanceId: string) => void;
  className?: string;
}

function getStatusIcon(status: TaskSetInstanceStatus) {
  switch (status) {
    case 'active':
      return <PlayCircle className="w-3.5 h-3.5 text-blue-500" />;
    case 'completed':
      return <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />;
    case 'paused':
      return <Pause className="w-3.5 h-3.5 text-yellow-500" />;
    case 'cancelled':
      return <XCircle className="w-3.5 h-3.5 text-gray-400" />;
    default:
      return null;
  }
}

function getStatusLabel(status: TaskSetInstanceStatus): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'completed':
      return 'Completed';
    case 'paused':
      return 'Paused';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status;
  }
}

export function TaskSetInstanceSelector({
  instances,
  definitions,
  nodeInfo,
  selectedInstanceId,
  onSelectInstance,
  className,
}: TaskSetInstanceSelectorProps) {
  // Build definition lookup map
  const definitionMap = useMemo(() => {
    const map = new Map<string, TaskSetDefinition>();
    for (const def of definitions) {
      map.set(def.id, def);
    }
    return map;
  }, [definitions]);

  // Group instances by definition
  const instancesByDefinition = useMemo(() => {
    const groups = new Map<string, TaskSetInstance[]>();
    for (const instance of instances) {
      const existing = groups.get(instance.taskSetDefinitionId) || [];
      existing.push(instance);
      groups.set(instance.taskSetDefinitionId, existing);
    }
    return groups;
  }, [instances]);

  // Get selected instance info
  const selectedInstance = instances.find((i) => i.id === selectedInstanceId);
  const selectedDefinition = selectedInstance
    ? definitionMap.get(selectedInstance.taskSetDefinitionId)
    : undefined;

  // Build short label for dropdown button
  const getShortLabel = (instance: TaskSetInstance) => {
    if (instance.rootNodeId) {
      const node = nodeInfo?.get(instance.rootNodeId);
      if (node) {
        return node.title;
      }
      return `Node ${instance.rootNodeId.slice(0, 8)}...`;
    }
    return 'Global';
  };

  if (instances.length === 0) {
    return (
      <div className={cn('text-sm text-muted-foreground', className)}>
        No task set instances
      </div>
    );
  }

  if (instances.length === 1) {
    // Single instance - just show info, no selector needed
    const singleInstance = instances[0];
    if (!singleInstance) return null;
    const def = definitionMap.get(singleInstance.taskSetDefinitionId);
    return (
      <div className={cn('flex items-center gap-2 text-sm', className)}>
        {singleInstance.rootNodeId ? (
          <Target className="w-4 h-4 text-muted-foreground" />
        ) : (
          <Globe className="w-4 h-4 text-muted-foreground" />
        )}
        <span className="font-medium">{def?.name || 'TaskSet'}</span>
        <span className="text-muted-foreground">
          {singleInstance.rootNodeId
            ? nodeInfo?.get(singleInstance.rootNodeId)?.title || 'Node-scoped'
            : 'Global'}
        </span>
      </div>
    );
  }

  return (
    <div className={cn('relative group', className)}>
      <button
        className="flex items-center gap-2 px-3 py-2 text-sm border rounded-lg bg-background hover:bg-muted/50 transition-colors w-full"
        title="Select TaskSet Instance"
      >
        {selectedInstance?.rootNodeId ? (
          <Target className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <Globe className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        )}
        <div className="flex-1 text-left min-w-0">
          <div className="font-medium truncate">
            {selectedDefinition?.name || 'Select TaskSet'}
          </div>
          {selectedInstance && (
            <div className="text-xs text-muted-foreground truncate">
              {getShortLabel(selectedInstance)}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {selectedInstance && getStatusIcon(selectedInstance.status)}
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </div>
      </button>

      {/* Dropdown menu */}
      <div className="absolute top-full left-0 right-0 mt-1 z-50 hidden group-hover:block">
        <div className="bg-popover border rounded-lg shadow-lg py-1 max-h-80 overflow-auto">
          {Array.from(instancesByDefinition.entries()).map(([defId, defInstances]) => {
            const def = definitionMap.get(defId);
            return (
              <div key={defId}>
                {/* Definition header */}
                <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground bg-muted/30 border-b">
                  {def?.name || 'Unknown TaskSet'}
                </div>
                {/* Instances under this definition */}
                {defInstances.map((instance) => {
                  const isSelected = instance.id === selectedInstanceId;
                  const node = instance.rootNodeId
                    ? nodeInfo?.get(instance.rootNodeId)
                    : undefined;

                  return (
                    <button
                      key={instance.id}
                      onClick={() => onSelectInstance(instance.id)}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors',
                        isSelected && 'bg-muted'
                      )}
                    >
                      {instance.rootNodeId ? (
                        <Target className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      ) : (
                        <Globe className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      )}
                      <div className="flex-1 text-left min-w-0">
                        <div className="truncate">
                          {instance.rootNodeId ? (
                            node ? (
                              <>
                                <span className="text-muted-foreground">{node.type}: </span>
                                {node.title}
                              </>
                            ) : (
                              `Node ${instance.rootNodeId.slice(0, 8)}...`
                            )
                          ) : (
                            'Global (Workflow-wide)'
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {instance.completedTasks}/{instance.totalTasks} tasks completed
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {getStatusIcon(instance.status)}
                        <span className="text-xs text-muted-foreground">
                          {getStatusLabel(instance.status)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
