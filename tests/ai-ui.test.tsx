import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CloudConsentModal } from "../src/components/inspection/CloudConsentModal";
import { SettingsScreen } from "../src/screens/SettingsScreen";
import { InspectionEditorModal } from "../src/components/inspection/InspectionEditorModal";
import { AuthProvider } from "../src/context/AuthContext";
import * as preferences from "../src/services/preferences";
import * as aiService from "../src/services/ai";
import * as indexeddb from "../src/services/indexeddb";

// Mock Firebase client library
vi.mock("../src/lib/firebase", () => ({
  auth: { currentUser: { uid: "test-inspector-01", email: "test@foresite.build" } },
  db: {},
  appCheck: null,
  hasValidConfig: true,
}));

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: vi.fn((_auth, callback) => {
    callback({ uid: "test-inspector-01", email: "test@foresite.build", emailVerified: true });
    return () => {};
  }),
  signOut: vi.fn(),
}));

vi.mock("../src/services/indexeddb", async (importOriginal) => {
  const actual = await importOriginal<typeof indexeddb>();
  return {
    ...actual,
    getStorageQuotaEstimate: vi.fn().mockResolvedValue({
      supported: true,
      usageBytes: 1024,
      quotaBytes: 10240,
      usagePercentage: 10,
      persisted: true,
    }),
    getAllEvidencePhotosCount: vi.fn().mockResolvedValue(2),
    getAllLocalDrafts: vi.fn().mockResolvedValue([]),
    saveLocalDraft: vi.fn().mockResolvedValue(undefined),
    getEvidencePhotosByInspection: vi.fn().mockResolvedValue([]),
  };
});

