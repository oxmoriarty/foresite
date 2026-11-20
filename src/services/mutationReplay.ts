/**
 * ForeSite Durable Mutation Replay Service (Stage 3A: Replay Foundation & CREATE_INSPECTION Pilot)
 *
 * Implements safe, authenticated, durable online mutation replay against Cloud Firestore
 * with multi-tab Web Locks coordination, strict authentication boundaries, deterministic
 * FIFO per-inspection serialization, atomic read-before-create transactions with durable
 * creation identities, and bounded retry semantics.
 *
 * Invariants:
 * 1. Authenticated Queue Ownership: Derives owner strictly from auth.currentUser.uid.
 *    Revalidates ownership before each mutation and across asynchronous boundaries.
 * 2. Multi-Tab Coordination: Uses Web Locks API with owner-scoped lock name.
 *    Fails closed when Web Locks is unavailable to prevent concurrent queue corruption.
 * 3. Canonical ID Preservation: Reuses client-generated targetInspectionId as Firestore doc ID.
 * 4. Atomic Transaction & Durable Identity: Transactional read-before-create with clientCreationNonce.
 *    Guarantees idempotency under sequential retries and prevents overwrite under concurrent independent clients.
 * 5. Error Classification: Inspects documented codes before messages; permanent codes are never transient.
 * 6. Zero Binary Blobs: Only metadata is synced to Firestore; photo Blobs remain in IndexedDB.
 */

import { auth } from "../lib/firebase";
import {
  Inspection,
  MutationRecord,
  ReplayResult,
  ReplayStatus,
  ReplayItemResult,
  LockCoordinator,
  ReplayOptions,
  InspectionSyncStatus,
  GetSyncStatusOptions,
  CreateInspectionPayload,
  UpdateDraftPayload,
  TransitionReviewPayload,
  ArchiveInspectionPayload,
  UnarchiveInspectionPayload,
} from "../types";
import {
  enqueueMutation,
  getAllMutationsByOwner,
  getMutationsByInspection,
  hasAnyMutationForInspection,
  transitionMutationStatus,
  recordMutationAttempt,
  recoverInFlightMutations,
} from "./mutationQueue";
import {
  createInspectionTransaction,
  updateInspectionDraftTransaction,
  transitionInspectionReviewTransaction,
  archiveInspectionTransaction,
  unarchiveInspectionTransaction,
  deleteInspectionTransaction,
} from "./firestore";
import {
  getLocalDraft,
  saveLocalDraft,
  getAllLocalDrafts,
  deleteLocalDraft,
  getDeletionReceiptByInspection,
  saveDeletionReceipt,
} from "./indexeddb";
import {
  confirmRemoteDeletion,
  executePhotoCleanup,
  recoverPhotoCleanups,
} from "./photoCleanup";

// ============================================================================
// 1. Multi-Tab Coordination (Web Locks API & Safe Fail-Closed Fallback)
// ============================================================================

export const defaultWebLocksCoordinator: LockCoordinator = {
  async requestLock<T>(
    lockName: string,
    callback: () => Promise<T>
  ): Promise<{ acquired: boolean; result?: T; reason?: string; unsupported?: boolean }> {
    if (
      typeof navigator === "undefined" ||
      !navigator.locks ||
      typeof navigator.locks.request !== "function"
    ) {
      return {
        acquired: false,
        unsupported: true,
        reason: "Web Locks API is unavailable in this environment; replay disabled to prevent concurrent corruption",
      };
    }

    try {
      let acquired = false;
      let callbackResult: T | undefined;
      let callbackError: unknown = null;

      await navigator.locks.request(lockName, { ifAvailable: true }, async (lock) => {
        if (!lock) {
          acquired = false;
          return;
        }
        acquired = true;
        try {
          callbackResult = await callback();
        } catch (err) {
          callbackError = err;
        }
      });

      if (!acquired) {
        return {
          acquired: false,
          reason: "Lock contention: another tab is currently replaying mutations for this owner",
        };
      }

      if (callbackError) {
        throw callbackError;
      }

      return {
        acquired: true,
        result: callbackResult,
      };
    } catch (err) {
      if (err instanceof Error) {
        return {
          acquired: false,
          reason: err.message,
        };
      }
      return {
        acquired: false,
        reason: "Unknown lock acquisition error",
      };
    }
  },
};

// ============================================================================
// 2. Error Classification
// ============================================================================

export interface ClassifiedError {
  kind: "transient" | "permanent" | "conflict";
  message: string;
  code?: string;
}

/**
 * Classifies Firestore, Firebase, and network errors into actionable retry categories.
 * Strict Evaluation Rules:
 * 1. Documented permanent error codes are checked FIRST. A permanent code is never made transient
 *    by message substrings (e.g. 'network' or 'timeout').
 * 2. Conflict errors are routed to domain conflict and kept out of retry loops.
 * 3. Transient codes are checked next.
 * 4. Fallback message inspection only applies when no documented code is present.
 * 5. Unknown errors fail safely as permanent to prevent infinite retry loops.
 */
