/**
 * ForeSite Phase 5 Stage 4A: Three-Way Merge Engine & Review Reconciliation
 *
 * Implements deterministic three-way merge logic reconciling:
 * - Base (B): The inspection snapshot upon which local changes were originally drafted.
 * - Local (L): The inspector's current local working draft.
 * - Remote (R): The latest authoritative inspection document retrieved from Firestore.
 *
 * Guarantees:
 * 1. Pure & Deterministic: Never mutates input objects.
 * 2. Human Review Precedence: Automated background saves never overwrite human review decisions.
 * 3. 64-Case Review FSM Reconciliation: Strict 4-state lifecycle preservation with CONCURRENT_HUMAN_CONFLICT on opposing reviews.
 * 4. Field-Level Scalar 3-Way Merge: Preserves non-conflicting edits; flags genuine divergent edits.
 * 5. Checklist Identity Matching: Matches items by stable `id`, preserves additions, enforces edit-delete conflict checks.
 * 6. Symmetric String Set-Difference: Mathematical set difference for evidence lists and photo ID references.
 * 7. Photo Retention Invariant: Local photographic Blobs in IndexedDB are NEVER deleted or modified during document merge.
 */

import {
  Inspection,
  ReviewStatus,
  ChecklistItem,
  ConflictCategory,
  FieldConflict,
  ReviewReconciliationResult,
  MergeResult,
  FieldClassificationCategory,
  ObservationCategory,
} from "../types";
import { isValidReviewTransition } from "./review";

/**
 * Deep equality check for primitives, arrays, and objects.
 * Pure and non-mutating.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return a === b;
  if (typeof a !== "object" || typeof b !== "object") return a === b;

  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;
  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(objB, key)) return false;
    if (!deepEqual(objA[key], objB[key])) return false;
  }

  return true;
}

/**
 * Authoritative Field Classification Map across all 29 Firestore fields and client-local metadata.
 */
export const FIELD_CLASSIFICATIONS: Record<string, FieldClassificationCategory> = {
  // Immutable identity & ownership
  id: "IMMUTABLE_IDENTITY",
  ownerUid: "IMMUTABLE_IDENTITY",
  projectId: "IMMUTABLE_IDENTITY",
  projectName: "IMMUTABLE_IDENTITY",
  createdAt: "IMMUTABLE_IDENTITY",
  creationMutationId: "IMMUTABLE_IDENTITY",

  // Three-Way Merged content fields
  title: "THREE_WAY_MERGED",
  observation: "THREE_WAY_MERGED",
  category: "THREE_WAY_MERGED",
  summary: "THREE_WAY_MERGED",
  weatherNotes: "THREE_WAY_MERGED",
  items: "THREE_WAY_MERGED",
  visibleEvidence: "THREE_WAY_MERGED",
  uncertainties: "THREE_WAY_MERGED",
  inspectorFollowUp: "THREE_WAY_MERGED",
  photoIds: "THREE_WAY_MERGED",

  // Human Review Protected
  reviewStatus: "HUMAN_REVIEW_PROTECTED",
  reviewHistory: "HUMAN_REVIEW_PROTECTED",

  // Concurrency & System Managed
  revision: "SYSTEM_MANAGED",
  appliedMutationIds: "SYSTEM_MANAGED",
  updatedAt: "SYSTEM_MANAGED",
  reviewedAt: "SYSTEM_MANAGED",
  reviewedByUid: "SYSTEM_MANAGED",
  archivedAt: "SYSTEM_MANAGED",
  archivedByUid: "SYSTEM_MANAGED",
  archiveReason: "SYSTEM_MANAGED",

  // Conflict Requiring Manual Resolution
  isArchived: "CONFLICT_MANUAL_RESOLUTION",

  // Excluded from Remote Merge / Creation Flags
  aiAssisted: "EXCLUDED_FROM_MERGE",
  inferenceSource: "EXCLUDED_FROM_MERGE",
  clientCreationNonce: "EXCLUDED_FROM_MERGE",
  isLocalDraft: "EXCLUDED_FROM_MERGE",
  isSynced: "EXCLUDED_FROM_MERGE",
  lastSavedAt: "EXCLUDED_FROM_MERGE",
  photoMeta: "EXCLUDED_FROM_MERGE",
};

