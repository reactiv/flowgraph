---
name: google-drive
description: List and download files from Google Drive. Use this skill when you need to access files stored in Google Drive, list folder contents, search for files, or download file content.
---

# Google Drive File Access

This skill enables listing and downloading files from Google Drive using the `google-api-python-client` library.

## Authentication

Google Drive uses OAuth2 tokens for authentication. The `GOOGLE_DRIVE_TOKENS` environment variable must point to a JSON file containing the OAuth2 credentials.

```python
import os
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

def get_drive_client():
    """Get authenticated Google Drive client."""
    tokens_path = os.environ.get("GOOGLE_DRIVE_TOKENS")
    if not tokens_path or not os.path.exists(tokens_path):
        raise ValueError("GOOGLE_DRIVE_TOKENS not set or file not found")

    creds = Credentials.from_authorized_user_file(tokens_path)
    return build("drive", "v3", credentials=creds)

drive = get_drive_client()
```

## Listing Files

### List All Files

```python
# List files the user has access to
results = drive.files().list(
    pageSize=100,
    fields="nextPageToken, files(id, name, mimeType, size, createdTime, modifiedTime)"
).execute()

files = results.get("files", [])
for file in files:
    print(f"{file['name']} ({file['mimeType']})")
```

### List Files in a Folder

```python
# List files in a specific folder
folder_id = "your-folder-id"
results = drive.files().list(
    q=f"'{folder_id}' in parents",
    pageSize=100,
    fields="nextPageToken, files(id, name, mimeType, size)"
).execute()
```

### Search for Files

```python
# Search by name
results = drive.files().list(
    q="name contains 'report'",
    fields="files(id, name, mimeType)"
).execute()

# Search by type
results = drive.files().list(
    q="mimeType='application/pdf'",
    fields="files(id, name)"
).execute()

# Combined search
results = drive.files().list(
    q="name contains 'invoice' and mimeType='application/pdf'",
    fields="files(id, name, mimeType)"
).execute()
```

## Downloading Files

### Download File Content

```python
from googleapiclient.http import MediaIoBaseDownload
import io

def download_file(file_id, output_path):
    """Download a file from Google Drive."""
    request = drive.files().get_media(fileId=file_id)

    with open(output_path, "wb") as f:
        downloader = MediaIoBaseDownload(f, request)
        done = False
        while not done:
            status, done = downloader.next_chunk()
            print(f"Download progress: {int(status.progress() * 100)}%")

# Usage
download_file("file-id", "output.pdf")
```

### Download to Memory

```python
def download_to_bytes(file_id):
    """Download file content to memory."""
    request = drive.files().get_media(fileId=file_id)
    buffer = io.BytesIO()
    downloader = MediaIoBaseDownload(buffer, request)

    done = False
    while not done:
        _, done = downloader.next_chunk()

    buffer.seek(0)
    return buffer.read()

# Usage
content = download_to_bytes("file-id")
```

### Export Google Docs/Sheets

Google Docs and Sheets must be exported to a standard format:

```python
def export_google_doc(file_id, mime_type="text/plain"):
    """Export a Google Doc to specified format."""
    content = drive.files().export(
        fileId=file_id,
        mimeType=mime_type
    ).execute()
    return content

# Export as plain text
text = export_google_doc("doc-id", "text/plain")

# Export as PDF
pdf_bytes = export_google_doc("doc-id", "application/pdf")

# Export Sheet as CSV
csv_content = export_google_doc("sheet-id", "text/csv")
```

## Common MIME Types

| File Type | MIME Type |
|-----------|-----------|
| PDF | `application/pdf` |
| Word Doc | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| Excel | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| CSV | `text/csv` |
| Google Doc | `application/vnd.google-apps.document` |
| Google Sheet | `application/vnd.google-apps.spreadsheet` |
| Google Slides | `application/vnd.google-apps.presentation` |
| Folder | `application/vnd.google-apps.folder` |

## Pagination

Handle large file lists with pagination:

```python
def list_all_files(folder_id=None):
    """List all files, handling pagination."""
    all_files = []
    page_token = None

    query = f"'{folder_id}' in parents" if folder_id else None

    while True:
        results = drive.files().list(
            q=query,
            pageSize=100,
            pageToken=page_token,
            fields="nextPageToken, files(id, name, mimeType, size)"
        ).execute()

        all_files.extend(results.get("files", []))
        page_token = results.get("nextPageToken")

        if not page_token:
            break

    return all_files
```

## Get File Metadata

```python
# Get detailed file information
file = drive.files().get(
    fileId="file-id",
    fields="id, name, mimeType, size, createdTime, modifiedTime, parents, webViewLink"
).execute()

print(f"Name: {file['name']}")
print(f"Size: {file.get('size', 'N/A')} bytes")
print(f"Modified: {file['modifiedTime']}")
```

## Error Handling

```python
from googleapiclient.errors import HttpError

try:
    file = drive.files().get(fileId="file-id").execute()
except HttpError as e:
    if e.resp.status == 404:
        print("File not found")
    elif e.resp.status == 403:
        print("Access denied - check sharing permissions")
    else:
        print(f"API error: {e}")
```

## Important Notes

- OAuth2 tokens authenticate as the user who authorized the app
- Folder IDs can be extracted from Google Drive URLs
- Google Docs/Sheets/Slides must be exported - they can't be downloaded directly
- Large files may require chunked downloads