export function classifyFirestoreError(err: unknown): ClassifiedError {
  let message = "Unknown error during mutation replay";
  let code: string | undefined;

  if (err instanceof Error) {
    message = err.message;
    if ("code" in err && typeof (err as { code: unknown }).code === "string") {
      code = (err as { code: string }).code;
    }
  } else if (typeof err === "string") {
    message = err;
  }

  const normalizedCode = code ? code.replace(/^firestore\//, "") : "";

  // 1. Permanent validation, authorization, or schema errors FIRST (code-driven)
  const isPermanentCode = [
    "permission-denied",
    "unauthenticated",
    "invalid-argument",
    "failed-precondition",
    "not-found",
    "out-of-range",
    "data-loss",
  ].includes(normalizedCode);

  if (isPermanentCode) {
    return { kind: "permanent", message, code: normalizedCode };
  }

  // 2. Remote or domain conflict
  if (
    normalizedCode === "already-exists" ||
    /already[- ]exists/i.test(message)
  ) {
    return { kind: "conflict", message, code: normalizedCode || "already-exists" };
  }

  // 3. Transient connectivity / availability errors (code-driven)
  const isTransientCode = [
    "unavailable",
    "resource-exhausted",
    "deadline-exceeded",
    "network-request-failed",
    "cancelled",
    "aborted",
  ].includes(normalizedCode);

  if (isTransientCode) {
    return { kind: "transient", message, code: normalizedCode };
  }

  // 4. Fallback message-based transient check ONLY when no recognized code is present
  if (!normalizedCode) {
    const isTransientMessage =
      /network[- ]request[- ]failed|failed to fetch|econnreset|offline/i.test(message);

    if (isTransientMessage) {
      return { kind: "transient", message, code: "unavailable" };
    }
  }

  // 5. Safe failure for unknown errors
  return { kind: "permanent", message, code: normalizedCode || "unknown" };
}

// ============================================================================
// 3. Local Crash-Window Recovery Helper
// ============================================================================

/**
 * Detects locally saved unsynchronized drafts that have no corresponding queue mutation
 * (e.g. browser crash between saveLocalDraft and enqueueMutation).
 *
 * Invariants & Account Isolation:
 * 1. Derives authenticated UID strictly from Firebase Auth. Caller-supplied UID is verified.
 * 2. Strict Ownership Matching: Only recovers drafts whose persisted draft.ownerUid strictly
 *    matches the active authenticated UID.
 * 3. Never Adopts Foreign/Unowned:
 *    - Drafts with missing ownership (legacy) remain local-only; NEVER recovered.
 *    - Drafts owned by another user (User A vs User B) are excluded completely.
 *    - Drafts with invalid/empty ownership are excluded completely.
 * 4. Terminal State Protection:
 *    - Checks getMutationsByInspection and hasAnyMutationForInspection.
 *    - Never duplicates queued, in_flight, or succeeded mutations.
 *    - Never restarts conflict or failed_exhausted mutations.
 *    - Never recreates cancelled_by_user mutations (respects explicit user decision).
 *    - Preserves retryable failed mutations on their existing backoff schedule.
 * 5. Revalidates auth after every asynchronous boundary; aborts safely on account switch.
 */
export async function recoverUnenqueuedDrafts(
  expectedOwnerUid?: string,
  now?: number
): Promise<number> {
  const currentAuthUser = auth.currentUser;
  if (!currentAuthUser || !currentAuthUser.uid || currentAuthUser.uid.trim() === "") {
    return 0;
  }
  const authenticatedUid = currentAuthUser.uid;

  if (expectedOwnerUid && expectedOwnerUid !== authenticatedUid) {
    return 0;
  }

  const timestamp = now ?? Date.now();
  let recoveredCount = 0;

  try {
    const allDrafts = await getAllLocalDrafts();

    // Revalidate auth after async read
    if (auth.currentUser?.uid !== authenticatedUid) {
      return recoveredCount;
    }

    for (const draft of allDrafts) {
      // Revalidate auth at each loop iteration
      if (auth.currentUser?.uid !== authenticatedUid) {
        break;
      }

      // Only inspect unsynchronized drafts
      if (draft.isSynced) {
        continue;
      }

      // Invariant: Strict Ownership Matching
      // Missing ownership, foreign ownership, or invalid ownership are excluded
      if (
        !draft.ownerUid ||
        typeof draft.ownerUid !== "string" ||
        draft.ownerUid.trim() === "" ||
        draft.ownerUid !== authenticatedUid
      ) {
        continue;
      }

      // Check if a mutation already exists for this inspection for this owner
      const existingMutations = await getMutationsByInspection(authenticatedUid, draft.id);

      // Revalidate auth after async check
      if (auth.currentUser?.uid !== authenticatedUid) {
        break;
      }

      // If any mutation exists under this owner (queued, in_flight, succeeded, conflict,
      // paused_on_conflict, failed_exhausted, cancelled_by_user, failed), do not re-enqueue
      if (existingMutations.length > 0) {
        continue;
      }

      // Also verify no mutations exist for this inspection under ANY owner
      const hasAny = await hasAnyMutationForInspection(draft.id);

      // Revalidate auth after async check
      if (auth.currentUser?.uid !== authenticatedUid) {
        break;
      }

      if (hasAny) {
        continue;
      }

      // Enqueue missing CREATE_INSPECTION mutation using canonical draft ID
      await enqueueMutation({
        ownerUid: authenticatedUid,
        targetInspectionId: draft.id,
        type: "CREATE_INSPECTION",
        payload: {
          type: "CREATE_INSPECTION",
          inspection: {
            id: draft.id,
            ownerUid: authenticatedUid,
            projectId: draft.projectId,
            projectName: draft.projectName || "Local Project",
            title: draft.title,
            observation: draft.observation,
            category: draft.category,
            visibleEvidence: draft.visibleEvidence,
            uncertainties: draft.uncertainties,
            inspectorFollowUp: draft.inspectorFollowUp,
            reviewStatus: draft.reviewStatus || "draft_generated",
            reviewHistory: draft.reviewHistory || [],
            reviewedAt: draft.reviewedAt,
            reviewedByUid: draft.reviewedByUid,
            revision: draft.revision || 1,
            aiAssisted: false,
            photoIds: draft.photoIds,
            createdAt: draft.createdAt,
            updatedAt: draft.lastSavedAt,
          },
        },
        baseRevision: draft.revision || 1,
        now: timestamp,
      });

      recoveredCount++;
    }
  } catch (err) {
    console.warn("Failed to recover unenqueued drafts:", err);
  }

  return recoveredCount;
}

// ============================================================================
// 4. Replay Processor Implementation
// ============================================================================

/**
 * Processes queued offline mutations for the authenticated user against Cloud Firestore.
 * Strictly limited to CREATE_INSPECTION in Stage 3A.
 */
export async function replayQueuedMutations(
  options?: ReplayOptions
): Promise<ReplayResult> {
  // 1. Authenticated Queue Ownership Check
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.uid || currentUser.uid.trim() === "") {
    return {
      status: "UNAUTHENTICATED",
      processedCount: 0,
      succeededCount: 0,
      failedCount: 0,
      conflictCount: 0,
      itemResults: [],
      message: "No authenticated user session found; replay aborted",
    };
  }

  const authenticatedUid = currentUser.uid;
  const coordinator = options?.lockCoordinator ?? defaultWebLocksCoordinator;
  const lockName = `foresite_replay_${authenticatedUid}`;
  const now = options?.now ?? Date.now();

  // 2. Multi-Tab Coordination Lock
  const lockOutcome = await coordinator.requestLock(lockName, async () => {
    return await executeReplayBatch(authenticatedUid, now, options?.maxMutations);
  });

  if (lockOutcome.unsupported) {
    return {
      status: "WEB_LOCKS_UNAVAILABLE",
      processedCount: 0,
      succeededCount: 0,
      failedCount: 0,
      conflictCount: 0,
      itemResults: [],
      message: lockOutcome.reason,
    };
  }

  if (!lockOutcome.acquired) {
    return {
      status: "LOCKED_BY_ANOTHER_TAB",
      processedCount: 0,
      succeededCount: 0,
      failedCount: 0,
      conflictCount: 0,
      itemResults: [],
      message: lockOutcome.reason,
    };
  }

  return lockOutcome.result!;
}

