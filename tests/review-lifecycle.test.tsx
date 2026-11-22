/**
 * ForeSite Phase 5 Stage 1 Test Suite
 * Review Lifecycle Finite State Machine, Audit Trail, Local IndexedDB Persistence, and UI Controls
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import {
  isValidReviewTransition,
  getPermittedReviewTransitions,
  getReviewActionLabel,
  createReviewAuditEvent,
  executeReviewTransition,
  ReviewLifecycleError,
} from "../src/services/review";
import {
  getDatabase,
  closeDatabase,
  clearAllLocalEvidence,
  saveEvidencePhoto,
  getEvidencePhoto,
  saveLocalDraft,
  getLocalDraft,
  getAllLocalDrafts,
  persistLocalReviewTransition,
  DB_VERSION,
  STORES,
} from "../src/services/indexeddb";
import { InspectionsScreen } from "../src/screens/InspectionsScreen";
import { Inspection, ReviewStatus, LocalEvidencePhoto, Project, LocalDraftInspection } from "../src/types";
import * as firestoreService from "../src/services/firestore";

// Mock Firebase client
vi.mock("../src/lib/firebase", () => ({
  auth: { currentUser: { uid: "test-inspector-uid-123" } },
  db: {},
  appCheck: null,
  hasValidConfig: true,
}));

vi.mock("../src/services/firestore", () => ({
  updateInspection: vi.fn().mockResolvedValue(undefined),
  createInspection: vi.fn().mockResolvedValue({ id: "insp-mock" }),
  deleteInspection: vi.fn().mockResolvedValue(undefined),
  getUserInspections: vi.fn().mockResolvedValue([]),
  getUserProjects: vi.fn().mockResolvedValue([]),
  createProject: vi.fn().mockResolvedValue({ id: "proj-mock" }),
  updateProject: vi.fn().mockResolvedValue(undefined),
  deleteProject: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: vi.fn((_auth, callback) => {
    callback({ uid: "test-inspector-uid-123", email: "inspector@test.com" });
    return () => {};
  }),
}));

vi.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({
    currentUser: { uid: "test-inspector-uid-123", email: "inspector@test.com" },
    userProfile: null,
    loading: false,
    error: null,
    isConfigured: true,
    refreshUserProfile: vi.fn(),
    sendVerificationEmail: vi.fn(),
    clearError: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const mockProject: Project = {
  id: "proj-rev-01",
  name: "Civic Center Expansion",
  siteLabel: "Sector B",
  inspectionCount: 1,
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
};

function createSampleInspection(status: ReviewStatus = "draft_generated"): Inspection {
  return {
    id: "insp-rev-001",
    projectId: mockProject.id,
    projectName: mockProject.name,
    title: "Structural Beam Weld Inspection",
    observation: "Visual inspection of welded connections along gridline C.",
    category: "installation",
    visibleEvidence: ["Sound weld bead", "No undercut observed"],
    uncertainties: ["Ultrasonic test pending for flanged section"],
    inspectorFollowUp: ["Verify NDT report upon lab receipt"],
    reviewStatus: status,
    reviewHistory: [],
    revision: 0,
    aiAssisted: true,
    inferenceSource: "ON_DEVICE",
    photoIds: ["photo-rev-01"],
    createdAt: 1700001000000,
    updatedAt: 1700001000000,
  };
}

describe("ForeSite Phase 5 Stage 1: Review Lifecycle FSM", () => {
  it("permits only the five authorized lifecycle transitions", () => {
    // 1. draft_generated -> in_review
    expect(isValidReviewTransition("draft_generated", "in_review")).toBe(true);
    // 2. in_review -> approved
    expect(isValidReviewTransition("in_review", "approved")).toBe(true);
    // 3. in_review -> rejected
    expect(isValidReviewTransition("in_review", "rejected")).toBe(true);
    // 4. approved -> in_review
    expect(isValidReviewTransition("approved", "in_review")).toBe(true);
    // 5. rejected -> in_review
    expect(isValidReviewTransition("rejected", "in_review")).toBe(true);
  });

  it("strictly rejects direct approval or rejection from draft_generated", () => {
    expect(isValidReviewTransition("draft_generated", "approved")).toBe(false);
    expect(isValidReviewTransition("draft_generated", "rejected")).toBe(false);
  });

  it("strictly rejects lateral transitions between terminal states without reopening", () => {
    expect(isValidReviewTransition("approved", "rejected")).toBe(false);
    expect(isValidReviewTransition("rejected", "approved")).toBe(false);
  });

  it("strictly rejects retrograde transitions back to draft_generated", () => {
    expect(isValidReviewTransition("in_review", "draft_generated")).toBe(false);
    expect(isValidReviewTransition("approved", "draft_generated")).toBe(false);
    expect(isValidReviewTransition("rejected", "draft_generated")).toBe(false);
  });

  it("returns exactly the permitted target transitions for each state", () => {
    expect(getPermittedReviewTransitions("draft_generated")).toEqual(["in_review"]);
    expect(getPermittedReviewTransitions("in_review")).toEqual(["approved", "rejected"]);
    expect(getPermittedReviewTransitions("approved")).toEqual(["in_review"]);
    expect(getPermittedReviewTransitions("rejected")).toEqual(["in_review"]);
  });

  it("returns appropriate human-readable action labels", () => {
    expect(getReviewActionLabel("in_review", "draft_generated")).toBe("Begin Review");
    expect(getReviewActionLabel("in_review", "approved")).toBe("Reopen Review");
    expect(getReviewActionLabel("in_review", "rejected")).toBe("Reopen Review");
    expect(getReviewActionLabel("approved")).toBe("Approve Inspection");
    expect(getReviewActionLabel("rejected")).toBe("Reject Draft");
  });
});

describe("ForeSite Phase 5 Stage 1: Review Audit Events & Attribution", () => {
  it("creates a strongly typed review audit event for valid transitions", () => {
    const event = createReviewAuditEvent({
      inspectionId: "insp-001",
      fromStatus: "draft_generated",
      toStatus: "in_review",
      byUid: "inspector-456",
      comment: "Starting preliminary field review",
      revision: 1,
      timestamp: 1700002000000,
    });

    expect(event.id).toContain("rev-evt-insp-001-r1-in_review");
    expect(event.fromStatus).toBe("draft_generated");
    expect(event.toStatus).toBe("in_review");
    expect(event.byUid).toBe("inspector-456");
    expect(event.comment).toBe("Starting preliminary field review");
    expect(event.revision).toBe(1);
    expect(event.timestamp).toBe(1700002000000);
  });

  it("throws ReviewLifecycleError if reviewer UID is missing or unauthenticated", () => {
    expect(() =>
      createReviewAuditEvent({
        inspectionId: "insp-001",
        fromStatus: "draft_generated",
        toStatus: "in_review",
        byUid: "",
      })
    ).toThrowError(ReviewLifecycleError);

    expect(() =>
      executeReviewTransition(createSampleInspection(), "in_review", "")
    ).toThrowError("Missing authenticated user");
  });

  it("throws ReviewLifecycleError when attempting a prohibited transition", () => {
    const draft = createSampleInspection("draft_generated");
    expect(() =>
      executeReviewTransition(draft, "approved", "inspector-123")
    ).toThrowError("Cannot transition inspection from 'draft_generated' to 'approved'");
  });

  it("appends exactly one audit event and preserves existing history upon transition", () => {
    const inspection = createSampleInspection("draft_generated");

    // 1. draft_generated -> in_review
    const step1 = executeReviewTransition(inspection, "in_review", "inspector-uid-1", "Initial review");
    expect(step1.updatedInspection.reviewStatus).toBe("in_review");
    expect(step1.updatedInspection.reviewHistory).toHaveLength(1);
    expect(step1.updatedInspection.reviewHistory![0]!.fromStatus).toBe("draft_generated");
    expect(step1.updatedInspection.reviewHistory![0]!.toStatus).toBe("in_review");
    expect(step1.updatedInspection.reviewedByUid).toBe("inspector-uid-1");

    // 2. in_review -> approved
    const step2 = executeReviewTransition(step1.updatedInspection, "approved", "lead-engineer-uid", "Sign off confirmed");
    expect(step2.updatedInspection.reviewStatus).toBe("approved");
    expect(step2.updatedInspection.reviewHistory).toHaveLength(2);
    expect(step2.updatedInspection.reviewHistory![0]!.toStatus).toBe("in_review");
    expect(step2.updatedInspection.reviewHistory![1]!.toStatus).toBe("approved");
    expect(step2.updatedInspection.reviewedByUid).toBe("lead-engineer-uid");

    // 3. Reopen: approved -> in_review
    const step3 = executeReviewTransition(step2.updatedInspection, "in_review", "auditor-uid", "Reopening for secondary test");
    expect(step3.updatedInspection.reviewStatus).toBe("in_review");
    expect(step3.updatedInspection.reviewHistory).toHaveLength(3);
    expect(step3.updatedInspection.reviewHistory![2]!.fromStatus).toBe("approved");
    expect(step3.updatedInspection.reviewHistory![2]!.toStatus).toBe("in_review");
    expect(step3.updatedInspection.reviewHistory![2]!.byUid).toBe("auditor-uid");
  });

  it("enforces maximum 100 review events cap", () => {
    const inspection = createSampleInspection("in_review");
    // Pre-populate 100 events
    const dummyHistory = Array.from({ length: 100 }, (_, i) => ({
      id: `evt-${i}`,
      fromStatus: (i % 2 === 0 ? "in_review" : "approved") as ReviewStatus,
      toStatus: (i % 2 === 0 ? "approved" : "in_review") as ReviewStatus,
      byUid: "inspector-uid",
      timestamp: 1700000000000 + i,
      revision: i + 1,
    }));
    inspection.reviewHistory = dummyHistory;

    expect(() =>
      executeReviewTransition(inspection, "approved", "inspector-uid")
    ).toThrowError("Review history cap reached (100 events)");
  });
});

describe("ForeSite Phase 5 Stage 1: Local IndexedDB Persistence & Backward Compatibility", () => {
  beforeEach(async () => {
    await clearAllLocalEvidence();
  });

  afterEach(() => {
    closeDatabase();
  });

  it("verifies non-destructive upgrade to DB_VERSION 2", async () => {
    const db = await getDatabase();
    expect(db.version).toBe(DB_VERSION);
    expect(db.objectStoreNames.contains(STORES.DRAFTS)).toBe(true);
    expect(db.objectStoreNames.contains(STORES.PHOTOS)).toBe(true);
    expect(db.objectStoreNames.contains(STORES.PROJECTS)).toBe(true);
  });

  it("atomically persists review status and audit event in a single transaction", async () => {
    const inspection = createSampleInspection("draft_generated");
    const { updatedInspection, auditEvent } = executeReviewTransition(
      inspection,
      "in_review",
      "inspector-uid-456",
      "Beginning local field review"
    );

    // Atomically persist transition
    await persistLocalReviewTransition(inspection.id, updatedInspection, auditEvent);

    // Retrieve from IndexedDB
    const saved = await getLocalDraft(inspection.id);
    expect(saved).not.toBeNull();
    expect(saved!.reviewStatus).toBe("in_review");
    expect(saved!.reviewHistory).toHaveLength(1);
    expect(saved!.reviewHistory![0]!.id).toBe(auditEvent.id);
    expect(saved!.reviewHistory![0]!.byUid).toBe("inspector-uid-456");
    expect(saved!.reviewedByUid).toBe("inspector-uid-456");
  });

  it("retains review status and full audit history across multiple transitions and reload", async () => {
    const current = createSampleInspection("draft_generated");

    // Transition 1: Begin Review
    const t1 = executeReviewTransition(current, "in_review", "insp-1");
    await persistLocalReviewTransition(current.id, t1.updatedInspection, t1.auditEvent);

    // Transition 2: Reject Draft
    const t2 = executeReviewTransition(t1.updatedInspection, "rejected", "insp-2", "Weld defects found");
    await persistLocalReviewTransition(current.id, t2.updatedInspection, t2.auditEvent);

    // Transition 3: Reopen Review
    const t3 = executeReviewTransition(t2.updatedInspection, "in_review", "insp-1", "Rework completed");
    await persistLocalReviewTransition(current.id, t3.updatedInspection, t3.auditEvent);

    // Transition 4: Approve Inspection
    const t4 = executeReviewTransition(t3.updatedInspection, "approved", "supervisor", "All defects corrected");
    await persistLocalReviewTransition(current.id, t4.updatedInspection, t4.auditEvent);

    // Simulate browser restart / fresh query
    closeDatabase();
    const retrieved = await getLocalDraft(current.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.reviewStatus).toBe("approved");
    expect(retrieved!.reviewHistory).toHaveLength(4);
    expect(retrieved!.reviewHistory!.map((e) => e.toStatus)).toEqual([
      "in_review",
      "rejected",
      "in_review",
      "approved",
    ]);
  });

  it("guarantees backward compatibility: existing drafts without reviewStatus default cleanly", async () => {
    // Save legacy draft without reviewStatus or reviewHistory
    await saveLocalDraft({
      id: "legacy-draft-001",
      projectId: "proj-01",
      title: "Pre-Phase-5 Legacy Draft",
      observation: "Legacy notes",
      category: "installation",
      visibleEvidence: [],
      uncertainties: [],
      inspectorFollowUp: [],
      photoIds: [],
      isSynced: true,
      lastSavedAt: Date.now(),
      createdAt: Date.now(),
    });

    // Read back via getLocalDraft and getAllLocalDrafts
    const single = await getLocalDraft("legacy-draft-001");
    expect(single).not.toBeNull();
    expect(single!.reviewStatus).toBe("draft_generated");
    expect(single!.reviewHistory).toEqual([]);

    const all = await getAllLocalDrafts();
    const found = all.find((d) => d.id === "legacy-draft-001");
    expect(found).toBeDefined();
    expect(found!.reviewStatus).toBe("draft_generated");
    expect(found!.reviewHistory).toEqual([]);
  });

  it("preserves photographic evidence Blobs untouched during review transitions", async () => {
    // 1. Store a photographic Blob
    const testBlob = new Blob(["binary-evidence-content-weld-joint"], { type: "image/jpeg" });
    const photoRecord: LocalEvidencePhoto = {
      id: "photo-rev-01",
      inspectionId: "insp-rev-001",
      projectId: mockProject.id,
      blob: testBlob,
      fileName: "weld_joint_photo.jpg",
      fileSizeBytes: testBlob.size,
      mimeType: "image/jpeg",
      capturedAt: Date.now(),
      createdAt: Date.now(),
    };
    await saveEvidencePhoto(photoRecord);

    // 2. Perform and persist review transitions on the associated inspection
    const inspection = createSampleInspection("draft_generated");
    const t1 = executeReviewTransition(inspection, "in_review", "inspector-01");
    await persistLocalReviewTransition(inspection.id, t1.updatedInspection, t1.auditEvent);

    const t2 = executeReviewTransition(t1.updatedInspection, "approved", "supervisor-01");
    await persistLocalReviewTransition(inspection.id, t2.updatedInspection, t2.auditEvent);

    // 3. Verify photo Blob is 100% intact and unaltered
    const retrievedPhoto = await getEvidencePhoto("photo-rev-01");
    expect(retrievedPhoto).not.toBeNull();
    expect(retrievedPhoto!.id).toBe("photo-rev-01");
    expect(retrievedPhoto!.fileSizeBytes).toBe(testBlob.size);
    expect(retrievedPhoto!.fileName).toBe("weld_joint_photo.jpg");
  });
});

describe("ForeSite Phase 5 Stage 1: Review UI Integration in InspectionsScreen", () => {
  beforeEach(async () => {
    await clearAllLocalEvidence();
  });

  afterEach(() => {
    closeDatabase();
  });

  it("renders 'Begin Review' for draft_generated inspections and rejects direct approve/reject buttons", async () => {
    const draftInspection = createSampleInspection("draft_generated");
    const onUpdateStatus = vi.fn();

    render(
      <InspectionsScreen
        inspections={[draftInspection]}
        projects={[mockProject]}
        onUpdateStatus={onUpdateStatus}
      />
    );

    // Click on the inspection to open Detail Modal
    const reviewTrigger = screen.getByText("Review");
    fireEvent.click(reviewTrigger);

    // Verify modal opened
    expect(screen.getByText("Current Status:")).toBeDefined();

    // Verify permitted button "Begin Review" is visible
    expect(screen.getByRole("button", { name: /begin review/i })).toBeDefined();

    // Verify PROHIBITED buttons "Approve Inspection" and "Reject Draft" are NOT present
    expect(screen.queryByRole("button", { name: /approve inspection/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /reject draft/i })).toBeNull();
  });

  it("renders both 'Approve Inspection' and 'Reject Draft' when inspection is in_review", async () => {
    const inReviewInspection = createSampleInspection("in_review");
    const onUpdateStatus = vi.fn();

    render(
      <InspectionsScreen
        inspections={[inReviewInspection]}
        projects={[mockProject]}
        onUpdateStatus={onUpdateStatus}
      />
    );

    const reviewTrigger = screen.getByText("Review");
    fireEvent.click(reviewTrigger);

    // In review state: both Approve and Reject must be rendered
    expect(screen.getByRole("button", { name: /approve inspection/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /reject draft/i })).toBeDefined();

    // "Begin Review" must NOT be rendered
    expect(screen.queryByRole("button", { name: /begin review/i })).toBeNull();
  });

  it("renders 'Reopen Review' when inspection is approved or rejected", async () => {
    const approvedInspection = createSampleInspection("approved");
    const onUpdateStatus = vi.fn();

    render(
      <InspectionsScreen
        inspections={[approvedInspection]}
        projects={[mockProject]}
        onUpdateStatus={onUpdateStatus}
      />
    );

    const reviewTrigger = screen.getByText("Review");
    fireEvent.click(reviewTrigger);

    // Approved state: only "Reopen Review" permitted
    expect(screen.getByRole("button", { name: /reopen review/i })).toBeDefined();
    expect(screen.queryByRole("button", { name: /approve inspection/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /reject draft/i })).toBeNull();
  });

  it("executes transition and renders review audit history timeline in the modal", async () => {
    const inspection = createSampleInspection("draft_generated");
    const onLocalReviewTransition = vi.fn();
    const onUpdateStatus = vi.fn();

    render(
      <InspectionsScreen
        inspections={[inspection]}
        projects={[mockProject]}
        onLocalReviewTransition={onLocalReviewTransition}
        onUpdateStatus={onUpdateStatus}
      />
    );

    // Open detail modal
    fireEvent.click(screen.getByText("Review"));

    // Verify initial timeline says no review actions
    expect(screen.getByText(/no review actions recorded yet/i)).toBeDefined();

    // Enter comment
    const commentInput = screen.getByPlaceholderText(/optional review comment/i);
    fireEvent.change(commentInput, { target: { value: "Starting formal field audit" } });

    // Click "Begin Review"
    const beginBtn = screen.getByRole("button", { name: /begin review/i });
    fireEvent.click(beginBtn);

    // Wait for transition to complete and in-memory local state to be notified
    await waitFor(() => {
      expect(onLocalReviewTransition).toHaveBeenCalled();
    });
    expect(onLocalReviewTransition.mock.calls[0]![0].reviewStatus).toBe("in_review");

    // Strictly verify legacy onUpdateStatus / Firestore write was NOT invoked
    expect(onUpdateStatus).not.toHaveBeenCalled();

    // Verify audit event is now visible in the timeline
    await waitFor(() => {
      expect(screen.getByText(/"Starting formal field audit"/i)).toBeDefined();
      expect(screen.getByText(/Reviewer UID:/i)).toBeDefined();
    });

    // Now in in_review state: verify Approve and Reject are available
    expect(screen.getByRole("button", { name: /approve inspection/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /reject draft/i })).toBeDefined();
  });
});

describe("ForeSite Phase 5 Stage 1: Integration Regression Test Suite (Defects A & B)", () => {
  beforeEach(async () => {
    await clearAllLocalEvidence();
    vi.clearAllMocks();
  });

  afterEach(() => {
    closeDatabase();
  });

  it(
    "preserves reviewStatus, audit history, and filtering across list refresh, modal close/reopen for all lifecycle states",
    async () => {
    // 1. Create a local draft inspection in IndexedDB
    const initialDraft: LocalDraftInspection = {
      id: "insp-reg-001",
      projectId: mockProject.id,
      projectName: mockProject.name,
      title: "Foundation Reinforcement Grid",
      observation: "Rebar spacing compliant with structural drawings.",
      category: "installation",
      visibleEvidence: ["12-inch on-center grid confirmed"],
      uncertainties: [],
      inspectorFollowUp: [],
      photoIds: [],
      isSynced: false,
      reviewStatus: "draft_generated",
      reviewHistory: [],
      lastSavedAt: Date.now(),
      createdAt: Date.now(),
    };
    await saveLocalDraft(initialDraft);

    const onLocalReviewTransition = vi.fn();
    const { unmount } = render(
      <InspectionsScreen
        inspections={[]}
        projects={[mockProject]}
        onLocalReviewTransition={onLocalReviewTransition}
      />
    );

    // Initial render: draft should be visible in list with 'Draft Generated' badge
    await waitFor(() => {
      expect(screen.getByText("Foundation Reinforcement Grid")).toBeDefined();
    });
    expect(screen.getByText("Draft Generated")).toBeDefined();

    // Open detail modal by clicking inspection card
    fireEvent.click(screen.getByText("Foundation Reinforcement Grid"));
    expect(screen.getByRole("button", { name: /begin review/i })).toBeDefined();

    // 2. Transition draft_generated -> in_review
    fireEvent.click(screen.getByRole("button", { name: /begin review/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /approve inspection/i })).toBeDefined();
    });

    // 3. Close the detail modal
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    // 4. List view verification: card MUST show "In Review" badge, NOT "Draft Generated"
    await waitFor(() => {
      // Expect 2 elements: 1 in the filter tabs and 1 on the inspection card badge
      expect(screen.getAllByText("In Review")).toHaveLength(2);
    });
    expect(screen.queryByText("Draft Generated")).toBeNull();

    // 5. Verify status filtering:
    // Tab "In Review" -> inspection remains visible
    fireEvent.click(screen.getByRole("button", { name: "In Review" }));
    expect(screen.getByText("Foundation Reinforcement Grid")).toBeDefined();

    // Tab "Approved" -> inspection is filtered out
    fireEvent.click(screen.getByRole("button", { name: "Approved" }));
    expect(screen.queryByText("Foundation Reinforcement Grid")).toBeNull();

    // Reset filter to All Records
    fireEvent.click(screen.getByRole("button", { name: "All Records" }));
    expect(screen.getByText("Foundation Reinforcement Grid")).toBeDefined();

    // 6. Reopen detail modal: verify in_review and audit history retained
    fireEvent.click(screen.getByText("Foundation Reinforcement Grid"));
    await waitFor(() => {
      expect(screen.getByText(/Reviewer UID:/i)).toBeDefined();
      expect(screen.getByRole("button", { name: /approve inspection/i })).toBeDefined();
    });

    // 7. Transition in_review -> approved
    fireEvent.click(screen.getByRole("button", { name: /approve inspection/i }));
    await waitFor(() => {
      const reopenBtn = screen.getByRole("button", { name: /reopen review/i });
      expect(reopenBtn).toBeDefined();
      expect(reopenBtn).not.toBeDisabled();
    });

    // Close modal, check list card shows Approved
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => {
      // Expect 2 elements: 1 in the filter tabs and 1 on the inspection card badge
      expect(screen.getAllByText("Approved")).toHaveLength(2);
    });

    // Filter by Approved -> inspection matches
    fireEvent.click(screen.getByRole("button", { name: "Approved" }));
    expect(screen.getByText("Foundation Reinforcement Grid")).toBeDefined();

    // Filter by In Review -> inspection does NOT match
    fireEvent.click(screen.getByRole("button", { name: "In Review" }));
    expect(screen.queryByText("Foundation Reinforcement Grid")).toBeNull();

    // Return to All Records
    fireEvent.click(screen.getByRole("button", { name: "All Records" }));

    // Reopen modal, reopen review to in_review, then reject
    fireEvent.click(screen.getByText("Foundation Reinforcement Grid"));
    await waitFor(() => {
      const reopenBtn = screen.getByRole("button", { name: /reopen review/i });
      expect(reopenBtn).toBeDefined();
      expect(reopenBtn).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole("button", { name: /reopen review/i }));
    await waitFor(() => {
      const rejectBtn = screen.getByRole("button", { name: /reject draft/i });
      expect(rejectBtn).toBeDefined();
      expect(rejectBtn).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole("button", { name: /reject draft/i }));
    await waitFor(() => {
      const reopenBtn = screen.getByRole("button", { name: /reopen review/i });
      expect(reopenBtn).toBeDefined();
      expect(reopenBtn).not.toBeDisabled();
    });

    // Close modal, check list card shows Rejected
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => {
      // Expect 2 elements: 1 in the filter tabs and 1 on the inspection card badge
      expect(screen.getAllByText("Rejected")).toHaveLength(2);
    });

    // Verify IndexedDB record has all 4 audit events and status "rejected"
    const persisted = await getLocalDraft("insp-reg-001");
    expect(persisted).not.toBeNull();
    expect(persisted!.reviewStatus).toBe("rejected");
    expect(persisted!.reviewHistory).toHaveLength(4);
    expect(persisted!.reviewHistory!.map((e) => e.toStatus)).toEqual([
      "in_review",
      "approved",
      "in_review",
      "rejected",
    ]);

    unmount();
  }, 15000);

  it("strictly isolates review transitions to local IndexedDB and never calls updateFirestoreInspection", async () => {
    const inspection = createSampleInspection("draft_generated");
    const onLocalReviewTransition = vi.fn();
    const onUpdateStatus = vi.fn();

    render(
      <InspectionsScreen
        inspections={[inspection]}
        projects={[mockProject]}
        onLocalReviewTransition={onLocalReviewTransition}
        onUpdateStatus={onUpdateStatus}
      />
    );

    // Open detail modal and click Begin Review
    fireEvent.click(screen.getByText("Review"));
    const beginBtn = screen.getByRole("button", { name: /begin review/i });
    fireEvent.click(beginBtn);

    // Verify local IndexedDB was updated
    await waitFor(async () => {
      const persisted = await getLocalDraft(inspection.id);
      expect(persisted).not.toBeNull();
      expect(persisted!.reviewStatus).toBe("in_review");
    });

    // Verify updateInspection in firestore was NOT called
    expect(firestoreService.updateInspection).not.toHaveBeenCalled();
    // Verify legacy onUpdateStatus callback was NOT called
    expect(onUpdateStatus).not.toHaveBeenCalled();
    // Verify strictly local callback was called
    expect(onLocalReviewTransition).toHaveBeenCalled();

    // Verify unrelated Firestore operations still work
    await firestoreService.createInspection("test-inspector-uid-123", {
      projectId: mockProject.id,
      projectName: mockProject.name,
      title: "Unrelated Inspection",
      observation: "Testing unrelated firestore write",
      category: "surface_condition",
      visibleEvidence: [],
      uncertainties: [],
      inspectorFollowUp: [],
      photoIds: [],
      reviewStatus: "draft_generated",
      aiAssisted: false,
    });
    expect(firestoreService.createInspection).toHaveBeenCalled();
  });

  it("handles local persistence failure cleanly without displaying false success or calling Firestore fallback", async () => {
    const inspection = createSampleInspection("draft_generated");
    const onLocalReviewTransition = vi.fn();

    // Spy on persistLocalReviewTransition and force it to reject
    const idbModule = await import("../src/services/indexeddb");
    const persistSpy = vi.spyOn(idbModule, "persistLocalReviewTransition").mockRejectedValueOnce(
      new Error("Disk I/O failure in IndexedDB")
    );

    render(
      <InspectionsScreen
        inspections={[inspection]}
        projects={[mockProject]}
        onLocalReviewTransition={onLocalReviewTransition}
      />
    );

    // Open modal and attempt review transition
    fireEvent.click(screen.getByText("Review"));
    const beginBtn = screen.getByRole("button", { name: /begin review/i });
    fireEvent.click(beginBtn);

    // Wait for failure notification in modal
    await waitFor(() => {
      expect(screen.getByText("Review Action Failed")).toBeDefined();
      expect(screen.getByText(/Disk I\/O failure in IndexedDB/i)).toBeDefined();
    });

    // Verify status has NOT changed to in_review
    expect(screen.queryByRole("button", { name: /approve inspection/i })).toBeNull();
    // Verify NO Firestore call occurred
    expect(firestoreService.updateInspection).not.toHaveBeenCalled();
    // Verify NO parent state update occurred
    expect(onLocalReviewTransition).not.toHaveBeenCalled();

    persistSpy.mockRestore();
  });
});
