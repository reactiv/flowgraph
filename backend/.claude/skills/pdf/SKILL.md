---
name: pdf
description: Read and extract content from PDF files. Use this skill when working with PDF documents to extract text, tables, or structured data.
---

# PDF File Handling

This skill enables reading and extracting content from PDF files using Google's Gemini API. Always use gemini-3-flash-preview!

## Reading PDF Content

### Basic Text Extraction

```python
from google import genai
from google.genai import types
import pathlib

client = genai.Client()

# Load the PDF file
filepath = pathlib.Path('document.pdf')

# Extract text content
prompt = "Parse this PDF file: extract all text content verbatim, with short descriptions for images inline"
response = client.models.generate_content(
    model="gemini-3-flash-preview",
    contents=[
        types.Part.from_bytes(
            data=filepath.read_bytes(),
            mime_type='application/pdf',
        ),
        prompt
    ]
)
print(response.text)
```

## Extracting Structured Data

Important rules:

- Use Pydantic Models
- Avoid patterns which expose additionalProperties, e.g. List[dict], strongly type everything instead
- Use Enum types to normalize any types
e.g.
```python
class ReactionStatus(str, Enum):
    COMPLETE = "Complete"
    IN_PROGRESS = "In Progress"
    FAILED = "Failed"
    PENDING = "Pending"
```

### Using Pydantic Models

```python
from google import genai
from pydantic import BaseModel
import pathlib

class Invoice(BaseModel):
    invoice_number: str
    date: str
    vendor: str
    total: float
    line_items: list[dict]

client = genai.Client()
filepath = pathlib.Path('invoice.pdf')

# Build prompt with PDF content
response = client.models.generate_content(
    model="gemini-3-flash-preview",
    contents=[
        types.Part.from_bytes(
            data=filepath.read_bytes(),
            mime_type='application/pdf',
        ),
        "Extract the invoice data from this PDF"
    ],
    config={
        "response_mime_type": "application/json",
        "response_schema": Invoice.model_json_schema(),
    },
)

# Parse the structured response
import json
invoice_data = json.loads(response.text)
```

### Extracting Tables

```python
from google import genai
from google.genai import types
from pydantic import BaseModel
import pathlib

class TableRow(BaseModel):
    columns: list[str]

class Table(BaseModel):
    headers: list[str]
    rows: list[TableRow]

client = genai.Client()
filepath = pathlib.Path('report.pdf')

response = client.models.generate_content(
    model="gemini-3-flash-preview",
    contents=[
        types.Part.from_bytes(
            data=filepath.read_bytes(),
            mime_type='application/pdf',
        ),
        "Extract all tables from this PDF. Return each table with headers and rows."
    ],
    config={
        "response_mime_type": "application/json",
        "response_schema": {"type": "array", "items": Table.model_json_schema()},
    },
)
```

## Multi-Page Documents

### Processing Large PDFs

For large PDFs, Gemini handles multi-page documents automatically:

```python
from google import genai
from google.genai import types
import pathlib

client = genai.Client()
filepath = pathlib.Path('large_document.pdf')

# Gemini processes all pages
response = client.models.generate_content(
    model="gemini-3-flash-preview",
    contents=[
        types.Part.from_bytes(
            data=filepath.read_bytes(),
            mime_type='application/pdf',
        ),
        "Summarize the key points from each section of this document"
    ]
)
```

### Page-Specific Extraction

```python
prompt = """
From this PDF, extract:
1. The content from page 1 (cover page info)
2. The table of contents from page 2
3. All figures and their captions
"""

response = client.models.generate_content(
    model="gemini-3-flash-preview",
    contents=[
        types.Part.from_bytes(
            data=filepath.read_bytes(),
            mime_type='application/pdf',
        ),
        prompt
    ]
)
```

## Common Use Cases

### Extract Form Data

```python
class FormData(BaseModel):
    field_name: str
    field_value: str

response = client.models.generate_content(
    model="gemini-3-flash-preview",
    contents=[
        types.Part.from_bytes(
            data=filepath.read_bytes(),
            mime_type='application/pdf',
        ),
        "Extract all form fields and their values from this PDF form"
    ],
    config={
        "response_mime_type": "application/json",
        "response_schema": {"type": "array", "items": FormData.model_json_schema()},
    },
)
```

### Extract Metadata

```python
response = client.models.generate_content(
    model="gemini-3-flash-preview",
    contents=[
        types.Part.from_bytes(
            data=filepath.read_bytes(),
            mime_type='application/pdf',
        ),
        """Extract document metadata:
        - Title
        - Author (if visible)
        - Date
        - Number of pages (estimate)
        - Document type (report, invoice, form, etc.)
        """
    ]
)
```

## Important Notes

- Gemini handles PDF parsing natively - no need for PyPDF2 or other libraries
- Large PDFs are processed automatically across all pages
- For structured extraction, always use Pydantic models with response_schema
- The model can see images, charts, and diagrams embedded in PDFs
- For scanned documents, Gemini performs OCR automatically
