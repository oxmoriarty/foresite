/**
 * ForeSite Hybrid AI Service Layer
 *
 * Implements the approved Two-Mode Hybrid Inference Strategy using Firebase AI Logic:
 * - Mode A (Setting ON): PREFER_ON_DEVICE targeting gemini-3.5-flash-lite fallback.
 *   Initializes on-device model with non-blocking .catch() and does NOT await download.
 * - Mode B (Setting OFF - Default): ONLY_ON_DEVICE initial attempt.
 *   Awaits initializeDeviceModel() with progress reporting. Halts before network transmission
 *   if local model is unavailable and requests explicit consent via CloudConsentModal.
 *   Only dispatches ONLY_IN_CLOUD (gemini-3.5-flash-lite) upon confirmed user consent.
 * - Strict 4 MB AI derivative payload ceiling with dynamic downscaling.
 * - Client-side pre-validation: only JPEG and PNG supported for AI inference.
 * - Source transparency: resolves actual .inferenceSource metadata from SDK response.
 */

import {
  AIError,
  AIErrorCode,
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  InferenceSource,
  Part,
} from "firebase/ai";
import { app } from "../lib/firebase";
import {
  AIInspectionDraftResult,
  CloudFallbackPreference,
  InferenceSource as AppInferenceSource,
} from "../types";
import { parseAndValidateAIOutput } from "./aiValidation";
import { formatBytes } from "./photoValidation";

export const CLOUD_FALLBACK_MODEL = "gemini-3.5-flash-lite";
export const MAX_AI_PAYLOAD_BYTES = 4 * 1024 * 1024; // Strict 4 MB ceiling
export const INITIAL_MAX_DIMENSION = 1600;
export const INITIAL_JPEG_QUALITY = 0.85;
export const FALLBACK_MAX_DIMENSION = 1200;
export const FALLBACK_JPEG_QUALITY = 0.75;

export const FORESITE_AI_SYSTEM_INSTRUCTION = `You are ForeSite AI, an assistant for construction site inspectors.
Your role is to analyze a construction site photograph and optional inspector field notes to generate an initial, preliminary inspection draft.

CRITICAL SAFETY & GOVERNANCE BOUNDARIES:
1. You are generating a PRELIMINARY DRAFT ONLY. All fields must be reviewed, verified, and explicitly approved or edited by an authenticated human inspector.
2. NEVER certify building code, regulatory, or OSHA compliance.
3. NEVER declare a site, structure, equipment, or condition "safe" or "unsafe".
4. NEVER estimate physical dimensions, structural load capacities, or material grades without qualifying that they are estimates requiring physical field verification.
5. NEVER infer hidden, concealed, or non-visible defects. Describe visible physical evidence ONLY.
6. The aiDisclaimer field MUST be exactly "AI_DRAFT_REQUIRES_HUMAN_REVIEW".

You must output a single valid JSON object conforming exactly to this schema:
{
  "title": "Concise summary of visible condition (max 120 characters)",
  "observation": "Objective, detailed description of visible physical condition",
  "category": "one of: structural, electrical, plumbing, hvac, fire_safety, general, environmental, finishes",
  "visibleEvidence": ["Concrete physical item 1", "Concrete physical item 2"],
  "uncertainties": ["Non-visible factor 1", "Condition needing physical check"],
  "inspectorFollowUp": ["Action recommendation for human inspector"],
  "aiDisclaimer": "AI_DRAFT_REQUIRES_HUMAN_REVIEW"
}`;

/**
 * Resolves the verified SDK inference source metadata into the application domain type.
 * Never guesses from latency, browser version, or network state.
 */
export function resolveInferenceSource(rawSource: unknown): AppInferenceSource {
  if (
    rawSource === InferenceSource.ON_DEVICE ||
    rawSource === "ON_DEVICE" ||
    rawSource === "on_device"
  ) {
    return "ON_DEVICE";
  }
  if (
    rawSource === InferenceSource.IN_CLOUD ||
    rawSource === "IN_CLOUD" ||
    rawSource === "in_cloud"
  ) {
    return "IN_CLOUD";
  }
  return "UNKNOWN";
}

