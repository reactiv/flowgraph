/**
 * TypeScript types for Semantic View Templates.
 * These mirror the backend Pydantic models for view configuration.
 */

import type { Node, Edge } from './workflow';

// ==================== Style Configuration Types ====================

export type ViewStyle = 'kanban' | 'cards' | 'tree' | 'timeline' | 'table' | 'gantt';

export interface CardTemplate {
  titleField?: string;
  subtitleField?: string;
  statusField?: string;
  bodyFields?: string[];
  showInlineChildren?: boolean;
  statusColors?: Record<string, string>;
}

export interface KanbanConfig {
  groupByField: string;
  columnOrder?: string[];
  columnColors?: Record<string, string>;
  allowDrag?: boolean;
  allowedTransitions?: Record<string, string[]>;
  cardTemplate?: CardTemplate;
  showCounts?: boolean;
  showEmptyColumns?: boolean;
}

export interface CardsConfig {
  layout: 'grid' | 'list' | 'single' | 'inline-chips';
  columns?: number;
  cardTemplate?: CardTemplate;
}

export interface TreeConfig {
  parentField?: string;
  expandable?: boolean;
  showDepthLines?: boolean;
  cardTemplate?: CardTemplate;
}

export interface TimelineConfig {
  dateField: string;
  granularity: 'day' | 'week' | 'month';
  groupByField?: string;
  showConnectors?: boolean;
  cardTemplate?: CardTemplate;
}

export interface TableConfig {
  columns: string[];
  sortable?: boolean;
  selectable?: boolean;
  statusColors?: Record<string, string>;
}

export interface GanttConfig {
  startDateField: string;
  endDateField: string;
  progressField?: string;
  labelField?: string;
  groupByField?: string;
  dependencyEdgeTypes?: string[];
  timeScale: 'day' | 'week' | 'month';
  statusColors?: Record<string, string>;
  showTodayMarker?: boolean;
  barHeight?: number;
  allowDrag?: boolean;
  allowResize?: boolean;
  cardTemplate?: CardTemplate;
}

export type StyleConfig =
  | KanbanConfig
  | CardsConfig
  | TreeConfig
  | TimelineConfig
  | TableConfig
  | GanttConfig;

// ==================== Action and Filter Types ====================

export type ActionType = 'create-linked' | 'update-status' | 'navigate' | 'custom';

export interface ActionConfig {
  id: string;
  label: string;
  icon?: string;
  action: ActionType;
  params?: Record<string, unknown>;
}

export type FilterType = 'select' | 'multiselect' | 'date-range' | 'search';

export interface FilterConfig {
  field: string;
  label: string;
  type: FilterType;
}

// ==================== View Template Types ====================

export interface EdgeTraversal {
  edgeType: string;
  direction: 'outgoing' | 'incoming';
  targetType: string;
  required?: boolean;
}

export interface LevelConfig {
  style: ViewStyle;
  styleConfig: StyleConfig;
  inlineChildren?: string[];
  expandedByDefault?: boolean;
  actions?: ActionConfig[];
}

export interface ViewTemplate {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  rootType: string;
  edges: EdgeTraversal[];
  levels: Record<string, LevelConfig>;
  filters?: FilterConfig[];
}

export interface ViewTemplateCreate {
  name: string;
  description?: string;
  icon?: string;
  rootType: string;
  edges?: EdgeTraversal[];
  levels: Record<string, LevelConfig>;
  filters?: FilterConfig[];
}

export interface ViewTemplateUpdate {
  name?: string;
  description?: string;
  icon?: string;
}

// ==================== API Response Types ====================

export interface LevelData {
  nodes: Node[];
  edges: Edge[];
}

export interface ViewSubgraphResponse {
  template: ViewTemplate;
  levels: Record<string, LevelData>;
}

// ==================== Component Props Types ====================

export interface KanbanColumn {
  id: string;
  label: string;
  color?: string;
  nodes: Node[];
}

export interface KanbanViewProps {
  nodes: Node[];
  config: KanbanConfig;
  onNodeClick?: (node: Node) => void;
  onNodeDrop?: (nodeId: string, newStatus: string) => void;
}

export interface CardsViewProps {
  nodes: Node[];
  config: CardsConfig;
  onNodeClick?: (node: Node) => void;
}

export interface NodeCardProps {
  node: Node;
  cardTemplate?: CardTemplate;
  onClick?: () => void;
  draggable?: boolean;
}

export interface TableViewProps {
  nodes: Node[];
  config: TableConfig;
  onNodeClick?: (node: Node) => void;
  onStatusChange?: (nodeId: string, newStatus: string) => Promise<void>;
  onSelectionChange?: (selectedIds: Set<string>) => void;
}

export interface GanttViewProps {
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
