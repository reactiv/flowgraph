'use client';

import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { Node, Edge } from '@/types/workflow';
import type { KanbanConfig, KanbanColumn, SwimlanePath } from '@/types/view-templates';
import { getNodeFieldValueAsString } from '@/lib/node-utils';
import { NodeCard } from '../cards/NodeCard';

interface KanbanViewProps {
  nodes: Node[];
  edges?: Edge[];
  allNodes?: Node[];
  config: KanbanConfig;
  onNodeClick?: (node: Node) => void;
  onNodeDrop?: (nodeId: string, newStatus: string, newSwimlane?: string) => Promise<void>;
}

interface Swimlane {
  id: string;
  label: string;
  color?: string;
  columns: KanbanColumn[];
  totalCount: number;
}

/** Get a node's value for a given field as a string for grouping */
function getGroupingValue(node: Node, field: string): string {
  return getNodeFieldValueAsString(node, field, 'Ungrouped');
}

/**
 * Get the swimlane value for a node via relational traversal.
 * Returns the target field value from a connected node.
 */
function getRelationalSwimlaneValue(
  node: Node,
  swimlanePath: SwimlanePath,
  edges: Edge[],
  nodeMap: Map<string, Node>
): string {
  const { edgeType, direction, targetType, targetField } = swimlanePath;

  // Find matching edges based on direction
  const matchingEdges = edges.filter((edge) => {
    if (edge.type !== edgeType) return false;
    if (direction === 'outgoing') {
      return edge.from_node_id === node.id;
    } else {
      return edge.to_node_id === node.id;
    }
  });

  if (matchingEdges.length === 0) {
    return 'Unassigned';
  }

  // Get the target node(s)
  const targetNodeIds = matchingEdges.map((edge) =>
    direction === 'outgoing' ? edge.to_node_id : edge.from_node_id
  );

  // Find matching target nodes of the correct type
  const targetNodes: Node[] = [];
  for (const id of targetNodeIds) {
    const targetNode = nodeMap.get(id);
    if (targetNode && targetNode.type === targetType) {
      targetNodes.push(targetNode);
    }
  }

  const firstTarget = targetNodes[0];
  if (!firstTarget) {
    return 'Unassigned';
  }

  // Get the field value from the first target node
  // (For multiple connections, we use the first one as the swimlane)
  return getGroupingValue(firstTarget, targetField);
}

