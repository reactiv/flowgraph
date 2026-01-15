'use client';

import { useState, useCallback, useMemo } from 'react';
import type { Node, Edge } from '@/types/workflow';
import type { TreeConfig } from '@/types/view-templates';

interface TreeViewProps {
  nodes: Node[];
  edges: Edge[];
  config: TreeConfig;
  onNodeClick?: (node: Node) => void;
  onStatusChange?: (nodeId: string, newStatus: string) => Promise<void>;
}

interface TreeNode {
  node: Node;
  children: TreeNode[];
  depth: number;
}

const STATUS_COLORS: Record<string, string> = {
  // Hypothesis statuses
  Proposed: 'bg-slate-100 text-slate-700 border-slate-200',
  Active: 'bg-violet-100 text-violet-700 border-violet-200',
  Validated: 'bg-green-100 text-green-700 border-green-200',
  Rejected: 'bg-red-100 text-red-700 border-red-200',
  Dismissed: 'bg-slate-100 text-slate-600 border-slate-200',
  // Sample/Analysis statuses
  Draft: 'bg-slate-100 text-slate-700 border-slate-200',
  'In Progress': 'bg-blue-100 text-blue-700 border-blue-200',
  Complete: 'bg-green-100 text-green-700 border-green-200',
  Archived: 'bg-slate-100 text-slate-600 border-slate-200',
  Pending: 'bg-slate-100 text-slate-700 border-slate-200',
  Failed: 'bg-red-100 text-red-700 border-red-200',
};

/**
 * Build a tree structure from nodes and edges.
 * Uses edges to determine parent-child relationships.
 * Nodes that are targets of edges (to_node_id) are children of the source (from_node_id).
 */
function buildTree(nodes: Node[], edges: Edge[]): TreeNode[] {
  const nodeMap = new Map<string, Node>();
  const childMap = new Map<string, string[]>(); // parent_id -> [child_ids]
  const hasParent = new Set<string>();

  // Build node map
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  // Build child relationships from edges
  for (const edge of edges) {
    const parentId = edge.from_node_id;
    const childId = edge.to_node_id;

    // Only process if both nodes exist in our node set
    if (nodeMap.has(parentId) && nodeMap.has(childId)) {
      if (!childMap.has(parentId)) {
        childMap.set(parentId, []);
      }
      childMap.get(parentId)!.push(childId);
      hasParent.add(childId);
    }
  }

  // Build tree recursively
  function buildSubtree(nodeId: string, depth: number, visited: Set<string>): TreeNode | null {
    // Prevent cycles
    if (visited.has(nodeId)) {
      return null;
    }

    const node = nodeMap.get(nodeId);
    if (!node) {
      return null;
    }

    visited.add(nodeId);

    const childIds = childMap.get(nodeId) || [];
    const children: TreeNode[] = [];

    for (const childId of childIds) {
      const childTree = buildSubtree(childId, depth + 1, new Set(visited));
      if (childTree) {
        children.push(childTree);
      }
    }

    return {
      node,
      children,
      depth,
    };
  }

  // Find root nodes (nodes without parents)
  const roots: TreeNode[] = [];
  for (const node of nodes) {
    if (!hasParent.has(node.id)) {
      const tree = buildSubtree(node.id, 0, new Set());
      if (tree) {
        roots.push(tree);
      }
    }
  }

  // Sort roots by title for consistent ordering
  roots.sort((a, b) => a.node.title.localeCompare(b.node.title));

  return roots;
}

/**
 * Get the initial expansion state based on depth.
 * Expands all nodes up to the specified depth.
 */
function getInitialExpandedState(
  trees: TreeNode[],
  initialExpandDepth: number
): Set<string> {
  const expanded = new Set<string>();

  function traverse(treeNode: TreeNode) {
    // Expand if within the initial depth and has children
    if (treeNode.depth < initialExpandDepth && treeNode.children.length > 0) {
      expanded.add(treeNode.node.id);
    }
    for (const child of treeNode.children) {
      traverse(child);
    }
  }

  for (const tree of trees) {
    traverse(tree);
  }

  return expanded;
}

interface TreeNodeRowProps {
  treeNode: TreeNode;
  expanded: Set<string>;
  onToggle: (nodeId: string) => void;
  onNodeClick?: (node: Node) => void;
  showDepthLines: boolean;
  isLast: boolean;
  parentLines: boolean[]; // Track which parent levels need continuation lines
}

