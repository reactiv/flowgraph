'use client';

import { useState } from 'react';
import type { Node } from '@/types/workflow';
import type { KanbanConfig, KanbanColumn } from '@/types/view-templates';
import { NodeCard } from '../cards/NodeCard';

interface KanbanViewProps {
  nodes: Node[];
  config: KanbanConfig;
  onNodeClick?: (node: Node) => void;
  onNodeDrop?: (nodeId: string, newStatus: string) => Promise<void>;
}

export function KanbanView({ nodes, config, onNodeClick, onNodeDrop }: KanbanViewProps) {
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  // Group nodes by the groupByField (usually status)
  const groupByField = config.groupByField;

  // Get column order from config or extract from nodes
  const columnOrder = config.columnOrder || [...new Set(nodes.map((n) => n.status || 'Unknown'))];

  // Create columns
  const columns: KanbanColumn[] = columnOrder.map((columnId) => {
    const columnNodes = nodes.filter((node) => {
      const value = groupByField === 'status' ? node.status : node.properties[groupByField];
      return value === columnId;
    });

    return {
      id: columnId,
      label: columnId,
      color: config.columnColors?.[columnId],
      nodes: columnNodes,
    };
  });

  // Filter out empty columns if showEmptyColumns is false
  const visibleColumns = config.showEmptyColumns !== false
    ? columns
    : columns.filter((col) => col.nodes.length > 0);

  const handleDragStart = (e: React.DragEvent, nodeId: string) => {
    setDraggedNodeId(nodeId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', nodeId);
  };

  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverColumn(columnId);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = async (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    setDragOverColumn(null);

    const nodeId = e.dataTransfer.getData('text/plain');
    if (nodeId && onNodeDrop) {
      // Find the node being dragged to check current status
      const node = nodes.find((n) => n.id === nodeId);
      if (node) {
        const currentStatus = groupByField === 'status' ? node.status : node.properties[groupByField];
        if (currentStatus !== columnId) {
          await onNodeDrop(nodeId, columnId);
        }
      }
    }

    setDraggedNodeId(null);
  };

  const handleDragEnd = () => {
    setDraggedNodeId(null);
    setDragOverColumn(null);
  };

  return (
    <div className="flex h-full gap-4 overflow-x-auto p-4">
      {visibleColumns.map((column) => (
        <div
          key={column.id}
          className={`flex w-72 shrink-0 flex-col rounded-lg bg-gray-50 ${
            dragOverColumn === column.id ? 'ring-2 ring-blue-400' : ''
          }`}
          onDragOver={(e) => handleDragOver(e, column.id)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, column.id)}
        >
          {/* Column Header */}
          <div
            className="flex items-center justify-between rounded-t-lg px-3 py-2"
            style={{
              backgroundColor: column.color ? `${column.color}20` : '#f1f5f9',
              borderBottom: column.color ? `2px solid ${column.color}` : '2px solid #e2e8f0',
            }}
          >
            <h3 className="font-semibold text-gray-900">{column.label}</h3>
            {config.showCounts !== false && (
              <span
                className="rounded-full px-2 py-0.5 text-xs font-medium"
                style={{
                  backgroundColor: column.color || '#64748b',
                  color: 'white',
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
                className={`transition-opacity ${
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
              <div className="flex h-24 items-center justify-center rounded-lg border-2 border-dashed border-gray-200 text-sm text-gray-400">
                No items
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