/**
 * Internal execution batch holding the Web Lock and processing mutations sequentially.
 */
async function executeReplayBatch(
  authenticatedUid: string,
  now: number,
  maxMutations?: number
): Promise<ReplayResult> {
  const itemResults: ReplayItemResult[] = [];
  let succeededCount = 0;
  let failedCount = 0;
  let conflictCount = 0;
  let processedCount = 0;

  // Verify ownership before beginning
  if (auth.currentUser?.uid !== authenticatedUid) {
    return {
      status: auth.currentUser ? "USER_SWITCHED" : "UNAUTHENTICATED",
      processedCount: 0,
      succeededCount: 0,
      failedCount: 0,
      conflictCount: 0,
      itemResults: [],
      message: "Authentication state changed before batch execution",
    };
  }

  // Recover any orphaned in_flight mutations from previous crashes
  await recoverInFlightMutations(authenticatedUid, now);

  if (auth.currentUser?.uid !== authenticatedUid) {
    return {
      status: auth.currentUser ? "USER_SWITCHED" : "UNAUTHENTICATED",
      processedCount: 0,
      succeededCount: 0,
      failedCount: 0,
      conflictCount: 0,
      itemResults: [],
      message: "Authentication state changed during crash recovery",
    };
  }

  // Recover any local unsynced drafts that missed queue insertion (crash-window recovery)
  await recoverUnenqueuedDrafts(authenticatedUid, now);

  if (auth.currentUser?.uid !== authenticatedUid) {
    return {
      status: auth.currentUser ? "USER_SWITCHED" : "UNAUTHENTICATED",
      processedCount: 0,
      succeededCount: 0,
      failedCount: 0,
      conflictCount: 0,
      itemResults: [],
      message: "Authentication state changed during draft recovery",
    };
  }

  // Recover any interrupted photo blob cleanups from previous crashes (Phase 5 Stage 4C)
  await recoverPhotoCleanups(authenticatedUid, now);

  if (auth.currentUser?.uid !== authenticatedUid) {
    return {
      status: auth.currentUser ? "USER_SWITCHED" : "UNAUTHENTICATED",
      processedCount: 0,
      succeededCount: 0,
      failedCount: 0,
      conflictCount: 0,
      itemResults: [],
      message: "Authentication state changed during photo cleanup recovery",
    };
  }

  // Fetch all mutations for this authenticated owner
  const allMutations = await getAllMutationsByOwner(authenticatedUid);

  // Track inspections blocked by earlier conflicts or unresolved errors
  const blockedInspections = new Set<string>();

  for (const m of allMutations) {
    if (
      m.status === "conflict" ||
      m.status === "paused_on_conflict" ||
      m.status === "failed_exhausted"
    ) {
      blockedInspections.add(m.targetInspectionId);
    }
  }

  for (const mutation of allMutations) {
    // Revalidate authenticated ownership at each iteration boundary
    if (auth.currentUser?.uid !== authenticatedUid) {
      return {
        status: auth.currentUser ? "USER_SWITCHED" : "UNAUTHENTICATED",
        processedCount,
        succeededCount,
        failedCount,
        conflictCount,
        itemResults,
        message: "Authentication state changed during mutation processing",
      };
    }

    // Stop if maxMutations batch limit reached
    if (maxMutations && processedCount >= maxMutations) {
      break;
    }

    // If this inspection is blocked by an earlier unresolved mutation, pause subsequent mutations
    if (blockedInspections.has(mutation.targetInspectionId)) {
      if (mutation.status === "queued") {
        // Paused behind earlier blocked mutation
        continue;
      }
      continue;
    }

    // Handle retry timing for previously failed mutations
    if (mutation.status === "failed") {
      if (mutation.nextRetryAt && mutation.nextRetryAt > now) {
        // Retry delay has not elapsed yet; block inspection from advancing out-of-order
        blockedInspections.add(mutation.targetInspectionId);
        continue;
      }

      // Ready to retry: transition failed -> queued
      await transitionMutationStatus({
        ownerUid: authenticatedUid,
        mutationId: mutation.id,
        targetStatus: "queued",
        now,
      });

      if (auth.currentUser?.uid !== authenticatedUid) {
        return {
          status: auth.currentUser ? "USER_SWITCHED" : "UNAUTHENTICATED",
          processedCount,
          succeededCount,
          failedCount,
          conflictCount,
          itemResults,
          message: "Authentication state changed during retry transition",
        };
      }
      mutation.status = "queued";
    }

    // Only process queued mutations
    if (mutation.status !== "queued") {
      continue;
    }

    // Dispatch mutation to type-specific replay handler
    let result: { itemResult: ReplayItemResult; abortedDueToAuth: boolean };

    switch (mutation.type) {
      case "CREATE_INSPECTION":
        result = await processCreateInspectionMutation(authenticatedUid, mutation, now);
        break;
      case "UPDATE_DRAFT":
        result = await processUpdateDraftMutation(authenticatedUid, mutation, now);
        break;
      case "TRANSITION_REVIEW":
        result = await processTransitionReviewMutation(authenticatedUid, mutation, now);
        break;
      case "ARCHIVE_INSPECTION":
        result = await processArchiveInspectionMutation(authenticatedUid, mutation, now);
        break;
      case "UNARCHIVE_INSPECTION":
        result = await processUnarchiveInspectionMutation(authenticatedUid, mutation, now);
        break;
      case "DELETE_INSPECTION":
        result = await processDeleteInspectionMutation(authenticatedUid, mutation, now);
        break;
      default: {
        const unkUpdated = await transitionMutationStatus({
          ownerUid: authenticatedUid,
          mutationId: mutation.id,
          targetStatus: "conflict",
          conflictReason: `Unknown mutation type: ${(mutation as { type: string }).type}`,
          now,
        });
        result = {
          itemResult: {
            mutationId: mutation.id,
            targetInspectionId: mutation.targetInspectionId,
            type: mutation.type,
            status: unkUpdated.status,
            error: `Unknown mutation type: ${(mutation as { type: string }).type}`,
          },
          abortedDueToAuth: false,
        };
        break;
      }
    }

    if (result.abortedDueToAuth) {
      return {
        status: auth.currentUser ? "USER_SWITCHED" : "UNAUTHENTICATED",
        processedCount,
        succeededCount,
        failedCount,
        conflictCount,
        itemResults,
        message: "Authentication state changed during mutation processing",
      };
    }

    processedCount++;
    itemResults.push(result.itemResult);

    if (result.itemResult.status === "succeeded") {
      succeededCount++;
    } else if (result.itemResult.status === "conflict") {
      conflictCount++;
      blockedInspections.add(mutation.targetInspectionId);
    } else {
      failedCount++;
      blockedInspections.add(mutation.targetInspectionId);
    }
  }

  const overallStatus: ReplayStatus =
    failedCount > 0 || conflictCount > 0
      ? succeededCount > 0
        ? "PARTIAL_SUCCESS"
        : "ERROR"
      : "SUCCESS";

  return {
    status: overallStatus,
    processedCount,
    succeededCount,
    failedCount,
    conflictCount,
    itemResults,
  };
}