/**
 * Checks if an error corresponds to API rate limiting or quota exhaustion (HTTP 429).
 */
export function isQuotaExceededError(err: unknown): boolean {
  if (!err) return false;
  const str = String(err);
  return (
    str.includes("429") ||
    str.includes("RESOURCE_EXHAUSTED") ||
    str.toLowerCase().includes("quota")
  );
}

/**
 * Classifies whether an error encountered during Mode B on-device execution
 * represents an explicitly recognized, documented local model unavailability condition.
 *
 * Requirements:
 * 1. Prefer typed errors (AIError) and stable SDK error codes (AIErrorCode.UNSUPPORTED).
 * 2. Fail closed on arbitrary JavaScript errors (TypeError, RangeError, SyntaxError),
 *    aborts, and undocumented failures.
 * 3. Never offer cloud consent for unknown or undocumented errors.
 */
export function isDocumentedLocalModelUnavailability(err: unknown): boolean {
  if (!err) return false;

  // 1. Explicitly reject standard JavaScript runtime exceptions and aborts
  if (
    err instanceof TypeError ||
    err instanceof RangeError ||
    err instanceof SyntaxError ||
    err instanceof ReferenceError ||
    err instanceof URIError
  ) {
    return false;
  }

  // 2. Reject AbortError (DOMException or Error with name "AbortError")
  if (typeof err === "object" && "name" in err && (err as { name?: string }).name === "AbortError") {
    return false;
  }

  // 3. Documented Firebase AI Logic SDK errors: AIError with AIErrorCode.UNSUPPORTED
  // Thrown by SDK when ONLY_ON_DEVICE is requested but model/browser is unsupported
  if (err instanceof AIError) {
    return err.code === AIErrorCode.UNSUPPORTED;
  }

  // 4. Documented browser DOMException when Chrome Prompt API is not supported on this platform/hardware
  if (typeof DOMException !== "undefined" && err instanceof DOMException) {
    return err.name === "NotSupportedError";
  }

  // 5. Cross-realm or wrapped error with code property matching SDK unsupported code
  if (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as { code: unknown }).code === "string"
  ) {
    const code = (err as { code: string }).code;
    if (code === AIErrorCode.UNSUPPORTED || code === "ai/unsupported") {
      return true;
    }
  }

  // Fail closed: Unknown errors do NOT qualify as documented local model unavailability
  return false;
}

export interface DownscaledImageResult {
  base64: string;
  mimeType: "image/jpeg";
  sizeBytes: number;
}

/**
 * Ephemeral client-side image downscaling utility.
 *
 * Preserves the original Blob untouched in IndexedDB.
 * Scales image on an offscreen HTML Canvas and enforces a strict 4 MB payload ceiling.
 * Dynamically re-encodes if the primary derivative exceeds 4 MB.
 * Rejects client-side if still exceeding the ceiling.
 */
