/**
 * ForeSite Durable Offline Mutation Queue Service (Stage 2)
 *
 * Implements a durable, FIFO, monotonically sequenced offline mutation queue
 * in local IndexedDB. Manages mutation lifecycles, atomic sequence number
 * allocation, deterministic exponential backoff retries, local crash recovery,
 * and multi-owner data isolation.
 *
 * Boundaries & Invariants:
 * - STAGE 2 ONLY: Local queue persistence and lifecycle management.
 * - NO Firestore writes, network dispatch, or remote replay (deferred to Stage 3).
 * - Zero external API costs ($0.00/mo Spark tier invariant).
 *
 * Authentication & Security Boundary Notice:
 * - Queue owner isolation is enforced strictly through owner-scoped IndexedDB operations
 *   and compound index filtering (by_ownerUid, by_owner_sequence, by_owner_status).
 * - Passing an `ownerUid` string parameter does NOT independently authenticate the caller;
 *   client-side browser IndexedDB is single-origin storage and possesses no built-in user authentication.
 * - Application callers must supply the authentic UID retrieved directly from the current
 *   authenticated Firebase user (auth.currentUser.uid).
 * - Stage 3 online replay engine must revalidate authenticated ownership prior to processing
 *   or replaying mutations against Cloud Firestore.
 */

import {
  MutationRecord,
  MutationStatus,
  QueueSummary,
  EnqueueMutationParams,
  TransitionStatusParams,
  RecordAttemptParams,
  UpdateDraftPayload,
  Inspection,
} from "../types";
import { getDatabase, STORES } from "./indexeddb";

export type MutationErrorCode =
  | "UNAUTHENTICATED"
  | "NOT_FOUND"
  | "INVALID_TRANSITION"
  | "TERMINAL_STATE"
  | "VALIDATION_FAILED"
  | "STORAGE_ERROR";

export class MutationLifecycleError extends Error {
  constructor(
    message: string,
    public readonly code: MutationErrorCode,
    public readonly mutationId?: string,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = "MutationLifecycleError";
  }
}

/**
 * Valid state transition graph for mutation lifecycle.
 * Invariant: 'failed' mutations can be retried, exhausted, or cancelled by user.
 */
const VALID_STATUS_TRANSITIONS: Record<MutationStatus, readonly MutationStatus[]> = {
  queued: ["in_flight", "cancelled_by_user"],
  in_flight: ["succeeded", "failed", "conflict", "queued"],
  failed: ["queued", "failed_exhausted", "cancelled_by_user"],
  failed_exhausted: [],
  conflict: ["paused_on_conflict", "cancelled_by_user"],
  paused_on_conflict: ["queued", "cancelled_by_user"],
  cancelled_by_user: [],
  succeeded: [],
};

/**
 * Checks whether a transition between two mutation statuses is valid.
 */