/**
 * Executes a single CREATE_INSPECTION mutation via atomic read-before-create transaction
 * with durable creation identity (mutation.id).
 */
async function processCreateInspectionMutation(
  authenticatedUid: string,
  mutation: MutationRecord,
  now: number
): Promise<{
  itemResult: ReplayItemResult;
  abortedDueToAuth: boolean;
}> {
  // 1. Transition queued -> in_flight
  await transitionMutationStatus({
    ownerUid: authenticatedUid,
    mutationId: mutation.id,
    targetStatus: "in_flight",
    now,
  });

  // Revalidate auth after transition
  if (auth.currentUser?.uid !== authenticatedUid) {
    return {
      itemResult: {
        mutationId: mutation.id,
        targetInspectionId: mutation.targetInspectionId,
        type: mutation.type,
        status: "in_flight",
        error: "Auth changed during in_flight transition",
      },
      abortedDueToAuth: true,
    };
  }

  const targetInspectionId = mutation.targetInspectionId;
  const payload = mutation.payload as CreateInspectionPayload;
  const inspectionPayload = payload.inspection;

  // Invariant: Omit binary Blobs. photoMeta remains metadata only.
  const remoteInspectionData: Omit<Inspection, "id" | "ownerUid" | "createdAt" | "updatedAt"> & {
    id: string;
    createdAt?: number;
    updatedAt?: number;
  } = {
    id: targetInspectionId,
    projectId: inspectionPayload.projectId,
    projectName: inspectionPayload.projectName,
    title: inspectionPayload.title,
    observation: inspectionPayload.observation,
    category: inspectionPayload.category,
    visibleEvidence: inspectionPayload.visibleEvidence || [],
    uncertainties: inspectionPayload.uncertainties || [],
    inspectorFollowUp: inspectionPayload.inspectorFollowUp || [],
    reviewStatus: inspectionPayload.reviewStatus || "draft_generated",
    reviewHistory: inspectionPayload.reviewHistory || [],
    appliedMutationIds: inspectionPayload.appliedMutationIds || [],
    isArchived: inspectionPayload.isArchived ?? false,
    revision: inspectionPayload.revision || 1,
    aiAssisted: inspectionPayload.aiAssisted ?? false,
    inferenceSource: inspectionPayload.inferenceSource,
    photoMeta: inspectionPayload.photoMeta,
    photoIds: inspectionPayload.photoIds || [],
    ...(inspectionPayload.summary ? { summary: inspectionPayload.summary } : {}),
    ...(inspectionPayload.weatherNotes ? { weatherNotes: inspectionPayload.weatherNotes } : {}),
    ...(inspectionPayload.items ? { items: inspectionPayload.items } : {}),
    createdAt: inspectionPayload.createdAt || mutation.createdAt || now,
    updatedAt: inspectionPayload.updatedAt || mutation.createdAt || now,
  };

  try {
    // 2. Atomic read-before-create transaction with durable mutation.id creation identity
    const txResult = await createInspectionTransaction(
      authenticatedUid,
      remoteInspectionData,
      mutation.id
    );

    // Revalidate auth after Firestore transaction
    if (auth.currentUser?.uid !== authenticatedUid) {
      return {
        itemResult: {
          mutationId: mutation.id,
          targetInspectionId,
          type: mutation.type,
          status: "in_flight",
          error: "Auth changed immediately after Firestore transaction",
        },
        abortedDueToAuth: true,
      };
    }

    if (txResult.status === "CREATED" || txResult.status === "ALREADY_EXISTS_SAME_MUTATION") {
      // Remote write succeeded or confirmed committed previously!
      await transitionMutationStatus({
        ownerUid: authenticatedUid,
        mutationId: mutation.id,
        targetStatus: "succeeded",
        now,
      });

      // Synchronize local draft flag upon confirmed Firestore acknowledgement
      try {
        const draft = await getLocalDraft(targetInspectionId);
        if (draft) {
          await saveLocalDraft({ ...draft, isSynced: true });
        }
      } catch {
        // Non-critical local draft update
      }

      return {
        itemResult: {
          mutationId: mutation.id,
          targetInspectionId,
          type: mutation.type,
          status: "succeeded",
        },
        abortedDueToAuth: false,
      };
    }

    // txResult.status === "CONFLICT": Target document exists with differing or missing creation identity!
    const conflictReason =
      txResult.reason || "Remote inspection document collision or conflicting creation identity";
    const updated = await transitionMutationStatus({
      ownerUid: authenticatedUid,
      mutationId: mutation.id,
      targetStatus: "conflict",
      conflictReason,
      conflictDetails: txResult.conflictDetails,
      now,
    });

    return {
      itemResult: {
        mutationId: mutation.id,
        targetInspectionId,
        type: mutation.type,
        status: updated.status,
        error: conflictReason,
      },
      abortedDueToAuth: false,
    };
  } catch (err) {
    return handleMutationError(authenticatedUid, mutation, err, now);
  }
}

