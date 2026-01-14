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
- **Anthropic SDK** - Claude API for data generation
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

```bash
# Run full stack
docker-compose up              # start all services
docker-compose up --build      # rebuild and start
docker-compose down            # stop all services
docker-compose logs -f backend # tail backend logs

# Backend development (in container)
docker-compose exec backend uv run pytest        # run tests
docker-compose exec backend uv add <package>     # add dependency
docker-compose exec backend uv run alembic ...   # run migrations

# Frontend development (in container)
docker-compose exec frontend npm run lint        # lint code
docker-compose exec frontend npm test            # run tests
```

## Environment Variables

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-...    # Claude API key for data generation

# Optional
DATABASE_PATH=./data/workflow.db  # SQLite database location
LOG_LEVEL=info                    # Logging verbosity
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
GET    /api/v1/workflows/{id}
GET    /api/v1/workflows/{id}/nodes
POST   /api/v1/workflows/{id}/nodes
GET    /api/v1/workflows/{id}/nodes/{node_id}
PATCH  /api/v1/workflows/{id}/nodes/{node_id}
GET    /api/v1/workflows/{id}/nodes/{node_id}/neighbors
POST   /api/v1/workflows/{id}/edges
POST   /api/v1/workflows/{id}/seed
POST   /api/v1/workflows/{id}/reset
```

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
| **pytest** | Testing | `docker-compose exec backend uv run pytest` |
| **ruff** | Linting | `docker-compose exec backend uv run ruff check .` |
| **ty** | Type checking | `docker-compose exec backend uv run ty check` |
| **black** | Formatting | `docker-compose exec backend uv run black .` |

```bash
# Run all checks
docker-compose exec backend uv run ruff check . && uv run ty check && uv run pytest

# Auto-fix linting issues
docker-compose exec backend uv run ruff check --fix .
```

### Frontend (TypeScript)
| Tool | Purpose | Command |
|------|---------|---------|
| **Vitest** | Testing | `docker-compose exec frontend npm test` |
| **ESLint** | Linting | `docker-compose exec frontend npm run lint` |
| **TypeScript** | Type checking (strict mode) | `docker-compose exec frontend npm run typecheck` |
| **Prettier** | Formatting | `docker-compose exec frontend npm run format` |

```bash
# Run all checks
docker-compose exec frontend npm run lint && npm run typecheck && npm test

# Auto-fix formatting
docker-compose exec frontend npm run format:fix
```

### Pre-commit
All checks run automatically on commit via pre-commit hooks configured in the containers.

## Phase 1 Focus

1. **Template Library**: 5 diverse workflows using identical primitives
2. **LLM Schema Generation**: Natural language → WorkflowDefinition via Claude
3. **LLM Data Generation**: Schema-aware, coherent, realistic instance data via Claude
4. **Four UI Views**: List, Detail, Graph (React Flow), Kanban
5. **"Alive" Feel**: App feels populated immediately after seeding
