"""Template API routes."""

import json
from pathlib import Path

from fastapi import APIRouter, HTTPException

from app.models import WorkflowDefinition

router = APIRouter()

TEMPLATES_DIR = Path(__file__).parent.parent.parent / "templates"


def _load_templates() -> list[dict]:
    """Load all template files from the templates directory."""
    templates = []
    if not TEMPLATES_DIR.exists():
        return templates

    for template_file in TEMPLATES_DIR.glob("*.workflow.json"):
        with open(template_file) as f:
            data = json.load(f)
            templates.append(
                {
                    "id": template_file.stem.replace(".workflow", ""),
                    "name": data.get("name", template_file.stem),
                    "description": data.get("description", ""),
                    "node_type_count": len(data.get("nodeTypes", [])),
                    "edge_type_count": len(data.get("edgeTypes", [])),
                    "tags": data.get("tags", []),
                }
            )
    return templates


@router.get("/templates")
async def list_templates() -> list[dict]:
    """List all available workflow templates."""
    return _load_templates()


@router.get("/templates/{template_id}")
async def get_template(template_id: str) -> WorkflowDefinition:
    """Get a specific template definition."""
    template_file = TEMPLATES_DIR / f"{template_id}.workflow.json"

    if not template_file.exists():
        raise HTTPException(status_code=404, detail=f"Template '{template_id}' not found")

    with open(template_file) as f:
        data = json.load(f)

    return WorkflowDefinition.model_validate(data)
