/**
 * TypeScript types for Semantic View Templates.
 * These mirror the backend Pydantic models for view configuration.
 */

import type { Node, Edge } from './workflow';

// ==================== Style Configuration Types ====================

export type ViewStyle = 'kanban' | 'cards' | 'tree' | 'timeline' | 'table' | 'gantt' | 'record';

export type RecordSelectorStyle = 'list' | 'cards' | 'dropdown';

export interface CardTemplate {
  titleField?: string;
  subtitleField?: string;
  statusField?: string;
  bodyFields?: string[];
  showInlineChildren?: boolean;
  statusColors?: Record<string, string>;
}

export interface SwimlanePath {
  edgeType: string;
  direction: 'outgoing' | 'incoming';
  targetType: string;
  targetField: string;
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
  // Swimlane configuration (optional secondary grouping)
  swimlaneField?: string;
  swimlanePath?: SwimlanePath;
  swimlaneOrder?: string[];
  swimlaneColors?: Record<string, string>;
  showEmptySwimlanes?: boolean;
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

export interface RecordSectionConfig {
  targetType: string;
  title?: string;
  description?: string;
  collapsedByDefault?: boolean;
  maxItems?: number;
  emptyMessage?: string;
  displayNested?: boolean;
  allowCreate?: boolean;
}

export interface RecordConfig {
  selectorStyle: RecordSelectorStyle;
  showProperties?: boolean;
  propertiesTitle?: string;
  propertyFields?: string[];
  sections: RecordSectionConfig[];
}

export type StyleConfig =
  | KanbanConfig
  | CardsConfig
  | TreeConfig
  | TimelineConfig
  | TableConfig
  | GanttConfig
  | RecordConfig;

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

// ==================== Dynamic Filter Types ====================

export type FilterOperator =
  | 'eq'
  | 'neq'
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'notIn'
  | 'isNull'
  | 'isNotNull';

export interface PropertyFilter {
  type: 'property';
  field: string;
  operator: FilterOperator;
  value?: unknown;
}

export interface RelationalFilter {
  type: 'relational';
  edgeType: string;
  direction: 'outgoing' | 'incoming';
  targetType: string;
  targetFilter: PropertyFilter;
  matchMode?: 'any' | 'all' | 'none';
}

export type NodeFilter = PropertyFilter | RelationalFilter;

export interface FilterGroup {
  logic: 'and' | 'or';
  filters: (NodeFilter | FilterGroup)[];
}

export interface ViewFilterParams {
  filters?: FilterGroup;
}

// ==================== Filter Schema Types (from /filter-schema endpoint) ====================

export interface RelationPath {
  edgeType: string;
  direction: 'outgoing' | 'incoming';
  targetType: string;
}

export interface FilterableField {
  key: string;
  label: string;
  kind: string; // FieldKind: string, number, datetime, enum, person, json, tag[], file[]
  nodeType: string;
  values?: string[]; // For enum fields
  isRelational: boolean;
  relationPath?: RelationPath;
}

export interface FilterSchema {
  propertyFields: FilterableField[];
  relationalFields: FilterableField[];
}

// ==================== Active Filter State (for UI) ====================

export interface ActiveFilter {
  id: string; // Unique ID for React keys
  filter: NodeFilter;
  displayLabel: string;
}

export interface FilterState {
  activeFilters: ActiveFilter[];
  filterGroup: FilterGroup;
}

// ==================== View Template Types ====================

export interface EdgeTraversal {
  edgeType: string;
  direction: 'outgoing' | 'incoming';
  targetType: string;
  sourceType?: string;
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
  edges?: EdgeTraversal[];
  levels?: Record<string, LevelConfig>;
  filters?: FilterConfig[];
}

// ==================== API Response Types ====================

export interface LevelData {
  nodes: Node[];
  edges: Edge[];
  count: number;
  parent_map: Record<string, string>; // child_id -> parent_id
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
  edges?: Edge[];
  allNodes?: Node[];  // All nodes from all levels (for relational swimlane lookups)
  config: KanbanConfig;
  onNodeClick?: (node: Node) => void;
  onNodeDrop?: (nodeId: string, newStatus: string, newSwimlane?: string) => void;
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

export interface RecordViewProps {
  workflowId: string;
  viewTemplate: ViewTemplate;
  levelData: Record<string, LevelData>;
  onNodeClick?: (node: Node) => void;
  onNodeCreate?: (nodeType: string, parentNodeId?: string) => void;
}
