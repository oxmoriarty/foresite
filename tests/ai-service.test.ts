import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateInspectionDraft,
  downscaleImageForAI,
  resolveInferenceSource,
  isQuotaExceededError,
  isDocumentedLocalModelUnavailability,
  CLOUD_FALLBACK_MODEL,
} from "../src/services/ai";
import { AI_DISCLAIMER_CONSTANT } from "../src/services/aiValidation";
import { AIError, AIErrorCode, InferenceMode, InferenceSource } from "firebase/ai";
import { CloudFallbackPreference } from "../src/types";

// Mock Firebase AI Logic SDK
const mockInitializeDeviceModel = vi.fn();
const mockGenerateContent = vi.fn();
const mockGetGenerativeModel = vi.fn();

vi.mock("firebase/ai", () => {
  class MockAIError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
      this.name = "AIError";
    }
  }

  return {
    AIError: MockAIError,
    AIErrorCode: {
      UNSUPPORTED: "unsupported",
      NO_MODEL: "no-model",
      ERROR: "error",
      FETCH_ERROR: "fetch-error",
      API_NOT_ENABLED: "api-not-enabled",
      INVALID_SCHEMA: "invalid-schema",
      INVALID_CONTENT: "invalid-content",
    },
    getAI: vi.fn(() => ({})),
    GoogleAIBackend: vi.fn(),
    InferenceMode: {
      PREFER_ON_DEVICE: "prefer_on_device",
      ONLY_ON_DEVICE: "only_on_device",
      ONLY_IN_CLOUD: "only_in_cloud",
      PREFER_IN_CLOUD: "prefer_in_cloud",
    },
    InferenceSource: {
      ON_DEVICE: "on_device",
      IN_CLOUD: "in_cloud",
    },
    getGenerativeModel: vi.fn((ai, params) => mockGetGenerativeModel(ai, params)),
  };
});

vi.mock("../src/lib/firebase", () => ({
  app: {},
}));