describe("ForeSite Phase 4 AI UI Components", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("CloudConsentModal Component", () => {
    it("renders the required disclosures and action buttons", () => {
      const onConsentMock = vi.fn();
      const onDeclineMock = vi.fn();

      render(
        <CloudConsentModal
          isOpen={true}
          onConsent={onConsentMock}
          onDecline={onDeclineMock}
          targetModel="gemini-3.5-flash-lite"
        />
      );

      // Verifies title and model disclosure
      expect(screen.getByText(/Cloud AI Inference Consent/i)).toBeInTheDocument();
      expect(screen.getByText(/gemini-3.5-flash-lite/i)).toBeInTheDocument();

      // Verifies free-tier terms disclosure
      expect(screen.getByText(/Google Gemini Developer API Free-Tier Terms/i)).toBeInTheDocument();
      expect(
        screen.getByText(/content submitted to the API \(including inspection photographs and notes\) may be processed by Google/i)
      ).toBeInTheDocument();

      // Verifies local retention disclosure
      expect(
        screen.getByText(/Full-resolution site photos remain safely stored only on this device/i)
      ).toBeInTheDocument();

      // Test Consent button
      fireEvent.click(screen.getByText(/Consent & Process in Cloud/i));
      expect(onConsentMock).toHaveBeenCalledTimes(1);

      // Test Decline button
      fireEvent.click(screen.getByText(/Decline \(Manual Authoring\)/i));
      expect(onDeclineMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("SettingsScreen AI & Privacy Section", () => {
    it("renders the Automatic Cloud Fallback setting and toggles state", async () => {
      vi.spyOn(preferences, "getAutoCloudFallbackPreference").mockResolvedValue({
        enabled: false,
        source: "default",
        syncStatus: "synced",
      });

      const setSettingSpy = vi.spyOn(preferences, "setAutoCloudFallbackSetting").mockResolvedValue({
        enabled: true,
        source: "firestore",
        syncStatus: "synced",
      });

      render(
        <AuthProvider>
          <SettingsScreen />
        </AuthProvider>
      );

      // Verifies section heading
      await waitFor(() => {
        expect(screen.getByText(/^AI & Privacy$/i)).toBeInTheDocument();
      });

      // Verifies Mode B (Default) is reflected
      expect(screen.getByText(/Disabled \(Default\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Uploaded to Cloud/i)).toBeInTheDocument();

      // Toggles the switch
      const toggleBtn = screen.getByRole("switch");
      fireEvent.click(toggleBtn);

      await waitFor(() => {
        expect(setSettingSpy).toHaveBeenCalledWith("test-inspector-01", true);
      });
    });
  });

  describe("InspectionEditorModal AI Drafting Integration", () => {
    const mockProjects = [
      {
        id: "proj-1",
        name: "North Pier Expansion",
        siteLabel: "SITE-01",
        inspectionCount: 0,
        createdAt: 1000,
        updatedAt: 1000,
      },
    ];

    it("shows error when AI draft button is clicked without a photograph", async () => {
      vi.spyOn(preferences, "getAutoCloudFallbackPreference").mockResolvedValue({
        enabled: false,
        source: "default",
        syncStatus: "synced",
      });

      render(
        <AuthProvider>
          <InspectionEditorModal
            isOpen={true}
            onClose={() => {}}
            projects={mockProjects}
            onSaveSuccess={() => {}}
          />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /^AI Draft$/i })).toBeInTheDocument();
      });

      const aiDraftButton = screen.getByRole("button", { name: /^AI Draft$/i });
      fireEvent.click(aiDraftButton);

      await waitFor(() => {
        expect(
          screen.getByText(/Please upload or capture at least one site photograph before generating an AI draft/i)
        ).toBeInTheDocument();
      });
    });

    it("generates an AI draft and populates fields when photo is attached", async () => {
      const mockPhotoBlob = new Blob(["test-photo"], { type: "image/jpeg" });
      const mockPhoto = {
        id: "photo-01",
        inspectionId: "insp-01",
        projectId: "proj-1",
        blob: mockPhotoBlob,
        fileName: "rebar.jpg",
        fileSizeBytes: 100,
        mimeType: "image/jpeg" as const,
        capturedAt: Date.now(),
        createdAt: Date.now(),
      };

      vi.spyOn(indexeddb, "getEvidencePhotosByInspection").mockResolvedValue([mockPhoto]);
      vi.spyOn(preferences, "getAutoCloudFallbackPreference").mockResolvedValue({
        enabled: true,
        source: "firestore",
        syncStatus: "synced",
      });

      vi.spyOn(aiService, "generateInspectionDraft").mockResolvedValue({
        draft: {
          title: "Concrete Foundation Cold Joint",
          observation: "Visible horizontal unconsolidated cold joint at elevation +4.2m.",
          category: "structural",
          visibleEvidence: ["Unconsolidated aggregate band", "Absence of vibrator penetration marks"],
          uncertainties: ["Depth of cold joint penetration into core"],
          inspectorFollowUp: ["Core drill test per ASTM C42", "Review batch plant delivery tickets"],
          aiDisclaimer: "AI_DRAFT_REQUIRES_HUMAN_REVIEW",
        },
        inferenceSource: "ON_DEVICE",
      });

      render(
        <AuthProvider>
          <InspectionEditorModal
            isOpen={true}
            onClose={() => {}}
            projects={mockProjects}
            onSaveSuccess={() => {}}
          />
        </AuthProvider>
      );

      // Wait for photo and preference to load
      await waitFor(() => {
        const aiDraftButton = screen.getByRole("button", { name: /^AI Draft$/i });
        expect(aiDraftButton).toBeInTheDocument();
      });

      // Click AI Draft
      const aiDraftButton = screen.getByRole("button", { name: /^AI Draft$/i });
      fireEvent.click(aiDraftButton);

      // Verify draft populated into form inputs
      await waitFor(() => {
        expect(screen.getByDisplayValue("Concrete Foundation Cold Joint")).toBeInTheDocument();
        expect(
          screen.getByDisplayValue(/Visible horizontal unconsolidated cold joint/i)
        ).toBeInTheDocument();
      });

      // Verify source badge is rendered
      expect(screen.getByText(/On-Device \(Nano\)/i)).toBeInTheDocument();
    });
  });
});