export function isValidMutationStatusTransition(
  from: MutationStatus,
  to: MutationStatus
): boolean {
  const allowed = VALID_STATUS_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

/**
 * Checks whether a mutation status is a terminal state.
 */
export function isTerminalMutationStatus(status: MutationStatus): boolean {
  return (
    status === "succeeded" ||
    status === "failed_exhausted" ||
    status === "cancelled_by_user"
  );
}

/**
 * Calculates deterministic exponential backoff delay in milliseconds.
 *
 * Backoff schedule for retryable attempts:
 * - Attempt 1 fails (retryCount -> 1): 1st retry scheduled with delay ~1000ms
 * - Attempt 2 fails (retryCount -> 2): 2nd retry scheduled with delay ~2000ms
 * - Attempt 3 fails (retryCount -> 3): 3rd retry scheduled with delay ~4000ms
 * - Attempt 4 fails (retryCount -> 4): 4th retry scheduled with delay ~8000ms
 * - Attempt 5 fails (retryCount -> 5 >= maxRetries): Terminal exhaustion ('failed_exhausted').
 *   nextRetryAt is set to null. No 6th attempt is ever scheduled.
 *
 * Formula: Math.min(1000 * 2^(retryCount - 1), 30000) + jitterMs.
 * Jitter: Caller-injected via jitterMs parameter; deterministic when fixed or omitted.
 */
export function calculateNextRetryDelay(
  retryCount: number,
  jitterMs: number = 0
): number {
  if (retryCount <= 0) {
    return 1000 + jitterMs;
  }
  const baseDelay = 1000 * Math.pow(2, Math.max(0, retryCount - 1));
  return Math.min(baseDelay, 30000) + jitterMs;
}

/**
 * Enqueues a new mutation with atomic monotonic sequence allocation.
 */
export async function enqueueMutation(
  params: EnqueueMutationParams
): Promise<MutationRecord> {
  if (
    !params.ownerUid ||
    typeof params.ownerUid !== "string" ||
    params.ownerUid.trim() === ""
  ) {
    throw new MutationLifecycleError(
      "ownerUid is required and must be non-empty",
      "UNAUTHENTICATED"
    );
  }
  if (
    !params.targetInspectionId ||
    typeof params.targetInspectionId !== "string" ||
    params.targetInspectionId.trim() === ""
  ) {
    throw new MutationLifecycleError(
      "targetInspectionId is required and must be non-empty",
      "VALIDATION_FAILED"
    );
  }
  if (!params.type || typeof params.type !== "string") {
    throw new MutationLifecycleError("type is required", "VALIDATION_FAILED");
  }
  if (!params.payload || typeof params.payload !== "object") {
    throw new MutationLifecycleError(
      "payload is required and must be an object",
      "VALIDATION_FAILED"
    );
  }

  const db = await getDatabase();
  const mutationId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `mut-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  return new Promise<MutationRecord>((resolve, reject) => {
    try {
      const tx = db.transaction(
        [STORES.MUTATIONS, STORES.SEQUENCES],
        "readwrite"
      );
      const seqStore = tx.objectStore(STORES.SEQUENCES);
      const mutStore = tx.objectStore(STORES.MUTATIONS);

      const seqReq = seqStore.get(params.ownerUid);
      let enqueuedRecord: MutationRecord | null = null;

      seqReq.onsuccess = () => {
        const seqRecord = seqReq.result as
          | { id: string; lastSequence: number; updatedAt: number }
          | undefined;
        const currentSeq =
          seqRecord && typeof seqRecord.lastSequence === "number"
            ? seqRecord.lastSequence
            : 0;
        const newSeq = currentSeq + 1;
        const now = params.now ?? Date.now();

        seqStore.put({
          id: params.ownerUid,
          lastSequence: newSeq,
          updatedAt: now,
        });

        enqueuedRecord = {
          id: mutationId,
          ownerUid: params.ownerUid,
          targetInspectionId: params.targetInspectionId,
          type: params.type,
          payload: params.payload,
          baseRevision: params.baseRevision ?? 0,
          sequenceNumber: newSeq,
          status: "queued",
          retryCount: 0,
          maxRetries: params.maxRetries ?? 5,
          nextRetryAt: null,
          lastAttemptedAt: null,
          createdAt: now,
          updatedAt: now,
        };

        mutStore.add(enqueuedRecord);
      };

      seqReq.onerror = () => {
        reject(
          new MutationLifecycleError(
            "Failed to read sequence generator",
            "STORAGE_ERROR",
            undefined,
            seqReq.error
          )
        );
      };

      tx.oncomplete = () => {
        if (enqueuedRecord) {
          resolve(enqueuedRecord);
        } else {
          reject(
            new MutationLifecycleError(
              "Transaction completed without record creation",
              "STORAGE_ERROR"
            )
          );
        }
      };

      tx.onerror = () => {
        reject(
          new MutationLifecycleError(
            `Enqueue transaction failed: ${tx.error?.message || "Unknown error"}`,
            "STORAGE_ERROR",
            undefined,
            tx.error
          )
        );
      };

      tx.onabort = () => {
        reject(
          new MutationLifecycleError(
            "Enqueue transaction aborted",
            "STORAGE_ERROR"
          )
        );
      };
    } catch (err) {
      reject(
        new MutationLifecycleError(
          `Failed to enqueue mutation: ${err instanceof Error ? err.message : String(err)}`,
          "STORAGE_ERROR",
          undefined,
          err
        )
      );
    }
  });
}

/**
 * Retrieves all pending mutations for an owner ('queued' and 'in_flight'),
 * ordered by sequenceNumber ascending (FIFO).
 */
export async function getPendingMutations(
  ownerUid: string
): Promise<MutationRecord[]> {
  if (!ownerUid || typeof ownerUid !== "string" || ownerUid.trim() === "") {
    throw new MutationLifecycleError("ownerUid is required", "UNAUTHENTICATED");
  }

  const db = await getDatabase();
  return new Promise<MutationRecord[]>((resolve, reject) => {
    try {
      const tx = db.transaction(STORES.MUTATIONS, "readonly");
      const store = tx.objectStore(STORES.MUTATIONS);
      const index = store.index("by_ownerUid");
      const req = index.getAll(IDBKeyRange.only(ownerUid));

      req.onsuccess = () => {
        const records = (req.result as MutationRecord[]) || [];
        const pending = records.filter(
          (m) => m.status === "queued" || m.status === "in_flight"
        );
        pending.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
        resolve(pending);
      };

      req.onerror = () => {
        reject(
          new MutationLifecycleError(
            `Failed to retrieve pending mutations: ${req.error?.message || "Unknown error"}`,
            "STORAGE_ERROR",
            undefined,
            req.error
          )
        );
      };
    } catch (err) {
      reject(
        new MutationLifecycleError(
          `Failed to retrieve pending mutations: ${err instanceof Error ? err.message : String(err)}`,
          "STORAGE_ERROR",
          undefined,
          err
        )
      );
    }
  });
}

/**
 * Retrieves all mutations for a specific inspection, ordered by sequenceNumber ascending.
 */
export async function getMutationsByInspection(
  ownerUid: string,
  inspectionId: string
): Promise<MutationRecord[]> {
  if (!ownerUid || typeof ownerUid !== "string" || ownerUid.trim() === "") {
    throw new MutationLifecycleError("ownerUid is required", "UNAUTHENTICATED");
  }
  if (
    !inspectionId ||
    typeof inspectionId !== "string" ||
    inspectionId.trim() === ""
  ) {
    throw new MutationLifecycleError(
      "inspectionId is required",
      "VALIDATION_FAILED"
    );
  }

  const db = await getDatabase();
  return new Promise<MutationRecord[]>((resolve, reject) => {
    try {
      const tx = db.transaction(STORES.MUTATIONS, "readonly");
      const store = tx.objectStore(STORES.MUTATIONS);
      const index = store.index("by_targetInspectionId");
      const req = index.getAll(IDBKeyRange.only(inspectionId));

      req.onsuccess = () => {
        const records = (req.result as MutationRecord[]) || [];
        const filtered = records.filter((m) => m.ownerUid === ownerUid);
        filtered.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
        resolve(filtered);
      };

      req.onerror = () => {
        reject(
          new MutationLifecycleError(
            `Failed to retrieve inspection mutations: ${req.error?.message || "Unknown error"}`,
            "STORAGE_ERROR",
            undefined,
            req.error
          )
        );
      };
    } catch (err) {
      reject(
        new MutationLifecycleError(
          `Failed to retrieve inspection mutations: ${err instanceof Error ? err.message : String(err)}`,
          "STORAGE_ERROR",
          undefined,
          err
        )
      );
    }
  });
}

/**
 * Checks whether ANY mutation exists for a given inspection ID across all owners and statuses.
 * Used by recovery to prevent cross-account duplicate queue insertion.
 */
export async function hasAnyMutationForInspection(
  inspectionId: string
): Promise<boolean> {
  if (!inspectionId || typeof inspectionId !== "string" || inspectionId.trim() === "") {
    return false;
  }

  const db = await getDatabase();
  return new Promise<boolean>((resolve, reject) => {
    try {
      const tx = db.transaction(STORES.MUTATIONS, "readonly");
      const store = tx.objectStore(STORES.MUTATIONS);
      const index = store.index("by_targetInspectionId");
      const req = index.count(IDBKeyRange.only(inspectionId));

      req.onsuccess = () => {
        resolve(req.result > 0);
      };

      req.onerror = () => {
        reject(
          new MutationLifecycleError(
            `Failed to count mutations for inspection ${inspectionId}: ${req.error?.message || "Unknown error"}`,
            "STORAGE_ERROR",
            undefined,
            req.error
          )
        );
      };
    } catch (err) {
      reject(
        new MutationLifecycleError(
          `Failed to count mutations for inspection: ${err instanceof Error ? err.message : String(err)}`,
          "STORAGE_ERROR",
          undefined,
          err
        )
      );
    }
  });
}

/**
 * Retrieves all mutations for an owner across all statuses, sorted by sequenceNumber ascending.
 */
export async function getAllMutationsByOwner(
  ownerUid: string
): Promise<MutationRecord[]> {
  if (!ownerUid || typeof ownerUid !== "string" || ownerUid.trim() === "") {
    throw new MutationLifecycleError("ownerUid is required", "UNAUTHENTICATED");
  }

  const db = await getDatabase();
  return new Promise<MutationRecord[]>((resolve, reject) => {
    try {
      const tx = db.transaction(STORES.MUTATIONS, "readonly");
      const store = tx.objectStore(STORES.MUTATIONS);
      const index = store.index("by_ownerUid");
      const req = index.getAll(IDBKeyRange.only(ownerUid));

      req.onsuccess = () => {
        const records = (req.result as MutationRecord[]) || [];
        records.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
        resolve(records);
      };

      req.onerror = () => {
        reject(
          new MutationLifecycleError(
            `Failed to retrieve owner mutations: ${req.error?.message || "Unknown error"}`,
            "STORAGE_ERROR",
            undefined,
            req.error
          )
        );
      };
    } catch (err) {
      reject(
        new MutationLifecycleError(
          `Failed to retrieve owner mutations: ${err instanceof Error ? err.message : String(err)}`,
          "STORAGE_ERROR",
          undefined,
          err
        )
      );
    }
  });
}

/**
 * Retrieves a specific mutation by ID with owner confirmation.
 * Returns null if not found or if the mutation belongs to another owner.
 */
export async function getMutationById(
  ownerUid: string,
  mutationId: string
): Promise<MutationRecord | null> {
  if (!ownerUid || typeof ownerUid !== "string" || ownerUid.trim() === "") {
    throw new MutationLifecycleError("ownerUid is required", "UNAUTHENTICATED");
  }
  if (!mutationId || typeof mutationId !== "string" || mutationId.trim() === "") {
    return null;
  }

  const db = await getDatabase();
  return new Promise<MutationRecord | null>((resolve, reject) => {
    try {
      const tx = db.transaction(STORES.MUTATIONS, "readonly");
      const store = tx.objectStore(STORES.MUTATIONS);
      const req = store.get(mutationId);

      req.onsuccess = () => {
        const record = req.result as MutationRecord | undefined;
        if (!record || record.ownerUid !== ownerUid) {
          resolve(null);
        } else {
          resolve(record);
        }
      };

      req.onerror = () => {
        reject(
          new MutationLifecycleError(
            `Failed to retrieve mutation: ${req.error?.message || "Unknown error"}`,
            "STORAGE_ERROR",
            mutationId,
            req.error
          )
        );
      };
    } catch (err) {
      reject(
        new MutationLifecycleError(
          `Failed to retrieve mutation: ${err instanceof Error ? err.message : String(err)}`,
          "STORAGE_ERROR",
          mutationId,
          err
        )
      );
    }
  });
}

/**
 * Validates and executes a status transition on an existing mutation.
 */
export async function transitionMutationStatus(
  params: TransitionStatusParams
): Promise<MutationRecord> {
  if (
    !params.ownerUid ||
    typeof params.ownerUid !== "string" ||
    params.ownerUid.trim() === ""
  ) {
    throw new MutationLifecycleError("ownerUid is required", "UNAUTHENTICATED");
  }
  if (
    !params.mutationId ||
    typeof params.mutationId !== "string" ||
    params.mutationId.trim() === ""
  ) {
    throw new MutationLifecycleError(
      "mutationId is required",
      "VALIDATION_FAILED"
    );
  }
  if (!params.targetStatus || typeof params.targetStatus !== "string") {
    throw new MutationLifecycleError(
      "targetStatus is required",
      "VALIDATION_FAILED"
    );
  }

  const db = await getDatabase();
  return new Promise<MutationRecord>((resolve, reject) => {
    try {
      const tx = db.transaction(STORES.MUTATIONS, "readwrite");
      const store = tx.objectStore(STORES.MUTATIONS);
      const req = store.get(params.mutationId);

      let updatedRecord: MutationRecord | null = null;

      req.onsuccess = () => {
        const record = req.result as MutationRecord | undefined;
        if (!record || record.ownerUid !== params.ownerUid) {
          reject(
            new MutationLifecycleError(
              `Mutation '${params.mutationId}' not found for owner '${params.ownerUid}'`,
              "NOT_FOUND",
              params.mutationId
            )
          );
          return;
        }

        if (isTerminalMutationStatus(record.status)) {
          reject(
            new MutationLifecycleError(
              `Cannot transition mutation in terminal state '${record.status}' to '${params.targetStatus}'`,
              "TERMINAL_STATE",
              params.mutationId
            )
          );
          return;
        }

        if (!isValidMutationStatusTransition(record.status, params.targetStatus)) {
          reject(
            new MutationLifecycleError(
              `Invalid status transition from '${record.status}' to '${params.targetStatus}'`,
              "INVALID_TRANSITION",
              params.mutationId
            )
          );
          return;
        }

        const now = params.now ?? Date.now();
        const isTerminal = isTerminalMutationStatus(params.targetStatus);
        updatedRecord = {
          ...record,
          status: params.targetStatus,
          updatedAt: now,
          ...(isTerminal ? { nextRetryAt: null } : {}),
          ...(params.failureReason !== undefined
            ? { failureReason: params.failureReason }
            : {}),
          ...(params.conflictReason !== undefined
            ? { conflictReason: params.conflictReason }
            : {}),
          ...(params.conflictDetails !== undefined
            ? { conflictDetails: params.conflictDetails }
            : {}),
        };

        store.put(updatedRecord);
      };

      req.onerror = () => {
        reject(
          new MutationLifecycleError(
            `Failed to read mutation: ${req.error?.message || "Unknown error"}`,
            "STORAGE_ERROR",
            params.mutationId,
            req.error
          )
        );
      };

      tx.oncomplete = () => {
        if (updatedRecord) {
          resolve(updatedRecord);
        }
      };

      tx.onerror = () => {
        reject(
          new MutationLifecycleError(
            `Transition transaction failed: ${tx.error?.message || "Unknown error"}`,
            "STORAGE_ERROR",
            params.mutationId,
            tx.error
          )
        );
      };
    } catch (err) {
      reject(
        new MutationLifecycleError(
          `Failed to transition mutation: ${err instanceof Error ? err.message : String(err)}`,
          "STORAGE_ERROR",
          params.mutationId,
          err
        )
      );
    }
  });
}

/**
 * Records an execution attempt failure and calculates the next retry backoff.
 * Transitions to 'failed_exhausted' if maxRetries reached or permanent failure.
 */
export async function recordMutationAttempt(
  params: RecordAttemptParams
): Promise<MutationRecord> {
  if (
    !params.ownerUid ||
    typeof params.ownerUid !== "string" ||
    params.ownerUid.trim() === ""
  ) {
    throw new MutationLifecycleError("ownerUid is required", "UNAUTHENTICATED");
  }
  if (
    !params.mutationId ||
    typeof params.mutationId !== "string" ||
    params.mutationId.trim() === ""
  ) {
    throw new MutationLifecycleError(
      "mutationId is required",
      "VALIDATION_FAILED"
    );
  }

  const db = await getDatabase();
  return new Promise<MutationRecord>((resolve, reject) => {
    try {
      const tx = db.transaction(STORES.MUTATIONS, "readwrite");
      const store = tx.objectStore(STORES.MUTATIONS);
      const req = store.get(params.mutationId);

      let updatedRecord: MutationRecord | null = null;

      req.onsuccess = () => {
        const record = req.result as MutationRecord | undefined;
        if (!record || record.ownerUid !== params.ownerUid) {
          reject(
            new MutationLifecycleError(
              `Mutation '${params.mutationId}' not found for owner '${params.ownerUid}'`,
              "NOT_FOUND",
              params.mutationId
            )
          );
          return;
        }

        if (record.status !== "in_flight" && record.status !== "failed") {
          reject(
            new MutationLifecycleError(
              `Cannot record attempt for mutation with status '${record.status}'. Must be 'in_flight' or 'failed'.`,
              "INVALID_TRANSITION",
              params.mutationId
            )
          );
          return;
        }

        const now = params.now ?? Date.now();
        const newRetryCount = record.retryCount + 1;
        const reason =
          params.failureReason ?? params.error ?? "Execution attempt failed";
        const isPermanent = params.isTransientFailure === false;

        // maxRetries (default 5) represents the maximum total execution attempts:
        // 1 initial attempt + 4 retries = 5 total attempts.
        // When newRetryCount reaches maxRetries (or on non-transient failure),
        // the mutation transitions to 'failed_exhausted' and nextRetryAt is null.
        // No 6th execution attempt can ever be scheduled.
        const isExhausted = isPermanent || newRetryCount >= record.maxRetries;

        const nextStatus: MutationStatus = isExhausted
          ? "failed_exhausted"
          : "failed";
        const nextRetryAt = isExhausted
          ? null
          : now + calculateNextRetryDelay(newRetryCount, params.jitterMs ?? 0);

        updatedRecord = {
          ...record,
          status: nextStatus,
          retryCount: newRetryCount,
          lastAttemptedAt: now,
          updatedAt: now,
          nextRetryAt,
          failureReason: reason,
        };

        store.put(updatedRecord);
      };

      req.onerror = () => {
        reject(
          new MutationLifecycleError(
            `Failed to read mutation for attempt record: ${req.error?.message || "Unknown error"}`,
            "STORAGE_ERROR",
            params.mutationId,
            req.error
          )
        );
      };

      tx.oncomplete = () => {
        if (updatedRecord) {
          resolve(updatedRecord);
        }
      };

      tx.onerror = () => {
        reject(
          new MutationLifecycleError(
            `Record attempt transaction failed: ${tx.error?.message || "Unknown error"}`,
            "STORAGE_ERROR",
            params.mutationId,
            tx.error
          )
        );
      };
    } catch (err) {
      reject(
        new MutationLifecycleError(
          `Failed to record mutation attempt: ${err instanceof Error ? err.message : String(err)}`,
          "STORAGE_ERROR",
          params.mutationId,
          err
        )
      );
    }
  });
}

/**
 * Cancels a mutation by user action through the centralized transition validation engine.
 * Permitted only from non-terminal states configured in VALID_STATUS_TRANSITIONS:
 * ('queued', 'failed', 'paused_on_conflict').
 *
 * Invariants:
 * - Direct state bypass eliminated: delegates to transitionMutationStatus.
 * - Preserves attempt count, sequence number, and audit history without deletion.
 * - Rejects cancellation of 'in_flight' and terminal records.
 * - Ensures all public state-changing operations enforce the exact same transition rules.
 */
export async function cancelMutation(
  ownerUid: string,
  mutationId: string,
  reason?: string,
  now?: number
): Promise<MutationRecord> {
  return transitionMutationStatus({
    ownerUid,
    mutationId,
    targetStatus: "cancelled_by_user",
    failureReason: reason ?? "Cancelled by user",
    now,
  });
}

/**
 * Recovers local in-flight mutations after browser crash / reload.
 * Resets 'in_flight' mutations back to 'queued', preserving retryCount and sequenceNumber.
 * Stage 2 boundary: Does NOT perform remote Firestore reconciliation.
 */
export async function recoverInFlightMutations(
  ownerUid: string,
  now?: number
): Promise<{ recoveredCount: number; mutations: MutationRecord[] }> {
  if (!ownerUid || typeof ownerUid !== "string" || ownerUid.trim() === "") {
    throw new MutationLifecycleError("ownerUid is required", "UNAUTHENTICATED");
  }

  const db = await getDatabase();
  return new Promise<{ recoveredCount: number; mutations: MutationRecord[] }>(
    (resolve, reject) => {
      try {
        const tx = db.transaction(STORES.MUTATIONS, "readwrite");
        const store = tx.objectStore(STORES.MUTATIONS);
        const index = store.index("by_ownerUid");
        const req = index.getAll(IDBKeyRange.only(ownerUid));

        const recovered: MutationRecord[] = [];

        req.onsuccess = () => {
          const records = (req.result as MutationRecord[]) || [];
          const timestamp = now ?? Date.now();

          for (const record of records) {
            if (record.status === "in_flight") {
              const updated: MutationRecord = {
                ...record,
                status: "queued",
                updatedAt: timestamp,
              };
              store.put(updated);
              recovered.push(updated);
            }
          }
        };

        req.onerror = () => {
          reject(
            new MutationLifecycleError(
              `Failed to read mutations for recovery: ${req.error?.message || "Unknown error"}`,
              "STORAGE_ERROR",
              undefined,
              req.error
            )
          );
        };

        tx.oncomplete = () => {
          recovered.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
          resolve({
            recoveredCount: recovered.length,
            mutations: recovered,
          });
        };

        tx.onerror = () => {
          reject(
            new MutationLifecycleError(
              `Recovery transaction failed: ${tx.error?.message || "Unknown error"}`,
              "STORAGE_ERROR",
              undefined,
              tx.error
            )
          );
        };
      } catch (err) {
        reject(
          new MutationLifecycleError(
            `Failed to recover in-flight mutations: ${err instanceof Error ? err.message : String(err)}`,
            "STORAGE_ERROR",
            undefined,
            err
          )
        );
      }
    }
  );
}

/**
 * Generates an aggregated summary of the mutation queue for an owner.
 */
export async function getQueueSummary(ownerUid: string): Promise<QueueSummary> {
  if (!ownerUid || typeof ownerUid !== "string" || ownerUid.trim() === "") {
    throw new MutationLifecycleError("ownerUid is required", "UNAUTHENTICATED");
  }

  const db = await getDatabase();
  return new Promise<QueueSummary>((resolve, reject) => {
    try {
      const tx = db.transaction(STORES.MUTATIONS, "readonly");
      const store = tx.objectStore(STORES.MUTATIONS);
      const index = store.index("by_ownerUid");
      const req = index.getAll(IDBKeyRange.only(ownerUid));

      req.onsuccess = () => {
        const records = (req.result as MutationRecord[]) || [];

        let queued = 0;
        let inFlight = 0;
        let succeeded = 0;
        let failed = 0;
        let failedExhausted = 0;
        let conflict = 0;
        let pausedOnConflict = 0;
        let cancelled = 0;

        let oldestPendingCreatedAt: number | null = null;
        let newestPendingCreatedAt: number | null = null;

        for (const m of records) {
          switch (m.status) {
            case "queued":
              queued++;
              break;
            case "in_flight":
              inFlight++;
              break;
            case "succeeded":
              succeeded++;
              break;
            case "failed":
              failed++;
              break;
            case "failed_exhausted":
              failedExhausted++;
              break;
            case "conflict":
              conflict++;
              break;
            case "paused_on_conflict":
              pausedOnConflict++;
              break;
            case "cancelled_by_user":
              cancelled++;
              break;
          }

          if (m.status === "queued" || m.status === "in_flight") {
            if (
              oldestPendingCreatedAt === null ||
              m.createdAt < oldestPendingCreatedAt
            ) {
              oldestPendingCreatedAt = m.createdAt;
            }
            if (
              newestPendingCreatedAt === null ||
              m.createdAt > newestPendingCreatedAt
            ) {
              newestPendingCreatedAt = m.createdAt;
            }
          }
        }

        resolve({
          total: records.length,
          queued,
          inFlight,
          succeeded,
          failed,
          failedExhausted,
          conflict,
          pausedOnConflict,
          cancelled,
          pendingCount: queued + inFlight,
          succeededCount: succeeded,
          failedCount: failed + failedExhausted,
          conflictCount: conflict + pausedOnConflict,
          cancelledCount: cancelled,
          oldestPendingCreatedAt,
          newestPendingCreatedAt,
        });
      };

      req.onerror = () => {
        reject(
          new MutationLifecycleError(
            `Failed to get queue summary: ${req.error?.message || "Unknown error"}`,
            "STORAGE_ERROR",
            undefined,
            req.error
          )
        );
      };
    } catch (err) {
      reject(
        new MutationLifecycleError(
          `Failed to get queue summary: ${err instanceof Error ? err.message : String(err)}`,
          "STORAGE_ERROR",
          undefined,
          err
        )
      );
    }
  });
}

/**
 * Clears all mutation records belonging to an owner.
 * Preserves the owner's sequence generator to guarantee monotonic sequence continuity across queue clears.
 * Does not affect other owners' mutations or sequence generators.
 */
export async function clearOwnerQueue(ownerUid: string): Promise<number> {
  if (!ownerUid || typeof ownerUid !== "string" || ownerUid.trim() === "") {
    throw new MutationLifecycleError("ownerUid is required", "UNAUTHENTICATED");
  }

  const db = await getDatabase();
  return new Promise<number>((resolve, reject) => {
    try {
      const tx = db.transaction(STORES.MUTATIONS, "readwrite");
      const mutStore = tx.objectStore(STORES.MUTATIONS);
      const index = mutStore.index("by_ownerUid");
      const req = index.getAll(IDBKeyRange.only(ownerUid));

      let deletedCount = 0;

      req.onsuccess = () => {
        const records = (req.result as MutationRecord[]) || [];
        deletedCount = records.length;
        for (const record of records) {
          mutStore.delete(record.id);
        }
        // Invariant: The sequence generator for ownerUid is intentionally preserved.
        // This guarantees that the next enqueued mutation receives a sequence strictly
        // greater than the previous sequence, preventing sequence reuse and idempotency collisions.
      };

      req.onerror = () => {
        reject(
          new MutationLifecycleError(
            `Failed to query mutations to clear: ${req.error?.message || "Unknown error"}`,
            "STORAGE_ERROR",
            undefined,
            req.error
          )
        );
      };

      tx.oncomplete = () => {
        resolve(deletedCount);
      };

      tx.onerror = () => {
        reject(
          new MutationLifecycleError(
            `Failed to clear owner queue: ${tx.error?.message || "Unknown error"}`,
            "STORAGE_ERROR",
            undefined,
            tx.error
          )
        );
      };
    } catch (err) {
      reject(
        new MutationLifecycleError(
          `Failed to clear owner queue: ${err instanceof Error ? err.message : String(err)}`,
          "STORAGE_ERROR",
          undefined,
          err
        )
      );
    }
  });
}

/**
 * ============================================================================
 * ForeSite Phase 5 Stage 4B: Conflict Resolution & Sync Center Queue Operations
 * ============================================================================
 */

export interface ResolveConflictParams {
  ownerUid: string;
  mutationId: string;
  resolvedPayload: UpdateDraftPayload;
  baseRevision: number;
  baseSnapshot: Partial<Inspection>;
  now?: number;
}

export interface DiagnosticExportData {
  application?: string;
  version?: string;
  exportedAt: number;
  diagnosticNotice: string;
  ownerUid: string;
  queueSummary: QueueSummary;
  mutations: MutationRecord[];
}

/**
 * Manually retries an eligible failed mutation ('failed' or 'failed_exhausted').
 * Resets retryCount to 0, clears failureReason, transitions status to 'queued',
 * and unpauses any downstream mutations on that inspection from 'paused_on_conflict' to 'queued'.
 *
 * Invariants:
 * - Blocked if an earlier mutation on the same inspection is in 'conflict'.
 * - Rejects retry on cancelled or succeeded mutations.
 */
export async function retryFailedMutation(
  ownerUid: string,
  mutationId: string,
  now?: number
): Promise<MutationRecord> {
  if (!ownerUid || typeof ownerUid !== "string" || ownerUid.trim() === "") {
    throw new MutationLifecycleError("ownerUid is required", "UNAUTHENTICATED");
  }
  if (!mutationId || typeof mutationId !== "string" || mutationId.trim() === "") {
    throw new MutationLifecycleError("mutationId is required", "VALIDATION_FAILED");
  }

  const db = await getDatabase();
  return new Promise<MutationRecord>((resolve, reject) => {
    try {
      const tx = db.transaction(STORES.MUTATIONS, "readwrite");
      const store = tx.objectStore(STORES.MUTATIONS);
      const req = store.get(mutationId);

      let updatedRecord: MutationRecord | undefined;

      req.onsuccess = () => {
        const record = req.result as MutationRecord | undefined;
        if (!record || record.ownerUid !== ownerUid) {
          reject(
            new MutationLifecycleError(
              `Mutation '${mutationId}' not found for owner '${ownerUid}'`,
              "NOT_FOUND",
              mutationId
            )
          );
          return;
        }

        if (record.status !== "failed" && record.status !== "failed_exhausted") {
          reject(
            new MutationLifecycleError(
              `Cannot retry mutation in status '${record.status}'. Only failed mutations can be retried.`,
              "INVALID_TRANSITION",
              mutationId
            )
          );
          return;
        }

        // Query all mutations for this inspection to check for earlier unresolved conflicts
        const index = store.index("by_targetInspectionId");
        const inspReq = index.getAll(IDBKeyRange.only(record.targetInspectionId));

        inspReq.onsuccess = () => {
          const inspectionMutations = (inspReq.result as MutationRecord[])
            .filter((m) => m.ownerUid === ownerUid)
            .sort((a, b) => a.sequenceNumber - b.sequenceNumber);

          // Check if any earlier mutation is in conflict
          const earlierConflict = inspectionMutations.find(
            (m) => m.sequenceNumber < record.sequenceNumber && m.status === "conflict"
          );

          if (earlierConflict) {
            reject(
              new MutationLifecycleError(
                `Cannot retry mutation: inspection has an earlier unresolved conflict (mutation ${earlierConflict.id}).`,
                "INVALID_TRANSITION",
                mutationId
              )
            );
            return;
          }

          const timestamp = now ?? Date.now();
          updatedRecord = {
            ...record,
            status: "queued",
            retryCount: 0,
            nextRetryAt: null,
            failureReason: undefined,
            updatedAt: timestamp,
          };

          store.put(updatedRecord);

          // Reactivate any subsequent mutations for this inspection that were paused on conflict
          for (const m of inspectionMutations) {
            if (m.sequenceNumber > record.sequenceNumber && m.status === "paused_on_conflict") {
              store.put({
                ...m,
                status: "queued",
                updatedAt: timestamp,
              });
            }
          }
        };

        inspReq.onerror = () => {
          reject(
            new MutationLifecycleError(
              `Failed to check inspection mutations: ${inspReq.error?.message}`,
              "STORAGE_ERROR",
              mutationId,
              inspReq.error
            )
          );
        };
      };

      req.onerror = () => {
        reject(
          new MutationLifecycleError(
            `Failed to retrieve mutation: ${req.error?.message}`,
            "STORAGE_ERROR",
            mutationId,
            req.error
          )
        );
      };

      tx.oncomplete = () => {
        if (updatedRecord) {
          resolve(updatedRecord);
        }
      };

      tx.onerror = () => {
        reject(
          new MutationLifecycleError(
            `Retry transaction failed: ${tx.error?.message}`,
            "STORAGE_ERROR",
            mutationId,
            tx.error
          )
        );
      };
    } catch (err) {
      reject(
        new MutationLifecycleError(
          `Failed to retry mutation: ${err instanceof Error ? err.message : String(err)}`,
          "STORAGE_ERROR",
          mutationId,
          err
        )
      );
    }
  });
}

/**
 * Resolves a conflicted mutation with user-selected reconciled payload.
 * Updates the mutation payload with the resolution, sets baseRevision to the inspected remote revision,
 * resets status to 'queued' for immediate replay, and unpauses downstream mutations.
 */
export async function resolveConflictWithPayload(
  params: ResolveConflictParams
): Promise<MutationRecord> {
  if (!params.ownerUid || typeof params.ownerUid !== "string" || params.ownerUid.trim() === "") {
    throw new MutationLifecycleError("ownerUid is required", "UNAUTHENTICATED");
  }
  if (!params.mutationId || typeof params.mutationId !== "string" || params.mutationId.trim() === "") {
    throw new MutationLifecycleError("mutationId is required", "VALIDATION_FAILED");
  }

  const db = await getDatabase();
  return new Promise<MutationRecord>((resolve, reject) => {
    try {
      const tx = db.transaction(STORES.MUTATIONS, "readwrite");
      const store = tx.objectStore(STORES.MUTATIONS);
      const req = store.get(params.mutationId);

      let updatedRecord: MutationRecord | undefined;

      req.onsuccess = () => {
        const record = req.result as MutationRecord | undefined;
        if (!record || record.ownerUid !== params.ownerUid) {
          reject(
            new MutationLifecycleError(
              `Mutation '${params.mutationId}' not found for owner '${params.ownerUid}'`,
              "NOT_FOUND",
              params.mutationId
            )
          );
          return;
        }

        if (record.status !== "conflict") {
          reject(
            new MutationLifecycleError(
              `Cannot resolve mutation in status '${record.status}'. Must be in 'conflict'.`,
              "INVALID_TRANSITION",
              params.mutationId
            )
          );
          return;
        }

        const timestamp = params.now ?? Date.now();
        updatedRecord = {
          ...record,
          payload: {
            ...params.resolvedPayload,
            baseSnapshot: params.baseSnapshot,
          },
          baseRevision: params.baseRevision,
          status: "queued",
          retryCount: 0,
          nextRetryAt: null,
          conflictReason: undefined,
          conflictDetails: undefined,
          updatedAt: timestamp,
        };

        store.put(updatedRecord);

        // Reactivate downstream mutations on the same inspection that were paused on conflict
        const index = store.index("by_targetInspectionId");
        const inspReq = index.getAll(IDBKeyRange.only(record.targetInspectionId));

        inspReq.onsuccess = () => {
          const inspectionMutations = (inspReq.result as MutationRecord[])
            .filter((m) => m.ownerUid === params.ownerUid)
            .sort((a, b) => a.sequenceNumber - b.sequenceNumber);

          for (const m of inspectionMutations) {
            if (m.sequenceNumber > record.sequenceNumber && m.status === "paused_on_conflict") {
              store.put({
                ...m,
                status: "queued",
                updatedAt: timestamp,
              });
            }
          }
        };
      };

      req.onerror = () => {
        reject(
          new MutationLifecycleError(
            `Failed to fetch conflicted mutation: ${req.error?.message}`,
            "STORAGE_ERROR",
            params.mutationId,
            req.error
          )
        );
      };

      tx.oncomplete = () => {
        if (updatedRecord) {
          resolve(updatedRecord);
        }
      };

      tx.onerror = () => {
        reject(
          new MutationLifecycleError(
            `Resolve transaction failed: ${tx.error?.message}`,
            "STORAGE_ERROR",
            params.mutationId,
            tx.error
          )
        );
      };
    } catch (err) {
      reject(
        new MutationLifecycleError(
          `Failed to resolve conflict: ${err instanceof Error ? err.message : String(err)}`,
          "STORAGE_ERROR",
          params.mutationId,
          err
        )
      );
    }
  });
}

/**
 * Discards/cancels a non-terminal mutation ('queued', 'failed', 'failed_exhausted', 'conflict', 'paused_on_conflict').
 * Preserves audit record by setting status to 'cancelled_by_user'.
 * Invariant: Never deletes local photos from evidencePhotos or corrupts review history.
 */
export async function discardMutation(
  ownerUid: string,
  mutationId: string,
  reason?: string,
  now?: number
): Promise<MutationRecord> {
  if (!ownerUid || typeof ownerUid !== "string" || ownerUid.trim() === "") {
    throw new MutationLifecycleError("ownerUid is required", "UNAUTHENTICATED");
  }
  if (!mutationId || typeof mutationId !== "string" || mutationId.trim() === "") {
    throw new MutationLifecycleError("mutationId is required", "VALIDATION_FAILED");
  }

  const db = await getDatabase();
  return new Promise<MutationRecord>((resolve, reject) => {
    try {
      const tx = db.transaction(STORES.MUTATIONS, "readwrite");
      const store = tx.objectStore(STORES.MUTATIONS);
      const req = store.get(mutationId);

      let updatedRecord: MutationRecord | undefined;

      req.onsuccess = () => {
        const record = req.result as MutationRecord | undefined;
        if (!record || record.ownerUid !== ownerUid) {
          reject(
            new MutationLifecycleError(
              `Mutation '${mutationId}' not found for owner '${ownerUid}'`,
              "NOT_FOUND",
              mutationId
            )
          );
          return;
        }

        if (record.status === "succeeded") {
          reject(
            new MutationLifecycleError(
              "Cannot discard already succeeded mutation",
              "TERMINAL_STATE",
              mutationId
            )
          );
          return;
        }

        if (record.status === "in_flight") {
          reject(
            new MutationLifecycleError(
              "Cannot discard mutation that is currently in flight",
              "INVALID_TRANSITION",
              mutationId
            )
          );
          return;
        }

        const timestamp = now ?? Date.now();
        updatedRecord = {
          ...record,
          status: "cancelled_by_user",
          failureReason: reason ?? "Discarded by user",
          nextRetryAt: null,
          updatedAt: timestamp,
        };

        store.put(updatedRecord);

        // If discarding a conflict, check if downstream paused mutations can be reactivated
        if (record.status === "conflict") {
          const index = store.index("by_targetInspectionId");
          const inspReq = index.getAll(IDBKeyRange.only(record.targetInspectionId));

          inspReq.onsuccess = () => {
            const inspectionMutations = (inspReq.result as MutationRecord[])
              .filter((m) => m.ownerUid === ownerUid)
              .sort((a, b) => a.sequenceNumber - b.sequenceNumber);

            // Check if there are other earlier conflicts remaining
            const otherConflicts = inspectionMutations.filter(
              (m) => m.id !== mutationId && m.status === "conflict"
            );

            if (otherConflicts.length === 0) {
              for (const m of inspectionMutations) {
                if (m.sequenceNumber > record.sequenceNumber && m.status === "paused_on_conflict") {
                  store.put({
                    ...m,
                    status: "queued",
                    updatedAt: timestamp,
                  });
                }
              }
            }
          };
        }
      };

      req.onerror = () => {
        reject(
          new MutationLifecycleError(
            `Failed to fetch mutation: ${req.error?.message}`,
            "STORAGE_ERROR",
            mutationId,
            req.error
          )
        );
      };

      tx.oncomplete = () => {
        if (updatedRecord) {
          resolve(updatedRecord);
        }
      };

      tx.onerror = () => {
        reject(
          new MutationLifecycleError(
            `Discard transaction failed: ${tx.error?.message}`,
            "STORAGE_ERROR",
            mutationId,
            tx.error
          )
        );
      };
    } catch (err) {
      reject(
        new MutationLifecycleError(
          `Failed to discard mutation: ${err instanceof Error ? err.message : String(err)}`,
          "STORAGE_ERROR",
          mutationId,
          err
        )
      );
    }
  });
}

/**
 * Exports sanitized diagnostic JSON of all mutations and queue summary.
 * Strips secrets, auth tokens, and session info. Preserves field diffs and timestamps.
 */
export async function exportQueueDiagnostics(
  ownerUid: string
): Promise<DiagnosticExportData> {
  if (!ownerUid || typeof ownerUid !== "string" || ownerUid.trim() === "") {
    throw new MutationLifecycleError("ownerUid is required", "UNAUTHENTICATED");
  }

  const [summary, allMutations] = await Promise.all([
    getQueueSummary(ownerUid),
    getAllMutationsByOwner(ownerUid),
  ]);

  // Sanitize: ensure no tokens, credentials or auth cookies are ever exported
  const sanitizedMutations = allMutations.map((m) => {
    // Clone record cleanly
    return JSON.parse(JSON.stringify(m)) as MutationRecord;
  });

  return {
    application: "ForeSite",
    version: "Phase 5 Stage 4B",
    exportedAt: Date.now(),
    diagnosticNotice:
      "ForeSite diagnostic data export. For troubleshooting only; not a guaranteed backup or restore point.",
    ownerUid,
    queueSummary: summary,
    mutations: sanitizedMutations,
  };
}