describe("ForeSite Hybrid AI Service", () => {
  const validMockResponseJson = JSON.stringify({
    title: "Rebar Cover Clearance Inspection",
    observation: "Bottom rebar mat chairs maintain 75mm clear cover over footing vapor barrier.",
    category: "structural",
    visibleEvidence: ["Continuous bar chairs at 900mm spacing", "Clean rebar without flake rust"],
    uncertainties: ["Mill certification for epoxy coating"],
    inspectorFollowUp: ["Cross-check bar spacing with sheet S-201"],
    aiDisclaimer: AI_DISCLAIMER_CONSTANT,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockInitializeDeviceModel.mockResolvedValue(undefined);
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => validMockResponseJson,
        inferenceSource: InferenceSource.ON_DEVICE,
      },
    });

    mockGetGenerativeModel.mockReturnValue({
      initializeDeviceModel: mockInitializeDeviceModel,
      generateContent: mockGenerateContent,
    });
  });

  describe("Input Pre-validation & Payload Safeguards", () => {
    it("accepts image/jpeg and image/png formats", async () => {
      const jpegBlob = new Blob(["mock-jpeg-bytes"], { type: "image/jpeg" });
      const pngBlob = new Blob(["mock-png-bytes"], { type: "image/png" });

      const resJpeg = await downscaleImageForAI(jpegBlob);
      expect(resJpeg.mimeType).toBe("image/jpeg");
      expect(resJpeg.base64).toBeDefined();

      const resPng = await downscaleImageForAI(pngBlob);
      expect(resPng.mimeType).toBe("image/jpeg");
      expect(resPng.base64).toBeDefined();
    });

    it("rejects unsupported MIME types client-side before SDK interaction", async () => {
      const webpBlob = new Blob(["mock-webp-bytes"], { type: "image/webp" });
      await expect(downscaleImageForAI(webpBlob)).rejects.toThrow(
        /Unsupported image format/
      );

      const pdfBlob = new Blob(["mock-pdf-bytes"], { type: "application/pdf" });
      await expect(downscaleImageForAI(pdfBlob)).rejects.toThrow(
        /Unsupported image format/
      );
    });

    it("rejects empty photographs (0 bytes)", async () => {
      const emptyBlob = new Blob([], { type: "image/jpeg" });
      await expect(downscaleImageForAI(emptyBlob)).rejects.toThrow(
        /Cannot process an empty or invalid photograph/
      );
    });

    it("preserves original photograph Blob untouched in memory", async () => {
      const originalContent = "original-high-res-raw-blob-content";
      const originalBlob = new Blob([originalContent], { type: "image/jpeg" });
      const originalSize = originalBlob.size;

      await downscaleImageForAI(originalBlob);
      expect(originalBlob.size).toBe(originalSize);
    });

    it("enforces strict 4 MB ceiling on derivatives", async () => {
      const originalToDataURL = window.HTMLCanvasElement.prototype.toDataURL;
      window.HTMLCanvasElement.prototype.toDataURL = () => {
        return "data:image/jpeg;base64," + "A".repeat(6 * 1024 * 1024);
      };

      try {
        const testBlob = new Blob(["photo-bytes"], { type: "image/jpeg" });
        await expect(downscaleImageForAI(testBlob)).rejects.toThrow(
          /exceeds the 4 MB/
        );
      } finally {
        window.HTMLCanvasElement.prototype.toDataURL = originalToDataURL;
      }
    });
  });

  describe("Mode B Local Error Classification", () => {
    it("recognizes documented SDK AIError with AIErrorCode.UNSUPPORTED", () => {
      const sdkError = new AIError(
        AIErrorCode.UNSUPPORTED,
        "Inference mode is ONLY_ON_DEVICE, but an on-device model is not available."
      );
      expect(isDocumentedLocalModelUnavailability(sdkError)).toBe(true);
    });

    it("recognizes documented DOMException NotSupportedError from Prompt API", () => {
      const domError = new DOMException("Prompt API not supported on this platform.", "NotSupportedError");
      expect(isDocumentedLocalModelUnavailability(domError)).toBe(true);
    });

    it("rejects arbitrary JavaScript TypeErrors", () => {
      const typeError = new TypeError("Cannot read properties of undefined (reading 'prompt')");
      expect(isDocumentedLocalModelUnavailability(typeError)).toBe(false);
    });

    it("rejects DOMException AbortError", () => {
      const abortError = new DOMException("The operation was aborted.", "AbortError");
      expect(isDocumentedLocalModelUnavailability(abortError)).toBe(false);
    });

    it("rejects other standard errors (RangeError, SyntaxError)", () => {
      expect(isDocumentedLocalModelUnavailability(new RangeError("Index out of bounds"))).toBe(false);
      expect(isDocumentedLocalModelUnavailability(new SyntaxError("Unexpected token"))).toBe(false);
    });

    it("fails closed for unknown or undocumented errors", () => {
      expect(isDocumentedLocalModelUnavailability(new Error("Unknown local execution crash"))).toBe(false);
      expect(isDocumentedLocalModelUnavailability(null)).toBe(false);
      expect(isDocumentedLocalModelUnavailability(undefined)).toBe(false);
      expect(isDocumentedLocalModelUnavailability({ message: "arbitrary object" })).toBe(false);
    });
  });

  describe("Inference Source Resolution", () => {
    it("maps on-device SDK sources correctly", () => {
      expect(resolveInferenceSource(InferenceSource.ON_DEVICE)).toBe("ON_DEVICE");
      expect(resolveInferenceSource("ON_DEVICE")).toBe("ON_DEVICE");
      expect(resolveInferenceSource("on_device")).toBe("ON_DEVICE");
    });

    it("maps in-cloud SDK sources correctly", () => {
      expect(resolveInferenceSource(InferenceSource.IN_CLOUD)).toBe("IN_CLOUD");
      expect(resolveInferenceSource("IN_CLOUD")).toBe("IN_CLOUD");
      expect(resolveInferenceSource("in_cloud")).toBe("IN_CLOUD");
    });

    it("resolves undefined or unrecognized sources strictly to UNKNOWN", () => {
      expect(resolveInferenceSource(undefined)).toBe("UNKNOWN");
      expect(resolveInferenceSource(null)).toBe("UNKNOWN");
      expect(resolveInferenceSource("SOME_OTHER_VALUE")).toBe("UNKNOWN");
    });
  });

  describe("Mode A Pipeline (Automatic Cloud Fallback ON)", () => {
    const preferenceOn: CloudFallbackPreference = {
      enabled: true,
      source: "firestore",
      syncStatus: "synced",
    };

    it("configures PREFER_ON_DEVICE targeting gemini-3.5-flash-lite without awaiting model download", async () => {
      const photoBlob = new Blob(["photo-data"], { type: "image/jpeg" });
      const requestConsentMock = vi.fn().mockResolvedValue(true);

      const result = await generateInspectionDraft({
        photoBlob,
        notes: "Foundation check",
        preferenceSnapshot: preferenceOn,
        requestConsent: requestConsentMock,
      });

      expect(mockGetGenerativeModel).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          mode: InferenceMode.PREFER_ON_DEVICE,
          inCloudParams: expect.objectContaining({
            model: CLOUD_FALLBACK_MODEL,
          }),
        })
      );

      // Mode A does NOT prompt for consent
      expect(requestConsentMock).not.toHaveBeenCalled();

      // Model initialization called
      expect(mockInitializeDeviceModel).toHaveBeenCalled();

      expect(result.draft.title).toBe("Rebar Cover Clearance Inspection");
      expect(result.inferenceSource).toBe("ON_DEVICE");
    });
  });

  describe("Mode B Pipeline (Automatic Cloud Fallback OFF - Default)", () => {
    const preferenceOff: CloudFallbackPreference = {
      enabled: false,
      source: "default",
      syncStatus: "synced",
    };

    it("executes ONLY_ON_DEVICE when on-device inference succeeds", async () => {
      const photoBlob = new Blob(["photo-data"], { type: "image/jpeg" });
      const requestConsentMock = vi.fn().mockResolvedValue(true);
      const onProgressMock = vi.fn();

      mockInitializeDeviceModel.mockImplementationOnce((progressCb) => {
        if (progressCb) progressCb(0.75);
        return Promise.resolve();
      });

      const result = await generateInspectionDraft({
        photoBlob,
        notes: "Column check",
        preferenceSnapshot: preferenceOff,
        requestConsent: requestConsentMock,
        onDownloadProgress: onProgressMock,
      });

      expect(mockGetGenerativeModel).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          mode: InferenceMode.ONLY_ON_DEVICE,
        })
      );

      expect(onProgressMock).toHaveBeenCalledWith(75);
      expect(requestConsentMock).not.toHaveBeenCalled();
      expect(result.draft.category).toBe("structural");
    });

    it("prompts for consent when documented local model unavailability occurs", async () => {
      const photoBlob = new Blob(["photo-data"], { type: "image/jpeg" });
      const requestConsentMock = vi.fn().mockResolvedValue(true);

      // Documented SDK unavailability error
      mockGenerateContent.mockRejectedValueOnce(
        new AIError(AIErrorCode.UNSUPPORTED, "Inference mode is ONLY_ON_DEVICE, but an on-device model is not available.")
      );

      // Secondary cloud call succeeds
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () => validMockResponseJson,
          inferenceSource: InferenceSource.IN_CLOUD,
        },
      });

      const result = await generateInspectionDraft({
        photoBlob,
        notes: "Beam inspection",
        preferenceSnapshot: preferenceOff,
        requestConsent: requestConsentMock,
      });

      expect(requestConsentMock).toHaveBeenCalledTimes(1);

      // Second model instantiation is ONLY_IN_CLOUD targeting gemini-3.5-flash-lite
      expect(mockGetGenerativeModel).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({
          mode: InferenceMode.ONLY_IN_CLOUD,
          inCloudParams: expect.objectContaining({
            model: CLOUD_FALLBACK_MODEL,
          }),
        })
      );

      expect(result.inferenceSource).toBe("IN_CLOUD");
    });

    it("rethrows arbitrary TypeErrors without prompting for cloud consent", async () => {
      const photoBlob = new Blob(["photo-data"], { type: "image/jpeg" });
      const requestConsentMock = vi.fn().mockResolvedValue(true);

      // Arbitrary TypeError occurs during execution
      mockGenerateContent.mockRejectedValueOnce(new TypeError("Cannot read properties of null"));

      await expect(
        generateInspectionDraft({
          photoBlob,
          notes: "Crash inspection",
          preferenceSnapshot: preferenceOff,
          requestConsent: requestConsentMock,
        })
      ).rejects.toThrow(TypeError);

      // Cloud consent must NOT be requested for arbitrary runtime TypeErrors
      expect(requestConsentMock).not.toHaveBeenCalled();
      // ONLY_IN_CLOUD model must NOT be created
      expect(mockGetGenerativeModel).toHaveBeenCalledTimes(1);
    });

    it("rethrows DOMException AbortError without prompting for cloud consent", async () => {
      const photoBlob = new Blob(["photo-data"], { type: "image/jpeg" });
      const requestConsentMock = vi.fn().mockResolvedValue(true);

      // AbortError thrown
      mockGenerateContent.mockRejectedValueOnce(new DOMException("The user aborted a request.", "AbortError"));

      await expect(
        generateInspectionDraft({
          photoBlob,
          notes: "Aborted inspection",
          preferenceSnapshot: preferenceOff,
          requestConsent: requestConsentMock,
        })
      ).rejects.toThrow(/aborted/);

      expect(requestConsentMock).not.toHaveBeenCalled();
      expect(mockGetGenerativeModel).toHaveBeenCalledTimes(1);
    });

    it("fails closed and rethrows unknown errors without offering cloud consent", async () => {
      const photoBlob = new Blob(["photo-data"], { type: "image/jpeg" });
      const requestConsentMock = vi.fn().mockResolvedValue(true);

      // Undocumented generic error
      mockGenerateContent.mockRejectedValueOnce(new Error("Undocumented internal crash"));

      await expect(
        generateInspectionDraft({
          photoBlob,
          notes: "Unknown crash inspection",
          preferenceSnapshot: preferenceOff,
          requestConsent: requestConsentMock,
        })
      ).rejects.toThrow("Undocumented internal crash");

      expect(requestConsentMock).not.toHaveBeenCalled();
      expect(mockGetGenerativeModel).toHaveBeenCalledTimes(1);
    });

    it("cancels AI request with exact authorized privacy wording if user declines consent", async () => {
      const photoBlob = new Blob(["photo-data"], { type: "image/jpeg" });
      const requestConsentMock = vi.fn().mockResolvedValue(false);

      // Documented unavailability
      mockGenerateContent.mockRejectedValueOnce(
        new AIError(AIErrorCode.UNSUPPORTED, "On-device model is not available.")
      );

      const expectedErrorMessage =
        "INSPECTOR_DECLINED_CLOUD_PROCESSING: Cloud AI processing was declined. Photographs and notes were not transmitted to Gemini for AI processing. Manual drafting remains active, and ordinary Firestore synchronization continues normally.";

      await expect(
        generateInspectionDraft({
          photoBlob,
          notes: "Deck inspection",
          preferenceSnapshot: preferenceOff,
          requestConsent: requestConsentMock,
        })
      ).rejects.toThrow(expectedErrorMessage);

      expect(requestConsentMock).toHaveBeenCalledTimes(1);
      // No secondary ONLY_IN_CLOUD call should have occurred
      expect(mockGetGenerativeModel).toHaveBeenCalledTimes(1);
    });
  });

  describe("Quota Error Handling", () => {
    it("detects 429 and RESOURCE_EXHAUSTED errors", () => {
      expect(isQuotaExceededError(new Error("HTTP 429: Too Many Requests"))).toBe(true);
      expect(isQuotaExceededError("RESOURCE_EXHAUSTED: quota exceeded")).toBe(true);
      expect(isQuotaExceededError(new Error("SyntaxError: Unexpected token"))).toBe(false);
    });
  });
});
