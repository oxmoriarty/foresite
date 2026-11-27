/**
 * ForeSite Cloud Firestore Service Layer
 *
 * Implements owner-scoped subcollection access:
 * - /users/{uid} (User Profile)
 * - /users/{uid}/projects/{projectId} (Owner Projects)
 * - /users/{uid}/inspections/{inspectionId} (Owner Inspections)
 *
 * Invariants:
 * 1. Owner-scoped paths only: every read/write operates within /users/{uid}/...
 * 2. Immutable ownerUid: every record includes ownerUid matching the caller.
 * 3. Zero Binary Blobs: photos are never stored as binary in Firestore.
 */

import {
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  runTransaction,
  query,
  orderBy,
  where,
} from "firebase/firestore";
import { User } from "firebase/auth";
import { db, hasValidConfig } from "../lib/firebase";
import {
  Project,
  Inspection,
  UserProfile,
  TransactionalCreateResult,
  TransactionalMutationResult,
  UpdateDraftPayload,
  TransitionReviewPayload,
  ArchiveInspectionPayload,
  UnarchiveInspectionPayload,
  ReviewAuditEvent,
} from "../types";
import { isValidReviewTransition } from "./review";
import { threeWayMerge, reconcileReviewStatus } from "./merge";

// ============================================================================
// 1. User Profile Management (/users/{uid})
// ============================================================================

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  if (!hasValidConfig) return null;
  const userRef = doc(db, "users", uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) return null;
  return snap.data() as UserProfile;
}

export async function syncUserProfile(user: User): Promise<UserProfile> {
  const userRef = doc(db, "users", user.uid);
  const existing = await getUserProfile(user.uid);

  if (existing) {
    const updated: UserProfile = {
      ...existing,
      email: user.email,
      displayName: user.displayName || existing.displayName,
      emailVerified: user.emailVerified,
      lastLoginAt: Date.now(),
    };
    if (hasValidConfig) {
      await updateDoc(userRef, {
        email: updated.email,
        displayName: updated.displayName,
        emailVerified: updated.emailVerified,
        lastLoginAt: updated.lastLoginAt,
      });
    }
    return updated;
  }

  // Create initial profile document
  const newProfile: UserProfile = {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || (user.email ? (user.email.split("@")[0] ?? "Inspector") : "Inspector"),
    photoURL: user.photoURL || null,
    emailVerified: user.emailVerified,
    createdAt: Date.now(),
    lastLoginAt: Date.now(),
    role: "Site Inspector",
  };

  if (hasValidConfig) {
    await setDoc(userRef, newProfile);
  }

  return newProfile;
}

export async function updateUserProfile(
  uid: string,
  updates: Partial<Omit<UserProfile, "uid" | "createdAt">>
): Promise<void> {
  if (!hasValidConfig) return;
  const userRef = doc(db, "users", uid);
  await updateDoc(userRef, updates);
}

// ============================================================================
// 2. Project Subcollection (/users/{uid}/projects/{projectId})
// ============================================================================

export async function getUserProjects(uid: string): Promise<Project[]> {
  if (!hasValidConfig) return [];
  const projectsRef = collection(db, "users", uid, "projects");
  const q = query(projectsRef, orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);

  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ownerUid: data.ownerUid || uid,
      name: data.name,
      siteLabel: data.siteLabel,
      location: data.location,
      inspectionCount: data.inspectionCount || 0,
      createdAt: data.createdAt || Date.now(),
      updatedAt: data.updatedAt || Date.now(),
    } as Project;
  });
}

