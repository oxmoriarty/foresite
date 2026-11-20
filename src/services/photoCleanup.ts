/**
 * ForeSite Phase 5 Stage 4C: Staged Photo Blob Cleanup & Deletion Receipts
 *
 * Implements the four-stage photo cleanup lifecycle:
 * Stage 1: pending_remote_delete (Deletion enqueued; local draft marked; Blobs preserved)
 * Stage 2: Remote Firestore Transaction (deleteInspectionTransaction executed)
 * Stage 3: remote_confirmed_pending_blob_purge (Remote confirmed absent; receipt recorded; Blobs preserved until purge)
 * Stage 4: Idempotent Blob Purge & Completion (Blobs safely removed after reference check; local draft deleted; receipt finalized)
 *
 * Invariants:
 * 1. Zero Early Photo Deletion: Photographic Blobs in IndexedDB are NEVER deleted before remote deletion is authoritatively confirmed.
 * 2. Cross-Inspection Protection: If any other local draft references a photo, that photo Blob is RETAINED.
 * 3. Fail-Closed Ownership: If photo ownership or references cannot be established confidently, retain the Blob.
 * 4. Audit Preservation: Active review records, approved, rejected, or archived inspections can NEVER be permanently deleted.
 * 5. Durable Recovery: Interrupted cleanups resume idempotently across crashes, reloads, and account boundaries.
 */

import { auth, db, hasValidConfig } from "../lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import {
  Inspection,
  LocalDraftInspection,
  DeletionReceipt,
  CleanupExecutionResult,
  CleanupRecoveryResult,
} from "../types";
import {
  saveDeletionReceipt,
  getDeletionReceipt,
  getDeletionReceiptByInspection,
  getAllDeletionReceipts,
  getEvidencePhoto,
  getEvidencePhotosByInspection,
  deleteEvidencePhoto,
  getLocalDraft,
  saveLocalDraft,
  getAllLocalDrafts,
  deleteLocalDraft,
} from "./indexeddb";
import { enqueueMutation } from "./mutationQueue";

/**
 * Validates whether an inspection is eligible for permanent deletion.
 * Strict Rule: Only active (not archived) unreviewed drafts ('draft_generated' with 0 review history events)
 * can be permanently deleted.
 */
export function isInspectionEligibleForPermanentDeletion(
  inspection: Partial<Inspection> | Partial<LocalDraftInspection>
): { eligible: boolean; reason?: string } {
  if (inspection.isArchived) {
    return {
      eligible: false,
      reason:
        "Archived inspections cannot be permanently deleted. They must be preserved for compliance and audit integrity.",
    };
  }

  const reviewStatus = inspection.reviewStatus || "draft_generated";
  if (reviewStatus !== "draft_generated") {
    return {
      eligible: false,
      reason: `Inspection is in '${reviewStatus}' status and cannot be permanently deleted. Only unreviewed drafts ('draft_generated') are eligible.`,
    };
  }

  if (inspection.reviewHistory && inspection.reviewHistory.length > 0) {
    return {
      eligible: false,
      reason: `Inspection has ${inspection.reviewHistory.length} review audit event(s) and cannot be deleted. Audited inspections must be preserved.`,
    };
  }

  return { eligible: true };
}

/**
 * Stage 1: Initiates permanent inspection deletion.
 * Creates a durable deletion receipt in 'pending_remote_delete', marks local draft,
 * and enqueues DELETE_INSPECTION mutation. Blobs remain 100% preserved.
 */
