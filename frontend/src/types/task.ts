/**
 * TypeScript types for the Task Execution Engine.
 *
 * Tasks represent expected deltas (changes) to the workflow graph.
 * TaskSets organize tasks into DAGs with dependencies and conditions.
 */

// =============================================================================
// Enums
// =============================================================================

export type DeltaType =
  | 'create_node'
  | 'update_node_status'
  | 'update_node_field'
  | 'create_edge'
  | 'compound';

export type TaskStatus =
  | 'pending' // Dependencies not met
  | 'available' // Ready to be worked on
  | 'in_progress' // Someone is working on it
  | 'completed' // Expected delta achieved
  | 'skipped' // Skipped due to condition
  | 'blocked'; // Dependencies failed/skipped

export type AssigneeType = 'user' | 'agent' | 'unassigned';

export type ConditionType =
  | 'node_status'
  | 'field_value'
  | 'edge_exists'
  | 'expression';

export type NodeReferenceType = 'id' | 'task_output' | 'query' | 'step_output';

export type TaskSetInstanceStatus =
  | 'active'
  | 'completed'
  | 'paused'
  | 'cancelled';

// =============================================================================
// Node Reference
// =============================================================================

export interface NodeReference {
  type: NodeReferenceType;
  nodeId?: string;
  taskId?: string;
  outputKey?: string;
  nodeType?: string;
  queryFilters?: Record<string, unknown>;
  stepKey?: string; // For step_output references within compound deltas
}

// =============================================================================
// Task Deltas
// =============================================================================

export interface CreateNodeDelta {
  deltaType: 'create_node';
  nodeType: string;
  initialValues?: Record<string, unknown>;
  initialStatus?: string;
}

export interface UpdateNodeStatusDelta {
  deltaType: 'update_node_status';
  targetNode: NodeReference;
  fromStatus?: string | string[];
  toStatus: string;
}

export interface UpdateNodeFieldDelta {
  deltaType: 'update_node_field';
  targetNode: NodeReference;
  fieldKey: string;
  expectedValue?: unknown;
}

export interface CreateEdgeDelta {
  deltaType: 'create_edge';
  edgeType: string;
  fromNode: NodeReference;
  toNode: NodeReference;
}

// Atomic deltas (everything except compound)
export type AtomicDelta =
  | CreateNodeDelta
  | UpdateNodeStatusDelta
  | UpdateNodeFieldDelta
  | CreateEdgeDelta;

// Compound delta step
export interface CompoundDeltaStep {
  key: string;
  delta: AtomicDelta;
  label?: string;
}

// Compound delta that bundles multiple operations
export interface CompoundDelta {
  deltaType: 'compound';
  steps: CompoundDeltaStep[];
  outputStepKey?: string;
}

// Full delta union includes compound
export type TaskDelta = AtomicDelta | CompoundDelta;

// Type guard for compound deltas
export function isCompoundDelta(delta: TaskDelta): delta is CompoundDelta {
  return delta.deltaType === 'compound';
}

// Type guard for atomic deltas
export function isAtomicDelta(delta: TaskDelta): delta is AtomicDelta {
  return delta.deltaType !== 'compound';
}

// =============================================================================
// Task Conditions
// =============================================================================

export interface TaskCondition {
  type: ConditionType;
  nodeRef?: NodeReference;
  expectedStatus?: string | string[];
  fieldKey?: string;
  expectedValue?: unknown;
  operator?: string;
  edgeType?: string;
  fromNode?: NodeReference;
  toNode?: NodeReference;
  expression?: string;
}

// =============================================================================
// Task Assignment
// =============================================================================

export interface TaskAssignment {
  assigneeType: AssigneeType;
  assigneeId?: string;
  assignedAt?: string;
  assignedBy?: string;
}

// =============================================================================
// Task Definition
// =============================================================================

export interface TaskDefinition {
  id: string;
  name: string;
  description?: string;
  delta: TaskDelta;
  dependsOn: string[];
  condition?: TaskCondition;
  defaultAssigneeType: AssigneeType;
  uiHints?: Record<string, unknown>;
  outputNodeKey?: string;
}

// =============================================================================
// TaskSet Definition (DAG Template)
// =============================================================================

