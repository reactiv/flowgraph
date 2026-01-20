# Workflow Graph Studio

A prototype demonstrating "any workflow is just a graph" - turn workflow templates into working apps with realistic data and polished UI.

## Project Structure

```
/flowgraph
├── backend/                    # FastAPI app
│   ├── app/
│   │   ├── main.py           # FastAPI app entry
│   │   ├── api/              # Route handlers
│   │   ├── db/               # SQLite + GraphStore
│   │   ├── models/           # Pydantic models
│   │   ├── schema/           # WorkflowDefinition validation
│   │   └── llm/              # LLM integration (schema + data generation)
│   │       └── transformer/  # Agentic data transformer (Claude Agent SDK)
│   ├── .claude/skills/       # Agent skills for transformer
│   │   ├── notion/           # Notion database/page reading
│   │   ├── google-drive/     # Google Drive file access
│   │   ├── xlsx/             # Excel spreadsheet handling
│   │   └── docx/             # Word document handling
│   ├── templates/            # Built-in workflow JSON templates
│   ├── tests/                # pytest tests
│   ├── Dockerfile
│   └── pyproject.toml        # uv deps + ruff/black/pytest config
├── frontend/                   # Next.js app
│   ├── src/
│   │   ├── app/              # App router pages
│   │   ├── components/       # React components
│   │   ├── lib/              # Client utilities
│   │   └── types/            # TypeScript types
│   ├── __tests__/            # Vitest tests
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml          # Run full stack
├── scripts/
│   └── dc                      # docker-compose wrapper for worktrees
├── data/                       # Runtime data (mounted volume)
│   └── workflow.db
├── CLAUDE.md
├── SPEC.md
└── TODO-PHASE1.md
```

## Tech Stack

### Backend (Python)
- **FastAPI** - API framework
- **SQLite** via `aiosqlite` - local persistence
- **Pydantic** - data validation and models
- **Anthropic SDK** - Claude API for schema/scenario generation
- **Claude Agent SDK** - Agentic data transformation with tool use
- **Google GenAI SDK** - Gemini 3.0 Flash for fast content generation
- **uv** - Python package management
- **pytest** / **ruff** / **ty** / **black** - testing, linting, types, formatting

### Frontend (TypeScript)
- **Next.js 14+** - React framework with App Router
- **Tailwind CSS** - styling
- **shadcn/ui** - component library
- **React Flow** - graph visualization
- **TanStack Query** - data fetching and caching
- **Vitest** / **ESLint** / **Prettier** - testing, linting, formatting

### Infrastructure
- **Docker Compose** - development and runtime environment

## Core Concepts

### Two Graphs, One Product
1. **Schema Graph (Workflow Definition)**: node types, edge types, fields, states, rules, UI hints
2. **Instance Graph (Workflow Data)**: node instances, edge instances, events

### Data Model
- **Node**: `{ id, workflow_id, type, title, status, properties, created_at, updated_at }`
- **Edge**: `{ id, workflow_id, type, from_node_id, to_node_id, properties, created_at }`
- **Event**: `{ id, workflow_id, subject_node_id, event_type, payload, created_at }`

### Field Kinds
`string`, `number`, `datetime`, `enum`, `person`, `json`, `tag[]`, `file[]`

## Key Commands

Use `./scripts/dc` instead of `docker-compose` - it's a thin wrapper that handles unique project names and ports for multi-worktree environments.

```bash
# Run full stack
./scripts/dc up -d             # start all services (detached)
./scripts/dc up --build        # rebuild and start
./scripts/dc down              # stop all services (IMPORTANT: always do this when done!)
./scripts/dc logs -f backend   # tail backend logs

# Backend development (in container)
./scripts/dc exec -T backend uv run pytest        # run tests
./scripts/dc exec -T backend uv run ruff check .  # lint
./scripts/dc exec -T backend uv add <package>     # add dependency

# Frontend development (in container)
./scripts/dc exec -T frontend npm run lint        # lint code
./scripts/dc exec -T frontend npm run typecheck   # type check
./scripts/dc exec -T frontend npm test            # run tests
```

### Port Mapping

| Environment | Backend Port | Frontend Port |
|-------------|--------------|---------------|
| Default (no CONDUCTOR_PORT) | 8000 | 3000 |
| Worktree (CONDUCTOR_PORT set) | $CONDUCTOR_PORT | $CONDUCTOR_PORT + 1 |

### Agentic Data Transformer CLI

The transformer CLI uses Claude Agent SDK to transform files into validated Pydantic outputs.

```bash
# Mount custom input directory (optional)
TRANSFORMER_INPUT=/path/to/input ./scripts/dc up -d

# Direct mode - agent writes output directly (small outputs, < ~100 records)
./scripts/dc exec -T backend uv run python -m app.llm.transformer.cli \
    --input /app/transformer_input \
    --instruction "Transform instruction here" \
    --model-import "app.models.workflow:WorkflowDefinition" \
    --format json

# Code mode - agent writes Python script (large outputs)
./scripts/dc exec -T backend uv run python -m app.llm.transformer.cli \
    --input /app/transformer_input \
    --instruction "Transform instruction here" \
    --model-import "app.llm.transformer.seed_models:SeedData" \
    --mode code \
    --format json
```

| Option | Description |
|--------|-------------|
| `--input, -i` | Path to input file or directory |
| `--instruction` | Natural language transformation instruction |
| `--model, -m` | Inline model spec: `"name:str,age:int"` |
| `--model-import, -M` | Import model: `"module:Class"` |
| `--mode` | `direct` (default) or `code` |
| `--format, -f` | `json` (single object) or `jsonl` (records) |
| `--max-turns` | Max agent iterations (default: 80) |

