---
name: zip
description: Extract and work with ZIP archives. Use this skill when handling .zip files to list contents, extract files, or process archived data.
---

# ZIP Archive Handling

This skill enables working with ZIP archives using Python's built-in zipfile module.

## Inspecting ZIP Contents

### List Files in Archive

```python
import zipfile

with zipfile.ZipFile('archive.zip', 'r') as zf:
    # List all files
    for name in zf.namelist():
        print(name)

    # Get detailed info
    for info in zf.infolist():
        print(f"{info.filename}: {info.file_size} bytes, compressed: {info.compress_size}")
```

### Check Archive Structure

```python
import zipfile
from pathlib import Path

with zipfile.ZipFile('archive.zip', 'r') as zf:
    # Group files by directory
    dirs = {}
    for name in zf.namelist():
        parent = str(Path(name).parent)
        if parent not in dirs:
            dirs[parent] = []
        dirs[parent].append(Path(name).name)

    for dir_name, files in dirs.items():
        print(f"\n{dir_name}/")
        for f in files:
            print(f"  {f}")
```

## Extracting Files

### Extract All Files

```python
import zipfile

with zipfile.ZipFile('archive.zip', 'r') as zf:
    # Extract to current directory
    zf.extractall()

    # Extract to specific directory
    zf.extractall('output_folder')
```

### Extract Specific Files

```python
import zipfile

with zipfile.ZipFile('archive.zip', 'r') as zf:
    # Extract single file
    zf.extract('data/file.csv')

    # Extract specific files
    files_to_extract = ['data.csv', 'config.json']
    for filename in files_to_extract:
        if filename in zf.namelist():
            zf.extract(filename, 'output')
```

### Extract by Pattern

```python
import zipfile
import fnmatch

with zipfile.ZipFile('archive.zip', 'r') as zf:
    # Extract all CSV files
    for name in zf.namelist():
        if fnmatch.fnmatch(name, '*.csv'):
            zf.extract(name, 'csv_files')

    # Extract files from specific directory
    for name in zf.namelist():
        if name.startswith('data/'):
            zf.extract(name, 'extracted')
```

## Reading Files Without Extraction

### Read File Contents Directly

```python
import zipfile
import json
import csv
from io import StringIO

with zipfile.ZipFile('archive.zip', 'r') as zf:
    # Read text file
    with zf.open('readme.txt') as f:
        content = f.read().decode('utf-8')
        print(content)

    # Read JSON file
    with zf.open('config.json') as f:
        data = json.load(f)

    # Read CSV file
    with zf.open('data.csv') as f:
        reader = csv.DictReader(StringIO(f.read().decode('utf-8')))
        for row in reader:
            print(row)
```

### Process All Files of a Type

```python
import zipfile
import json

with zipfile.ZipFile('archive.zip', 'r') as zf:
    all_data = []

    for name in zf.namelist():
        if name.endswith('.json'):
            with zf.open(name) as f:
                data = json.load(f)
                all_data.append({'file': name, 'data': data})

    print(f"Processed {len(all_data)} JSON files")
```

## Working with Nested ZIPs

### Extract ZIP within ZIP

```python
import zipfile
from io import BytesIO

with zipfile.ZipFile('outer.zip', 'r') as outer:
    # Find inner zip files
    for name in outer.namelist():
        if name.endswith('.zip'):
            # Read inner zip into memory
            inner_data = BytesIO(outer.read(name))

            with zipfile.ZipFile(inner_data, 'r') as inner:
                print(f"\nContents of {name}:")
                for inner_name in inner.namelist():
                    print(f"  {inner_name}")
```

## Creating ZIP Archives

### Create New Archive

```python
import zipfile

with zipfile.ZipFile('output.zip', 'w', zipfile.ZIP_DEFLATED) as zf:
    # Add file
    zf.write('data.csv')

    # Add file with different name in archive
    zf.write('local_file.txt', 'archive_name.txt')

    # Add string content as file
    zf.writestr('generated.txt', 'This content was generated')
```

### Add Directory to Archive

```python
import zipfile
from pathlib import Path

def add_directory_to_zip(zf, directory, arcname=''):
    directory = Path(directory)
    for file_path in directory.rglob('*'):
        if file_path.is_file():
            arc_path = Path(arcname) / file_path.relative_to(directory)
            zf.write(file_path, arc_path)

with zipfile.ZipFile('backup.zip', 'w', zipfile.ZIP_DEFLATED) as zf:
    add_directory_to_zip(zf, 'data_folder', 'data')
```

## Error Handling

### Safe Extraction

```python
import zipfile

try:
    with zipfile.ZipFile('archive.zip', 'r') as zf:
        # Check for zip bombs (large compression ratio)
        for info in zf.infolist():
            if info.file_size > 100 * 1024 * 1024:  # 100MB limit
                print(f"Skipping large file: {info.filename}")
                continue
            zf.extract(info, 'output')
except zipfile.BadZipFile:
    print("Invalid or corrupted ZIP file")
except Exception as e:
    print(f"Error processing ZIP: {e}")
```

### Check Archive Integrity

```python
import zipfile

with zipfile.ZipFile('archive.zip', 'r') as zf:
    # Test archive integrity
    bad_file = zf.testzip()
    if bad_file:
        print(f"Corrupted file found: {bad_file}")
    else:
        print("Archive integrity OK")
```

## Important Notes

- Always use `with` statement to ensure proper file handling
- For large archives, process files one at a time to manage memory
- Use `ZIP_DEFLATED` compression when creating archives
- Check file sizes before extracting to prevent zip bombs
- The zipfile module is part of Python standard library - no install needed
- For password-protected ZIPs, use `zf.setpassword(b'password')` or pass `pwd` parameter
