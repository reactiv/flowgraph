# Phase 1: Core Demo - TODO

> **Goal:** Demonstrate "any workflow is just a graph" by shipping a library of diverse workflow templates, realistic seeded data, and four polished UI views (graph, list, detail, kanban).

---

## 1. Foundation: Data Model & Storage

### 1.1 Core Schema (SQLite)
- [x] Create `workflow_definitions` table (id, name, version, definition_json, timestamps)
- [x] Create `nodes` table (id, workflow_id, type, title, status, properties_json, timestamps)
- [x] Create `edges` table (id, workflow_id, type, from_node_id, to_node_id, properties_json, timestamps)
- [x] Create `events` table (id, workflow_id, subject_node_id, event_type, payload_json, created_at)
- [x] Add indexes for snappy queries:
  - `nodes(workflow_id, type, status, updated_at)`
  - `edges(workflow_id, from_node_id, type)`
  - `edges(workflow_id, to_node_id, type)`
  - `events(workflow_id, subject_node_id, created_at)`

### 1.2 GraphStore Interface
- [x] `createWorkflow(definition)` / `listWorkflows()` / `getWorkflow(id)`
- [x] `createNode(node)` / `getNode(id)` / `updateNode(id, patch)` / `queryNodes(filters, pagination)`
- [x] `createEdge(edge)` / `getNeighbors(nodeId, { depth, edgeTypes })`
- [x] `appendEvent(event)` / `getEvents(filters)`
- [x] `resetAndSeed(workflowId, recipe)` - reset done, seed is placeholder for LLM integration

---

## 2. Workflow Definition Schema

### 2.1 Pydantic Models (Backend) + TypeScript Types (Frontend)
- [x] `WorkflowDefinition` model with:
  - `workflowId`, `name`, `description`
  - `nodeTypes[]` with fields, states, UI hints
  - `edgeTypes[]` with from/to constraints
  - `rules[]` (optional constraints)
- [x] `FieldKind` enum: `string`, `number`, `datetime`, `enum`, `person`, `json`, `tag[]`, `file[]`
- [x] `NodeState` machine: `enabled`, `initial`, `values[]`, `transitions[]`
- [x] Pydantic validators for definitions (backend), TypeScript types (frontend)

### 2.2 UI Hints (First-Class)
- [x] `titleField`, `subtitleField` per node type
- [x] `defaultViews[]`: which views are enabled (list, detail, graph, kanban)
- [x] `listColumns[]`: recommended columns for list view
- [x] `quickActions[]`: e.g., "Create Analysis", "Link Hypothesis"

---

## 3. Template Library (Diverse Workflows, Same Primitives)

> **Key demo point:** All these wildly different domains use the same node/edge/event primitives.

### 3.1 Primary Template: Materials R&D (from spec)
- [x] **Sample** node type
  - Fields: sample_id (unique), nickname, author, date, sample_type (enum), details (json), tags
  - States: Draft → In Progress → Complete → Archived
- [x] **Analysis** node type
  - Fields: result_id, analysis_type (enum: TGA, PXRD, SEM, etc.), author, date, parameters (json), files
  - States: Pending → Running → Complete → Failed
- [x] **Hypothesis** node type
  - Fields: nickname, author, statements, status (Proposed/Active/Validated/Rejected)
- [x] **Tag** node type (optional, can be inline array)
- [x] Edge types: `HAS_ANALYSIS`, `LINKED_TO_HYPOTHESIS`, `TAGGED_WITH`, `PARENT_OF`
- [x] Rule: Sample requires ≥1 Analysis before Complete
- [x] **File: `backend/templates/materials-rnd.workflow.json`** (6 node types, 9 edge types)

### 3.2 Template: CAPA / Investigation
- [x] **Nonconformance** → **Investigation** → **RootCause** → **CorrectiveAction** → **Verification**
- [x] Edge types: `TRIGGERS`, `IDENTIFIES`, `PRODUCES`, `VERIFIED_BY`
- [x] States: Open → Under Investigation → Pending Action → Closed
- [x] Rule: Cannot close Nonconformance until ≥1 Action is Verified
- [x] **File: `backend/templates/capa.workflow.json`** (6 node types, 7 edge types)