/**
 * Handles errors for all mutation replay attempts, enforcing deterministic error classification
 * and strict retry vs conflict routing.
 */
async function handleMutationError(
  authenticatedUid: string,
  mutation: MutationRecord,
  err: unknown,
  now: number
): Promise<{
  itemResult: ReplayItemResult;
  abortedDueToAuth: boolean;
}> {
  if (auth.currentUser?.uid !== authenticatedUid) {
    return {
      itemResult: {
        mutationId: mutation.id,
        targetInspectionId: mutation.targetInspectionId,
        type: mutation.type,
        status: "in_flight",
        error: "Auth changed during transaction error handling",
      },
      abortedDueToAuth: true,
    };
  }

  const classification = classifyFirestoreError(err);

  if (classification.kind === "transient") {
    const updated = await recordMutationAttempt({
      ownerUid: authenticatedUid,
      mutationId: mutation.id,
      isTransientFailure: true,
      failureReason: classification.message,
      now,
    });

    return {
      itemResult: {
        mutationId: mutation.id,
        targetInspectionId: mutation.targetInspectionId,
        type: mutation.type,
        status: updated.status,
        error: classification.message,
      },
      abortedDueToAuth: false,
    };
  } else if (classification.kind === "conflict") {
    const updated = await transitionMutationStatus({
      ownerUid: authenticatedUid,
      mutationId: mutation.id,
      targetStatus: "conflict",
      conflictReason: classification.message,
      now,
    });

    return {
      itemResult: {
        mutationId: mutation.id,
        targetInspectionId: mutation.targetInspectionId,
        type: mutation.type,
        status: updated.status,
        error: classification.message,
      },
      abortedDueToAuth: false,
    };
  } else {
    // Permanent or unknown error: recordMutationAttempt with isTransientFailure = false (exhausts immediately)
    const updated = await recordMutationAttempt({
      ownerUid: authenticatedUid,
      mutationId: mutation.id,
      isTransientFailure: false,
      failureReason: classification.message,
      now,
    });

    return {
      itemResult: {
        mutationId: mutation.id,
        targetInspectionId: mutation.targetInspectionId,
        type: mutation.type,
        status: updated.status,
        error: classification.message,
      },
      abortedDueToAuth: false,
    };
  }
}

/**
 * Executes a single UPDATE_DRAFT mutation via atomic Firestore transaction.
 */
async function processUpdateDraftMutation(
  authenticatedUid: string,
  mutation: MutationRecord,
  now: number
): Promise<{
  itemResult: ReplayItemResult;
  abortedDueToAuth: boolean;
}> {
  await transitionMutationStatus({
    ownerUid: authenticatedUid,
    mutationId: mutation.id,
    targetStatus: "in_flight",
    now,
  });

  if (auth.currentUser?.uid !== authenticatedUid) {
    return {
      itemResult: {
        mutationId: mutation.id,
        targetInspectionId: mutation.targetInspectionId,
        type: mutation.type,
        status: "in_flight",
        error: "Auth changed during in_flight transition",
      },
      abortedDueToAuth: true,
    };
  }

  const targetInspectionId = mutation.targetInspectionId;
  const payload = mutation.payload as UpdateDraftPayload;

  try {
    const txResult = await updateInspectionDraftTransaction(
      authenticatedUid,
      targetInspectionId,
      payload,
      mutation.id,
      mutation.baseRevision
    );

    if (auth.currentUser?.uid !== authenticatedUid) {
      return {
        itemResult: {
          mutationId: mutation.id,
          targetInspectionId,
          type: mutation.type,
          status: "in_flight",
          error: "Auth changed immediately after Firestore transaction",
        },
        abortedDueToAuth: true,
      };
    }

    if (txResult.status === "APPLIED" || txResult.status === "ALREADY_APPLIED") {
      await transitionMutationStatus({
        ownerUid: authenticatedUid,
        mutationId: mutation.id,
        targetStatus: "succeeded",
        now,
      });

      try {
        const draft = await getLocalDraft(targetInspectionId);
        if (draft) {
          const remoteMerged = txResult.inspection;
          await saveLocalDraft({
            ...draft,
            title: remoteMerged?.title ?? (payload.title !== undefined ? payload.title : draft.title),
            observation: remoteMerged?.observation ?? (payload.observation !== undefined ? payload.observation : draft.observation),
            category: remoteMerged?.category ?? (payload.category !== undefined ? payload.category : draft.category),
            summary: remoteMerged?.summary ?? (payload.summary !== undefined ? payload.summary : draft.summary),
            weatherNotes: remoteMerged?.weatherNotes ?? (payload.weatherNotes !== undefined ? payload.weatherNotes : draft.weatherNotes),
            items: remoteMerged?.items ?? (payload.items !== undefined ? payload.items : draft.items),
            visibleEvidence: remoteMerged?.visibleEvidence ?? (payload.visibleEvidence !== undefined ? payload.visibleEvidence : draft.visibleEvidence),
            uncertainties: remoteMerged?.uncertainties ?? (payload.uncertainties !== undefined ? payload.uncertainties : draft.uncertainties),
            inspectorFollowUp: remoteMerged?.inspectorFollowUp ?? (payload.inspectorFollowUp !== undefined ? payload.inspectorFollowUp : draft.inspectorFollowUp),
            photoIds: remoteMerged?.photoIds ?? (payload.photoIds !== undefined ? payload.photoIds : draft.photoIds),
            revision: remoteMerged?.revision ?? (draft.revision || 1) + 1,
            isSynced: true,
            lastSavedAt: now,
          });
        }
      } catch {
        // Non-critical local draft update
      }

      return {
        itemResult: {
          mutationId: mutation.id,
          targetInspectionId,
          type: mutation.type,
          status: "succeeded",
        },
        abortedDueToAuth: false,
      };
    }

    const conflictReason =
      txResult.reason ||
      (txResult.status === "NOT_FOUND"
        ? "Remote inspection document does not exist"
        : "Draft update conflict against remote inspection state");

    const updated = await transitionMutationStatus({
      ownerUid: authenticatedUid,
      mutationId: mutation.id,
      targetStatus: "conflict",
      conflictReason,
      conflictDetails: txResult.conflictDetails,
      now,
    });

    return {
      itemResult: {
        mutationId: mutation.id,
        targetInspectionId,
        type: mutation.type,
        status: updated.status,
        error: conflictReason,
      },
      abortedDueToAuth: false,
    };
  } catch (err) {
    return handleMutationError(authenticatedUid, mutation, err, now);
  }
}

