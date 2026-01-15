'use client';

import { useMemo, useRef, useState, useCallback } from 'react';
import type { Node, Edge } from '@/types/workflow';
import type { GanttConfig, CardTemplate } from '@/types/view-templates';

interface GanttViewProps {
  nodes: Node[];
  edges?: Edge[];
  config: GanttConfig;
  onNodeClick?: (node: Node) => void;
  onNodeUpdate?: (
    nodeId: string,
    updates: { start?: string; end?: string }
  ) => Promise<void>;
  onStatusChange?: (nodeId: string, newStatus: string) => Promise<void>;
}

interface GanttTask {
  node: Node;
  startDate: Date;
  endDate: Date;
  progress: number;
  label: string;
  group?: string;
}

interface TimeColumn {
  date: Date;
  label: string;
  subLabel?: string;
  isToday: boolean;
  width: number;
}

// Default status colors (fallback if not in config)
const DEFAULT_STATUS_COLORS: Record<string, string> = {
  Draft: '#64748b',
  Pending: '#f59e0b',
  'In Progress': '#3b82f6',
  Running: '#3b82f6',
  Complete: '#22c55e',
  Completed: '#22c55e',
  Failed: '#ef4444',
  Cancelled: '#475569',
  Archived: '#6b7280',
};

/**
 * Parse a date value from node properties
 */