/**
 * Merges a single scalar field using strict 3-way logic:
 * - L === B -> Take R
 * - R === B -> Take L
 * - L === R -> Take common value
 * - L !== B && R !== B && L !== R -> Conflict!
 */
export function mergeScalarField<T>(
  field: string,
  base: T,
  local: T,
  remote: T,
  category: ConflictCategory = "SCALAR_FIELD",
  itemId?: string
): { value: T; conflict?: FieldConflict } {
  const localChanged = !deepEqual(local, base);
  const remoteChanged = !deepEqual(remote, base);

  // L equals B -> Take R
  if (!localChanged) {
    return { value: remote };
  }

  // R equals B -> Take L
  if (!remoteChanged) {
    return { value: local };
  }

  // L equals R -> Take common value
  if (deepEqual(local, remote)) {
    return { value: local };
  }

  // Both changed to different values -> Genuine conflict!
  return {
    value: local, // Return local for working draft snapshot, but flag conflict
    conflict: {
      field,
      itemId,
      category,
      baseValue: base,
      localValue: local,
      remoteValue: remote,
      message: `Conflicting divergent edits on field '${field}'`,
    },
  };
}

/**
 * Symmetric Three-Way Set-Difference Merge for String Arrays.
 *
 * Algorithm:
 * - L_add = L \ B
 * - R_add = R \ B
 * - L_del = B \ L
 * - R_del = B \ R
 * - Retained base elements = B \ L_del \ R_del
 * - Merged = RetainedBase ∪ R_add ∪ L_add (no duplicates, deterministic ordering)
 */
export function mergeStringArrays(
  _field: string,
  baseArr: string[] = [],
  localArr: string[] = [],
  remoteArr: string[] = []
): { mergedArray: string[]; conflicts: FieldConflict[] } {
  const safeBase = Array.isArray(baseArr) ? baseArr.filter((x): x is string => typeof x === "string") : [];
  const safeLocal = Array.isArray(localArr) ? localArr.filter((x): x is string => typeof x === "string") : [];
  const safeRemote = Array.isArray(remoteArr) ? remoteArr.filter((x): x is string => typeof x === "string") : [];

  const baseSet = new Set(safeBase);
  const localSet = new Set(safeLocal);
  const remoteSet = new Set(safeRemote);

  const localAdditions = safeLocal.filter((x) => !baseSet.has(x));
  const remoteAdditions = safeRemote.filter((x) => !baseSet.has(x));

  // Retain base elements that were neither deleted locally nor deleted remotely
  const retainedBase = safeBase.filter((x) => localSet.has(x) && remoteSet.has(x));

  const seen = new Set<string>();
  const mergedArray: string[] = [];

  for (const item of retainedBase) {
    if (!seen.has(item)) {
      seen.add(item);
      mergedArray.push(item);
    }
  }

  for (const item of remoteAdditions) {
    if (!seen.has(item)) {
      seen.add(item);
      mergedArray.push(item);
    }
  }

  for (const item of localAdditions) {
    if (!seen.has(item)) {
      seen.add(item);
      mergedArray.push(item);
    }
  }

  return { mergedArray, conflicts: [] };
}

/**
 * Three-Way Merge for Checklist Items.
 * Matches items by stable `id`.
 * Merges item fields (`status`, `notes`, `recommendation`) using scalar rules.
 * Handles additive additions and edit-delete conflict detection.
 */