/**
 * Executes a single TRANSITION_REVIEW mutation via atomic Firestore transaction.
 */
async function processTransitionReviewMutation(
  authenticatedUid: string,
  mutation: MutationRecord,
  now: number
): Promise<{
  itemResult: ReplayItemResult;
  abortedDueToAuth: boolean;
}> {
  await transitionMutationStatus({
    ownerUid: authenticatedUid,
    mutationId: mutation.id,
    targetStatus: "in_flight",
    now,
  });

  if (auth.currentUser?.uid !== authenticatedUid) {
    return {
      itemResult: {
        mutationId: mutation.id,
        targetInspectionId: mutation.targetInspectionId,
        type: mutation.type,
        status: "in_flight",
        error: "Auth changed during in_flight transition",
      },
      abortedDueToAuth: true,
    };
  }

  const targetInspectionId = mutation.targetInspectionId;
  const payload = mutation.payload as TransitionReviewPayload;

  try {
    const txResult = await transitionInspectionReviewTransaction(
      authenticatedUid,
      targetInspectionId,
      payload,
      mutation.id,
      mutation.baseRevision
    );

    if (auth.currentUser?.uid !== authenticatedUid) {
      return {
        itemResult: {
          mutationId: mutation.id,
          targetInspectionId,
          type: mutation.type,
          status: "in_flight",
          error: "Auth changed immediately after Firestore transaction",
        },
        abortedDueToAuth: true,
      };
    }

    if (txResult.status === "APPLIED" || txResult.status === "ALREADY_APPLIED") {
      await transitionMutationStatus({
        ownerUid: authenticatedUid,
        mutationId: mutation.id,
        targetStatus: "succeeded",
        now,
      });

      try {
        const draft = await getLocalDraft(targetInspectionId);
        if (draft) {
          await saveLocalDraft({
            ...draft,
            reviewStatus: txResult.inspection?.reviewStatus || payload.targetStatus,
            reviewHistory: txResult.inspection?.reviewHistory || draft.reviewHistory,
            reviewedAt: txResult.inspection?.reviewedAt || now,
            reviewedByUid: txResult.inspection?.reviewedByUid || payload.reviewerUid || authenticatedUid,
            revision: txResult.inspection?.revision ?? (draft.revision || 1) + 1,
            isSynced: true,
            lastSavedAt: now,
          });
        }
      } catch {
        // Non-critical local draft update
      }

      return {
        itemResult: {
          mutationId: mutation.id,
          targetInspectionId,
          type: mutation.type,
          status: "succeeded",
        },
        abortedDueToAuth: false,
      };
    }

    const conflictReason =
      txResult.reason ||
      (txResult.status === "NOT_FOUND"
        ? "Remote inspection document does not exist"
        : "Review transition conflict");

    const updated = await transitionMutationStatus({
      ownerUid: authenticatedUid,
      mutationId: mutation.id,
      targetStatus: "conflict",
      conflictReason,
      conflictDetails: txResult.conflictDetails,
      now,
    });

    return {
      itemResult: {
        mutationId: mutation.id,
        targetInspectionId,
        type: mutation.type,
        status: updated.status,
        error: conflictReason,
      },
      abortedDueToAuth: false,
    };
  } catch (err) {
    return handleMutationError(authenticatedUid, mutation, err, now);
  }
}

/**
 * Executes a single ARCHIVE_INSPECTION mutation via atomic Firestore transaction.
 */
async function processArchiveInspectionMutation(
  authenticatedUid: string,
  mutation: MutationRecord,
  now: number
): Promise<{
  itemResult: ReplayItemResult;
  abortedDueToAuth: boolean;
}> {
  await transitionMutationStatus({
    ownerUid: authenticatedUid,
    mutationId: mutation.id,
    targetStatus: "in_flight",
    now,
  });

  if (auth.currentUser?.uid !== authenticatedUid) {
    return {
      itemResult: {
        mutationId: mutation.id,
        targetInspectionId: mutation.targetInspectionId,
        type: mutation.type,
        status: "in_flight",
        error: "Auth changed during in_flight transition",
      },
      abortedDueToAuth: true,
    };
  }

  const targetInspectionId = mutation.targetInspectionId;
  const payload = mutation.payload as ArchiveInspectionPayload;

  try {
    const txResult = await archiveInspectionTransaction(
      authenticatedUid,
      targetInspectionId,
      payload,
      mutation.id,
      mutation.baseRevision
    );

    if (auth.currentUser?.uid !== authenticatedUid) {
      return {
        itemResult: {
          mutationId: mutation.id,
          targetInspectionId,
          type: mutation.type,
          status: "in_flight",
          error: "Auth changed immediately after Firestore transaction",
        },
        abortedDueToAuth: true,
      };
    }

    if (txResult.status === "APPLIED" || txResult.status === "ALREADY_APPLIED") {
      await transitionMutationStatus({
        ownerUid: authenticatedUid,
        mutationId: mutation.id,
        targetStatus: "succeeded",
        now,
      });

      try {
        const draft = await getLocalDraft(targetInspectionId);
        if (draft) {
          await saveLocalDraft({
            ...draft,
            isArchived: true,
            archivedAt: txResult.inspection?.archivedAt ?? (payload.archivedAt || now),
            archivedByUid: txResult.inspection?.archivedByUid ?? authenticatedUid,
            archiveReason: txResult.inspection?.archiveReason ?? (payload.reason || null),
            revision: txResult.inspection?.revision ?? (draft.revision || 1) + 1,
            isSynced: true,
            lastSavedAt: now,
          });
        }
      } catch {
        // Non-critical local draft update
      }

      return {
        itemResult: {
          mutationId: mutation.id,
          targetInspectionId,
          type: mutation.type,
          status: "succeeded",
        },
        abortedDueToAuth: false,
      };
    }

    const conflictReason =
      txResult.reason ||
      (txResult.status === "NOT_FOUND"
        ? "Remote inspection document does not exist"
        : "Archive inspection conflict");

    const updated = await transitionMutationStatus({
      ownerUid: authenticatedUid,
      mutationId: mutation.id,
      targetStatus: "conflict",
      conflictReason,
      conflictDetails: txResult.conflictDetails,
      now,
    });

    return {
      itemResult: {
        mutationId: mutation.id,
        targetInspectionId,
        type: mutation.type,
        status: updated.status,
        error: conflictReason,
      },
      abortedDueToAuth: false,
    };
  } catch (err) {
    return handleMutationError(authenticatedUid, mutation, err, now);
  }
}