function TreeNodeRow({
  treeNode,
  expanded,
  onToggle,
  onNodeClick,
  showDepthLines,
  isLast,
  parentLines,
}: TreeNodeRowProps) {
  const { node, children, depth } = treeNode;
  const hasChildren = children.length > 0;
  const isExpanded = expanded.has(node.id);
  const status = node.status;
  const statusColorClass = status
    ? STATUS_COLORS[status] || 'bg-gray-100 text-gray-700 border-gray-200'
    : '';

  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggle(node.id);
    },
    [node.id, onToggle]
  );

  const handleClick = useCallback(() => {
    onNodeClick?.(node);
  }, [node, onNodeClick]);

  return (
    <>
      <div
        className={`flex items-center py-1.5 hover:bg-gray-50 ${
          onNodeClick ? 'cursor-pointer' : ''
        }`}
        onClick={handleClick}
      >
        {/* Depth lines and expand/collapse toggle */}
        <div className="flex items-center shrink-0">
          {/* Depth indicator lines - pointer-events-none so clicks pass through */}
          {showDepthLines &&
            parentLines.map((showLine, idx) => (
              <div
                key={idx}
                className="pointer-events-none relative flex h-8 w-6 shrink-0 items-center justify-center"
              >
                {showLine && (
                  <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-gray-200" />
                )}
              </div>
            ))}

          {/* Current level connector - pointer-events-none */}
          {depth > 0 && showDepthLines && (
            <div className="pointer-events-none relative flex h-8 w-6 shrink-0 items-center justify-center">
              {/* Vertical line from parent */}
              <div
                className={`absolute left-1/2 w-px -translate-x-1/2 bg-gray-200 ${
                  isLast ? 'top-0 h-1/2' : 'top-0 h-full'
                }`}
              />
              {/* Horizontal line to node */}
              <div className="absolute left-1/2 top-1/2 h-px w-3 -translate-y-1/2 bg-gray-200" />
            </div>
          )}

          {/* Expand/collapse toggle - larger click target */}
          <button
            type="button"
            onClick={handleToggle}
            className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-500 transition-colors ${
              hasChildren
                ? 'hover:bg-gray-200 hover:text-gray-700 cursor-pointer'
                : 'cursor-default invisible'
            }`}
            disabled={!hasChildren}
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            {hasChildren && (
              <svg
                className={`h-4 w-4 transition-transform ${
                  isExpanded ? 'rotate-90' : ''
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            )}
          </button>
        </div>

        {/* Node content */}
        <div className="flex min-w-0 flex-1 items-center gap-3 pl-2">
          <span className="truncate font-medium text-gray-900">{node.title}</span>
          {status && (
            <span
              className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusColorClass}`}
            >
              {status}
            </span>
          )}
          <span className="shrink-0 text-xs text-gray-400">{node.type}</span>
          {hasChildren && (
            <span className="shrink-0 text-xs text-gray-400">
              ({children.length} {children.length === 1 ? 'child' : 'children'})
            </span>
          )}
        </div>
      </div>

      {/* Render children if expanded */}
      {isExpanded &&
        children.map((child, idx) => {
          const isLastChild = idx === children.length - 1;
          // Update parentLines for children: add current level's continuation state
          const newParentLines = [...parentLines, !isLast];

          return (
            <TreeNodeRow
              key={child.node.id}
              treeNode={child}
              expanded={expanded}
              onToggle={onToggle}
              onNodeClick={onNodeClick}
              showDepthLines={showDepthLines}
              isLast={isLastChild}
              parentLines={newParentLines}
            />
          );
        })}
    </>
  );
}

export function TreeView({
  nodes,
  edges,
  config,
  onNodeClick,
  onStatusChange: _onStatusChange,
}: TreeViewProps) {
  // Build tree structure from nodes and edges
  const trees = useMemo(() => buildTree(nodes, edges), [nodes, edges]);

  // Default initial expand depth to 1 if not specified
  const initialExpandDepth = 1;

  // Initialize expanded state
  const [expanded, setExpanded] = useState<Set<string>>(() =>
    getInitialExpandedState(trees, initialExpandDepth)
  );

  const showDepthLines = config.showDepthLines !== false;
  const expandable = config.expandable !== false;

  const handleToggle = useCallback(
    (nodeId: string) => {
      if (!expandable) return;

      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(nodeId)) {
          next.delete(nodeId);
        } else {
          next.add(nodeId);
        }
        return next;
      });
    },
    [expandable]
  );

  // Expand all nodes
  const handleExpandAll = useCallback(() => {
    const allWithChildren = new Set<string>();
    function collect(tree: TreeNode) {
      if (tree.children.length > 0) {
        allWithChildren.add(tree.node.id);
      }
      tree.children.forEach(collect);
    }
    trees.forEach(collect);
    setExpanded(allWithChildren);
  }, [trees]);

  // Collapse all nodes
  const handleCollapseAll = useCallback(() => {
    setExpanded(new Set());
  }, []);

  if (nodes.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-gray-500">No items to display</div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      {/* Toolbar */}
      {expandable && (
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-gray-200 bg-white px-4 py-2">
          <button
            onClick={handleExpandAll}
            className="rounded px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
          >
            Expand All
          </button>
          <button
            onClick={handleCollapseAll}
            className="rounded px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
          >
            Collapse All
          </button>
          <span className="text-sm text-gray-400">
            {nodes.length} {nodes.length === 1 ? 'node' : 'nodes'}
          </span>
        </div>
      )}

      {/* Tree content */}
      <div className="p-4">
        {trees.map((tree, idx) => (
          <TreeNodeRow
            key={tree.node.id}
            treeNode={tree}
            expanded={expanded}
            onToggle={handleToggle}
            onNodeClick={onNodeClick}
            showDepthLines={showDepthLines}
            isLast={idx === trees.length - 1}
            parentLines={[]}
          />
        ))}
      </div>
    </div>
  );
}
