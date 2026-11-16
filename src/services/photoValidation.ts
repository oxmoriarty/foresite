/**
 * ForeSite Photo Evidence Validation & Formatting Service
 *
 * Enforces strict client-side validation for site photograph evidence:
 * - Allowed MIME types: image/jpeg, image/png, image/webp
 * - Maximum file size: 10 MB (10 * 1024 * 1024 bytes)
 * - Object URL lifecycle management (creation & revocation)
 */

import { SupportedPhotoMimeType, PhotoValidationResult } from "../types";

export const SUPPORTED_PHOTO_MIME_TYPES: readonly SupportedPhotoMimeType[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const MAX_PHOTO_SIZE_BYTES = 10 * 1024 * 1024; // 10 Megabytes

export const SUPPORTED_EXTENSIONS: readonly string[] = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
] as const;

/**
 * Format bytes into readable KB / MB string
 */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Validates an uploaded photo file against MIME type, extension, and file size constraints.
 */
export function validatePhotoFile(file: File): PhotoValidationResult {
  if (!file) {
    return { valid: false, error: "No file was selected." };
  }

  // 1. Check for empty file
  if (file.size === 0) {
    return { valid: false, error: "The selected photo file is empty (0 bytes)." };
  }

  // 2. Check maximum file size (10 MB)
  if (file.size > MAX_PHOTO_SIZE_BYTES) {
    return {
      valid: false,
      error: `File size (${formatBytes(file.size)}) exceeds the maximum allowed limit of ${formatBytes(MAX_PHOTO_SIZE_BYTES)}.`,
    };
  }

  // 3. Check MIME type
  const normalizedType = file.type.toLowerCase();
  const isValidMime = (SUPPORTED_PHOTO_MIME_TYPES as readonly string[]).includes(normalizedType);

  // 4. Check extension
  const fileName = file.name.toLowerCase();
  const hasValidExt = SUPPORTED_EXTENSIONS.some((ext) => fileName.endsWith(ext));

  if (!isValidMime || !hasValidExt) {
    return {
      valid: false,
      error: `Unsupported image format (${file.type || "unknown"}). Only JPEG (.jpg, .jpeg), PNG (.png), and WebP (.webp) images are accepted.`,
    };
  }

  return { valid: true };
}

/**
 * Creates a browser object URL for instant, memory-efficient photo preview.
 * Always revoke with revokePhotoPreviewUrl when the component unmounts.
 */
export function createPhotoPreviewUrl(blob: Blob): string {
  if (typeof window !== "undefined" && window.URL && window.URL.createObjectURL) {
    return window.URL.createObjectURL(blob);
  }
  return "";
}

/**
 * Revokes a previously created object URL to free memory.
 */
export function revokePhotoPreviewUrl(url: string): void {
  if (url && typeof window !== "undefined" && window.URL && window.URL.revokeObjectURL) {
    try {
      window.URL.revokeObjectURL(url);
    } catch {
      // Ignore cleanup error if already revoked
    }
  }
}
