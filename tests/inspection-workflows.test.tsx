import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { App } from "../src/App";
import {
  clearAllLocalEvidence,
  closeDatabase,
  saveEvidencePhoto,
  saveLocalDraft,
  getAllLocalDrafts,
} from "../src/services/indexeddb";
import { LocalEvidencePhoto, LocalDraftInspection } from "../src/types";

// Mock Firebase client to test offline/local manual workflows safely
vi.mock("../src/lib/firebase", () => ({
  auth: { currentUser: null },
  db: {},
  appCheck: null,
  hasValidConfig: false,
}));

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: vi.fn((_auth, callback) => {
    callback(null);
    return () => {};
  }),
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  sendEmailVerification: vi.fn(),
  updateProfile: vi.fn(),
}));

describe("ForeSite Manual Inspection & Local Evidence Workflows", () => {
  beforeEach(async () => {
    await clearAllLocalEvidence();
  });

  afterEach(() => {
    closeDatabase();
  });

  it("navigates to Projects and creates a new inspection project", async () => {
    render(<App />);

    const nav = screen.getByRole("navigation", { name: "Main Navigation" });
    fireEvent.click(within(nav).getByRole("button", { name: /^projects$/i }));

    expect(screen.getByText("Inspection Projects")).toBeInTheDocument();

    // Click "Create Project" button
    const createBtn = screen.getByRole("button", { name: /create project/i });
    fireEvent.click(createBtn);

    expect(screen.getByText("Create Inspection Project")).toBeInTheDocument();

    // Fill form
    fireEvent.change(screen.getByLabelText(/Project Name/i), {
      target: { value: "Harbor Bridge Rehabilitation" },
    });
    fireEvent.change(screen.getByLabelText(/Site \/ Parcel Label/i), {
      target: { value: "HBR-PIER-7" },
    });
    fireEvent.change(screen.getByLabelText(/Location \/ Address/i), {
      target: { value: "Harbor Parkway Pier 7" },
    });

    fireEvent.click(screen.getByRole("button", { name: /save project/i }));

    await waitFor(() => {
      expect(screen.getByText("Harbor Bridge Rehabilitation")).toBeInTheDocument();
      expect(screen.getByText("HBR-PIER-7")).toBeInTheDocument();
    });
  }, 10000);

  it("navigates to Inspections and opens the New Inspection dialog", async () => {
    render(<App />);

    const nav = screen.getByRole("navigation", { name: "Main Navigation" });
    fireEvent.click(within(nav).getByRole("button", { name: /inspections/i }));

    expect(screen.getByText("Site Inspections")).toBeInTheDocument();

    // Open "New Inspection"
    fireEvent.click(screen.getByRole("button", { name: /new inspection/i }));

    await waitFor(() => {
      expect(screen.getByText("New Site Inspection")).toBeInTheDocument();
      expect(screen.getByText("Photographic Evidence")).toBeInTheDocument();
    });
  });

  it("saves a local inspection draft to IndexedDB and recovers it across sessions", async () => {
    // 1. Manually seed an existing draft into IndexedDB
    const draft: LocalDraftInspection = {
      id: "insp-draft-recovered",
      projectId: "proj-metro-01",
      projectName: "Metro North Station Redevelopment",
      title: "Anchor Bolt Tension Verification",
      observation: "Baseplate anchor bolts torqued to specified 450 Nm torque setting.",
      category: "equipment",
      visibleEvidence: ["Grade 8.8 anchor studs with double nuts", "Calibrated torque wrench used"],
      uncertainties: ["Thread engagement depth partially concealed under washer"],
      inspectorFollowUp: ["Review calibration certificate for torque gauge"],
      photoIds: [],
      isSynced: false,
      lastSavedAt: Date.now(),
      createdAt: Date.now(),
    };

    await saveLocalDraft(draft);

    const draftsInDb = await getAllLocalDrafts();
    expect(draftsInDb.length).toBe(1);

    // 2. Render application and navigate to Inspections tab
    render(<App />);

    const nav = screen.getByRole("navigation", { name: "Main Navigation" });
    fireEvent.click(within(nav).getByRole("button", { name: /inspections/i }));

    // Verify draft item appears with "Continue Draft" action
    await waitFor(() => {
      expect(screen.getByText("Anchor Bolt Tension Verification")).toBeInTheDocument();
      expect(screen.getByText(/Continue Draft/i)).toBeInTheDocument();
    });
  });

  it("associates photographic evidence Blobs with inspection in IndexedDB", async () => {
    const testBlob = new Blob(["sample-jpeg-binary-photo"], { type: "image/jpeg" });
    const photoRecord: LocalEvidencePhoto = {
      id: "photo-evidence-test-01",
      inspectionId: "insp-rebar-01",
      projectId: "proj-metro-01",
      blob: testBlob,
      fileName: "rebar_elevation.jpg",
      fileSizeBytes: testBlob.size,
      mimeType: "image/jpeg",
      capturedAt: Date.now(),
      createdAt: Date.now(),
    };

    await saveEvidencePhoto(photoRecord);

    render(<App />);

    const nav = screen.getByRole("navigation", { name: "Main Navigation" });
    fireEvent.click(within(nav).getByRole("button", { name: /inspections/i }));

    // Click review on the inspection
    await waitFor(() => {
      expect(screen.getByText("Rebar Spacing & Cover Depth — Pier Footing 4")).toBeInTheDocument();
    });

    const inspectionCards = screen.getAllByText("Rebar Spacing & Cover Depth — Pier Footing 4");
    expect(inspectionCards[0]).toBeDefined();
    if (inspectionCards[0]) {
      fireEvent.click(inspectionCards[0]);
    }

    // Verify detail modal opens and displays photo metadata
    await waitFor(() => {
      expect(screen.getByText(/Attached Photographic Evidence/i)).toBeInTheDocument();
      expect(screen.getByText("rebar_elevation.jpg")).toBeInTheDocument();
    });
  });
});