export interface TaskSetDefinition {
  id: string;
  name: string;
  description?: string;
  version: number;
  rootNodeType?: string;
  tasks: TaskDefinition[];
  entryTaskIds?: string[];
  terminalTaskIds?: string[];
  tags: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface TaskSetDefinitionCreate {
  name: string;
  description?: string;
  rootNodeType?: string;
  tasks: TaskDefinition[];
  tags?: string[];
}

// =============================================================================
// Runtime Instances
// =============================================================================

export interface TaskInstance {
  id: string;
  taskSetInstanceId: string;
  taskDefinitionId: string;
  status: TaskStatus;
  assignment?: TaskAssignment;
  startedAt?: string;
  completedAt?: string;
  outputNodeId?: string;
  notes?: string;
}

export interface TaskSetInstance {
  id: string;
  workflowId: string;
  taskSetDefinitionId: string;
  rootNodeId?: string;
  status: TaskSetInstanceStatus;
  taskInstances: TaskInstance[];
  totalTasks: number;
  completedTasks: number;
  availableTasks: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaskSetInstanceCreate {
  taskSetDefinitionId: string;
  rootNodeId?: string;
}

// =============================================================================
// API Request/Response Types
// =============================================================================

export interface TaskSetDefinitionsResponse {
  definitions: TaskSetDefinition[];
  total: number;
}

export interface TaskSetInstancesResponse {
  instances: TaskSetInstance[];
  total: number;
}

export interface AvailableTasksResponse {
  tasks: TaskDefinition[];
  taskInstances: TaskInstance[];
}

export interface AssignTaskRequest {
  assigneeType: AssigneeType;
  assigneeId?: string;
  assignedBy?: string;
}

export interface CompleteTaskRequest {
  outputNodeId?: string;
  notes?: string;
  initialValues?: Record<string, unknown>;
}

export interface MyTaskItem {
  taskInstance: TaskInstance;
  taskDefinition: TaskDefinition;
  taskSetInstance: {
    id: string;
    status: TaskSetInstanceStatus;
    rootNodeId?: string;
  };
  taskSetDefinition: {
    id: string;
    name: string;
  };
}

export interface MyTasksResponse {
  tasks: MyTaskItem[];
  total: number;
}

export interface NodeTaskProgressResponse {
  taskSetInstances: TaskSetInstance[];
  total: number;
}

// =============================================================================
// UI Helper Types
// =============================================================================

/** Task with its definition for display purposes */
export interface TaskWithDefinition {
  instance: TaskInstance;
  definition: TaskDefinition;
}

/** Progress summary for a TaskSet instance */
export interface TaskSetProgress {
  total: number;
  completed: number;
  available: number;
  inProgress: number;
  pending: number;
  blocked: number;
  skipped: number;
  percentComplete: number;
}

/** Calculate progress from a TaskSetInstance */
export function calculateProgress(instance: TaskSetInstance): TaskSetProgress {
  const counts = {
    pending: 0,
    available: 0,
    in_progress: 0,
    completed: 0,
    skipped: 0,
    blocked: 0,
  };

  for (const task of instance.taskInstances) {
    counts[task.status]++;
  }

  return {
    total: instance.totalTasks,
    completed: counts.completed,
    available: counts.available,
    inProgress: counts.in_progress,
    pending: counts.pending,
    blocked: counts.blocked,
    skipped: counts.skipped,
    percentComplete:
      instance.totalTasks > 0
        ? Math.round((counts.completed / instance.totalTasks) * 100)
        : 0,
  };
}

/** Get status color for task status */
export function getTaskStatusColor(status: TaskStatus): string {
  switch (status) {
    case 'completed':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    case 'in_progress':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    case 'available':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    case 'pending':
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    case 'blocked':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
    case 'skipped':
      return 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
  }
}

/** Get status icon name for task status */
export function getTaskStatusIcon(status: TaskStatus): string {
  switch (status) {
    case 'completed':
      return 'check-circle';
    case 'in_progress':
      return 'play-circle';
    case 'available':
      return 'circle';
    case 'pending':
      return 'clock';
    case 'blocked':
      return 'x-circle';
    case 'skipped':
      return 'minus-circle';
    default:
      return 'circle';
  }
}
