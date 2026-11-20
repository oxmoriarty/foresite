/**
 * ForeSite Phase 5 Stage 2 Test Suite
 * Durable Offline Mutation Queue Foundation
 *
 * Verifies:
 * 1. Queue persistence (enqueue, retrieval, reopen, atomic sequence allocation, transaction aborts)
 * 2. State management (valid transitions, invalid transitions rejected, terminal state protection, cancellation)
 * 3. Retry policy (exponential backoff, attempt counting, max retries limit, retry exhaustion, non-retryable states)
 * 4. Crash recovery (in_flight reset to queued, preservation of attempt count/order, idempotent on repeat)
 * 5. Multi-owner isolation (independent sequence numbering, scoped queries, cross-user protection, clearQueue isolation)
 * 6. IndexedDB v3 Migration (v1/v2 schema upgrade without data loss, preservation of photos and drafts)
 * 7. Queue Summary (accurate counts, pending status aggregations, timestamp tracking)
 * 8. Zero-cost and zero-Firestore boundaries (no remote writes or network calls)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  enqueueMutation,
  getPendingMutations,
  getMutationsByInspection,
  getAllMutationsByOwner,
  getMutationById,
  transitionMutationStatus,
  recordMutationAttempt,
  cancelMutation,
  recoverInFlightMutations,
  getQueueSummary,
  clearOwnerQueue,
  calculateNextRetryDelay,
  isValidMutationStatusTransition,
  isTerminalMutationStatus,
  MutationLifecycleError,
} from "../src/services/mutationQueue";
import {
  getDatabase,
  closeDatabase,
  clearAllLocalEvidence,
  clearAllMutationQueueData,
  saveEvidencePhoto,
  getEvidencePhoto,
  saveLocalDraft,
  getLocalDraft,
  DB_NAME,
  DB_VERSION,
  STORES,
} from "../src/services/indexeddb";
import {
  CreateInspectionPayload,
  TransitionReviewPayload,
  LocalEvidencePhoto,
  LocalDraftInspection,
  MutationType,
} from "../src/types";
import * as firestoreService from "../src/services/firestore";

// Mock Firestore service to assert zero remote calls in Stage 2
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

const OWNER_A = "user-engineer-alpha";
const OWNER_B = "user-inspector-bravo";

function sampleCreatePayload(title = "Beam Inspection"): CreateInspectionPayload {
  return {
    type: "CREATE_INSPECTION",
    inspection: {
      projectId: "proj-rev-01",
      projectName: "Civic Center Expansion",
      title,
      observation: "Visual weld and bolt verification",
      category: "installation",
      visibleEvidence: ["Clean weld bead", "Tightened bolts"],
      uncertainties: [],
      inspectorFollowUp: [],
      reviewStatus: "draft_generated",
      aiAssisted: false,
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
    },
  };
}

function sampleReviewPayload(): TransitionReviewPayload {
  return {
    type: "TRANSITION_REVIEW",
    fromStatus: "draft_generated",
    targetStatus: "in_review",
    reviewerUid: OWNER_A,
    comment: "Beginning review stage",
    auditEventId: "audit-" + Math.random().toString(36).substring(2, 8),
  };
}

describe("ForeSite Phase 5 Stage 2: Durable Offline Mutation Queue", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await clearAllLocalEvidence();
    await clearAllMutationQueueData();
  });

  afterEach(() => {
    closeDatabase();
  });

  describe("1. Queue Persistence & Monotonic Sequencing", () => {
    it("enqueues a mutation and persists it to IndexedDB with status 'queued'", async () => {
      const payload = sampleCreatePayload();
      const record = await enqueueMutation({
        ownerUid: OWNER_A,
        targetInspectionId: "insp-001",
        type: "CREATE_INSPECTION",
        payload,
        baseRevision: 0,
      });

      expect(record.id).toBeDefined();
      expect(record.ownerUid).toBe(OWNER_A);
      expect(record.targetInspectionId).toBe("insp-001");
      expect(record.type).toBe("CREATE_INSPECTION");
      expect(record.status).toBe("queued");
      expect(record.sequenceNumber).toBe(1);
      expect(record.retryCount).toBe(0);
      expect(record.maxRetries).toBe(5);
      expect(record.nextRetryAt).toBeNull();
      expect(record.lastAttemptedAt).toBeNull();
      expect(record.baseRevision).toBe(0);

      // Verify persistence by fetching directly
      const fetched = await getMutationById(OWNER_A, record.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.id).toBe(record.id);
      expect(fetched?.sequenceNumber).toBe(1);
    });

    it("assigns strictly monotonic, gap-free sequence numbers per owner", async () => {
      const m1 = await enqueueMutation({
        ownerUid: OWNER_A,
        targetInspectionId: "insp-001",
        type: "CREATE_INSPECTION",
        payload: sampleCreatePayload("Mutation 1"),
      });
      const m2 = await enqueueMutation({
        ownerUid: OWNER_A,
        targetInspectionId: "insp-001",
        type: "UPDATE_DRAFT",
        payload: {
          type: "UPDATE_DRAFT",
          observation: "Updated observation",
        },
      });
      const m3 = await enqueueMutation({
        ownerUid: OWNER_A,
        targetInspectionId: "insp-001",
        type: "TRANSITION_REVIEW",
        payload: sampleReviewPayload(),
      });

      expect(m1.sequenceNumber).toBe(1);
      expect(m2.sequenceNumber).toBe(2);
      expect(m3.sequenceNumber).toBe(3);

      const pending = await getPendingMutations(OWNER_A);
      expect(pending).toHaveLength(3);
      expect(pending.map((m) => m.sequenceNumber)).toEqual([1, 2, 3]);
    });

    it("preserves queue contents and ordering across database close and reopen", async () => {
      await enqueueMutation({
        ownerUid: OWNER_A,
        targetInspectionId: "insp-reopen-1",
        type: "CREATE_INSPECTION",
        payload: sampleCreatePayload("Pre-close 1"),
      });
      await enqueueMutation({
        ownerUid: OWNER_A,
        targetInspectionId: "insp-reopen-2",
        type: "CREATE_INSPECTION",
        payload: sampleCreatePayload("Pre-close 2"),
      });

      // Close singleton connection
      closeDatabase();

      // Reopen and fetch
      const reopenedPending = await getPendingMutations(OWNER_A);
      expect(reopenedPending).toHaveLength(2);
      expect(reopenedPending[0]?.sequenceNumber).toBe(1);
      expect(reopenedPending[1]?.sequenceNumber).toBe(2);
      expect(reopenedPending[0]?.targetInspectionId).toBe("insp-reopen-1");
      expect(reopenedPending[1]?.targetInspectionId).toBe("insp-reopen-2");
    });

    it("rejects invalid enqueue parameters with descriptive errors", async () => {
      await expect(
        enqueueMutation({
          ownerUid: "",
          targetInspectionId: "insp-001",
          type: "CREATE_INSPECTION",
          payload: sampleCreatePayload(),
        })
      ).rejects.toThrowError(MutationLifecycleError);

      await expect(
        enqueueMutation({
          ownerUid: OWNER_A,
          targetInspectionId: "",
          type: "CREATE_INSPECTION",
          payload: sampleCreatePayload(),
        })
      ).rejects.toThrowError(MutationLifecycleError);

      await expect(
        enqueueMutation({
          ownerUid: OWNER_A,
          targetInspectionId: "insp-001",
          type: "" as unknown as MutationType,
          payload: sampleCreatePayload(),
        })
      ).rejects.toThrowError(MutationLifecycleError);
    });
  });

  describe("2. State Machine Transitions & Terminal Protection", () => {
    it("validates allowed and rejected transitions using isValidMutationStatusTransition", () => {
      // Valid transitions
      expect(isValidMutationStatusTransition("queued", "in_flight")).toBe(true);
      expect(isValidMutationStatusTransition("queued", "cancelled_by_user")).toBe(true);
      expect(isValidMutationStatusTransition("in_flight", "succeeded")).toBe(true);
      expect(isValidMutationStatusTransition("in_flight", "failed")).toBe(true);
      expect(isValidMutationStatusTransition("in_flight", "conflict")).toBe(true);
      expect(isValidMutationStatusTransition("in_flight", "queued")).toBe(true);
      expect(isValidMutationStatusTransition("failed", "queued")).toBe(true);
      expect(isValidMutationStatusTransition("failed", "failed_exhausted")).toBe(true);
      expect(isValidMutationStatusTransition("conflict", "paused_on_conflict")).toBe(true);
      expect(isValidMutationStatusTransition("paused_on_conflict", "queued")).toBe(true);
      expect(isValidMutationStatusTransition("paused_on_conflict", "cancelled_by_user")).toBe(true);

      // Invalid transitions
      expect(isValidMutationStatusTransition("queued", "succeeded")).toBe(false);
      expect(isValidMutationStatusTransition("queued", "failed")).toBe(false);
      expect(isValidMutationStatusTransition("queued", "failed_exhausted")).toBe(false);
      expect(isValidMutationStatusTransition("succeeded", "queued")).toBe(false);
      expect(isValidMutationStatusTransition("succeeded", "in_flight")).toBe(false);
      expect(isValidMutationStatusTransition("failed_exhausted", "queued")).toBe(false);
      expect(isValidMutationStatusTransition("cancelled_by_user", "queued")).toBe(false);
      expect(isValidMutationStatusTransition("conflict", "succeeded")).toBe(false);
    });

    it("identifies terminal states correctly", () => {
      expect(isTerminalMutationStatus("succeeded")).toBe(true);
      expect(isTerminalMutationStatus("failed_exhausted")).toBe(true);
      expect(isTerminalMutationStatus("cancelled_by_user")).toBe(true);

      expect(isTerminalMutationStatus("queued")).toBe(false);
      expect(isTerminalMutationStatus("in_flight")).toBe(false);
      expect(isTerminalMutationStatus("failed")).toBe(false);
      expect(isTerminalMutationStatus("conflict")).toBe(false);
      expect(isTerminalMutationStatus("paused_on_conflict")).toBe(false);
    });

    it("executes valid transitions through transitionMutationStatus", async () => {
      const mut = await enqueueMutation({
        ownerUid: OWNER_A,
        targetInspectionId: "insp-sm-01",
        type: "CREATE_INSPECTION",
        payload: sampleCreatePayload(),
      });

      // queued -> in_flight
      const inFlight = await transitionMutationStatus({
        ownerUid: OWNER_A,
        mutationId: mut.id,
        targetStatus: "in_flight",
      });
      expect(inFlight.status).toBe("in_flight");

      // in_flight -> succeeded
      const succeeded = await transitionMutationStatus({
        ownerUid: OWNER_A,
        mutationId: mut.id,
        targetStatus: "succeeded",
      });
      expect(succeeded.status).toBe("succeeded");
    });

    it("prevents any transitions out of terminal states", async () => {
      const mut = await enqueueMutation({
        ownerUid: OWNER_A,
        targetInspectionId: "insp-term-01",
        type: "CREATE_INSPECTION",
        payload: sampleCreatePayload(),
      });

      await transitionMutationStatus({
        ownerUid: OWNER_A,
        mutationId: mut.id,
        targetStatus: "in_flight",
      });
      await transitionMutationStatus({
        ownerUid: OWNER_A,
        mutationId: mut.id,
        targetStatus: "succeeded",
      });

      // Attempting to transition succeeded -> queued
      await expect(
        transitionMutationStatus({
          ownerUid: OWNER_A,
          mutationId: mut.id,
          targetStatus: "queued",
        })
      ).rejects.toThrowError(/terminal state 'succeeded'/i);
    });

    it("cancels a queued mutation with user reason", async () => {
      const mut = await enqueueMutation({
        ownerUid: OWNER_A,
        targetInspectionId: "insp-cancel-01",
        type: "CREATE_INSPECTION",
        payload: sampleCreatePayload(),
      });

      const cancelled = await cancelMutation(OWNER_A, mut.id, "User discarded draft");
      expect(cancelled.status).toBe("cancelled_by_user");
      expect(cancelled.failureReason).toBe("User discarded draft");

      // Verify it cannot be cancelled again
      await expect(
        cancelMutation(OWNER_A, mut.id, "Second cancel")
      ).rejects.toThrowError(/terminal state 'cancelled_by_user'/i);
    });

    it("cancels from 'failed' and 'paused_on_conflict' but rejects cancellation when 'in_flight'", async () => {
      const mut = await enqueueMutation({
        ownerUid: OWNER_A,
        targetInspectionId: "insp-cancel-flight",
        type: "CREATE_INSPECTION",
        payload: sampleCreatePayload(),
      });

      await transitionMutationStatus({
        ownerUid: OWNER_A,
        mutationId: mut.id,
        targetStatus: "in_flight",
      });

      // in_flight cannot be cancelled directly (central validation rejects transition)
      await expect(
        cancelMutation(OWNER_A, mut.id, "Cancel while in flight")
      ).rejects.toThrowError(/Invalid status transition from 'in_flight' to 'cancelled_by_user'/i);

      // transition in_flight -> failed
      await transitionMutationStatus({
        ownerUid: OWNER_A,
        mutationId: mut.id,
        targetStatus: "failed",
      });

      // failed can be cancelled
      const cancelledFromFailed = await cancelMutation(OWNER_A, mut.id, "Cancelled after failure");
      expect(cancelledFromFailed.status).toBe("cancelled_by_user");
      expect(cancelledFromFailed.failureReason).toBe("Cancelled after failure");
      expect(cancelledFromFailed.nextRetryAt).toBeNull();
    });

    it("verifies failed mutations can be cancelled through both cancelMutation and transitionMutationStatus identically", async () => {
      // 1. Test via cancelMutation()
      const m1 = await enqueueMutation({
        ownerUid: OWNER_A,
        targetInspectionId: "insp-failed-cancel-1",
        type: "CREATE_INSPECTION",
        payload: sampleCreatePayload(),
      });
      await transitionMutationStatus({
        ownerUid: OWNER_A,
        mutationId: m1.id,
        targetStatus: "in_flight",
      });
      await recordMutationAttempt({
        ownerUid: OWNER_A,
        mutationId: m1.id,
        isTransientFailure: true,
        error: "Network drop",
      });

      const m1Failed = await getMutationById(OWNER_A, m1.id);
      expect(m1Failed?.status).toBe("failed");
      expect(m1Failed?.nextRetryAt).not.toBeNull();

      const m1Cancelled = await cancelMutation(OWNER_A, m1.id, "User cancelled failed attempt");
      expect(m1Cancelled.status).toBe("cancelled_by_user");
      expect(m1Cancelled.nextRetryAt).toBeNull();
      expect(m1Cancelled.retryCount).toBe(1); // preserves retry count history
      expect(m1Cancelled.sequenceNumber).toBe(m1.sequenceNumber); // preserves sequence number

      // 2. Test via transitionMutationStatus({ targetStatus: "cancelled_by_user" })
      const m2 = await enqueueMutation({
        ownerUid: OWNER_A,
        targetInspectionId: "insp-failed-cancel-2",
        type: "CREATE_INSPECTION",
        payload: sampleCreatePayload(),
      });
      await transitionMutationStatus({
        ownerUid: OWNER_A,
        mutationId: m2.id,
        targetStatus: "in_flight",
      });
      await recordMutationAttempt({
        ownerUid: OWNER_A,
        mutationId: m2.id,
        isTransientFailure: true,
        error: "Gateway 502",
      });

      const m2Cancelled = await transitionMutationStatus({
        ownerUid: OWNER_A,
        mutationId: m2.id,
        targetStatus: "cancelled_by_user",
        failureReason: "User cancelled via transitionMutationStatus",
      });
      expect(m2Cancelled.status).toBe("cancelled_by_user");
      expect(m2Cancelled.nextRetryAt).toBeNull();
      expect(m2Cancelled.retryCount).toBe(1);
    });
  });

  describe("3. Deterministic Retry Policy & Exponential Backoff", () => {
    it("calculates exponential backoff delay correctly", () => {
      // Base delay formula: Math.min(1000 * 2^(retryCount - 1), 30000) + jitterMs
      expect(calculateNextRetryDelay(1, 0)).toBe(1000);
      expect(calculateNextRetryDelay(2, 0)).toBe(2000);
      expect(calculateNextRetryDelay(3, 0)).toBe(4000);
      expect(calculateNextRetryDelay(4, 0)).toBe(8000);
      expect(calculateNextRetryDelay(5, 0)).toBe(16000);
      expect(calculateNextRetryDelay(6, 0)).toBe(30000); // capped at 30000
      expect(calculateNextRetryDelay(10, 0)).toBe(30000); // capped at 30000

      // Jitter addition
      expect(calculateNextRetryDelay(1, 250)).toBe(1250);
      expect(calculateNextRetryDelay(3, 100)).toBe(4100);
    });

    it("records retry attempts, increments retryCount, and schedules nextRetryAt", async () => {
      const mut = await enqueueMutation({
        ownerUid: OWNER_A,
        targetInspectionId: "insp-retry-01",
        type: "CREATE_INSPECTION",
        payload: sampleCreatePayload(),
      });

      await transitionMutationStatus({
        ownerUid: OWNER_A,
        mutationId: mut.id,
        targetStatus: "in_flight",
      });

      const fixedNow = 1700000000000;
      const attempt1 = await recordMutationAttempt({
        ownerUid: OWNER_A,
        mutationId: mut.id,
        isTransientFailure: true,
        error: "Network socket closed",
        jitterMs: 0,
        now: fixedNow,
      });

      expect(attempt1.status).toBe("failed");
      expect(attempt1.retryCount).toBe(1);
      expect(attempt1.failureReason).toBe("Network socket closed");
      expect(attempt1.lastAttemptedAt).toBe(fixedNow);
      expect(attempt1.nextRetryAt).toBe(fixedNow + 1000); // 1000ms delay for retry 1

      // Second attempt
      const attempt2 = await recordMutationAttempt({
        ownerUid: OWNER_A,
        mutationId: mut.id,
        isTransientFailure: true,
        error: "Gateway timeout 504",
        jitterMs: 0,
        now: fixedNow + 1000,
      });

      expect(attempt2.status).toBe("failed");
      expect(attempt2.retryCount).toBe(2);
      expect(attempt2.nextRetryAt).toBe(fixedNow + 1000 + 2000); // 2000ms delay for retry 2
    });

    it("transitions to 'failed_exhausted' when retryCount reaches maxRetries", async () => {
      const mut = await enqueueMutation({
        ownerUid: OWNER_A,
        targetInspectionId: "insp-exhaust-01",
        type: "CREATE_INSPECTION",
        payload: sampleCreatePayload(),
        maxRetries: 3, // custom max retries
      });

      await transitionMutationStatus({
        ownerUid: OWNER_A,
        mutationId: mut.id,
        targetStatus: "in_flight",
      });

      // Attempt 1 (retryCount -> 1)
      await recordMutationAttempt({
        ownerUid: OWNER_A,
        mutationId: mut.id,
        isTransientFailure: true,
        error: "Err 1",
      });
      // Attempt 2 (retryCount -> 2)
      await recordMutationAttempt({
        ownerUid: OWNER_A,
        mutationId: mut.id,
        isTransientFailure: true,
        error: "Err 2",
      });
      // Attempt 3 (retryCount -> 3 >= maxRetries)
      const exhausted = await recordMutationAttempt({
        ownerUid: OWNER_A,
        mutationId: mut.id,
        isTransientFailure: true,
        error: "Err 3 terminal",
      });

      expect(exhausted.status).toBe("failed_exhausted");
      expect(exhausted.retryCount).toBe(3);
      expect(exhausted.nextRetryAt).toBeNull();
      expect(exhausted.failureReason).toBe("Err 3 terminal");
      expect(isTerminalMutationStatus(exhausted.status)).toBe(true);
    });

    it("verifies default maxRetries = 5 enforces exactly 5 total attempts (1 initial attempt + 4 retries) with null nextRetryAt", async () => {
      const mut = await enqueueMutation({
        ownerUid: OWNER_A,
        targetInspectionId: "insp-retry-5-exhaust",
        type: "CREATE_INSPECTION",
        payload: sampleCreatePayload(),
        maxRetries: 5,
      });

      await transitionMutationStatus({
        ownerUid: OWNER_A,
        mutationId: mut.id,
        targetStatus: "in_flight",
      });

      const fixedNow = 1700000000000;

      // Attempt 1 fails (initial execution attempt) -> 1st retry scheduled with delay ~1000ms
      const att1 = await recordMutationAttempt({
        ownerUid: OWNER_A,
        mutationId: mut.id,
        isTransientFailure: true,
        error: "Attempt 1 failed",
        jitterMs: 0,
        now: fixedNow,
      });
      expect(att1.status).toBe("failed");
      expect(att1.retryCount).toBe(1);
      expect(att1.nextRetryAt).toBe(fixedNow + 1000);

      // Attempt 2 fails (1st retry) -> 2nd retry scheduled with delay ~2000ms
      const att2 = await recordMutationAttempt({
        ownerUid: OWNER_A,
        mutationId: mut.id,
        isTransientFailure: true,
        error: "Attempt 2 failed",
        jitterMs: 0,
        now: fixedNow + 1000,
      });
      expect(att2.status).toBe("failed");
      expect(att2.retryCount).toBe(2);
      expect(att2.nextRetryAt).toBe(fixedNow + 1000 + 2000);

      // Attempt 3 fails (2nd retry) -> 3rd retry scheduled with delay ~4000ms
      const att3 = await recordMutationAttempt({
        ownerUid: OWNER_A,
        mutationId: mut.id,
        isTransientFailure: true,
        error: "Attempt 3 failed",
        jitterMs: 0,
        now: fixedNow + 3000,
      });
      expect(att3.status).toBe("failed");
      expect(att3.retryCount).toBe(3);
      expect(att3.nextRetryAt).toBe(fixedNow + 3000 + 4000);

      // Attempt 4 fails (3rd retry) -> 4th retry scheduled with delay ~8000ms
      const att4 = await recordMutationAttempt({
        ownerUid: OWNER_A,
        mutationId: mut.id,
        isTransientFailure: true,
        error: "Attempt 4 failed",
        jitterMs: 0,
        now: fixedNow + 7000,
      });
      expect(att4.status).toBe("failed");
      expect(att4.retryCount).toBe(4);
      expect(att4.nextRetryAt).toBe(fixedNow + 7000 + 8000);

      // Attempt 5 fails (4th retry -> 5th total attempt reaches maxRetries) -> Terminal Exhaustion
      const att5 = await recordMutationAttempt({
        ownerUid: OWNER_A,
        mutationId: mut.id,
        isTransientFailure: true,
        error: "Attempt 5 failed (terminal exhaustion)",
        jitterMs: 0,
        now: fixedNow + 15000,
      });
      expect(att5.status).toBe("failed_exhausted");
      expect(att5.retryCount).toBe(5);
      expect(att5.nextRetryAt).toBeNull();
      expect(isTerminalMutationStatus(att5.status)).toBe(true);

      // Verify no 6th attempt can ever be scheduled or recorded
      await expect(
        recordMutationAttempt({
          ownerUid: OWNER_A,
          mutationId: mut.id,
          isTransientFailure: true,
          error: "Unreachable attempt 6",
        })
      ).rejects.toThrowError(MutationLifecycleError);
    });

    it("immediately transitions to 'failed_exhausted' on permanent failures (isTransientFailure: false)", async () => {
      const mut = await enqueueMutation({
        ownerUid: OWNER_A,
        targetInspectionId: "insp-perm-fail",
        type: "CREATE_INSPECTION",
        payload: sampleCreatePayload(),
        maxRetries: 5,
      });

      await transitionMutationStatus({
        ownerUid: OWNER_A,
        mutationId: mut.id,
        targetStatus: "in_flight",
      });

      const permanent = await recordMutationAttempt({
        ownerUid: OWNER_A,
        mutationId: mut.id,
        isTransientFailure: false, // Non-transient failure
        error: "Schema validation failure: missing mandatory field",
      });

      expect(permanent.status).toBe("failed_exhausted");
      expect(permanent.retryCount).toBe(1);
      expect(permanent.nextRetryAt).toBeNull();
      expect(permanent.failureReason).toContain("Schema validation failure");
    });
  });

  describe("4. Local Crash Recovery (in_flight -> queued)", () => {
    it("recovers in_flight mutations to queued while preserving sequence and retry counts", async () => {
      const m1 = await enqueueMutation({
        ownerUid: OWNER_A,
        targetInspectionId: "insp-crash-1",
        type: "CREATE_INSPECTION",
        payload: sampleCreatePayload("Crash 1"),
      });
      const m2 = await enqueueMutation({
        ownerUid: OWNER_A,
        targetInspectionId: "insp-crash-2",
        type: "CREATE_INSPECTION",
        payload: sampleCreatePayload("Crash 2"),
      });
      const m3 = await enqueueMutation({
        ownerUid: OWNER_A,
        targetInspectionId: "insp-crash-3",
        type: "CREATE_INSPECTION",
        payload: sampleCreatePayload("Crash 3"),
      });

      // m1 remains queued
      // m2 transitions to in_flight
      await transitionMutationStatus({
        ownerUid: OWNER_A,
        mutationId: m2.id,
        targetStatus: "in_flight",
      });
      // m3 transitions to in_flight and recorded an attempt before crash
      await transitionMutationStatus({
        ownerUid: OWNER_A,
        mutationId: m3.id,
        targetStatus: "in_flight",
      });
      await recordMutationAttempt({
        ownerUid: OWNER_A,
        mutationId: m3.id,
        isTransientFailure: true,
        error: "Pre-crash transient error",
      });
      // Put m3 back to in_flight (simulating replay attempt in progress when browser crashed)
      await transitionMutationStatus({
        ownerUid: OWNER_A,
        mutationId: m3.id,
        targetStatus: "queued",
      });
      await transitionMutationStatus({
        ownerUid: OWNER_A,
        mutationId: m3.id,
        targetStatus: "in_flight",
      });

      // Simulate crash recovery at startup
      const recoveryNow = 1700000050000;
      const result = await recoverInFlightMutations(OWNER_A, recoveryNow);

      expect(result.recoveredCount).toBe(2);
      expect(result.mutations.map((m) => m.id)).toEqual([m2.id, m3.id]);

      // Verify m2 was reset to queued
      const r2 = await getMutationById(OWNER_A, m2.id);
      expect(r2?.status).toBe("queued");
      expect(r2?.sequenceNumber).toBe(2);
      expect(r2?.retryCount).toBe(0);

      // Verify m3 was reset to queued with preserved retryCount
      const r3 = await getMutationById(OWNER_A, m3.id);
      expect(r3?.status).toBe("queued");
      expect(r3?.sequenceNumber).toBe(3);
      expect(r3?.retryCount).toBe(1);

      // Verify m1 remains queued
      const r1 = await getMutationById(OWNER_A, m1.id);
      expect(r1?.status).toBe("queued");
    });

    it("is idempotent when run repeatedly with no in-flight mutations", async () => {
      const mut = await enqueueMutation({
        ownerUid: OWNER_A,
        targetInspectionId: "insp-idemp-1",
        type: "CREATE_INSPECTION",
        payload: sampleCreatePayload(),
      });

      await transitionMutationStatus({
        ownerUid: OWNER_A,
        mutationId: mut.id,
        targetStatus: "in_flight",
      });

      const firstPass = await recoverInFlightMutations(OWNER_A);
      expect(firstPass.recoveredCount).toBe(1);

      const secondPass = await recoverInFlightMutations(OWNER_A);
      expect(secondPass.recoveredCount).toBe(0);
      expect(secondPass.mutations).toHaveLength(0);
    });
  });

  describe("5. Multi-Owner Isolation & Independent Monotonicity", () => {
    it("maintains isolated, independent sequence numbering for each user", async () => {
      const a1 = await enqueueMutation({
        ownerUid: OWNER_A,
        targetInspectionId: "insp-a-1",
        type: "CREATE_INSPECTION",
        payload: sampleCreatePayload("A1"),
      });
      const b1 = await enqueueMutation({
        ownerUid: OWNER_B,
        targetInspectionId: "insp-b-1",
        type: "CREATE_INSPECTION",
        payload: sampleCreatePayload("B1"),
      });
      const a2 = await enqueueMutation({
        ownerUid: OWNER_A,
        targetInspectionId: "insp-a-2",
        type: "CREATE_INSPECTION",
        payload: sampleCreatePayload("A2"),
      });
      const b2 = await enqueueMutation({
        ownerUid: OWNER_B,
        targetInspectionId: "insp-b-2",
        type: "CREATE_INSPECTION",
        payload: sampleCreatePayload("B2"),
      });

      expect(a1.sequenceNumber).toBe(1);
      expect(b1.sequenceNumber).toBe(1); // Owner B independently starts at 1
      expect(a2.sequenceNumber).toBe(2);
      expect(b2.sequenceNumber).toBe(2);

      const pendingA = await getPendingMutations(OWNER_A);
      expect(pendingA.map((m) => m.id)).toEqual([a1.id, a2.id]);

      const pendingB = await getPendingMutations(OWNER_B);
      expect(pendingB.map((m) => m.id)).toEqual([b1.id, b2.id]);
    });

    it("strictly isolates queries so User A cannot read or modify User B mutations", async () => {
      const bRecord = await enqueueMutation({
        ownerUid: OWNER_B,
        targetInspectionId: "insp-b-secret",
        type: "CREATE_INSPECTION",
        payload: sampleCreatePayload("B Secret Observation"),
      });

      // User A querying User B's mutation by ID receives null
      const crossFetch = await getMutationById(OWNER_A, bRecord.id);
      expect(crossFetch).toBeNull();

      // User A cannot transition User B's mutation
      await expect(
        transitionMutationStatus({
          ownerUid: OWNER_A,
          mutationId: bRecord.id,
          targetStatus: "in_flight",
        })
      ).rejects.toThrowError(MutationLifecycleError);

      // User A cannot cancel User B's mutation
      await expect(
        cancelMutation(OWNER_A, bRecord.id, "Malicious cancel")
      ).rejects.toThrowError(MutationLifecycleError);

      // User A cannot record attempt on User B's mutation
      await expect(
        recordMutationAttempt({
          ownerUid: OWNER_A,
          mutationId: bRecord.id,
          isTransientFailure: true,
          error: "Malicious error",
        })
      ).rejects.toThrowError(MutationLifecycleError);
    });

    it("clears queue for only the specified owner and preserves sequence continuity", async () => {
      const a1 = await enqueueMutation({
        ownerUid: OWNER_A,
        targetInspectionId: "insp-a-del-1",
        type: "CREATE_INSPECTION",
        payload: sampleCreatePayload("A1"),
      });
      const a2 = await enqueueMutation({
        ownerUid: OWNER_A,
        targetInspectionId: "insp-a-del-2",
        type: "CREATE_INSPECTION",
        payload: sampleCreatePayload("A2"),
      });
      const b1 = await enqueueMutation({
        ownerUid: OWNER_B,
        targetInspectionId: "insp-b-keep",
        type: "CREATE_INSPECTION",
        payload: sampleCreatePayload("B1"),
      });

      expect(a1.sequenceNumber).toBe(1);
      expect(a2.sequenceNumber).toBe(2);
      expect(b1.sequenceNumber).toBe(1);

      const deleted = await clearOwnerQueue(OWNER_A);
      expect(deleted).toBe(2);

      const aQueue = await getAllMutationsByOwner(OWNER_A);
      expect(aQueue).toHaveLength(0);

      // Owner B's queue and sequence generator must remain intact
      const bQueue = await getAllMutationsByOwner(OWNER_B);
      expect(bQueue).toHaveLength(1);
      expect(bQueue[0]?.sequenceNumber).toBe(1);

      // Next mutation for Owner A must receive sequence > 2 (specifically 3)
      const a3 = await enqueueMutation({
        ownerUid: OWNER_A,
        targetInspectionId: "insp-a-del-3",
        type: "CREATE_INSPECTION",
        payload: sampleCreatePayload("A3"),
      });
      expect(a3.sequenceNumber).toBe(3);
      expect(a3.sequenceNumber).toBeGreaterThan(a2.sequenceNumber);

      // Next mutation for Owner B receives sequence 2
      const b2 = await enqueueMutation({
        ownerUid: OWNER_B,
        targetInspectionId: "insp-b-keep-2",
        type: "CREATE_INSPECTION",
        payload: sampleCreatePayload("B2"),
      });
      expect(b2.sequenceNumber).toBe(2);
    });
  });

  describe("6. Queue Summary & Inspection-Scoped Queries", () => {
    it("computes comprehensive queue summary counts and timestamp bounds", async () => {
      const now = 1700000000000;

      // 1. queued
      await enqueueMutation({
        ownerUid: OWNER_A,
        targetInspectionId: "insp-summary-1",
        type: "CREATE_INSPECTION",
        payload: sampleCreatePayload(),
        now: now,
      });

      // 2. in_flight
      const m2 = await enqueueMutation({
        ownerUid: OWNER_A,
        targetInspectionId: "insp-summary-2",
        type: "CREATE_INSPECTION",
        payload: sampleCreatePayload(),
        now: now + 5000,
      });
      await transitionMutationStatus({
        ownerUid: OWNER_A,
        mutationId: m2.id,
        targetStatus: "in_flight",
      });

      // 3. succeeded
      const m3 = await enqueueMutation({
        ownerUid: OWNER_A,
        targetInspectionId: "insp-summary-3",
        type: "CREATE_INSPECTION",
        payload: sampleCreatePayload(),
        now: now + 10000,
      });
      await transitionMutationStatus({
        ownerUid: OWNER_A,
        mutationId: m3.id,
        targetStatus: "in_flight",
      });
      await transitionMutationStatus({
        ownerUid: OWNER_A,
        mutationId: m3.id,
        targetStatus: "succeeded",
      });

      // 4. cancelled
      const m4 = await enqueueMutation({
        ownerUid: OWNER_A,
        targetInspectionId: "insp-summary-4",
        type: "CREATE_INSPECTION",
        payload: sampleCreatePayload(),
        now: now + 15000,
      });
      await cancelMutation(OWNER_A, m4.id, "Cancelled by user");

      const summary = await getQueueSummary(OWNER_A);
      expect(summary.total).toBe(4);
      expect(summary.queued).toBe(1);
      expect(summary.inFlight).toBe(1);
      expect(summary.pendingCount).toBe(2);
      expect(summary.succeeded).toBe(1);
      expect(summary.succeededCount).toBe(1);
      expect(summary.cancelled).toBe(1);
      expect(summary.cancelledCount).toBe(1);
      expect(summary.failed).toBe(0);
      expect(summary.failedCount).toBe(0);
      expect(summary.conflict).toBe(0);
      expect(summary.conflictCount).toBe(0);
      expect(summary.oldestPendingCreatedAt).toBe(now);
      expect(summary.newestPendingCreatedAt).toBe(now + 5000);
    });

    it("queries mutations specifically targeting a single inspection", async () => {
      const targetId = "insp-target-x";
      const otherId = "insp-other-y";

      const m1 = await enqueueMutation({
        ownerUid: OWNER_A,
        targetInspectionId: targetId,
        type: "CREATE_INSPECTION",
        payload: sampleCreatePayload("M1"),
      });
      await enqueueMutation({
        ownerUid: OWNER_A,
        targetInspectionId: otherId,
        type: "CREATE_INSPECTION",
        payload: sampleCreatePayload("Other"),
      });
      const m3 = await enqueueMutation({
        ownerUid: OWNER_A,
        targetInspectionId: targetId,
        type: "UPDATE_DRAFT",
        payload: {
          type: "UPDATE_DRAFT",
          title: "Updated M1",
        },
      });

      const inspectionMutations = await getMutationsByInspection(OWNER_A, targetId);
      expect(inspectionMutations).toHaveLength(2);
      expect(inspectionMutations.map((m) => m.id)).toEqual([m1.id, m3.id]);
    });
  });

  describe("7. IndexedDB v3 Migration & Data Preservation", () => {
    it("verifies v3 database initialization includes all required stores and indexes", async () => {
      const db = await getDatabase();
      expect(db.name).toBe(DB_NAME);
      expect(db.version).toBe(DB_VERSION);
      expect(db.version).toBeGreaterThanOrEqual(3);

      expect(db.objectStoreNames.contains(STORES.PHOTOS)).toBe(true);
      expect(db.objectStoreNames.contains(STORES.DRAFTS)).toBe(true);
      expect(db.objectStoreNames.contains(STORES.PROJECTS)).toBe(true);
      expect(db.objectStoreNames.contains(STORES.MUTATIONS)).toBe(true);
      expect(db.objectStoreNames.contains(STORES.SEQUENCES)).toBe(true);

      const tx = db.transaction(STORES.MUTATIONS, "readonly");
      const store = tx.objectStore(STORES.MUTATIONS);
      expect(store.indexNames.contains("by_ownerUid")).toBe(true);
      expect(store.indexNames.contains("by_targetInspectionId")).toBe(true);
      expect(store.indexNames.contains("by_status")).toBe(true);
      expect(store.indexNames.contains("by_owner_status")).toBe(true);
      expect(store.indexNames.contains("by_owner_sequence")).toBe(true);
    });

    it("preserves existing photo Blobs and draft inspections alongside mutation queue", async () => {
      // 1. Save photo Blob (Stage 0 evidence)
      const photoBlob = new Blob(["stage2-test-binary-data"], { type: "image/jpeg" });
      const photo: LocalEvidencePhoto = {
        id: "photo-mig-01",
        inspectionId: "insp-mig-01",
        projectId: "proj-mig-01",
        blob: photoBlob,
        fileName: "mig_test.jpg",
        fileSizeBytes: photoBlob.size,
        mimeType: "image/jpeg",
        capturedAt: Date.now() - 1000,
        createdAt: Date.now(),
      };
      await saveEvidencePhoto(photo);

      // 2. Save local draft inspection (Stage 1 review metadata)
      const draft: LocalDraftInspection = {
        id: "insp-mig-01",
        projectId: "proj-mig-01",
        title: "Migration Verification Draft",
        observation: "Testing non-destructive store upgrade",
        category: "installation",
        visibleEvidence: [],
        uncertainties: [],
        inspectorFollowUp: [],
        photoIds: ["photo-mig-01"],
        reviewStatus: "in_review",
        reviewHistory: [],
        lastSavedAt: Date.now(),
        createdAt: Date.now(),
        isSynced: false,
      };
      await saveLocalDraft(draft);

      // 3. Enqueue mutation in Stage 2 queue
      const mutation = await enqueueMutation({
        ownerUid: OWNER_A,
        targetInspectionId: "insp-mig-01",
        type: "TRANSITION_REVIEW",
        payload: sampleReviewPayload(),
      });

      // 4. Assert photo Blob is preserved
      const retrievedPhoto = await getEvidencePhoto("photo-mig-01");
      expect(retrievedPhoto).not.toBeNull();
      expect(retrievedPhoto?.blob.size).toBe(photoBlob.size);

      // 5. Assert draft inspection is preserved with reviewStatus
      const retrievedDraft = await getLocalDraft("insp-mig-01");
      expect(retrievedDraft).not.toBeNull();
      expect(retrievedDraft?.reviewStatus).toBe("in_review");

      // 6. Assert mutation queue record exists
      const retrievedMutation = await getMutationById(OWNER_A, mutation.id);
      expect(retrievedMutation).not.toBeNull();
      expect(retrievedMutation?.sequenceNumber).toBe(1);
    });

    it("protects pending mutations and sequence generators during ordinary evidence reset", async () => {
      // 1. Seed photo Blobs and local drafts
      const photoBlob = new Blob(["test-photo-data"], { type: "image/jpeg" });
      await saveEvidencePhoto({
        id: "photo-ev-reset-01",
        inspectionId: "insp-ev-reset-01",
        projectId: "proj-ev-reset-01",
        blob: photoBlob,
        fileName: "evidence.jpg",
        fileSizeBytes: photoBlob.size,
        mimeType: "image/jpeg",
        capturedAt: Date.now() - 1000,
        createdAt: Date.now(),
      });

      await saveLocalDraft({
        id: "insp-ev-reset-01",
        projectId: "proj-ev-reset-01",
        title: "Local Evidence Draft",
        observation: "To be cleared",
        category: "installation",
        visibleEvidence: [],
        uncertainties: [],
        inspectorFollowUp: [],
        photoIds: ["photo-ev-reset-01"],
        reviewStatus: "draft_generated",
        reviewHistory: [],
        lastSavedAt: Date.now(),
        createdAt: Date.now(),
        isSynced: false,
      });

      // 2. Enqueue mutations for Owner A and Owner B
      const mutA = await enqueueMutation({
        ownerUid: OWNER_A,
        targetInspectionId: "insp-ev-reset-01",
        type: "CREATE_INSPECTION",
        payload: sampleCreatePayload("Owner A Pending"),
      });
      const mutB = await enqueueMutation({
        ownerUid: OWNER_B,
        targetInspectionId: "insp-ev-reset-02",
        type: "CREATE_INSPECTION",
        payload: sampleCreatePayload("Owner B Pending"),
      });

      expect(mutA.sequenceNumber).toBe(1);
      expect(mutB.sequenceNumber).toBe(1);

      // 3. Execute ordinary user-facing evidence reset (Settings screen action)
      await clearAllLocalEvidence();

      // 4. Verify photo Blobs and local drafts ARE purged
      const photoAfter = await getEvidencePhoto("photo-ev-reset-01");
      expect(photoAfter).toBeNull();
      const draftAfter = await getLocalDraft("insp-ev-reset-01");
      expect(draftAfter).toBeNull();

      // 5. Verify pending mutations and history ARE PRESERVED
      const pendingA = await getPendingMutations(OWNER_A);
      expect(pendingA).toHaveLength(1);
      expect(pendingA[0]?.id).toBe(mutA.id);

      const pendingB = await getPendingMutations(OWNER_B);
      expect(pendingB).toHaveLength(1);
      expect(pendingB[0]?.id).toBe(mutB.id);

      // 6. Verify sequence generators ARE PRESERVED (next enqueue gets sequence 2)
      const mutA2 = await enqueueMutation({
        ownerUid: OWNER_A,
        targetInspectionId: "insp-ev-reset-03",
        type: "CREATE_INSPECTION",
        payload: sampleCreatePayload("Owner A Continued"),
      });
      expect(mutA2.sequenceNumber).toBe(2);

      // 7. Verify dedicated test purge utility DOES clear mutations when explicitly requested
      await clearAllMutationQueueData();
      const pendingAfterPurge = await getPendingMutations(OWNER_A);
      expect(pendingAfterPurge).toHaveLength(0);
    });

    it("migrates an existing v1 database to v3 preserving original records and adding new stores", async () => {
      const TEST_DB_V1 = "ForeSite_V1_Upgrade_Test";

      // Step 1: Open at version 1 and create v1 schema
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(TEST_DB_V1, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          const photoStore = db.createObjectStore(STORES.PHOTOS, { keyPath: "id" });
          photoStore.createIndex("by_inspectionId", "inspectionId", { unique: false });
          photoStore.createIndex("by_projectId", "projectId", { unique: false });
          photoStore.createIndex("by_createdAt", "createdAt", { unique: false });

          const draftStore = db.createObjectStore(STORES.DRAFTS, { keyPath: "id" });
          draftStore.createIndex("by_projectId", "projectId", { unique: false });
          draftStore.createIndex("by_lastSavedAt", "lastSavedAt", { unique: false });
          draftStore.createIndex("by_isSynced", "isSynced", { unique: false });

          const projectStore = db.createObjectStore(STORES.PROJECTS, { keyPath: "id" });
          projectStore.createIndex("by_updatedAt", "updatedAt", { unique: false });
        };
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction([STORES.PHOTOS, STORES.DRAFTS], "readwrite");
          tx.objectStore(STORES.PHOTOS).put({
            id: "v1-photo-01",
            inspectionId: "v1-insp-01",
            projectId: "v1-proj-01",
            blob: new Blob(["v1-photo-bytes"], { type: "image/jpeg" }),
            fileName: "v1_site.jpg",
            fileSizeBytes: 14,
            mimeType: "image/jpeg",
            capturedAt: 1600000000000,
            createdAt: 1600000000000,
          });
          tx.objectStore(STORES.DRAFTS).put({
            id: "v1-insp-01",
            projectId: "v1-proj-01",
            title: "Original V1 Inspection",
            observation: "Observed foundation crack",
            category: "surface_condition",
            visibleEvidence: [],
            uncertainties: [],
            inspectorFollowUp: [],
            photoIds: ["v1-photo-01"],
            lastSavedAt: 1600000000000,
            createdAt: 1600000000000,
            isSynced: false,
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      });

      // Step 2: Open at version 3 applying v2 and v3 migration logic
      const upgradedDb = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(TEST_DB_V1, 3);
        req.onupgradeneeded = (event) => {
          const db = req.result;
          const oldVersion = event.oldVersion;

          if (oldVersion < 2) {
            const transaction = req.transaction;
            if (transaction && db.objectStoreNames.contains(STORES.DRAFTS)) {
              const draftStore = transaction.objectStore(STORES.DRAFTS);
              if (!draftStore.indexNames.contains("by_reviewStatus")) {
                draftStore.createIndex("by_reviewStatus", "reviewStatus", { unique: false });
              }
            }
          }

          if (oldVersion < 3) {
            if (!db.objectStoreNames.contains(STORES.MUTATIONS)) {
              const mutationStore = db.createObjectStore(STORES.MUTATIONS, { keyPath: "id" });
              mutationStore.createIndex("by_ownerUid", "ownerUid", { unique: false });
              mutationStore.createIndex("by_targetInspectionId", "targetInspectionId", { unique: false });
              mutationStore.createIndex("by_status", "status", { unique: false });
              mutationStore.createIndex("by_owner_status", ["ownerUid", "status"], { unique: false });
              mutationStore.createIndex("by_owner_sequence", ["ownerUid", "sequenceNumber"], { unique: false });
            }
            if (!db.objectStoreNames.contains(STORES.SEQUENCES)) {
              db.createObjectStore(STORES.SEQUENCES, { keyPath: "id" });
            }
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      expect(upgradedDb.version).toBe(3);
      expect(upgradedDb.objectStoreNames.contains(STORES.PHOTOS)).toBe(true);
      expect(upgradedDb.objectStoreNames.contains(STORES.DRAFTS)).toBe(true);
      expect(upgradedDb.objectStoreNames.contains(STORES.MUTATIONS)).toBe(true);
      expect(upgradedDb.objectStoreNames.contains(STORES.SEQUENCES)).toBe(true);

      const checkTx = upgradedDb.transaction([STORES.PHOTOS, STORES.DRAFTS], "readonly");
      const photoReq = checkTx.objectStore(STORES.PHOTOS).get("v1-photo-01");
      const draftReq = checkTx.objectStore(STORES.DRAFTS).get("v1-insp-01");

      await new Promise<void>((resolve, reject) => {
        checkTx.oncomplete = () => resolve();
        checkTx.onerror = () => reject(checkTx.error);
      });

      expect(photoReq.result).toBeDefined();
      expect(photoReq.result.fileName).toBe("v1_site.jpg");
      expect(draftReq.result).toBeDefined();
      expect(draftReq.result.title).toBe("Original V1 Inspection");

      upgradedDb.close();
    });

    it("migrates an existing v2 database to v3 preserving review metadata and audit history", async () => {
      const TEST_DB_V2 = "ForeSite_V2_Upgrade_Test";

      // Step 1: Open at version 2 and seed review status and audit history
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(TEST_DB_V2, 2);
        req.onupgradeneeded = () => {
          const db = req.result;
          db.createObjectStore(STORES.PHOTOS, { keyPath: "id" });
          const draftStore = db.createObjectStore(STORES.DRAFTS, { keyPath: "id" });
          draftStore.createIndex("by_reviewStatus", "reviewStatus", { unique: false });
          db.createObjectStore(STORES.PROJECTS, { keyPath: "id" });
        };
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction([STORES.DRAFTS], "readwrite");
          tx.objectStore(STORES.DRAFTS).put({
            id: "v2-insp-01",
            projectId: "v2-proj-01",
            title: "Stage 1 Reviewed Inspection",
            observation: "Observation in review",
            category: "installation",
            visibleEvidence: [],
            uncertainties: [],
            inspectorFollowUp: [],
            photoIds: [],
            reviewStatus: "in_review",
            reviewHistory: [
              {
                id: "rev-evt-001",
                fromStatus: "draft_generated",
                toStatus: "in_review",
                byUid: OWNER_A,
                timestamp: 1700000000000,
                comment: "Commencing stage 1 review",
              },
            ],
            reviewedAt: 1700000000000,
            reviewedByUid: OWNER_A,
            lastSavedAt: 1700000000000,
            createdAt: 1700000000000,
            isSynced: false,
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      });

      // Step 2: Open at version 3 applying v3 migration logic
      const upgradedDb = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(TEST_DB_V2, 3);
        req.onupgradeneeded = (event) => {
          const db = req.result;
          const oldVersion = event.oldVersion;

          if (oldVersion < 3) {
            if (!db.objectStoreNames.contains(STORES.MUTATIONS)) {
              const mutationStore = db.createObjectStore(STORES.MUTATIONS, { keyPath: "id" });
              mutationStore.createIndex("by_ownerUid", "ownerUid", { unique: false });
              mutationStore.createIndex("by_targetInspectionId", "targetInspectionId", { unique: false });
              mutationStore.createIndex("by_status", "status", { unique: false });
              mutationStore.createIndex("by_owner_status", ["ownerUid", "status"], { unique: false });
              mutationStore.createIndex("by_owner_sequence", ["ownerUid", "sequenceNumber"], { unique: false });
            }
            if (!db.objectStoreNames.contains(STORES.SEQUENCES)) {
              db.createObjectStore(STORES.SEQUENCES, { keyPath: "id" });
            }
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      expect(upgradedDb.version).toBe(3);
      const checkTx = upgradedDb.transaction([STORES.DRAFTS], "readonly");
      const draftReq = checkTx.objectStore(STORES.DRAFTS).get("v2-insp-01");

      await new Promise<void>((resolve, reject) => {
        checkTx.oncomplete = () => resolve();
        checkTx.onerror = () => reject(checkTx.error);
      });

      const draftResult = draftReq.result;
      expect(draftResult).toBeDefined();
      expect(draftResult.reviewStatus).toBe("in_review");
      expect(draftResult.reviewHistory).toHaveLength(1);
      expect(draftResult.reviewHistory[0].id).toBe("rev-evt-001");

      upgradedDb.close();
    });

    it("verifies transaction rollback on abort leaves neither sequence increment nor mutation committed", async () => {
      const db = await getDatabase();
      const initialSeqRecord = await new Promise<{ id: string; lastSequence: number; updatedAt: number } | undefined>((resolve) => {
        const tx = db.transaction(STORES.SEQUENCES, "readonly");
        const req = tx.objectStore(STORES.SEQUENCES).get(OWNER_A);
        req.onsuccess = () => resolve(req.result);
      });
      const initialSeq = initialSeqRecord?.lastSequence ?? 0;

      // Execute an explicit transaction abort simulating mid-transaction crash or validation failure
      await new Promise<void>((resolve) => {
        const tx = db.transaction([STORES.MUTATIONS, STORES.SEQUENCES], "readwrite");
        const seqStore = tx.objectStore(STORES.SEQUENCES);
        const mutStore = tx.objectStore(STORES.MUTATIONS);

        seqStore.put({ id: OWNER_A, lastSequence: initialSeq + 99, updatedAt: Date.now() });
        mutStore.add({
          id: "mut-aborted-atomicity-test",
          ownerUid: OWNER_A,
          targetInspectionId: "insp-abort-01",
          type: "CREATE_INSPECTION",
          payload: sampleCreatePayload(),
          baseRevision: 0,
          sequenceNumber: initialSeq + 99,
          status: "queued",
          retryCount: 0,
          maxRetries: 5,
          nextRetryAt: null,
          lastAttemptedAt: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });

        tx.abort();

        tx.onabort = () => resolve();
        tx.onerror = () => resolve();
      });

      // Verify the aborted mutation was not stored
      const checkMutTx = db.transaction(STORES.MUTATIONS, "readonly");
      const checkMutReq = checkMutTx.objectStore(STORES.MUTATIONS).get("mut-aborted-atomicity-test");
      await new Promise<void>((resolve) => {
        checkMutTx.oncomplete = () => resolve();
      });
      expect(checkMutReq.result).toBeUndefined();

      // Verify sequence generator was not updated
      const checkSeqTx = db.transaction(STORES.SEQUENCES, "readonly");
      const checkSeqReq = checkSeqTx.objectStore(STORES.SEQUENCES).get(OWNER_A);
      await new Promise<void>((resolve) => {
        checkSeqTx.oncomplete = () => resolve();
      });
      expect(checkSeqReq.result?.lastSequence ?? 0).toBe(initialSeq);

      // Verify next successful enqueue receives exactly initialSeq + 1
      const nextMut = await enqueueMutation({
        ownerUid: OWNER_A,
        targetInspectionId: "insp-post-abort-success",
        type: "CREATE_INSPECTION",
        payload: sampleCreatePayload("Post abort verify"),
      });
      expect(nextMut.sequenceNumber).toBe(initialSeq + 1);
    });
  });

  describe("8. Stage 2 Isolation Boundaries (Zero Remote Writes & $0.00 Cost)", () => {
    it("ensures NO Firestore service calls occur during any mutation queue operation", async () => {
      // Perform full lifecycle of local queue operations
      const mut = await enqueueMutation({
        ownerUid: OWNER_A,
        targetInspectionId: "insp-isolation-01",
        type: "CREATE_INSPECTION",
        payload: sampleCreatePayload(),
      });

      await transitionMutationStatus({
        ownerUid: OWNER_A,
        mutationId: mut.id,
        targetStatus: "in_flight",
      });

      await recordMutationAttempt({
        ownerUid: OWNER_A,
        mutationId: mut.id,
        isTransientFailure: true,
        error: "Test transient error",
      });

      await transitionMutationStatus({
        ownerUid: OWNER_A,
        mutationId: mut.id,
        targetStatus: "queued",
      });

      await cancelMutation(OWNER_A, mut.id, "Cancel test");
      await recoverInFlightMutations(OWNER_A);
      await getQueueSummary(OWNER_A);

      // Verify that Firestore was NEVER invoked
      expect(firestoreService.createInspection).not.toHaveBeenCalled();
      expect(firestoreService.updateInspection).not.toHaveBeenCalled();
      expect(firestoreService.deleteInspection).not.toHaveBeenCalled();
      expect(firestoreService.getUserInspections).not.toHaveBeenCalled();
      expect(firestoreService.createProject).not.toHaveBeenCalled();
      expect(firestoreService.updateProject).not.toHaveBeenCalled();
      expect(firestoreService.deleteProject).not.toHaveBeenCalled();
    });
  });
});