export async function initiateInspectionDeletion(
  ownerUid: string,
  inspection: Inspection | LocalDraftInspection,
  now?: number
): Promise<{ receipt: DeletionReceipt; mutationId: string }> {
  const currentAuthUser = auth.currentUser;
  if (!currentAuthUser || !currentAuthUser.uid || currentAuthUser.uid !== ownerUid) {
    throw new Error("Authenticated user mismatch or unauthenticated session during deletion initiation");
  }

  const eligibility = isInspectionEligibleForPermanentDeletion(inspection);
  if (!eligibility.eligible) {
    throw new Error(eligibility.reason || "Inspection is ineligible for permanent deletion");
  }

  const timestamp = now ?? Date.now();
  const receiptId = `del-rcpt-${inspection.id}`;

  // Gather all associated photo IDs from draft and IndexedDB store
  const photoIdsSet = new Set<string>(inspection.photoIds || []);
  try {
    const storedPhotos = await getEvidencePhotosByInspection(inspection.id);
    storedPhotos.forEach((p) => photoIdsSet.add(p.id));
  } catch {
    // Non-critical store lookup failure
  }
  const photoIds = Array.from(photoIdsSet);

  // Check if a receipt already exists
  const existingReceipt = await getDeletionReceiptByInspection(inspection.id);
  if (existingReceipt) {
    if (existingReceipt.stage === "completed") {
      return { receipt: existingReceipt, mutationId: existingReceipt.mutationId || "" };
    }
    if (
      existingReceipt.stage === "pending_remote_delete" ||
      existingReceipt.stage === "remote_confirmed_pending_blob_purge"
    ) {
      return { receipt: existingReceipt, mutationId: existingReceipt.mutationId || "" };
    }
  }

  // Create initial receipt: Stage 1
  const receipt: DeletionReceipt = {
    id: receiptId,
    inspectionId: inspection.id,
    ownerUid,
    stage: "pending_remote_delete",
    photoIds,
    deletedPhotoIds: [],
    retainedPhotoIds: [],
    photosDeletedCount: 0,
    createdAt: timestamp,
    retryCount: 0,
  };

  await saveDeletionReceipt(receipt);

  // Mark local draft with deletionStage
  try {
    const draft = await getLocalDraft(inspection.id);
    if (draft) {
      await saveLocalDraft({
        ...draft,
        deletionStage: "pending_remote_delete",
      });
    }
  } catch {
    // Non-critical local draft update
  }

  // Enqueue DELETE_INSPECTION mutation
  const mutation = await enqueueMutation({
    ownerUid,
    targetInspectionId: inspection.id,
    type: "DELETE_INSPECTION",
    payload: {
      type: "DELETE_INSPECTION",
      deletedAt: timestamp,
      cleanupReceiptId: receipt.id,
    },
    baseRevision: inspection.revision || 1,
    now: timestamp,
  });

  receipt.mutationId = mutation.id;
  await saveDeletionReceipt(receipt);

  return { receipt, mutationId: mutation.id };
}

/**
 * Stage 3: Acknowledges remote Firestore deletion and transitions receipt to
 * 'remote_confirmed_pending_blob_purge'.
 */
export async function confirmRemoteDeletion(
  receiptId: string,
  ownerUid: string,
  mutationId?: string,
  now?: number
): Promise<DeletionReceipt> {
  const currentAuthUser = auth.currentUser;
  if (!currentAuthUser || !currentAuthUser.uid || currentAuthUser.uid !== ownerUid) {
    throw new Error("Authenticated user mismatch during remote deletion confirmation");
  }

  const receipt = await getDeletionReceipt(receiptId);
  if (!receipt) {
    throw new Error(`Deletion receipt ${receiptId} not found`);
  }

  if (receipt.ownerUid !== ownerUid) {
    throw new Error("Tenant isolation violation: receipt owner mismatch");
  }

  const timestamp = now ?? Date.now();
  receipt.stage = "remote_confirmed_pending_blob_purge";
  receipt.remoteConfirmedAt = timestamp;
  if (mutationId) {
    receipt.mutationId = mutationId;
  }

  await saveDeletionReceipt(receipt);

  // Update local draft deletionStage
  try {
    const draft = await getLocalDraft(receipt.inspectionId);
    if (draft) {
      await saveLocalDraft({
        ...draft,
        deletionStage: "remote_confirmed_pending_blob_purge",
      });
    }
  } catch {
    // Non-critical local draft update
  }

  return receipt;
}