### 3.3 Template: ML Lifecycle
- [x] **Dataset** → **FeatureSet** → **TrainingRun** → **Model** → **Evaluation** → **Deployment**
- [x] Fields: metrics (json), hyperparameters, accuracy, model_artifact_path
- [x] States per node type (e.g., Model: Training → Validated → Deployed → Deprecated)
- [x] **File: `backend/templates/ml-lifecycle.workflow.json`** (7 node types, 10 edge types)

### 3.4 Template: Sequencing Provenance
- [x] **BioSample** → **LibraryPrep** → **SequencingRun** → **RawData** → **Analysis** → **QCReport**
- [x] Fields: concentration, read_count, quality_score, contamination_check
- [x] Edge types: `PREPARED_FROM`, `SEQUENCED_IN`, `ANALYZED_BY`
- [x] **File: `backend/templates/sequencing.workflow.json`** (7 node types, 11 edge types)

### 3.5 Template: Closed-Loop Optimization
- [x] **Goal** → **Hypothesis** → **ExperimentPlan** → **Sample** → **Measurement** → **Model** → **Recommendation**
- [x] Circular edge back: `INFORMS_GOAL`
- [x] Shows iterative scientific loops
- [x] **File: `backend/templates/closed-loop.workflow.json`** (8 node types, 13 edge types)

### 3.6 Template: Equipment Maintenance Management
- [x] **Equipment** (hierarchical: Plant → Line → Machine → Component)
- [x] **WorkOrder** (Preventive, Corrective, Emergency maintenance)
- [x] **SparePart** (inventory with reorder points)
- [x] **Inspection** (safety, compliance, condition assessments)
- [x] **MaintenanceLog** (repair, replacement, observation records)
- [x] Edge types: `PARENT_OF`, `HAS_WORK_ORDER`, `USES_PART`, `HAS_INSPECTION`, `HAS_LOG`
- [x] **6 view templates** showcasing all view styles:
  - Tree: Equipment Hierarchy
  - Kanban: Work Order Board
  - Timeline: Maintenance Timeline, Inspection Schedule
  - Table: Parts Inventory
  - Cards: Equipment Overview
- [x] **File: `backend/templates/equipment-maintenance.workflow.json`** (5 node types, 8 edge types)

### 3.7 Template Storage
- [x] Store templates as JSON in `/templates/*.workflow.json`
- [x] API: `GET /api/templates` returns template list
- [x] API: `POST /api/workflows/from-template` creates workflow from template

---

## 4. LLM-Powered Schema Generation (Natural Language → Workflow)

> Users describe their workflow in plain English, Claude generates a complete WorkflowDefinition.

### 4.1 "Describe Your Workflow" UI
- [x] Text area for natural language description
- [x] Example prompts/suggestions to guide users
- [x] Optional toggles: "Include states", "Include tags", "Scientific terminology"
- [x] Live preview of generated schema (graph visualization via React Flow)
- [x] "Apply" button to create workflow from generated schema
- [x] **File: `frontend/src/app/create/page.tsx`** (327 lines)

### 4.2 LLM Schema Generation
- [x] System prompt with:
  - WorkflowDefinition JSON schema (strict structure)
  - Examples of well-formed definitions
  - Domain hints based on detected terminology
- [x] Extract from natural language:
  - Node types (entities mentioned)
  - Fields per node type (attributes described)
  - Edge types (relationships between entities)
  - State machines (status progressions mentioned)
  - UI hints (inferred from context)
- [x] Structured output via Claude's JSON mode
- [x] Uses Claude Opus 4.5 (claude-opus-4-5-20251101)
- [x] **File: `backend/app/llm/schema_generator.py`** (266 lines)

### 4.3 Validation & LLM Self-Correction
- [x] Pydantic validation on generated schema
- [x] Retry loop with error feedback (up to 3 attempts):
  - JSON parsing errors fed back to LLM
  - Pydantic validation errors fed back to LLM
  - LLM self-corrects based on error messages
- [x] Return validation results to user
- [x] **Note:** No auto-fix layer; LLM is responsible for generating valid schemas

### 4.4 Refinement Chat
- [ ] After initial generation, allow iterative refinement:
  - "Add a 'priority' field to Tasks"
  - "Rename 'Item' to 'Sample'"
  - "Add a relationship from Analysis to Report"
- [ ] Each refinement regenerates/patches the schema

### 4.5 API Endpoint
- [x] `POST /api/v1/workflows/from-language`
  - Request: `{ "description": "...", "options": {...} }`
  - Response: `{ "definition": WorkflowDefinition, "validation": {...} }`
