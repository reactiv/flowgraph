# Semantic View Templates

**Feature Specification v0.1**

## Problem Statement

Workflow graphs contain heterogeneous relationships that carry semantic meaning. A "hypothesis links to sample" edge implies an evidence relationship; a "sample derives from sample" edge implies lineage. Current graph UIs treat all edges uniformly, forcing users to mentally reconstruct structure that the data already encodes.

Users need views that respect edge semantics—showing evidence hierarchically, lineage as DAGs, temporal sequences as timelines—without building bespoke UIs for each relationship type.

## Proposed Solution

Introduce **View Templates**: declarative configurations that define how to traverse and render subgraphs based on edge types. Each template specifies a root entity type, which edges to follow (and in what order), and which **Component Style** to use at each level of the resulting hierarchy.

Component Styles are reusable layout primitives (Tree, Kanban, Timeline, Table, Cards) that know how to render a collection of entities. The template wires these together into coherent, purpose-built views.

---

## Core Concepts

### View Template

A view template defines:

| Property | Description |
|----------|-------------|
| `rootType` | The entity type that anchors this view (e.g., Hypothesis, Instrument) |
| `edges` | Ordered list of edge types to traverse, forming the hierarchy |
| `levels` | Per-entity-type rendering configuration |
| `filters` | Optional default filters applied to the view |

### Component Style

A component style renders a flat list of entities. It receives entities and a configuration, and handles layout, interaction, and manipulation. Available styles:

| Style | Best For | Key Config |
|-------|----------|------------|
| `tree` | Parent-child, lineage, containment | `parentField`, `expandable`, `showDepthLines` |
| `kanban` | Status workflows, categorical grouping | `groupByField`, `columnOrder`, `allowDrag` |
| `timeline` | Temporal sequences, event history | `dateField`, `granularity`, `groupByField` |
| `table` | Dense data, sorting, bulk operations | `columns`, `sortable`, `selectable` |
| `cards` | Overview, visual scanning | `layout` (grid/list), `cardTemplate` |

### Inline Children

Any level can specify `inlineChildren`: entity types to render compactly within the parent when collapsed. This reduces nesting without losing information—e.g., showing analysis chips inline on a sample card.

---

## Template Schema

```typescript
interface ViewTemplate {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  
  // What anchors this view
  rootType: EntityType;
  
  // Edge traversal order (defines hierarchy depth)
  edges: EdgeTraversal[];
  
  // How to render entities at each level
  levels: Record<EntityType, LevelConfig>;
  
  // Default filters
  filters?: FilterConfig[];
}

interface EdgeTraversal {
  edgeType: string;           // e.g., "hypothesis_links_sample"
  direction: 'outgoing' | 'incoming';
  required?: boolean;         // Exclude roots with no matches?
}

interface LevelConfig {
  style: 'tree' | 'kanban' | 'timeline' | 'table' | 'cards';
  styleConfig: StyleConfig;   // Style-specific options
  inlineChildren?: EntityType[];
  expandedByDefault?: boolean;
  actions?: ActionConfig[];   // Context menu, inline buttons
}
```

---

## Kanban Style Specification

The Kanban style groups entities into columns by a categorical field, supporting drag-and-drop to change that field's value.

### Configuration

```typescript
interface KanbanConfig {
  groupByField: string;           // Field that determines column
  columnOrder?: string[];         // Explicit ordering (else alphabetical)
  columnLabels?: Record<string, string>;  // Display names
  columnColors?: Record<string, string>;  // Visual differentiation
  
  allowDrag: boolean;             // Enable drag-and-drop
  allowedTransitions?: Record<string, string[]>;  // Valid moves
  onDrop?: 'updateField' | 'custom';  // What happens on drop
  
  cardTemplate: CardTemplate;     // How to render each card
  showCounts: boolean;            // Column header counts
  showEmptyColumns: boolean;      // Include columns with 0 items
  collapsibleColumns: boolean;    // Allow minimizing columns
}

interface CardTemplate {
  titleField: string;
  subtitleField?: string;
  statusIndicator?: {
    field: string;
    colorMap: Record<string, string>;
  };
  badges?: BadgeConfig[];         // Tags, counts, icons
  thumbnail?: {
    field: string;                // URL or file reference
    position: 'left' | 'top';
  };
}
```

### Interaction Model

| Action | Behavior |
|--------|----------|
| Drag card | Visual feedback, ghost card, drop zones highlight |
| Drop on column | Validate against `allowedTransitions`, update `groupByField`, optimistic UI |
| Drop rejected | Snap back with explanation toast |
| Click card | Select (single), expand detail panel, or navigate (configurable) |
| Column collapse | Minimize to header-only, show count badge |

### Transitions Validation

When `allowedTransitions` is defined, only valid moves are permitted:

