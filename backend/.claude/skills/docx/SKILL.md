---
name: docx
description: Read, analyze, and create Word documents (.docx). Use this skill when working with Word documents, extracting text content, or creating formatted documents.
---

# Word Document Handling

This skill enables reading, analyzing, and creating Word documents using the python-docx library.

## Reading Documents

### Extract All Text

```python
from docx import Document

doc = Document("file.docx")

# Get all paragraphs
text = []
for para in doc.paragraphs:
    text.append(para.text)

full_text = "\n".join(text)
print(full_text)
```

### Extract with Structure

```python
from docx import Document

doc = Document("file.docx")

# Process paragraphs with styles
for para in doc.paragraphs:
    style = para.style.name
    text = para.text

    if style.startswith("Heading"):
        print(f"\n## {text}")
    elif text.strip():
        print(text)
```

### Extract Tables

```python
from docx import Document

doc = Document("file.docx")

for table in doc.tables:
    for row in table.rows:
        row_data = [cell.text for cell in row.cells]
        print(row_data)
```

### Extract to Markdown

```python
from docx import Document

def docx_to_markdown(filepath):
    doc = Document(filepath)
    md_lines = []

    for para in doc.paragraphs:
        style = para.style.name
        text = para.text.strip()

        if not text:
            continue

        if style == "Heading 1":
            md_lines.append(f"# {text}")
        elif style == "Heading 2":
            md_lines.append(f"## {text}")
        elif style == "Heading 3":
            md_lines.append(f"### {text}")
        elif style == "List Bullet":
            md_lines.append(f"- {text}")
        elif style == "List Number":
            md_lines.append(f"1. {text}")
        else:
            md_lines.append(text)

        md_lines.append("")

    return "\n".join(md_lines)
```

## Creating Documents

### Basic Document

```python
from docx import Document
from docx.shared import Inches, Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH

doc = Document()

# Add title
title = doc.add_heading("Document Title", level=0)

# Add paragraph
doc.add_paragraph("This is the first paragraph.")

# Add formatted paragraph
para = doc.add_paragraph()
run = para.add_run("Bold text")
run.bold = True
para.add_run(" and ")
run = para.add_run("italic text")
run.italic = True

# Save
doc.save("output.docx")
```

### Add Headings

```python
from docx import Document

doc = Document()

doc.add_heading("Main Title", level=0)
doc.add_heading("Section 1", level=1)
doc.add_paragraph("Content under section 1.")
doc.add_heading("Subsection 1.1", level=2)
doc.add_paragraph("Content under subsection.")

doc.save("output.docx")
```

### Add Lists

```python
from docx import Document

doc = Document()

# Bullet list
doc.add_paragraph("First item", style="List Bullet")
doc.add_paragraph("Second item", style="List Bullet")
doc.add_paragraph("Third item", style="List Bullet")

# Numbered list
doc.add_paragraph("Step one", style="List Number")
doc.add_paragraph("Step two", style="List Number")
doc.add_paragraph("Step three", style="List Number")

doc.save("output.docx")
```

### Add Tables

```python
from docx import Document
from docx.shared import Inches

doc = Document()

# Create table
table = doc.add_table(rows=1, cols=3)
table.style = "Table Grid"

# Header row
header_cells = table.rows[0].cells
header_cells[0].text = "Name"
header_cells[1].text = "Department"
header_cells[2].text = "Salary"

# Data rows
data = [
    ("Alice", "Engineering", "$85,000"),
    ("Bob", "Marketing", "$72,000"),
    ("Carol", "Sales", "$68,000"),
]

for name, dept, salary in data:
    row_cells = table.add_row().cells
    row_cells[0].text = name
    row_cells[1].text = dept
    row_cells[2].text = salary

doc.save("output.docx")
```

## Text Formatting

### Font Styling

```python
from docx import Document
from docx.shared import Pt, RGBColor

doc = Document()
para = doc.add_paragraph()

# Bold
run = para.add_run("Bold ")
run.bold = True

# Italic
run = para.add_run("Italic ")
run.italic = True

# Underline
run = para.add_run("Underline ")
run.underline = True

# Font size
run = para.add_run("Large text ")
run.font.size = Pt(16)

# Font color
run = para.add_run("Red text")
run.font.color.rgb = RGBColor(255, 0, 0)

doc.save("output.docx")
```

### Paragraph Formatting

```python
from docx import Document
from docx.shared import Inches, Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH

doc = Document()

# Centered paragraph
para = doc.add_paragraph("Centered text")
para.alignment = WD_ALIGN_PARAGRAPH.CENTER

# Right-aligned
para = doc.add_paragraph("Right-aligned text")
para.alignment = WD_ALIGN_PARAGRAPH.RIGHT

# Indented
para = doc.add_paragraph("Indented paragraph")
para.paragraph_format.left_indent = Inches(0.5)

# Line spacing
para = doc.add_paragraph("Double-spaced paragraph")
para.paragraph_format.line_spacing = 2.0

doc.save("output.docx")
```

## Working with Templates

### Open and Modify Template

```python
from docx import Document

# Open template
doc = Document("template.docx")

# Find and replace text
for para in doc.paragraphs:
    if "{{NAME}}" in para.text:
        para.text = para.text.replace("{{NAME}}", "John Smith")
    if "{{DATE}}" in para.text:
        para.text = para.text.replace("{{DATE}}", "January 15, 2025")

# Save as new file
doc.save("filled_document.docx")
```

### Replace in Tables

```python
from docx import Document

doc = Document("template.docx")

for table in doc.tables:
    for row in table.rows:
        for cell in row.cells:
            if "{{PLACEHOLDER}}" in cell.text:
                cell.text = cell.text.replace("{{PLACEHOLDER}}", "Value")

doc.save("output.docx")
```

## Document Properties

### Read Properties

```python
from docx import Document

doc = Document("file.docx")
props = doc.core_properties

print(f"Title: {props.title}")
print(f"Author: {props.author}")
print(f"Created: {props.created}")
print(f"Modified: {props.modified}")
```

### Set Properties

```python
from docx import Document
from datetime import datetime

doc = Document()
props = doc.core_properties

props.title = "My Document"
props.author = "Data Transformer"
props.created = datetime.now()

doc.save("output.docx")
```

## Advanced Features

### Add Page Break

```python
from docx import Document
from docx.enum.text import WD_BREAK

doc = Document()
doc.add_paragraph("Page 1 content")

# Add page break
doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)

doc.add_paragraph("Page 2 content")
doc.save("output.docx")
```

### Add Images

```python
from docx import Document
from docx.shared import Inches

doc = Document()
doc.add_paragraph("Here is an image:")
doc.add_picture("image.png", width=Inches(4))
doc.save("output.docx")
```

### Sections and Headers

```python
from docx import Document

doc = Document()

# Add content to first section
doc.add_paragraph("First section content")

# Add header
section = doc.sections[0]
header = section.header
header.paragraphs[0].text = "Document Header"

# Add footer
footer = section.footer
footer.paragraphs[0].text = "Page Footer"

doc.save("output.docx")
```

## Important Notes

- python-docx reads/writes .docx format only (not .doc)
- Styles must exist in the document or template
- Complex formatting may require working with XML directly
- For tracked changes, use specialized libraries
- Preserve existing formatting when modifying templates