- [x] `POST /api/v1/workflows/from-definition`
  - Request: `WorkflowDefinition`
  - Response: `WorkflowSummary` (creates workflow from validated definition)

---

## 5. LLM-Powered Data Generation (Anthropic Claude)

> Data generation via Claude API produces realistic, coherent, domain-aware content that feels like real scientific data.

### 5.1 Generation Strategy
- [x] Two-phase generation:
  1. **Graph structure**: Generate node/edge skeleton with IDs and relationships
  2. **Content population**: LLM fills in realistic field values with full context
- [x] Scales: Small (3-8 nodes), Medium (10-25 nodes), Large (30-60 nodes) per type
- [x] Batch generation to minimize API calls (max 10 nodes per request)
- [x] **File: `backend/app/llm/data_generator.py`** (636 lines)

### 5.2 LLM Prompt Design
- [x] System prompt includes:
  - Workflow definition (node types, fields, constraints)
  - Domain context (e.g., "materials science R&D lab")
  - Existing nodes for reference (maintains coherence)
- [x] Structured output via JSON mode
- [x] Schema validation on all LLM responses

### 5.3 Content Quality Requirements
- [x] Domain-realistic values:
  - Scientific IDs: "SMP-2024-0142", "PXRD-A-0891"
  - Plausible parameters: `{ "2theta_range": "5-80°", "step_size": "0.02°" }`
  - Realistic author names from a consistent "team roster" (12 names)
- [x] Coherent timelines (analyses dated after sample creation)
- [x] Cross-references: Hypotheses mention specific sample nicknames
- [x] Realistic status distributions (not all Complete)

### 5.4 Cohesion Features
- [x] LLM sees previously generated nodes when creating new ones
- [x] Hypotheses reference specific samples and analyses by name
- [x] Tags cluster meaningfully (related samples share tags)
- [x] Summaries synthesize information from linked nodes
- [ ] ~~Fallback to rule-based generation if LLM unavailable~~ (removed - require LLM)

### 5.5 API Integration
- [x] Anthropic SDK (`anthropic` Python package)
- [x] Uses Claude Sonnet 4 (claude-sonnet-4-20250514)
- [x] Retry logic with exponential backoff (handles RateLimitError, 500+ errors)
- [x] **File: `backend/app/llm/client.py`** (191 lines)
- [x] Seed endpoint wiring (wired up to DataGenerator)

---

## 6. UI Components (High Polish)

> **This is where we spend the most time.** The UI must feel alive immediately after seeding.

### 6.1 App Shell & Navigation
- [ ] Sidebar navigation:
  - Home / Workflows
  - Template Gallery
  - (Per workflow): List, Graph, Board, Timeline
- [ ] Workflow switcher (if multiple workflows exist)
- [ ] "Generate Demo Data" prominent CTA on empty states

### 6.2 Template Gallery
- [ ] Card grid with: name, description, domain tags (R&D, QA, ML, Bio)
- [ ] "Preview" button → modal showing schema graph visualization
- [ ] "Use Template" → creates workflow, navigates to it
- [ ] Show node/edge counts for each template

### 6.3 List View (Data Explorer)
- [x] Node type selector tabs (Sample / Analysis / Hypothesis / etc.)
- [x] Data table with:
  - [ ] Customizable columns based on `listColumns` UI hint
  - [ ] Sortable headers
  - [x] Status chips (colored by state)
  - [ ] Quick actions column (View, Edit, Delete)
- [ ] Filters sidebar:
  - Status (multi-select)
  - Author (multi-select)
  - Tags (multi-select)
  - Date range picker
- [ ] Search: title + selected searchable fields
- [x] Pagination with count ("Showing X of Y nodes")
- [x] Click row → opens Detail Panel

### 6.4 Detail View (Slide-in Panel)

> **Implemented as a slide-in panel from the right**, accessible from any view (list, kanban, semantic views).
> Uses URL params (`?node=<id>`) for shareable links and browser navigation.

- [x] Header:
  - Title (from `titleField`)
  - Status chip with dropdown to transition (validates against schema transitions)
  - Type badge
  - Created/Updated timestamps
  - Author
