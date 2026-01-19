'use client';

import { useState, useCallback, useRef } from 'react';

const ALLOWED_EXTENSIONS = ['.csv', '.json', '.jsonl', '.txt', '.md', '.xml', '.zip'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB per file
const MAX_TOTAL_SIZE = 200 * 1024 * 1024; // 200MB total

export interface SelectedFile {
  file: File;
  id: string;
}

interface FileDropzoneProps {
  onFilesSelected: (files: File[]) => void;
  selectedFiles: SelectedFile[];
  onRemoveFile: (id: string) => void;
  disabled?: boolean;
  error?: string | null;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateFile(file: File): string | null {
  // Check extension
  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return `File type ${ext} not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`;
  }

  // Check size
  if (file.size > MAX_FILE_SIZE) {
    return `File too large (${formatSize(file.size)}). Maximum is ${formatSize(MAX_FILE_SIZE)}.`;
  }

  return null;
}

export function FileDropzone({
  onFilesSelected,
  selectedFiles,
  onRemoveFile,
  disabled = false,
  error,
}: FileDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalSize = selectedFiles.reduce((sum, sf) => sum + sf.file.size, 0);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;

      setValidationError(null);

      const newFiles: File[] = [];
      let newTotalSize = totalSize;

      for (let i = 0; i < files.length; i++) {
        const file = files.item(i);
        if (!file) continue;

        // Validate file
        const fileError = validateFile(file);
        if (fileError) {
          setValidationError(fileError);
          return;
        }

        // Check total size
        if (newTotalSize + file.size > MAX_TOTAL_SIZE) {
          setValidationError(
            `Total size would exceed ${formatSize(MAX_TOTAL_SIZE)} limit.`
          );
          return;
        }

        newTotalSize += file.size;
        newFiles.push(file);
      }

      if (newFiles.length > 0) {
        onFilesSelected(newFiles);
      }
    },
    [onFilesSelected, totalSize]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!disabled) {
        setIsDragging(true);
      }
    },
    [disabled]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      if (disabled) return;

      handleFiles(e.dataTransfer.files);
    },
    [disabled, handleFiles]
  );

  const handleClick = useCallback(() => {
    if (!disabled) {
      fileInputRef.current?.click();
    }
  }, [disabled]);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFiles(e.target.files);
      // Reset input so the same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [handleFiles]
  );

  const displayError = error || validationError;

  return (
    <div className="space-y-3">
      {/* Dropzone */}
      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer
          transition-colors duration-200
          ${isDragging
            ? 'border-primary bg-primary/5'
            : disabled
            ? 'border-muted cursor-not-allowed opacity-50'
            : 'border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/30'
          }
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ALLOWED_EXTENSIONS.join(',')}
          onChange={handleFileInputChange}
          className="hidden"
          disabled={disabled}
        />

        <div className="flex flex-col items-center gap-2">
          <svg
            className="w-8 h-8 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <div>
            <span className="text-sm text-muted-foreground">
              Drop files here or{' '}
              <span className="text-primary font-medium">browse</span>
            </span>
          </div>
          <span className="text-xs text-muted-foreground/70">
            Supports: {ALLOWED_EXTENSIONS.join(', ')}
          </span>
        </div>
      </div>

      {/* Error display */}
      {displayError && (
        <div className="text-sm text-destructive">{displayError}</div>
      )}

      {/* Selected files list */}
      {selectedFiles.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">
            {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected
            ({formatSize(totalSize)})
          </div>
          <div className="space-y-1">
            {selectedFiles.map((sf) => (
              <div
                key={sf.id}
                className="flex items-center justify-between px-3 py-2 bg-muted/50 rounded-lg text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <svg
                    className="w-4 h-4 text-muted-foreground flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <span className="truncate">{sf.file.name}</span>
                  <span className="text-muted-foreground/70 flex-shrink-0">
                    ({formatSize(sf.file.size)})
                  </span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveFile(sf.id);
                  }}
                  disabled={disabled}
                  className="p-1 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  aria-label="Remove file"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
