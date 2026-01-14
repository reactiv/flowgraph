# Phase 1: Core Demo - TODO

> **Goal:** Demonstrate "any workflow is just a graph" by shipping a library of diverse workflow templates, realistic seeded data, and four polished UI views (graph, list, detail, kanban).

---

## 1. Foundation: Data Model & Storage

### 1.1 Core Schema (SQLite)
- [ ] Create `workflow_definitions` table (id, name, version, definition_json, timestamps)
- [ ] Create `nodes` table (id, workflow_id, type, title, status, properties_json, timestamps)
- [ ] Create `edges` table (id, workflow_id, type, from_node_id, to_node_id, properties_json, timestamps)
- [ ] Create `events` table (id, workflow_id, subject_node_id, event_type, payload_json, created_at)
- [ ] Add indexes for snappy queries:
  - `nodes(workflow_id, type, status, updated_at)`
  - `edges(workflow_id, from_node_id, type)`
  - `edges(workflow_id, to_node_id, type)`
  - `events(workflow_id, subject_node_id, created_at)`

### 1.2 GraphStore Interface
- [ ] `createWorkflow(definition)` / `listWorkflows()` / `getWorkflow(id)`
- [ ] `createNode(node)` / `getNode(id)` / `updateNode(id, patch)` / `queryNodes(filters, pagination)`
- [ ] `createEdge(edge)` / `getNeighbors(nodeId, { depth, edgeTypes })`
- [ ] `appendEvent(event)` / `getEvents(filters)`
- [ ] `resetAndSeed(workflowId, recipe)`

---

## 2. Workflow Definition Schema

### 2.1 Pydantic Models (Backend) + TypeScript Types (Frontend)
- [ ] `WorkflowDefinition` model with:
  - `workflowId`, `name`, `description`
  - `nodeTypes[]` with fields, states, UI hints
  - `edgeTypes[]` with from/to constraints
  - `rules[]` (optional constraints)
- [ ] `FieldKind` enum: `string`, `number`, `datetime`, `enum`, `person`, `json`, `tag[]`, `file[]`
- [ ] `NodeState` machine: `enabled`, `initial`, `values[]`, `transitions[]`
- [ ] Pydantic validators for definitions (backend), Zod schemas (frontend)

### 2.2 UI Hints (First-Class)
- [ ] `titleField`, `subtitleField` per node type
- [ ] `defaultViews[]`: which views are enabled (list, detail, graph, kanban)
- [ ] `listColumns[]`: recommended columns for list view
- [ ] `quickActions[]`: e.g., "Create Analysis", "Link Hypothesis"

---

## 3. Template Library (Diverse Workflows, Same Primitives)

> **Key demo point:** All these wildly different domains use the same node/edge/event primitives.

### 3.1 Primary Template: Materials R&D (from spec)
- [ ] **Sample** node type
  - Fields: sample_id (unique), nickname, author, date, sample_type (enum), details (json), tags
  - States: Draft → In Progress → Complete → Archived
- [ ] **Analysis** node type
  - Fields: result_id, analysis_type (enum: TGA, PXRD, SEM, etc.), author, date, parameters (json), files
  - States: Pending → Running → Complete → Failed
- [ ] **Hypothesis** node type
  - Fields: nickname, author, statements, status (Proposed/Active/Validated/Rejected)
- [ ] **Tag** node type (optional, can be inline array)
- [ ] Edge types: `HAS_ANALYSIS`, `LINKED_TO_HYPOTHESIS`, `TAGGED_WITH`, `PARENT_OF`
- [ ] Rule: Sample requires ≥1 Analysis before Complete

### 3.2 Template: CAPA / Investigation
- [ ] **Nonconformance** → **Investigation** → **RootCause** → **CorrectiveAction** → **Verification**
- [ ] Edge types: `TRIGGERS`, `IDENTIFIES`, `PRODUCES`, `VERIFIED_BY`
- [ ] States: Open → Under Investigation → Pending Action → Closed
- [ ] Rule: Cannot close Nonconformance until ≥1 Action is Verified

### 3.3 Template: ML Lifecycle
- [ ] **Dataset** → **FeatureSet** → **TrainingRun** → **Model** → **Evaluation** → **Deployment**
- [ ] Fields: metrics (json), hyperparameters, accuracy, model_artifact_path
- [ ] States per node type (e.g., Model: Training → Validated → Deployed → Deprecated)

### 3.4 Template: Sequencing Provenance
- [ ] **BioSample** → **LibraryPrep** → **SequencingRun** → **RawData** → **Analysis** → **QCReport**
- [ ] Fields: concentration, read_count, quality_score, contamination_check
- [ ] Edge types: `PREPARED_FROM`, `SEQUENCED_IN`, `ANALYZED_BY`

### 3.5 Template: Closed-Loop Optimization
- [ ] **Goal** → **Hypothesis** → **ExperimentPlan** → **Sample** → **Measurement** → **Model** → **Recommendation**
- [ ] Circular edge back: `INFORMS_GOAL`
- [ ] Shows iterative scientific loops

