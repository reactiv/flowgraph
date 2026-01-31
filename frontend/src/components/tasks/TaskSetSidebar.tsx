'use client';

import { useState, useMemo } from 'react';
import {
  Search,
  Globe,
  Target,
  CheckCircle2,
  Pause,
  XCircle,
  PlayCircle,
  ChevronRight,
  Layers,
} from 'lucide-react';
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

interface TaskSetSidebarProps {
  definitions: TaskSetDefinition[];
  instances: TaskSetInstance[];
  nodeInfo?: Map<string, NodeInfo>;
  selectedInstanceId: string | undefined;
  onSelectInstance: (instanceId: string) => void;
  className?: string;
}

function getStatusIcon(status: TaskSetInstanceStatus, size: 'sm' | 'md' = 'sm') {
  const sizeClass = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';
  switch (status) {
    case 'active':
      return <PlayCircle className={cn(sizeClass, 'text-emerald-500')} />;
    case 'completed':
      return <CheckCircle2 className={cn(sizeClass, 'text-blue-500')} />;
    case 'paused':
      return <Pause className={cn(sizeClass, 'text-amber-500')} />;
    case 'cancelled':
      return <XCircle className={cn(sizeClass, 'text-gray-400')} />;
    default:
      return null;
  }
}

function ProgressRing({
  completed,
  total,
  size = 28,
}: {
  completed: number;
  total: number;
  size?: number;
}) {
  const percentage = total > 0 ? (completed / total) * 100 : 0;
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          fill="none"
          className="stroke-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          className="stroke-emerald-500 transition-all duration-300"
          style={{
            strokeDasharray: circumference,
            strokeDashoffset,
          }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-medium text-muted-foreground">
        {completed}/{total}
      </span>
    </div>
  );
}

export function TaskSetSidebar({
  definitions,
  instances,
  nodeInfo,
  selectedInstanceId,
  onSelectInstance,
  className,
}: TaskSetSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedDefinitions, setExpandedDefinitions] = useState<Set<string>>(
    () => new Set(definitions.map((d) => d.id))
  );

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

  // Filter definitions and instances based on search
  const filteredData = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) {
      return definitions.map((def) => ({
        definition: def,
        instances: instancesByDefinition.get(def.id) || [],
      }));
    }

    return definitions
      .map((def) => {
        const defInstances = instancesByDefinition.get(def.id) || [];
        const matchesDefName = def.name.toLowerCase().includes(query);

        // Filter instances that match the search (by node title or global)
        const matchingInstances = defInstances.filter((instance) => {
          if (matchesDefName) return true;
          if (!instance.rootNodeId) {
            return 'global'.includes(query);
          }
          const node = nodeInfo?.get(instance.rootNodeId);
          return node?.title.toLowerCase().includes(query);
        });

        return {
          definition: def,
          instances: matchingInstances,
        };
      })
      .filter((item) => item.instances.length > 0);
  }, [definitions, instancesByDefinition, searchQuery, nodeInfo]);

  const toggleDefinition = (defId: string) => {
    setExpandedDefinitions((prev) => {
      const next = new Set(prev);
      if (next.has(defId)) {
        next.delete(defId);
      } else {
        next.add(defId);
      }
      return next;
    });
  };

  const getInstanceLabel = (instance: TaskSetInstance) => {
    if (!instance.rootNodeId) {
      return { icon: Globe, label: 'Global', sublabel: 'Workflow-wide' };
    }
    const node = nodeInfo?.get(instance.rootNodeId);
    if (node) {
      return {
        icon: Target,
        label: node.title,
        sublabel: node.type,
      };
    }
    return {
      icon: Target,
      label: `Node ${instance.rootNodeId.slice(0, 8)}...`,
      sublabel: 'Node-scoped',
    };
  };

  const totalInstances = instances.length;
  const activeInstances = instances.filter((i) => i.status === 'active').length;

  return (
    <div
      className={cn(
        'flex flex-col h-full bg-card border-r border-border',
        className
      )}
    >
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-3">
          <Layers className="w-5 h-5 text-muted-foreground" />
          <h2 className="font-semibold text-sm tracking-tight">Task Sets</h2>
        </div>
        <div className="text-xs text-muted-foreground mb-3">
          {activeInstances} active · {totalInstances} total
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Filter task sets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-muted/50 border border-border rounded-md placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      {/* Task Sets List */}
      <div className="flex-1 overflow-auto">
        {filteredData.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground text-center">
            No task sets found
          </div>
        ) : (
          <div className="py-2">
            {filteredData.map(({ definition, instances: defInstances }) => {
              const isExpanded = expandedDefinitions.has(definition.id);
              const totalTasks = defInstances.reduce(
                (sum, i) => sum + i.totalTasks,
                0
              );
              const completedTasks = defInstances.reduce(
                (sum, i) => sum + i.completedTasks,
                0
              );

              return (
                <div key={definition.id} className="mb-1">
                  {/* Definition Header */}
                  <button
                    onClick={() => toggleDefinition(definition.id)}
                    className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-muted/50 transition-colors"
                  >
                    <ChevronRight
                      className={cn(
                        'w-4 h-4 text-muted-foreground transition-transform',
                        isExpanded && 'rotate-90'
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {definition.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {defInstances.length} instance
                        {defInstances.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <ProgressRing completed={completedTasks} total={totalTasks} />
                  </button>

                  {/* Instances */}
                  {isExpanded && (
                    <div className="ml-4 border-l border-border">
                      {defInstances.map((instance) => {
                        const isSelected = instance.id === selectedInstanceId;
                        const { icon: Icon, label, sublabel } = getInstanceLabel(instance);

                        return (
                          <button
                            key={instance.id}
                            onClick={() => onSelectInstance(instance.id)}
                            className={cn(
                              'w-full flex items-center gap-2 px-4 py-2.5 text-left transition-colors',
                              isSelected
                                ? 'bg-primary/10 border-l-2 border-l-primary -ml-px'
                                : 'hover:bg-muted/50 border-l-2 border-l-transparent -ml-px'
                            )}
                          >
                            <Icon
                              className={cn(
                                'w-4 h-4 flex-shrink-0',
                                isSelected
                                  ? 'text-primary'
                                  : 'text-muted-foreground'
                              )}
                            />
                            <div className="flex-1 min-w-0">
                              <div
                                className={cn(
                                  'text-sm truncate',
                                  isSelected && 'font-medium'
                                )}
                              >
                                {label}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">
                                {sublabel}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {getStatusIcon(instance.status)}
                              <span className="text-xs text-muted-foreground tabular-nums">
                                {instance.completedTasks}/{instance.totalTasks}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