export async function downscaleImageForAI(blob: Blob): Promise<DownscaledImageResult> {
  if (!blob || blob.size === 0) {
    throw new Error("Cannot process an empty or invalid photograph.");
  }

  const rawMime = (blob.type || "").toLowerCase();
  if (rawMime !== "image/jpeg" && rawMime !== "image/png") {
    throw new Error(
      `Unsupported image format ("${blob.type || "unknown"}"). Multimodal AI drafting requires JPEG or PNG images. Please attach a valid JPEG or PNG photograph.`
    );
  }

  // Handle environments where Canvas / DOM Image is available
  if (typeof window !== "undefined" && typeof document !== "undefined" && typeof Image !== "undefined") {
    const objectUrl = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Failed to load photograph into memory for downscaling."));
        image.src = objectUrl;
      });

      // Canvas downscaling helper
      const renderToJpeg = (maxDim: number, quality: number): { base64: string; sizeBytes: number } => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          throw new Error("Unable to create 2D canvas context for image downscaling.");
        }
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, "");
        // Calculate decoded byte length from base64
        const sizeBytes = Math.round((base64.length * 3) / 4);
        return { base64, sizeBytes };
      };

      // 1. Initial attempt: max 1600px, quality 0.85
      const primary = renderToJpeg(INITIAL_MAX_DIMENSION, INITIAL_JPEG_QUALITY);
      if (primary.sizeBytes <= MAX_AI_PAYLOAD_BYTES) {
        return {
          base64: primary.base64,
          mimeType: "image/jpeg",
          sizeBytes: primary.sizeBytes,
        };
      }

      // 2. Dynamic downscale fallback: max 1200px, quality 0.75
      const secondary = renderToJpeg(FALLBACK_MAX_DIMENSION, FALLBACK_JPEG_QUALITY);
      if (secondary.sizeBytes <= MAX_AI_PAYLOAD_BYTES) {
        return {
          base64: secondary.base64,
          mimeType: "image/jpeg",
          sizeBytes: secondary.sizeBytes,
        };
      }

      // 3. Controlled rejection if still exceeding ceiling
      throw new Error(
        `Optimized photograph size (${formatBytes(secondary.sizeBytes)}) exceeds the 4 MB limit for AI processing. Please attach a smaller image.`
      );
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  // Fallback for non-browser / test environment: direct arrayBuffer conversion
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  const base64 = btoa(binary);
  const sizeBytes = bytes.byteLength;

  if (sizeBytes > MAX_AI_PAYLOAD_BYTES) {
    throw new Error(
      `Photograph derivative size (${formatBytes(sizeBytes)}) exceeds the 4 MB safety limit for AI processing.`
    );
  }

  return {
    base64,
    mimeType: "image/jpeg",
    sizeBytes,
  };
}

export interface GenerateInspectionDraftOptions {
  photoBlob: Blob;
  notes?: string;
  preferenceSnapshot: CloudFallbackPreference;
  requestConsent: () => Promise<boolean>;
  onDownloadProgress?: (percentage: number) => void;
}

/**
 * Main Hybrid AI Inspection Draft Generator
 *
 * Implements Mode A (PREFER_ON_DEVICE) and Mode B (ONLY_ON_DEVICE with consent-gated cloud fallback).
 */
