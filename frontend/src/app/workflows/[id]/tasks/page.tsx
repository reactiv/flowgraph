'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  LayoutList,
  Columns,
  GitBranch,
  RefreshCw,
  Globe,
  Target,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { TaskList } from '@/components/tasks/TaskList';
import { TaskBoard } from '@/components/tasks/TaskBoard';
import { TaskDAG } from '@/components/tasks/TaskDAG';
import { TaskSetSidebar, type NodeInfo } from '@/components/tasks/TaskSetSidebar';
import {
  TaskCompletionDialog,
  shouldShowCompletionDialog,
} from '@/components/tasks/TaskCompletionDialog';
import type { DeltaType, TaskDefinition } from '@/types/task';
import { cn } from '@/lib/utils';

type ViewMode = 'list' | 'board' | 'dag';

interface CompletionDialogState {
  isOpen: boolean;
  taskDefId: string | null;
}

export default function TasksPage() {
  const params = useParams();
  const workflowId = params.id as string;
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<ViewMode>('board');
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | undefined>();
  const [completionDialog, setCompletionDialog] = useState<CompletionDialogState>({
    isOpen: false,
    taskDefId: null,
  });

  // Fetch workflow
  const { data: workflow, isLoading: workflowLoading } = useQuery({
    queryKey: ['workflow', workflowId],
    queryFn: () => api.getWorkflow(workflowId),
  });

  // Fetch task set definitions
  const { data: taskSetsResponse, isLoading: taskSetsLoading } = useQuery({
    queryKey: ['taskSets', workflowId],
    queryFn: () => api.listTaskSetDefinitions(workflowId),
  });

  // Fetch task set instances
  const { data: instancesResponse, isLoading: instancesLoading } = useQuery({
    queryKey: ['taskSetInstances', workflowId],
    queryFn: () => api.listTaskSetInstances(workflowId),
  });

  // Collect all unique root node IDs for fetching node info
  const rootNodeIds = useMemo(() => {
    if (!instancesResponse?.instances) return [];
    return instancesResponse.instances
      .filter((i) => i.rootNodeId)
      .map((i) => i.rootNodeId as string);
  }, [instancesResponse?.instances]);

  // Fetch node info for all root nodes
  const nodeInfoQueries = useQuery({
    queryKey: ['taskRootNodes', workflowId, rootNodeIds],
    queryFn: async () => {
      const nodeMap = new Map<string, NodeInfo>();
      await Promise.all(
        rootNodeIds.map(async (nodeId) => {
          try {
            const node = await api.getNode(workflowId, nodeId);
            nodeMap.set(nodeId, {
              id: node.id,
              title: node.title,
              type: node.type,
            });
          } catch {
            // Node might not exist anymore, that's okay
          }
        })
      );
      return nodeMap;
    },
    enabled: rootNodeIds.length > 0,
  });

  // Auto-select first active instance when instances load
  useEffect(() => {
    if (instancesResponse?.instances && !selectedInstanceId) {
      const firstActive = instancesResponse.instances.find((i) => i.status === 'active');
      if (firstActive) {
        setSelectedInstanceId(firstActive.id);
      } else {
        const firstInstance = instancesResponse.instances[0];
        if (firstInstance) {
          setSelectedInstanceId(firstInstance.id);
        }
      }
    }
  }, [instancesResponse?.instances, selectedInstanceId]);

  // Get selected instance and its definition
  const selectedInstance = instancesResponse?.instances?.find((i) => i.id === selectedInstanceId);
  const taskSetDefinition = selectedInstance
    ? taskSetsResponse?.definitions?.find((d) => d.id === selectedInstance.taskSetDefinitionId)
    : undefined;

  // Mutations for task actions
  const startTaskMutation = useMutation({
    mutationFn: (taskDefId: string) =>
      api.startTask(workflowId, selectedInstance!.id, taskDefId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskSetInstances', workflowId] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to start task');
    },
  });

  const completeTaskMutation = useMutation({
    mutationFn: ({
      taskDefId,
      initialValues,
    }: {
      taskDefId: string;
      initialValues?: Record<string, unknown>;
    }) =>
      api.completeTask(workflowId, selectedInstance!.id, taskDefId, { initialValues }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskSetInstances', workflowId] });
      queryClient.invalidateQueries({ queryKey: ['nodes', workflowId] });
      setCompletionDialog({ isOpen: false, taskDefId: null });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to complete task');
    },
  });

  const skipTaskMutation = useMutation({
    mutationFn: (taskDefId: string) =>
      api.skipTask(workflowId, selectedInstance!.id, taskDefId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskSetInstances', workflowId] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to skip task');
    },
  });

  const refreshMutation = useMutation({
    mutationFn: () => api.refreshTaskSetInstance(workflowId, selectedInstance!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskSetInstances', workflowId] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to refresh task progress');
    },
  });

  const isLoading = workflowLoading || taskSetsLoading || instancesLoading;
  const allInstances = instancesResponse?.instances || [];
  const allDefinitions = taskSetsResponse?.definitions || [];

  // Get task definition by ID
  const getTaskDefinition = useCallback(
    (taskDefId: string): TaskDefinition | undefined => {
      return taskSetDefinition?.tasks.find((t) => t.id === taskDefId);
    },
    [taskSetDefinition]
  );

  // Handle complete task - check if dialog should be shown
  const handleCompleteTask = useCallback(
    (taskDefId: string) => {
      const taskDef = getTaskDefinition(taskDefId);
      if (!taskDef) {
        toast.error('Task definition not found');
        return;
      }

      const deltaType = taskDef.delta.deltaType as DeltaType;
      if (shouldShowCompletionDialog(deltaType)) {
        // Show dialog for tasks that change the graph
        setCompletionDialog({ isOpen: true, taskDefId });
      } else {
        // Complete directly for tasks that don't change the graph
        completeTaskMutation.mutate({ taskDefId });
      }
    },
    [getTaskDefinition, completeTaskMutation]
  );

  // Handle dialog confirmation
  const handleConfirmCompletion = useCallback(
    (initialValues?: Record<string, unknown>) => {
      if (completionDialog.taskDefId) {
        completeTaskMutation.mutate({
          taskDefId: completionDialog.taskDefId,
          initialValues,
        });
      }
    },
    [completionDialog.taskDefId, completeTaskMutation]
  );

  // Handle dialog cancel
  const handleCancelCompletion = useCallback(() => {
    setCompletionDialog({ isOpen: false, taskDefId: null });
  }, []);

  // Get selected task definition for dialog
  const selectedTaskDef = completionDialog.taskDefId
    ? getTaskDefinition(completionDialog.taskDefId)
    : undefined;

  // Get instance context info
  const getInstanceContext = () => {
    if (!selectedInstance) return null;
    if (!selectedInstance.rootNodeId) {
      return { icon: Globe, label: 'Global', sublabel: 'Applies to entire workflow' };
    }
    const node = nodeInfoQueries.data?.get(selectedInstance.rootNodeId);
    if (node) {
      return { icon: Target, label: node.title, sublabel: node.type };
    }
    return { icon: Target, label: 'Node-scoped', sublabel: 'Loading...' };
  };

  const instanceContext = getInstanceContext();

  // Progress percentage
  const progressPercent =
    selectedInstance && selectedInstance.totalTasks > 0
      ? Math.round((selectedInstance.completedTasks / selectedInstance.totalTasks) * 100)
      : 0;

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading tasks...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <TaskSetSidebar
        definitions={allDefinitions}
        instances={allInstances}
        nodeInfo={nodeInfoQueries.data}
        selectedInstanceId={selectedInstanceId}
        onSelectInstance={setSelectedInstanceId}
        className="w-72 flex-shrink-0"
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-background">
        {/* Header */}
        <div className="border-b border-border bg-card/50 px-6 py-4">
          {/* Breadcrumb */}
          <Link
            href={`/workflows/${workflowId}`}
            className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-3 transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            {workflow?.name || 'Workflow'}
          </Link>

          {selectedInstance && taskSetDefinition ? (
            <div className="flex items-start justify-between gap-6">
              {/* Left: Title and Context */}
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-semibold tracking-tight truncate">
                  {taskSetDefinition.name}
                </h1>
                {instanceContext && (
                  <div className="flex items-center gap-2 mt-2">
                    <instanceContext.icon className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{instanceContext.label}</span>
                    <span className="text-xs text-muted-foreground">
                      · {instanceContext.sublabel}
                    </span>
                  </div>
                )}
              </div>

              {/* Right: Progress and Controls */}
              <div className="flex items-center gap-4 flex-shrink-0">
                {/* Progress */}
                <div className="flex items-center gap-3 px-4 py-2 bg-muted/30 rounded-lg">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span className="text-sm font-medium tabular-nums">
                      {selectedInstance.completedTasks}
                    </span>
                  </div>
                  <span className="text-muted-foreground">/</span>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {selectedInstance.totalTasks}
                    </span>
                  </div>
                  <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums w-8">
                    {progressPercent}%
                  </span>
                </div>

                {/* Refresh */}
                <button
                  onClick={() => refreshMutation.mutate()}
                  disabled={refreshMutation.isPending}
                  className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors disabled:opacity-50"
                  title="Refresh task statuses"
                >
                  <RefreshCw
                    className={cn('w-4 h-4', refreshMutation.isPending && 'animate-spin')}
                  />
                </button>

                {/* View Mode Toggle */}
                <div className="flex bg-muted/50 rounded-lg p-0.5">
                  <button
                    onClick={() => setViewMode('list')}
                    className={cn(
                      'p-2 rounded-md transition-colors',
                      viewMode === 'list'
                        ? 'bg-background shadow-sm text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                    title="List View"
                  >
                    <LayoutList className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('board')}
                    className={cn(
                      'p-2 rounded-md transition-colors',
                      viewMode === 'board'
                        ? 'bg-background shadow-sm text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                    title="Board View"
                  >
                    <Columns className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('dag')}
                    className={cn(
                      'p-2 rounded-md transition-colors',
                      viewMode === 'dag'
                        ? 'bg-background shadow-sm text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                    title="DAG View"
                  >
                    <GitBranch className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-4">
              <h1 className="text-xl font-semibold tracking-tight text-muted-foreground">
                Select a task set
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Choose a task set from the sidebar to view its tasks
              </p>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {selectedInstance && taskSetDefinition ? (
            <div className="h-full p-4">
              {viewMode === 'list' && (
                <TaskList
                  instance={selectedInstance}
                  definition={taskSetDefinition}
                  onStartTask={(taskDefId) => startTaskMutation.mutate(taskDefId)}
                  onCompleteTask={handleCompleteTask}
                />
              )}
              {viewMode === 'board' && (
                <TaskBoard
                  instance={selectedInstance}
                  definition={taskSetDefinition}
                  onStartTask={async (taskDefId) => {
                    await startTaskMutation.mutateAsync(taskDefId);
                  }}
                  onCompleteTask={handleCompleteTask}
                  onSkipTask={async (taskDefId) => {
                    await skipTaskMutation.mutateAsync(taskDefId);
                  }}
                />
              )}
              {viewMode === 'dag' && (
                <TaskDAG instance={selectedInstance} definition={taskSetDefinition} />
              )}
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center max-w-md">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                  <Columns className="w-8 h-8 text-muted-foreground" />
                </div>
                <h2 className="text-lg font-medium mb-2">No task set selected</h2>
                <p className="text-sm text-muted-foreground">
                  {allInstances.length === 0
                    ? 'No task set instances have been created for this workflow yet.'
                    : 'Select a task set from the sidebar to view and manage its tasks.'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Task Completion Dialog */}
      {selectedTaskDef && selectedInstance && workflow && (
        <TaskCompletionDialog
          isOpen={completionDialog.isOpen}
          taskDefinition={selectedTaskDef}
          taskSetInstance={selectedInstance}
          workflowId={workflowId}
          workflowDefinition={workflow}
          onConfirm={handleConfirmCompletion}
          onCancel={handleCancelCompletion}
          isSubmitting={completeTaskMutation.isPending}
        />
      )}
    </div>
  );
}