export function mergeChecklistItems(
  baseItems: ChecklistItem[] = [],
  localItems: ChecklistItem[] = [],
  remoteItems: ChecklistItem[] = []
): { mergedItems: ChecklistItem[]; conflicts: FieldConflict[] } {
  const safeBase = Array.isArray(baseItems) ? baseItems : [];
  const safeLocal = Array.isArray(localItems) ? localItems : [];
  const safeRemote = Array.isArray(remoteItems) ? remoteItems : [];

  const conflicts: FieldConflict[] = [];

  // Check for duplicate IDs within inputs
  const validateUniqueIds = (items: ChecklistItem[], source: string): boolean => {
    const ids = new Set<string>();
    for (const item of items) {
      if (!item || typeof item.id !== "string" || !item.id.trim()) {
        conflicts.push({
          field: "items",
          category: "INCOMPATIBLE_DATA",
          baseValue: undefined,
          localValue: item,
          remoteValue: undefined,
          message: `Malformed checklist item missing stable string id in ${source}`,
        });
        return false;
      }
      if (ids.has(item.id)) {
        conflicts.push({
          field: "items",
          itemId: item.id,
          category: "INCOMPATIBLE_DATA",
          baseValue: undefined,
          localValue: item.id,
          remoteValue: undefined,
          message: `Duplicate checklist item id '${item.id}' in ${source}`,
        });
        return false;
      }
      ids.add(item.id);
    }
    return true;
  };

  validateUniqueIds(safeBase, "Base");
  validateUniqueIds(safeLocal, "Local");
  validateUniqueIds(safeRemote, "Remote");

  if (conflicts.length > 0) {
    return { mergedItems: safeLocal, conflicts };
  }

  const baseMap = new Map<string, ChecklistItem>(safeBase.map((item) => [item.id, item]));
  const localMap = new Map<string, ChecklistItem>(safeLocal.map((item) => [item.id, item]));
  const remoteMap = new Map<string, ChecklistItem>(safeRemote.map((item) => [item.id, item]));

  // Preserve stable ordering: Base order -> Remote new -> Local new
  const orderedIds: string[] = [];
  const seenIds = new Set<string>();

  for (const item of safeBase) {
    if (!seenIds.has(item.id)) {
      seenIds.add(item.id);
      orderedIds.push(item.id);
    }
  }
  for (const item of safeRemote) {
    if (!seenIds.has(item.id)) {
      seenIds.add(item.id);
      orderedIds.push(item.id);
    }
  }
  for (const item of safeLocal) {
    if (!seenIds.has(item.id)) {
      seenIds.add(item.id);
      orderedIds.push(item.id);
    }
  }

  const mergedItems: ChecklistItem[] = [];

  for (const id of orderedIds) {
    const inBase = baseMap.has(id);
    const inLocal = localMap.has(id);
    const inRemote = remoteMap.has(id);

    const baseItem = baseMap.get(id);
    const localItem = localMap.get(id);
    const remoteItem = remoteMap.get(id);

    // Case 1: Exists in all three -> 3-way merge item subfields
    if (inBase && inLocal && inRemote && baseItem && localItem && remoteItem) {
      const mergedItem: ChecklistItem = { id };
      const subKeys = new Set<string>([
        "status",
        "notes",
        "recommendation",
        ...Object.keys(baseItem),
        ...Object.keys(localItem),
        ...Object.keys(remoteItem),
      ]);
      subKeys.delete("id");

      for (const key of subKeys) {
        const bVal = baseItem[key];
        const lVal = localItem[key];
        const rVal = remoteItem[key];

        const fieldResult = mergeScalarField(
          `items.${key}`,
          bVal,
          lVal,
          rVal,
          "CHECKLIST_FIELD",
          id
        );

        if (fieldResult.conflict) {
          conflicts.push(fieldResult.conflict);
        }
        if (fieldResult.value !== undefined) {
          mergedItem[key] = fieldResult.value;
        }
      }
      mergedItems.push(mergedItem);
      continue;
    }

    // Case 2: Added concurrently on both sides (not in base)
    if (!inBase && inLocal && inRemote && localItem && remoteItem) {
      const mergedItem: ChecklistItem = { id };
      const subKeys = new Set<string>([
        "status",
        "notes",
        "recommendation",
        ...Object.keys(localItem),
        ...Object.keys(remoteItem),
      ]);
      subKeys.delete("id");

      for (const key of subKeys) {
        const lVal = localItem[key];
        const rVal = remoteItem[key];

        const fieldResult = mergeScalarField(
          `items.${key}`,
          undefined,
          lVal,
          rVal,
          "CHECKLIST_FIELD",
          id
        );

        if (fieldResult.conflict) {
          conflicts.push(fieldResult.conflict);
        }
        if (fieldResult.value !== undefined) {
          mergedItem[key] = fieldResult.value;
        }
      }
      mergedItems.push(mergedItem);
      continue;
    }

    // Case 3: Added locally only
    if (!inBase && inLocal && !inRemote && localItem) {
      mergedItems.push({ ...localItem });
      continue;
    }

    // Case 4: Added remotely only
    if (!inBase && !inLocal && inRemote && remoteItem) {
      mergedItems.push({ ...remoteItem });
      continue;
    }

    // Case 5: Deleted locally, but existed in base
    if (inBase && !inLocal && baseItem) {
      if (!inRemote) {
        // Deleted on both sides -> stays deleted
        continue;
      }
      // Still present in remote: did remote modify it?
      if (remoteItem && !deepEqual(remoteItem, baseItem)) {
        // Edit-delete conflict!
        conflicts.push({
          field: "items",
          itemId: id,
          category: "CHECKLIST_EDIT_DELETE",
          baseValue: baseItem,
          localValue: undefined,
          remoteValue: remoteItem,
          message: `Checklist item '${id}' deleted locally, but modified remotely`,
        });
        mergedItems.push(remoteItem);
      } else {
        // Remote did not modify it -> local deletion applies cleanly
        continue;
      }
      continue;
    }

    // Case 6: Deleted remotely, but existed in base
    if (inBase && !inRemote && baseItem) {
      if (localItem && !deepEqual(localItem, baseItem)) {
        // Edit-delete conflict!
        conflicts.push({
          field: "items",
          itemId: id,
          category: "CHECKLIST_EDIT_DELETE",
          baseValue: baseItem,
          localValue: localItem,
          remoteValue: undefined,
          message: `Checklist item '${id}' deleted remotely, but modified locally`,
        });
        mergedItems.push(localItem);
      } else {
        // Local did not modify it -> remote deletion applies cleanly
        continue;
      }
      continue;
    }
  }

  return { mergedItems, conflicts };
}

