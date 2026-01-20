---
name: notion
description: Read data from Notion databases and pages. Use this skill when you need to fetch content from Notion, query database rows, get page content, or retrieve database schemas.
---

# Notion Data Access

This skill enables reading data from Notion databases and pages using the official `notion-client` Python SDK.

## Authentication

The Notion API requires an integration token set via the `NOTION_TOKEN` environment variable.

```python
import os
from notion_client import Client

notion = Client(auth=os.environ["NOTION_TOKEN"])
```

## Reading Databases

### Query Database Rows

```python
import os
from notion_client import Client

notion = Client(auth=os.environ["NOTION_TOKEN"])

# Query all rows from a database
database_id = "your-database-id"
results = notion.databases.query(database_id=database_id)

for page in results["results"]:
    # Each page has properties matching the database schema
    properties = page["properties"]
    print(properties)
```

### Query with Filters

```python
# Filter by property values
results = notion.databases.query(
    database_id=database_id,
    filter={
        "property": "Status",
        "select": {
            "equals": "Done"
        }
    }
)
```

### Get Database Schema

```python
# Retrieve database structure and properties
database = notion.databases.retrieve(database_id=database_id)

# Access property definitions
for name, prop in database["properties"].items():
    print(f"{name}: {prop['type']}")
```

## Reading Pages

### Get Page Content

```python
# Retrieve a page's properties
page_id = "your-page-id"
page = notion.pages.retrieve(page_id=page_id)

# Get the page's block content
blocks = notion.blocks.children.list(block_id=page_id)

for block in blocks["results"]:
    block_type = block["type"]
    content = block.get(block_type, {})
    print(f"{block_type}: {content}")
```

### Extract Text from Blocks

```python
def extract_text(block):
    """Extract plain text from a Notion block."""
    block_type = block["type"]
    content = block.get(block_type, {})

    if "rich_text" in content:
        return "".join(t["plain_text"] for t in content["rich_text"])
    elif "text" in content:
        return "".join(t["plain_text"] for t in content["text"])
    return ""

# Get all text from a page
blocks = notion.blocks.children.list(block_id=page_id)
text_content = "\n".join(extract_text(b) for b in blocks["results"])
```

## Common Property Types

When parsing database rows, handle these property types:

| Type | Access Pattern |
|------|---------------|
| `title` | `prop["title"][0]["plain_text"]` |
| `rich_text` | `prop["rich_text"][0]["plain_text"]` |
| `number` | `prop["number"]` |
| `select` | `prop["select"]["name"]` |
| `multi_select` | `[s["name"] for s in prop["multi_select"]]` |
| `date` | `prop["date"]["start"]` |
| `checkbox` | `prop["checkbox"]` |
| `url` | `prop["url"]` |
| `email` | `prop["email"]` |
| `relation` | `[r["id"] for r in prop["relation"]]` |

## Pagination

Handle large datasets with pagination:

```python
def query_all_pages(database_id):
    """Query all rows from a database, handling pagination."""
    all_results = []
    has_more = True
    start_cursor = None

    while has_more:
        response = notion.databases.query(
            database_id=database_id,
            start_cursor=start_cursor
        )
        all_results.extend(response["results"])
        has_more = response["has_more"]
        start_cursor = response.get("next_cursor")

    return all_results
```

## Error Handling

```python
from notion_client import APIResponseError

try:
    results = notion.databases.query(database_id=database_id)
except APIResponseError as e:
    print(f"Notion API error: {e.code} - {e.message}")
```

## Important Notes

- Database and page IDs can be extracted from Notion URLs
- The API returns nested structures - always check for existence before accessing
- Rich text fields are arrays - join `plain_text` values for full content
- Dates use ISO 8601 format
