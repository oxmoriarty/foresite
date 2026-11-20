/**
 * ForeSite Phase 5 Stage 4C Test Suite: Photo Blob Cleanup & Deletion Receipts
 *
 * Verifies:
 * 1. Receipt Lifecycle: Creation, stage transitions, idempotency, progress tracking, terminal completion.
 * 2. Safe Photo Deletion: Inspection/owner matching, cross-reference protection, preservation of archived/rejected/audited records.
 * 3. Startup & Crash Recovery: Interruption handling at every boundary, tenant isolation, account-switch protection.
 * 4. Permanent Deletion Integration: Full 4-stage lifecycle (Stage 1 -> Stage 2 -> Stage 3 -> Stage 4).
 * 5. Invariants: Photographic Blobs in IndexedDB are NEVER deleted before remote deletion is authoritatively confirmed.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  initiateInspectionDeletion,
  confirmRemoteDeletion,
  executePhotoCleanup,
  recoverPhotoCleanups,
  isInspectionEligibleForPermanentDeletion,
} from "../src/services/photoCleanup";
import {
  saveEvidencePhoto,
  getEvidencePhoto,
  saveLocalDraft,
  getLocalDraft,
  saveDeletionReceipt,
  getDeletionReceipt,
  clearAllLocalEvidence,
  clearAllDeletionReceipts,
  clearAllMutationQueueData,
  closeDatabase,
} from "../src/services/indexeddb";
import {
  getAllMutationsByOwner,
  getMutationById,
  enqueueMutation,
} from "../src/services/mutationQueue";
import { replayQueuedMutations } from "../src/services/mutationReplay";
import { auth } from "../src/lib/firebase";
import {
  LocalDraftInspection,
  Inspection,
  DeletionReceipt,
} from "../src/types";

// In-memory Firestore document store
const mockRemoteDocStore = new Map<string, Record<string, unknown>>();

// Mock Firebase Auth and Firestore
vi.mock("../src/lib/firebase", () => ({
  auth: {
    currentUser: null as { uid: string; email?: string } | null,
  },
  db: {},
  hasValidConfig: true,
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_db, ...parts: string[]) => ({ path: parts.join("/") })),
  getDoc: vi.fn(async (docRef: { path: string }) => {
    const data = mockRemoteDocStore.get(docRef.path);
    return {
      exists: () => data !== undefined,
      data: () => data,
      id: docRef.path.split("/").pop(),
    };
  }),
  setDoc: vi.fn(async (docRef: { path: string }, data: Record<string, unknown>) => {
    mockRemoteDocStore.set(docRef.path, data);
  }),
  deleteDoc: vi.fn(async (docRef: { path: string }) => {
    mockRemoteDocStore.delete(docRef.path);
  }),
  updateDoc: vi.fn(async (docRef: { path: string }, updates: Record<string, unknown>) => {
    const existing = mockRemoteDocStore.get(docRef.path) || {};
    mockRemoteDocStore.set(docRef.path, { ...existing, ...updates });
  }),
  runTransaction: vi.fn(async (_db, updateFunction: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      get: vi.fn(async (docRef: { path: string }) => {
        const data = mockRemoteDocStore.get(docRef.path);
        return {
          exists: () => data !== undefined,
          data: () => data,
          id: docRef.path.split("/").pop(),
        };
      }),
      set: vi.fn((docRef: { path: string }, data: Record<string, unknown>) => {
        mockRemoteDocStore.set(docRef.path, data);
      }),
      delete: vi.fn((docRef: { path: string }) => {
        mockRemoteDocStore.delete(docRef.path);
      }),
    };
    return await updateFunction(tx);
  }),
}));

const TEST_UID = "user-inspector-stage4c";

function createMockLockCoordinator() {
  return {
    async requestLock<T>(_name: string, callback: () => Promise<T>) {
      const result = await callback();
      return { acquired: true, result };
    },
  };
}

describe("ForeSite Phase 5 Stage 4C: Photo Blob Cleanup & Deletion Receipts", () => {
  beforeEach(async () => {
    mockRemoteDocStore.clear();
    (auth as { currentUser: { uid: string; email?: string } | null }).currentUser = {
      uid: TEST_UID,
      email: "inspector@foresite.build",
    };
    await clearAllLocalEvidence();
    await clearAllDeletionReceipts();
    await clearAllMutationQueueData();
  });

  afterEach(() => {
    (auth as { currentUser: { uid: string; email?: string } | null }).currentUser = null;
    closeDatabase();
  });

  // ==========================================================================
  // 1. Eligibility & Deletion Guards
  // ==========================================================================
  describe("1. Deletion Eligibility & Preflight Guards", () => {
    it("permits deletion for active, unreviewed draft with 0 review history", () => {
      const draft: Partial<Inspection> = {
        id: "insp-eligible",
        reviewStatus: "draft_generated",
        reviewHistory: [],
        isArchived: false,
      };
      const res = isInspectionEligibleForPermanentDeletion(draft);
      expect(res.eligible).toBe(true);
    });

    it("rejects deletion if inspection has review history events", () => {
      const draft: Partial<Inspection> = {
        id: "insp-has-history",
        reviewStatus: "draft_generated",
        reviewHistory: [
          {
            id: "rev-evt-1",
            fromStatus: "draft_generated",
            toStatus: "in_review",
            byUid: TEST_UID,
            timestamp: 1000,
          },
        ],
        isArchived: false,
      };
      const res = isInspectionEligibleForPermanentDeletion(draft);
      expect(res.eligible).toBe(false);
      expect(res.reason).toContain("review audit event(s)");
    });

    it("rejects deletion if inspection is approved", () => {
      const draft: Partial<Inspection> = {
        id: "insp-approved",
        reviewStatus: "approved",
        reviewHistory: [],
        isArchived: false,
      };
      const res = isInspectionEligibleForPermanentDeletion(draft);
      expect(res.eligible).toBe(false);
      expect(res.reason).toContain("approved");
    });

    it("rejects deletion if inspection is rejected", () => {
      const draft: Partial<Inspection> = {
        id: "insp-rejected",
        reviewStatus: "rejected",
        reviewHistory: [],
        isArchived: false,
      };
      const res = isInspectionEligibleForPermanentDeletion(draft);
      expect(res.eligible).toBe(false);
      expect(res.reason).toContain("rejected");
    });

    it("rejects deletion if inspection is archived", () => {
      const draft: Partial<Inspection> = {
        id: "insp-archived",
        reviewStatus: "draft_generated",
        reviewHistory: [],
        isArchived: true,
      };
      const res = isInspectionEligibleForPermanentDeletion(draft);
      expect(res.eligible).toBe(false);
      expect(res.reason).toContain("Archived inspections cannot be permanently deleted");
    });
  });

  // ==========================================================================
  // 2. Deletion Receipt Lifecycle
  // ==========================================================================
  describe("2. Deletion Receipt Lifecycle & Idempotency", () => {
    it("creates durable deletion receipt in 'pending_remote_delete' and enqueues DELETE_INSPECTION", async () => {
      const inspectionId = "insp-receipt-01";
      const photoBlob = new Blob(["photo-data-stage4c"], { type: "image/jpeg" });

      await saveEvidencePhoto({
        id: "photo-rcpt-01",
        inspectionId,
        projectId: "proj-1",
        blob: photoBlob,
        fileName: "foundation.jpg",
        fileSizeBytes: photoBlob.size,
        mimeType: "image/jpeg",
        capturedAt: 1000,
        createdAt: 1000,
      });

      const draft: LocalDraftInspection = {
        id: inspectionId,
        ownerUid: TEST_UID,
        projectId: "proj-1",
        title: "Foundation Inspection Draft",
        observation: "Obs",
        category: "installation",
        visibleEvidence: [],
        uncertainties: [],
        inspectorFollowUp: [],
        photoIds: ["photo-rcpt-01"],
        isSynced: false,
        reviewStatus: "draft_generated",
        reviewHistory: [],
        lastSavedAt: 1000,
        createdAt: 1000,
      };
      await saveLocalDraft(draft);

      const { receipt, mutationId } = await initiateInspectionDeletion(TEST_UID, draft, 2000);

      expect(receipt.id).toBe(`del-rcpt-${inspectionId}`);
      expect(receipt.inspectionId).toBe(inspectionId);
      expect(receipt.ownerUid).toBe(TEST_UID);
      expect(receipt.stage).toBe("pending_remote_delete");
      expect(receipt.photoIds).toContain("photo-rcpt-01");
      expect(receipt.mutationId).toBe(mutationId);
      expect(receipt.photosDeletedCount).toBe(0);

      // Verify draft marked with deletionStage
      const savedDraft = await getLocalDraft(inspectionId);
      expect(savedDraft?.deletionStage).toBe("pending_remote_delete");

      // Verify photo Blob remains intact in IndexedDB (INVARIANT: Never delete early!)
      const photo = await getEvidencePhoto("photo-rcpt-01");
      expect(photo).not.toBeNull();

      // Verify mutation enqueued in offline queue
      const queuedMutations = await getAllMutationsByOwner(TEST_UID);
      expect(queuedMutations.length).toBe(1);
      expect(queuedMutations[0]?.type).toBe("DELETE_INSPECTION");
      expect(queuedMutations[0]?.targetInspectionId).toBe(inspectionId);
    });

    it("prevents physical photo deletion while receipt is in 'pending_remote_delete'", async () => {
      const inspectionId = "insp-no-early-delete";
      const receipt: DeletionReceipt = {
        id: `del-rcpt-${inspectionId}`,
        inspectionId,
        ownerUid: TEST_UID,
        stage: "pending_remote_delete",
        photoIds: ["photo-safe-1"],
        deletedPhotoIds: [],
        retainedPhotoIds: [],
        photosDeletedCount: 0,
        createdAt: 1000,
      };
      await saveDeletionReceipt(receipt);

      await expect(executePhotoCleanup(receipt.id, TEST_UID)).rejects.toThrow(
        "Physical photo cleanup cannot be executed before remote Firestore deletion is authoritatively confirmed"
      );
    });

    it("advances receipt to 'remote_confirmed_pending_blob_purge' on confirmRemoteDeletion", async () => {
      const inspectionId = "insp-confirm-01";
      const receipt: DeletionReceipt = {
        id: `del-rcpt-${inspectionId}`,
        inspectionId,
        ownerUid: TEST_UID,
        stage: "pending_remote_delete",
        photoIds: ["photo-1"],
        deletedPhotoIds: [],
        retainedPhotoIds: [],
        photosDeletedCount: 0,
        createdAt: 1000,
      };
      await saveDeletionReceipt(receipt);

      const confirmed = await confirmRemoteDeletion(receipt.id, TEST_UID, "mut-123", 2000);
      expect(confirmed.stage).toBe("remote_confirmed_pending_blob_purge");
      expect(confirmed.remoteConfirmedAt).toBe(2000);
      expect(confirmed.mutationId).toBe("mut-123");
    });
  });

  // ==========================================================================
  // 3. Safe Physical Photo Deletion & Cross-Reference Protection
  // ==========================================================================
  describe("3. Safe Physical Photo Deletion & Cross-Reference Invariants", () => {
    it("safely deletes photo Blobs and local draft when remote deletion is confirmed", async () => {
      const inspectionId = "insp-safe-delete";
      const blob = new Blob(["photo-data-binary"], { type: "image/jpeg" });

      await saveEvidencePhoto({
        id: "photo-to-delete-01",
        inspectionId,
        projectId: "proj-1",
        blob,
        fileName: "defect.jpg",
        fileSizeBytes: blob.size,
        mimeType: "image/jpeg",
        capturedAt: 1000,
        createdAt: 1000,
      });

      await saveLocalDraft({
        id: inspectionId,
        ownerUid: TEST_UID,
        projectId: "proj-1",
        title: "Draft to Delete",
        observation: "Obs",
        category: "installation",
        visibleEvidence: [],
        uncertainties: [],
        inspectorFollowUp: [],
        photoIds: ["photo-to-delete-01"],
        isSynced: false,
        reviewStatus: "draft_generated",
        reviewHistory: [],
        lastSavedAt: 1000,
        createdAt: 1000,
      });

      const receipt: DeletionReceipt = {
        id: `del-rcpt-${inspectionId}`,
        inspectionId,
        ownerUid: TEST_UID,
        stage: "remote_confirmed_pending_blob_purge",
        photoIds: ["photo-to-delete-01"],
        deletedPhotoIds: [],
        retainedPhotoIds: [],
        photosDeletedCount: 0,
        createdAt: 1000,
        remoteConfirmedAt: 2000,
      };
      await saveDeletionReceipt(receipt);

      const result = await executePhotoCleanup(receipt.id, TEST_UID, 3000);

      expect(result.stage).toBe("completed");
      expect(result.deletedPhotosCount).toBe(1);
      expect(result.retainedPhotosCount).toBe(0);
      expect(result.draftPurged).toBe(true);

      // Verify photo Blob physically removed
      const photo = await getEvidencePhoto("photo-to-delete-01");
      expect(photo).toBeNull();

      // Verify draft removed from localInspections
      const draft = await getLocalDraft(inspectionId);
      expect(draft).toBeNull();

      // Verify receipt finalized
      const updatedReceipt = await getDeletionReceipt(receipt.id);
      expect(updatedReceipt?.stage).toBe("completed");
      expect(updatedReceipt?.completedAt).toBe(3000);
      expect(updatedReceipt?.deletedPhotoIds).toContain("photo-to-delete-01");
    });

    it("CRITICAL: Preserves photo Blob if referenced by another active inspection draft", async () => {
      const inspectionA = "insp-delete-shared-A";
      const inspectionB = "insp-keep-shared-B";
      const sharedPhotoId = "photo-shared-123";
      const blob = new Blob(["shared-photo-data"], { type: "image/jpeg" });

      // Save the shared photo
      await saveEvidencePhoto({
        id: sharedPhotoId,
        inspectionId: inspectionA,
        projectId: "proj-1",
        blob,
        fileName: "shared_evidence.jpg",
        fileSizeBytes: blob.size,
        mimeType: "image/jpeg",
        capturedAt: 1000,
        createdAt: 1000,
      });

      // Draft A (being deleted)
      await saveLocalDraft({
        id: inspectionA,
        ownerUid: TEST_UID,
        projectId: "proj-1",
        title: "Draft A",
        observation: "Obs A",
        category: "installation",
        visibleEvidence: [],
        uncertainties: [],
        inspectorFollowUp: [],
        photoIds: [sharedPhotoId],
        isSynced: false,
        reviewStatus: "draft_generated",
        reviewHistory: [],
        lastSavedAt: 1000,
        createdAt: 1000,
      });

      // Draft B (actively referencing shared photo)
      await saveLocalDraft({
        id: inspectionB,
        ownerUid: TEST_UID,
        projectId: "proj-1",
        title: "Draft B",
        observation: "Obs B",
        category: "surface_condition",
        visibleEvidence: [],
        uncertainties: [],
        inspectorFollowUp: [],
        photoIds: [sharedPhotoId],
        isSynced: true,
        reviewStatus: "approved",
        reviewHistory: [],
        lastSavedAt: 1000,
        createdAt: 1000,
      });

      const receipt: DeletionReceipt = {
        id: `del-rcpt-${inspectionA}`,
        inspectionId: inspectionA,
        ownerUid: TEST_UID,
        stage: "remote_confirmed_pending_blob_purge",
        photoIds: [sharedPhotoId],
        deletedPhotoIds: [],
        retainedPhotoIds: [],
        photosDeletedCount: 0,
        createdAt: 1000,
        remoteConfirmedAt: 2000,
      };
      await saveDeletionReceipt(receipt);

      const result = await executePhotoCleanup(receipt.id, TEST_UID, 3000);

      // Verify shared photo was RETAINED, NOT deleted
      expect(result.deletedPhotosCount).toBe(0);
      expect(result.retainedPhotosCount).toBe(1);

      const photo = await getEvidencePhoto(sharedPhotoId);
      expect(photo).not.toBeNull();
      expect(photo?.id).toBe(sharedPhotoId);

      // Draft A was deleted, but Draft B remains intact
      expect(await getLocalDraft(inspectionA)).toBeNull();
      expect(await getLocalDraft(inspectionB)).not.toBeNull();

      // Receipt records retained photo
      const updatedReceipt = await getDeletionReceipt(receipt.id);
      expect(updatedReceipt?.retainedPhotoIds).toContain(sharedPhotoId);
    });

    it("fails closed and retains photo Blob if photo belongs to another inspectionId", async () => {
      const inspectionId = "insp-mismatch";
      const blob = new Blob(["mismatch-photo"], { type: "image/jpeg" });

      await saveEvidencePhoto({
        id: "photo-foreign-insp",
        inspectionId: "insp-other", // Belongs to different inspection!
        projectId: "proj-1",
        blob,
        fileName: "other.jpg",
        fileSizeBytes: blob.size,
        mimeType: "image/jpeg",
        capturedAt: 1000,
        createdAt: 1000,
      });

      const receipt: DeletionReceipt = {
        id: `del-rcpt-${inspectionId}`,
        inspectionId,
        ownerUid: TEST_UID,
        stage: "remote_confirmed_pending_blob_purge",
        photoIds: ["photo-foreign-insp"],
        deletedPhotoIds: [],
        retainedPhotoIds: [],
        photosDeletedCount: 0,
        createdAt: 1000,
        remoteConfirmedAt: 2000,
      };
      await saveDeletionReceipt(receipt);

      const result = await executePhotoCleanup(receipt.id, TEST_UID, 3000);

      expect(result.deletedPhotosCount).toBe(0);
      expect(result.retainedPhotosCount).toBe(1);

      // Photo Blob remains preserved
      const photo = await getEvidencePhoto("photo-foreign-insp");
      expect(photo).not.toBeNull();
    });

    it("completed receipt behaves idempotently and does not re-delete", async () => {
      const inspectionId = "insp-completed-idempotent";
      const receipt: DeletionReceipt = {
        id: `del-rcpt-${inspectionId}`,
        inspectionId,
        ownerUid: TEST_UID,
        stage: "completed",
        photoIds: ["photo-already-done"],
        deletedPhotoIds: ["photo-already-done"],
        retainedPhotoIds: [],
        photosDeletedCount: 1,
        createdAt: 1000,
        remoteConfirmedAt: 2000,
        completedAt: 3000,
      };
      await saveDeletionReceipt(receipt);

      const result = await executePhotoCleanup(receipt.id, TEST_UID, 4000);
      expect(result.stage).toBe("completed");
      expect(result.deletedPhotosCount).toBe(1);
    });
  });

  // ==========================================================================
  // 4. Startup & Crash Recovery
  // ==========================================================================
  describe("4. Startup Recovery & Interruption Handling", () => {
    it("recovers and completes cleanup when interrupted at 'remote_confirmed_pending_blob_purge'", async () => {
      const inspectionId = "insp-crash-at-stage-3";
      const blob1 = new Blob(["photo-1"], { type: "image/jpeg" });
      const blob2 = new Blob(["photo-2"], { type: "image/jpeg" });

      await saveEvidencePhoto({
        id: "photo-crash-1",
        inspectionId,
        projectId: "proj-1",
        blob: blob1,
        fileName: "crash1.jpg",
        fileSizeBytes: blob1.size,
        mimeType: "image/jpeg",
        capturedAt: 1000,
        createdAt: 1000,
      });

      await saveEvidencePhoto({
        id: "photo-crash-2",
        inspectionId,
        projectId: "proj-1",
        blob: blob2,
        fileName: "crash2.jpg",
        fileSizeBytes: blob2.size,
        mimeType: "image/jpeg",
        capturedAt: 1000,
        createdAt: 1000,
      });

      await saveLocalDraft({
        id: inspectionId,
        ownerUid: TEST_UID,
        projectId: "proj-1",
        title: "Crash Interrupted Draft",
        observation: "Obs",
        category: "installation",
        visibleEvidence: [],
        uncertainties: [],
        inspectorFollowUp: [],
        photoIds: ["photo-crash-1", "photo-crash-2"],
        isSynced: false,
        reviewStatus: "draft_generated",
        reviewHistory: [],
        lastSavedAt: 1000,
        createdAt: 1000,
      });

      // Browser crashed right after remote confirmed!
      const receipt: DeletionReceipt = {
        id: `del-rcpt-${inspectionId}`,
        inspectionId,
        ownerUid: TEST_UID,
        stage: "remote_confirmed_pending_blob_purge",
        photoIds: ["photo-crash-1", "photo-crash-2"],
        deletedPhotoIds: [],
        retainedPhotoIds: [],
        photosDeletedCount: 0,
        createdAt: 1000,
        remoteConfirmedAt: 2000,
      };
      await saveDeletionReceipt(receipt);

      // On startup, recoverPhotoCleanups runs
      const recovery = await recoverPhotoCleanups(TEST_UID, 5000);
      expect(recovery.recoveredCount).toBe(1);
      expect(recovery.failedCount).toBe(0);

      // Both photos deleted
      expect(await getEvidencePhoto("photo-crash-1")).toBeNull();
      expect(await getEvidencePhoto("photo-crash-2")).toBeNull();

      // Draft deleted
      expect(await getLocalDraft(inspectionId)).toBeNull();

      // Receipt finalized as completed
      const updated = await getDeletionReceipt(receipt.id);
      expect(updated?.stage).toBe("completed");
      expect(updated?.photosDeletedCount).toBe(2);
    });

    it("resumes partial cleanup without re-processing already-deleted photos", async () => {
      const inspectionId = "insp-crash-partial";
      const blob2 = new Blob(["photo-2-surviving"], { type: "image/jpeg" });

      // Photo 1 was already deleted before the crash, Photo 2 remains
      await saveEvidencePhoto({
        id: "photo-partial-2",
        inspectionId,
        projectId: "proj-1",
        blob: blob2,
        fileName: "part2.jpg",
        fileSizeBytes: blob2.size,
        mimeType: "image/jpeg",
        capturedAt: 1000,
        createdAt: 1000,
      });

      const receipt: DeletionReceipt = {
        id: `del-rcpt-${inspectionId}`,
        inspectionId,
        ownerUid: TEST_UID,
        stage: "remote_confirmed_pending_blob_purge",
        photoIds: ["photo-partial-1", "photo-partial-2"],
        deletedPhotoIds: ["photo-partial-1"], // Already deleted!
        retainedPhotoIds: [],
        photosDeletedCount: 1,
        createdAt: 1000,
        remoteConfirmedAt: 2000,
      };
      await saveDeletionReceipt(receipt);

      const recovery = await recoverPhotoCleanups(TEST_UID, 6000);
      expect(recovery.recoveredCount).toBe(1);

      // Photo 2 deleted
      expect(await getEvidencePhoto("photo-partial-2")).toBeNull();

      const updated = await getDeletionReceipt(receipt.id);
      expect(updated?.stage).toBe("completed");
      expect(updated?.photosDeletedCount).toBe(2);
      expect(updated?.deletedPhotoIds).toEqual(["photo-partial-1", "photo-partial-2"]);
    });

    it("recovers pending_remote_delete when remote Firestore document is absent", async () => {
      const inspectionId = "insp-remote-already-absent";
      const blob = new Blob(["photo-data"], { type: "image/jpeg" });

      await saveEvidencePhoto({
        id: "photo-absent-1",
        inspectionId,
        projectId: "proj-1",
        blob,
        fileName: "absent.jpg",
        fileSizeBytes: blob.size,
        mimeType: "image/jpeg",
        capturedAt: 1000,
        createdAt: 1000,
      });

      // Remote doc absent in mockRemoteDocStore (e.g. successfully deleted on cloud before crash)
      expect(mockRemoteDocStore.has(`users/${TEST_UID}/inspections/${inspectionId}`)).toBe(false);

      const receipt: DeletionReceipt = {
        id: `del-rcpt-${inspectionId}`,
        inspectionId,
        ownerUid: TEST_UID,
        stage: "pending_remote_delete",
        photoIds: ["photo-absent-1"],
        deletedPhotoIds: [],
        retainedPhotoIds: [],
        photosDeletedCount: 0,
        createdAt: 1000,
      };
      await saveDeletionReceipt(receipt);

      const recovery = await recoverPhotoCleanups(TEST_UID, 7000);
      expect(recovery.recoveredCount).toBe(1);

      expect(await getEvidencePhoto("photo-absent-1")).toBeNull();
      const updated = await getDeletionReceipt(receipt.id);
      expect(updated?.stage).toBe("completed");
    });

    it("tenant isolation: never recovers receipts belonging to another authenticated user", async () => {
      const foreignUid = "user-other-contractor";
      const inspectionId = "insp-foreign-cleanup";

      const receipt: DeletionReceipt = {
        id: `del-rcpt-${inspectionId}`,
        inspectionId,
        ownerUid: foreignUid,
        stage: "remote_confirmed_pending_blob_purge",
        photoIds: ["photo-foreign-1"],
        deletedPhotoIds: [],
        retainedPhotoIds: [],
        photosDeletedCount: 0,
        createdAt: 1000,
        remoteConfirmedAt: 2000,
      };
      await saveDeletionReceipt(receipt);

      // Active user is TEST_UID
      const recovery = await recoverPhotoCleanups(TEST_UID);
      expect(recovery.inspectedReceiptsCount).toBe(0);
      expect(recovery.recoveredCount).toBe(0);

      // Foreign receipt untouched
      const untouched = await getDeletionReceipt(receipt.id);
      expect(untouched?.stage).toBe("remote_confirmed_pending_blob_purge");
    });

    it("halts safely on account switch during cleanup", async () => {
      const inspectionId = "insp-switch-account";
      const blob = new Blob(["switch-photo"], { type: "image/jpeg" });

      await saveEvidencePhoto({
        id: "photo-switch-1",
        inspectionId,
        projectId: "proj-1",
        blob,
        fileName: "switch.jpg",
        fileSizeBytes: blob.size,
        mimeType: "image/jpeg",
        capturedAt: 1000,
        createdAt: 1000,
      });

      const receipt: DeletionReceipt = {
        id: `del-rcpt-${inspectionId}`,
        inspectionId,
        ownerUid: TEST_UID,
        stage: "remote_confirmed_pending_blob_purge",
        photoIds: ["photo-switch-1"],
        deletedPhotoIds: [],
        retainedPhotoIds: [],
        photosDeletedCount: 0,
        createdAt: 1000,
        remoteConfirmedAt: 2000,
      };
      await saveDeletionReceipt(receipt);

      // Switch auth user before execution
      (auth as { currentUser: { uid: string; email?: string } | null }).currentUser = {
        uid: "user-switched-midway",
      };

      await expect(executePhotoCleanup(receipt.id, TEST_UID)).rejects.toThrow(
        "Authenticated user mismatch"
      );

      // Photo Blob remains preserved!
      const photo = await getEvidencePhoto("photo-switch-1");
      expect(photo).not.toBeNull();
    });
  });

  // ==========================================================================
  // 5. Complete 4-Stage Permanent Deletion Integration
  // ==========================================================================
  describe("5. End-to-End Permanent Deletion Integration", () => {
    it("executes complete 4-stage lifecycle via initiateInspectionDeletion & mutation replay", async () => {
      const inspectionId = "insp-e2e-4stage";

      // 1. Remote document exists in Firestore as an eligible unreviewed draft
      mockRemoteDocStore.set(`users/${TEST_UID}/inspections/${inspectionId}`, {
        id: inspectionId,
        ownerUid: TEST_UID,
        projectId: "proj-1",
        projectName: "Metro Center",
        title: "Eligible Draft for Deletion",
        observation: "Observation text",
        category: "installation",
        reviewStatus: "draft_generated",
        reviewHistory: [],
        isArchived: false,
        revision: 1,
        createdAt: 1000,
        updatedAt: 1000,
      });

      // 2. Local photo Blob in IndexedDB evidencePhotos
      const blob = new Blob(["e2e-binary-evidence"], { type: "image/jpeg" });
      await saveEvidencePhoto({
        id: "photo-e2e-1",
        inspectionId,
        projectId: "proj-1",
        blob,
        fileName: "e2e_photo.jpg",
        fileSizeBytes: blob.size,
        mimeType: "image/jpeg",
        capturedAt: 1000,
        createdAt: 1000,
      });

      // 3. Local draft in IndexedDB localInspections
      const draft: LocalDraftInspection = {
        id: inspectionId,
        ownerUid: TEST_UID,
        projectId: "proj-1",
        title: "Eligible Draft for Deletion",
        observation: "Observation text",
        category: "installation",
        visibleEvidence: [],
        uncertainties: [],
        inspectorFollowUp: [],
        photoIds: ["photo-e2e-1"],
        isSynced: true,
        reviewStatus: "draft_generated",
        reviewHistory: [],
        lastSavedAt: 1000,
        createdAt: 1000,
      };
      await saveLocalDraft(draft);

      // Stage 1: Initiate deletion request
      const { receipt, mutationId } = await initiateInspectionDeletion(TEST_UID, draft, 2000);
      expect(receipt.stage).toBe("pending_remote_delete");

      // Verify Blobs preserved at Stage 1
      expect(await getEvidencePhoto("photo-e2e-1")).not.toBeNull();

      // Stage 2 & 3 & 4: Trigger replay processor
      const replayResult = await replayQueuedMutations({
        lockCoordinator: createMockLockCoordinator(),
        now: 3000,
      });

      expect(replayResult.status).toBe("SUCCESS");
      expect(replayResult.succeededCount).toBe(1);

      // Verify Stage 2: Remote Firestore document is permanently deleted
      expect(mockRemoteDocStore.has(`users/${TEST_UID}/inspections/${inspectionId}`)).toBe(false);

      // Verify Stage 4: Local photographic evidence Blob is securely purged
      expect(await getEvidencePhoto("photo-e2e-1")).toBeNull();

      // Verify Stage 4: Local draft is deleted
      expect(await getLocalDraft(inspectionId)).toBeNull();

      // Verify Stage 4: Deletion receipt is finalized as completed
      const finalReceipt = await getDeletionReceipt(receipt.id);
      expect(finalReceipt?.stage).toBe("completed");
      expect(finalReceipt?.photosDeletedCount).toBe(1);
      expect(finalReceipt?.deletedPhotoIds).toContain("photo-e2e-1");
      expect(finalReceipt?.completedAt).toBe(3000);

      // Verify mutation in queue is succeeded
      const mutation = await getMutationById(TEST_UID, mutationId);
      expect(mutation?.status).toBe("succeeded");
    });

    it("rejects permanent deletion with CONFLICT if inspection was reviewed in Firestore and preserves Blobs", async () => {
      const inspectionId = "insp-conflict-audited";

      // Remote document was approved!
      mockRemoteDocStore.set(`users/${TEST_UID}/inspections/${inspectionId}`, {
        id: inspectionId,
        ownerUid: TEST_UID,
        projectId: "proj-1",
        projectName: "Metro Center",
        title: "Audited Inspection",
        observation: "Obs",
        category: "installation",
        reviewStatus: "approved", // Ineligible!
        reviewHistory: [
          {
            id: "rev-1",
            fromStatus: "draft_generated",
            toStatus: "approved",
            byUid: TEST_UID,
            timestamp: 1000,
          },
        ],
        isArchived: false,
        revision: 2,
        createdAt: 1000,
        updatedAt: 1000,
      });

      const blob = new Blob(["audited-photo"], { type: "image/jpeg" });
      await saveEvidencePhoto({
        id: "photo-audited-preserve",
        inspectionId,
        projectId: "proj-1",
        blob,
        fileName: "audited.jpg",
        fileSizeBytes: blob.size,
        mimeType: "image/jpeg",
        capturedAt: 1000,
        createdAt: 1000,
      });

      // Receipt manually created in pending_remote_delete to test remote transaction conflict
      const receipt: DeletionReceipt = {
        id: `del-rcpt-${inspectionId}`,
        inspectionId,
        ownerUid: TEST_UID,
        stage: "pending_remote_delete",
        photoIds: ["photo-audited-preserve"],
        deletedPhotoIds: [],
        retainedPhotoIds: [],
        photosDeletedCount: 0,
        createdAt: 1000,
      };
      await saveDeletionReceipt(receipt);

      const draft: LocalDraftInspection = {
        id: inspectionId,
        ownerUid: TEST_UID,
        projectId: "proj-1",
        title: "Audited Inspection",
        observation: "Obs",
        category: "installation",
        visibleEvidence: [],
        uncertainties: [],
        inspectorFollowUp: [],
        photoIds: ["photo-audited-preserve"],
        isSynced: true,
        reviewStatus: "approved",
        reviewHistory: [],
        lastSavedAt: 1000,
        createdAt: 1000,
      };
      await saveLocalDraft(draft);

      await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: inspectionId,
        type: "DELETE_INSPECTION",
        payload: {
          type: "DELETE_INSPECTION",
          cleanupReceiptId: receipt.id,
        },
        baseRevision: 2,
        now: 1000,
      });

      const replayResult = await replayQueuedMutations({
        lockCoordinator: createMockLockCoordinator(),
        now: 3000,
      });
      expect(replayResult.conflictCount).toBe(1);

      // Replay completed with conflict
      // Remote doc NOT deleted
      expect(mockRemoteDocStore.has(`users/${TEST_UID}/inspections/${inspectionId}`)).toBe(true);

      // INVARIANT CHECK: Photo Blobs in IndexedDB are NEVER deleted!
      const photo = await getEvidencePhoto("photo-audited-preserve");
      expect(photo).not.toBeNull();
      expect(photo?.id).toBe("photo-audited-preserve");

      // Receipt marked as failed
      const updatedReceipt = await getDeletionReceipt(receipt.id);
      expect(updatedReceipt?.stage).toBe("failed");
      expect(updatedReceipt?.error).toContain("Cannot delete inspection");
    });
  });
});
