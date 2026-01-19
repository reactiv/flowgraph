"""Upload store for managing temporary file uploads.

Files are stored in a temporary directory and automatically cleaned up
after a configurable TTL.
"""

import json
import logging
import os
import re
import shutil
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

from pydantic import BaseModel

logger = logging.getLogger(__name__)

# Configuration
UPLOAD_DIR = Path(os.getenv("UPLOAD_PATH", "/data/uploads"))
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB per file
MAX_TOTAL_SIZE = 200 * 1024 * 1024  # 200MB per upload session
MAX_FILES_PER_UPLOAD = 20
UPLOAD_TTL_HOURS = 1

# Allowed file extensions
ALLOWED_EXTENSIONS = {".csv", ".json", ".jsonl", ".txt", ".md", ".xml", ".zip"}


class UploadedFile(BaseModel):
    """Information about an uploaded file."""

    filename: str
    size_bytes: int
    content_type: str | None = None


class UploadManifest(BaseModel):
    """Manifest for an upload session."""

    upload_id: str
    created_at: str
    expires_at: str
    files: list[UploadedFile]
    total_size: int


class UploadStore:
    """Manages temporary file uploads with automatic cleanup.

    Files are stored in directories keyed by upload_id with a manifest.json
    containing metadata. Expired uploads are cleaned up by a background task.
    """

    def __init__(self, upload_dir: Path | None = None):
        """Initialize the upload store.

        Args:
            upload_dir: Override the default upload directory.
        """
        self.upload_dir = upload_dir or UPLOAD_DIR
        self.upload_dir.mkdir(parents=True, exist_ok=True)

    def _sanitize_filename(self, filename: str) -> str:
        """Sanitize a filename to prevent path traversal attacks.

        Args:
            filename: The original filename.

        Returns:
            A safe filename with only alphanumeric characters, dots, dashes, and underscores.
        """
        # Get just the basename (no path components)
        name = Path(filename).name

        # Replace any non-safe characters
        safe_name = re.sub(r"[^a-zA-Z0-9._-]", "_", name)

        # Ensure it doesn't start with a dot (hidden file)
        if safe_name.startswith("."):
            safe_name = "_" + safe_name[1:]

        # Ensure we have a valid name
        if not safe_name or safe_name in (".", ".."):
            safe_name = "file"

        return safe_name

    def _validate_extension(self, filename: str) -> None:
        """Validate that the file has an allowed extension.

        Args:
            filename: The filename to validate.

        Raises:
            ValueError: If the extension is not allowed.
        """
        ext = Path(filename).suffix.lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise ValueError(
                f"File type '{ext}' not allowed. "
                f"Allowed types: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
            )

    async def create_upload(self) -> str:
        """Create a new upload session.

        Returns:
            The upload_id for this session.
        """
        upload_id = str(uuid.uuid4())
        upload_path = self.upload_dir / upload_id
        upload_path.mkdir(parents=True, exist_ok=True)

        now = datetime.now(UTC)
        expires = now + timedelta(hours=UPLOAD_TTL_HOURS)

        manifest = UploadManifest(
            upload_id=upload_id,
            created_at=now.isoformat(),
            expires_at=expires.isoformat(),
            files=[],
            total_size=0,
        )

        manifest_path = upload_path / "manifest.json"
        manifest_path.write_text(manifest.model_dump_json(indent=2))

        logger.info(f"Created upload session {upload_id}")
        return upload_id

    async def add_file(
        self,
        upload_id: str,
        filename: str,
        content: bytes,
        content_type: str | None = None,
    ) -> UploadedFile:
        """Add a file to an upload session.

        Args:
            upload_id: The upload session ID.
            filename: The original filename.
            content: The file content as bytes.
            content_type: Optional MIME type.

        Returns:
            Information about the uploaded file.

        Raises:
            ValueError: If the file is invalid or limits are exceeded.
            FileNotFoundError: If the upload session doesn't exist.
        """
        upload_path = self.upload_dir / upload_id
        manifest_path = upload_path / "manifest.json"

        if not manifest_path.exists():
            raise FileNotFoundError(f"Upload session {upload_id} not found")

        # Validate file
        self._validate_extension(filename)

        if len(content) > MAX_FILE_SIZE:
            raise ValueError(
                f"File too large ({len(content) / 1024 / 1024:.1f}MB). "
                f"Maximum size is {MAX_FILE_SIZE / 1024 / 1024:.0f}MB."
            )

        # Load manifest and check limits
        manifest = UploadManifest.model_validate_json(manifest_path.read_text())

        if len(manifest.files) >= MAX_FILES_PER_UPLOAD:
            raise ValueError(
                f"Too many files. Maximum is {MAX_FILES_PER_UPLOAD} files per upload."
            )

        if manifest.total_size + len(content) > MAX_TOTAL_SIZE:
            raise ValueError(
                f"Total upload size would exceed limit "
                f"({MAX_TOTAL_SIZE / 1024 / 1024:.0f}MB)."
            )

        # Save file with sanitized name
        safe_filename = self._sanitize_filename(filename)
        file_path = upload_path / safe_filename

        # Handle duplicate filenames
        counter = 1
        original_stem = Path(safe_filename).stem
        ext = Path(safe_filename).suffix
        while file_path.exists():
            safe_filename = f"{original_stem}_{counter}{ext}"
            file_path = upload_path / safe_filename
            counter += 1

        file_path.write_bytes(content)

        # Update manifest
        uploaded_file = UploadedFile(
            filename=safe_filename,
            size_bytes=len(content),
            content_type=content_type,
        )
        manifest.files.append(uploaded_file)
        manifest.total_size += len(content)
        manifest_path.write_text(manifest.model_dump_json(indent=2))

        logger.info(
            f"Added file {safe_filename} ({len(content)} bytes) to upload {upload_id}"
        )
        return uploaded_file

    async def get_manifest(self, upload_id: str) -> UploadManifest:
        """Get the manifest for an upload session.

        Args:
            upload_id: The upload session ID.

        Returns:
            The upload manifest.

        Raises:
            FileNotFoundError: If the upload session doesn't exist.
        """
        manifest_path = self.upload_dir / upload_id / "manifest.json"
        if not manifest_path.exists():
            raise FileNotFoundError(f"Upload session {upload_id} not found")

        return UploadManifest.model_validate_json(manifest_path.read_text())

    async def get_files(self, upload_id: str) -> list[Path]:
        """Get paths to all files in an upload session.

        Args:
            upload_id: The upload session ID.

        Returns:
            List of paths to uploaded files (excluding manifest.json).

        Raises:
            FileNotFoundError: If the upload session doesn't exist.
        """
        upload_path = self.upload_dir / upload_id
        manifest_path = upload_path / "manifest.json"

        if not manifest_path.exists():
            raise FileNotFoundError(f"Upload session {upload_id} not found")

        # Return all files except manifest.json
        files = [
            f
            for f in upload_path.iterdir()
            if f.is_file() and f.name != "manifest.json"
        ]
        return sorted(files)

    async def delete_upload(self, upload_id: str) -> None:
        """Delete an upload session and all its files.

        Args:
            upload_id: The upload session ID.
        """
        upload_path = self.upload_dir / upload_id

        if upload_path.exists():
            shutil.rmtree(upload_path)
            logger.info(f"Deleted upload session {upload_id}")

    async def cleanup_expired(self) -> int:
        """Delete all expired upload sessions.

        Returns:
            The number of sessions deleted.
        """
        deleted = 0
        now = datetime.now(UTC)

        if not self.upload_dir.exists():
            return 0

        for upload_path in self.upload_dir.iterdir():
            if not upload_path.is_dir():
                continue

            manifest_path = upload_path / "manifest.json"
            if not manifest_path.exists():
                # No manifest - delete this orphaned directory
                shutil.rmtree(upload_path)
                deleted += 1
                continue

            try:
                manifest = json.loads(manifest_path.read_text())
                expires_at = datetime.fromisoformat(manifest["expires_at"])

                if now > expires_at:
                    shutil.rmtree(upload_path)
                    deleted += 1
                    logger.info(f"Cleaned up expired upload {upload_path.name}")
            except (json.JSONDecodeError, KeyError, ValueError) as e:
                logger.warning(f"Invalid manifest in {upload_path}, deleting: {e}")
                shutil.rmtree(upload_path)
                deleted += 1

        if deleted > 0:
            logger.info(f"Cleaned up {deleted} expired upload session(s)")

        return deleted


# Global instance for dependency injection
_upload_store: UploadStore | None = None


def get_upload_store() -> UploadStore:
    """Get the global upload store instance."""
    global _upload_store
    if _upload_store is None:
        _upload_store = UploadStore()
    return _upload_store
