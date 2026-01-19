'use client';

import { useState, useCallback } from 'react';
import type { SelectedFile } from '@/components/file-dropzone';

export interface UploadedFile {
  filename: string;
  size_bytes: number;
  content_type: string | null;
}

export interface UploadResponse {
  upload_id: string;
  files: UploadedFile[];
  expires_at: string;
}

interface UseFileUploadReturn {
  /** Currently selected files (before upload) */
  selectedFiles: SelectedFile[];
  /** Add files to selection */
  addFiles: (files: File[]) => void;
  /** Remove a file from selection */
  removeFile: (id: string) => void;
  /** Clear all selected files */
  clearFiles: () => void;
  /** Upload selected files to server */
  upload: () => Promise<UploadResponse>;
  /** Upload progress (0-100) */
  uploadProgress: number;
  /** Whether upload is in progress */
  isUploading: boolean;
  /** Upload error message */
  error: string | null;
  /** Clear error */
  clearError: () => void;
  /** Upload ID after successful upload */
  uploadId: string | null;
}

let fileIdCounter = 0;

/**
 * Hook for managing file selection and upload.
 *
 * @example
 * ```tsx
 * const {
 *   selectedFiles,
 *   addFiles,
 *   removeFile,
 *   upload,
 *   isUploading,
 *   uploadId,
 * } = useFileUpload();
 *
 * // Handle file selection from dropzone
 * <FileDropzone
 *   onFilesSelected={addFiles}
 *   selectedFiles={selectedFiles}
 *   onRemoveFile={removeFile}
 * />
 *
 * // Upload when ready
 * const handleUpload = async () => {
 *   const result = await upload();
 *   console.log('Upload ID:', result.upload_id);
 * };
 * ```
 */
export function useFileUpload(): UseFileUploadReturn {
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadId, setUploadId] = useState<string | null>(null);

  const addFiles = useCallback((files: File[]) => {
    const newSelectedFiles = files.map((file) => ({
      file,
      id: `file-${++fileIdCounter}`,
    }));
    setSelectedFiles((prev) => [...prev, ...newSelectedFiles]);
    setError(null);
  }, []);

  const removeFile = useCallback((id: string) => {
    setSelectedFiles((prev) => prev.filter((sf) => sf.id !== id));
  }, []);

  const clearFiles = useCallback(() => {
    setSelectedFiles([]);
    setUploadId(null);
    setError(null);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const upload = useCallback(async (): Promise<UploadResponse> => {
    if (selectedFiles.length === 0) {
      throw new Error('No files selected');
    }

    setIsUploading(true);
    setError(null);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      selectedFiles.forEach((sf) => {
        formData.append('files', sf.file);
      });

      // Use XMLHttpRequest for progress tracking
      const response = await new Promise<UploadResponse>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            setUploadProgress(percent);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const result = JSON.parse(xhr.responseText);
              resolve(result);
            } catch {
              reject(new Error('Invalid response from server'));
            }
          } else {
            try {
              const errorData = JSON.parse(xhr.responseText);
              reject(new Error(errorData.detail || 'Upload failed'));
            } catch {
              reject(new Error(`Upload failed: ${xhr.statusText}`));
            }
          }
        };

        xhr.onerror = () => {
          reject(new Error('Network error during upload'));
        };

        xhr.open('POST', '/api/v1/files/upload');
        xhr.send(formData);
      });

      setUploadId(response.upload_id);
      setUploadProgress(100);
      return response;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setError(message);
      throw err;
    } finally {
      setIsUploading(false);
    }
  }, [selectedFiles]);

  return {
    selectedFiles,
    addFiles,
    removeFile,
    clearFiles,
    upload,
    uploadProgress,
    isUploading,
    error,
    clearError,
    uploadId,
  };
}