/**
 * Stage 4: Safely and idempotently purges photographic evidence Blobs and finalizes receipt.
 * Enforces cross-inspection protection, uncertain ownership fail-closed retention,
 * and durable incremental progress tracking.
 */
export async function executePhotoCleanup(
  receiptId: string,
  authenticatedUid: string,
  now?: number
): Promise<CleanupExecutionResult> {
  const currentAuthUser = auth.currentUser;
  if (!currentAuthUser || !currentAuthUser.uid || currentAuthUser.uid !== authenticatedUid) {
    throw new Error("Authenticated user mismatch during photo cleanup execution");
  }

  const receipt = await getDeletionReceipt(receiptId);
  if (!receipt) {
    throw new Error(`Deletion receipt ${receiptId} not found`);
  }

  if (receipt.ownerUid !== authenticatedUid) {
    throw new Error("Tenant isolation violation: receipt owner mismatch");
  }

  // Idempotency: if already completed, return without repeating
  if (receipt.stage === "completed") {
    return {
      receiptId: receipt.id,
      inspectionId: receipt.inspectionId,
      stage: "completed",
      deletedPhotosCount: receipt.photosDeletedCount,
      retainedPhotosCount: receipt.retainedPhotoIds.length,
      draftPurged: true,
    };
  }

  // Invariant 1: Blobs can NEVER be deleted before remote deletion is confirmed
  if (receipt.stage === "pending_remote_delete") {
    throw new Error(
      "Physical photo cleanup cannot be executed before remote Firestore deletion is authoritatively confirmed."
    );
  }

  const timestamp = now ?? Date.now();

  try {
    // Step 4.1: Cross-Inspection Protection Check
    // Query all local drafts excluding the one being deleted
    const allDrafts = await getAllLocalDrafts();
    const otherDrafts = allDrafts.filter((d) => d.id !== receipt.inspectionId);

    const crossReferencedPhotoIds = new Set<string>();
    for (const d of otherDrafts) {
      if (d.photoIds && Array.isArray(d.photoIds)) {
        for (const pid of d.photoIds) {
          crossReferencedPhotoIds.add(pid);
        }
      }
    }

    // Step 4.2: Iterate through photos in receipt
    for (const photoId of receipt.photoIds) {
      // Revalidate auth at each asynchronous loop boundary
      if (auth.currentUser?.uid !== authenticatedUid) {
        throw new Error("Authentication changed during photo cleanup execution");
      }

      // Skip already processed photos
      if (
        receipt.deletedPhotoIds.includes(photoId) ||
        receipt.retainedPhotoIds.includes(photoId)
      ) {
        continue;
      }

      // Check cross-reference protection
      if (crossReferencedPhotoIds.has(photoId)) {
        receipt.retainedPhotoIds.push(photoId);
        await saveDeletionReceipt(receipt);
        continue;
      }

      // Check photo record from IndexedDB
      const photo = await getEvidencePhoto(photoId);
      if (!photo) {
        // Photo already deleted or doesn't exist
        receipt.deletedPhotoIds.push(photoId);
        await saveDeletionReceipt(receipt);
        continue;
      }

      // Check inspectionId matching
      if (photo.inspectionId !== receipt.inspectionId) {
        // Uncertain ownership / mismatch! Fail closed: RETAIN!
        receipt.retainedPhotoIds.push(photoId);
        await saveDeletionReceipt(receipt);
        continue;
      }

      // Safe to physically delete Blob
      await deleteEvidencePhoto(photoId);
      receipt.deletedPhotoIds.push(photoId);
      receipt.photosDeletedCount++;
      await saveDeletionReceipt(receipt);
    }

    // Revalidate auth before finalizing
    if (auth.currentUser?.uid !== authenticatedUid) {
      throw new Error("Authentication changed during cleanup finalization");
    }

    // Step 4.3: Purge local draft from localInspections store
    try {
      await deleteLocalDraft(receipt.inspectionId);
    } catch {
      // Non-critical local draft deletion
    }

    // Step 4.4: Finalize deletion receipt
    receipt.stage = "completed";
    receipt.completedAt = timestamp;
    await saveDeletionReceipt(receipt);

    return {
      receiptId: receipt.id,
      inspectionId: receipt.inspectionId,
      stage: "completed",
      deletedPhotosCount: receipt.photosDeletedCount,
      retainedPhotosCount: receipt.retainedPhotoIds.length,
      draftPurged: true,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    receipt.stage = "failed";
    receipt.error = errorMsg;
    await saveDeletionReceipt(receipt);
    return {
      receiptId: receipt.id,
      inspectionId: receipt.inspectionId,
      stage: "failed",
      deletedPhotosCount: receipt.photosDeletedCount,
      retainedPhotosCount: receipt.retainedPhotoIds.length,
      error: errorMsg,
      draftPurged: false,
    };
  }
}

/**
 * Crash Recovery & Startup Processing:
 * Scans all deletion receipts for the authenticated user and resumes any incomplete
 * photo cleanup operations idempotently.
 */
export async function recoverPhotoCleanups(
  authenticatedUid: string,
  now?: number
): Promise<CleanupRecoveryResult> {
  const currentAuthUser = auth.currentUser;
  if (!currentAuthUser || !currentAuthUser.uid || currentAuthUser.uid !== authenticatedUid) {
    return {
      inspectedReceiptsCount: 0,
      recoveredCount: 0,
      failedCount: 0,
      results: [],
    };
  }

  const timestamp = now ?? Date.now();
  const allReceipts = await getAllDeletionReceipts(authenticatedUid);

  // Revalidate auth after async read
  if (auth.currentUser?.uid !== authenticatedUid) {
    return {
      inspectedReceiptsCount: 0,
      recoveredCount: 0,
      failedCount: 0,
      results: [],
    };
  }

  const results: CleanupExecutionResult[] = [];
  let recoveredCount = 0;
  let failedCount = 0;

  for (const receipt of allReceipts) {
    // Revalidate auth at each receipt boundary
    if (auth.currentUser?.uid !== authenticatedUid) {
      break;
    }

    // Case 1: Remote confirmed absent, but photo Blob purge was interrupted
    if (receipt.stage === "remote_confirmed_pending_blob_purge") {
      const res = await executePhotoCleanup(receipt.id, authenticatedUid, timestamp);
      results.push(res);
      if (res.stage === "completed") {
        recoveredCount++;
      } else {
        failedCount++;
      }
      continue;
    }

    // Case 2: Failed cleanup with confirmed remote deletion - retry recovery
    if (receipt.stage === "failed" && receipt.remoteConfirmedAt) {
      receipt.retryCount = (receipt.retryCount || 0) + 1;
      receipt.stage = "remote_confirmed_pending_blob_purge";
      await saveDeletionReceipt(receipt);

      const res = await executePhotoCleanup(receipt.id, authenticatedUid, timestamp);
      results.push(res);
      if (res.stage === "completed") {
        recoveredCount++;
      } else {
        failedCount++;
      }
      continue;
    }

    // Case 3: Receipt in pending_remote_delete: check if remote document is already absent
    if (receipt.stage === "pending_remote_delete" && hasValidConfig) {
      try {
        const docRef = doc(db, "users", authenticatedUid, "inspections", receipt.inspectionId);
        const snap = await getDoc(docRef);

        if (!snap.exists()) {
          // Remote document is absent! Advance to Stage 3 and execute Stage 4
          receipt.stage = "remote_confirmed_pending_blob_purge";
          receipt.remoteConfirmedAt = timestamp;
          await saveDeletionReceipt(receipt);

          const res = await executePhotoCleanup(receipt.id, authenticatedUid, timestamp);
          results.push(res);
          if (res.stage === "completed") {
            recoveredCount++;
          } else {
            failedCount++;
          }
        }
      } catch {
        // If offline or network error, leave receipt in pending_remote_delete
      }
    }
  }

  return {
    inspectedReceiptsCount: allReceipts.length,
    recoveredCount,
    failedCount,
    results,
  };
}