```typescript
allowedTransitions: {
  "Proposed": ["Active", "Dismissed"],
  "Active": ["Validated", "Rejected"],
  "Validated": [],  // Terminal state
  "Rejected": ["Active"],  // Can reopen
  "Dismissed": []
}
```

Invalid drops show a disabled drop zone and tooltip explaining why.

---

## Example Templates

### 1. Hypothesis Evidence View

Shows all evidence supporting a hypothesis, organized by sample lineage with inline analyses.

```yaml
id: hypothesis-evidence
name: Evidence View
rootType: hypothesis
edges:
  - edgeType: hypothesis_links_sample
    direction: outgoing
  - edgeType: sample_has_analysis
    direction: outgoing

levels:
  hypothesis:
    style: cards
    styleConfig:
      layout: single
      cardTemplate:
        titleField: nickname
        subtitleField: author
        statusIndicator:
          field: status
          colorMap:
            Active: "#8b5cf6"
            Validated: "#22c55e"
            Rejected: "#ef4444"
    expandedByDefault: true
    
  sample:
    style: tree
    styleConfig:
      parentField: parent_sample_uuid
      expandable: true
      showDepthLines: true
    inlineChildren: [analysis]
    
  analysis:
    style: cards
    styleConfig:
      layout: inline-chips
      cardTemplate:
        titleField: analysis_type
        subtitleField: result_summary
```

### 2. Hypothesis Kanban

Track hypothesis lifecycle across status stages.

```yaml
id: hypothesis-kanban
name: Hypothesis Board
rootType: hypothesis
edges: []  # No traversal, just show hypotheses

levels:
  hypothesis:
    style: kanban
    styleConfig:
      groupByField: status
      columnOrder: [Proposed, Active, Validated, Rejected, Dismissed]
      columnColors:
        Proposed: "#64748b"
        Active: "#8b5cf6"
        Validated: "#22c55e"
        Rejected: "#ef4444"
        Dismissed: "#475569"
      allowDrag: true
      allowedTransitions:
        Proposed: [Active, Dismissed]
        Active: [Validated, Rejected]
        Rejected: [Active]
      cardTemplate:
        titleField: nickname
        subtitleField: author
        badges:
          - type: count
            label: samples
            field: samples.length
          - type: count
            label: analyses
            field: analyses.length
      showCounts: true
      showEmptyColumns: true
```

### 3. Sample Processing Pipeline

Track samples through synthesis stages using Kanban.

```yaml
id: sample-pipeline
name: Processing Pipeline
rootType: sample
edges: []

levels:
  sample:
    style: kanban
    styleConfig:
      groupByField: status
      columnOrder: [Queued, In Progress, Complete, Failed]
      allowDrag: true
      allowedTransitions:
        Queued: [In Progress]
        In Progress: [Complete, Failed]
        Failed: [Queued]  # Retry
      cardTemplate:
        titleField: nickname
        subtitleField: sample_id
        statusIndicator:
          field: sample_type
          colorMap:
            synth: "#8b5cf6"
            post_synth: "#06b6d4"
            analysis: "#22c55e"
        badges:
          - type: count
            label: analyses
            icon: microscope
            field: analyses.length
```

### 4. Analysis Timeline by Instrument

Show analysis history grouped by instrument, ordered by date.

```yaml
id: instrument-timeline
name: Instrument Usage
rootType: instrument_config
edges:
  - edgeType: analysis_uses_config
    direction: incoming

levels:
  instrument_config:
    style: cards
    styleConfig:
      layout: list
      cardTemplate:
        titleField: name
        subtitleField: instrument_type
        
  analysis:
    style: timeline
    styleConfig:
      dateField: date
      granularity: day
      groupByField: analysis_type
      showConnectors: true
      cardTemplate:
        titleField: result_id
        subtitleField: result_summary
```

---

## Rendering Pipeline

1. **Select Template**: User chooses a view from available templates
2. **Select Root**: User picks a specific root entity (or views all roots)
3. **Traverse Graph**: Follow `edges` from root(s), building hierarchy
4. **Apply Filters**: Prune entities based on template and user filters
5. **Render Levels**: For each level, instantiate the Component Style with its config
6. **Wire Interactions**: Connect expand/collapse, selection, navigation, and manipulation handlers

---

## Manipulation Actions

Each level can define actions that modify the graph:

```typescript
interface ActionConfig {
  id: string;
  label: string;
  icon?: string;
  position: 'contextMenu' | 'inlineButton' | 'bulkAction';
  
  action: 
    | { type: 'navigate', targetView: string }
    | { type: 'createChild', entityType: EntityType, defaults?: Record<string, any> }
    | { type: 'linkExisting', entityType: EntityType, edgeType: string }
    | { type: 'unlink', edgeType: string }
    | { type: 'updateField', field: string, value: any }
    | { type: 'custom', handler: string };
    
  confirmation?: string;  // Prompt before executing
  allowedWhen?: FilterConfig;  // Conditional availability
}
```

