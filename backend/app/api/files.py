"""API routes for file uploads."""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel

from app.storage.upload_store import (
    UploadedFile as StoredFile,
)
from app.storage.upload_store import (
    UploadStore,
    get_upload_store,
)

logger = logging.getLogger(__name__)

router = APIRouter()


class UploadResponse(BaseModel):
    """Response from uploading files."""

    upload_id: str
    files: list[StoredFile]
    expires_at: str


class UploadInfo(BaseModel):
    """Information about an existing upload."""

    upload_id: str
    files: list[StoredFile]
    total_size: int
    expires_at: str


@router.post("/files/upload", response_model=UploadResponse)
async def upload_files(
    files: Annotated[list[UploadFile], File(description="Files to upload")],
    store: Annotated[UploadStore, Depends(get_upload_store)],
) -> UploadResponse:
    """Upload files for transformation.

    Upload one or more files that will be used for schema generation or seeding.
    Files are stored temporarily and automatically deleted after 1 hour.

    Limits:
    - Maximum 50MB per file
    - Maximum 200MB total per upload session
    - Maximum 20 files per upload
    - Allowed types: .csv, .json, .jsonl, .txt, .md, .xml, .zip
    """
    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No files provided",
        )

    # Create upload session
    upload_id = await store.create_upload()
    uploaded_files: list[StoredFile] = []

    try:
        for file in files:
            if not file.filename:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="File must have a filename",
                )

            # Read file content
            content = await file.read()

            try:
                uploaded = await store.add_file(
                    upload_id=upload_id,
                    filename=file.filename,
                    content=content,
                    content_type=file.content_type,
                )
                uploaded_files.append(uploaded)
            except ValueError as e:
                # Clean up on validation error
                await store.delete_upload(upload_id)
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=str(e),
                )

        # Get manifest for expires_at
        manifest = await store.get_manifest(upload_id)

        logger.info(f"Uploaded {len(uploaded_files)} file(s) to session {upload_id}")

        return UploadResponse(
            upload_id=upload_id,
            files=uploaded_files,
            expires_at=manifest.expires_at,
        )

    except HTTPException:
        raise
    except Exception as e:
        # Clean up on unexpected error
        await store.delete_upload(upload_id)
        logger.exception(f"Unexpected error during file upload: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to upload files",
        )


@router.get("/files/{upload_id}", response_model=UploadInfo)
async def get_upload_info(
    upload_id: str,
    store: Annotated[UploadStore, Depends(get_upload_store)],
) -> UploadInfo:
    """Get information about an upload session."""
    try:
        manifest = await store.get_manifest(upload_id)
        return UploadInfo(
            upload_id=manifest.upload_id,
            files=manifest.files,
            total_size=manifest.total_size,
            expires_at=manifest.expires_at,
        )
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Upload session {upload_id} not found or expired",
        )


@router.delete("/files/{upload_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_upload(
    upload_id: str,
    store: Annotated[UploadStore, Depends(get_upload_store)],
) -> None:
    """Delete an upload session and all its files.

    This is called automatically when files expire, but can be called
    manually to free up space immediately.
    """
    try:
        # Verify it exists first
        await store.get_manifest(upload_id)
        await store.delete_upload(upload_id)
        logger.info(f"Deleted upload session {upload_id}")
    except FileNotFoundError:
        # Already deleted or never existed - that's fine
        pass
