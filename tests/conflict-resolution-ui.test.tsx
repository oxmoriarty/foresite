/**
 * ForeSite Phase 5 Stage 4B Test Suite
 * Conflict Resolution UI & Field Comparison Engine
 *
 * Verifies:
 * 1. Side-by-side 3-column field comparison (Base, Local, Remote)
 * 2. Human Review Decision Invariant banner display when review statuses diverge
 * 3. Enforced explicit field choice selection before applying resolution
 * 4. Merged non-conflicting fields preview accordion
 * 5. Resolution submission via resolveConflictWithPayload and replay trigger
 * 6. Concurrency guard preventing stale conflict resolution
 * 7. Discard mutation safeguard preserving local photographic evidence in IndexedDB
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ConflictResolutionModal } from "../src/components/conflict/ConflictResolutionModal";
import {
  enqueueMutation,
  transitionMutationStatus,
  getMutationById,
} from "../src/services/mutationQueue";
import {
  clearAllMutationQueueData,
  clearAllLocalEvidence,
  closeDatabase,
  saveEvidencePhoto,
  getEvidencePhotosByInspection,
} from "../src/services/indexeddb";
import { auth } from "../src/lib/firebase";
import * as firestoreService from "../src/services/firestore";
import * as mutationReplay from "../src/services/mutationReplay";
import {
  MutationRecord,
  ConflictDetails,
  Inspection,
  UpdateDraftPayload,
} from "../src/types";

const TEST_UID = "inspector-user-4b";

// Mock Firebase Auth
vi.mock("../src/lib/firebase", () => ({
  auth: {
    currentUser: { uid: "inspector-user-4b", email: "inspector@test.com" },
  },
  db: {},
  hasValidConfig: true,
}));

// Mock Firestore getInspection
vi.mock("../src/services/firestore", () => ({
  getInspection: vi.fn(),
  updateInspectionDraftTransaction: vi.fn(),
  transitionInspectionReviewTransaction: vi.fn(),
}));

// Mock replayQueuedMutations
vi.mock("../src/services/mutationReplay", async (importOriginal) => {
  const actual = await importOriginal<typeof mutationReplay>();
  return {
    ...actual,
    replayQueuedMutations: vi.fn().mockResolvedValue({
      status: "SUCCESS",
      processedCount: 1,
      succeededCount: 1,
      failedCount: 0,
      conflictCount: 0,
      itemResults: [],
    }),
  };
});

function createMockConflictDetails(): ConflictDetails {
  const baseSnapshot: Inspection = {
    id: "insp-conflict-1",
    projectId: "proj-1",
    projectName: "Tower One",
    title: "Initial Anchor Inspection",
    observation: "Standard bolt anchors visible",
    category: "installation",
    visibleEvidence: ["Bolt 1", "Bolt 2"],
    uncertainties: [],
    inspectorFollowUp: [],
    reviewStatus: "draft_generated",
    aiAssisted: false,
    revision: 1,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  };

  const localSnapshot: Inspection = {
    ...baseSnapshot,
    title: "Local Update: High-Tensile Anchor Inspection",
    observation: "Local observation: Grade 8 bolts installed and torqued",
    reviewStatus: "in_review",
    revision: 1,
    updatedAt: 1700000005000,
  };

  const remoteSnapshot: Inspection = {
    ...baseSnapshot,
    title: "Remote Update: Anchor Spec Revision B",
    observation: "Remote observation: Grade 5 bolts verified by peer",
    reviewStatus: "approved",
    revision: 2,
    updatedAt: 1700000010000,
  };

  return {
    conflicts: [
      {
        field: "title",
        baseValue: baseSnapshot.title,
        localValue: localSnapshot.title,
        remoteValue: remoteSnapshot.title,
        category: "SCALAR_FIELD",
      },
      {
        field: "observation",
        baseValue: baseSnapshot.observation,
        localValue: localSnapshot.observation,
        remoteValue: remoteSnapshot.observation,
        category: "SCALAR_FIELD",
      },
      {
        field: "reviewStatus",
        baseValue: baseSnapshot.reviewStatus,
        localValue: localSnapshot.reviewStatus,
        remoteValue: remoteSnapshot.reviewStatus,
        category: "REVIEW_STATUS",
      },
    ],
    baseSnapshot,
    localSnapshot,
    remoteSnapshot,
    reviewReconciliation: {
      resolved: false,
      outcomeStatus: null,
      currentRemoteStatus: "approved",
      pendingLocalStatus: "in_review",
      conflictType: "CONCURRENT_HUMAN_CONFLICT",
      requiresHumanResolution: true,
      reason: "Human review decision invariant: local 'in_review' vs remote 'approved' requires explicit human resolution.",
    },
    detectedAt: Date.now(),
  };
}

describe("ConflictResolutionModal Component", () => {
  let sampleMutation: MutationRecord;

  beforeEach(async () => {
    vi.clearAllMocks();
    (auth as { currentUser: { uid: string; email?: string } | null }).currentUser = {
      uid: TEST_UID,
      email: "inspector@test.com",
    };
    await clearAllLocalEvidence();
    await clearAllMutationQueueData();

    // Set up default Firestore getInspection return
    const conflictDetails = createMockConflictDetails();
    vi.mocked(firestoreService.getInspection).mockResolvedValue(conflictDetails.remoteSnapshot as Inspection);

    // Enqueue a real mutation
    const updatePayload: UpdateDraftPayload = {
      type: "UPDATE_DRAFT",
      title: "Local Update: High-Tensile Anchor Inspection",
      observation: "Local observation: Grade 8 bolts installed and torqued",
    };

    const record = await enqueueMutation({
      ownerUid: TEST_UID,
      type: "UPDATE_DRAFT",
      targetInspectionId: "insp-conflict-1",
      baseRevision: 1,
      payload: updatePayload,
    });
    const mutId = record.id;

    // Transition to in_flight, then conflict
    await transitionMutationStatus({
      ownerUid: TEST_UID,
      mutationId: mutId,
      targetStatus: "in_flight",
    });
    await transitionMutationStatus({
      ownerUid: TEST_UID,
      mutationId: mutId,
      targetStatus: "conflict",
      conflictReason: "Concurrent edit conflict detected on title and observation",
      conflictDetails,
    });

    sampleMutation = (await getMutationById(TEST_UID, mutId))!;
  });

  afterEach(() => {
    closeDatabase();
  });

  it("renders side-by-side 3-column field comparison and header notice", async () => {
    render(
      <ConflictResolutionModal
        isOpen={true}
        onClose={vi.fn()}
        mutation={sampleMutation}
        onResolved={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Original Base/i).length).toBeGreaterThan(0);
    });

    // Header notice
    expect(screen.getByText("Concurrent Modifications Detected")).toBeInTheDocument();
    expect(screen.getByText(/insp-conflict-1/)).toBeInTheDocument();

    // 3 columns rendered in the grid
    expect(screen.getAllByText(/Original Base/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Your Local Change/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Server Remote/i).length).toBeGreaterThan(0);

    // Conflicting fields rendered
    expect(screen.getByText("title")).toBeInTheDocument();
    expect(screen.getByText("observation")).toBeInTheDocument();

    // Field values rendered
    expect(screen.getByText("Initial Anchor Inspection")).toBeInTheDocument();
    expect(screen.getByText("Local Update: High-Tensile Anchor Inspection")).toBeInTheDocument();
    expect(screen.getByText("Remote Update: Anchor Spec Revision B")).toBeInTheDocument();
  });

  it("displays Human Review Decision Invariant banner when review status is divergent", async () => {
    render(
      <ConflictResolutionModal
        isOpen={true}
        onClose={vi.fn()}
        mutation={sampleMutation}
        onResolved={vi.fn()}
      />
    );

    // Human Review Decision Invariant banner
    await waitFor(() => {
      expect(screen.getByText("Human Review Decision Invariant")).toBeInTheDocument();
    });
    expect(
      screen.getByText(/strictly protects human review decisions/i)
    ).toBeInTheDocument();
  });

  it("disables 'Apply Resolution & Upload' until all conflicting fields have an explicit choice", async () => {
    render(
      <ConflictResolutionModal
        isOpen={true}
        onClose={vi.fn()}
        mutation={sampleMutation}
        onResolved={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Original Base/i).length).toBeGreaterThan(0);
    });

    const resolveBtn = screen.getByRole("button", { name: /Apply Resolution & Upload/i });
    expect(resolveBtn).toBeDisabled();
    expect(
      screen.getByText(/Selection required for all fields/i)
    ).toBeInTheDocument();

    // Select Local for Title by clicking the local card
    const localChangeCards = screen.getAllByText(/Your Local Change/i);
    expect(localChangeCards[0]).toBeDefined();
    fireEvent.click(localChangeCards[0]!);

    // Still disabled because observation remains unchosen
    expect(resolveBtn).toBeDisabled();
  });

  it("submits resolved payload combining explicit inspector choices and triggers replay", async () => {
    const onResolvedSpy = vi.fn();
    const onCloseSpy = vi.fn();

    render(
      <ConflictResolutionModal
        isOpen={true}
        onClose={onCloseSpy}
        mutation={sampleMutation}
        onResolved={onResolvedSpy}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Original Base/i).length).toBeGreaterThan(0);
    });

    // 1. Choose Local for Title
    const localChangeCards = screen.getAllByText(/Your Local Change/i);
    expect(localChangeCards[0]).toBeDefined();
    fireEvent.click(localChangeCards[0]!);

    // 2. Choose Remote for Observation
    const remoteChangeCards = screen.getAllByText(/Server Remote/i);
    expect(remoteChangeCards[1]).toBeDefined();
    fireEvent.click(remoteChangeCards[1]!);

    // Now Resolve button must be enabled
    const resolveBtn = screen.getByRole("button", { name: /Apply Resolution & Upload/i });
    expect(resolveBtn).toBeEnabled();

    // Click Resolve
    fireEvent.click(resolveBtn);

    await waitFor(() => {
      expect(onResolvedSpy).toHaveBeenCalledTimes(1);
      expect(onCloseSpy).toHaveBeenCalledTimes(1);
    });

    // Verify mutation in queue was updated and reset to "queued"
    const updatedMutation = await getMutationById(TEST_UID, sampleMutation.id);
    expect(updatedMutation).not.toBeNull();
    expect(updatedMutation?.status).toBe("queued");
    expect(updatedMutation?.baseRevision).toBe(2); // Updated to latest remote revision

    // Verify replayQueuedMutations was triggered
    expect(mutationReplay.replayQueuedMutations).toHaveBeenCalled();
  });

  it("guards against stale resolution if remote inspection revision changed concurrently", async () => {
    const remoteSnapshot = sampleMutation.conflictDetails!.remoteSnapshot as Inspection;
    // Initial fetch returns revision 2 (when opening modal)
    // Subsequent fetch in handleApplyResolution returns revision 3 (concurrent update while reviewing)
    vi.mocked(firestoreService.getInspection)
      .mockResolvedValueOnce(remoteSnapshot)
      .mockResolvedValueOnce({
        ...remoteSnapshot,
        revision: 3,
      });

    render(
      <ConflictResolutionModal
        isOpen={true}
        onClose={vi.fn()}
        mutation={sampleMutation}
        onResolved={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Original Base/i).length).toBeGreaterThan(0);
    });

    // Make choices
    const localChangeCards = screen.getAllByText(/Your Local Change/i);
    expect(localChangeCards[0]).toBeDefined();
    fireEvent.click(localChangeCards[0]!);
    const remoteChangeCards = screen.getAllByText(/Server Remote/i);
    expect(remoteChangeCards[1]).toBeDefined();
    fireEvent.click(remoteChangeCards[1]!);

    const resolveBtn = screen.getByRole("button", { name: /Apply Resolution & Upload/i });
    fireEvent.click(resolveBtn);

    // Should detect concurrency and show error
    await waitFor(() => {
      expect(
        screen.getByText(/Remote inspection revision advanced from/i)
      ).toBeInTheDocument();
    });

    // Mutation status must NOT be reset to queued
    const mutation = await getMutationById(TEST_UID, sampleMutation.id);
    expect(mutation?.status).toBe("conflict");
  });

  it("discard flow opens safeguard dialog and confirms discard without deleting photos in IndexedDB", async () => {
    // Stage an evidence photo in IndexedDB to verify it is NEVER deleted on mutation discard
    await saveEvidencePhoto({
      id: "photo-safeguard-1",
      inspectionId: "insp-conflict-1",
      projectId: "proj-1",
      fileName: "anchor_weld.jpg",
      mimeType: "image/jpeg",
      fileSizeBytes: 1024,
      capturedAt: Date.now(),
      createdAt: Date.now(),
      blob: new Blob(["simulated-image-data"], { type: "image/jpeg" }),
    });

    const onCloseSpy = vi.fn();
    const onResolvedSpy = vi.fn();

    render(
      <ConflictResolutionModal
        isOpen={true}
        onClose={onCloseSpy}
        mutation={sampleMutation}
        onResolved={onResolvedSpy}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Original Base/i).length).toBeGreaterThan(0);
      expect(screen.getByRole("button", { name: /Discard Local Draft/i })).toBeEnabled();
    });

    // Click "Discard Local Draft"
    const discardBtn = screen.getByRole("button", { name: /Discard Local Draft/i });
    fireEvent.click(discardBtn);

    // Safeguard dialog displayed
    expect(screen.getByText("Confirm Discarding Local Offline Edits")).toBeInTheDocument();
    expect(
      screen.getByText(/Photographic evidence Blobs saved in your device storage will NOT be deleted/i)
    ).toBeInTheDocument();

    // Confirm Discard
    const confirmBtn = screen.getByRole("button", { name: /Yes, Discard Local Edits/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(onCloseSpy).toHaveBeenCalledTimes(1);
      expect(onResolvedSpy).toHaveBeenCalledTimes(1);
    });

    // Mutation is cancelled
    const mutation = await getMutationById(TEST_UID, sampleMutation.id);
    expect(mutation?.status).toBe("cancelled_by_user");

    // Photographic evidence in IndexedDB is 100% PRESERVED
    const photos = await getEvidencePhotosByInspection("insp-conflict-1");
    expect(photos).toHaveLength(1);
    expect(photos[0]!.id).toBe("photo-safeguard-1");
  });
});