/**
 * Executes a single UNARCHIVE_INSPECTION mutation via atomic Firestore transaction.
 */
async function processUnarchiveInspectionMutation(
  authenticatedUid: string,
  mutation: MutationRecord,
  now: number
): Promise<{
  itemResult: ReplayItemResult;
  abortedDueToAuth: boolean;
}> {
  await transitionMutationStatus({
    ownerUid: authenticatedUid,
    mutationId: mutation.id,
    targetStatus: "in_flight",
    now,
  });

  if (auth.currentUser?.uid !== authenticatedUid) {
    return {
      itemResult: {
        mutationId: mutation.id,
        targetInspectionId: mutation.targetInspectionId,
        type: mutation.type,
        status: "in_flight",
        error: "Auth changed during in_flight transition",
      },
      abortedDueToAuth: true,
    };
  }

  const targetInspectionId = mutation.targetInspectionId;
  const payload = mutation.payload as UnarchiveInspectionPayload;

  try {
    const txResult = await unarchiveInspectionTransaction(
      authenticatedUid,
      targetInspectionId,
      payload,
      mutation.id,
      mutation.baseRevision
    );

    if (auth.currentUser?.uid !== authenticatedUid) {
      return {
        itemResult: {
          mutationId: mutation.id,
          targetInspectionId,
          type: mutation.type,
          status: "in_flight",
          error: "Auth changed immediately after Firestore transaction",
        },
        abortedDueToAuth: true,
      };
    }

    if (txResult.status === "APPLIED" || txResult.status === "ALREADY_APPLIED") {
      await transitionMutationStatus({
        ownerUid: authenticatedUid,
        mutationId: mutation.id,
        targetStatus: "succeeded",
        now,
      });

      try {
        const draft = await getLocalDraft(targetInspectionId);
        if (draft) {
          await saveLocalDraft({
            ...draft,
            isArchived: false,
            archivedAt: null,
            archivedByUid: null,
            archiveReason: null,
            revision: txResult.inspection?.revision ?? (draft.revision || 1) + 1,
            isSynced: true,
            lastSavedAt: now,
          });
        }
      } catch {
        // Non-critical local draft update
      }

      return {
        itemResult: {
          mutationId: mutation.id,
          targetInspectionId,
          type: mutation.type,
          status: "succeeded",
        },
        abortedDueToAuth: false,
      };
    }

    const conflictReason =
      txResult.reason ||
      (txResult.status === "NOT_FOUND"
        ? "Remote inspection document does not exist"
        : "Unarchive inspection conflict");

    const updated = await transitionMutationStatus({
      ownerUid: authenticatedUid,
      mutationId: mutation.id,
      targetStatus: "conflict",
      conflictReason,
      conflictDetails: txResult.conflictDetails,
      now,
    });

    return {
      itemResult: {
        mutationId: mutation.id,
        targetInspectionId,
        type: mutation.type,
        status: updated.status,
        error: conflictReason,
      },
      abortedDueToAuth: false,
    };
  } catch (err) {
    return handleMutationError(authenticatedUid, mutation, err, now);
  }
}

/**
 * Executes a single DELETE_INSPECTION mutation via atomic Firestore transaction.
 */