- [x] Tabs:
  - **Summary**: Read-only display of key fields
  - **Properties**: Editable form generated from schema fields (all field types supported)
  - **Relationships**: Panels by edge type
    - Outgoing edges grouped by edge type
    - Incoming edges grouped by edge type
    - Each panel shows linked node cards with click to navigate
    - [ ] "Create linked" and "Link existing" buttons (deferred)
  - [ ] **Files**: Attachment list (deferred to Phase 2)
  - [ ] **Timeline**: Event feed for this node only (deferred to Phase 2)
- [ ] Sidebar actions (deferred to Phase 2):
  - Quick actions from schema (e.g., "Create Analysis")
  - "View in Graph"
  - "Delete" (with confirmation)
- [x] Panel features:
  - Slide-in animation from right
  - Backdrop click or Escape to close
  - URL-based state for shareable links
  - Click related node → opens that node in panel

### 6.5 Graph View (Graph Explorer)
- [ ] React Flow canvas with:
  - Nodes styled by type (different colors/shapes)
  - Edge labels showing relationship type
  - Status indicated visually (color/border)
- [ ] Controls:
  - Center on selected node
  - Expand 1-hop / 2-hop neighbors
  - Filter by edge type (checkboxes)
  - Filter by node type (checkboxes)
  - Zoom, pan, minimap
- [ ] Click node → side panel shows node preview + "Open Detail" button
- [ ] Entry points:
  - From Detail View: "View in Graph" centers on that node
  - From List View: "Explore Graph" starts with selected nodes
  - Standalone: shows full workflow graph (collapsed clusters for large graphs)

### 6.6 Semantic View Templates (Kanban, Cards, Tree, Timeline, Table, Gantt)

> **Declarative view configurations** that define how to traverse and render subgraphs.

#### Backend
- [x] `ViewTemplate` Pydantic models in `backend/app/models/workflow.py`:
  - `ViewTemplate`, `LevelConfig`, `EdgeTraversal`
  - `KanbanConfig`, `CardsConfig`, `TreeConfig`, `TimelineConfig`, `TableConfig`, `GanttConfig`
  - `CardTemplate`, `ActionConfig`, `FilterConfig`
- [x] `WorkflowDefinition.viewTemplates[]` field added
- [x] `GraphStore.traverse_view_template()` method for subgraph traversal
- [x] `GET /api/v1/workflows/{workflow_id}/views/{view_id}` endpoint
- [x] Materials R&D template updated with 3 view templates:
  - `hypothesis-kanban`: Hypothesis Board by status
  - `sample-pipeline`: Sample Pipeline by status
  - `analysis-pipeline`: Analysis Pipeline by status

#### Frontend
- [x] TypeScript types in `frontend/src/types/view-templates.ts`
- [x] `api.getViewSubgraph()` method in `frontend/src/lib/api.ts`
- [x] `ViewSelector` component - dropdown to switch between views
- [x] `ViewRenderer` component - orchestrator that renders appropriate style
- [x] `KanbanView` component with:
  - [x] Columns grouped by status field
  - [x] Drag-and-drop to transition status
  - [x] Colored column headers from config
  - [x] Node count badges
  - [x] Empty column placeholders
- [x] `NodeCard` component with:
  - [x] Title/subtitle from cardTemplate config
  - [x] Status badge with colors
  - [x] Body fields display
  - [x] Draggable support
- [x] Integration into `/app/workflows/[id]/page.tsx`:
  - [x] View selector in header
  - [x] Conditional rendering of ViewRenderer vs list view

#### View CRUD (Backend)
- [x] `ViewTemplateCreate`, `ViewTemplateUpdate` Pydantic models
- [x] `GraphStore.add_view_template()` - create new view in workflow definition
- [x] `GraphStore.update_view_template()` - update view name/description/icon
- [x] `GraphStore.delete_view_template()` - remove view from workflow definition
- [x] `GraphStore.list_view_templates()` - list all views for a workflow
- [x] API endpoints:
  - [x] `GET /api/v1/workflows/{workflow_id}/views` - list views
  - [x] `POST /api/v1/workflows/{workflow_id}/views` - create view
  - [x] `PUT /api/v1/workflows/{workflow_id}/views/{view_id}` - update view
  - [x] `DELETE /api/v1/workflows/{workflow_id}/views/{view_id}` - delete view

