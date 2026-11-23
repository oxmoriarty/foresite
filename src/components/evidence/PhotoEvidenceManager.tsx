/**
 * ForeSite Photographic Evidence Manager
 *
 * Implements local photo evidence workflows:
 * - File picker & drag-and-drop photo intake
 * - Format (JPEG, PNG, WebP) and size (<= 10 MB) validation
 * - Direct Blob persistence in IndexedDB ('evidencePhotos')
 * - Thumbnail preview generation with automatic URL revocation
 * - High-resolution inspection modal
 * - Deletion with local storage cleanup
 * - Local-only retention disclosure
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Image as ImageIcon,
  UploadCloud,
  Trash2,
  Maximize2,
  AlertCircle,
  Calendar,
  X,
} from "lucide-react";
import { LocalEvidencePhoto, SupportedPhotoMimeType } from "../../types";
import {
  saveEvidencePhoto,
  deleteEvidencePhoto,
} from "../../services/indexeddb";
import {
  validatePhotoFile,
  formatBytes,
  createPhotoPreviewUrl,
  revokePhotoPreviewUrl,
} from "../../services/photoValidation";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";

export interface PhotoEvidenceManagerProps {
  inspectionId: string;
  projectId: string;
  photos: LocalEvidencePhoto[];
  onPhotosChange: (photos: LocalEvidencePhoto[]) => void;
  readOnly?: boolean;
}

export const PhotoEvidenceManager: React.FC<PhotoEvidenceManagerProps> = ({
  inspectionId,
  projectId,
  photos,
  onPhotosChange,
  readOnly = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [selectedPhotoForView, setSelectedPhotoForView] = useState<LocalEvidencePhoto | null>(null);
  const [photoToDelete, setPhotoToDelete] = useState<LocalEvidencePhoto | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [savingPhoto, setSavingPhoto] = useState(false);

  // Generate and manage object preview URLs for blobs
  useEffect(() => {
    const urls: Record<string, string> = {};
    for (const photo of photos) {
      if (photo.blob) {
        urls[photo.id] = createPhotoPreviewUrl(photo.blob);
      }
    }
    setPreviewUrls(urls);

    return () => {
      // Clean up object URLs on unmount or photo list change
      Object.values(urls).forEach((url) => revokePhotoPreviewUrl(url));
    };
  }, [photos]);

  const handleProcessFiles = useCallback(
    async (fileList: FileList | File[]) => {
      setValidationError(null);
      const files = Array.from(fileList);
      if (files.length === 0) return;

      setSavingPhoto(true);
      const newPhotos: LocalEvidencePhoto[] = [];
      const errors: string[] = [];

      for (const file of files) {
        const validation = validatePhotoFile(file);
        if (!validation.valid) {
          errors.push(`${file.name}: ${validation.error}`);
          continue;
        }

        const photoId = `photo-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const photoRecord: LocalEvidencePhoto = {
          id: photoId,
          inspectionId,
          projectId,
          blob: file,
          fileName: file.name,
          fileSizeBytes: file.size,
          mimeType: file.type.toLowerCase() as SupportedPhotoMimeType,
          capturedAt: file.lastModified || Date.now(),
          createdAt: Date.now(),
        };

        try {
          await saveEvidencePhoto(photoRecord);
          newPhotos.push(photoRecord);
        } catch (err: unknown) {
          const e = err as Error;
          errors.push(`Failed to save ${file.name}: ${e.message}`);
        }
      }

      setSavingPhoto(false);

      if (errors.length > 0) {
        setValidationError(errors.join(" | "));
      }

      if (newPhotos.length > 0) {
        onPhotosChange([...photos, ...newPhotos]);
      }
    },
    [inspectionId, projectId, photos, onPhotosChange]
  );

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleProcessFiles(e.target.files);
    }
    // Reset file input value to allow re-uploading the same file if needed
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!readOnly) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!readOnly && e.dataTransfer.files) {
      handleProcessFiles(e.dataTransfer.files);
    }
  };

  const confirmDeletePhoto = async () => {
    if (!photoToDelete) return;
    try {
      await deleteEvidencePhoto(photoToDelete.id);
      const url = previewUrls[photoToDelete.id];
      if (url) {
        revokePhotoPreviewUrl(url);
      }
      onPhotosChange(photos.filter((p) => p.id !== photoToDelete.id));
      setPhotoToDelete(null);
    } catch (err) {
      console.error("Photo deletion error:", err);
    }
  };

  return (
    <div className="space-y-4">
      {/* Validation Error Banner */}
      {validationError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold block">Image Validation Notice</span>
            <span>{validationError}</span>
          </div>
          <button
            type="button"
            onClick={() => setValidationError(null)}
            className="text-red-500 hover:text-red-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Upload Dropzone */}
      {!readOnly && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={handleFileInputChange}
            className="hidden"
            id="photo-file-upload-input"
          />

          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${
              isDragging
                ? "border-brand-500 bg-brand-50/50"
                : "border-slate-300 hover:border-brand-400 bg-slate-50/50 hover:bg-slate-50"
            }`}
          >
            <div className="flex flex-col items-center justify-center gap-2">
              <div className="p-2.5 bg-brand-100 text-brand-600 rounded-full">
                {savingPhoto ? (
                  <UploadCloud className="w-5 h-5 animate-bounce" />
                ) : (
                  <ImageIcon className="w-5 h-5" />
                )}
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-800">
                  {savingPhoto ? "Saving image evidence..." : "Click or drag images to attach evidence"}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Supported formats: JPEG, PNG, WebP • Maximum size: 10 MB per image
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Photos Thumbnail Grid */}
      {photos.length === 0 ? (
        <div className="py-6 text-center text-xs text-slate-400 italic bg-white border border-slate-200 rounded-lg">
          No image evidence attached yet.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {photos.map((photo) => {
            const previewUrl = previewUrls[photo.id];
            return (
              <div
                key={photo.id}
                className="group relative bg-white border border-slate-200 rounded-lg overflow-hidden shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between"
              >
                {/* Photo Thumbnail */}
                <div className="relative aspect-4/3 bg-slate-100 overflow-hidden">
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt={photo.fileName}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">
                      Loading...
                    </div>
                  )}

                  {/* Overlay Action Buttons */}
                  <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedPhotoForView(photo)}
                      className="p-1.5 bg-white/90 hover:bg-white text-slate-800 rounded-md shadow-xs transition-colors"
                      title="View Full Resolution"
                      aria-label={`View full resolution of ${photo.fileName}`}
                    >
                      <Maximize2 className="w-4 h-4" />
                    </button>
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => setPhotoToDelete(photo)}
                        className="p-1.5 bg-red-600/90 hover:bg-red-600 text-white rounded-md shadow-xs transition-colors"
                        title="Delete Photograph"
                        aria-label={`Delete photo ${photo.fileName}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Photo Metadata Footer */}
                <div className="p-2 bg-white text-[11px] space-y-0.5 border-t border-slate-100">
                  <p className="font-semibold text-slate-800 truncate" title={photo.fileName}>
                    {photo.fileName}
                  </p>
                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span>{formatBytes(photo.fileSizeBytes)}</span>
                    <span className="flex items-center gap-0.5">
                      <Calendar className="w-2.5 h-2.5" />
                      {new Date(photo.capturedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full-Resolution Photo Inspection Modal */}
      <Modal
        isOpen={Boolean(selectedPhotoForView)}
        onClose={() => setSelectedPhotoForView(null)}
        title={selectedPhotoForView?.fileName || "Photographic Evidence"}
        maxWidth="lg"
      >
        {selectedPhotoForView && (
          <div className="space-y-3">
            <div className="max-h-[65vh] overflow-hidden rounded-lg bg-slate-950 flex items-center justify-center">
              {previewUrls[selectedPhotoForView.id] && (
                <img
                  src={previewUrls[selectedPhotoForView.id]}
                  alt={selectedPhotoForView.fileName}
                  className="max-h-[65vh] w-auto object-contain mx-auto"
                />
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-2.5 bg-slate-50 rounded-lg text-xs text-slate-600">
              <div>
                <span className="block text-[10px] uppercase font-semibold text-slate-400">
                  File Name
                </span>
                <span className="truncate font-medium text-slate-800 block">
                  {selectedPhotoForView.fileName}
                </span>
              </div>
              <div>
                <span className="block text-[10px] uppercase font-semibold text-slate-400">
                  File Size
                </span>
                <span className="font-medium text-slate-800">
                  {formatBytes(selectedPhotoForView.fileSizeBytes)}
                </span>
              </div>
              <div>
                <span className="block text-[10px] uppercase font-semibold text-slate-400">
                  MIME Format
                </span>
                <span className="font-medium text-slate-800">
                  {selectedPhotoForView.mimeType}
                </span>
              </div>
              <div>
                <span className="block text-[10px] uppercase font-semibold text-slate-400">
                  Captured Date
                </span>
                <span className="font-medium text-slate-800">
                  {new Date(selectedPhotoForView.capturedAt).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Photo Confirmation Modal */}
      <Modal
        isOpen={Boolean(photoToDelete)}
        onClose={() => setPhotoToDelete(null)}
        title="Confirm Image Deletion"
        footer={
          <>
            <Button variant="outline" size="md" onClick={() => setPhotoToDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" size="md" onClick={confirmDeletePhoto}>
              Delete Image
            </Button>
          </>
        }
      >
        <div className="space-y-2 text-xs text-slate-700">
          <p>
            Are you sure you want to permanently delete this image?
          </p>
          <div className="p-2 bg-slate-100 rounded text-slate-800 font-mono text-[11px]">
            {photoToDelete?.fileName} ({formatBytes(photoToDelete?.fileSizeBytes || 0)})
          </div>
          <p className="text-slate-500">
            This action cannot be undone. Any local inspection draft referencing this image will no longer be able to display it.
          </p>
        </div>
      </Modal>
    </div>
  );
};