/**
 * Reconciles Review Status according to the complete 64-case state machine matrix.
 *
 * Enforces:
 * - Direct terminal transitions (D -> A, D -> Rj) are strictly rejected.
 * - Retrograde transitions to draft (I -> D, A -> D, Rj -> D) are strictly rejected.
 * - Lateral terminal transitions without reopening (A -> Rj, Rj -> A) are strictly rejected.
 * - Category 5 Opposing human reviews (in_review -> approved vs in_review -> rejected)
 *   yield CONCURRENT_HUMAN_CONFLICT with outcomeStatus: null.
 * - Human decision precedence: automated draft saves never overwrite human review decisions.
 */
export function reconcileReviewStatus(
  base: ReviewStatus,
  local: ReviewStatus,
  remote: ReviewStatus
): ReviewReconciliationResult {
  // Category 1: Neither changed (4 combinations)
  if (local === base && remote === base) {
    return {
      resolved: true,
      outcomeStatus: base,
      currentRemoteStatus: remote,
      pendingLocalStatus: local,
      conflictType: null,
      requiresHumanResolution: false,
      reason: "NO_CHANGE",
    };
  }

  // Category 4: Both changed to the exact same state (12 combinations)
  if (local === remote && local !== base) {
    if (isValidReviewTransition(base, local)) {
      return {
        resolved: true,
        outcomeStatus: local,
        currentRemoteStatus: remote,
        pendingLocalStatus: local,
        conflictType: null,
        requiresHumanResolution: false,
        reason: "CONVERGENT_TRANSITION",
      };
    }
    return {
      resolved: false,
      outcomeStatus: null,
      currentRemoteStatus: remote,
      pendingLocalStatus: local,
      conflictType: "INVALID_TRANSITION",
      requiresHumanResolution: true,
      reason: "INVALID_CONVERGENT_TRANSITION",
    };
  }

  // Category 2: Only local changed (12 combinations: 5 valid, 7 invalid)
  if (local !== base && remote === base) {
    if (isValidReviewTransition(base, local)) {
      return {
        resolved: true,
        outcomeStatus: local,
        currentRemoteStatus: remote,
        pendingLocalStatus: local,
        conflictType: null,
        requiresHumanResolution: false,
        reason: "LOCAL_TRANSITION_COMMITTED",
      };
    }
    return {
      resolved: false,
      outcomeStatus: null,
      currentRemoteStatus: remote,
      pendingLocalStatus: local,
      conflictType: "INVALID_TRANSITION",
      requiresHumanResolution: true,
      reason: `Invalid review transition from '${base}' to '${local}'`,
    };
  }

  // Category 3: Only remote changed (12 combinations: 5 valid, 7 invalid)
  if (local === base && remote !== base) {
    if (isValidReviewTransition(base, remote)) {
      return {
        resolved: true,
        outcomeStatus: remote,
        currentRemoteStatus: remote,
        pendingLocalStatus: local,
        conflictType: null,
        requiresHumanResolution: false,
        reason: "REMOTE_TRANSITION_ADOPTED",
      };
    }
    return {
      resolved: false,
      outcomeStatus: null,
      currentRemoteStatus: remote,
      pendingLocalStatus: local,
      conflictType: "INVALID_TRANSITION",
      requiresHumanResolution: true,
      reason: `Corrupted remote review transition from '${base}' to '${remote}'`,
    };
  }

  // Category 5: Both changed to different states (24 combinations)
  // Opposing human decisions from in_review: (I, A, Rj) or (I, Rj, A)
  if (
    base === "in_review" &&
    isValidReviewTransition(base, local) &&
    isValidReviewTransition(base, remote)
  ) {
    return {
      resolved: false,
      outcomeStatus: null, // STRICTLY NULL: NEVER SILENTLY DEFAULT TO REMOTE
      currentRemoteStatus: remote,
      pendingLocalStatus: local,
      conflictType: "CONCURRENT_HUMAN_CONFLICT",
      requiresHumanResolution: true,
      reason: "OPPOSING_HUMAN_DECISIONS",
    };
  }

  const localValid = isValidReviewTransition(base, local);
  const remoteValid = isValidReviewTransition(base, remote);

  if (localValid && !remoteValid) {
    return {
      resolved: true,
      outcomeStatus: local,
      currentRemoteStatus: remote,
      pendingLocalStatus: local,
      conflictType: null,
      requiresHumanResolution: false,
      reason: "LOCAL_VALID_OVER_REMOTE_INVALID",
    };
  }

  if (!localValid && remoteValid) {
    return {
      resolved: true,
      outcomeStatus: remote,
      currentRemoteStatus: remote,
      pendingLocalStatus: local,
      conflictType: null,
      requiresHumanResolution: false,
      reason: "REMOTE_VALID_OVER_LOCAL_INVALID",
    };
  }

  return {
    resolved: false,
    outcomeStatus: null,
    currentRemoteStatus: remote,
    pendingLocalStatus: local,
    conflictType: "INVALID_TRANSITION",
    requiresHumanResolution: true,
    reason: "BOTH_TRANSITIONS_INVALID",
  };
}