function parseDateValue(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  if (typeof value === 'number') {
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

/**
 * Get column width based on time scale
 */
function getColumnWidth(timeScale: 'day' | 'week' | 'month'): number {
  switch (timeScale) {
    case 'day':
      return 40;
    case 'week':
      return 100;
    case 'month':
      return 120;
  }
}

/**
 * Format column label based on time scale
 */
function formatColumnLabel(
  date: Date,
  timeScale: 'day' | 'week' | 'month'
): { label: string; subLabel?: string } {
  switch (timeScale) {
    case 'day':
      return {
        label: date.toLocaleDateString('en-US', { weekday: 'short' }),
        subLabel: date.getDate().toString(),
      };
    case 'week': {
      const endOfWeek = new Date(date);
      endOfWeek.setDate(endOfWeek.getDate() + 6);
      return {
        label: `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
        subLabel: `- ${endOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      };
    }
    case 'month':
      return {
        label: date.toLocaleDateString('en-US', { month: 'short' }),
        subLabel: date.getFullYear().toString(),
      };
  }
}

/**
 * Generate time columns for the chart
 */
function generateTimeColumns(
  minDate: Date,
  maxDate: Date,
  timeScale: 'day' | 'week' | 'month'
): TimeColumn[] {
  const columns: TimeColumn[] = [];
  const width = getColumnWidth(timeScale);
  const current = new Date(minDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Align start date based on time scale
  if (timeScale === 'week') {
    const dayOfWeek = current.getDay();
    current.setDate(current.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
  } else if (timeScale === 'month') {
    current.setDate(1);
  }
  current.setHours(0, 0, 0, 0);

  while (current <= maxDate) {
    const { label, subLabel } = formatColumnLabel(current, timeScale);
    const colDate = new Date(current);

    const isToday =
      timeScale === 'day'
        ? colDate.getTime() === today.getTime()
        : timeScale === 'week'
          ? today >= colDate && today < new Date(colDate.getTime() + 7 * 24 * 60 * 60 * 1000)
          : today.getMonth() === colDate.getMonth() &&
            today.getFullYear() === colDate.getFullYear();

    columns.push({
      date: colDate,
      label,
      subLabel,
      isToday,
      width,
    });

    // Increment based on time scale
    switch (timeScale) {
      case 'day':
        current.setDate(current.getDate() + 1);
        break;
      case 'week':
        current.setDate(current.getDate() + 7);
        break;
      case 'month':
        current.setMonth(current.getMonth() + 1);
        break;
    }
  }

  return columns;
}

/**
 * Calculate bar position and width
 */
function calculateBarPosition(
  startDate: Date,
  endDate: Date,
  minDate: Date,
  columnWidth: number,
  timeScale: 'day' | 'week' | 'month'
): { left: number; width: number } {
  const msPerUnit =
    timeScale === 'day'
      ? 24 * 60 * 60 * 1000
      : timeScale === 'week'
        ? 7 * 24 * 60 * 60 * 1000
        : 30 * 24 * 60 * 60 * 1000;

  const startOffset = (startDate.getTime() - minDate.getTime()) / msPerUnit;
  const duration = (endDate.getTime() - startDate.getTime()) / msPerUnit;

  return {
    left: startOffset * columnWidth,
    width: Math.max(duration * columnWidth, columnWidth * 0.5), // Minimum width
  };
}

/**
 * Get status color from config or defaults
 */
function getStatusColor(
  status: string | undefined,
  statusColors?: Record<string, string>
): string {
  if (!status) return '#94a3b8';
  if (statusColors && statusColors[status]) return statusColors[status];
  return DEFAULT_STATUS_COLORS[status] || '#94a3b8';
}

/**
 * Convert hex color to rgba with transparency
 */
function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result || !result[1] || !result[2] || !result[3]) return hex;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function GanttView({
  nodes,
  edges = [],
  config,
  onNodeClick,
  onNodeUpdate,
}: GanttViewProps) {
  const {
    startDateField,
    endDateField,
    progressField,
    labelField,
    groupByField,
    dependencyEdgeTypes,
    timeScale = 'week',
    statusColors,
    showTodayMarker = true,
    barHeight = 32,
    allowDrag = true,
    allowResize = true,
  } = config;

  const containerRef = useRef<HTMLDivElement>(null);
  const [draggingTask, setDraggingTask] = useState<string | null>(null);

  // Parse nodes into tasks
  const tasks = useMemo<GanttTask[]>(() => {
    const result: GanttTask[] = [];

    for (const node of nodes) {
      const startDate = parseDateValue(node.properties[startDateField]);
      const endDate = parseDateValue(node.properties[endDateField]);
      if (!startDate || !endDate) continue;

      const task: GanttTask = {
        node,
        startDate,
        endDate,
        progress: progressField
          ? (node.properties[progressField] as number) || 0
          : 0,
        label: labelField
          ? (node.properties[labelField] as string) || node.title
          : node.title,
      };

      if (groupByField) {
        task.group = node.properties[groupByField] as string | undefined;
      }

      result.push(task);
    }

    return result.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  }, [nodes, startDateField, endDateField, progressField, labelField, groupByField]);

  // Calculate time range and columns
  const { timeColumns, minDate } = useMemo(() => {
    if (tasks.length === 0) {
      const now = new Date();
      return { timeColumns: [], minDate: now };
    }

    const min = new Date(Math.min(...tasks.map((t) => t.startDate.getTime())));
    const max = new Date(Math.max(...tasks.map((t) => t.endDate.getTime())));

    // Add padding based on time scale
    const padding = timeScale === 'day' ? 7 : timeScale === 'week' ? 14 : 30;
    min.setDate(min.getDate() - padding);
    max.setDate(max.getDate() + padding);

    const columns = generateTimeColumns(min, max, timeScale);
    return { timeColumns: columns, minDate: min };
  }, [tasks, timeScale]);

  // Group tasks if needed
  const groupedTasks = useMemo(() => {
    if (!groupByField) return { '': tasks };

    const groups: Record<string, GanttTask[]> = {};
    tasks.forEach((task) => {
      const groupKey = task.group || 'Ungrouped';
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(task);
    });
    return groups;
  }, [tasks, groupByField]);

  // Filter edges for dependencies
  const dependencyEdges = useMemo(() => {
    if (!dependencyEdgeTypes || dependencyEdgeTypes.length === 0) return [];
    const taskIds = new Set(tasks.map((t) => t.node.id));
    return edges.filter(
      (edge) =>
        dependencyEdgeTypes.includes(edge.type) &&
        taskIds.has(edge.from_node_id) &&
        taskIds.has(edge.to_node_id)
    );
  }, [edges, dependencyEdgeTypes, tasks]);

  // Calculate task positions for dependency arrows
  const taskPositions = useMemo(() => {
    const positions = new Map<
      string,
      { x: number; y: number; width: number; rowIndex: number }
    >();
    let globalRowIndex = 0;

    Object.entries(groupedTasks).forEach(([groupName, groupTasks]) => {
      if (groupName && groupByField) {
        globalRowIndex++; // Account for group header
      }
      groupTasks.forEach((task) => {
        const pos = calculateBarPosition(
          task.startDate,
          task.endDate,
          minDate,
          getColumnWidth(timeScale),
          timeScale
        );
        positions.set(task.node.id, {
          x: pos.left,
          y: globalRowIndex * (barHeight + 8) + barHeight / 2,
          width: pos.width,
          rowIndex: globalRowIndex,
        });
        globalRowIndex++;
      });
    });

    return positions;
  }, [groupedTasks, groupByField, minDate, timeScale, barHeight]);

  // Handle drag start
  const handleDragStart = useCallback(
    (taskId: string, e: React.DragEvent) => {
      if (!allowDrag) return;
      setDraggingTask(taskId);
      e.dataTransfer.setData('text/plain', taskId);
    },
    [allowDrag]
  );

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    setDraggingTask(null);
  }, []);

  const columnWidth = getColumnWidth(timeScale);
  const totalWidth = timeColumns.reduce((sum, col) => sum + col.width, 0);
  const labelColumnWidth = 200;

  if (nodes.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-gray-500">No items to display</div>
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-gray-500">
          No items with valid start and end dates
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full overflow-auto">
      <div className="inline-block min-w-full">
        {/* Header row */}
        <div className="sticky top-0 z-20 flex border-b bg-gray-50">
          {/* Label column header */}
          <div
            className="sticky left-0 z-30 shrink-0 border-r bg-gray-50 px-3 py-2 font-medium"
            style={{ width: labelColumnWidth }}
          >
            Task
          </div>
          {/* Time columns header */}
          <div className="flex">
            {timeColumns.map((col, i) => (
              <div
                key={i}
                className={`shrink-0 border-r px-1 py-1 text-center ${
                  col.isToday ? 'bg-blue-50' : ''
                }`}
                style={{ width: col.width }}
              >
                <div
                  className={`text-xs font-medium ${col.isToday ? 'text-blue-700' : 'text-gray-700'}`}
                >
                  {col.label}
                </div>
                {col.subLabel && (
                  <div
                    className={`text-xs ${col.isToday ? 'text-blue-500' : 'text-gray-400'}`}
                  >
                    {col.subLabel}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Body with task rows */}
        <div className="relative">
          {/* Today marker */}
          {showTodayMarker && (
            <TodayMarker
              columns={timeColumns}
              labelColumnWidth={labelColumnWidth}
            />
          )}

          {/* Dependency arrows */}
          {dependencyEdges.length > 0 && (
            <DependencyArrows
              edges={dependencyEdges}
              taskPositions={taskPositions}
              labelColumnWidth={labelColumnWidth}
              barHeight={barHeight}
            />
          )}

          {/* Task rows grouped */}
          {Object.entries(groupedTasks).map(([groupName, groupTasks]) => (
            <div key={groupName || '__default'}>
              {/* Group header */}
              {groupName && groupByField && (
                <div
                  className="sticky left-0 flex border-b bg-gray-100"
                  style={{ width: labelColumnWidth + totalWidth }}
                >
                  <div
                    className="px-3 py-1.5 text-sm font-medium text-gray-700"
                    style={{ width: labelColumnWidth }}
                  >
                    {groupName}
                  </div>
                </div>
              )}

              {/* Tasks in this group */}
              {groupTasks.map((task) => (
                <GanttRow
                  key={task.node.id}
                  task={task}
                  minDate={minDate}
                  timeScale={timeScale}
                  columnWidth={columnWidth}
                  labelColumnWidth={labelColumnWidth}
                  totalWidth={totalWidth}
                  barHeight={barHeight}
                  statusColors={statusColors}
                  allowDrag={allowDrag}
                  allowResize={allowResize}
                  isDragging={draggingTask === task.node.id}
                  onNodeClick={onNodeClick}
                  onNodeUpdate={onNodeUpdate}
                  onDragStart={(e) => handleDragStart(task.node.id, e)}
                  onDragEnd={handleDragEnd}
                  cardTemplate={config.cardTemplate}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Individual task row component
 */
function GanttRow({
  task,
  minDate,
  timeScale,
  columnWidth,
  labelColumnWidth,
  totalWidth,
  barHeight,
  statusColors,
  allowDrag,
  allowResize: _allowResize,
  isDragging,
  onNodeClick,
  onNodeUpdate: _onNodeUpdate,
  onDragStart,
  onDragEnd,
  cardTemplate,
}: {
  task: GanttTask;
  minDate: Date;
  timeScale: 'day' | 'week' | 'month';
  columnWidth: number;
  labelColumnWidth: number;
  totalWidth: number;
  barHeight: number;
  statusColors?: Record<string, string>;
  allowDrag: boolean;
  allowResize: boolean;
  isDragging: boolean;
  onNodeClick?: (node: Node) => void;
  onNodeUpdate?: (
    nodeId: string,
    updates: { start?: string; end?: string }
  ) => Promise<void>;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  cardTemplate?: CardTemplate;
}) {
  const barPos = calculateBarPosition(
    task.startDate,
    task.endDate,
    minDate,
    columnWidth,
    timeScale
  );

  const status = task.node.status;
  const barColor = getStatusColor(status, statusColors);
  const progressColor = hexToRgba(barColor, 0.6);
  const barBgColor = hexToRgba(barColor, 0.25);

  // Get subtitle from cardTemplate if available
  const subtitle = cardTemplate?.subtitleField
    ? (task.node.properties[cardTemplate.subtitleField] as string)
    : undefined;

  return (
    <div
      className={`flex border-b hover:bg-gray-50 ${isDragging ? 'opacity-50' : ''}`}
      style={{ minHeight: barHeight + 16 }}
      data-testid="gantt-row"
    >
      {/* Label column */}
      <div
        className="sticky left-0 z-10 shrink-0 border-r bg-white px-3 py-2"
        style={{ width: labelColumnWidth }}
      >
        <button
          onClick={() => onNodeClick?.(task.node)}
          className="w-full text-left hover:text-blue-600"
        >
          <div className="truncate text-sm font-medium">{task.label}</div>
          {subtitle && (
            <div className="truncate text-xs text-gray-500">{subtitle}</div>
          )}
        </button>
      </div>

      {/* Chart area */}
      <div
        className="relative py-2"
        style={{ width: totalWidth, minHeight: barHeight + 16 }}
      >
        {/* Bar */}
        <div
          className={`absolute rounded ${allowDrag ? 'cursor-grab' : 'cursor-pointer'}`}
          style={{
            left: barPos.left,
            width: barPos.width,
            height: barHeight,
            backgroundColor: barBgColor,
          }}
          draggable={allowDrag}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onClick={() => onNodeClick?.(task.node)}
        >
          {/* Progress fill */}
          {task.progress > 0 && (
            <div
              className="absolute inset-y-0 left-0 rounded-l"
              style={{
                width: `${Math.min(task.progress, 100)}%`,
                backgroundColor: progressColor,
              }}
            />
          )}

          {/* Bar content */}
          <div className="relative flex h-full items-center px-2">
            <span
              className="truncate text-xs font-medium"
              style={{ color: barColor }}
            >
              {task.label}
            </span>
          </div>

          {/* Status badge */}
          {status && (
            <div
              className="absolute -top-1 -right-1 rounded px-1 text-xs text-white"
              style={{ backgroundColor: barColor, fontSize: '10px' }}
            >
              {status}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Today marker component
 */
function TodayMarker({
  columns,
  labelColumnWidth,
}: {
  columns: TimeColumn[];
  labelColumnWidth: number;
}) {
  const todayColumn = columns.find((col) => col.isToday);
  if (!todayColumn) return null;

  const todayIndex = columns.indexOf(todayColumn);
  const offset =
    columns.slice(0, todayIndex).reduce((sum, col) => sum + col.width, 0) +
    todayColumn.width / 2;

  return (
    <div
      className="absolute top-0 bottom-0 z-10 w-0.5 bg-red-500"
      style={{ left: labelColumnWidth + offset }}
    >
      <div className="absolute -top-1 -left-1 h-2 w-2 rounded-full bg-red-500" />
    </div>
  );
}

/**
 * Dependency arrows component
 */
function DependencyArrows({
  edges,
  taskPositions,
  labelColumnWidth,
  barHeight,
}: {
  edges: Edge[];
  taskPositions: Map<
    string,
    { x: number; y: number; width: number; rowIndex: number }
  >;
  labelColumnWidth: number;
  barHeight: number;
}) {
  return (
    <svg
      className="pointer-events-none absolute inset-0 overflow-visible"
      style={{ left: labelColumnWidth }}
    >
      <defs>
        <marker
          id="gantt-arrowhead"
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
        >
          <polygon points="0 0, 10 3.5, 0 7" fill="#6b7280" />
        </marker>
      </defs>

      {edges.map((edge) => {
        const fromPos = taskPositions.get(edge.from_node_id);
        const toPos = taskPositions.get(edge.to_node_id);
        if (!fromPos || !toPos) return null;

        // Draw path from end of source bar to start of target bar
        const startX = fromPos.x + fromPos.width;
        const startY = fromPos.rowIndex * (barHeight + 8) + barHeight / 2 + 8; // +8 for py-2
        const endX = toPos.x;
        const endY = toPos.rowIndex * (barHeight + 8) + barHeight / 2 + 8;

        // Create a curved path
        const midX = (startX + endX) / 2;
        const controlOffset = Math.abs(endY - startY) * 0.5 + 20;

        // Determine path type based on relative positions
        let path: string;
        if (endX > startX + 10) {
          // Target is to the right - simple curve
          path = `M ${startX} ${startY} C ${startX + controlOffset} ${startY}, ${endX - controlOffset} ${endY}, ${endX} ${endY}`;
        } else {
          // Target is to the left or overlapping - route around
          const routeY =
            Math.max(startY, endY) + barHeight + 10;
          path = `M ${startX} ${startY} L ${startX + 10} ${startY} Q ${startX + 10} ${routeY} ${midX} ${routeY} Q ${endX - 10} ${routeY} ${endX - 10} ${endY} L ${endX} ${endY}`;
        }

        return (
          <path
            key={edge.id}
            d={path}
            fill="none"
            stroke="#9ca3af"
            strokeWidth="1.5"
            strokeDasharray="4 2"
            markerEnd="url(#gantt-arrowhead)"
          />
        );
      })}
    </svg>
  );
}
