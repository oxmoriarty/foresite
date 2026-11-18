/**
 * ForeSite Centralized Review Lifecycle Service
 *
 * Implements the strict 5-transition review finite state machine:
 * draft_generated -> in_review
 * in_review -> approved
 * in_review -> rejected
 * approved -> in_review
 * rejected -> in_review
 *
 * Invariants:
 * 1. AI draft generation or editing NEVER implicitly approves an inspection.
 * 2. Explicit human action is required for every review transition.
 * 3. Reviewer identity MUST come from the authenticated inspector UID.
 * 4. Audit events are strictly appended; previous history is immutable.
 * 5. Maximum 100 review events capacity enforced.
 */

import { Inspection, ReviewStatus, ReviewAuditEvent } from "../types";

export class ReviewLifecycleError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "UNAUTHENTICATED"
      | "INVALID_TRANSITION"
      | "HISTORY_CAP_REACHED"
      | "VALIDATION_FAILED"
  ) {
    super(message);
    this.name = "ReviewLifecycleError";
  }
}

/**
 * Validates whether a requested review transition is strictly permitted by the FSM.
 */
export function isValidReviewTransition(from: ReviewStatus, to: ReviewStatus): boolean {
  if (from === "draft_generated") return to === "in_review";
  if (from === "in_review") return to === "approved" || to === "rejected";
  if (from === "approved") return to === "in_review";
  if (from === "rejected") return to === "in_review";
  return false;
}

/**
 * Returns the exact permitted target states from the current status.
 */
export function getPermittedReviewTransitions(current: ReviewStatus): ReviewStatus[] {
  switch (current) {
    case "draft_generated":
      return ["in_review"];
    case "in_review":
      return ["approved", "rejected"];
    case "approved":
    case "rejected":
      return ["in_review"];
    default:
      return [];
  }
}

/**
 * Returns user-facing label for a review transition action.
 */
export function getReviewActionLabel(target: ReviewStatus, current?: ReviewStatus): string {
  switch (target) {
    case "in_review":
      return current === "approved" || current === "rejected"
        ? "Reopen Review"
        : "Begin Review";
    case "approved":
      return "Approve Inspection";
    case "rejected":
      return "Reject Draft";
    default:
      return "Update Status";
  }
}

/**
 * Constructs a strongly typed review audit event.
 * Validates non-empty authenticated UID and permitted transition.
 */
export function createReviewAuditEvent(params: {
  inspectionId: string;
  fromStatus: ReviewStatus;
  toStatus: ReviewStatus;
  byUid: string;
  comment?: string;
  revision?: number;
  timestamp?: number;
}): ReviewAuditEvent {
  if (!params.byUid || typeof params.byUid !== "string" || !params.byUid.trim()) {
    throw new ReviewLifecycleError(
      "Authenticated reviewer UID is required to create a review audit event.",
      "UNAUTHENTICATED"
    );
  }

  if (!isValidReviewTransition(params.fromStatus, params.toStatus)) {
    throw new ReviewLifecycleError(
      `Prohibited review transition: '${params.fromStatus}' -> '${params.toStatus}'. Only valid lifecycle steps are permitted.`,
      "INVALID_TRANSITION"
    );
  }

  const timestamp = params.timestamp || Date.now();
  const rev = params.revision ?? 1;
  const id = `rev-evt-${params.inspectionId}-r${rev}-${params.toStatus}-${timestamp}`;

  return {
    id,
    fromStatus: params.fromStatus,
    toStatus: params.toStatus,
    byUid: params.byUid.trim(),
    timestamp,
    comment: params.comment?.trim() || undefined,
    revision: rev,
  };
}

/**
 * Executes a review transition on an inspection.
 * Produces an updated inspection record with an appended audit event.
 */
export function executeReviewTransition(
  inspection: Inspection,
  targetStatus: ReviewStatus,
  reviewerUid: string,
  comment?: string
): { updatedInspection: Inspection; auditEvent: ReviewAuditEvent } {
  if (!reviewerUid || typeof reviewerUid !== "string" || !reviewerUid.trim()) {
    throw new ReviewLifecycleError(
      "Missing authenticated user. Review decisions require an authenticated inspector.",
      "UNAUTHENTICATED"
    );
  }

  const currentStatus = inspection.reviewStatus || "draft_generated";
  if (!isValidReviewTransition(currentStatus, targetStatus)) {
    throw new ReviewLifecycleError(
      `Cannot transition inspection from '${currentStatus}' to '${targetStatus}'. Direct transitions and prohibited paths are rejected.`,
      "INVALID_TRANSITION"
    );
  }

  const currentHistory = inspection.reviewHistory || [];
  if (currentHistory.length >= 100) {
    throw new ReviewLifecycleError(
      "Review history cap reached (100 events). Cannot record further review transitions.",
      "HISTORY_CAP_REACHED"
    );
  }

  const nextRevision = (inspection.revision ?? 0) + 1;
  const auditEvent = createReviewAuditEvent({
    inspectionId: inspection.id,
    fromStatus: currentStatus,
    toStatus: targetStatus,
    byUid: reviewerUid,
    comment,
    revision: nextRevision,
  });

  const updatedInspection: Inspection = {
    ...inspection,
    reviewStatus: targetStatus,
    reviewHistory: [...currentHistory, auditEvent],
    reviewedAt: auditEvent.timestamp,
    reviewedByUid: reviewerUid.trim(),
    revision: nextRevision,
    updatedAt: auditEvent.timestamp,
  };

  return { updatedInspection, auditEvent };
}