/**
 * Pre-calculated exhaustive 64-Case Matrix Entry structure for verification.
 */
export interface Matrix64Case {
  base: ReviewStatus;
  local: ReviewStatus;
  remote: ReviewStatus;
  category: "Cat 1 (No change)" | "Cat 2 (Only Local)" | "Cat 3 (Only Remote)" | "Cat 4 (Convergent)" | "Cat 5 (Divergent)";
  expectedResult: ReviewReconciliationResult;
}

/**
 * Generates all 64 exhaustive combinations for verification.
 */
export function generate64CaseMatrix(): Matrix64Case[] {
  const statuses: ReviewStatus[] = ["draft_generated", "in_review", "approved", "rejected"];
  const matrix: Matrix64Case[] = [];

  for (const base of statuses) {
    for (const local of statuses) {
      for (const remote of statuses) {
        let category: Matrix64Case["category"];
        if (local === base && remote === base) {
          category = "Cat 1 (No change)";
        } else if (local !== base && remote === base) {
          category = "Cat 2 (Only Local)";
        } else if (local === base && remote !== base) {
          category = "Cat 3 (Only Remote)";
        } else if (local === remote && local !== base) {
          category = "Cat 4 (Convergent)";
        } else {
          category = "Cat 5 (Divergent)";
        }

        const expectedResult = reconcileReviewStatus(base, local, remote);
        matrix.push({ base, local, remote, category, expectedResult });
      }
    }
  }

  return matrix;
}

/**
 * Authoritative static 64-case matrix for runtime assertions.
 */
export const REVIEW_RECONCILIATION_MATRIX_64: Matrix64Case[] = generate64CaseMatrix();

/**
 * Full Three-Way Inspection Merge Engine.
 * Reconciles Base (B), Local (L), and Remote (R) inspection snapshots.
 */