### 3.6 Template Storage
- [ ] Store templates as JSON in `/templates/*.workflow.json`
- [ ] API: `GET /api/templates` returns template list
- [ ] API: `POST /api/workflows/from-template` creates workflow from template

---

## 4. LLM-Powered Schema Generation (Natural Language → Workflow)

> Users describe their workflow in plain English, Claude generates a complete WorkflowDefinition.

### 4.1 "Describe Your Workflow" UI
- [ ] Text area for natural language description
- [ ] Example prompts/suggestions to guide users
- [ ] Optional toggles: "Include states", "Include tags", "Scientific terminology"
- [ ] Live preview of generated schema (graph visualization)
- [ ] "Apply" button to create workflow from generated schema

### 4.2 LLM Schema Generation
- [ ] System prompt with:
  - WorkflowDefinition JSON schema (strict structure)
  - Examples of well-formed definitions
  - Domain hints based on detected terminology
- [ ] Extract from natural language:
  - Node types (entities mentioned)
  - Fields per node type (attributes described)
  - Edge types (relationships between entities)
  - State machines (status progressions mentioned)
  - UI hints (inferred from context)
- [ ] Structured output via Claude's JSON mode / tool use

### 4.3 Validation & Auto-Fix
- [ ] Pydantic validation on generated schema
- [ ] Auto-fix layer (non-LLM):
  - Normalize names to snake_case / PascalCase
  - Add missing required fields (createdAt, updatedAt)
  - Infer titleField if not specified
  - Ensure edge endpoints reference valid node types
- [ ] Return validation errors to user for ambiguous cases

### 4.4 Refinement Chat
- [ ] After initial generation, allow iterative refinement:
  - "Add a 'priority' field to Tasks"
  - "Rename 'Item' to 'Sample'"
  - "Add a relationship from Analysis to Report"
- [ ] Each refinement regenerates/patches the schema

### 4.5 API Endpoint
- [ ] `POST /api/v1/workflows/from-language`
  - Request: `{ "description": "...", "options": {...} }`
  - Response: `{ "definition": WorkflowDefinition, "validation": [...] }`

---

## 5. LLM-Powered Data Generation (Anthropic Claude)

> Data generation via Claude API produces realistic, coherent, domain-aware content that feels like real scientific data.

### 5.1 Generation Strategy
- [ ] Two-phase generation:
  1. **Graph structure**: Generate node/edge skeleton with IDs and relationships
  2. **Content population**: LLM fills in realistic field values with full context
- [ ] Scales: Small (20 nodes), Medium (100 nodes), Large (500 nodes)
- [ ] Batch generation to minimize API calls (generate multiple nodes per request)

### 5.2 LLM Prompt Design
- [ ] System prompt includes:
  - Workflow definition (node types, fields, constraints)
  - Domain context (e.g., "materials science R&D lab")
  - Existing nodes for reference (maintains coherence)
- [ ] Structured output via tool use / JSON mode
- [ ] Schema validation on all LLM responses

### 5.3 Content Quality Requirements
- [ ] Domain-realistic values:
  - Scientific IDs: "SMP-2024-0142", "PXRD-A-0891"
  - Plausible parameters: `{ "2theta_range": "5-80°", "step_size": "0.02°" }`
  - Realistic author names from a consistent "team roster"
- [ ] Coherent timelines (analyses dated after sample creation)
- [ ] Cross-references: Hypotheses mention specific sample nicknames
- [ ] Realistic status distributions (not all Complete)

### 5.4 Cohesion Features
- [ ] LLM sees previously generated nodes when creating new ones
- [ ] Hypotheses reference specific samples and analyses by name
- [ ] Tags cluster meaningfully (related samples share tags)
- [ ] Summaries synthesize information from linked nodes

### 5.5 API Integration
- [ ] Anthropic SDK (`anthropic` Python package)
- [ ] Use Claude 3.5 Sonnet for speed/cost balance
- [ ] Implement retry logic with exponential backoff
- [ ] Cache generated content to avoid re-generation on reset

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
- [ ] Node type selector tabs (Sample / Analysis / Hypothesis / etc.)
- [ ] Data table with:
  - Customizable columns based on `listColumns` UI hint
  - Sortable headers
  - Status chips (colored by state)
  - Quick actions column (View, Edit, Delete)
- [ ] Filters sidebar:
  - Status (multi-select)
  - Author (multi-select)
  - Tags (multi-select)
  - Date range picker
- [ ] Search: title + selected searchable fields
- [ ] Pagination with count ("Showing 1-25 of 147 Samples")
- [ ] Click row → navigates to Detail View

### 6.4 Detail View (Node Page)
- [ ] Header:
  - Title (from `titleField`)
  - Status chip with dropdown to transition
  - Type badge
  - Created/Updated timestamps
  - Author