export async function createProject(
  uid: string,
  projectData: Omit<Project, "id" | "ownerUid" | "createdAt" | "updatedAt" | "inspectionCount"> & {
    inspectionCount?: number;
  }
): Promise<Project> {
  const projectId = `proj-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const now = Date.now();

  const newProject: Project = {
    id: projectId,
    ownerUid: uid,
    name: projectData.name,
    siteLabel: projectData.siteLabel,
    location: projectData.location,
    inspectionCount: projectData.inspectionCount || 0,
    createdAt: now,
    updatedAt: now,
  };

  if (hasValidConfig) {
    const projectRef = doc(db, "users", uid, "projects", projectId);
    await setDoc(projectRef, newProject);
  }

  return newProject;
}

export async function updateProject(
  uid: string,
  projectId: string,
  updates: Partial<Omit<Project, "id" | "ownerUid" | "createdAt">>
): Promise<void> {
  if (!hasValidConfig) return;
  const projectRef = doc(db, "users", uid, "projects", projectId);
  await updateDoc(projectRef, {
    ...updates,
    updatedAt: Date.now(),
  });
}

export async function deleteProject(uid: string, projectId: string): Promise<void> {
  if (!hasValidConfig) return;
  const projectRef = doc(db, "users", uid, "projects", projectId);
  await deleteDoc(projectRef);

  // Cascade delete all associated inspections in Firestore
  const inspectionsRef = collection(db, "users", uid, "inspections");
  const q = query(inspectionsRef, where("projectId", "==", projectId));
  const snapshot = await getDocs(q);
  await Promise.all(snapshot.docs.map((docSnap) => deleteDoc(docSnap.ref)));
}

// ============================================================================
// 3. Inspection Subcollection (/users/{uid}/inspections/{inspectionId})
// ============================================================================

export async function getUserInspections(
  uid: string,
  projectId?: string
): Promise<Inspection[]> {
  if (!hasValidConfig) return [];
  const inspectionsRef = collection(db, "users", uid, "inspections");
  const q = projectId
    ? query(
        inspectionsRef,
        where("projectId", "==", projectId),
        orderBy("createdAt", "desc")
      )
    : query(inspectionsRef, orderBy("createdAt", "desc"));

  const snapshot = await getDocs(q);

  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ownerUid: data.ownerUid || uid,
      projectId: data.projectId,
      projectName: data.projectName,
      title: data.title,
      observation: data.observation,
      category: data.category,
      visibleEvidence: data.visibleEvidence || [],
      uncertainties: data.uncertainties || [],
      inspectorFollowUp: data.inspectorFollowUp || [],
      reviewStatus: data.reviewStatus,
      aiAssisted: data.aiAssisted ?? false,
      inferenceSource: data.inferenceSource,
      photoMeta: data.photoMeta,
      createdAt: data.createdAt || Date.now(),
      updatedAt: data.updatedAt || Date.now(),
      reviewedAt: data.reviewedAt,
      reviewedByUid: data.reviewedByUid,
    } as Inspection;
  });
}

export async function getInspection(uid: string, inspectionId: string): Promise<Inspection | null> {
  if (!hasValidConfig) return null;
  const inspectionRef = doc(db, "users", uid, "inspections", inspectionId);
  const snap = await getDoc(inspectionRef);
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    id: snap.id,
    ownerUid: data.ownerUid || uid,
    projectId: data.projectId,
    projectName: data.projectName,
    title: data.title,
    observation: data.observation,
    category: data.category,
    visibleEvidence: data.visibleEvidence || [],
    uncertainties: data.uncertainties || [],
    inspectorFollowUp: data.inspectorFollowUp || [],
    reviewStatus: data.reviewStatus,
    reviewHistory: data.reviewHistory || [],
    revision: data.revision || 1,
    aiAssisted: data.aiAssisted ?? false,
    inferenceSource: data.inferenceSource,
    photoMeta: data.photoMeta,
    photoIds: data.photoIds || [],
    createdAt: data.createdAt || Date.now(),
    updatedAt: data.updatedAt || Date.now(),
    reviewedAt: data.reviewedAt,
    reviewedByUid: data.reviewedByUid,
    isArchived: data.isArchived,
    archivedAt: data.archivedAt,
    archivedByUid: data.archivedByUid,
    archiveReason: data.archiveReason,
    appliedMutationIds: data.appliedMutationIds || [],
  } as Inspection;
}

/**
 * Atomic read-before-create transaction for CREATE_INSPECTION.
 *
 * Guarantees:
 * 1. Reads target document /users/{uid}/inspections/{inspectionId} inside a Firestore transaction.
 * 2. If document does not exist: creates it with canonical ID and durable clientCreationNonce.
 * 3. If document exists with matching clientCreationNonce and ownerUid: returns ALREADY_EXISTS_SAME_MUTATION
 *    (idempotent acknowledged write, e.g. prior crash recovery). Does NOT modify or overwrite the document.
 * 4. If document exists with different creation identity (or no nonce): returns CONFLICT. Does NOT modify document.
 * 5. Concurrent independent clients targeting the same path are serialized safely by Firestore transaction locks.
 */
export async function createInspectionTransaction(
  uid: string,
  inspectionData: Omit<Inspection, "id" | "ownerUid" | "createdAt" | "updatedAt"> & {
    id: string;
    createdAt?: number;
    updatedAt?: number;
  },
  creationNonce: string
): Promise<TransactionalCreateResult> {
  const inspectionId = inspectionData.id;
  const now = Date.now();

  const newInspection: Inspection = {
    ...inspectionData,
    id: inspectionId,
    ownerUid: uid,
    clientCreationNonce: creationNonce,
    reviewStatus: inspectionData.reviewStatus || "draft_generated",
    reviewHistory: inspectionData.reviewHistory || [],
    appliedMutationIds: inspectionData.appliedMutationIds || [],
    isArchived: inspectionData.isArchived ?? false,
    revision: inspectionData.revision ?? 1,
    createdAt: inspectionData.createdAt || now,
    updatedAt: inspectionData.updatedAt || now,
  };

  if (!hasValidConfig) {
    return {
      status: "CREATED",
      inspection: newInspection,
    };
  }

  const inspectionRef = doc(db, "users", uid, "inspections", inspectionId);

  return await runTransaction(db, async (transaction) => {
    const docSnap = await transaction.get(inspectionRef);

    if (!docSnap.exists()) {
      transaction.set(inspectionRef, newInspection);
      return {
        status: "CREATED",
        inspection: newInspection,
      };
    }

    const data = docSnap.data();

    // Check durable creation identity
    if (
      data.clientCreationNonce === creationNonce &&
      data.ownerUid === uid &&
      docSnap.id === inspectionId
    ) {
      // Prior write already committed (crash window recovery)
      return {
        status: "ALREADY_EXISTS_SAME_MUTATION",
        inspection: {
          ...data,
          id: docSnap.id,
          ownerUid: data.ownerUid || uid,
        } as Inspection,
      };
    }

    // Document exists with different creation identity or no creation nonce: Conflict!
    return {
      status: "CONFLICT",
      reason: data.clientCreationNonce
        ? `Remote inspection exists with differing creation identity (existing: ${data.clientCreationNonce}, attempted: ${creationNonce})`
        : "Remote inspection exists without matching creation nonce",
    };
  });
}

/**
 * Atomic update transaction for UPDATE_DRAFT.
 *
 * Guarantees:
 * 1. Checks document existence; returns NOT_FOUND if missing.
 * 2. Idempotency: Returns ALREADY_APPLIED if mutationId is in appliedMutationIds.
 * 3. Review Decision Protection: Returns CONFLICT if remote inspection is approved or rejected.
 * 4. Archival Protection: Returns CONFLICT if remote inspection is archived.
 * 5. Optimistic Concurrency: Returns CONFLICT if remote revision > baseRevision.
 * 6. Content Update: Updates only draft observation fields; preserves review audit state and IDs.
 */
export async function updateInspectionDraftTransaction(
  uid: string,
  inspectionId: string,
  payload: UpdateDraftPayload,
  mutationId: string,
  baseRevision?: number
): Promise<TransactionalMutationResult> {
  if (!hasValidConfig) {
    return {
      status: "APPLIED",
    };
  }

  const inspectionRef = doc(db, "users", uid, "inspections", inspectionId);

  return await runTransaction(db, async (transaction) => {
    const docSnap = await transaction.get(inspectionRef);

    if (!docSnap.exists()) {
      return {
        status: "NOT_FOUND",
        reason: `Inspection ${inspectionId} does not exist in Firestore`,
      };
    }

    const data = docSnap.data() as Inspection;

    // Idempotency check: already applied?
    if (data.appliedMutationIds?.includes(mutationId)) {
      return {
        status: "ALREADY_APPLIED",
        inspection: {
          ...data,
          id: docSnap.id,
          ownerUid: data.ownerUid || uid,
        },
      };
    }

    // Review status invariant: never overwrite human review decisions
    if (data.reviewStatus === "approved" || data.reviewStatus === "rejected") {
      return {
        status: "CONFLICT",
        reason: `Cannot update draft: remote inspection is already ${data.reviewStatus}`,
      };
    }

    // Archival invariant: cannot update archived inspection
    if (data.isArchived === true) {
      return {
        status: "CONFLICT",
        reason: "Cannot update draft: remote inspection is archived",
      };
    }

    // Revision check: if remote has advanced past mutation baseRevision
    if (
      baseRevision !== undefined &&
      data.revision !== undefined &&
      data.revision > baseRevision
    ) {
      if (payload.baseSnapshot) {
        // Construct local working draft snapshot from baseSnapshot overlaid with payload changes
        const localDoc: Partial<Inspection> = {
          ...payload.baseSnapshot,
          title: payload.title !== undefined ? payload.title : payload.baseSnapshot.title,
          observation: payload.observation !== undefined ? payload.observation : payload.baseSnapshot.observation,
          category: payload.category !== undefined ? payload.category : payload.baseSnapshot.category,
          summary: payload.summary !== undefined ? payload.summary : payload.baseSnapshot.summary,
          weatherNotes: payload.weatherNotes !== undefined ? payload.weatherNotes : payload.baseSnapshot.weatherNotes,
          items: payload.items !== undefined ? payload.items : payload.baseSnapshot.items,
          visibleEvidence: payload.visibleEvidence !== undefined ? payload.visibleEvidence : payload.baseSnapshot.visibleEvidence,
          uncertainties: payload.uncertainties !== undefined ? payload.uncertainties : payload.baseSnapshot.uncertainties,
          inspectorFollowUp: payload.inspectorFollowUp !== undefined ? payload.inspectorFollowUp : payload.baseSnapshot.inspectorFollowUp,
          photoIds: payload.photoIds !== undefined ? payload.photoIds : payload.baseSnapshot.photoIds,
        };

        const mergeRes = threeWayMerge(payload.baseSnapshot, localDoc, data);

        if (!mergeRes.hasConflicts && mergeRes.mergedData) {
          const now = Date.now();
          const nextRevision = (data.revision || 1) + 1;
          const appliedIds = [...(data.appliedMutationIds || []), mutationId].slice(-10);

          const updatedDoc: Inspection = {
            ...mergeRes.mergedData,
            id: docSnap.id,
            ownerUid: data.ownerUid || uid,
            revision: nextRevision,
            appliedMutationIds: appliedIds,
            updatedAt: now,
          };

          transaction.set(inspectionRef, updatedDoc);

          return {
            status: "APPLIED",
            inspection: updatedDoc,
          };
        } else {
          return {
            status: "CONFLICT",
            reason: `Field conflict detected during three-way merge: ${mergeRes.conflicts.map((c) => c.field).join(", ")}`,
            conflictDetails: {
              conflicts: mergeRes.conflicts,
              baseSnapshot: payload.baseSnapshot,
              localSnapshot: localDoc,
              remoteSnapshot: data,
              reviewReconciliation: mergeRes.reviewReconciliation,
              detectedAt: Date.now(),
            },
          };
        }
      }

      return {
        status: "CONFLICT",
        reason: `Stale revision conflict: remote is at revision ${data.revision}, but mutation was based on revision ${baseRevision}`,
      };
    }

    const now = Date.now();
    const nextRevision = (data.revision || 1) + 1;
    const appliedIds = [...(data.appliedMutationIds || []), mutationId].slice(-10);

    const updatedDoc: Inspection = {
      ...data,
      id: docSnap.id,
      ownerUid: data.ownerUid || uid,
      title: payload.title !== undefined ? payload.title : data.title,
      observation: payload.observation !== undefined ? payload.observation : data.observation,
      category: payload.category !== undefined ? payload.category : data.category,
      visibleEvidence: payload.visibleEvidence !== undefined ? payload.visibleEvidence : (data.visibleEvidence || []),
      uncertainties: payload.uncertainties !== undefined ? payload.uncertainties : (data.uncertainties || []),
      inspectorFollowUp: payload.inspectorFollowUp !== undefined ? payload.inspectorFollowUp : (data.inspectorFollowUp || []),
      photoIds: payload.photoIds !== undefined ? payload.photoIds : (data.photoIds || []),
      revision: nextRevision,
      appliedMutationIds: appliedIds,
      updatedAt: now,
    };

    transaction.set(inspectionRef, updatedDoc);

    return {
      status: "APPLIED",
      inspection: updatedDoc,
    };
  });
}

/**
 * Atomic transition transaction for TRANSITION_REVIEW.
 *
 * Guarantees:
 * 1. Checks document existence; returns NOT_FOUND if missing.
 * 2. Idempotency: Returns ALREADY_APPLIED if mutationId is in appliedMutationIds or auditEventId in reviewHistory.
 * 3. Archival Protection: Returns CONFLICT if remote inspection is archived.
 * 4. Stale Transition Check: Returns CONFLICT if remote status !== payload.fromStatus.
 * 5. Lifecycle Invariants: Enforces strict 5-transition FSM; returns CONFLICT if illegal transition.
 * 6. History Bounds: Enforces max 100 review history events.
 * 7. Byte-for-Byte Preservation: Prior history is untouched; new audit event strictly appended.
 */
export async function transitionInspectionReviewTransaction(
  uid: string,
  inspectionId: string,
  payload: TransitionReviewPayload,
  mutationId: string,
  _baseRevision?: number
): Promise<TransactionalMutationResult> {
  if (!hasValidConfig) {
    return {
      status: "APPLIED",
    };
  }

  const inspectionRef = doc(db, "users", uid, "inspections", inspectionId);

  return await runTransaction(db, async (transaction) => {
    const docSnap = await transaction.get(inspectionRef);

    if (!docSnap.exists()) {
      return {
        status: "NOT_FOUND",
        reason: `Inspection ${inspectionId} does not exist in Firestore`,
      };
    }

    const data = docSnap.data() as Inspection;

    // Idempotency check: mutationId in appliedMutationIds OR auditEventId already in reviewHistory
    const existingHistory = data.reviewHistory || [];
    if (
      data.appliedMutationIds?.includes(mutationId) ||
      (payload.auditEventId && existingHistory.some((e) => e.id === payload.auditEventId))
    ) {
      return {
        status: "ALREADY_APPLIED",
        inspection: {
          ...data,
          id: docSnap.id,
          ownerUid: data.ownerUid || uid,
        },
      };
    }

    // Archival check
    if (data.isArchived === true) {
      return {
        status: "CONFLICT",
        reason: "Cannot transition review: remote inspection is archived",
      };
    }

    const currentStatus = data.reviewStatus || "draft_generated";

    // Stale status check
    if (payload.fromStatus && payload.fromStatus !== currentStatus) {
      const recon = reconcileReviewStatus(payload.fromStatus, payload.targetStatus, currentStatus);
      if (recon.conflictType === "CONCURRENT_HUMAN_CONFLICT") {
        return {
          status: "CONFLICT",
          reason: `CONCURRENT_HUMAN_CONFLICT: Opposing human decisions on inspection (Local: '${payload.targetStatus}', Remote: '${currentStatus}')`,
          conflictDetails: {
            conflicts: [
              {
                field: "reviewStatus",
                category: "REVIEW_STATUS",
                baseValue: payload.fromStatus,
                localValue: payload.targetStatus,
                remoteValue: currentStatus,
                message: "Opposing human review decisions",
              },
            ],
            baseSnapshot: { reviewStatus: payload.fromStatus },
            localSnapshot: { reviewStatus: payload.targetStatus },
            remoteSnapshot: data,
            reviewReconciliation: recon,
            detectedAt: Date.now(),
          },
        };
      }
      return {
        status: "CONFLICT",
        reason: `Stale review transition: remote status is '${currentStatus}', but transition expected '${payload.fromStatus}'`,
      };
    }

    // FSM transition validity check
    if (!isValidReviewTransition(currentStatus, payload.targetStatus)) {
      return {
        status: "CONFLICT",
        reason: `Invalid review transition from '${currentStatus}' to '${payload.targetStatus}'`,
      };
    }

    // History cap check (100 events)
    if (existingHistory.length >= 100) {
      return {
        status: "CONFLICT",
        reason: "Review history cap reached (100 events). Cannot record further transitions.",
      };
    }

    const reviewerUid = (payload.reviewerUid && payload.reviewerUid.trim()) || uid;
    const now = Date.now();
    const nextRevision = (data.revision || 1) + 1;

    const auditEvent: ReviewAuditEvent = {
      id:
        payload.auditEventId ||
        `rev-evt-${inspectionId}-r${nextRevision}-${payload.targetStatus}-${now}`,
      fromStatus: currentStatus,
      toStatus: payload.targetStatus,
      byUid: reviewerUid,
      timestamp: now,
      comment: payload.comment?.trim() || undefined,
      revision: nextRevision,
    };

    const appliedIds = [...(data.appliedMutationIds || []), mutationId].slice(-10);

    const updatedDoc: Inspection = {
      ...data,
      id: docSnap.id,
      ownerUid: data.ownerUid || uid,
      reviewStatus: payload.targetStatus,
      reviewHistory: [...existingHistory, auditEvent],
      reviewedAt: now,
      reviewedByUid: reviewerUid,
      revision: nextRevision,
      appliedMutationIds: appliedIds,
      updatedAt: now,
    };

    transaction.set(inspectionRef, updatedDoc);

    return {
      status: "APPLIED",
      inspection: updatedDoc,
    };
  });
}

/**
 * Atomic archival transaction for ARCHIVE_INSPECTION.
 *
 * Guarantees:
 * 1. Checks document existence; returns NOT_FOUND if missing.
 * 2. Idempotency: Returns ALREADY_APPLIED if mutationId is in appliedMutationIds or already isArchived.
 * 3. Soft Archival: Sets isArchived = true and records archival attribution metadata.
 */
export async function archiveInspectionTransaction(
  uid: string,
  inspectionId: string,
  payload: ArchiveInspectionPayload,
  mutationId: string,
  _baseRevision?: number
): Promise<TransactionalMutationResult> {
  if (!hasValidConfig) {
    return {
      status: "APPLIED",
    };
  }

  const inspectionRef = doc(db, "users", uid, "inspections", inspectionId);

  return await runTransaction(db, async (transaction) => {
    const docSnap = await transaction.get(inspectionRef);

    if (!docSnap.exists()) {
      return {
        status: "NOT_FOUND",
        reason: `Inspection ${inspectionId} does not exist in Firestore`,
      };
    }

    const data = docSnap.data() as Inspection;

    // Idempotency check: mutation already applied or inspection already archived
    if (data.appliedMutationIds?.includes(mutationId) || data.isArchived === true) {
      return {
        status: "ALREADY_APPLIED",
        inspection: {
          ...data,
          id: docSnap.id,
          ownerUid: data.ownerUid || uid,
        },
      };
    }

    const now = payload.archivedAt || Date.now();
    const nextRevision = (data.revision || 1) + 1;
    const appliedIds = [...(data.appliedMutationIds || []), mutationId].slice(-10);

    const updatedDoc: Inspection = {
      ...data,
      id: docSnap.id,
      ownerUid: data.ownerUid || uid,
      isArchived: true,
      archivedAt: now,
      archivedByUid: uid,
      archiveReason: payload.reason?.trim() || null,
      revision: nextRevision,
      appliedMutationIds: appliedIds,
      updatedAt: now,
    };

    transaction.set(inspectionRef, updatedDoc);

    return {
      status: "APPLIED",
      inspection: updatedDoc,
    };
  });
}

/**
 * Atomic unarchival transaction for UNARCHIVE_INSPECTION.
 *
 * Guarantees:
 * 1. Checks document existence; returns NOT_FOUND if missing.
 * 2. Idempotency: Returns ALREADY_APPLIED if mutationId is in appliedMutationIds or already active (!isArchived).
 * 3. Restores to Active: Sets isArchived = false and clears archival metadata to null.
 */
export async function unarchiveInspectionTransaction(
  uid: string,
  inspectionId: string,
  payload: UnarchiveInspectionPayload,
  mutationId: string,
  _baseRevision?: number
): Promise<TransactionalMutationResult> {
  if (!hasValidConfig) {
    return {
      status: "APPLIED",
    };
  }

  const inspectionRef = doc(db, "users", uid, "inspections", inspectionId);

  return await runTransaction(db, async (transaction) => {
    const docSnap = await transaction.get(inspectionRef);

    if (!docSnap.exists()) {
      return {
        status: "NOT_FOUND",
        reason: `Inspection ${inspectionId} does not exist in Firestore`,
      };
    }

    const data = docSnap.data() as Inspection;

    // Idempotency check: mutation already applied or inspection is already active (not archived)
    if (data.appliedMutationIds?.includes(mutationId) || data.isArchived === false) {
      return {
        status: "ALREADY_APPLIED",
        inspection: {
          ...data,
          id: docSnap.id,
          ownerUid: data.ownerUid || uid,
        },
      };
    }

    const now = payload.unarchivedAt || Date.now();
    const nextRevision = (data.revision || 1) + 1;
    const appliedIds = [...(data.appliedMutationIds || []), mutationId].slice(-10);

    const updatedDoc: Inspection = {
      ...data,
      id: docSnap.id,
      ownerUid: data.ownerUid || uid,
      isArchived: false,
      archivedAt: null,
      archivedByUid: null,
      archiveReason: null,
      revision: nextRevision,
      appliedMutationIds: appliedIds,
      updatedAt: now,
    };

    transaction.set(inspectionRef, updatedDoc);

    return {
      status: "APPLIED",
      inspection: updatedDoc,
    };
  });
}

/**
 * Atomic deletion transaction for DELETE_INSPECTION.
 *
 * Guarantees:
 * 1. Idempotency: If document does not exist, returns DELETED (satisfied target state).
 * 2. Strict Deletion Eligibility: Hard deletion is allowed ONLY for active, unreviewed drafts
 *    (reviewStatus === 'draft_generated' with zero review history events and isArchived !== true).
 * 3. Protected Records: Returns CONFLICT if inspection is in review, approved, rejected,
 *    archived, or has any review history events.
 */
export async function deleteInspectionTransaction(
  uid: string,
  inspectionId: string,
  _mutationId: string
): Promise<TransactionalMutationResult> {
  if (!hasValidConfig) {
    return {
      status: "DELETED",
    };
  }

  const inspectionRef = doc(db, "users", uid, "inspections", inspectionId);

  return await runTransaction(db, async (transaction) => {
    const docSnap = await transaction.get(inspectionRef);

    if (!docSnap.exists()) {
      return {
        status: "DELETED",
        reason: "Remote inspection document does not exist or has already been deleted",
      };
    }

    const data = docSnap.data() as Inspection;

    // Strict Deletion Invariants:
    // Only active (not archived), unreviewed drafts (reviewStatus === 'draft_generated' with 0 review history) can be deleted
    const isUnreviewed = (data.reviewStatus || "draft_generated") === "draft_generated";
    const hasZeroHistory = !data.reviewHistory || data.reviewHistory.length === 0;
    const isNotArchived = data.isArchived !== true;

    if (!isUnreviewed || !hasZeroHistory || !isNotArchived) {
      return {
        status: "CONFLICT",
        reason: `Cannot delete inspection: only active unreviewed drafts (reviewStatus 'draft_generated' with 0 review history events) can be deleted. Current reviewStatus: '${data.reviewStatus}', history count: ${data.reviewHistory?.length || 0}, isArchived: ${!!data.isArchived}`,
      };
    }

    transaction.delete(inspectionRef);

    return {
      status: "DELETED",
    };
  });
}

export async function createInspection(
  uid: string,
  inspectionData: Omit<Inspection, "id" | "ownerUid" | "createdAt" | "updatedAt"> & {
    id?: string;
    createdAt?: number;
    updatedAt?: number;
  }
): Promise<Inspection> {
  const inspectionId =
    inspectionData.id || `insp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const now = Date.now();

  const newInspection: Inspection = {
    id: inspectionId,
    ownerUid: uid,
    ...inspectionData,
    createdAt: inspectionData.createdAt || now,
    updatedAt: inspectionData.updatedAt || now,
  };

  if (hasValidConfig) {
    const inspectionRef = doc(db, "users", uid, "inspections", inspectionId);
    await setDoc(inspectionRef, newInspection);
  }

  return newInspection;
}

export async function updateInspection(
  uid: string,
  inspectionId: string,
  updates: Partial<Omit<Inspection, "id" | "ownerUid" | "createdAt">>
): Promise<void> {
  if (!hasValidConfig) return;
  const inspectionRef = doc(db, "users", uid, "inspections", inspectionId);
  await updateDoc(inspectionRef, {
    ...updates,
    updatedAt: Date.now(),
  });
}

export async function deleteInspection(uid: string, inspectionId: string): Promise<void> {
  if (!hasValidConfig) return;
  const inspectionRef = doc(db, "users", uid, "inspections", inspectionId);
  await deleteDoc(inspectionRef);
}
