---
name: workflow-commands
description: Learnable patterns for workflow CRUD operations (create nodes, update nodes, create edges). Use this skill to generate repeatable data transformation commands for the workflow API.
---

# Workflow Command Patterns

This skill provides learnable patterns for common workflow operations. Each pattern can be used as a template for generating repeatable transformer skills.

## Core API Endpoints

| Operation | Method | Endpoint | Body |
|-----------|--------|----------|------|
| Create Node | POST | `/api/v1/workflows/{workflow_id}/nodes` | `NodeCreate` |
| Update Node | PATCH | `/api/v1/workflows/{workflow_id}/nodes/{node_id}` | `NodeUpdate` |
| Create Edge | POST | `/api/v1/workflows/{workflow_id}/edges` | `EdgeCreate` |

## Data Models

### NodeCreate

```python
from pydantic import BaseModel, Field
from typing import Any

class NodeCreate(BaseModel):
    """Request model for creating a node."""
    type: str                                    # Node type (e.g., "Task", "Sample")
    title: str                                   # Display title
    status: str | None = None                    # Initial status
    properties: dict[str, Any] = Field(default_factory=dict)  # Custom fields
```

### NodeUpdate

```python
class NodeUpdate(BaseModel):
    """Request model for updating a node."""
    title: str | None = None                     # New title (optional)
    status: str | None = None                    # New status (optional)
    properties: dict[str, Any] | None = None     # Updated properties (optional)
```

### EdgeCreate

```python
class EdgeCreate(BaseModel):
    """Request model for creating an edge."""
    type: str              # Edge type (e.g., "ASSIGNED_TO", "BELONGS_TO")
    from_node_id: str      # Source node ID
    to_node_id: str        # Target node ID
    properties: dict[str, Any] = Field(default_factory=dict)  # Edge properties
```

## Pattern: Batch Node Creation

Transform input data into multiple NodeCreate payloads.

### Input Format

CSV, JSON, or other tabular data with fields mapping to node properties.

### Transform Script Pattern

```python
#!/usr/bin/env python3
"""Transform input data into NodeCreate payloads for batch insertion."""

import csv
import json
from pathlib import Path

def transform():
    """Main transformation function."""
    # Read input data
    input_file = Path("input.csv")

    # Output as JSONL for streaming insert
    with open("output.jsonl", "w") as out:
        with open(input_file) as f:
            reader = csv.DictReader(f)
            for row in reader:
                node = {
                    "type": "Task",  # Adjust based on workflow schema
                    "title": row["name"],
                    "status": row.get("status", "pending"),
                    "properties": {
                        "description": row.get("description", ""),
                        "priority": row.get("priority", "medium"),
                        # Map additional fields from CSV columns
                    }
                }
                out.write(json.dumps(node) + "\n")

if __name__ == "__main__":
    transform()
```

### Validation

Output is validated against the NodeCreate schema before API calls.

## Pattern: Node Status Updates

Transform input with node IDs and new status values.

### Input Format

JSON array with `node_id` and `new_status` fields.

### Transform Script Pattern

```python
#!/usr/bin/env python3
"""Transform status update requests into NodeUpdate payloads."""

import json
from pathlib import Path

def transform():
    """Main transformation function."""
    with open("updates.json") as f:
        updates = json.load(f)

    with open("output.jsonl", "w") as out:
        for update in updates:
            payload = {
                "node_id": update["node_id"],  # Used for routing
                "update": {
                    "status": update["new_status"]
                }
            }
            out.write(json.dumps(payload) + "\n")

if __name__ == "__main__":
    transform()
```

## Pattern: Bulk Property Updates

Update specific properties across multiple nodes.

### Transform Script Pattern

```python
#!/usr/bin/env python3
"""Update properties on nodes matching criteria."""

import json
from pathlib import Path

def transform():
    """Main transformation function."""
    with open("property_updates.json") as f:
        updates = json.load(f)

    with open("output.jsonl", "w") as out:
        for update in updates:
            payload = {
                "node_id": update["node_id"],
                "update": {
                    "properties": update["properties"]
                }
            }
            out.write(json.dumps(payload) + "\n")

if __name__ == "__main__":
    transform()
```

## Pattern: Edge Creation with Node Lookup

Create edges between nodes, resolving references.

### Transform Script Pattern

```python
#!/usr/bin/env python3
"""Create edges between nodes based on relationship data."""

import json
from pathlib import Path

def transform():
    """Main transformation function."""
    with open("relationships.json") as f:
        relationships = json.load(f)

    with open("output.jsonl", "w") as out:
        for rel in relationships:
            edge = {
                "type": rel["edge_type"],
                "from_node_id": rel["from_id"],
                "to_node_id": rel["to_id"],
                "properties": rel.get("properties", {})
            }
            out.write(json.dumps(edge) + "\n")

if __name__ == "__main__":
    transform()
```

## Making Commands Learnable

To make a transformer command learnable, add the `--learn` flag:

```bash
./scripts/dc exec -T backend uv run python -m app.llm.transformer.cli \
    --input /path/to/input \
    --instruction "Create Task nodes from CSV with name, description, priority" \
    --model-import "app.models.node:NodeCreate" \
    --mode code \
    --format jsonl \
    --learn \
    --skill-name "csv-to-tasks" \
    --skill-description "Transform CSV files into Task nodes"
```

This generates:
1. `SKILL.md` - Markdown documentation for the skill
2. `transform.py` - The validated transformation script

The generated skill can then be used to quickly repeat the same transformation pattern.

## Example: Complete Learnable Pipeline

### Step 1: Initial Transformation

```bash
# First run generates and validates the transformer
./scripts/dc exec -T backend uv run python -m app.llm.transformer.cli \
    --input ./sample_data \
    --instruction "Extract tasks from the Excel file, creating nodes with title, status, and assignee properties" \
    --model-import "app.models.node:NodeCreate" \
    --mode code \
    --format jsonl \
    --learn \
    --skill-name "excel-to-tasks"
```

### Step 2: Reuse the Learned Skill

```bash
# Subsequent runs use the learned transformer directly
./scripts/dc exec -T backend uv run python -m app.llm.transformer.cli \
    --input ./new_data \
    --instruction "Use the excel-to-tasks pattern" \
    --skill-dir ./.claude/skills/excel-to-tasks
```

## API Integration

After transformation, apply the payloads to the workflow:

```python
import httpx
import json

async def apply_node_creates(workflow_id: str, payloads_file: str):
    """Apply NodeCreate payloads to the workflow."""
    async with httpx.AsyncClient() as client:
        with open(payloads_file) as f:
            for line in f:
                payload = json.loads(line)
                response = await client.post(
                    f"http://localhost:8000/api/v1/workflows/{workflow_id}/nodes",
                    json=payload,
                )
                response.raise_for_status()
                print(f"Created node: {response.json()['id']}")

async def apply_node_updates(workflow_id: str, payloads_file: str):
    """Apply NodeUpdate payloads to the workflow."""
    async with httpx.AsyncClient() as client:
        with open(payloads_file) as f:
            for line in f:
                data = json.loads(line)
                node_id = data["node_id"]
                update = data["update"]
                response = await client.patch(
                    f"http://localhost:8000/api/v1/workflows/{workflow_id}/nodes/{node_id}",
                    json=update,
                )
                response.raise_for_status()
                print(f"Updated node: {node_id}")
```

## Important Notes

- All transformations are validated against Pydantic schemas before output
- Learned skills include both the instruction and the generated code
- The `--mode code` flag is recommended for large datasets
- Use `--format jsonl` for streaming/batch operations
- The transformer validates output before writing, ensuring API compatibility