## Environment Variables

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-...    # Claude API key for schema/scenario generation

# Optional but recommended
GOOGLE_API_KEY=...              # Gemini 3.0 Flash for fast content generation (falls back to Claude if not set)

# Optional
DATABASE_PATH=./data/workflow.db  # SQLite database location
LOG_LEVEL=info                    # Logging verbosity

# Notion integration (for transformer skills)
NOTION_TOKEN=secret_...         # Notion integration token (from notion.so/my-integrations)

# Google Drive integration (for transformer skills)
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json  # Service account credentials
```

## API Conventions

- All endpoints prefixed with `/api/v1`
- JSON request/response bodies
- Pydantic models for validation
- Standard error responses: `{ "detail": "error message" }`

### Key Endpoints
```
GET    /api/v1/templates
POST   /api/v1/workflows/from-template
POST   /api/v1/workflows/from-language      # LLM schema + view generation
POST   /api/v1/workflows/from-definition    # Create from validated definition
GET    /api/v1/workflows/{id}
GET    /api/v1/workflows/{id}/nodes
POST   /api/v1/workflows/{id}/nodes
GET    /api/v1/workflows/{id}/nodes/{node_id}
PATCH  /api/v1/workflows/{id}/nodes/{node_id}
GET    /api/v1/workflows/{id}/nodes/{node_id}/neighbors
GET    /api/v1/workflows/{id}/edges             # List edges (for Graph View)
POST   /api/v1/workflows/{id}/edges
POST   /api/v1/workflows/{id}/seed          # LLM data generation (long-running)
POST   /api/v1/workflows/{id}/reset
GET    /api/v1/workflows/{id}/views
POST   /api/v1/workflows/{id}/views/generate # LLM view generation
```

### Create Workflow Flow
The `/api/v1/workflows/from-language` endpoint returns:
- `definition`: Generated WorkflowDefinition schema
- `validation`: Validation results (errors, warnings, fixes)
- `view_templates`: LLM-generated view templates (3-6 diverse views based on prompt + schema)

The create page allows users to:
1. Describe workflow in natural language
2. Preview generated schema graph and view templates
3. Select demo data scale (small/medium/large)
4. Create workflow with auto-seeding

## Development Guidelines

- **All development happens in Docker containers** - no local Python/Node setup
- Backend and frontend run as separate services via docker-compose
- Frontend proxies API calls to backend (configure in `next.config.js`)
- SQLite database lives in `/data/workflow.db` (mounted volume)
- Templates stored as JSON in `/backend/templates/*.workflow.json`
- Use `uv` for all Python package management (not pip)

## Code Quality

### Backend (Python)
| Tool | Purpose | Command |
|------|---------|---------|
| **pytest** | Testing | `./scripts/dc exec -T backend uv run pytest` |
| **ruff** | Linting | `./scripts/dc exec -T backend uv run ruff check .` |
| **ty** | Type checking | `./scripts/dc exec -T backend uv run ty check` |
| **black** | Formatting | `./scripts/dc exec -T backend uv run black .` |

```bash
# Run all checks
./scripts/dc exec -T backend sh -c "uv run ruff check . && uv run ty check && uv run pytest"

# Auto-fix linting issues
./scripts/dc exec -T backend uv run ruff check --fix .
```

### Frontend (TypeScript)
| Tool | Purpose | Command |
|------|---------|---------|
| **Vitest** | Testing | `./scripts/dc exec -T frontend npm test` |
| **ESLint** | Linting | `./scripts/dc exec -T frontend npm run lint` |
| **TypeScript** | Type checking (strict mode) | `./scripts/dc exec -T frontend npm run typecheck` |
| **Prettier** | Formatting | `./scripts/dc exec -T frontend npm run format` |

```bash
# Run all checks
./scripts/dc exec -T frontend sh -c "npm run lint && npm run typecheck && npm test"

# Auto-fix formatting
./scripts/dc exec -T frontend npm run format:fix
```

### Pre-commit
All checks run automatically on commit via pre-commit hooks configured in the containers.

## Git Workflow

### Commit After Completing TODOs
- **Commit after each completed TODO item** - don't batch multiple unrelated changes
- **Commit after completing a logical unit of work** - a feature, bugfix, or refactor
- **Run tests and linting before committing** - ensure the codebase stays green
- **Never commit broken code** - if tests fail, fix before committing

### Commit Message Guidelines
- Use imperative mood: "Add feature" not "Added feature"
- First line: concise summary (50 chars or less)
- Reference TODO items or issues when relevant

### When to Commit
| Scenario | Action |
|----------|--------|
| Completed a TODO item | Commit immediately |
| Added a new file or module | Commit with related changes |
| Fixed a bug | Commit the fix alone |
| Refactored code | Commit refactor separately from features |
| Made multiple unrelated changes | Split into separate commits |

### Atomic Commits
Keep commits focused and reversible:
- One logical change per commit
- Avoid mixing formatting changes with functional changes
- If you need to say "and" in your commit message, consider splitting

## Phase 1 Focus

1. **Template Library**: 5 diverse workflows using identical primitives
2. **LLM Schema Generation**: Natural language → WorkflowDefinition via Claude
3. **LLM Data Generation**: Schema-aware, coherent, realistic instance data via Claude
4. **Four UI Views**: List, Detail, Graph (React Flow), Kanban
5. **"Alive" Feel**: App feels populated immediately after seeding