#### LLM View Generation (Backend)
- [x] `ViewGenerator` class in `backend/app/llm/view_generator.py`
- [x] System prompt for generating Kanban view configs from natural language
- [x] Schema context builder (extracts node types, fields, values)
- [x] Validation against workflow schema (rootType, field keys)
- [x] `POST /api/v1/workflows/{workflow_id}/views/generate` endpoint

#### View Management UI (Frontend)
- [x] `ViewTemplateCreate` TypeScript type
- [x] `api.listViews()`, `api.createView()`, `api.updateView()`, `api.deleteView()` methods
- [x] `api.generateView()` method for LLM generation
- [x] `CreateViewModal` - two-step modal: describe → generate → preview → save
- [x] `EditViewModal` - edit view name and description
- [x] `DeleteViewDialog` - confirmation dialog for deletion
- [x] `ViewCard` - display view with name, description, type, style
- [x] `ViewCardGrid` - grid layout with "Create View" card
- [x] Integration into workflow detail page

#### Additional View Styles (Completed)
- [x] CardsView component (grid, list, single, inline-chips layouts)
- [x] TreeView component (expand/collapse, depth lines)
- [x] TimelineView component (date grouping, connectors)
- [x] TableView component (sortable, selectable)
- [x] GanttView component (duration bars, today marker, dependency arrows, grouping)

#### Status Colors Configuration
- [x] `statusColors` field added to `CardTemplate` (backend + frontend)
- [x] `cardTemplate` added to `TreeConfig` and `TimelineConfig`
- [x] `statusColors` added to `TableConfig`
- [x] Components use config colors with hex-to-rgba conversion for badges
- [x] Falls back to hardcoded colors when config not provided

#### Pending (Phase 2-4)
- [ ] Hierarchical edge traversal (multi-level views)
- [ ] Drag-drop validation against allowed transitions
- [ ] Filter bar integration

### 6.7 Shared UI Patterns
- [ ] Loading states (skeletons)
- [ ] Empty states with guidance ("No analyses yet. Create one or generate demo data.")
- [ ] Optimistic updates where safe (status transitions)
- [ ] Toast notifications for actions
- [ ] Consistent color palette for node types and statuses

---

## 7. API Layer (FastAPI)

All endpoints prefixed with `/api/v1`. Pydantic models for request/response validation.

### 7.1 Templates
- [x] `GET /api/v1/templates` - list all templates
- [x] `GET /api/v1/templates/{template_id}` - get template definition

### 7.2 Workflows
- [x] `GET /api/v1/workflows` - list user's workflows
- [x] `POST /api/v1/workflows/from-template` - create from template
- [x] `POST /api/v1/workflows/from-language` - generate schema from natural language (LLM)
- [x] `POST /api/v1/workflows/from-definition` - create workflow from validated definition
- [x] `GET /api/v1/workflows/{workflow_id}` - get workflow with definition

### 7.3 Nodes
- [x] `GET /api/v1/workflows/{workflow_id}/nodes` - query with filters, pagination
- [x] `POST /api/v1/workflows/{workflow_id}/nodes` - create node
- [x] `GET /api/v1/workflows/{workflow_id}/nodes/{node_id}` - get single node
- [x] `PATCH /api/v1/workflows/{workflow_id}/nodes/{node_id}` - update node
- [x] `DELETE /api/v1/workflows/{workflow_id}/nodes/{node_id}` - delete node

### 7.4 Edges
- [x] `POST /api/v1/workflows/{workflow_id}/edges` - create edge
- [x] `DELETE /api/v1/workflows/{workflow_id}/edges/{edge_id}` - delete edge
- [x] `GET /api/v1/workflows/{workflow_id}/nodes/{node_id}/neighbors` - get neighborhood

### 7.5 Views (Semantic View Templates)
- [x] `GET /api/v1/workflows/{workflow_id}/views` - list view templates
- [x] `POST /api/v1/workflows/{workflow_id}/views` - create view template
- [x] `GET /api/v1/workflows/{workflow_id}/views/{view_id}` - get traversed subgraph for view template
- [x] `PUT /api/v1/workflows/{workflow_id}/views/{view_id}` - update view template
- [x] `DELETE /api/v1/workflows/{workflow_id}/views/{view_id}` - delete view template
- [x] `POST /api/v1/workflows/{workflow_id}/views/generate` - generate view from natural language (LLM)

### 7.6 Events
- [x] `GET /api/v1/workflows/{workflow_id}/events` - query events with filters
- [x] `POST /api/v1/workflows/{workflow_id}/events` - create event (automatic on node/edge operations)

