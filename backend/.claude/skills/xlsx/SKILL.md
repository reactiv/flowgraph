---
name: xlsx
description: Read, analyze, and create Excel spreadsheets (.xlsx, .xlsm, .csv, .tsv). Use this skill when working with spreadsheet data, extracting tables, or creating Excel files with formulas.
---

# Excel Spreadsheet Handling

This skill enables reading, analyzing, and creating Excel files using pandas and openpyxl.

## Reading Spreadsheets

### Read with pandas

```python
import pandas as pd

# Read entire Excel file
df = pd.read_excel("file.xlsx")

# Read specific sheet
df = pd.read_excel("file.xlsx", sheet_name="Sheet1")

# Read all sheets into dict
sheets = pd.read_excel("file.xlsx", sheet_name=None)
for name, df in sheets.items():
    print(f"Sheet: {name}, Rows: {len(df)}")
```

### Read with openpyxl (for formulas/formatting)

```python
from openpyxl import load_workbook

# Load with values (computed)
wb = load_workbook("file.xlsx", data_only=True)
sheet = wb.active

# Access cells
value = sheet["A1"].value
value = sheet.cell(row=1, column=1).value

# Iterate rows
for row in sheet.iter_rows(min_row=2, values_only=True):
    print(row)
```

### Read CSV/TSV

```python
import pandas as pd

# CSV
df = pd.read_csv("file.csv")

# TSV
df = pd.read_csv("file.tsv", sep="\t")

# With encoding
df = pd.read_csv("file.csv", encoding="utf-8")
```

## Creating Spreadsheets

### Create with pandas

```python
import pandas as pd

data = {"Name": ["Alice", "Bob"], "Score": [95, 87]}
df = pd.DataFrame(data)

# Write to Excel
df.to_excel("output.xlsx", index=False)

# Multiple sheets
with pd.ExcelWriter("output.xlsx") as writer:
    df1.to_excel(writer, sheet_name="Data", index=False)
    df2.to_excel(writer, sheet_name="Summary", index=False)
```

### Create with openpyxl (for formulas)

```python
from openpyxl import Workbook

wb = Workbook()
ws = wb.active
ws.title = "Data"

# Write headers
ws["A1"] = "Item"
ws["B1"] = "Price"
ws["C1"] = "Quantity"
ws["D1"] = "Total"

# Write data with formulas
ws["A2"] = "Widget"
ws["B2"] = 10.00
ws["C2"] = 5
ws["D2"] = "=B2*C2"  # Formula

# Save
wb.save("output.xlsx")
```

## Working with Formulas

### Important: Use Formulas, Not Hardcoded Values

Always use Excel formulas instead of calculating values in Python. This keeps spreadsheets dynamic.

```python
# WRONG - hardcoded calculation
total = price * quantity
ws["D2"] = total

# CORRECT - Excel formula
ws["D2"] = "=B2*C2"
```

### Common Formula Patterns

```python
# SUM
ws["B10"] = "=SUM(B2:B9)"

# AVERAGE
ws["B11"] = "=AVERAGE(B2:B9)"

# IF statement
ws["C2"] = '=IF(B2>100,"High","Low")'

# VLOOKUP
ws["D2"] = "=VLOOKUP(A2,LookupTable!A:B,2,FALSE)"

# Conditional formatting via formula
ws["E2"] = "=IF(D2>0,D2,0)"
```

### Recalculate Formulas

After creating files with formulas, recalculate using LibreOffice:

```bash
python recalc.py output.xlsx
```

This ensures all formula values are computed and checks for errors.

## Formatting

### Cell Formatting

```python
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side

# Bold header
ws["A1"].font = Font(bold=True)

# Currency format
ws["B2"].number_format = "$#,##0.00"

# Percentage
ws["C2"].number_format = "0.0%"

# Date format
ws["D2"].number_format = "YYYY-MM-DD"

# Center alignment
ws["A1"].alignment = Alignment(horizontal="center")

# Background color
ws["A1"].fill = PatternFill(start_color="FFFF00", fill_type="solid")
```

### Financial Model Color Coding

Follow standard conventions:
- **Blue text**: Inputs and hardcoded values
- **Black text**: Formulas and calculations
- **Green text**: Links within workbook
- **Red text**: External links
- **Yellow background**: Key assumptions

```python
from openpyxl.styles import Font

# Input cell (blue)
ws["B2"].font = Font(color="0000FF")

# Formula cell (black)
ws["C2"].font = Font(color="000000")
```

## Data Analysis

### Basic Analysis with pandas

```python
import pandas as pd

df = pd.read_excel("data.xlsx")

# Summary statistics
print(df.describe())

# Group by
summary = df.groupby("Category")["Amount"].sum()

# Filter
filtered = df[df["Amount"] > 100]

# Pivot table
pivot = pd.pivot_table(df, values="Amount", index="Category", columns="Month", aggfunc="sum")
```

### Export Analysis Results

```python
# Write analysis back to Excel
with pd.ExcelWriter("analysis.xlsx") as writer:
    df.to_excel(writer, sheet_name="Raw Data", index=False)
    summary.to_excel(writer, sheet_name="Summary")
    pivot.to_excel(writer, sheet_name="Pivot")
```

## Error Handling

### Excel Error Types

Check for these errors after recalculation:
- `#VALUE!` - Wrong value type
- `#DIV/0!` - Division by zero
- `#REF!` - Invalid reference
- `#NAME?` - Unrecognized formula name
- `#NULL!` - Incorrect range
- `#NUM!` - Invalid numeric value
- `#N/A` - Value not available

### Detect Errors

```python
from openpyxl import load_workbook

wb = load_workbook("file.xlsx", data_only=True)
errors = []

for sheet in wb.sheetnames:
    ws = wb[sheet]
    for row in ws.iter_rows():
        for cell in row:
            if cell.value and str(cell.value).startswith("#"):
                errors.append(f"{sheet}!{cell.coordinate}: {cell.value}")

if errors:
    print("Errors found:", errors)
```

## Important Notes

- Use pandas for data analysis and bulk operations
- Use openpyxl for formulas, formatting, and Excel-specific features
- Always run `recalc.py` after creating files with formulas
- Keep formulas dynamic - avoid hardcoding calculated values
- Match existing format/style when editing templates
