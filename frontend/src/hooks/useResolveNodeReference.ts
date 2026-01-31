import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { NodeReference, TaskSetInstance, TaskInstance } from '@/types/task';
import type { Node } from '@/types/workflow';

interface ResolvedNode {
  id: string;
  title: string;
  type: string;
  status?: string;
}

interface UseResolveNodeReferenceOptions {
  workflowId: string;
  nodeRef: NodeReference | undefined;
  taskSetInstance?: TaskSetInstance;
  enabled?: boolean;
}

interface UseResolveNodeReferenceResult {
  node: ResolvedNode | null;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Resolves a NodeReference to an actual node for preview purposes.
 *
 * Supports three reference types:
 * - `type: 'id'` → fetch by nodeId
 * - `type: 'task_output'` → get outputNodeId from task instance
 * - `type: 'query'` → fetch first node of nodeType (simplified)
 */
export function useResolveNodeReference({
  workflowId,
  nodeRef,
  taskSetInstance,
  enabled = true,
}: UseResolveNodeReferenceOptions): UseResolveNodeReferenceResult {
  // Determine the node ID to fetch based on reference type
  const getNodeId = (): string | null => {
    if (!nodeRef) return null;

    switch (nodeRef.type) {
      case 'id':
        return nodeRef.nodeId || null;

      case 'task_output': {
        // Find the task instance and get its outputNodeId
        if (!taskSetInstance || !nodeRef.taskId) return null;
        const taskInstance = taskSetInstance.taskInstances.find(
          (ti: TaskInstance) => ti.taskDefinitionId === nodeRef.taskId
        );
        return taskInstance?.outputNodeId || null;
      }

      case 'query':
        // For query type, we'll fetch by node type instead
        return null;

      default:
        return null;
    }
  };

  const nodeId = getNodeId();
  const isQueryType = nodeRef?.type === 'query';

  // Fetch node by ID
  const {
    data: nodeById,
    isLoading: isLoadingById,
    error: errorById,
  } = useQuery({
    queryKey: ['node', workflowId, nodeId],
    queryFn: () => api.getNode(workflowId, nodeId!),
    enabled: enabled && !!nodeId,
  });

  // Fetch nodes by type for query references
  const {
    data: nodesByType,
    isLoading: isLoadingByType,
    error: errorByType,
  } = useQuery({
    queryKey: ['nodes', workflowId, nodeRef?.nodeType],
    queryFn: () => api.listNodes(workflowId, { type: nodeRef?.nodeType, limit: 1 }),
    enabled: enabled && isQueryType && !!nodeRef?.nodeType,
  });

  // Determine the resolved node
  let resolvedNode: ResolvedNode | null = null;

  if (nodeById) {
    resolvedNode = {
      id: nodeById.id,
      title: nodeById.title,
      type: nodeById.type,
      status: nodeById.status,
    };
  } else if (nodesByType?.nodes && nodesByType.nodes.length > 0) {
    const firstNode = nodesByType.nodes[0];
    if (firstNode) {
      resolvedNode = {
        id: firstNode.id,
        title: firstNode.title,
        type: firstNode.type,
        status: firstNode.status,
      };
    }
  }

  return {
    node: resolvedNode,
    isLoading: isLoadingById || isLoadingByType,
    error: (errorById || errorByType) as Error | null,
  };
}

/**
 * Batch resolve multiple node references at once.
 * Useful for previewing deltas that reference multiple nodes.
 */
export function useResolveMultipleNodeReferences({
  workflowId,
  nodeRefs,
  taskSetInstance,
  enabled = true,
}: {
  workflowId: string;
  nodeRefs: { key: string; ref: NodeReference }[];
  taskSetInstance?: TaskSetInstance;
  enabled?: boolean;
}): {
  nodes: Map<string, ResolvedNode | null>;
  isLoading: boolean;
  error: Error | null;
} {
  // Collect all node IDs to fetch
  const nodeIds = nodeRefs
    .map(({ ref }) => {
      if (ref.type === 'id') return ref.nodeId;
      if (ref.type === 'task_output' && taskSetInstance) {
        const taskInstance = taskSetInstance.taskInstances.find(
          (ti: TaskInstance) => ti.taskDefinitionId === ref.taskId
        );
        return taskInstance?.outputNodeId;
      }
      return null;
    })
    .filter((id): id is string => !!id);

  // Collect all node types to query
  const nodeTypes = nodeRefs
    .filter(({ ref }) => ref.type === 'query')
    .map(({ ref }) => ref.nodeType)
    .filter((type): type is string => !!type);

  // Fetch all nodes by IDs
  const {
    data: nodesByIds,
    isLoading: isLoadingByIds,
    error: errorByIds,
  } = useQuery({
    queryKey: ['nodes-batch', workflowId, nodeIds],
    queryFn: async () => {
      const results = new Map<string, Node>();
      await Promise.all(
        nodeIds.map(async (id) => {
          try {
            const node = await api.getNode(workflowId, id);
            results.set(id, node);
          } catch {
            // Node not found, ignore
          }
        })
      );
      return results;
    },
    enabled: enabled && nodeIds.length > 0,
  });

  // Fetch nodes by types
  const {
    data: nodesByTypes,
    isLoading: isLoadingByTypes,
    error: errorByTypes,
  } = useQuery({
    queryKey: ['nodes-by-types', workflowId, nodeTypes],
    queryFn: async () => {
      const results = new Map<string, Node>();
      await Promise.all(
        nodeTypes.map(async (type) => {
          try {
            const response = await api.listNodes(workflowId, { type, limit: 1 });
            const firstNode = response.nodes[0];
            if (firstNode) {
              results.set(type, firstNode);
            }
          } catch {
            // Type not found, ignore
          }
        })
      );
      return results;
    },
    enabled: enabled && nodeTypes.length > 0,
  });

  // Build the result map
  const nodes = new Map<string, ResolvedNode | null>();

  for (const { key, ref } of nodeRefs) {
    let resolved: ResolvedNode | null = null;

    if (ref.type === 'id' && ref.nodeId && nodesByIds?.has(ref.nodeId)) {
      const node = nodesByIds.get(ref.nodeId)!;
      resolved = {
        id: node.id,
        title: node.title,
        type: node.type,
        status: node.status,
      };
    } else if (ref.type === 'task_output' && taskSetInstance) {
      const taskInstance = taskSetInstance.taskInstances.find(
        (ti: TaskInstance) => ti.taskDefinitionId === ref.taskId
      );
      if (taskInstance?.outputNodeId && nodesByIds?.has(taskInstance.outputNodeId)) {
        const node = nodesByIds.get(taskInstance.outputNodeId)!;
        resolved = {
          id: node.id,
          title: node.title,
          type: node.type,
          status: node.status,
        };
      }
    } else if (ref.type === 'query' && ref.nodeType && nodesByTypes?.has(ref.nodeType)) {
      const node = nodesByTypes.get(ref.nodeType)!;
      resolved = {
        id: node.id,
        title: node.title,
        type: node.type,
        status: node.status,
      };
    }

    nodes.set(key, resolved);
  }

  return {
    nodes,
    isLoading: isLoadingByIds || isLoadingByTypes,
    error: (errorByIds || errorByTypes) as Error | null,
  };
}