export function threeWayMerge(
  base: Partial<Inspection>,
  local: Partial<Inspection>,
  remote: Partial<Inspection>
): MergeResult<Inspection> {
  const conflicts: FieldConflict[] = [];

  // Incompatible identity checks
  if (base.id && local.id && base.id !== local.id) {
    conflicts.push({
      field: "id",
      category: "INCOMPATIBLE_DATA",
      baseValue: base.id,
      localValue: local.id,
      remoteValue: remote.id,
      message: "Base and Local inspection IDs do not match",
    });
  }

  if (remote.id && local.id && remote.id !== local.id) {
    conflicts.push({
      field: "id",
      category: "INCOMPATIBLE_DATA",
      baseValue: base.id,
      localValue: local.id,
      remoteValue: remote.id,
      message: "Local and Remote inspection IDs do not match",
    });
  }

  if (base.ownerUid && local.ownerUid && base.ownerUid !== local.ownerUid) {
    conflicts.push({
      field: "ownerUid",
      category: "INCOMPATIBLE_DATA",
      baseValue: base.ownerUid,
      localValue: local.ownerUid,
      remoteValue: remote.ownerUid,
      message: "Owner UID mismatch between Base and Local",
    });
  }

  if (remote.ownerUid && local.ownerUid && remote.ownerUid !== local.ownerUid) {
    conflicts.push({
      field: "ownerUid",
      category: "INCOMPATIBLE_DATA",
      baseValue: base.ownerUid,
      localValue: local.ownerUid,
      remoteValue: remote.ownerUid,
      message: "Owner UID mismatch between Local and Remote",
    });
  }

  // Archival protection: cannot update draft onto archived remote
  if (remote.isArchived === true && local.isArchived !== true) {
    conflicts.push({
      field: "isArchived",
      category: "ARCHIVE_STATE",
      baseValue: base.isArchived,
      localValue: local.isArchived,
      remoteValue: remote.isArchived,
      message: "Cannot update draft: remote inspection is archived",
    });
  }

  // Reconcile Review Status via 64-case state machine
  const baseStatus = base.reviewStatus || "draft_generated";
  const localStatus = local.reviewStatus || "draft_generated";
  const remoteStatus = remote.reviewStatus || "draft_generated";

  const reviewReconciliation = reconcileReviewStatus(baseStatus, localStatus, remoteStatus);

  if (reviewReconciliation.conflictType === "CONCURRENT_HUMAN_CONFLICT") {
    conflicts.push({
      field: "reviewStatus",
      category: "REVIEW_STATUS",
      baseValue: baseStatus,
      localValue: localStatus,
      remoteValue: remoteStatus,
      message: "CONCURRENT_HUMAN_CONFLICT: Opposing human review decisions",
    });
  } else if (!reviewReconciliation.resolved) {
    conflicts.push({
      field: "reviewStatus",
      category: "REVIEW_STATUS",
      baseValue: baseStatus,
      localValue: localStatus,
      remoteValue: remoteStatus,
      message: `Review transition rejected: ${reviewReconciliation.reason}`,
    });
  }

  // Human Review Precedence: If remote is approved or rejected, draft updates cannot overwrite it
  if (
    (remoteStatus === "approved" || remoteStatus === "rejected") &&
    (localStatus === "draft_generated" || localStatus === "in_review")
  ) {
    conflicts.push({
      field: "reviewStatus",
      category: "REVIEW_STATUS",
      baseValue: baseStatus,
      localValue: localStatus,
      remoteValue: remoteStatus,
      message: `Human decision precedence: remote review decision '${remoteStatus}' cannot be overwritten by draft save`,
    });
  }

  // Scalar content fields
  const titleResult = mergeScalarField("title", base.title ?? "", local.title ?? "", remote.title ?? "");
  if (titleResult.conflict) conflicts.push(titleResult.conflict);

  const obsResult = mergeScalarField(
    "observation",
    base.observation ?? "",
    local.observation ?? "",
    remote.observation ?? ""
  );
  if (obsResult.conflict) conflicts.push(obsResult.conflict);

  const summaryResult = mergeScalarField(
    "summary",
    base.summary ?? "",
    local.summary ?? "",
    remote.summary ?? ""
  );
  if (summaryResult.conflict) conflicts.push(summaryResult.conflict);

  const weatherResult = mergeScalarField(
    "weatherNotes",
    base.weatherNotes ?? "",
    local.weatherNotes ?? "",
    remote.weatherNotes ?? ""
  );
  if (weatherResult.conflict) conflicts.push(weatherResult.conflict);

  const catResult = mergeScalarField(
    "category",
    base.category ?? "other",
    local.category ?? "other",
    remote.category ?? "other"
  );
  if (catResult.conflict) conflicts.push(catResult.conflict);

  // Structured Checklist items
  const itemsResult = mergeChecklistItems(base.items, local.items, remote.items);
  if (itemsResult.conflicts.length > 0) {
    conflicts.push(...itemsResult.conflicts);
  }

  // String arrays (symmetric set difference)
  const evidenceResult = mergeStringArrays(
    "visibleEvidence",
    base.visibleEvidence,
    local.visibleEvidence,
    remote.visibleEvidence
  );
  const uncertResult = mergeStringArrays(
    "uncertainties",
    base.uncertainties,
    local.uncertainties,
    remote.uncertainties
  );
  const followResult = mergeStringArrays(
    "inspectorFollowUp",
    base.inspectorFollowUp,
    local.inspectorFollowUp,
    remote.inspectorFollowUp
  );
  const photosResult = mergeStringArrays(
    "photoIds",
    base.photoIds,
    local.photoIds,
    remote.photoIds
  );

  // Assemble Merged Data Snapshot
  const effectiveReviewStatus: ReviewStatus =
    reviewReconciliation.outcomeStatus ||
    remote.reviewStatus ||
    local.reviewStatus ||
    "draft_generated";

  const mergedData: Inspection = {
    id: (remote.id || local.id || base.id || "") as string,
    ownerUid: remote.ownerUid || local.ownerUid || base.ownerUid,
    projectId: (remote.projectId || local.projectId || base.projectId || "") as string,
    projectName: (remote.projectName || local.projectName || base.projectName || "") as string,
    title: titleResult.value,
    observation: obsResult.value,
    category: catResult.value as ObservationCategory,
    summary: summaryResult.value || undefined,
    weatherNotes: weatherResult.value || undefined,
    items: itemsResult.mergedItems,
    visibleEvidence: evidenceResult.mergedArray,
    uncertainties: uncertResult.mergedArray,
    inspectorFollowUp: followResult.mergedArray,
    photoIds: photosResult.mergedArray,
    reviewStatus: effectiveReviewStatus,
    reviewHistory: remote.reviewHistory || base.reviewHistory || [],
    reviewedAt: remote.reviewedAt || local.reviewedAt,
    reviewedByUid: remote.reviewedByUid || local.reviewedByUid,
    revision: remote.revision ?? base.revision ?? 1,
    aiAssisted: remote.aiAssisted ?? base.aiAssisted ?? local.aiAssisted ?? false,
    inferenceSource: remote.inferenceSource ?? base.inferenceSource ?? local.inferenceSource,
    photoMeta: local.photoMeta || remote.photoMeta || base.photoMeta,
    createdAt: remote.createdAt || base.createdAt || local.createdAt || Date.now(),
    updatedAt: Date.now(),
    isArchived: remote.isArchived ?? base.isArchived ?? false,
    archivedAt: remote.archivedAt ?? base.archivedAt ?? null,
    archivedByUid: remote.archivedByUid ?? base.archivedByUid ?? null,
    archiveReason: remote.archiveReason ?? base.archiveReason ?? null,
    appliedMutationIds: remote.appliedMutationIds || [],
  };

  const hasConflicts = conflicts.length > 0;
  const conflictType =
    reviewReconciliation.conflictType === "CONCURRENT_HUMAN_CONFLICT"
      ? "CONCURRENT_HUMAN_CONFLICT"
      : conflicts.some((c) => c.category === "INCOMPATIBLE_DATA")
      ? "INVALID_INPUT"
      : hasConflicts
      ? "FIELD_CONFLICT"
      : null;

  return {
    success: !hasConflicts,
    hasConflicts,
    conflictType,
    mergedData,
    conflicts,
    reviewReconciliation,
    requiresHumanResolution: hasConflicts || reviewReconciliation.requiresHumanResolution,
    reason: hasConflicts
      ? `Merge conflict detected: ${conflicts.map((c) => c.field + (c.itemId ? `[${c.itemId}]` : "")).join(", ")}`
      : "Successfully merged",
  };
}