async function processDeleteInspectionMutation(
  authenticatedUid: string,
  mutation: MutationRecord,
  now: number
): Promise<{
  itemResult: ReplayItemResult;
  abortedDueToAuth: boolean;
}> {
  await transitionMutationStatus({
    ownerUid: authenticatedUid,
    mutationId: mutation.id,
    targetStatus: "in_flight",
    now,
  });

  if (auth.currentUser?.uid !== authenticatedUid) {
    return {
      itemResult: {
        mutationId: mutation.id,
        targetInspectionId: mutation.targetInspectionId,
        type: mutation.type,
        status: "in_flight",
        error: "Auth changed during in_flight transition",
      },
      abortedDueToAuth: true,
    };
  }

  const targetInspectionId = mutation.targetInspectionId;

  try {
    const txResult = await deleteInspectionTransaction(
      authenticatedUid,
      targetInspectionId,
      mutation.id
    );

    if (auth.currentUser?.uid !== authenticatedUid) {
      return {
        itemResult: {
          mutationId: mutation.id,
          targetInspectionId,
          type: mutation.type,
          status: "in_flight",
          error: "Auth changed immediately after Firestore transaction",
        },
        abortedDueToAuth: true,
      };
    }

    if (txResult.status === "DELETED") {
      // Stage 3 & Stage 4 Integration (Phase 5 Stage 4C):
      // Check for an existing deletion receipt created by initiateInspectionDeletion
      const receipt = await getDeletionReceiptByInspection(targetInspectionId);

      if (receipt) {
        // Stage 3: Acknowledge remote deletion on durable receipt
        await confirmRemoteDeletion(receipt.id, authenticatedUid, mutation.id, now);

        await transitionMutationStatus({
          ownerUid: authenticatedUid,
          mutationId: mutation.id,
          targetStatus: "succeeded",
          now,
        });

        // Stage 4: Safely purge photo Blobs and local draft
        try {
          await executePhotoCleanup(receipt.id, authenticatedUid, now);
        } catch (cleanupErr) {
          console.warn("Photo cleanup interrupted; will resume on recovery:", cleanupErr);
        }
      } else {
        // No deletion receipt was created (bare mutation replay):
        // Preserves photographic evidence Blobs in IndexedDB (zero unauthorized blob deletion)
        await transitionMutationStatus({
          ownerUid: authenticatedUid,
          mutationId: mutation.id,
          targetStatus: "succeeded",
          now,
        });

        try {
          await deleteLocalDraft(targetInspectionId);
        } catch {
          // Non-critical local cleanup
        }
      }

      return {
        itemResult: {
          mutationId: mutation.id,
          targetInspectionId,
          type: mutation.type,
          status: "succeeded",
        },
        abortedDueToAuth: false,
      };
    }

    // CONFLICT: e.g. attempted deletion of approved, in-review, or archived inspection
    const conflictReason =
      txResult.reason || "Inspection is not eligible for deletion";

    // Mark deletion receipt as failed if one exists
    try {
      const conflictReceipt = await getDeletionReceiptByInspection(targetInspectionId);
      if (conflictReceipt && conflictReceipt.stage === "pending_remote_delete") {
        conflictReceipt.stage = "failed";
        conflictReceipt.error = conflictReason;
        await saveDeletionReceipt(conflictReceipt);
      }
    } catch {
      // Non-critical receipt update
    }

    const updated = await transitionMutationStatus({
      ownerUid: authenticatedUid,
      mutationId: mutation.id,
      targetStatus: "conflict",
      conflictReason,
      conflictDetails: txResult.conflictDetails,
      now,
    });

    return {
      itemResult: {
        mutationId: mutation.id,
        targetInspectionId,
        type: mutation.type,
        status: updated.status,
        error: conflictReason,
      },
      abortedDueToAuth: false,
    };
  } catch (err) {
    return handleMutationError(authenticatedUid, mutation, err, now);
  }
}

// ============================================================================
// 5. Inspection Synchronization Status Helper
// ============================================================================

/**
 * Derives user-facing synchronization status for an inspection from durable mutation queue state
 * and inspection source metadata.
 *
 * Invariants:
 * 1. Queue Authority: If mutations exist in the local queue, local queue state is authoritative.
 * 2. Remote Inspections: Remote inspections retrieved from Firestore (options.isRemote === true)
 *    display as 'synced' unless local mutations exist.
 * 3. Local Drafts: Unsynchronized local drafts without confirmed remote acknowledgement
 *    display as 'local_only' (or 'sync_cancelled' if cancelled).
 * 4. Reliable Remote Acknowledgement: Local drafts with draft.isSynced === true display as 'synced'.
 * 5. Cancelled Decisions: Mutations cancelled by the user return 'sync_cancelled' and NEVER falsely claim 'synced'.
 */
export async function getInspectionSyncStatus(
  ownerUid: string,
  inspectionId: string,
  options?: GetSyncStatusOptions
): Promise<InspectionSyncStatus> {
  if (!ownerUid) {
    return {
      state: "local_only",
      label: "Local Only",
    };
  }

  const mutations = await getMutationsByInspection(ownerUid, inspectionId);

  // 1. If mutations exist in the local queue, local queue state is authoritative
  if (mutations.length > 0) {
    // Check for in_flight mutation
    const inFlight = mutations.find((m) => m.status === "in_flight");
    if (inFlight) {
      return {
        state: "syncing",
        label: "Syncing...",
        mutationId: inFlight.id,
        mutationStatus: "in_flight",
        retryCount: inFlight.retryCount,
        maxRetries: inFlight.maxRetries,
        lastAttemptedAt: inFlight.lastAttemptedAt,
      };
    }

    // Check for conflict
    const conflict = mutations.find(
      (m) => m.status === "conflict" || m.status === "paused_on_conflict"
    );
    if (conflict) {
      return {
        state: "conflict",
        label: "Conflict",
        mutationId: conflict.id,
        mutationStatus: conflict.status,
        conflictReason: conflict.conflictReason || conflict.failureReason,
        lastAttemptedAt: conflict.lastAttemptedAt,
      };
    }

    // Check for failure / exhaustion
    const failed = mutations.find(
      (m) => m.status === "failed_exhausted" || m.status === "failed"
    );
    if (failed) {
      return {
        state: "sync_failed",
        label: failed.status === "failed_exhausted" ? "Sync Exhausted" : "Sync Failed",
        mutationId: failed.id,
        mutationStatus: failed.status,
        retryCount: failed.retryCount,
        maxRetries: failed.maxRetries,
        failureReason: failed.failureReason,
        lastAttemptedAt: failed.lastAttemptedAt,
        nextRetryAt: failed.nextRetryAt,
      };
    }

    // Check for waiting in queue
    const queued = mutations.find((m) => m.status === "queued");
    if (queued) {
      return {
        state: "waiting_to_sync",
        label: "Waiting to Sync",
        mutationId: queued.id,
        mutationStatus: "queued",
        retryCount: queued.retryCount,
        maxRetries: queued.maxRetries,
      };
    }

    // Check for user cancellation (explicit decision)
    const cancelled = mutations.find((m) => m.status === "cancelled_by_user");
    if (cancelled && !mutations.some((m) => m.status === "succeeded")) {
      return {
        state: "sync_cancelled",
        label: "Sync Cancelled",
        mutationId: cancelled.id,
        mutationStatus: "cancelled_by_user",
      };
    }

    // All mutations succeeded
    const allSucceeded = mutations.every((m) => m.status === "succeeded");
    if (allSucceeded) {
      return {
        state: "synced",
        label: "Synced",
        mutationStatus: "succeeded",
      };
    }
  }

  // 2. If NO mutations exist in the queue:
  // Distinguish whether this is a remote inspection fetched from Firestore:
  // - If isRemote is true (or isLocalDraft is false): remote inspection from Firestore -> "synced"
  if (options?.isRemote === true || options?.isLocalDraft === false) {
    return {
      state: "synced",
      label: "Synced",
    };
  }

  // - Otherwise (local draft without queue record): strictly local_only
  return {
    state: "local_only",
    label: "Local Only",
  };
}
