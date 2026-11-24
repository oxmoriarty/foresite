/**
 * ForeSite Phase 5 Stage 4B Test Suite
 * Sync Center UI, Queue Management, Filtering & Diagnostics Export
 *
 * Verifies:
 * 1. Queue summary KPI cards and metrics
 * 2. Filter tabs (All, Needs Attention, Waiting, Synced, Cancelled)
 * 3. Plain-language status badges and mutation cards
 * 4. Resolve Conflict action opening ConflictResolutionModal
 * 5. Retry failed mutation with FIFO conflict blocking invariant
 * 6. Discard mutation safeguard preserving local IndexedDB photo blobs
 * 7. Manual Sync Now action triggering replay
 * 8. Sanitized JSON diagnostics export containing zero credentials/secrets
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SyncCenterScreen } from "../src/screens/SyncCenterScreen";
import {
  enqueueMutation,
  transitionMutationStatus,
  recordMutationAttempt,
  exportQueueDiagnostics,
} from "../src/services/mutationQueue";
import {
  clearAllMutationQueueData,
  clearAllLocalEvidence,
  closeDatabase,
  saveEvidencePhoto,
  getEvidencePhotosByInspection,
} from "../src/services/indexeddb";
import { auth } from "../src/lib/firebase";
import * as mutationReplay from "../src/services/mutationReplay";
import * as firestoreService from "../src/services/firestore";
import {
  CreateInspectionPayload,
  UpdateDraftPayload,
  ConflictDetails,
  Inspection,
} from "../src/types";

const TEST_UID = "inspector-user-sync-center";

// Mock Firebase Auth
vi.mock("../src/lib/firebase", () => ({
  auth: {
    currentUser: { uid: "inspector-user-sync-center", email: "inspector@test.com" },
  },
  db: {},
  hasValidConfig: true,
}));

// Mock Firestore
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

function createMockConflictDetails(inspectionId = "insp-sc-1"): ConflictDetails {
  const baseSnapshot: Inspection = {
    id: inspectionId,
    projectId: "proj-1",
    projectName: "Harbor Bridge",
    title: "Foundation Footing Check",
    observation: "Poured concrete cured 48h",
    category: "installation",
    visibleEvidence: [],
    uncertainties: [],
    inspectorFollowUp: [],
    reviewStatus: "draft_generated",
    aiAssisted: false,
    revision: 1,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  };

  return {
    conflicts: [
      {
        field: "title",
        baseValue: baseSnapshot.title,
        localValue: "Local Title Update",
        remoteValue: "Remote Title Update",
        category: "SCALAR_FIELD",
      },
    ],
    baseSnapshot,
    localSnapshot: { ...baseSnapshot, title: "Local Title Update", revision: 1 },
    remoteSnapshot: { ...baseSnapshot, title: "Remote Title Update", revision: 2 },
    detectedAt: Date.now(),
  };
}

describe("SyncCenterScreen Component", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    (auth as { currentUser: { uid: string; email?: string } | null }).currentUser = {
      uid: TEST_UID,
      email: "inspector@test.com",
    };
    await clearAllLocalEvidence();
    await clearAllMutationQueueData();

    // Mock getInspection for conflict details
    vi.mocked(firestoreService.getInspection).mockResolvedValue(
      createMockConflictDetails("insp-sc-conflict").remoteSnapshot as Inspection
    );

    // Enqueue a diverse set of mutations
    // 1. Queued mutation
    const createPayload: CreateInspectionPayload = {
      type: "CREATE_INSPECTION",
      inspection: {
        projectId: "proj-1",
        projectName: "Harbor Bridge",
        title: "Pile Integrity Scan",
        observation: "Sonic testing on Pile #4",
        category: "installation",
        visibleEvidence: [],
        uncertainties: [],
        inspectorFollowUp: [],
        reviewStatus: "draft_generated",
        aiAssisted: false,
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
      },
    };
    await enqueueMutation({
      ownerUid: TEST_UID,
      type: "CREATE_INSPECTION",
      targetInspectionId: "insp-queued-1",
      payload: createPayload,
    });

    // 2. Conflicted mutation
    const conflictPayload: UpdateDraftPayload = {
      type: "UPDATE_DRAFT",
      title: "Local Title Update",
    };
    const conflictRecord = await enqueueMutation({
      ownerUid: TEST_UID,
      type: "UPDATE_DRAFT",
      targetInspectionId: "insp-sc-conflict",
      baseRevision: 1,
      payload: conflictPayload,
    });
    const conflictMutId = conflictRecord.id;
    await transitionMutationStatus({
      ownerUid: TEST_UID,
      mutationId: conflictMutId,
      targetStatus: "in_flight",
    });
    await transitionMutationStatus({
      ownerUid: TEST_UID,
      mutationId: conflictMutId,
      targetStatus: "conflict",
      conflictReason: "Concurrent edit detected",
      conflictDetails: createMockConflictDetails("insp-sc-conflict"),
    });

    // 3. Failed exhausted mutation
    const failPayload: UpdateDraftPayload = {
      type: "UPDATE_DRAFT",
      observation: "Failed update",
    };
    const failedRecord = await enqueueMutation({
      ownerUid: TEST_UID,
      type: "UPDATE_DRAFT",
      targetInspectionId: "insp-sc-failed",
      baseRevision: 1,
      payload: failPayload,
    });
    const failedMutId = failedRecord.id;
    await transitionMutationStatus({
      ownerUid: TEST_UID,
      mutationId: failedMutId,
      targetStatus: "in_flight",
    });
    await recordMutationAttempt({
      ownerUid: TEST_UID,
      mutationId: failedMutId,
      failureReason: "Missing Firestore permission",
      isTransientFailure: false,
    });
  });

  afterEach(() => {
    closeDatabase();
  });

  it("renders Uploads heading, KPI counters, and mutation cards", async () => {
    render(<SyncCenterScreen />);

    // Heading and items loaded
    await waitFor(() => {
      expect(screen.getByText("Uploads")).toBeInTheDocument();
      expect(screen.getByText("insp-queued-1")).toBeInTheDocument();
    });

    // KPI cards
    expect(screen.getByText("Waiting")).toBeInTheDocument();
    expect(screen.getByText("Conflicts")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();

    // Plain-language badges in list
    expect(screen.getByText("Waiting to upload")).toBeInTheDocument();
    expect(screen.getByText("Needs conflict resolution")).toBeInTheDocument();
    expect(screen.getByText("Upload failed, retries exhausted")).toBeInTheDocument();
  });

  it("filters mutations when clicking filter tabs", async () => {
    render(<SyncCenterScreen />);

    await waitFor(() => {
      expect(screen.getByText("insp-queued-1")).toBeInTheDocument();
    });

    // Click "Needs Attention" filter tab
    const needsAttentionTab = screen.getByRole("button", { name: /Needs Attention/i });
    fireEvent.click(needsAttentionTab);

    // Only conflict and failed should be visible, queued should not
    expect(screen.queryByText("insp-queued-1")).not.toBeInTheDocument();
    expect(screen.getByText("Needs conflict resolution")).toBeInTheDocument();
    expect(screen.getByText("Upload failed, retries exhausted")).toBeInTheDocument();

    // Click "Waiting to Upload" tab
    const waitingTab = screen.getByRole("button", { name: /Waiting to Upload/i });
    fireEvent.click(waitingTab);

    // Now queued item is visible
    expect(screen.getByText("insp-queued-1")).toBeInTheDocument();
    expect(screen.queryByText("Needs conflict resolution")).not.toBeInTheDocument();
  });

  it("opens ConflictResolutionModal when clicking '[Resolve Conflict]'", async () => {
    render(<SyncCenterScreen />);

    await waitFor(() => {
      expect(screen.getByText("Needs conflict resolution")).toBeInTheDocument();
    });

    const resolveBtn = screen.getByRole("button", { name: /Resolve Conflict/i });
    fireEvent.click(resolveBtn);

    // Modal title from ConflictResolutionModal
    await waitFor(() => {
      expect(screen.getByText("Resolve Upload Conflict")).toBeInTheDocument();
    });
  });

  it("manually retries a failed mutation and resets it to 'queued'", async () => {
    render(<SyncCenterScreen />);

    await waitFor(() => {
      expect(screen.getByText("Upload failed, retries exhausted")).toBeInTheDocument();
    });

    const retryBtn = screen.getByRole("button", { name: /Retry Upload/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText(/Mutation queued for retry/i)).toBeInTheDocument();
    });

    // Verify replay was triggered
    expect(mutationReplay.replayQueuedMutations).toHaveBeenCalled();
  });

  it("blocks manual retry if an earlier mutation on the same inspection has an unresolved conflict", async () => {
    // Add a downstream mutation on the conflicted inspection
    const downstreamPayload: UpdateDraftPayload = {
      type: "UPDATE_DRAFT",
      observation: "Downstream edit",
    };
    const downstreamRecord = await enqueueMutation({
      ownerUid: TEST_UID,
      type: "UPDATE_DRAFT",
      targetInspectionId: "insp-sc-conflict",
      baseRevision: 1,
      payload: downstreamPayload,
    });
    const downstreamMutId = downstreamRecord.id;
    // Mark downstream as in_flight then fail it
    await transitionMutationStatus({
      ownerUid: TEST_UID,
      mutationId: downstreamMutId,
      targetStatus: "in_flight",
    });
    await recordMutationAttempt({
      ownerUid: TEST_UID,
      mutationId: downstreamMutId,
      failureReason: "Simulated network failure",
      isTransientFailure: false, // sets failed_exhausted
    });

    render(<SyncCenterScreen />);

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /Retry Upload/i }).length).toBeGreaterThan(0);
    });

    // Click retry on the downstream mutation (newest mutation with sequence number higher than conflict)
    const retryBtns = screen.getAllByRole("button", { name: /Retry Upload/i });
    expect(retryBtns[0]).toBeDefined();
    fireEvent.click(retryBtns[0]!);

    await waitFor(() => {
      expect(
        screen.getByText(/Cannot retry mutation: inspection has an earlier unresolved conflict/i)
      ).toBeInTheDocument();
    });
  });

  it("safely discards a mutation while preserving photographic evidence in IndexedDB", async () => {
    // Save a photo in IndexedDB
    await saveEvidencePhoto({
      id: "photo-sc-keep",
      inspectionId: "insp-sc-failed",
      projectId: "proj-1",
      fileName: "crack_meter.png",
      mimeType: "image/png",
      fileSizeBytes: 2048,
      capturedAt: Date.now(),
      createdAt: Date.now(),
      blob: new Blob(["crack-photo"], { type: "image/png" }),
    });

    render(<SyncCenterScreen />);

    await waitFor(() => {
      expect(screen.getByText("Upload failed, retries exhausted")).toBeInTheDocument();
    });

    // Click discard on the failed mutation
    const discardBtns = screen.getAllByRole("button", { name: /Discard/i });
    expect(discardBtns[0]).toBeDefined();
    fireEvent.click(discardBtns[0]!);

    // Discard safeguard modal opened
    expect(screen.getByText("Confirm Discarding Mutation")).toBeInTheDocument();
    expect(
      screen.getByText(/Photographic evidence Blobs saved on this device will NOT be deleted/i)
    ).toBeInTheDocument();

    // Confirm discard
    const confirmBtn = screen.getByRole("button", { name: /Yes, Discard Mutation/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(screen.getByText(/cancelled. Local photos preserved/i)).toBeInTheDocument();
    });

    // Verify photo still exists in IndexedDB
    const photos = await getEvidencePhotosByInspection("insp-sc-failed");
    expect(photos).toHaveLength(1);
    expect(photos[0]!.id).toBe("photo-sc-keep");
  });

  it("triggers manual sync replay on '[Upload Now]' button click", async () => {
    render(<SyncCenterScreen />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Upload Now/i })).toBeInTheDocument();
    });

    const syncNowBtn = screen.getByRole("button", { name: /Upload Now/i });
    fireEvent.click(syncNowBtn);

    await waitFor(() => {
      expect(mutationReplay.replayQueuedMutations).toHaveBeenCalled();
      expect(screen.getByText(/Upload complete: 1 change\(s\) uploaded/i)).toBeInTheDocument();
    });
  });

  it("exports sanitized diagnostics JSON containing zero secrets or tokens", async () => {
    // Mock URL.createObjectURL and URL.revokeObjectURL
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const createObjectURLSpy = vi.fn().mockReturnValue("blob:mock-url");
    const revokeObjectURLSpy = vi.fn();
    const anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    URL.createObjectURL = createObjectURLSpy;
    URL.revokeObjectURL = revokeObjectURLSpy;

    // Test diagnostics generator directly first
    const diagnostics = await exportQueueDiagnostics(TEST_UID);
    expect(diagnostics.application).toBe("ForeSite");
    expect(diagnostics.version).toBe("Phase 5 Stage 4B");
    expect(diagnostics.ownerUid).toBe(TEST_UID);
    expect(diagnostics.queueSummary.total).toBeGreaterThan(0);
    // Ensure no auth tokens or credentials in export
    const jsonStr = JSON.stringify(diagnostics);
    expect(jsonStr).not.toContain("token");
    expect(jsonStr).not.toContain("apiKey");
    expect(jsonStr).not.toContain("secret");

    render(<SyncCenterScreen />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Export Diagnostics/i })).toBeEnabled();
    });

    const exportBtn = screen.getByRole("button", { name: /Export Diagnostics/i });
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(screen.getByText(/Diagnostic report exported successfully/i)).toBeInTheDocument();
    });

    anchorClickSpy.mockRestore();
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });
});