export function KanbanView({
  nodes,
  edges = [],
  allNodes = [],
  config,
  onNodeClick,
  onNodeDrop,
}: KanbanViewProps) {
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<{
    column: string;
    swimlane?: string;
  } | null>(null);
  const [collapsedSwimlanes, setCollapsedSwimlanes] = useState<Set<string>>(new Set());

  const { groupByField, swimlaneField, swimlanePath } = config;

  // Build a map of all nodes for efficient lookup (includes nodes from all levels)
  const nodeMap = useMemo(() => {
    const map = new Map<string, Node>();
    // Add allNodes first (target nodes from other levels)
    allNodes.forEach((n) => map.set(n.id, n));
    // Add root nodes (may override, which is fine)
    nodes.forEach((n) => map.set(n.id, n));
    return map;
  }, [nodes, allNodes]);

  // Determine if we're using relational or property-based swimlanes
  const isRelationalSwimlane = Boolean(swimlanePath);
  const hasSwimlanesConfig = Boolean(swimlaneField || swimlanePath);

  // Function to get swimlane value for a node
  const getSwimlaneName = useMemo(() => {
    if (!hasSwimlanesConfig) {
      return () => '';
    }

    if (isRelationalSwimlane && swimlanePath) {
      return (node: Node) => getRelationalSwimlaneValue(node, swimlanePath, edges, nodeMap);
    }

    if (swimlaneField) {
      return (node: Node) => getGroupingValue(node, swimlaneField);
    }

    return () => '';
  }, [hasSwimlanesConfig, isRelationalSwimlane, swimlanePath, swimlaneField, edges, nodeMap]);

  // Get column order from config or extract unique values from nodes
  const columnOrder = useMemo(() => {
    if (config.columnOrder && config.columnOrder.length > 0) {
      return config.columnOrder;
    }
    const values = new Set<string>();
    nodes.forEach((n) => {
      values.add(getGroupingValue(n, groupByField));
    });
    return Array.from(values);
  }, [config.columnOrder, nodes, groupByField]);

  // Get swimlane order from config or extract unique values from nodes
  const swimlaneOrder = useMemo(() => {
    if (!hasSwimlanesConfig) return null;

    if (config.swimlaneOrder && config.swimlaneOrder.length > 0) {
      return config.swimlaneOrder;
    }

    // Extract unique swimlane values from nodes
    const values = new Set<string>();
    nodes.forEach((n) => {
      values.add(getSwimlaneName(n));
    });
    return Array.from(values);
  }, [config.swimlaneOrder, nodes, hasSwimlanesConfig, getSwimlaneName]);

  // Build swimlanes with columns
  const swimlanes: Swimlane[] = useMemo(() => {
    if (!hasSwimlanesConfig || !swimlaneOrder) {
      // No swimlanes - single implicit swimlane with all columns
      const columns: KanbanColumn[] = columnOrder.map((columnId) => {
        const columnNodes = nodes.filter(
          (node) => getGroupingValue(node, groupByField) === columnId
        );
        return {
          id: columnId,
          label: columnId,
          color: config.columnColors?.[columnId],
          nodes: columnNodes,
        };
      });

      // Filter out empty columns if needed
      const visibleColumns =
        config.showEmptyColumns !== false
          ? columns
          : columns.filter((col) => col.nodes.length > 0);

      return [
        {
          id: '',
          label: '',
          columns: visibleColumns,
          totalCount: nodes.length,
        },
      ];
    }

    // Build swimlanes with 2D grouping
    return swimlaneOrder
      .map((swimlaneId) => {
        const swimlaneNodes = nodes.filter(
          (node) => getSwimlaneName(node) === swimlaneId
        );

        const columns: KanbanColumn[] = columnOrder.map((columnId) => {
          const columnNodes = swimlaneNodes.filter(
            (node) => getGroupingValue(node, groupByField) === columnId
          );
          return {
            id: columnId,
            label: columnId,
            color: config.columnColors?.[columnId],
            nodes: columnNodes,
          };
        });

        // Filter out empty columns if needed
        const visibleColumns =
          config.showEmptyColumns !== false
            ? columns
            : columns.filter((col) => col.nodes.length > 0);

        return {
          id: swimlaneId,
          label: swimlaneId,
          color: config.swimlaneColors?.[swimlaneId],
          columns: visibleColumns,
          totalCount: swimlaneNodes.length,
        };
      })
      .filter((swimlane) => {
        // Filter out empty swimlanes if needed
        if (config.showEmptySwimlanes === false && swimlane.totalCount === 0) {
          return false;
        }
        return true;
      });
  }, [
    nodes,
    groupByField,
    hasSwimlanesConfig,
    columnOrder,
    swimlaneOrder,
    config.columnColors,
    config.swimlaneColors,
    config.showEmptyColumns,
    config.showEmptySwimlanes,
    getSwimlaneName,
  ]);

  const toggleSwimlane = (swimlaneId: string) => {
    setCollapsedSwimlanes((prev) => {
      const next = new Set(prev);
      if (next.has(swimlaneId)) {
        next.delete(swimlaneId);
      } else {
        next.add(swimlaneId);
      }
      return next;
    });
  };

  const handleDragStart = (e: React.DragEvent, nodeId: string) => {
    setDraggedNodeId(nodeId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', nodeId);
  };

  const handleDragOver = (e: React.DragEvent, columnId: string, swimlaneId?: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverTarget({ column: columnId, swimlane: swimlaneId });
  };

  const handleDragLeave = () => {
    setDragOverTarget(null);
  };

  const handleDrop = async (e: React.DragEvent, columnId: string, swimlaneId?: string) => {
    e.preventDefault();
    setDragOverTarget(null);

    const nodeId = e.dataTransfer.getData('text/plain');
    if (!nodeId || !onNodeDrop) {
      setDraggedNodeId(null);
      return;
    }

    const node = nodes.find((n) => n.id === nodeId);
    if (!node) {
      setDraggedNodeId(null);
      return;
    }

    const currentColumn = getGroupingValue(node, groupByField);
    const currentSwimlane = hasSwimlanesConfig ? getSwimlaneName(node) : undefined;

    // Only call onNodeDrop if something changed
    const columnChanged = currentColumn !== columnId;
    // Note: For relational swimlanes, we still pass the swimlane value,
    // but the ViewRenderer will need to handle edge creation/updates differently
    const swimlaneChanged =
      hasSwimlanesConfig && swimlaneId !== undefined && currentSwimlane !== swimlaneId;

    if (columnChanged || swimlaneChanged) {
      await onNodeDrop(nodeId, columnId, swimlaneChanged ? swimlaneId : undefined);
    }

    setDraggedNodeId(null);
  };

  const handleDragEnd = () => {
    setDraggedNodeId(null);
    setDragOverTarget(null);
  };

  const isDragOver = (columnId: string, swimlaneId?: string) => {
    if (!dragOverTarget) return false;
    return dragOverTarget.column === columnId && dragOverTarget.swimlane === swimlaneId;
  };

  // Check if we have real swimlanes (not just the implicit single swimlane)
  const hasSwimlanes = Boolean(hasSwimlanesConfig && swimlanes.length > 0 && swimlanes[0]?.id !== '');

  // Render a single column
  const renderColumn = (column: KanbanColumn, swimlaneId?: string) => (
    <div
      key={`${swimlaneId || 'default'}-${column.id}`}
      className={`flex w-72 shrink-0 flex-col rounded-lg bg-muted transition-all duration-200 ${
        isDragOver(column.id, swimlaneId) ? 'ring-2 ring-primary' : ''
      }`}
      onDragOver={(e) => handleDragOver(e, column.id, swimlaneId)}
      onDragLeave={handleDragLeave}
      onDrop={(e) => handleDrop(e, column.id, swimlaneId)}
    >
      {/* Column Header */}
      <div
        className="flex items-center justify-between rounded-t-lg px-3 py-2"
        style={{
          backgroundColor: column.color ? `${column.color}15` : 'hsl(var(--card))',
          borderBottom: column.color ? `2px solid ${column.color}` : '2px solid hsl(var(--border))',
        }}
      >
        <h3 className="font-semibold text-foreground">{column.label}</h3>
        {config.showCounts !== false && (
          <span
            className="rounded-full px-2 py-0.5 text-xs font-medium"
            style={{
              backgroundColor: column.color || 'hsl(var(--muted-foreground))',
              color: column.color ? 'hsl(var(--background))' : 'hsl(var(--foreground))',
            }}
          >
            {column.nodes.length}
          </span>
        )}
      </div>

      {/* Column Body */}
      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {column.nodes.map((node) => (
          <div
            key={node.id}
            className={`transition-opacity duration-200 ${
              draggedNodeId === node.id ? 'opacity-50' : 'opacity-100'
            }`}
            onDragEnd={handleDragEnd}
          >
            <NodeCard
              node={node}
              cardTemplate={config.cardTemplate}
              onClick={() => onNodeClick?.(node)}
              draggable={config.allowDrag}
              onDragStart={(e) => handleDragStart(e, node.id)}
            />
          </div>
        ))}

        {column.nodes.length === 0 && (
          <div className="flex h-24 items-center justify-center rounded-lg border-2 border-dashed border-border text-sm text-muted-foreground">
            No items
          </div>
        )}
      </div>
    </div>
  );

  // Without swimlanes, render simple column layout
  if (!hasSwimlanes) {
    return (
      <div className="flex h-full gap-4 overflow-x-auto p-4">
        {swimlanes[0]?.columns.map((column) => renderColumn(column))}
      </div>
    );
  }

  // With swimlanes, render collapsible swimlane sections
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {swimlanes.map((swimlane) => {
        const isCollapsed = collapsedSwimlanes.has(swimlane.id);

        return (
          <div key={swimlane.id} className="border-b border-border last:border-b-0">
            {/* Swimlane Header */}
            <button
              onClick={() => toggleSwimlane(swimlane.id)}
              className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-muted transition-colors duration-200"
              style={{
                backgroundColor: swimlane.color ? `${swimlane.color}08` : undefined,
              }}
            >
              {isCollapsed ? (
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-5 w-5 text-muted-foreground" />
              )}
              <span
                className="font-semibold"
                style={{ color: swimlane.color || 'hsl(var(--foreground))' }}
              >
                {swimlane.label}
              </span>
              <span className="text-sm text-muted-foreground">
                ({swimlane.totalCount} {swimlane.totalCount === 1 ? 'item' : 'items'})
              </span>
            </button>

            {/* Swimlane Content - Columns */}
            {!isCollapsed && (
              <div className="flex gap-4 overflow-x-auto px-4 pb-4">
                {swimlane.columns.map((column) => renderColumn(column, swimlane.id))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