- [ ] Tabs:
  - **Summary**: Auto-generated or editable text summary
  - **Properties**: Form generated from schema fields (grouped, ordered)
  - **Relationships**: Panels by edge type
    - Outgoing edges (e.g., "Analyses" for a Sample)
    - Incoming edges (e.g., "Parent Sample")
    - Each panel shows linked node cards with quick view
    - "Create linked" and "Link existing" buttons
  - **Files**: Attachment list (metadata only for Phase 1)
  - **Timeline**: Event feed for this node only
- [ ] Sidebar actions:
  - Quick actions from schema (e.g., "Create Analysis")
  - "View in Graph"
  - "Delete" (with confirmation)

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

### 6.6 Kanban View (Board)
- [ ] Column per status value (from state machine)
- [ ] Cards showing:
  - Title
  - Subtitle (if configured)
  - Key metadata (author, date)
  - Tag chips
- [ ] Drag-and-drop to transition status:
  - Validate against allowed transitions
  - Show error if transition not allowed
  - Create status_changed event on success
- [ ] Filter bar: by tag, author, date range
- [ ] Node type selector (one Kanban per node type with states)
- [ ] Optional: Swimlanes by tag or author

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
- [ ] `GET /api/v1/templates` - list all templates
- [ ] `GET /api/v1/templates/{template_id}` - get template definition

### 7.2 Workflows
- [ ] `GET /api/v1/workflows` - list user's workflows
- [ ] `POST /api/v1/workflows/from-template` - create from template
- [ ] `POST /api/v1/workflows/from-language` - create from natural language (LLM)
- [ ] `GET /api/v1/workflows/{workflow_id}` - get workflow with definition

### 7.3 Nodes
- [ ] `GET /api/v1/workflows/{workflow_id}/nodes` - query with filters, pagination
- [ ] `POST /api/v1/workflows/{workflow_id}/nodes` - create node
- [ ] `GET /api/v1/workflows/{workflow_id}/nodes/{node_id}` - get single node
- [ ] `PATCH /api/v1/workflows/{workflow_id}/nodes/{node_id}` - update node
- [ ] `DELETE /api/v1/workflows/{workflow_id}/nodes/{node_id}` - delete node

### 7.4 Edges
- [ ] `POST /api/v1/workflows/{workflow_id}/edges` - create edge
- [ ] `DELETE /api/v1/workflows/{workflow_id}/edges/{edge_id}` - delete edge
- [ ] `GET /api/v1/workflows/{workflow_id}/nodes/{node_id}/neighbors` - get neighborhood

### 7.5 Events
- [ ] `GET /api/v1/workflows/{workflow_id}/events` - query events with filters
- [ ] `POST /api/v1/workflows/{workflow_id}/events` - create event (usually automatic)

### 7.6 Seeding (LLM-Powered)
- [ ] `POST /api/v1/workflows/{workflow_id}/seed` - generate demo data via Claude
- [ ] `POST /api/v1/workflows/{workflow_id}/reset` - reset workflow data

---

## 8. Acceptance Criteria

### 8.1 Template Library
- [ ] Gallery shows 5 diverse workflow templates
- [ ] Each template can be instantiated into a working workflow
- [ ] Templates demonstrate that different domains use identical primitives

### 8.2 Schema Generation (LLM)
- [ ] Natural language description produces valid WorkflowDefinition
- [ ] Generated schemas pass Pydantic validation
- [ ] User can refine/iterate on generated schema

### 8.3 Data Generation (LLM)
- [ ] Seeding produces connected graphs (no orphan nodes)
- [ ] Data feels realistic (plausible IDs, dates, parameters)
- [ ] Relationships are populated (analyses linked to samples, hypotheses cross-linked)
- [ ] Content is coherent (hypotheses reference actual sample names)

### 8.4 UI Views
- [ ] **List View**: Filters work, sorting works, pagination works, click navigates to detail
- [ ] **Detail View**: All tabs populated, relationships show linked nodes, status transition works
- [ ] **Graph View**: Nodes render, edges connect, expand/filter controls work, click shows preview
- [ ] **Kanban View**: Cards in correct columns, drag-drop transitions status, events logged

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
│   │       └── data_generator.py  # Schema → realistic instance data
│   ├── templates/                 # Built-in workflow JSON files
│   │   ├── materials_rnd.workflow.json
│   │   ├── capa.workflow.json
│   │   ├── ml_lifecycle.workflow.json
│   │   ├── sequencing.workflow.json
│   │   └── closed_loop.workflow.json
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
│   │   │   ├── list-view/
│   │   │   ├── detail-view/
│   │   │   ├── graph-view/
│   │   │   └── kanban-view/
│   │   ├── lib/
│   │   │   ├── api.ts            # API client
│   │   │   └── utils.ts
│   │   └── types/
│   │       └── workflow.ts       # TypeScript types (mirror Pydantic)
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