export async function generateInspectionDraft(
  options: GenerateInspectionDraftOptions
): Promise<AIInspectionDraftResult> {
  const { photoBlob, notes, preferenceSnapshot, requestConsent, onDownloadProgress } = options;

  // 1. Client-Side Pre-validation & Ephemeral Downscaling
  // Invalid image input halts immediately and NEVER triggers AI inference or automatic cloud fallback.
  const derivative = await downscaleImageForAI(photoBlob);

  const imagePart: Part = {
    type: "inlineData",
    inlineData: {
      data: derivative.base64,
      mimeType: derivative.mimeType,
    },
  };

  const textPrompt = `Inspector Field Notes: ${notes?.trim() || "No additional field notes provided."}\n\nPlease analyze the attached site photograph and generate the preliminary inspection draft in JSON.`;

  // Initialize Firebase AI Logic with Google AI Developer backend
  const ai = getAI(app, { backend: new GoogleAIBackend() });

  // 2. Branch according to the immutable click-time preference snapshot
  if (preferenceSnapshot.enabled) {
    // =========================================================================
    // Mode A: Automatic Cloud Fallback ON (PREFER_ON_DEVICE)
    // =========================================================================
    const autoFallbackModel = getGenerativeModel(ai, {
      mode: InferenceMode.PREFER_ON_DEVICE,
      systemInstruction: FORESITE_AI_SYSTEM_INSTRUCTION,
      inCloudParams: {
        model: CLOUD_FALLBACK_MODEL,
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
      },
    });

    // Call initializeDeviceModel() with non-blocking .catch() handler.
    // Do NOT await download completion before submitting request.
    autoFallbackModel.initializeDeviceModel().catch((initErr: unknown) => {
      console.warn("Mode A background device model initialization warning:", initErr);
    });

    const result = await autoFallbackModel.generateContent([textPrompt, imagePart]);
    const responseText = result.response.text();
    const resolvedSource = resolveInferenceSource(result.response.inferenceSource);
    const draft = parseAndValidateAIOutput(responseText);

    return {
      draft,
      inferenceSource: resolvedSource,
      rawResponse: responseText,
    };
  } else {
    // =========================================================================
    // Mode B: Automatic Cloud Fallback OFF (Consent-Controlled Mode - Default)
    // =========================================================================
    const onDeviceOnlyModel = getGenerativeModel(ai, {
      mode: InferenceMode.ONLY_ON_DEVICE,
      systemInstruction: FORESITE_AI_SYSTEM_INSTRUCTION,
    });

    let onDeviceSuccess = false;
    let onDeviceResultText = "";
    let onDeviceSource: AppInferenceSource = "ON_DEVICE";

    try {
      // Call and AWAIT initializeDeviceModel(), exposing download progress to UI
      await onDeviceOnlyModel.initializeDeviceModel((progressValue: number) => {
        if (onDownloadProgress) {
          onDownloadProgress(Math.min(100, Math.max(0, Math.round(progressValue * 100))));
        }
      });

      // Submit strictly on-device inference request
      const localResult = await onDeviceOnlyModel.generateContent([textPrompt, imagePart]);
      onDeviceResultText = localResult.response.text();
      onDeviceSource = resolveInferenceSource(localResult.response.inferenceSource);
      if (onDeviceSource === "UNKNOWN") {
        onDeviceSource = "ON_DEVICE";
      }
      onDeviceSuccess = true;
    } catch (localErr: unknown) {
      if (isDocumentedLocalModelUnavailability(localErr)) {
        console.warn("Mode B: Recognized documented local model unavailability:", localErr);
        onDeviceSuccess = false;
      } else {
        // Fail closed: do NOT treat arbitrary runtime exceptions, TypeErrors, or aborts as local model unavailability
        console.error("Mode B on-device execution error (undocumented/runtime failure):", localErr);
        throw localErr;
      }
    }

    if (onDeviceSuccess) {
      const draft = parseAndValidateAIOutput(onDeviceResultText);
      return {
        draft,
        inferenceSource: onDeviceSource,
        rawResponse: onDeviceResultText,
      };
    }

    // On-device execution failed or was unavailable due to documented local model unavailability.
    // HALT network transmission immediately before contacting the cloud!
    const consented = await requestConsent();

    if (!consented) {
      throw new Error(
        "INSPECTOR_DECLINED_CLOUD_PROCESSING: Cloud AI processing was declined. Photographs and notes were not transmitted to Gemini for AI processing. Manual drafting remains active, and ordinary Firestore synchronization continues normally."
      );
    }

    // Explicit consent granted for this single request: dispatch ONLY_IN_CLOUD
    const cloudOnlyModel = getGenerativeModel(ai, {
      mode: InferenceMode.ONLY_IN_CLOUD,
      systemInstruction: FORESITE_AI_SYSTEM_INSTRUCTION,
      inCloudParams: {
        model: CLOUD_FALLBACK_MODEL,
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
      },
    });

    const cloudResult = await cloudOnlyModel.generateContent([textPrompt, imagePart]);
    const cloudResponseText = cloudResult.response.text();
    const draft = parseAndValidateAIOutput(cloudResponseText);

    return {
      draft,
      inferenceSource: "IN_CLOUD",
      rawResponse: cloudResponseText,
    };
  }
}