### 7.7 Seeding (LLM-Powered)
- [x] `POST /api/v1/workflows/{workflow_id}/seed` - wire up DataGenerator
- [x] `POST /api/v1/workflows/{workflow_id}/reset` - reset workflow data

---

## 8. Acceptance Criteria

### 8.1 Template Library
- [x] Gallery shows 6 diverse workflow templates (Materials R&D, CAPA, ML Lifecycle, Sequencing, Closed-Loop, Equipment Maintenance)
- [x] Each template can be instantiated into a working workflow
- [x] Templates demonstrate that different domains use identical primitives

### 8.2 Schema Generation (LLM)
- [x] Natural language description produces valid WorkflowDefinition
- [x] Generated schemas pass Pydantic validation (with LLM self-correction via retry loop)
- [ ] User can refine/iterate on generated schema (refinement chat not yet implemented)

### 8.3 Data Generation (LLM)
- [x] Seeding produces connected graphs (no orphan nodes)
- [x] Data feels realistic (plausible IDs, dates, parameters)
- [x] Relationships are populated (analyses linked to samples, hypotheses cross-linked)
- [x] Content is coherent (hypotheses reference actual sample names)

### 8.4 UI Views
- [ ] **List View**: Filters work, sorting works, pagination works, click opens detail panel
- [x] **Detail Panel**: Summary/Properties/Relationships tabs, status transitions, click opens related nodes
- [ ] **Graph View**: Nodes render, edges connect, expand/filter controls work, click shows preview
- [x] **Semantic View Templates**: View selector shows available views, switching views works
- [x] **Kanban View**: Cards in correct columns, drag-drop transitions status, colored headers
- [x] **Cards View**: Grid/list/single/chips layouts render correctly
- [x] **Tree View**: Hierarchical display with expand/collapse and depth lines
- [x] **Timeline View**: Date-grouped entries with connectors
- [x] **Table View**: Sortable columns, selectable rows, configurable columns
- [x] **Gantt View**: Duration bars with start/end dates, today marker, grouping, status colors

### 8.5 "Alive" Feel
- [ ] App feels populated and interactive within 30 seconds of starting
- [ ] No "raw JSON" visible in normal use
- [ ] Empty states guide user to generate data or create nodes

---

## 9. Tech Stack

### Backend (Python)
- **FastAPI** - async API framework
- **SQLite** via `aiosqlite` - local persistence, zero setup
- **Pydantic** - request/response validation, WorkflowDefinition schema
- **Anthropic SDK** - Claude API for LLM-powered data generation
- **uv** - fast Python package management

### Backend Code Quality
- **pytest** - testing framework
- **ruff** - linting (fast, replaces flake8/isort)
- **ty** - type checking
- **black** - code formatting

### Frontend (TypeScript)
- **Next.js 14+** - App Router
- **Tailwind CSS + shadcn/ui** - styling and components
- **React Flow** - graph visualization
- **TanStack Query** - data fetching and caching

### Frontend Code Quality
- **Vitest** - testing framework (fast, native ESM)
- **ESLint** - linting with strict config
- **TypeScript** - strict mode enabled
- **Prettier** - code formatting

### Infrastructure
- **Docker Compose** - development and runtime environment (all development happens in containers)
- **Environment**: `ANTHROPIC_API_KEY` required for data generation

---

## 10. File Structure

