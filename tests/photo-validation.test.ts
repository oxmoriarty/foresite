import { describe, it, expect } from "vitest";
import {
  validatePhotoFile,
  formatBytes,
  createPhotoPreviewUrl,
  revokePhotoPreviewUrl,
  MAX_PHOTO_SIZE_BYTES,
} from "../src/services/photoValidation";

describe("ForeSite Photo Evidence Validation Service", () => {
  it("accepts valid JPEG photograph files within size limits", () => {
    const file = new File(["dummy-jpeg-content"], "pier_foundation.jpg", {
      type: "image/jpeg",
    });
    const result = validatePhotoFile(file);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("accepts valid PNG photograph files within size limits", () => {
    const file = new File(["dummy-png-content"], "rebar_spacing.png", {
      type: "image/png",
    });
    const result = validatePhotoFile(file);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("accepts valid WebP photograph files within size limits", () => {
    const file = new File(["dummy-webp-content"], "crack_detail.webp", {
      type: "image/webp",
    });
    const result = validatePhotoFile(file);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("rejects empty files with 0 bytes", () => {
    const file = new File([], "empty.jpg", { type: "image/jpeg" });
    const result = validatePhotoFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("empty (0 bytes)");
  });

  it("rejects files exceeding the 10 MB size limit", () => {
    // Simulate oversized file (11 Megabytes)
    const oversizedBytes = new Uint8Array(MAX_PHOTO_SIZE_BYTES + 1024 * 1024);
    const file = new File([oversizedBytes], "huge_drone_aerial.jpg", {
      type: "image/jpeg",
    });
    const result = validatePhotoFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("exceeds the maximum allowed limit of 10.00 MB");
  });

  it("rejects unsupported MIME types (e.g. GIF, PDF, SVG, video)", () => {
    const gifFile = new File(["gif-data"], "site_animation.gif", { type: "image/gif" });
    const pdfFile = new File(["pdf-data"], "structural_drawing.pdf", { type: "application/pdf" });
    const svgFile = new File(["<svg></svg>"], "blueprint.svg", { type: "image/svg+xml" });

    expect(validatePhotoFile(gifFile).valid).toBe(false);
    expect(validatePhotoFile(pdfFile).valid).toBe(false);
    expect(validatePhotoFile(svgFile).valid).toBe(false);

    const errorMsg = validatePhotoFile(gifFile).error;
    expect(errorMsg).toContain("Unsupported image format");
  });

  it("rejects mismatched file extensions (e.g. executable with image MIME)", () => {
    const spoofedFile = new File(["echo bad"], "malicious_script.exe", {
      type: "image/jpeg",
    });
    const result = validatePhotoFile(spoofedFile);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Unsupported image format");
  });

  it("formats file size bytes accurately into human-readable strings", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(1048576 * 2.5)).toBe("2.50 MB");
    expect(formatBytes(MAX_PHOTO_SIZE_BYTES)).toBe("10.00 MB");
  });

  it("creates and revokes object preview URLs safely without throwing", () => {
    const blob = new Blob(["preview-binary-data"], { type: "image/jpeg" });
    const url = createPhotoPreviewUrl(blob);
    expect(url).toContain("blob:");

    // Revocation should not throw
    expect(() => revokePhotoPreviewUrl(url)).not.toThrow();
  });
});