For Kanban, drag-and-drop is a built-in action equivalent to `updateField` on the `groupByField`.

---

## Domain Generalization

This system applies beyond lab workflows. The same template structure works for:

| Domain | Root Type | Key Edges | Useful Styles |
|--------|-----------|-----------|---------------|
| Project Management | Epic | epic→story→task | Kanban (status), Tree (hierarchy) |
| Document Review | Document | doc→comment→reply | Timeline (date), Tree (threads) |
| Customer Support | Ticket | ticket→interaction | Kanban (status), Timeline (history) |
| Research | Paper | paper→citation | Cards (references), Table (metadata) |
| Manufacturing | Order | order→batch→unit | Kanban (stage), Tree (BOM) |

Templates are domain configuration, not code. Users or admins define new views without engineering involvement.

---

## Open Questions

1. **Permissions**: Should template definitions include field-level read/write permissions, or is that handled elsewhere?

2. **Nested Kanban**: Can a Kanban column itself contain a sub-Kanban (e.g., samples grouped by type, then by status)? Or is this better handled by filters?

3. **Cross-template linking**: When a user clicks an entity in one view, should they navigate within the same template (re-rooting) or switch to a "native" template for that entity type?

4. **Saved views**: Should users be able to save filter + template combinations as named views? What's the sharing model?

5. **Real-time updates**: How do we handle concurrent edits in Kanban? Optimistic UI with conflict resolution, or lock-based?

---

## Filtering

Views support dynamic filtering at query time, allowing users to narrow down displayed nodes without modifying the view template.

### Filter Types

#### Property Filters
Filter nodes by their direct field values:

```typescript
interface PropertyFilter {
  type: 'property';
  field: string;           // Field key (e.g., "status", "priority")
  operator: FilterOperator;
  value?: unknown;
}

type FilterOperator =
  | 'eq' | 'neq'           // Equality
  | 'contains' | 'startsWith' | 'endsWith'  // String matching
  | 'gt' | 'gte' | 'lt' | 'lte'  // Comparison
  | 'in' | 'notIn'         // Set membership
  | 'isNull' | 'isNotNull'; // Null checks
```

#### Relational Filters
Filter nodes based on properties of connected nodes via edges:

```typescript
interface RelationalFilter {
  type: 'relational';
  edgeType: string;        // e.g., "BELONGS_TO"
  direction: 'outgoing' | 'incoming';
  targetType: string;      // Target node type
  targetFilter: PropertyFilter;  // Filter applied to connected nodes
  matchMode?: 'any' | 'all' | 'none';  // How to aggregate matches
}
```

**Example**: "Show Parts where the connected Device has status = Active"
```typescript
{
  type: 'relational',
  edgeType: 'BELONGS_TO',
  direction: 'outgoing',
  targetType: 'Device',
  targetFilter: { type: 'property', field: 'status', operator: 'eq', value: 'Active' },
  matchMode: 'any'
}
```

### Filter Groups

Filters can be combined with AND/OR logic:

```typescript
interface FilterGroup {
  logic: 'and' | 'or';
  filters: (NodeFilter | FilterGroup)[];  // Supports nesting
}
```

### Filter Schema API

`GET /views/{view_id}/filter-schema` returns available filterable fields:

```typescript
interface FilterSchema {
  propertyFields: FilterableField[];   // Direct node properties
  relationalFields: FilterableField[]; // Properties via edges
}

interface FilterableField {
  key: string;           // Unique identifier
  label: string;         // Display label
  kind: FieldKind;       // string, number, enum, datetime, person
  nodeType: string;      // Which node type this field belongs to
  values?: string[];     // For enums: allowed values
  isRelational: boolean;
  relationPath?: {       // For relational fields
    edgeType: string;
    direction: 'outgoing' | 'incoming';
    targetType: string;
  };
}
```

### Autocomplete

`GET /views/{view_id}/filter-values` provides distinct values for autocomplete:

| Parameter | Description |
|-----------|-------------|
| `node_type` | The node type to get values from |
| `field` | The field to get distinct values for |
| `limit` | Maximum number of values (default: 50) |

### UI Components

The filter bar appears above the view content:

| Component | Purpose |
|-----------|---------|
| `FilterBar` | Container showing active filters as chips |
| `FilterChip` | Removable pill showing filter summary |
| `FilterBuilder` | Modal for constructing new filters |
| `FieldSelector` | Dropdown grouped by property/relational |
| `OperatorSelector` | Operators appropriate for field kind |
| `ValueInput` | Input with autocomplete for text fields |
