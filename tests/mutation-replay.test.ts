/**
 * ForeSite Phase 5 Stage 3A Test Suite (Targeted Corrections)
 * Replay Infrastructure and CREATE_INSPECTION Pilot
 *
 * Verifies:
 * 1. Authenticated Queue Ownership (auth.currentUser derivation, tenant isolation, signout, account switch)
 * 2. Multi-Tab Coordination (Web Locks acquisition, contention handling, release, fail-closed fallback)
 * 3. Firestore Transaction & Idempotency (atomic read-before-create, clientCreationNonce, overwrite protection)
 * 4. Concurrent Creation Safety (same nonce idempotent success, different nonce conflict, no overwrites)
 * 5. Local Synchronization State & Crash Recovery (isSynced: false default, recoverUnenqueuedDrafts, no duplicate queueing)
 * 6. Error Classification (permanent code with "network" in message remains permanent, transient codes, safe fallback)
 * 7. Invariants & Regression Safeguards (5 attempts max, review lifecycle intact, zero photo Blobs to Firestore)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  replayQueuedMutations,
  classifyFirestoreError,
  defaultWebLocksCoordinator,
  getInspectionSyncStatus,
  recoverUnenqueuedDrafts,
} from "../src/services/mutationReplay";
import {
  enqueueMutation,
  getAllMutationsByOwner,
  getMutationById,
  cancelMutation,
  transitionMutationStatus,
  recordMutationAttempt,
} from "../src/services/mutationQueue";
import {
  clearAllMutationQueueData,
  clearAllLocalEvidence,
  saveLocalDraft,
  getLocalDraft,
  closeDatabase,
  saveEvidencePhoto,
  getEvidencePhotosByInspection,
} from "../src/services/indexeddb";
import { auth } from "../src/lib/firebase";
import * as firestoreService from "../src/services/firestore";
import {
  LockCoordinator,
  ReviewStatus,
  Inspection,
} from "../src/types";

// In-memory Firestore document store for transactional verification
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

describe("ForeSite Phase 5 Stage 3A: Mutation Replay Infrastructure & Pilot", () => {
  const TEST_UID = "inspector-stage3a-uid";
  const TEST_OTHER_UID = "inspector-other-user";

  beforeEach(async () => {
    vi.restoreAllMocks();
    mockRemoteDocStore.clear();
    await clearAllLocalEvidence();
    await clearAllMutationQueueData();
    // Default authenticated user
    (auth as { currentUser: { uid: string; email?: string } | null }).currentUser = {
      uid: TEST_UID,
      email: "inspector@foresite.test",
    };
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    mockRemoteDocStore.clear();
    await clearAllLocalEvidence();
    await clearAllMutationQueueData();
    await closeDatabase();
    (auth as { currentUser: { uid: string; email?: string } | null }).currentUser = null;
  });

  // Mock LockCoordinator helper for deterministic testing
  const createMockLockCoordinator = (acquired: boolean = true): LockCoordinator => ({
    async requestLock<T>(_name: string, callback: () => Promise<T>) {
      if (!acquired) {
        return {
          acquired: false,
          reason: "Lock contention: another tab is active",
        };
      }
      const result = await callback();
      return { acquired: true, result };
    },
  });

  // ==========================================================================
  // 1. Authenticated Queue Ownership
  // ==========================================================================
  describe("1. Authenticated Queue Ownership & Boundaries", () => {
    it("rejects replay execution if user is unauthenticated", async () => {
      (auth as { currentUser: unknown }).currentUser = null;

      const result = await replayQueuedMutations();
      expect(result.status).toBe("UNAUTHENTICATED");
      expect(result.processedCount).toBe(0);
      expect(result.message).toContain("No authenticated user");
    });

    it("processes only mutations matching the authenticated UID, never another user's", async () => {
      // Enqueue mutation for TEST_UID
      const myMut = await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: "insp-user-mine",
        type: "CREATE_INSPECTION",
        payload: {
          type: "CREATE_INSPECTION",
          inspection: {
            projectId: "proj-1",
            projectName: "Project 1",
            title: "My Observation",
            observation: "Observation notes",
            category: "surface_condition",
            visibleEvidence: [],
            uncertainties: [],
            inspectorFollowUp: [],
            reviewStatus: "draft_generated",
            aiAssisted: false,
            createdAt: 1000,
            updatedAt: 1000,
          },
        },
      });

      // Enqueue mutation for TEST_OTHER_UID
      const otherMut = await enqueueMutation({
        ownerUid: TEST_OTHER_UID,
        targetInspectionId: "insp-user-other",
        type: "CREATE_INSPECTION",
        payload: {
          type: "CREATE_INSPECTION",
          inspection: {
            projectId: "proj-2",
            projectName: "Project 2",
            title: "Other Observation",
            observation: "Other notes",
            category: "installation",
            visibleEvidence: [],
            uncertainties: [],
            inspectorFollowUp: [],
            reviewStatus: "draft_generated",
            aiAssisted: false,
            createdAt: 1000,
            updatedAt: 1000,
          },
        },
      });

      const result = await replayQueuedMutations({
        lockCoordinator: createMockLockCoordinator(true),
      });

      expect(result.status).toBe("SUCCESS");
      expect(result.processedCount).toBe(1);
      expect(result.succeededCount).toBe(1);

      // Verify that otherMut is untouched in TEST_OTHER_UID's partition
      const otherRecord = await getMutationById(TEST_OTHER_UID, otherMut.id);
      expect(otherRecord?.status).toBe("queued");
      expect(otherRecord?.retryCount).toBe(0);

      // Verify myMut is succeeded
      const myRecord = await getMutationById(TEST_UID, myMut.id);
      expect(myRecord?.status).toBe("succeeded");

      // Verify remote document has durable creation identity
      const remoteDoc = mockRemoteDocStore.get(`users/${TEST_UID}/inspections/insp-user-mine`);
      expect(remoteDoc).toBeDefined();
      expect(remoteDoc?.clientCreationNonce).toBe(myMut.id);
    });

    it("immediately halts and reports UNAUTHENTICATED if user signs out during replay", async () => {
      await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: "insp-signout-1",
        type: "CREATE_INSPECTION",
        payload: {
          type: "CREATE_INSPECTION",
          inspection: {
            projectId: "proj-1",
            projectName: "Project 1",
            title: "Insp 1",
            observation: "Obs 1",
            category: "surface_condition",
            visibleEvidence: [],
            uncertainties: [],
            inspectorFollowUp: [],
            reviewStatus: "draft_generated",
            aiAssisted: false,
            createdAt: 1000,
            updatedAt: 1000,
          },
        },
      });

      await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: "insp-signout-2",
        type: "CREATE_INSPECTION",
        payload: {
          type: "CREATE_INSPECTION",
          inspection: {
            projectId: "proj-1",
            projectName: "Project 1",
            title: "Insp 2",
            observation: "Obs 2",
            category: "surface_condition",
            visibleEvidence: [],
            uncertainties: [],
            inspectorFollowUp: [],
            reviewStatus: "draft_generated",
            aiAssisted: false,
            createdAt: 1000,
            updatedAt: 1000,
          },
        },
      });

      // Spy on createInspectionTransaction to simulate signout during execution
      vi.spyOn(firestoreService, "createInspectionTransaction").mockImplementation(async () => {
        (auth as { currentUser: unknown }).currentUser = null;
        return { status: "CREATED" };
      });

      const result = await replayQueuedMutations({
        lockCoordinator: createMockLockCoordinator(true),
      });

      expect(result.status).toBe("UNAUTHENTICATED");
      // Second mutation was never processed
      const allMuts = await getAllMutationsByOwner(TEST_UID);
      const mut2 = allMuts.find((m) => m.targetInspectionId === "insp-signout-2");
      expect(mut2?.status).toBe("queued");
    });

    it("immediately halts and reports USER_SWITCHED if user switches account during replay", async () => {
      await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: "insp-switch-1",
        type: "CREATE_INSPECTION",
        payload: {
          type: "CREATE_INSPECTION",
          inspection: {
            projectId: "proj-1",
            projectName: "Project 1",
            title: "Insp 1",
            observation: "Obs 1",
            category: "surface_condition",
            visibleEvidence: [],
            uncertainties: [],
            inspectorFollowUp: [],
            reviewStatus: "draft_generated",
            aiAssisted: false,
            createdAt: 1000,
            updatedAt: 1000,
          },
        },
      });

      // Trigger user switch during transaction execution
      vi.spyOn(firestoreService, "createInspectionTransaction").mockImplementation(async () => {
        (auth as { currentUser: { uid: string } }).currentUser = { uid: TEST_OTHER_UID };
        return { status: "CREATED" };
      });

      const result = await replayQueuedMutations({
        lockCoordinator: createMockLockCoordinator(true),
      });

      expect(result.status).toBe("USER_SWITCHED");
      expect(result.message).toContain("Authentication state changed");
    });
  });

  // ==========================================================================
  // 2. Multi-Tab Coordination
  // ==========================================================================
  describe("2. Multi-Tab Coordination & Safe Fail-Closed", () => {
    it("returns LOCKED_BY_ANOTHER_TAB and processes 0 mutations when lock contention occurs", async () => {
      await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: "insp-lock-contention",
        type: "CREATE_INSPECTION",
        payload: {
          type: "CREATE_INSPECTION",
          inspection: {
            projectId: "proj-1",
            projectName: "Project 1",
            title: "Lock Contention Inspection",
            observation: "Obs",
            category: "surface_condition",
            visibleEvidence: [],
            uncertainties: [],
            inspectorFollowUp: [],
            reviewStatus: "draft_generated",
            aiAssisted: false,
            createdAt: 1000,
            updatedAt: 1000,
          },
        },
      });

      const result = await replayQueuedMutations({
        lockCoordinator: createMockLockCoordinator(false), // lock not acquired
      });

      expect(result.status).toBe("LOCKED_BY_ANOTHER_TAB");
      expect(result.processedCount).toBe(0);
      expect(result.succeededCount).toBe(0);

      // Mutation remains queued
      const muts = await getAllMutationsByOwner(TEST_UID);
      expect(muts[0]?.status).toBe("queued");
    });

    it("defaultWebLocksCoordinator fails closed when Web Locks API is unavailable", async () => {
      const outcome = await defaultWebLocksCoordinator.requestLock("test_lock", async () => {
        return "success";
      });

      expect(outcome.acquired).toBe(false);
      expect(outcome.unsupported).toBe(true);
      expect(outcome.reason).toContain("Web Locks API is unavailable");

      const replayResult = await replayQueuedMutations({
        lockCoordinator: defaultWebLocksCoordinator,
      });

      expect(replayResult.status).toBe("WEB_LOCKS_UNAVAILABLE");
      expect(replayResult.processedCount).toBe(0);
    });

    it("releases lock properly after successful execution or when an error is thrown", async () => {
      let lockHeld = false;
      const trackingCoordinator: LockCoordinator = {
        async requestLock<T>(_name: string, callback: () => Promise<T>) {
          if (lockHeld) {
            return { acquired: false, reason: "Lock already held" };
          }
          lockHeld = true;
          try {
            const res = await callback();
            return { acquired: true, result: res };
          } finally {
            lockHeld = false;
          }
        },
      };

      await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: "insp-lock-release",
        type: "CREATE_INSPECTION",
        payload: {
          type: "CREATE_INSPECTION",
          inspection: {
            projectId: "proj-1",
            projectName: "Project 1",
            title: "Lock Release Inspection",
            observation: "Obs",
            category: "surface_condition",
            visibleEvidence: [],
            uncertainties: [],
            inspectorFollowUp: [],
            reviewStatus: "draft_generated",
            aiAssisted: false,
            createdAt: 1000,
            updatedAt: 1000,
          },
        },
      });

      const res = await replayQueuedMutations({ lockCoordinator: trackingCoordinator });
      expect(res.status).toBe("SUCCESS");
      expect(lockHeld).toBe(false); // Lock was cleanly released
    });
  });

  // ==========================================================================
  // 3. Firestore Transaction & Idempotency Pilot
  // ==========================================================================
  describe("3. Firestore Transaction & Idempotency Pilot", () => {
    it("missing remote document is created atomically with canonical ID and clientCreationNonce", async () => {
      const canonicalId = `insp-${Date.now()}-client-canonical`;

      const mut = await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: canonicalId,
        type: "CREATE_INSPECTION",
        payload: {
          type: "CREATE_INSPECTION",
          inspection: {
            id: canonicalId,
            projectId: "proj-metro-1",
            projectName: "Metro Tunnel",
            title: "Grout Voiding",
            observation: "Observation detail",
            category: "surface_condition",
            visibleEvidence: ["Spalling"],
            uncertainties: [],
            inspectorFollowUp: [],
            reviewStatus: "draft_generated",
            aiAssisted: false,
            createdAt: 2000,
            updatedAt: 2000,
          },
        },
      });

      const result = await replayQueuedMutations({
        lockCoordinator: createMockLockCoordinator(true),
      });

      expect(result.status).toBe("SUCCESS");
      expect(result.succeededCount).toBe(1);

      // Remote doc verified in transactional store
      const remoteDoc = mockRemoteDocStore.get(`users/${TEST_UID}/inspections/${canonicalId}`);
      expect(remoteDoc).toBeDefined();
      expect(remoteDoc?.id).toBe(canonicalId);
      expect(remoteDoc?.ownerUid).toBe(TEST_UID);
      expect(remoteDoc?.clientCreationNonce).toBe(mut.id); // Durable creation identity confirmed
    });

    it("crash recovery: replaying same mutation identity returns idempotent success without modifying document", async () => {
      const canonicalId = "insp-crashed-prior-write";

      // 1. Enqueue mutation
      const mut = await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: canonicalId,
        type: "CREATE_INSPECTION",
        payload: {
          type: "CREATE_INSPECTION",
          inspection: {
            id: canonicalId,
            projectId: "proj-1",
            projectName: "Project 1",
            title: "Attempted Update Title", // Divergent local payload
            observation: "Obs",
            category: "surface_condition",
            visibleEvidence: [],
            uncertainties: [],
            inspectorFollowUp: [],
            reviewStatus: "draft_generated",
            aiAssisted: false,
            createdAt: 1000,
            updatedAt: 1000,
          },
        },
      });

      // 2. Pre-seed remote store with existing document written in prior attempt with matching mut.id
      mockRemoteDocStore.set(`users/${TEST_UID}/inspections/${canonicalId}`, {
        id: canonicalId,
        ownerUid: TEST_UID,
        clientCreationNonce: mut.id, // Matches queued mutation ID
        projectId: "proj-1",
        projectName: "Project 1",
        title: "Original Committed Title",
        observation: "Original Obs",
        category: "surface_condition",
        visibleEvidence: [],
        uncertainties: [],
        inspectorFollowUp: [],
        reviewStatus: "draft_generated",
        aiAssisted: false,
        createdAt: 1000,
        updatedAt: 1000,
      });

      // Save local draft as unsynced
      await saveLocalDraft({
        id: canonicalId,
        projectId: "proj-1",
        title: "Original Committed Title",
        observation: "Original Obs",
        category: "surface_condition",
        visibleEvidence: [],
        uncertainties: [],
        inspectorFollowUp: [],
        photoIds: [],
        isSynced: false,
        createdAt: 1000,
        lastSavedAt: 1000,
      });

      const result = await replayQueuedMutations({
        lockCoordinator: createMockLockCoordinator(true),
      });

      expect(result.status).toBe("SUCCESS");
      expect(result.succeededCount).toBe(1);

      // Verify remote document was NOT overwritten or modified
      const remoteDoc = mockRemoteDocStore.get(`users/${TEST_UID}/inspections/${canonicalId}`);
      expect(remoteDoc?.title).toBe("Original Committed Title"); // Preserved!

      // Verify local draft is updated to isSynced: true upon confirmed acknowledgement
      const updatedDraft = await getLocalDraft(canonicalId);
      expect(updatedDraft?.isSynced).toBe(true);
    });

    it("returns CONFLICT and does not overwrite if remote document exists with different creation identity", async () => {
      const canonicalId = "insp-collision-doc";

      // Pre-seed remote store with document from another client/action
      mockRemoteDocStore.set(`users/${TEST_UID}/inspections/${canonicalId}`, {
        id: canonicalId,
        ownerUid: TEST_UID,
        clientCreationNonce: "mut-different-foreign-nonce-999", // Different nonce!
        title: "Client A Inspection",
      });

      const mut = await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: canonicalId,
        type: "CREATE_INSPECTION",
        payload: {
          type: "CREATE_INSPECTION",
          inspection: {
            projectId: "proj-1",
            projectName: "Project 1",
            title: "Client B Inspection",
            observation: "Obs",
            category: "surface_condition",
            visibleEvidence: [],
            uncertainties: [],
            inspectorFollowUp: [],
            reviewStatus: "draft_generated",
            aiAssisted: false,
            createdAt: 1000,
            updatedAt: 1000,
          },
        },
      });

      const result = await replayQueuedMutations({
        lockCoordinator: createMockLockCoordinator(true),
      });

      expect(result.status).toBe("ERROR");
      expect(result.conflictCount).toBe(1);

      // Remote doc was NOT overwritten
      const remoteDoc = mockRemoteDocStore.get(`users/${TEST_UID}/inspections/${canonicalId}`);
      expect(remoteDoc?.title).toBe("Client A Inspection");

      // Mutation is transitioned to conflict
      const updatedMut = await getMutationById(TEST_UID, mut.id);
      expect(updatedMut?.status).toBe("conflict");
      expect(updatedMut?.conflictReason).toContain("differing creation identity");
    });

    it("returns CONFLICT if remote document exists without a creation nonce", async () => {
      const canonicalId = "insp-no-nonce-doc";

      mockRemoteDocStore.set(`users/${TEST_UID}/inspections/${canonicalId}`, {
        id: canonicalId,
        ownerUid: TEST_UID,
        title: "Legacy Remote Doc Without Nonce",
      });

      const mut = await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: canonicalId,
        type: "CREATE_INSPECTION",
        payload: {
          type: "CREATE_INSPECTION",
          inspection: {
            projectId: "proj-1",
            projectName: "Project 1",
            title: "New Replay Attempt",
            observation: "Obs",
            category: "surface_condition",
            visibleEvidence: [],
            uncertainties: [],
            inspectorFollowUp: [],
            reviewStatus: "draft_generated",
            aiAssisted: false,
            createdAt: 1000,
            updatedAt: 1000,
          },
        },
      });

      const result = await replayQueuedMutations({
        lockCoordinator: createMockLockCoordinator(true),
      });

      expect(result.status).toBe("ERROR");
      expect(result.conflictCount).toBe(1);

      const updatedMut = await getMutationById(TEST_UID, mut.id);
      expect(updatedMut?.status).toBe("conflict");
      expect(updatedMut?.conflictReason).toContain("without matching creation nonce");
    });
  });

  // ==========================================================================
  // 4. Concurrent Creation Safety Simulations
  // ==========================================================================
  describe("4. Concurrent Creation Safety Simulations", () => {
    it("concurrent attempts with same nonce both resolve without document corruption or duplicate records", async () => {
      const canonicalId = "insp-concurrent-same-nonce";
      const nonce = "mut-shared-nonce-001";

      const inspectionData = {
        id: canonicalId,
        projectId: "proj-1",
        projectName: "Project 1",
        title: "Concurrent Same Nonce",
        observation: "Obs",
        category: "surface_condition" as const,
        visibleEvidence: [],
        uncertainties: [],
        inspectorFollowUp: [],
        reviewStatus: "draft_generated" as const,
        aiAssisted: false,
      };

      // Client A transaction
      const resA = await firestoreService.createInspectionTransaction(TEST_UID, inspectionData, nonce);
      expect(resA.status).toBe("CREATED");

      // Client B transaction concurrently targeting same document with same nonce
      const resB = await firestoreService.createInspectionTransaction(TEST_UID, inspectionData, nonce);
      expect(resB.status).toBe("ALREADY_EXISTS_SAME_MUTATION");

      // Remote store has exactly 1 document with the nonce
      const doc = mockRemoteDocStore.get(`users/${TEST_UID}/inspections/${canonicalId}`);
      expect(doc).toBeDefined();
      expect(doc?.clientCreationNonce).toBe(nonce);
    });

    it("concurrent attempts with different nonces prevent second client from overwriting first client's document", async () => {
      const canonicalId = "insp-concurrent-diff-nonce";
      const nonceA = "nonce-client-A";
      const nonceB = "nonce-client-B";

      const dataA = {
        id: canonicalId,
        projectId: "proj-1",
        projectName: "Project 1",
        title: "Client A Created This First",
        observation: "Obs A",
        category: "surface_condition" as const,
        visibleEvidence: [],
        uncertainties: [],
        inspectorFollowUp: [],
        reviewStatus: "draft_generated" as const,
        aiAssisted: false,
      };

      const dataB = {
        id: canonicalId,
        projectId: "proj-2",
        projectName: "Project 2",
        title: "Client B Attempted Overwrite",
        observation: "Obs B",
        category: "installation" as const,
        visibleEvidence: [],
        uncertainties: [],
        inspectorFollowUp: [],
        reviewStatus: "draft_generated" as const,
        aiAssisted: false,
      };

      const resA = await firestoreService.createInspectionTransaction(TEST_UID, dataA, nonceA);
      expect(resA.status).toBe("CREATED");

      const resB = await firestoreService.createInspectionTransaction(TEST_UID, dataB, nonceB);
      expect(resB.status).toBe("CONFLICT");

      // Verify Client A's document was strictly preserved and NEVER overwritten
      const doc = mockRemoteDocStore.get(`users/${TEST_UID}/inspections/${canonicalId}`);
      expect(doc?.title).toBe("Client A Created This First");
      expect(doc?.clientCreationNonce).toBe(nonceA);
    });
  });

  // ==========================================================================
  // 5. Local Synchronization State & Crash-Window Recovery
  // ==========================================================================
  describe("5. Local Synchronization State & Crash-Window Recovery", () => {
    it("new local drafts start strictly with isSynced: false and missing queue record returns local_only", async () => {
      const draftId = "draft-unsynced-local";

      await saveLocalDraft({
        id: draftId,
        projectId: "proj-1",
        title: "Unsynced Local Draft",
        observation: "Obs",
        category: "surface_condition",
        visibleEvidence: [],
        uncertainties: [],
        inspectorFollowUp: [],
        photoIds: [],
        isSynced: false,
        createdAt: 1000,
        lastSavedAt: 1000,
      });

      // No queue records exist
      const status = await getInspectionSyncStatus(TEST_UID, draftId);
      expect(status.state).toBe("local_only");
      expect(status.label).toBe("Local Only");
      expect(status.state).not.toBe("synced");
    });

    it("missing queue record NEVER produces a Synced badge even if isSynced flag was corrupted in storage", async () => {
      const corruptedId = "draft-corrupted-flag";

      await saveLocalDraft({
        id: corruptedId,
        projectId: "proj-1",
        title: "Corrupted Draft",
        observation: "Obs",
        category: "surface_condition",
        visibleEvidence: [],
        uncertainties: [],
        inspectorFollowUp: [],
        photoIds: [],
        isSynced: true, // corrupted storage flag without queue record
        createdAt: 1000,
        lastSavedAt: 1000,
      });

      // Invariant: Missing queue record must NEVER be interpreted as proof that inspection is synchronized
      const status = await getInspectionSyncStatus(TEST_UID, corruptedId);
      expect(status.state).toBe("local_only");
      expect(status.label).toBe("Local Only");
    });

    it("recoverUnenqueuedDrafts safely recovers orphan drafts into the mutation queue using canonical ID", async () => {
      const orphanId = "draft-orphan-crashed-interval";

      await saveLocalDraft({
        id: orphanId,
        ownerUid: TEST_UID,
        projectId: "proj-1",
        title: "Orphan Draft During Crash Window",
        observation: "Obs",
        category: "surface_condition",
        visibleEvidence: [],
        uncertainties: [],
        inspectorFollowUp: [],
        photoIds: [],
        isSynced: false,
        createdAt: 1000,
        lastSavedAt: 1000,
      });

      // Initial check: No mutations
      let muts = await getAllMutationsByOwner(TEST_UID);
      expect(muts).toHaveLength(0);

      // Run recovery
      const recoveredCount = await recoverUnenqueuedDrafts(TEST_UID, 2000);
      expect(recoveredCount).toBe(1);

      // Mutation is enqueued with canonical ID
      muts = await getAllMutationsByOwner(TEST_UID);
      expect(muts).toHaveLength(1);
      expect(muts[0]!.targetInspectionId).toBe(orphanId);
      expect(muts[0]!.type).toBe("CREATE_INSPECTION");
      expect(muts[0]!.status).toBe("queued");
    });

    it("recoverUnenqueuedDrafts prevents duplicate queue insertions on repeated runs", async () => {
      const orphanId = "draft-prevent-dup";

      await saveLocalDraft({
        id: orphanId,
        ownerUid: TEST_UID,
        projectId: "proj-1",
        title: "Prevent Duplicate Draft",
        observation: "Obs",
        category: "surface_condition",
        visibleEvidence: [],
        uncertainties: [],
        inspectorFollowUp: [],
        photoIds: [],
        isSynced: false,
        createdAt: 1000,
        lastSavedAt: 1000,
      });

      // Run 1: Recovers 1
      const count1 = await recoverUnenqueuedDrafts(TEST_UID, 2000);
      expect(count1).toBe(1);

      // Run 2: Does NOT re-enqueue duplicate!
      const count2 = await recoverUnenqueuedDrafts(TEST_UID, 3000);
      expect(count2).toBe(0);

      const allMuts = await getAllMutationsByOwner(TEST_UID);
      expect(allMuts).toHaveLength(1);
    });

    // ========================================================================
    // Account Isolation & Multi-User Partitioning Tests
    // ========================================================================
    it("account isolation: User B's recovery process never adopts or enqueues User A's drafts", async () => {
      const userADraftId = "draft-user-a-isolated";

      // 1. User A creates a local draft
      await saveLocalDraft({
        id: userADraftId,
        ownerUid: TEST_UID,
        projectId: "proj-1",
        title: "User A Draft",
        observation: "User A observation",
        category: "surface_condition",
        visibleEvidence: [],
        uncertainties: [],
        inspectorFollowUp: [],
        photoIds: [],
        isSynced: false,
        createdAt: 1000,
        lastSavedAt: 1000,
      });

      // User A also has an enqueued mutation
      await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: userADraftId,
        type: "CREATE_INSPECTION",
        payload: {
          type: "CREATE_INSPECTION",
          inspection: {
            id: userADraftId,
            ownerUid: TEST_UID,
            projectId: "proj-1",
            projectName: "Project 1",
            title: "User A Draft",
            observation: "Obs",
            category: "surface_condition",
            visibleEvidence: [],
            uncertainties: [],
            inspectorFollowUp: [],
            reviewStatus: "draft_generated",
            aiAssisted: false,
            createdAt: 1000,
            updatedAt: 1000,
          },
        },
      });

      // 2. User A signs out, and User B signs in
      (auth as { currentUser: { uid: string } | null }).currentUser = { uid: TEST_OTHER_UID };

      // User B runs recovery
      const recoveredByB = await recoverUnenqueuedDrafts(TEST_OTHER_UID, 2000);
      expect(recoveredByB).toBe(0);

      // User B's queue must remain completely empty!
      const userBMuts = await getAllMutationsByOwner(TEST_OTHER_UID);
      expect(userBMuts).toHaveLength(0);

      // 3. User B signs out, User A signs back in
      (auth as { currentUser: { uid: string } | null }).currentUser = { uid: TEST_UID };

      // User A's mutation is intact
      const userAMuts = await getAllMutationsByOwner(TEST_UID);
      expect(userAMuts).toHaveLength(1);
      expect(userAMuts[0]?.targetInspectionId).toBe(userADraftId);
    });

    it("legacy unowned drafts (ownerUid: undefined) are preserved locally and NEVER recovered or adopted by any user", async () => {
      const legacyDraftId = "draft-legacy-unowned-123";

      // Save a legacy draft without ownerUid
      await saveLocalDraft({
        id: legacyDraftId,
        // ownerUid is undefined (legacy draft)
        projectId: "proj-1",
        title: "Legacy Pre-Migration Draft",
        observation: "Legacy notes",
        category: "surface_condition",
        visibleEvidence: [],
        uncertainties: [],
        inspectorFollowUp: [],
        photoIds: [],
        isSynced: false,
        createdAt: 1000,
        lastSavedAt: 1000,
      });

      // Authenticated User A runs recovery
      const recoveredA = await recoverUnenqueuedDrafts(TEST_UID, 2000);
      expect(recoveredA).toBe(0);

      // User A queue remains empty
      const mutsA = await getAllMutationsByOwner(TEST_UID);
      expect(mutsA).toHaveLength(0);

      // User B runs recovery
      (auth as { currentUser: { uid: string } | null }).currentUser = { uid: TEST_OTHER_UID };
      const recoveredB = await recoverUnenqueuedDrafts(TEST_OTHER_UID, 2000);
      expect(recoveredB).toBe(0);

      const mutsB = await getAllMutationsByOwner(TEST_OTHER_UID);
      expect(mutsB).toHaveLength(0);

      // Legacy draft remains intact in IndexedDB
      const storedDraft = await getLocalDraft(legacyDraftId);
      expect(storedDraft).toBeDefined();
      expect(storedDraft?.title).toBe("Legacy Pre-Migration Draft");
      expect(storedDraft?.ownerUid).toBeUndefined();
    });

    it("invalid or empty draft ownership is safely excluded from recovery", async () => {
      await saveLocalDraft({
        id: "draft-empty-owner",
        ownerUid: "   ", // whitespace only
        projectId: "proj-1",
        title: "Invalid Owner Draft",
        observation: "Obs",
        category: "surface_condition",
        visibleEvidence: [],
        uncertainties: [],
        inspectorFollowUp: [],
        photoIds: [],
        isSynced: false,
        createdAt: 1000,
        lastSavedAt: 1000,
      });

      const recovered = await recoverUnenqueuedDrafts(TEST_UID, 2000);
      expect(recovered).toBe(0);
    });

    // ========================================================================
    // Queue State Protection Tests During Recovery
    // ========================================================================
    it("recovery does not recreate a mutation when existing mutation is cancelled_by_user", async () => {
      const draftId = "draft-cancelled-test";

      await saveLocalDraft({
        id: draftId,
        ownerUid: TEST_UID,
        projectId: "proj-1",
        title: "Cancelled Draft",
        observation: "Obs",
        category: "surface_condition",
        visibleEvidence: [],
        uncertainties: [],
        inspectorFollowUp: [],
        photoIds: [],
        isSynced: false,
        createdAt: 1000,
        lastSavedAt: 1000,
      });

      const mut = await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: draftId,
        type: "CREATE_INSPECTION",
        payload: {
          type: "CREATE_INSPECTION",
          inspection: {
            id: draftId,
            ownerUid: TEST_UID,
            projectId: "proj-1",
            projectName: "Project 1",
            title: "Cancelled Draft",
            observation: "Obs",
            category: "surface_condition",
            visibleEvidence: [],
            uncertainties: [],
            inspectorFollowUp: [],
            reviewStatus: "draft_generated",
            aiAssisted: false,
            createdAt: 1000,
            updatedAt: 1000,
          },
        },
      });

      // User explicitly cancels the mutation
      await cancelMutation(TEST_UID, mut.id, "User cancelled upload");

      // Verify mutation is cancelled_by_user
      const cancelledMut = await getMutationById(TEST_UID, mut.id);
      expect(cancelledMut?.status).toBe("cancelled_by_user");

      // Recovery must respect user cancellation and NOT recreate the mutation!
      const recovered = await recoverUnenqueuedDrafts(TEST_UID, 3000);
      expect(recovered).toBe(0);

      // Mutation queue still has only 1 mutation in cancelled_by_user status
      const allMuts = await getAllMutationsByOwner(TEST_UID);
      expect(allMuts).toHaveLength(1);
      expect(allMuts[0]?.status).toBe("cancelled_by_user");

      // Sync status reports sync_cancelled, never synced!
      const syncStatus = await getInspectionSyncStatus(TEST_UID, draftId);
      expect(syncStatus.state).toBe("sync_cancelled");
      expect(syncStatus.label).toBe("Sync Cancelled");
    });

    it("recovery does not restart failed_exhausted or conflict mutations", async () => {
      const draftId = "draft-exhausted-test";

      await saveLocalDraft({
        id: draftId,
        ownerUid: TEST_UID,
        projectId: "proj-1",
        title: "Exhausted Draft",
        observation: "Obs",
        category: "surface_condition",
        visibleEvidence: [],
        uncertainties: [],
        inspectorFollowUp: [],
        photoIds: [],
        isSynced: false,
        createdAt: 1000,
        lastSavedAt: 1000,
      });

      const mut = await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: draftId,
        type: "CREATE_INSPECTION",
        payload: {
          type: "CREATE_INSPECTION",
          inspection: {
            id: draftId,
            ownerUid: TEST_UID,
            projectId: "proj-1",
            projectName: "Project 1",
            title: "Exhausted Draft",
            observation: "Obs",
            category: "surface_condition",
            visibleEvidence: [],
            uncertainties: [],
            inspectorFollowUp: [],
            reviewStatus: "draft_generated",
            aiAssisted: false,
            createdAt: 1000,
            updatedAt: 1000,
          },
        },
      });

      // Transition queued -> in_flight -> failed_exhausted
      await transitionMutationStatus({
        ownerUid: TEST_UID,
        mutationId: mut.id,
        targetStatus: "in_flight",
      });
      await recordMutationAttempt({
        ownerUid: TEST_UID,
        mutationId: mut.id,
        isTransientFailure: false, // immediate permanent exhaustion
        failureReason: "Permanent schema mismatch",
      });

      const exhaustedMut = await getMutationById(TEST_UID, mut.id);
      expect(exhaustedMut?.status).toBe("failed_exhausted");

      // Recovery must NOT restart exhausted mutations!
      const recovered = await recoverUnenqueuedDrafts(TEST_UID, 3000);
      expect(recovered).toBe(0);

      const allMuts = await getAllMutationsByOwner(TEST_UID);
      expect(allMuts).toHaveLength(1);
      expect(allMuts[0]?.status).toBe("failed_exhausted");

      // Sync status reports sync_failed with Sync Exhausted label
      const syncStatus = await getInspectionSyncStatus(TEST_UID, draftId);
      expect(syncStatus.state).toBe("sync_failed");
      expect(syncStatus.label).toBe("Sync Exhausted");
    });

    // ========================================================================
    // Sync-State Representation Tests
    // ========================================================================
    it("remote Firestore inspection (isRemote: true) displays as synced without local queue records", async () => {
      const remoteInspectionId = "insp-downloaded-from-firestore";

      // No queue records exist in local IndexedDB
      const status = await getInspectionSyncStatus(TEST_UID, remoteInspectionId, {
        isRemote: true,
        isLocalDraft: false,
      });

      expect(status.state).toBe("synced");
      expect(status.label).toBe("Synced");
    });

    it("local draft with queued mutation displays as waiting_to_sync", async () => {
      const draftId = "draft-queued-status";

      await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: draftId,
        type: "CREATE_INSPECTION",
        payload: {
          type: "CREATE_INSPECTION",
          inspection: {
            id: draftId,
            ownerUid: TEST_UID,
            projectId: "proj-1",
            projectName: "Project 1",
            title: "Queued Status Draft",
            observation: "Obs",
            category: "surface_condition",
            visibleEvidence: [],
            uncertainties: [],
            inspectorFollowUp: [],
            reviewStatus: "draft_generated",
            aiAssisted: false,
            createdAt: 1000,
            updatedAt: 1000,
          },
        },
      });

      const status = await getInspectionSyncStatus(TEST_UID, draftId, {
        isLocalDraft: true,
      });

      expect(status.state).toBe("waiting_to_sync");
      expect(status.label).toBe("Waiting to Sync");
    });

    it("local draft with in_flight mutation displays as syncing", async () => {
      const draftId = "draft-inflight-status";

      const mut = await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: draftId,
        type: "CREATE_INSPECTION",
        payload: {
          type: "CREATE_INSPECTION",
          inspection: {
            id: draftId,
            ownerUid: TEST_UID,
            projectId: "proj-1",
            projectName: "Project 1",
            title: "In-Flight Draft",
            observation: "Obs",
            category: "surface_condition",
            visibleEvidence: [],
            uncertainties: [],
            inspectorFollowUp: [],
            reviewStatus: "draft_generated",
            aiAssisted: false,
            createdAt: 1000,
            updatedAt: 1000,
          },
        },
      });

      await transitionMutationStatus({
        ownerUid: TEST_UID,
        mutationId: mut.id,
        targetStatus: "in_flight",
      });

      const status = await getInspectionSyncStatus(TEST_UID, draftId, {
        isLocalDraft: true,
      });

      expect(status.state).toBe("syncing");
      expect(status.label).toBe("Syncing...");
    });

    it("local draft with conflict mutation displays as conflict", async () => {
      const draftId = "draft-conflict-status";

      const mut = await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: draftId,
        type: "CREATE_INSPECTION",
        payload: {
          type: "CREATE_INSPECTION",
          inspection: {
            id: draftId,
            ownerUid: TEST_UID,
            projectId: "proj-1",
            projectName: "Project 1",
            title: "Conflict Draft",
            observation: "Obs",
            category: "surface_condition",
            visibleEvidence: [],
            uncertainties: [],
            inspectorFollowUp: [],
            reviewStatus: "draft_generated",
            aiAssisted: false,
            createdAt: 1000,
            updatedAt: 1000,
          },
        },
      });

      await transitionMutationStatus({
        ownerUid: TEST_UID,
        mutationId: mut.id,
        targetStatus: "in_flight",
      });
      await transitionMutationStatus({
        ownerUid: TEST_UID,
        mutationId: mut.id,
        targetStatus: "conflict",
        conflictReason: "Document exists with different clientCreationNonce",
      });

      const status = await getInspectionSyncStatus(TEST_UID, draftId, {
        isLocalDraft: true,
      });

      expect(status.state).toBe("conflict");
      expect(status.label).toBe("Conflict");
      expect(status.conflictReason).toContain("different clientCreationNonce");
    });

    it("confirmed Firestore acknowledgement updates local draft to isSynced: true", async () => {
      const draftId = "draft-confirm-sync";

      await saveLocalDraft({
        id: draftId,
        projectId: "proj-1",
        title: "Confirm Sync Draft",
        observation: "Obs",
        category: "surface_condition",
        visibleEvidence: [],
        uncertainties: [],
        inspectorFollowUp: [],
        photoIds: [],
        isSynced: false,
        createdAt: 1000,
        lastSavedAt: 1000,
      });

      await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: draftId,
        type: "CREATE_INSPECTION",
        payload: {
          type: "CREATE_INSPECTION",
          inspection: {
            id: draftId,
            projectId: "proj-1",
            projectName: "Project 1",
            title: "Confirm Sync Draft",
            observation: "Obs",
            category: "surface_condition",
            visibleEvidence: [],
            uncertainties: [],
            inspectorFollowUp: [],
            reviewStatus: "draft_generated",
            aiAssisted: false,
            createdAt: 1000,
            updatedAt: 1000,
          },
        },
      });

      const res = await replayQueuedMutations({ lockCoordinator: createMockLockCoordinator(true) });
      expect(res.status).toBe("SUCCESS");

      // Local draft is confirmed synced
      const updatedDraft = await getLocalDraft(draftId);
      expect(updatedDraft?.isSynced).toBe(true);

      const syncStatus = await getInspectionSyncStatus(TEST_UID, draftId);
      expect(syncStatus.state).toBe("synced");
      expect(syncStatus.label).toBe("Synced");
    });
  });

  // ==========================================================================
  // 6. Tightened Error Classification
  // ==========================================================================
  describe("6. Tightened Error Classification", () => {
    it("permanent code remains permanent even if its message contains 'network', 'timeout', or 'unavailable'", () => {
      const permWithNetwork = Object.assign(new Error("Permission denied over network connection"), {
        code: "permission-denied",
      });
      expect(classifyFirestoreError(permWithNetwork).kind).toBe("permanent");

      const authWithTimeout = Object.assign(new Error("Unauthenticated caller session timeout"), {
        code: "unauthenticated",
      });
      expect(classifyFirestoreError(authWithTimeout).kind).toBe("permanent");

      const invalidWithUnavail = Object.assign(new Error("Invalid argument: service unavailable"), {
        code: "invalid-argument",
      });
      expect(classifyFirestoreError(invalidWithUnavail).kind).toBe("permanent");
    });

    it("transient documented codes remain retryable", () => {
      const unavail = Object.assign(new Error("Backend service unavailable"), {
        code: "unavailable",
      });
      expect(classifyFirestoreError(unavail).kind).toBe("transient");

      const deadline = Object.assign(new Error("Deadline exceeded"), {
        code: "deadline-exceeded",
      });
      expect(classifyFirestoreError(deadline).kind).toBe("transient");

      const resourceExhausted = Object.assign(new Error("Resource exhausted"), {
        code: "resource-exhausted",
      });
      expect(classifyFirestoreError(resourceExhausted).kind).toBe("transient");
    });

    it("conflict code 'already-exists' routes to conflict and stays out of retry loop", () => {
      const conflictErr = Object.assign(new Error("Document already exists"), {
        code: "already-exists",
      });
      expect(classifyFirestoreError(conflictErr).kind).toBe("conflict");
    });

    it("unknown errors fail safely as permanent to prevent infinite retry loops", () => {
      const unknownCustom = new Error("Something strange happened inside client runtime");
      expect(classifyFirestoreError(unknownCustom).kind).toBe("permanent");

      const objError = { foo: "bar" };
      expect(classifyFirestoreError(objError).kind).toBe("permanent");
    });
  });

  // ==========================================================================
  // 7. Invariants & Regression Safeguards
  // ==========================================================================
  describe("7. Invariants & Regression Safeguards", () => {
    it("strictly exhausts mutation at 5 attempts and never schedules a 6th attempt", async () => {
      const mut = await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: "insp-exhaust-5",
        type: "CREATE_INSPECTION",
        payload: {
          type: "CREATE_INSPECTION",
          inspection: {
            projectId: "proj-1",
            projectName: "Project 1",
            title: "Exhaustion Test",
            observation: "Obs",
            category: "surface_condition",
            visibleEvidence: [],
            uncertainties: [],
            inspectorFollowUp: [],
            reviewStatus: "draft_generated",
            aiAssisted: false,
            createdAt: 1000,
            updatedAt: 1000,
          },
        },
      });

      // Force createInspectionTransaction to reject with transient error
      vi.spyOn(firestoreService, "createInspectionTransaction").mockRejectedValue(
        Object.assign(new Error("Unavailable"), { code: "unavailable" })
      );

      // Attempt 1 -> retryCount 1 (failed)
      await replayQueuedMutations({ lockCoordinator: createMockLockCoordinator(true), now: 1000 });
      let m = await getMutationById(TEST_UID, mut.id);
      expect(m?.retryCount).toBe(1);
      expect(m?.status).toBe("failed");

      // Attempt 2 -> retryCount 2 (failed)
      await replayQueuedMutations({ lockCoordinator: createMockLockCoordinator(true), now: m!.nextRetryAt! + 10 });
      m = await getMutationById(TEST_UID, mut.id);
      expect(m?.retryCount).toBe(2);
      expect(m?.status).toBe("failed");

      // Attempt 3 -> retryCount 3 (failed)
      await replayQueuedMutations({ lockCoordinator: createMockLockCoordinator(true), now: m!.nextRetryAt! + 10 });
      m = await getMutationById(TEST_UID, mut.id);
      expect(m?.retryCount).toBe(3);
      expect(m?.status).toBe("failed");

      // Attempt 4 -> retryCount 4 (failed)
      await replayQueuedMutations({ lockCoordinator: createMockLockCoordinator(true), now: m!.nextRetryAt! + 10 });
      m = await getMutationById(TEST_UID, mut.id);
      expect(m?.retryCount).toBe(4);
      expect(m?.status).toBe("failed");

      // Attempt 5 -> retryCount 5 -> TERMINAL EXHAUSTION (failed_exhausted)
      await replayQueuedMutations({ lockCoordinator: createMockLockCoordinator(true), now: m!.nextRetryAt! + 10 });
      m = await getMutationById(TEST_UID, mut.id);
      expect(m?.retryCount).toBe(5);
      expect(m?.status).toBe("failed_exhausted");
      expect(m?.nextRetryAt).toBeNull();

      // Subsequent replay run does NOT attempt a 6th time
      const sixthRun = await replayQueuedMutations({
        lockCoordinator: createMockLockCoordinator(true),
        now: 99999999,
      });
      expect(sixthRun.processedCount).toBe(0);
      m = await getMutationById(TEST_UID, mut.id);
      expect(m?.retryCount).toBe(5);
      expect(m?.status).toBe("failed_exhausted");
    });

    it("ensures zero photo Blobs are uploaded during Firestore write", async () => {
      const inspectionId = "insp-zero-blobs";

      await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: inspectionId,
        type: "CREATE_INSPECTION",
        payload: {
          type: "CREATE_INSPECTION",
          inspection: {
            id: inspectionId,
            projectId: "proj-1",
            projectName: "Project 1",
            title: "Zero Blobs Test",
            observation: "Obs",
            category: "surface_condition",
            visibleEvidence: [],
            uncertainties: [],
            inspectorFollowUp: [],
            reviewStatus: "draft_generated",
            aiAssisted: false,
            photoMeta: {
              id: "photo-meta-1",
              fileName: "crack.jpg",
              fileSizeBytes: 2048,
              mimeType: "image/jpeg",
              storageProvider: "indexeddb",
              hasLocalBlob: true,
              capturedAt: 1000,
            },
            createdAt: 1000,
            updatedAt: 1000,
          },
        },
      });

      await replayQueuedMutations({ lockCoordinator: createMockLockCoordinator(true) });

      const remoteDoc = mockRemoteDocStore.get(`users/${TEST_UID}/inspections/${inspectionId}`);
      expect(remoteDoc).toBeDefined();
      expect((remoteDoc as Record<string, unknown>)?.blob).toBeUndefined();
      expect(
        Object.values(remoteDoc!).some((val) => typeof Blob !== "undefined" && val instanceof Blob)
      ).toBe(false);
      expect((remoteDoc as Record<string, unknown>)?.photoMeta).toEqual({
        id: "photo-meta-1",
        fileName: "crack.jpg",
        fileSizeBytes: 2048,
        mimeType: "image/jpeg",
        storageProvider: "indexeddb",
        hasLocalBlob: true,
        capturedAt: 1000,
      });
    });

    it("verifies clearAllLocalEvidence continues preserving mutation queue records", async () => {
      await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: "insp-persist-queue",
        type: "CREATE_INSPECTION",
        payload: {
          type: "CREATE_INSPECTION",
          inspection: {
            projectId: "proj-1",
            projectName: "Project 1",
            title: "Evidence Reset Test",
            observation: "Obs",
            category: "surface_condition",
            visibleEvidence: [],
            uncertainties: [],
            inspectorFollowUp: [],
            reviewStatus: "draft_generated",
            aiAssisted: false,
            createdAt: 1000,
            updatedAt: 1000,
          },
        },
      });

      // Clear evidence (simulating user-initiated cache purge in Settings)
      await clearAllLocalEvidence();

      // Mutation queue must remain fully intact
      const muts = await getAllMutationsByOwner(TEST_UID);
      expect(muts).toHaveLength(1);
      expect(muts[0]?.targetInspectionId).toBe("insp-persist-queue");
    });
  });

  // ==========================================================================
  // 8. UPDATE_DRAFT Mutation Replay
  // ==========================================================================
  describe("8. UPDATE_DRAFT Mutation Replay", () => {
    it("successfully replays UPDATE_DRAFT: updates remote fields, increments revision, and marks local draft synced", async () => {
      const inspectionId = "insp-update-success";
      // Seed remote inspection at revision 1
      mockRemoteDocStore.set(`users/${TEST_UID}/inspections/${inspectionId}`, {
        id: inspectionId,
        ownerUid: TEST_UID,
        projectId: "proj-1",
        projectName: "Project 1",
        title: "Initial Title",
        observation: "Initial Observation",
        category: "surface_condition",
        visibleEvidence: ["initial evidence"],
        uncertainties: [],
        inspectorFollowUp: [],
        photoIds: [],
        reviewStatus: "draft_generated",
        reviewHistory: [],
        revision: 1,
        appliedMutationIds: [],
        createdAt: 1000,
        updatedAt: 1000,
      });

      // Save local draft
      await saveLocalDraft({
        id: inspectionId,
        ownerUid: TEST_UID,
        projectId: "proj-1",
        title: "Updated Title",
        observation: "Updated Observation",
        category: "surface_condition",
        visibleEvidence: ["new evidence"],
        uncertainties: [],
        inspectorFollowUp: [],
        photoIds: [],
        isSynced: false,
        reviewStatus: "draft_generated",
        revision: 1,
        lastSavedAt: 2000,
        createdAt: 1000,
      });

      const mutation = await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: inspectionId,
        type: "UPDATE_DRAFT",
        payload: {
          type: "UPDATE_DRAFT",
          title: "Updated Title",
          observation: "Updated Observation",
          visibleEvidence: ["new evidence"],
        },
        baseRevision: 1,
      });

      const res = await replayQueuedMutations({ lockCoordinator: createMockLockCoordinator(true) });
      expect(res.status).toBe("SUCCESS");
      expect(res.succeededCount).toBe(1);

      // Verify remote document
      const remote = mockRemoteDocStore.get(`users/${TEST_UID}/inspections/${inspectionId}`) as Record<string, unknown>;
      expect(remote.title).toBe("Updated Title");
      expect(remote.observation).toBe("Updated Observation");
      expect(remote.visibleEvidence).toEqual(["new evidence"]);
      expect(remote.revision).toBe(2);
      expect((remote.appliedMutationIds as string[])).toContain(mutation.id);

      // Verify mutation status
      const mut = await getMutationById(TEST_UID, mutation.id);
      expect(mut?.status).toBe("succeeded");

      // Verify local draft is synced
      const local = await getLocalDraft(inspectionId);
      expect(local?.isSynced).toBe(true);
      expect(local?.title).toBe("Updated Title");
      expect(local?.revision).toBe(2);
    });

    it("idempotently acknowledges UPDATE_DRAFT if mutationId is already in appliedMutationIds", async () => {
      const inspectionId = "insp-update-idempotent";
      const existingMutationId = "mut-already-applied-123";

      mockRemoteDocStore.set(`users/${TEST_UID}/inspections/${inspectionId}`, {
        id: inspectionId,
        ownerUid: TEST_UID,
        projectId: "proj-1",
        projectName: "Project 1",
        title: "Already Applied Title",
        observation: "Already Applied Obs",
        category: "surface_condition",
        reviewStatus: "draft_generated",
        revision: 2,
        appliedMutationIds: [existingMutationId],
        createdAt: 1000,
        updatedAt: 1500,
      });

      // Enqueue mutation with that same ID (simulating retry of committed write)
      const mutation = await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: inspectionId,
        type: "UPDATE_DRAFT",
        payload: {
          type: "UPDATE_DRAFT",
          title: "Already Applied Title",
        },
        baseRevision: 1,
      });

      // Manually set mutation ID to match appliedMutationId
      // by testing replay where mutationId was in appliedMutationIds
      const remote = mockRemoteDocStore.get(`users/${TEST_UID}/inspections/${inspectionId}`) as Record<string, unknown>;
      remote.appliedMutationIds = [mutation.id];

      const res = await replayQueuedMutations({ lockCoordinator: createMockLockCoordinator(true) });
      expect(res.status).toBe("SUCCESS");
      expect(res.succeededCount).toBe(1);

      const mut = await getMutationById(TEST_UID, mutation.id);
      expect(mut?.status).toBe("succeeded");
    });

    it("rejects UPDATE_DRAFT with CONFLICT if remote inspection is approved (protects human decision)", async () => {
      const inspectionId = "insp-update-approved";
      mockRemoteDocStore.set(`users/${TEST_UID}/inspections/${inspectionId}`, {
        id: inspectionId,
        ownerUid: TEST_UID,
        projectId: "proj-1",
        projectName: "Project 1",
        title: "Original Approved",
        observation: "Original",
        category: "surface_condition",
        reviewStatus: "approved",
        reviewHistory: [{ id: "rev-1", fromStatus: "in_review", toStatus: "approved", byUid: "approver", timestamp: 1200, revision: 2 }],
        revision: 2,
        appliedMutationIds: [],
        createdAt: 1000,
        updatedAt: 1200,
      });

      const mutation = await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: inspectionId,
        type: "UPDATE_DRAFT",
        payload: {
          type: "UPDATE_DRAFT",
          title: "Malicious Overwrite of Approved Draft",
        },
        baseRevision: 1,
      });

      const res = await replayQueuedMutations({ lockCoordinator: createMockLockCoordinator(true) });
      expect(res.status).toBe("ERROR");
      expect(res.conflictCount).toBe(1);

      const mut = await getMutationById(TEST_UID, mutation.id);
      expect(mut?.status).toBe("conflict");
      expect(mut?.conflictReason).toContain("already approved");

      // Verify remote document unchanged
      const remote = mockRemoteDocStore.get(`users/${TEST_UID}/inspections/${inspectionId}`) as Record<string, unknown>;
      expect(remote.title).toBe("Original Approved");
    });

    it("rejects UPDATE_DRAFT with CONFLICT if remote inspection is rejected", async () => {
      const inspectionId = "insp-update-rejected";
      mockRemoteDocStore.set(`users/${TEST_UID}/inspections/${inspectionId}`, {
        id: inspectionId,
        ownerUid: TEST_UID,
        projectId: "proj-1",
        projectName: "Project 1",
        title: "Original Rejected",
        observation: "Original",
        category: "surface_condition",
        reviewStatus: "rejected",
        revision: 2,
        appliedMutationIds: [],
        createdAt: 1000,
        updatedAt: 1200,
      });

      const mutation = await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: inspectionId,
        type: "UPDATE_DRAFT",
        payload: {
          type: "UPDATE_DRAFT",
          title: "Attempted Overwrite",
        },
        baseRevision: 1,
      });

      const res = await replayQueuedMutations({ lockCoordinator: createMockLockCoordinator(true) });
      expect(res.status).toBe("ERROR");
      expect(res.conflictCount).toBe(1);

      const mut = await getMutationById(TEST_UID, mutation.id);
      expect(mut?.status).toBe("conflict");
      expect(mut?.conflictReason).toContain("already rejected");
    });

    it("rejects UPDATE_DRAFT with CONFLICT if remote inspection is archived", async () => {
      const inspectionId = "insp-update-archived";
      mockRemoteDocStore.set(`users/${TEST_UID}/inspections/${inspectionId}`, {
        id: inspectionId,
        ownerUid: TEST_UID,
        projectId: "proj-1",
        projectName: "Project 1",
        title: "Archived Inspection",
        observation: "Original",
        category: "surface_condition",
        reviewStatus: "draft_generated",
        isArchived: true,
        archivedAt: 1500,
        archivedByUid: TEST_UID,
        revision: 2,
        appliedMutationIds: [],
        createdAt: 1000,
        updatedAt: 1500,
      });

      const mutation = await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: inspectionId,
        type: "UPDATE_DRAFT",
        payload: {
          type: "UPDATE_DRAFT",
          title: "Edit Archived Inspection",
        },
        baseRevision: 1,
      });

      const res = await replayQueuedMutations({ lockCoordinator: createMockLockCoordinator(true) });
      expect(res.status).toBe("ERROR");
      expect(res.conflictCount).toBe(1);

      const mut = await getMutationById(TEST_UID, mutation.id);
      expect(mut?.status).toBe("conflict");
      expect(mut?.conflictReason).toContain("archived");
    });

    it("rejects UPDATE_DRAFT with CONFLICT if remote revision has advanced beyond baseRevision", async () => {
      const inspectionId = "insp-update-stale-rev";
      mockRemoteDocStore.set(`users/${TEST_UID}/inspections/${inspectionId}`, {
        id: inspectionId,
        ownerUid: TEST_UID,
        projectId: "proj-1",
        projectName: "Project 1",
        title: "Remote Revision 3",
        observation: "Original",
        category: "surface_condition",
        reviewStatus: "draft_generated",
        revision: 3,
        appliedMutationIds: [],
        createdAt: 1000,
        updatedAt: 1500,
      });

      // Mutation was drafted against revision 1
      const mutation = await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: inspectionId,
        type: "UPDATE_DRAFT",
        payload: {
          type: "UPDATE_DRAFT",
          title: "Drafted on Rev 1",
        },
        baseRevision: 1,
      });

      const res = await replayQueuedMutations({ lockCoordinator: createMockLockCoordinator(true) });
      expect(res.status).toBe("ERROR");
      expect(res.conflictCount).toBe(1);

      const mut = await getMutationById(TEST_UID, mutation.id);
      expect(mut?.status).toBe("conflict");
      expect(mut?.conflictReason).toContain("Stale revision conflict");
    });

    it("fails UPDATE_DRAFT with CONFLICT if remote document does not exist", async () => {
      const inspectionId = "insp-update-nonexistent";

      const mutation = await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: inspectionId,
        type: "UPDATE_DRAFT",
        payload: {
          type: "UPDATE_DRAFT",
          title: "Update Nonexistent",
        },
        baseRevision: 1,
      });

      const res = await replayQueuedMutations({ lockCoordinator: createMockLockCoordinator(true) });
      expect(res.status).toBe("ERROR");
      expect(res.conflictCount).toBe(1);

      const mut = await getMutationById(TEST_UID, mutation.id);
      expect(mut?.status).toBe("conflict");
      expect(mut?.conflictReason).toContain("does not exist");
    });
  });

  // ==========================================================================
  // 9. TRANSITION_REVIEW Mutation Replay
  // ==========================================================================
  describe("9. TRANSITION_REVIEW Mutation Replay", () => {
    it("successfully replays draft_generated -> in_review: appends audit event and increments revision", async () => {
      const inspectionId = "insp-review-begin";
      mockRemoteDocStore.set(`users/${TEST_UID}/inspections/${inspectionId}`, {
        id: inspectionId,
        ownerUid: TEST_UID,
        projectId: "proj-1",
        projectName: "Project 1",
        title: "Review Test",
        observation: "Obs",
        category: "surface_condition",
        reviewStatus: "draft_generated",
        reviewHistory: [],
        revision: 1,
        appliedMutationIds: [],
        createdAt: 1000,
        updatedAt: 1000,
      });

      await saveLocalDraft({
        id: inspectionId,
        ownerUid: TEST_UID,
        projectId: "proj-1",
        title: "Review Test",
        observation: "Obs",
        category: "surface_condition",
        visibleEvidence: [],
        uncertainties: [],
        inspectorFollowUp: [],
        photoIds: [],
        isSynced: false,
        reviewStatus: "draft_generated",
        lastSavedAt: 1000,
        createdAt: 1000,
      });

      await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: inspectionId,
        type: "TRANSITION_REVIEW",
        payload: {
          type: "TRANSITION_REVIEW",
          fromStatus: "draft_generated",
          targetStatus: "in_review",
          reviewerUid: TEST_UID,
          comment: "Starting inspection review",
          auditEventId: "rev-evt-start-1",
        },
        baseRevision: 1,
      });

      const res = await replayQueuedMutations({ lockCoordinator: createMockLockCoordinator(true) });
      expect(res.status).toBe("SUCCESS");
      expect(res.succeededCount).toBe(1);

      const remote = mockRemoteDocStore.get(`users/${TEST_UID}/inspections/${inspectionId}`) as Record<string, unknown>;
      expect(remote.reviewStatus).toBe("in_review");
      expect(remote.revision).toBe(2);
      expect(remote.reviewedByUid).toBe(TEST_UID);
      const history = remote.reviewHistory as Array<Record<string, unknown>>;
      expect(history).toHaveLength(1);
      expect(history[0]?.id).toBe("rev-evt-start-1");
      expect(history[0]?.fromStatus).toBe("draft_generated");
      expect(history[0]?.toStatus).toBe("in_review");
      expect(history[0]?.byUid).toBe(TEST_UID);

      const local = await getLocalDraft(inspectionId);
      expect(local?.reviewStatus).toBe("in_review");
      expect(local?.isSynced).toBe(true);
    });

    it("successfully replays in_review -> approved", async () => {
      const inspectionId = "insp-review-approve";
      mockRemoteDocStore.set(`users/${TEST_UID}/inspections/${inspectionId}`, {
        id: inspectionId,
        ownerUid: TEST_UID,
        projectId: "proj-1",
        projectName: "Project 1",
        title: "Approve Test",
        observation: "Obs",
        category: "surface_condition",
        reviewStatus: "in_review",
        reviewHistory: [{ id: "rev-1", fromStatus: "draft_generated", toStatus: "in_review", byUid: TEST_UID, timestamp: 1000, revision: 2 }],
        revision: 2,
        appliedMutationIds: [],
        createdAt: 1000,
        updatedAt: 1000,
      });

      await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: inspectionId,
        type: "TRANSITION_REVIEW",
        payload: {
          type: "TRANSITION_REVIEW",
          fromStatus: "in_review",
          targetStatus: "approved",
          reviewerUid: TEST_UID,
          comment: "Fully verified on site",
          auditEventId: "rev-evt-approve-2",
        },
        baseRevision: 2,
      });

      const res = await replayQueuedMutations({ lockCoordinator: createMockLockCoordinator(true) });
      expect(res.status).toBe("SUCCESS");

      const remote = mockRemoteDocStore.get(`users/${TEST_UID}/inspections/${inspectionId}`) as Record<string, unknown>;
      expect(remote.reviewStatus).toBe("approved");
      expect(remote.revision).toBe(3);
      const history = remote.reviewHistory as Array<Record<string, unknown>>;
      expect(history).toHaveLength(2);
      expect(history[1]?.toStatus).toBe("approved");
    });

    it("successfully replays in_review -> rejected", async () => {
      const inspectionId = "insp-review-reject";
      mockRemoteDocStore.set(`users/${TEST_UID}/inspections/${inspectionId}`, {
        id: inspectionId,
        ownerUid: TEST_UID,
        projectId: "proj-1",
        projectName: "Project 1",
        title: "Reject Test",
        observation: "Obs",
        category: "surface_condition",
        reviewStatus: "in_review",
        reviewHistory: [{ id: "rev-1", fromStatus: "draft_generated", toStatus: "in_review", byUid: TEST_UID, timestamp: 1000, revision: 2 }],
        revision: 2,
        appliedMutationIds: [],
        createdAt: 1000,
        updatedAt: 1000,
      });

      await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: inspectionId,
        type: "TRANSITION_REVIEW",
        payload: {
          type: "TRANSITION_REVIEW",
          fromStatus: "in_review",
          targetStatus: "rejected",
          reviewerUid: TEST_UID,
          comment: "Insufficient photograph resolution",
          auditEventId: "rev-evt-reject-2",
        },
        baseRevision: 2,
      });

      const res = await replayQueuedMutations({ lockCoordinator: createMockLockCoordinator(true) });
      expect(res.status).toBe("SUCCESS");

      const remote = mockRemoteDocStore.get(`users/${TEST_UID}/inspections/${inspectionId}`) as Record<string, unknown>;
      expect(remote.reviewStatus).toBe("rejected");
      expect(remote.revision).toBe(3);
    });

    it("successfully replays approved -> in_review (reopening review)", async () => {
      const inspectionId = "insp-review-reopen-appr";
      mockRemoteDocStore.set(`users/${TEST_UID}/inspections/${inspectionId}`, {
        id: inspectionId,
        ownerUid: TEST_UID,
        projectId: "proj-1",
        projectName: "Project 1",
        title: "Reopen Approved Test",
        observation: "Obs",
        category: "surface_condition",
        reviewStatus: "approved",
        reviewHistory: [
          { id: "rev-1", fromStatus: "draft_generated", toStatus: "in_review", byUid: TEST_UID, timestamp: 1000, revision: 2 },
          { id: "rev-2", fromStatus: "in_review", toStatus: "approved", byUid: TEST_UID, timestamp: 1100, revision: 3 },
        ],
        revision: 3,
        appliedMutationIds: [],
        createdAt: 1000,
        updatedAt: 1100,
      });

      await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: inspectionId,
        type: "TRANSITION_REVIEW",
        payload: {
          type: "TRANSITION_REVIEW",
          fromStatus: "approved",
          targetStatus: "in_review",
          reviewerUid: TEST_UID,
          comment: "Reopening due to new evidence",
          auditEventId: "rev-evt-reopen-3",
        },
        baseRevision: 3,
      });

      const res = await replayQueuedMutations({ lockCoordinator: createMockLockCoordinator(true) });
      expect(res.status).toBe("SUCCESS");

      const remote = mockRemoteDocStore.get(`users/${TEST_UID}/inspections/${inspectionId}`) as Record<string, unknown>;
      expect(remote.reviewStatus).toBe("in_review");
      expect(remote.revision).toBe(4);
      const history = remote.reviewHistory as Array<Record<string, unknown>>;
      expect(history).toHaveLength(3);
      expect(history[2]?.toStatus).toBe("in_review");
    });

    it("successfully replays rejected -> in_review (reopening rejected draft)", async () => {
      const inspectionId = "insp-review-reopen-rej";
      mockRemoteDocStore.set(`users/${TEST_UID}/inspections/${inspectionId}`, {
        id: inspectionId,
        ownerUid: TEST_UID,
        projectId: "proj-1",
        projectName: "Project 1",
        title: "Reopen Rejected Test",
        observation: "Obs",
        category: "surface_condition",
        reviewStatus: "rejected",
        reviewHistory: [
          { id: "rev-1", fromStatus: "draft_generated", toStatus: "in_review", byUid: TEST_UID, timestamp: 1000, revision: 2 },
          { id: "rev-2", fromStatus: "in_review", toStatus: "rejected", byUid: TEST_UID, timestamp: 1100, revision: 3 },
        ],
        revision: 3,
        appliedMutationIds: [],
        createdAt: 1000,
        updatedAt: 1100,
      });

      await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: inspectionId,
        type: "TRANSITION_REVIEW",
        payload: {
          type: "TRANSITION_REVIEW",
          fromStatus: "rejected",
          targetStatus: "in_review",
          reviewerUid: TEST_UID,
          comment: "Reopening after clarification",
          auditEventId: "rev-evt-reopen-rej-3",
        },
        baseRevision: 3,
      });

      const res = await replayQueuedMutations({ lockCoordinator: createMockLockCoordinator(true) });
      expect(res.status).toBe("SUCCESS");

      const remote = mockRemoteDocStore.get(`users/${TEST_UID}/inspections/${inspectionId}`) as Record<string, unknown>;
      expect(remote.reviewStatus).toBe("in_review");
      expect(remote.revision).toBe(4);
    });

    it("rejects direct prohibited transition draft_generated -> approved with CONFLICT", async () => {
      const inspectionId = "insp-review-illegal-direct";
      mockRemoteDocStore.set(`users/${TEST_UID}/inspections/${inspectionId}`, {
        id: inspectionId,
        ownerUid: TEST_UID,
        projectId: "proj-1",
        projectName: "Project 1",
        title: "Illegal Direct Transition",
        observation: "Obs",
        category: "surface_condition",
        reviewStatus: "draft_generated",
        reviewHistory: [],
        revision: 1,
        appliedMutationIds: [],
        createdAt: 1000,
        updatedAt: 1000,
      });

      const mutation = await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: inspectionId,
        type: "TRANSITION_REVIEW",
        payload: {
          type: "TRANSITION_REVIEW",
          fromStatus: "draft_generated",
          targetStatus: "approved",
          reviewerUid: TEST_UID,
          auditEventId: "rev-evt-illegal-1",
        },
        baseRevision: 1,
      });

      const res = await replayQueuedMutations({ lockCoordinator: createMockLockCoordinator(true) });
      expect(res.status).toBe("ERROR");
      expect(res.conflictCount).toBe(1);

      const mut = await getMutationById(TEST_UID, mutation.id);
      expect(mut?.status).toBe("conflict");
      expect(mut?.conflictReason).toContain("Invalid review transition");
    });

    it("rejects retrograde transition in_review -> draft_generated with CONFLICT", async () => {
      const inspectionId = "insp-review-illegal-retro";
      mockRemoteDocStore.set(`users/${TEST_UID}/inspections/${inspectionId}`, {
        id: inspectionId,
        ownerUid: TEST_UID,
        projectId: "proj-1",
        projectName: "Project 1",
        title: "Retrograde Transition",
        observation: "Obs",
        category: "surface_condition",
        reviewStatus: "in_review",
        reviewHistory: [{ id: "rev-1", fromStatus: "draft_generated", toStatus: "in_review", byUid: TEST_UID, timestamp: 1000, revision: 2 }],
        revision: 2,
        appliedMutationIds: [],
        createdAt: 1000,
        updatedAt: 1000,
      });

      const mutation = await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: inspectionId,
        type: "TRANSITION_REVIEW",
        payload: {
          type: "TRANSITION_REVIEW",
          fromStatus: "in_review",
          targetStatus: "draft_generated" as unknown as ReviewStatus,
          reviewerUid: TEST_UID,
          auditEventId: "rev-evt-retro-2",
        },
        baseRevision: 2,
      });

      const res = await replayQueuedMutations({ lockCoordinator: createMockLockCoordinator(true) });
      expect(res.status).toBe("ERROR");
      expect(res.conflictCount).toBe(1);

      const mut = await getMutationById(TEST_UID, mutation.id);
      expect(mut?.status).toBe("conflict");
      expect(mut?.conflictReason).toContain("Invalid review transition");
    });

    it("rejects stale review transition with CONFLICT when remote status has diverged from fromStatus", async () => {
      const inspectionId = "insp-review-stale";
      // Remote is already approved
      mockRemoteDocStore.set(`users/${TEST_UID}/inspections/${inspectionId}`, {
        id: inspectionId,
        ownerUid: TEST_UID,
        projectId: "proj-1",
        projectName: "Project 1",
        title: "Stale Review",
        observation: "Obs",
        category: "surface_condition",
        reviewStatus: "approved",
        reviewHistory: [{ id: "rev-1", fromStatus: "in_review", toStatus: "approved", byUid: "other", timestamp: 1000, revision: 2 }],
        revision: 2,
        appliedMutationIds: [],
        createdAt: 1000,
        updatedAt: 1000,
      });

      // User attempted to approve from in_review, but remote was already changed
      const mutation = await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: inspectionId,
        type: "TRANSITION_REVIEW",
        payload: {
          type: "TRANSITION_REVIEW",
          fromStatus: "in_review",
          targetStatus: "approved",
          reviewerUid: TEST_UID,
          auditEventId: "rev-evt-stale-2",
        },
        baseRevision: 1,
      });

      const res = await replayQueuedMutations({ lockCoordinator: createMockLockCoordinator(true) });
      expect(res.status).toBe("ERROR");
      expect(res.conflictCount).toBe(1);

      const mut = await getMutationById(TEST_UID, mutation.id);
      expect(mut?.status).toBe("conflict");
      expect(mut?.conflictReason).toContain("Stale review transition");
    });

    it("rejects review transition with CONFLICT if reviewHistory reaches cap of 100 events", async () => {
      const inspectionId = "insp-review-capped";
      const fullHistory = Array.from({ length: 100 }, (_, i) => ({
        id: `rev-evt-${i}`,
        fromStatus: i % 2 === 0 ? "in_review" : "approved",
        toStatus: i % 2 === 0 ? "approved" : "in_review",
        byUid: TEST_UID,
        timestamp: 1000 + i,
        revision: i + 1,
      }));

      mockRemoteDocStore.set(`users/${TEST_UID}/inspections/${inspectionId}`, {
        id: inspectionId,
        ownerUid: TEST_UID,
        projectId: "proj-1",
        projectName: "Project 1",
        title: "Capped Inspection",
        observation: "Obs",
        category: "surface_condition",
        reviewStatus: "in_review",
        reviewHistory: fullHistory,
        revision: 100,
        appliedMutationIds: [],
        createdAt: 1000,
        updatedAt: 2000,
      });

      const mutation = await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: inspectionId,
        type: "TRANSITION_REVIEW",
        payload: {
          type: "TRANSITION_REVIEW",
          fromStatus: "in_review",
          targetStatus: "approved",
          reviewerUid: TEST_UID,
          auditEventId: "rev-evt-101",
        },
        baseRevision: 100,
      });

      const res = await replayQueuedMutations({ lockCoordinator: createMockLockCoordinator(true) });
      expect(res.status).toBe("ERROR");
      expect(res.conflictCount).toBe(1);

      const mut = await getMutationById(TEST_UID, mutation.id);
      expect(mut?.status).toBe("conflict");
      expect(mut?.conflictReason).toContain("cap reached");
    });
  });

  // ==========================================================================
  // 10. ARCHIVE_INSPECTION & UNARCHIVE_INSPECTION Replay
  // ==========================================================================
  describe("10. ARCHIVE_INSPECTION & UNARCHIVE_INSPECTION Replay", () => {
    it("successfully replays ARCHIVE_INSPECTION: sets isArchived: true with attribution and updates local draft", async () => {
      const inspectionId = "insp-archive-success";
      mockRemoteDocStore.set(`users/${TEST_UID}/inspections/${inspectionId}`, {
        id: inspectionId,
        ownerUid: TEST_UID,
        projectId: "proj-1",
        projectName: "Project 1",
        title: "Inspection to Archive",
        observation: "Obs",
        category: "surface_condition",
        reviewStatus: "draft_generated",
        isArchived: false,
        revision: 1,
        appliedMutationIds: [],
        createdAt: 1000,
        updatedAt: 1000,
      });

      await saveLocalDraft({
        id: inspectionId,
        ownerUid: TEST_UID,
        projectId: "proj-1",
        title: "Inspection to Archive",
        observation: "Obs",
        category: "surface_condition",
        visibleEvidence: [],
        uncertainties: [],
        inspectorFollowUp: [],
        photoIds: [],
        isSynced: false,
        isArchived: false,
        lastSavedAt: 1000,
        createdAt: 1000,
      });

      await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: inspectionId,
        type: "ARCHIVE_INSPECTION",
        payload: {
          type: "ARCHIVE_INSPECTION",
          reason: "Project scope postponed indefinitely",
          archivedAt: 2500,
        },
        baseRevision: 1,
      });

      const res = await replayQueuedMutations({ lockCoordinator: createMockLockCoordinator(true) });
      expect(res.status).toBe("SUCCESS");
      expect(res.succeededCount).toBe(1);

      const remote = mockRemoteDocStore.get(`users/${TEST_UID}/inspections/${inspectionId}`) as Record<string, unknown>;
      expect(remote.isArchived).toBe(true);
      expect(remote.archivedAt).toBe(2500);
      expect(remote.archivedByUid).toBe(TEST_UID);
      expect(remote.archiveReason).toBe("Project scope postponed indefinitely");
      expect(remote.revision).toBe(2);

      const local = await getLocalDraft(inspectionId);
      expect(local?.isArchived).toBe(true);
      expect(local?.isSynced).toBe(true);
    });

    it("idempotently acknowledges repeated ARCHIVE_INSPECTION when already archived", async () => {
      const inspectionId = "insp-archive-idempotent";
      mockRemoteDocStore.set(`users/${TEST_UID}/inspections/${inspectionId}`, {
        id: inspectionId,
        ownerUid: TEST_UID,
        projectId: "proj-1",
        projectName: "Project 1",
        title: "Already Archived",
        observation: "Obs",
        category: "surface_condition",
        isArchived: true,
        archivedAt: 1500,
        archivedByUid: TEST_UID,
        revision: 2,
        appliedMutationIds: [],
        createdAt: 1000,
        updatedAt: 1500,
      });

      const mutation = await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: inspectionId,
        type: "ARCHIVE_INSPECTION",
        payload: {
          type: "ARCHIVE_INSPECTION",
          reason: "Repeated archive",
        },
        baseRevision: 2,
      });

      const res = await replayQueuedMutations({ lockCoordinator: createMockLockCoordinator(true) });
      expect(res.status).toBe("SUCCESS");
      expect(res.succeededCount).toBe(1);

      const mut = await getMutationById(TEST_UID, mutation.id);
      expect(mut?.status).toBe("succeeded");
    });

    it("successfully replays UNARCHIVE_INSPECTION: restores to active and clears archival metadata", async () => {
      const inspectionId = "insp-unarchive-success";
      mockRemoteDocStore.set(`users/${TEST_UID}/inspections/${inspectionId}`, {
        id: inspectionId,
        ownerUid: TEST_UID,
        projectId: "proj-1",
        projectName: "Project 1",
        title: "Archived Inspection to Restore",
        observation: "Obs",
        category: "surface_condition",
        isArchived: true,
        archivedAt: 1500,
        archivedByUid: TEST_UID,
        archiveReason: "Old reason",
        revision: 2,
        appliedMutationIds: [],
        createdAt: 1000,
        updatedAt: 1500,
      });

      await saveLocalDraft({
        id: inspectionId,
        ownerUid: TEST_UID,
        projectId: "proj-1",
        title: "Archived Inspection to Restore",
        observation: "Obs",
        category: "surface_condition",
        visibleEvidence: [],
        uncertainties: [],
        inspectorFollowUp: [],
        photoIds: [],
        isSynced: false,
        isArchived: true,
        lastSavedAt: 1500,
        createdAt: 1000,
      });

      await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: inspectionId,
        type: "UNARCHIVE_INSPECTION",
        payload: {
          type: "UNARCHIVE_INSPECTION",
          unarchivedAt: 3000,
        },
        baseRevision: 2,
      });

      const res = await replayQueuedMutations({ lockCoordinator: createMockLockCoordinator(true) });
      expect(res.status).toBe("SUCCESS");
      expect(res.succeededCount).toBe(1);

      const remote = mockRemoteDocStore.get(`users/${TEST_UID}/inspections/${inspectionId}`) as Record<string, unknown>;
      expect(remote.isArchived).toBe(false);
      expect(remote.archivedAt).toBeNull();
      expect(remote.archivedByUid).toBeNull();
      expect(remote.archiveReason).toBeNull();
      expect(remote.revision).toBe(3);

      const local = await getLocalDraft(inspectionId);
      expect(local?.isArchived).toBe(false);
      expect(local?.isSynced).toBe(true);
    });

    it("idempotently acknowledges UNARCHIVE_INSPECTION when already active", async () => {
      const inspectionId = "insp-unarchive-idempotent";
      mockRemoteDocStore.set(`users/${TEST_UID}/inspections/${inspectionId}`, {
        id: inspectionId,
        ownerUid: TEST_UID,
        projectId: "proj-1",
        projectName: "Project 1",
        title: "Already Active",
        observation: "Obs",
        category: "surface_condition",
        isArchived: false,
        revision: 1,
        appliedMutationIds: [],
        createdAt: 1000,
        updatedAt: 1000,
      });

      const mutation = await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: inspectionId,
        type: "UNARCHIVE_INSPECTION",
        payload: {
          type: "UNARCHIVE_INSPECTION",
        },
        baseRevision: 1,
      });

      const res = await replayQueuedMutations({ lockCoordinator: createMockLockCoordinator(true) });
      expect(res.status).toBe("SUCCESS");
      expect(res.succeededCount).toBe(1);

      const mut = await getMutationById(TEST_UID, mutation.id);
      expect(mut?.status).toBe("succeeded");
    });
  });

  // ==========================================================================
  // 11. DELETE_INSPECTION Mutation Replay
  // ==========================================================================
  describe("11. DELETE_INSPECTION Mutation Replay", () => {
    it("successfully replays DELETE_INSPECTION for eligible active unreviewed draft and deletes local draft", async () => {
      const inspectionId = "insp-delete-eligible";
      mockRemoteDocStore.set(`users/${TEST_UID}/inspections/${inspectionId}`, {
        id: inspectionId,
        ownerUid: TEST_UID,
        projectId: "proj-1",
        projectName: "Project 1",
        title: "Eligible Draft for Deletion",
        observation: "Obs",
        category: "surface_condition",
        reviewStatus: "draft_generated",
        reviewHistory: [],
        isArchived: false,
        revision: 1,
        appliedMutationIds: [],
        createdAt: 1000,
        updatedAt: 1000,
      });

      await saveLocalDraft({
        id: inspectionId,
        ownerUid: TEST_UID,
        projectId: "proj-1",
        title: "Eligible Draft",
        observation: "Obs",
        category: "surface_condition",
        visibleEvidence: [],
        uncertainties: [],
        inspectorFollowUp: [],
        photoIds: [],
        isSynced: true,
        reviewStatus: "draft_generated",
        reviewHistory: [],
        lastSavedAt: 1000,
        createdAt: 1000,
      });

      await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: inspectionId,
        type: "DELETE_INSPECTION",
        payload: {
          type: "DELETE_INSPECTION",
        },
        baseRevision: 1,
      });

      const res = await replayQueuedMutations({ lockCoordinator: createMockLockCoordinator(true) });
      expect(res.status).toBe("SUCCESS");
      expect(res.succeededCount).toBe(1);

      // Verify remote document deleted
      expect(mockRemoteDocStore.has(`users/${TEST_UID}/inspections/${inspectionId}`)).toBe(false);

      // Verify local draft deleted
      const local = await getLocalDraft(inspectionId);
      expect(local).toBeNull();
    });

    it("CRITICAL: verifies DELETE_INSPECTION NEVER deletes local photographic Blobs in evidencePhotos", async () => {
      const inspectionId = "insp-delete-photo-preservation";
      mockRemoteDocStore.set(`users/${TEST_UID}/inspections/${inspectionId}`, {
        id: inspectionId,
        ownerUid: TEST_UID,
        projectId: "proj-1",
        projectName: "Project 1",
        title: "Draft with Evidence Photos",
        observation: "Obs",
        category: "surface_condition",
        reviewStatus: "draft_generated",
        reviewHistory: [],
        isArchived: false,
        revision: 1,
        appliedMutationIds: [],
        createdAt: 1000,
        updatedAt: 1000,
      });

      // Store a photographic Blob in IndexedDB evidencePhotos
      const fakeBlob = new Blob(["fake photographic binary evidence"], { type: "image/jpeg" });
      await saveEvidencePhoto({
        id: "photo-evidence-preserve-1",
        inspectionId,
        projectId: "proj-1",
        blob: fakeBlob,
        fileName: "site-evidence.jpg",
        fileSizeBytes: fakeBlob.size,
        mimeType: "image/jpeg",
        capturedAt: 1000,
        createdAt: 1000,
      });

      // Verify photo exists in IndexedDB before deletion
      const beforePhotos = await getEvidencePhotosByInspection(inspectionId);
      expect(beforePhotos).toHaveLength(1);

      await saveLocalDraft({
        id: inspectionId,
        ownerUid: TEST_UID,
        projectId: "proj-1",
        title: "Draft with Evidence Photos",
        observation: "Obs",
        category: "surface_condition",
        visibleEvidence: [],
        uncertainties: [],
        inspectorFollowUp: [],
        photoIds: ["photo-evidence-preserve-1"],
        isSynced: true,
        reviewStatus: "draft_generated",
        reviewHistory: [],
        lastSavedAt: 1000,
        createdAt: 1000,
      });

      await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: inspectionId,
        type: "DELETE_INSPECTION",
        payload: {
          type: "DELETE_INSPECTION",
        },
        baseRevision: 1,
      });

      await replayQueuedMutations({ lockCoordinator: createMockLockCoordinator(true) });

      // Remote doc deleted
      expect(mockRemoteDocStore.has(`users/${TEST_UID}/inspections/${inspectionId}`)).toBe(false);
      // Local draft deleted
      const local = await getLocalDraft(inspectionId);
      expect(local).toBeNull();

      // INVARIANT CHECK: Photographic evidence Blobs in IndexedDB are NEVER deleted!
      const afterPhotos = await getEvidencePhotosByInspection(inspectionId);
      expect(afterPhotos).toHaveLength(1);
      expect(afterPhotos[0]?.id).toBe("photo-evidence-preserve-1");
      expect(afterPhotos[0]?.fileName).toBe("site-evidence.jpg");
    });

    it("rejects DELETE_INSPECTION with CONFLICT if inspection is approved", async () => {
      const inspectionId = "insp-delete-approved";
      mockRemoteDocStore.set(`users/${TEST_UID}/inspections/${inspectionId}`, {
        id: inspectionId,
        ownerUid: TEST_UID,
        projectId: "proj-1",
        projectName: "Project 1",
        title: "Approved Inspection",
        observation: "Obs",
        category: "surface_condition",
        reviewStatus: "approved",
        reviewHistory: [{ id: "rev-1", fromStatus: "in_review", toStatus: "approved", byUid: "approver", timestamp: 1000, revision: 2 }],
        isArchived: false,
        revision: 2,
        appliedMutationIds: [],
        createdAt: 1000,
        updatedAt: 1000,
      });

      const mutation = await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: inspectionId,
        type: "DELETE_INSPECTION",
        payload: {
          type: "DELETE_INSPECTION",
        },
        baseRevision: 2,
      });

      const res = await replayQueuedMutations({ lockCoordinator: createMockLockCoordinator(true) });
      expect(res.status).toBe("ERROR");
      expect(res.conflictCount).toBe(1);

      const mut = await getMutationById(TEST_UID, mutation.id);
      expect(mut?.status).toBe("conflict");
      expect(mut?.conflictReason).toContain("only active unreviewed drafts");

      // Verify remote doc remains intact
      expect(mockRemoteDocStore.has(`users/${TEST_UID}/inspections/${inspectionId}`)).toBe(true);
    });

    it("rejects DELETE_INSPECTION with CONFLICT if inspection has review history events", async () => {
      const inspectionId = "insp-delete-has-history";
      mockRemoteDocStore.set(`users/${TEST_UID}/inspections/${inspectionId}`, {
        id: inspectionId,
        ownerUid: TEST_UID,
        projectId: "proj-1",
        projectName: "Project 1",
        title: "Draft with Prior History",
        observation: "Obs",
        category: "surface_condition",
        reviewStatus: "draft_generated",
        reviewHistory: [{ id: "rev-old-1", fromStatus: "in_review", toStatus: "in_review", byUid: "admin", timestamp: 1000, revision: 2 }],
        isArchived: false,
        revision: 2,
        appliedMutationIds: [],
        createdAt: 1000,
        updatedAt: 1000,
      });

      const mutation = await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: inspectionId,
        type: "DELETE_INSPECTION",
        payload: {
          type: "DELETE_INSPECTION",
        },
        baseRevision: 2,
      });

      const res = await replayQueuedMutations({ lockCoordinator: createMockLockCoordinator(true) });
      expect(res.status).toBe("ERROR");
      expect(res.conflictCount).toBe(1);

      const mut = await getMutationById(TEST_UID, mutation.id);
      expect(mut?.status).toBe("conflict");
      expect(mut?.conflictReason).toContain("0 review history events");
    });

    it("rejects DELETE_INSPECTION with CONFLICT if inspection is archived", async () => {
      const inspectionId = "insp-delete-archived";
      mockRemoteDocStore.set(`users/${TEST_UID}/inspections/${inspectionId}`, {
        id: inspectionId,
        ownerUid: TEST_UID,
        projectId: "proj-1",
        projectName: "Project 1",
        title: "Archived Draft",
        observation: "Obs",
        category: "surface_condition",
        reviewStatus: "draft_generated",
        reviewHistory: [],
        isArchived: true,
        archivedAt: 1500,
        archivedByUid: TEST_UID,
        revision: 2,
        appliedMutationIds: [],
        createdAt: 1000,
        updatedAt: 1500,
      });

      const mutation = await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: inspectionId,
        type: "DELETE_INSPECTION",
        payload: {
          type: "DELETE_INSPECTION",
        },
        baseRevision: 2,
      });

      const res = await replayQueuedMutations({ lockCoordinator: createMockLockCoordinator(true) });
      expect(res.status).toBe("ERROR");
      expect(res.conflictCount).toBe(1);

      const mut = await getMutationById(TEST_UID, mutation.id);
      expect(mut?.status).toBe("conflict");
      expect(mut?.conflictReason).toContain("isArchived: true");
    });

    it("idempotently succeeds DELETE_INSPECTION when remote document does not exist", async () => {
      const inspectionId = "insp-delete-nonexistent";

      const mutation = await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: inspectionId,
        type: "DELETE_INSPECTION",
        payload: {
          type: "DELETE_INSPECTION",
        },
        baseRevision: 1,
      });

      const res = await replayQueuedMutations({ lockCoordinator: createMockLockCoordinator(true) });
      expect(res.status).toBe("SUCCESS");
      expect(res.succeededCount).toBe(1);

      const mut = await getMutationById(TEST_UID, mutation.id);
      expect(mut?.status).toBe("succeeded");
    });
  });

  // ==========================================================================
  // 12. Multi-Mutation FIFO Ordering & Conflict Blocking
  // ==========================================================================
  describe("12. Multi-Mutation FIFO Ordering & Conflict Blocking", () => {
    it("executes multi-mutation sequence on single inspection strictly in FIFO order (CREATE -> UPDATE -> REVIEW -> ARCHIVE)", async () => {
      const inspectionId = "insp-fifo-lifecycle";

      // 1. Enqueue CREATE
      await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: inspectionId,
        type: "CREATE_INSPECTION",
        payload: {
          type: "CREATE_INSPECTION",
          inspection: {
            id: inspectionId,
            projectId: "proj-1",
            projectName: "Project 1",
            title: "Original Title",
            observation: "Original Obs",
            category: "surface_condition",
            visibleEvidence: [],
            uncertainties: [],
            inspectorFollowUp: [],
            reviewStatus: "draft_generated",
            aiAssisted: false,
            createdAt: 1000,
            updatedAt: 1000,
          },
        },
        baseRevision: 1,
      });

      // 2. Enqueue UPDATE
      await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: inspectionId,
        type: "UPDATE_DRAFT",
        payload: {
          type: "UPDATE_DRAFT",
          title: "Edited Title",
          observation: "Edited Obs",
        },
        baseRevision: 1,
      });

      // 3. Enqueue REVIEW (draft_generated -> in_review)
      await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: inspectionId,
        type: "TRANSITION_REVIEW",
        payload: {
          type: "TRANSITION_REVIEW",
          fromStatus: "draft_generated",
          targetStatus: "in_review",
          reviewerUid: TEST_UID,
          comment: "Review started",
          auditEventId: "rev-evt-fifo-1",
        },
        baseRevision: 2,
      });

      // 4. Enqueue ARCHIVE
      await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: inspectionId,
        type: "ARCHIVE_INSPECTION",
        payload: {
          type: "ARCHIVE_INSPECTION",
          reason: "Completed lifecycle",
          archivedAt: 2000,
        },
        baseRevision: 3,
      });

      const res = await replayQueuedMutations({ lockCoordinator: createMockLockCoordinator(true) });
      expect(res.status).toBe("SUCCESS");
      expect(res.processedCount).toBe(4);
      expect(res.succeededCount).toBe(4);

      // Verify remote document matches final state
      const remote = mockRemoteDocStore.get(`users/${TEST_UID}/inspections/${inspectionId}`) as Record<string, unknown>;
      expect(remote.title).toBe("Edited Title");
      expect(remote.observation).toBe("Edited Obs");
      expect(remote.reviewStatus).toBe("in_review");
      expect(remote.isArchived).toBe(true);
      expect(remote.archiveReason).toBe("Completed lifecycle");
    });

    it("when a mutation on an inspection transitions to CONFLICT, subsequent mutations on the same inspection are paused to maintain FIFO", async () => {
      const inspectionId = "insp-fifo-block";
      mockRemoteDocStore.set(`users/${TEST_UID}/inspections/${inspectionId}`, {
        id: inspectionId,
        ownerUid: TEST_UID,
        projectId: "proj-1",
        projectName: "Project 1",
        title: "Existing Title",
        observation: "Obs",
        category: "surface_condition",
        reviewStatus: "approved", // already approved!
        reviewHistory: [],
        revision: 2,
        appliedMutationIds: [],
        createdAt: 1000,
        updatedAt: 1000,
      });

      // Mutation 1: UPDATE_DRAFT will conflict because doc is approved
      const mut1 = await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: inspectionId,
        type: "UPDATE_DRAFT",
        payload: {
          type: "UPDATE_DRAFT",
          title: "Conflicting Update",
        },
        baseRevision: 2,
      });

      // Mutation 2: ARCHIVE_INSPECTION follows on same inspection
      const mut2 = await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: inspectionId,
        type: "ARCHIVE_INSPECTION",
        payload: {
          type: "ARCHIVE_INSPECTION",
          reason: "Archive after edit",
        },
        baseRevision: 3,
      });

      const res = await replayQueuedMutations({ lockCoordinator: createMockLockCoordinator(true) });
      expect(res.status).toBe("ERROR");
      expect(res.conflictCount).toBe(1);

      // Mutation 1 is conflict
      const checked1 = await getMutationById(TEST_UID, mut1.id);
      expect(checked1?.status).toBe("conflict");

      // Mutation 2 must remain queued (NOT processed out of order!)
      const checked2 = await getMutationById(TEST_UID, mut2.id);
      expect(checked2?.status).toBe("queued");
    });

    it("failure or conflict on inspection A does NOT block replay of independent inspection B", async () => {
      const inspA = "insp-independent-a";
      const inspB = "insp-independent-b";

      // Seed inspB as an active inspection
      mockRemoteDocStore.set(`users/${TEST_UID}/inspections/${inspB}`, {
        id: inspB,
        ownerUid: TEST_UID,
        projectId: "proj-1",
        projectName: "Project 1",
        title: "B Initial",
        observation: "Obs B",
        category: "surface_condition",
        reviewStatus: "draft_generated",
        reviewHistory: [],
        revision: 1,
        appliedMutationIds: [],
        createdAt: 1000,
        updatedAt: 1000,
      });

      // Mutation on inspA (nonexistent -> conflict)
      const mutA = await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: inspA,
        type: "UPDATE_DRAFT",
        payload: {
          type: "UPDATE_DRAFT",
          title: "A Nonexistent",
        },
        baseRevision: 1,
      });

      // Mutation on inspB (valid update)
      const mutB = await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: inspB,
        type: "UPDATE_DRAFT",
        payload: {
          type: "UPDATE_DRAFT",
          title: "B Successfully Updated",
        },
        baseRevision: 1,
      });

      const res = await replayQueuedMutations({ lockCoordinator: createMockLockCoordinator(true) });
      // Partial success because mutA conflicted and mutB succeeded
      expect(res.status).toBe("PARTIAL_SUCCESS");
      expect(res.conflictCount).toBe(1);
      expect(res.succeededCount).toBe(1);

      const checkedA = await getMutationById(TEST_UID, mutA.id);
      expect(checkedA?.status).toBe("conflict");

      const checkedB = await getMutationById(TEST_UID, mutB.id);
      expect(checkedB?.status).toBe("succeeded");

      const remoteB = mockRemoteDocStore.get(`users/${TEST_UID}/inspections/${inspB}`) as Record<string, unknown>;
      expect(remoteB.title).toBe("B Successfully Updated");
    });
  });

  // ==========================================================================
  // 14. ForeSite Phase 5 Stage 4A: Three-Way Merge Replay Integration Tests
  // ==========================================================================
  describe("14. Stage 4A: Three-Way Merge Replay Integration", () => {
    it("successfully executes 3-way merge on UPDATE_DRAFT when remote revision advanced without conflicts", async () => {
      const inspectionId = "insp-merge-clean";
      const baseRev = 1;

      const baseSnapshot: Inspection = {
        id: inspectionId,
        ownerUid: TEST_UID,
        projectId: "proj-merge",
        projectName: "Merge Project",
        title: "Original Title",
        observation: "Original Observation",
        category: "surface_condition",
        visibleEvidence: ["Evidence A"],
        uncertainties: ["Uncertainty A"],
        inspectorFollowUp: ["Follow Up A"],
        photoIds: ["p1", "p2"],
        reviewStatus: "draft_generated",
        revision: baseRev,
        createdAt: 1000,
        updatedAt: 1000,
        appliedMutationIds: ["mut-create"],
        aiAssisted: false,
      };

      // Remote has advanced to revision 2 with non-conflicting changes (observation & photoIds updated)
      mockRemoteDocStore.set(`users/${TEST_UID}/inspections/${inspectionId}`, {
        ...baseSnapshot,
        observation: "Remote Observation Updated",
        summary: "Remote Added Summary",
        photoIds: ["p1", "p2", "p-remote-3"],
        revision: 2,
        updatedAt: 2000,
      });

      // Save local draft in IndexedDB
      await saveLocalDraft({
        ...baseSnapshot,
        title: "Local Title Updated",
        photoIds: ["p1", "p2", "p-local-4"],
        isSynced: false,
        lastSavedAt: 2500,
      });

      // Enqueue UPDATE_DRAFT with local changes and baseSnapshot
      const mutation = await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: inspectionId,
        type: "UPDATE_DRAFT",
        payload: {
          type: "UPDATE_DRAFT",
          title: "Local Title Updated",
          photoIds: ["p1", "p2", "p-local-4"],
          baseSnapshot,
        },
        baseRevision: baseRev,
      });

      const res = await replayQueuedMutations({ lockCoordinator: createMockLockCoordinator(true) });
      expect(res.status).toBe("SUCCESS");
      expect(res.succeededCount).toBe(1);
      expect(res.conflictCount).toBe(0);

      const mut = await getMutationById(TEST_UID, mutation.id);
      expect(mut?.status).toBe("succeeded");

      // Verify remote document has merged values
      const remote = mockRemoteDocStore.get(`users/${TEST_UID}/inspections/${inspectionId}`) as unknown as Inspection;
      expect(remote.title).toBe("Local Title Updated"); // from local
      expect(remote.observation).toBe("Remote Observation Updated"); // from remote
      expect(remote.summary).toBe("Remote Added Summary"); // from remote
      expect(remote.photoIds).toEqual(["p1", "p2", "p-remote-3", "p-local-4"]); // merged set-difference
      expect(remote.revision).toBe(3); // incremented from remote revision 2

      // Verify local draft in IndexedDB was updated with merged result and isSynced: true
      const localDraft = await getLocalDraft(inspectionId);
      expect(localDraft?.isSynced).toBe(true);
      expect(localDraft?.title).toBe("Local Title Updated");
      expect(localDraft?.observation).toBe("Remote Observation Updated");
      expect(localDraft?.summary).toBe("Remote Added Summary");
      expect(localDraft?.photoIds).toEqual(["p1", "p2", "p-remote-3", "p-local-4"]);
      expect(localDraft?.revision).toBe(3);
    });

    it("transitions UPDATE_DRAFT to conflict when 3-way merge detects conflicting scalar field edits", async () => {
      const inspectionId = "insp-merge-conflict-scalar";
      const baseRev = 1;

      const baseSnapshot: Inspection = {
        id: inspectionId,
        ownerUid: TEST_UID,
        projectId: "proj-1",
        projectName: "Project 1",
        title: "Base Headline",
        observation: "Base Obs",
        category: "surface_condition",
        visibleEvidence: [],
        uncertainties: [],
        inspectorFollowUp: [],
        photoIds: [],
        reviewStatus: "draft_generated",
        revision: baseRev,
        createdAt: 1000,
        updatedAt: 1000,
        appliedMutationIds: [],
        aiAssisted: false,
      };

      // Remote changed title to "Remote Headline" at revision 2
      mockRemoteDocStore.set(`users/${TEST_UID}/inspections/${inspectionId}`, {
        ...baseSnapshot,
        title: "Remote Headline",
        revision: 2,
        updatedAt: 2000,
      });

      // Local changed title to "Local Headline"
      const mutation = await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: inspectionId,
        type: "UPDATE_DRAFT",
        payload: {
          type: "UPDATE_DRAFT",
          title: "Local Headline",
          baseSnapshot,
        },
        baseRevision: baseRev,
      });

      const res = await replayQueuedMutations({ lockCoordinator: createMockLockCoordinator(true) });
      expect(res.status).toBe("ERROR");
      expect(res.conflictCount).toBe(1);

      const mut = await getMutationById(TEST_UID, mutation.id);
      expect(mut?.status).toBe("conflict");
      expect(mut?.conflictReason).toContain("Field conflict detected during three-way merge: title");

      // Verify remote document was NOT overwritten
      const remote = mockRemoteDocStore.get(`users/${TEST_UID}/inspections/${inspectionId}`) as unknown as Inspection;
      expect(remote.title).toBe("Remote Headline");
      expect(remote.revision).toBe(2);
    });

    it("transitions UPDATE_DRAFT to conflict when 3-way merge detects checklist item conflict", async () => {
      const inspectionId = "insp-merge-checklist-conflict";
      const baseRev = 1;

      const baseSnapshot: Inspection = {
        id: inspectionId,
        ownerUid: TEST_UID,
        projectId: "proj-1",
        projectName: "Project 1",
        title: "Checklist Test",
        observation: "Obs",
        category: "surface_condition",
        items: [{ id: "item-fuse", status: "pass", notes: "Original Note" }],
        visibleEvidence: [],
        uncertainties: [],
        inspectorFollowUp: [],
        photoIds: [],
        reviewStatus: "draft_generated",
        revision: baseRev,
        createdAt: 1000,
        updatedAt: 1000,
        appliedMutationIds: [],
        aiAssisted: false,
      };

      // Remote changed item status to "fail"
      mockRemoteDocStore.set(`users/${TEST_UID}/inspections/${inspectionId}`, {
        ...baseSnapshot,
        items: [{ id: "item-fuse", status: "fail", notes: "Original Note" }],
        revision: 2,
        updatedAt: 2000,
      });

      // Local changed item status to "na"
      const mutation = await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: inspectionId,
        type: "UPDATE_DRAFT",
        payload: {
          type: "UPDATE_DRAFT",
          items: [{ id: "item-fuse", status: "na", notes: "Original Note" }],
          baseSnapshot,
        },
        baseRevision: baseRev,
      });

      const res = await replayQueuedMutations({ lockCoordinator: createMockLockCoordinator(true) });
      expect(res.status).toBe("ERROR");
      expect(res.conflictCount).toBe(1);

      const mut = await getMutationById(TEST_UID, mutation.id);
      expect(mut?.status).toBe("conflict");
      expect(mut?.conflictReason).toContain("Field conflict detected during three-way merge: items");
    });

    it("transitions TRANSITION_REVIEW to conflict with CONCURRENT_HUMAN_CONFLICT on opposing human decisions (in_review -> approved vs remote rejected)", async () => {
      const inspectionId = "insp-human-conflict";

      // Remote is currently rejected
      mockRemoteDocStore.set(`users/${TEST_UID}/inspections/${inspectionId}`, {
        id: inspectionId,
        ownerUid: TEST_UID,
        projectId: "proj-1",
        projectName: "Project 1",
        title: "Human Conflict",
        observation: "Obs",
        category: "surface_condition",
        reviewStatus: "rejected",
        reviewHistory: [
          { id: "rev-1", fromStatus: "in_review", toStatus: "rejected", byUid: "remote-lead", timestamp: 1500, revision: 2 },
        ],
        revision: 2,
        appliedMutationIds: [],
        createdAt: 1000,
        updatedAt: 1500,
      });

      // Local inspector attempted to approve from in_review
      const mutation = await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: inspectionId,
        type: "TRANSITION_REVIEW",
        payload: {
          type: "TRANSITION_REVIEW",
          fromStatus: "in_review",
          targetStatus: "approved",
          reviewerUid: TEST_UID,
          auditEventId: "rev-evt-approve-conflict",
        },
        baseRevision: 1,
      });

      const res = await replayQueuedMutations({ lockCoordinator: createMockLockCoordinator(true) });
      expect(res.status).toBe("ERROR");
      expect(res.conflictCount).toBe(1);

      const mut = await getMutationById(TEST_UID, mutation.id);
      expect(mut?.status).toBe("conflict");
      expect(mut?.conflictReason).toContain("CONCURRENT_HUMAN_CONFLICT");
      expect(mut?.conflictReason).toContain("Opposing human decisions");

      // Verify remote status was NOT overwritten
      const remote = mockRemoteDocStore.get(`users/${TEST_UID}/inspections/${inspectionId}`) as unknown as Inspection;
      expect(remote.reviewStatus).toBe("rejected");
    });

    it("blocks downstream mutations on the same inspection when 3-way merge conflict occurs, while unrelated inspection succeeds", async () => {
      const inspConflict = "insp-blocked-downstream";
      const inspClean = "insp-clean-unrelated";

      // Setup remote for inspConflict at revision 2
      mockRemoteDocStore.set(`users/${TEST_UID}/inspections/${inspConflict}`, {
        id: inspConflict,
        ownerUid: TEST_UID,
        projectId: "proj-1",
        projectName: "Project 1",
        title: "Remote Divergent Title",
        observation: "Obs",
        category: "surface_condition",
        reviewStatus: "draft_generated",
        revision: 2,
        appliedMutationIds: [],
        createdAt: 1000,
        updatedAt: 1000,
      });

      // Setup remote for inspClean at revision 1
      mockRemoteDocStore.set(`users/${TEST_UID}/inspections/${inspClean}`, {
        id: inspClean,
        ownerUid: TEST_UID,
        projectId: "proj-1",
        projectName: "Project 1",
        title: "Clean Inspection",
        observation: "Obs",
        category: "structural",
        reviewStatus: "draft_generated",
        revision: 1,
        appliedMutationIds: [],
        createdAt: 1000,
        updatedAt: 1000,
      });

      // Conflicting mutation 1 on inspConflict
      const mut1 = await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: inspConflict,
        type: "UPDATE_DRAFT",
        payload: {
          type: "UPDATE_DRAFT",
          title: "Local Divergent Title",
          baseSnapshot: {
            id: inspConflict,
            title: "Base Title",
            observation: "Obs",
            category: "surface_condition",
            reviewStatus: "draft_generated",
            revision: 1,
          },
        },
        baseRevision: 1,
      });

      // Downstream mutation 2 on inspConflict
      const mut2 = await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: inspConflict,
        type: "UPDATE_DRAFT",
        payload: {
          type: "UPDATE_DRAFT",
          observation: "Follow up update",
        },
        baseRevision: 1,
      });

      // Mutation on clean inspection
      const mutClean = await enqueueMutation({
        ownerUid: TEST_UID,
        targetInspectionId: inspClean,
        type: "UPDATE_DRAFT",
        payload: {
          type: "UPDATE_DRAFT",
          title: "Clean Inspection Updated",
        },
        baseRevision: 1,
      });

      const res = await replayQueuedMutations({ lockCoordinator: createMockLockCoordinator(true) });
      expect(res.status).toBe("PARTIAL_SUCCESS");
      expect(res.conflictCount).toBe(1);
      expect(res.succeededCount).toBe(1);

      const check1 = await getMutationById(TEST_UID, mut1.id);
      expect(check1?.status).toBe("conflict");

      // Downstream mutation remains queued and blocked (not processed out of order)
      const check2 = await getMutationById(TEST_UID, mut2.id);
      expect(check2?.status).toBe("queued");

      const checkClean = await getMutationById(TEST_UID, mutClean.id);
      expect(checkClean?.status).toBe("succeeded");
    });
  });
});