```
/flowgraph
├── backend/                        # FastAPI application
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                # FastAPI app, CORS, lifespan
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   ├── templates.py       # GET /templates
│   │   │   ├── workflows.py       # CRUD workflows
│   │   │   ├── nodes.py           # CRUD nodes
│   │   │   ├── edges.py           # CRUD edges
│   │   │   └── seeding.py         # seed/reset endpoints
│   │   ├── db/
│   │   │   ├── __init__.py
│   │   │   ├── database.py        # SQLite connection
│   │   │   └── graph_store.py     # GraphStore interface
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   ├── workflow.py        # WorkflowDefinition Pydantic models
│   │   │   ├── node.py
│   │   │   ├── edge.py
│   │   │   └── event.py
│   │   └── llm/
│   │       ├── __init__.py
│   │       ├── client.py          # Anthropic SDK wrapper
│   │       ├── schema_generator.py # NL → WorkflowDefinition
│   │       ├── data_generator.py  # Schema → realistic instance data
│   │       └── view_generator.py  # NL → ViewTemplate
│   ├── templates/                 # Built-in workflow JSON files
│   │   ├── materials-rnd.workflow.json
│   │   ├── capa.workflow.json
│   │   ├── ml-lifecycle.workflow.json
│   │   ├── sequencing.workflow.json
│   │   ├── closed-loop.workflow.json
│   │   └── equipment-maintenance.workflow.json
│   ├── tests/                     # pytest tests
│   │   ├── conftest.py
│   │   ├── test_api/
│   │   └── test_llm/
│   ├── Dockerfile
│   ├── pyproject.toml             # uv deps + tool config (ruff, black, pytest)
│   └── py.typed                   # PEP 561 marker
├── frontend/                       # Next.js application
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx           # Home / workflow list
│   │   │   ├── templates/         # Template gallery
│   │   │   └── workflows/[id]/    # Workflow views
│   │   │       ├── page.tsx       # Redirect to list
│   │   │       ├── list/
│   │   │       ├── detail/[nodeId]/
│   │   │       ├── graph/
│   │   │       └── board/
│   │   ├── components/
│   │   │   ├── ui/               # shadcn components
│   │   │   ├── layout/           # App shell, sidebar
│   │   │   ├── views/            # Semantic view components
│   │   │   │   ├── ViewSelector.tsx
│   │   │   │   ├── ViewRenderer.tsx
│   │   │   │   ├── ViewCard.tsx        # View template card display
│   │   │   │   ├── ViewCardGrid.tsx    # Grid of view cards
│   │   │   │   ├── CreateViewModal.tsx # LLM-powered view creation
│   │   │   │   ├── EditViewModal.tsx   # Edit view name/description
│   │   │   │   ├── DeleteViewDialog.tsx # Delete confirmation
│   │   │   │   ├── styles/       # KanbanView, CardsView, TreeView, etc.
│   │   │   │   └── cards/        # NodeCard, StatusBadge
│   │   │   ├── node-detail/      # Slide-in detail panel
│   │   │   │   ├── NodeDetailPanel.tsx   # Main panel with tabs
│   │   │   │   ├── NodeDetailHeader.tsx  # Header with status dropdown
│   │   │   │   ├── StatusDropdown.tsx    # Status transition dropdown
│   │   │   │   ├── RelationshipCard.tsx  # Card for linked nodes
│   │   │   │   └── tabs/
│   │   │   │       ├── SummaryTab.tsx    # Read-only field display
│   │   │   │       ├── PropertiesTab.tsx # Editable form
│   │   │   │       └── RelationshipsTab.tsx # Neighbor cards
│   │   │   ├── list-view/
│   │   │   ├── detail-view/
│   │   │   └── graph-view/
│   │   ├── lib/
│   │   │   ├── api.ts            # API client
│   │   │   └── utils.ts
│   │   └── types/
│   │       ├── workflow.ts       # TypeScript types (mirror Pydantic)
│   │       └── view-templates.ts # ViewTemplate types for semantic views
│   ├── __tests__/                # Vitest tests
│   │   ├── components/
│   │   └── lib/
│   ├── Dockerfile
│   ├── next.config.js            # API proxy to backend
│   ├── tailwind.config.js
│   ├── tsconfig.json             # TypeScript strict mode
│   ├── vitest.config.ts
│   ├── eslint.config.js          # ESLint flat config
│   ├── prettier.config.js
│   └── package.json
├── docker-compose.yml             # Run full stack
├── .env.example                   # Environment template
├── data/
│   └── workflow.db                # SQLite database (created at runtime)
├── CLAUDE.md
├── SPEC.md
└── TODO-PHASE1.md
```

---

## 11. Priority Order

1. **Foundation** (Sections 1-2): Data model, types, GraphStore interface
2. **LLM Integration** (Sections 4-5): Schema + data generation via Claude
3. **Templates** (Section 3): Build 5 templates to prove "same primitives" story
4. **UI - List & Detail** (6.3, 6.4): Core navigation and exploration
5. **UI - Graph** (6.5): The visual "wow"
6. **UI - Kanban** (6.6): Interactive status management
7. **Docker Compose**: Package for easy `docker-compose up`
8. **Polish** (6.7): Loading states, empty states, toasts

---

**End of TODO-PHASE1.md**
