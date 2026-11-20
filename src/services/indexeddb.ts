/**
 * ForeSite Versioned IndexedDB Storage Layer
 *
 * Provides typed, resilient client-side storage for:
 * 1. Original photographic evidence Blobs ('evidencePhotos')
 * 2. Unfinished local inspection draft payloads ('localInspections')
 * 3. Local project caching ('localProjects')
 *
 * Invariants:
 * - Versioned schema upgrades (Database: 'ForeSiteEvidenceDB', Version: 1)
 * - Original high-resolution Blobs remain strictly in this store.
 * - NEVER send binary Blobs or Base64 payloads to Cloud Firestore.
 */

import {
  LocalEvidencePhoto,
  LocalDraftInspection,
  Project,
  StorageEstimateInfo,
  Inspection,
  ReviewAuditEvent,
  DeletionReceipt,
} from "../types";

export const DB_NAME = "ForeSiteEvidenceDB";
export const DB_VERSION = 4;

export const STORES = {
  PHOTOS: "evidencePhotos",
  DRAFTS: "localInspections",
  PROJECTS: "localProjects",
  MUTATIONS: "mutations",
  SEQUENCES: "sequenceGenerators",
  RECEIPTS: "deletionReceipts",
} as const;

export class ForeSiteStorageError extends Error {
  constructor(
    message: string,
    public readonly code: "QUOTA_EXCEEDED" | "DB_BLOCKED" | "NOT_FOUND" | "TRANSACTION_FAILED" | "UNKNOWN",
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = "ForeSiteStorageError";
  }
}

let dbInstance: IDBDatabase | null = null;
let dbOpenPromise: Promise<IDBDatabase> | null = null;

/**
 * Opens or retrieves the singleton IndexedDB connection with versioned upgrade logic.
 */
export function getDatabase(): Promise<IDBDatabase> {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  if (dbOpenPromise) {
    return dbOpenPromise;
  }

  dbOpenPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(
        new ForeSiteStorageError(
          "IndexedDB is not supported or is disabled in this browser profile.",
          "DB_BLOCKED"
        )
      );
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      const oldVersion = event.oldVersion;

      // Version 1 Migration: Initial Object Stores and Indexes
      if (oldVersion < 1) {
        // Store 1: Original Photographic Evidence Blobs
        if (!db.objectStoreNames.contains(STORES.PHOTOS)) {
          const photoStore = db.createObjectStore(STORES.PHOTOS, { keyPath: "id" });
          photoStore.createIndex("by_inspectionId", "inspectionId", { unique: false });
          photoStore.createIndex("by_projectId", "projectId", { unique: false });
          photoStore.createIndex("by_createdAt", "createdAt", { unique: false });
        }

        // Store 2: Local Inspection Drafts
        if (!db.objectStoreNames.contains(STORES.DRAFTS)) {
          const draftStore = db.createObjectStore(STORES.DRAFTS, { keyPath: "id" });
          draftStore.createIndex("by_projectId", "projectId", { unique: false });
          draftStore.createIndex("by_lastSavedAt", "lastSavedAt", { unique: false });
          draftStore.createIndex("by_isSynced", "isSynced", { unique: false });
        }

        // Store 3: Local Projects Cache
        if (!db.objectStoreNames.contains(STORES.PROJECTS)) {
          const projectStore = db.createObjectStore(STORES.PROJECTS, { keyPath: "id" });
          projectStore.createIndex("by_updatedAt", "updatedAt", { unique: false });
        }
      }

      // Version 2 Migration: Add reviewStatus index to drafts store non-destructively
      if (oldVersion < 2) {
        const transaction = request.transaction;
        if (transaction && db.objectStoreNames.contains(STORES.DRAFTS)) {
          const draftStore = transaction.objectStore(STORES.DRAFTS);
          if (!draftStore.indexNames.contains("by_reviewStatus")) {
            draftStore.createIndex("by_reviewStatus", "reviewStatus", { unique: false });
          }
        }
      }

      // Version 3 Migration: Add mutations and sequenceGenerators stores non-destructively
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

      // Version 4 Migration: Add deletionReceipts store non-destructively
      if (oldVersion < 4) {
        if (!db.objectStoreNames.contains(STORES.RECEIPTS)) {
          const receiptStore = db.createObjectStore(STORES.RECEIPTS, { keyPath: "id" });
          receiptStore.createIndex("by_inspectionId", "inspectionId", { unique: false });
          receiptStore.createIndex("by_ownerUid", "ownerUid", { unique: false });
          receiptStore.createIndex("by_stage", "stage", { unique: false });
          receiptStore.createIndex("by_createdAt", "createdAt", { unique: false });
        }
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      dbInstance.onversionchange = () => {
        dbInstance?.close();
        dbInstance = null;
        dbOpenPromise = null;
      };
      resolve(dbInstance);
    };

    request.onerror = () => {
      dbOpenPromise = null;
      reject(
        new ForeSiteStorageError(
          `Failed to open IndexedDB database: ${request.error?.message || "Unknown error"}`,
          "TRANSACTION_FAILED",
          request.error
        )
      );
    };

    request.onblocked = () => {
      reject(
        new ForeSiteStorageError(
          "IndexedDB upgrade blocked by another open tab. Please close other ForeSite tabs and refresh.",
          "DB_BLOCKED"
        )
      );
    };
  });

  return dbOpenPromise;
}

/**
 * Closes the active database connection. Useful for test isolation and teardown.
 */
export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
  dbOpenPromise = null;
}

// ============================================================================
// 1. Evidence Photograph Repository (Blob Storage)
// ============================================================================

export async function saveEvidencePhoto(photo: LocalEvidencePhoto): Promise<void> {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([STORES.PHOTOS], "readwrite");
      const store = transaction.objectStore(STORES.PHOTOS);
      const request = store.put(photo);

      request.onsuccess = () => resolve();
      request.onerror = () => {
        const error = request.error;
        if (error && error.name === "QuotaExceededError") {
          reject(
            new ForeSiteStorageError(
              "Local storage quota exceeded. Free up device disk space or remove older site photographs.",
              "QUOTA_EXCEEDED",
              error
            )
          );
        } else {
          reject(
            new ForeSiteStorageError(
              `Failed to save photograph: ${error?.message || "Transaction error"}`,
              "TRANSACTION_FAILED",
              error
            )
          );
        }
      };
    } catch (err: unknown) {
      reject(
        new ForeSiteStorageError("Unexpected error during photo save transaction.", "UNKNOWN", err)
      );
    }
  });
}

export async function getEvidencePhoto(photoId: string): Promise<LocalEvidencePhoto | null> {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([STORES.PHOTOS], "readonly");
      const store = transaction.objectStore(STORES.PHOTOS);
      const request = store.get(photoId);

      request.onsuccess = () => {
        resolve((request.result as LocalEvidencePhoto) || null);
      };
      request.onerror = () => {
        reject(
          new ForeSiteStorageError(
            `Failed to retrieve photo ${photoId}: ${request.error?.message}`,
            "TRANSACTION_FAILED",
            request.error
          )
        );
      };
    } catch (err: unknown) {
      reject(
        new ForeSiteStorageError("Unexpected error during photo read transaction.", "UNKNOWN", err)
      );
    }
  });
}

export async function getEvidencePhotosByInspection(
  inspectionId: string
): Promise<LocalEvidencePhoto[]> {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([STORES.PHOTOS], "readonly");
      const store = transaction.objectStore(STORES.PHOTOS);
      const index = store.index("by_inspectionId");
      const request = index.getAll(inspectionId);

      request.onsuccess = () => {
        resolve((request.result as LocalEvidencePhoto[]) || []);
      };
      request.onerror = () => {
        reject(
          new ForeSiteStorageError(
            `Failed to query photos for inspection ${inspectionId}: ${request.error?.message}`,
            "TRANSACTION_FAILED",
            request.error
          )
        );
      };
    } catch (err: unknown) {
      reject(
        new ForeSiteStorageError(
          "Unexpected error during photo query transaction.",
          "UNKNOWN",
          err
        )
      );
    }
  });
}

export async function getEvidencePhotosByProject(
  projectId: string
): Promise<LocalEvidencePhoto[]> {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([STORES.PHOTOS], "readonly");
      const store = transaction.objectStore(STORES.PHOTOS);
      const index = store.index("by_projectId");
      const request = index.getAll(projectId);

      request.onsuccess = () => {
        resolve((request.result as LocalEvidencePhoto[]) || []);
      };
      request.onerror = () => {
        reject(
          new ForeSiteStorageError(
            `Failed to query photos for project ${projectId}: ${request.error?.message}`,
            "TRANSACTION_FAILED",
            request.error
          )
        );
      };
    } catch (err: unknown) {
      reject(
        new ForeSiteStorageError(
          "Unexpected error during project photos query.",
          "UNKNOWN",
          err
        )
      );
    }
  });
}

export async function deleteEvidencePhoto(photoId: string): Promise<void> {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([STORES.PHOTOS], "readwrite");
      const store = transaction.objectStore(STORES.PHOTOS);
      const request = store.delete(photoId);

      request.onsuccess = () => resolve();
      request.onerror = () => {
        reject(
          new ForeSiteStorageError(
            `Failed to delete photo ${photoId}: ${request.error?.message}`,
            "TRANSACTION_FAILED",
            request.error
          )
        );
      };
    } catch (err: unknown) {
      reject(
        new ForeSiteStorageError("Unexpected error during photo deletion.", "UNKNOWN", err)
      );
    }
  });
}

export async function deleteEvidencePhotosByInspection(inspectionId: string): Promise<number> {
  const photos = await getEvidencePhotosByInspection(inspectionId);
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([STORES.PHOTOS], "readwrite");
      const store = transaction.objectStore(STORES.PHOTOS);
      for (const photo of photos) {
        store.delete(photo.id);
      }
      transaction.oncomplete = () => resolve(photos.length);
      transaction.onerror = () => {
        reject(
          new ForeSiteStorageError(
            `Failed to delete photos for inspection ${inspectionId}: ${transaction.error?.message}`,
            "TRANSACTION_FAILED",
            transaction.error
          )
        );
      };
    } catch (err: unknown) {
      reject(
        new ForeSiteStorageError("Unexpected error during batch photo delete.", "UNKNOWN", err)
      );
    }
  });
}

export async function deleteEvidencePhotosByProject(projectId: string): Promise<number> {
  const photos = await getEvidencePhotosByProject(projectId);
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([STORES.PHOTOS], "readwrite");
      const store = transaction.objectStore(STORES.PHOTOS);
      for (const photo of photos) {
        store.delete(photo.id);
      }
      transaction.oncomplete = () => resolve(photos.length);
      transaction.onerror = () => {
        reject(
          new ForeSiteStorageError(
            `Failed to delete photos for project ${projectId}: ${transaction.error?.message}`,
            "TRANSACTION_FAILED",
            transaction.error
          )
        );
      };
    } catch (err: unknown) {
      reject(
        new ForeSiteStorageError("Unexpected error during project photo cleanup.", "UNKNOWN", err)
      );
    }
  });
}

export async function getAllEvidencePhotosCount(): Promise<number> {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([STORES.PHOTOS], "readonly");
      const store = transaction.objectStore(STORES.PHOTOS);
      const request = store.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        reject(
          new ForeSiteStorageError(
            `Failed to count stored photos: ${request.error?.message}`,
            "TRANSACTION_FAILED",
            request.error
          )
        );
      };
    } catch (err: unknown) {
      reject(
        new ForeSiteStorageError("Unexpected error during photo count.", "UNKNOWN", err)
      );
    }
  });
}

// ============================================================================
// 2. Local Inspection Drafts Repository
// ============================================================================

export async function saveLocalDraft(draft: LocalDraftInspection): Promise<void> {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([STORES.DRAFTS], "readwrite");
      const store = transaction.objectStore(STORES.DRAFTS);
      const request = store.put({
        ...draft,
        lastSavedAt: Date.now(),
      });

      request.onsuccess = () => resolve();
      request.onerror = () => {
        reject(
          new ForeSiteStorageError(
            `Failed to save draft ${draft.id}: ${request.error?.message}`,
            "TRANSACTION_FAILED",
            request.error
          )
        );
      };
    } catch (err: unknown) {
      reject(
        new ForeSiteStorageError("Unexpected error during draft save transaction.", "UNKNOWN", err)
      );
    }
  });
}

export async function getLocalDraft(draftId: string): Promise<LocalDraftInspection | null> {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([STORES.DRAFTS], "readonly");
      const store = transaction.objectStore(STORES.DRAFTS);
      const request = store.get(draftId);

      request.onsuccess = () => {
        const result = (request.result as LocalDraftInspection) || null;
        if (!result) {
          resolve(null);
          return;
        }
        resolve({
          ...result,
          reviewStatus: result.reviewStatus || "draft_generated",
          reviewHistory: result.reviewHistory || [],
        });
      };
      request.onerror = () => {
        reject(
          new ForeSiteStorageError(
            `Failed to retrieve draft ${draftId}: ${request.error?.message}`,
            "TRANSACTION_FAILED",
            request.error
          )
        );
      };
    } catch (err: unknown) {
      reject(
        new ForeSiteStorageError("Unexpected error during draft read.", "UNKNOWN", err)
      );
    }
  });
}

export async function getAllLocalDrafts(): Promise<LocalDraftInspection[]> {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([STORES.DRAFTS], "readonly");
      const store = transaction.objectStore(STORES.DRAFTS);
      const request = store.getAll();

      request.onsuccess = () => {
        // Return drafts sorted by newest lastSavedAt with backward-compatible defaults
        const rawDrafts = (request.result as LocalDraftInspection[]) || [];
        const drafts = rawDrafts.map((d) => ({
          ...d,
          reviewStatus: d.reviewStatus || "draft_generated",
          reviewHistory: d.reviewHistory || [],
        }));
        drafts.sort((a, b) => b.lastSavedAt - a.lastSavedAt);
        resolve(drafts);
      };
      request.onerror = () => {
        reject(
          new ForeSiteStorageError(
            `Failed to query all local drafts: ${request.error?.message}`,
            "TRANSACTION_FAILED",
            request.error
          )
        );
      };
    } catch (err: unknown) {
      reject(
        new ForeSiteStorageError("Unexpected error during drafts query.", "UNKNOWN", err)
      );
    }
  });
}

export async function getLocalDraftsByProject(
  projectId: string
): Promise<LocalDraftInspection[]> {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([STORES.DRAFTS], "readonly");
      const store = transaction.objectStore(STORES.DRAFTS);
      const index = store.index("by_projectId");
      const request = index.getAll(projectId);

      request.onsuccess = () => {
        const rawDrafts = (request.result as LocalDraftInspection[]) || [];
        const drafts = rawDrafts.map((d) => ({
          ...d,
          reviewStatus: d.reviewStatus || "draft_generated",
          reviewHistory: d.reviewHistory || [],
        }));
        drafts.sort((a, b) => b.lastSavedAt - a.lastSavedAt);
        resolve(drafts);
      };
      request.onerror = () => {
        reject(
          new ForeSiteStorageError(
            `Failed to query drafts for project ${projectId}: ${request.error?.message}`,
            "TRANSACTION_FAILED",
            request.error
          )
        );
      };
    } catch (err: unknown) {
      reject(
        new ForeSiteStorageError("Unexpected error during project drafts query.", "UNKNOWN", err)
      );
    }
  });
}

/**
 * Atomically persists an inspection review transition and its audit event
 * to IndexedDB within a single readwrite transaction.
 */
export async function persistLocalReviewTransition(
  inspectionId: string,
  updatedInspection: Inspection,
  newEvent: ReviewAuditEvent
): Promise<void> {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([STORES.DRAFTS], "readwrite");
      const store = transaction.objectStore(STORES.DRAFTS);

      const draftPayload: LocalDraftInspection = {
        id: updatedInspection.id,
        projectId: updatedInspection.projectId,
        projectName: updatedInspection.projectName,
        title: updatedInspection.title,
        observation: updatedInspection.observation,
        category: updatedInspection.category,
        visibleEvidence: updatedInspection.visibleEvidence || [],
        uncertainties: updatedInspection.uncertainties || [],
        inspectorFollowUp: updatedInspection.inspectorFollowUp || [],
        photoIds: updatedInspection.photoIds || (updatedInspection.photoMeta ? [updatedInspection.photoMeta.id] : []),
        isSynced: false,
        reviewStatus: updatedInspection.reviewStatus,
        reviewHistory: updatedInspection.reviewHistory || [newEvent],
        reviewedAt: updatedInspection.reviewedAt,
        reviewedByUid: updatedInspection.reviewedByUid,
        revision: updatedInspection.revision,
        lastSavedAt: Date.now(),
        createdAt: updatedInspection.createdAt,
      };

      const request = store.put(draftPayload);

      request.onsuccess = () => resolve();
      request.onerror = () => {
        reject(
          new ForeSiteStorageError(
            `Failed to persist review transition locally for ${inspectionId}: ${request.error?.message}`,
            "TRANSACTION_FAILED",
            request.error
          )
        );
      };
    } catch (err: unknown) {
      reject(
        new ForeSiteStorageError(
          "Unexpected error during review transition local persistence.",
          "UNKNOWN",
          err
        )
      );
    }
  });
}

export async function deleteLocalDraft(draftId: string): Promise<void> {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([STORES.DRAFTS], "readwrite");
      const store = transaction.objectStore(STORES.DRAFTS);
      const request = store.delete(draftId);

      request.onsuccess = () => resolve();
      request.onerror = () => {
        reject(
          new ForeSiteStorageError(
            `Failed to delete draft ${draftId}: ${request.error?.message}`,
            "TRANSACTION_FAILED",
            request.error
          )
        );
      };
    } catch (err: unknown) {
      reject(
        new ForeSiteStorageError("Unexpected error during draft deletion.", "UNKNOWN", err)
      );
    }
  });
}

// ============================================================================
// 3. Local Projects Cache Repository
// ============================================================================

export async function saveLocalProject(project: Project): Promise<void> {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([STORES.PROJECTS], "readwrite");
      const store = transaction.objectStore(STORES.PROJECTS);
      const request = store.put(project);

      request.onsuccess = () => resolve();
      request.onerror = () => {
        reject(
          new ForeSiteStorageError(
            `Failed to save project ${project.id}: ${request.error?.message}`,
            "TRANSACTION_FAILED",
            request.error
          )
        );
      };
    } catch (err: unknown) {
      reject(
        new ForeSiteStorageError("Unexpected error during project save.", "UNKNOWN", err)
      );
    }
  });
}

export async function getLocalProject(projectId: string): Promise<Project | null> {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([STORES.PROJECTS], "readonly");
      const store = transaction.objectStore(STORES.PROJECTS);
      const request = store.get(projectId);

      request.onsuccess = () => {
        resolve((request.result as Project) || null);
      };
      request.onerror = () => {
        reject(
          new ForeSiteStorageError(
            `Failed to retrieve project ${projectId}: ${request.error?.message}`,
            "TRANSACTION_FAILED",
            request.error
          )
        );
      };
    } catch (err: unknown) {
      reject(
        new ForeSiteStorageError("Unexpected error during project read.", "UNKNOWN", err)
      );
    }
  });
}

export async function getAllLocalProjects(): Promise<Project[]> {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([STORES.PROJECTS], "readonly");
      const store = transaction.objectStore(STORES.PROJECTS);
      const request = store.getAll();

      request.onsuccess = () => {
        const projects = (request.result as Project[]) || [];
        projects.sort((a, b) => b.updatedAt - a.updatedAt);
        resolve(projects);
      };
      request.onerror = () => {
        reject(
          new ForeSiteStorageError(
            `Failed to query all local projects: ${request.error?.message}`,
            "TRANSACTION_FAILED",
            request.error
          )
        );
      };
    } catch (err: unknown) {
      reject(
        new ForeSiteStorageError("Unexpected error during projects query.", "UNKNOWN", err)
      );
    }
  });
}

export async function deleteLocalProject(projectId: string): Promise<void> {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([STORES.PROJECTS], "readwrite");
      const store = transaction.objectStore(STORES.PROJECTS);
      const request = store.delete(projectId);

      request.onsuccess = () => resolve();
      request.onerror = () => {
        reject(
          new ForeSiteStorageError(
            `Failed to delete project ${projectId}: ${request.error?.message}`,
            "TRANSACTION_FAILED",
            request.error
          )
        );
      };
    } catch (err: unknown) {
      reject(
        new ForeSiteStorageError("Unexpected error during project deletion.", "UNKNOWN", err)
      );
    }
  });
}

/**
 * Safe Cascade Deletion: Deletes a project along with all its associated
 * local drafts and evidence photograph Blobs.
 */
export async function deleteProjectCascade(
  projectId: string
): Promise<{ photosDeleted: number; draftsDeleted: number }> {
  // 1. Delete all associated photos
  const photosDeleted = await deleteEvidencePhotosByProject(projectId);

  // 2. Delete all associated drafts
  const drafts = await getLocalDraftsByProject(projectId);
  const db = await getDatabase();
  await new Promise<void>((resolve, reject) => {
    try {
      const transaction = db.transaction([STORES.DRAFTS, STORES.PROJECTS], "readwrite");
      const draftStore = transaction.objectStore(STORES.DRAFTS);
      const projectStore = transaction.objectStore(STORES.PROJECTS);

      for (const d of drafts) {
        draftStore.delete(d.id);
      }
      projectStore.delete(projectId);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    } catch (err) {
      reject(err);
    }
  });

  return { photosDeleted, draftsDeleted: drafts.length };
}

// ============================================================================
// 4. Storage Quota Estimation & Persistence Status
// ============================================================================

export async function getStorageQuotaEstimate(): Promise<StorageEstimateInfo> {
  if (
    typeof navigator !== "undefined" &&
    navigator.storage &&
    navigator.storage.estimate
  ) {
    try {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage || 0;
      const quota = estimate.quota || 0;
      const percentage = quota > 0 ? (usage / quota) * 100 : 0;

      let isPersisted = false;
      if (navigator.storage.persisted) {
        isPersisted = await navigator.storage.persisted();
      }

      return {
        supported: true,
        usageBytes: usage,
        quotaBytes: quota,
        usagePercentage: Math.round(percentage * 100) / 100,
        persisted: isPersisted,
      };
    } catch (err) {
      console.warn("Storage estimate call failed:", err);
    }
  }

  return {
    supported: false,
    usageBytes: 0,
    quotaBytes: 0,
    usagePercentage: 0,
    persisted: false,
  };
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (
    typeof navigator !== "undefined" &&
    navigator.storage &&
    navigator.storage.persist
  ) {
    try {
      return await navigator.storage.persist();
    } catch (err) {
      console.warn("Request persistent storage call failed:", err);
    }
  }
  return false;
}

/**
 * Resets all local IndexedDB evidence data (destructive).
 * Purges photographic Blobs ('evidencePhotos'), local drafts ('localInspections'),
 * and local projects cache ('localProjects').
 *
 * Invariant: Preserves durable offline mutation queue and sequence generators.
 * Called by Settings screen "Reset Local Evidence Database".
 */
export async function clearAllLocalEvidence(): Promise<void> {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    try {
      const storeNames = [
        STORES.PHOTOS,
        STORES.DRAFTS,
        STORES.PROJECTS,
      ].filter((name) => db.objectStoreNames.contains(name));

      if (storeNames.length === 0) {
        resolve();
        return;
      }

      const transaction = db.transaction(storeNames, "readwrite");
      for (const name of storeNames) {
        transaction.objectStore(name).clear();
      }

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Dedicated administrative / test-only utility to purge mutation queues and sequence generators.
 * Strictly separated from ordinary local evidence reset to avoid unintended queue destruction.
 */
export async function clearAllMutationQueueData(): Promise<void> {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    try {
      const storeNames = [
        STORES.MUTATIONS,
        STORES.SEQUENCES,
      ].filter((name) => db.objectStoreNames.contains(name));

      if (storeNames.length === 0) {
        resolve();
        return;
      }

      const transaction = db.transaction(storeNames, "readwrite");
      for (const name of storeNames) {
        transaction.objectStore(name).clear();
      }

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    } catch (err) {
      reject(err);
    }
  });
}

// ============================================================================
// 5. Deletion Receipts Repository (Phase 5 Stage 4C)
// ============================================================================

/**
 * Persists or updates a durable deletion receipt in IndexedDB.
 */
export async function saveDeletionReceipt(receipt: DeletionReceipt): Promise<void> {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([STORES.RECEIPTS], "readwrite");
      const store = transaction.objectStore(STORES.RECEIPTS);
      const request = store.put(receipt);

      request.onsuccess = () => resolve();
      request.onerror = () => {
        reject(
          new ForeSiteStorageError(
            `Failed to save deletion receipt ${receipt.id}: ${request.error?.message}`,
            "TRANSACTION_FAILED",
            request.error
          )
        );
      };
    } catch (err: unknown) {
      reject(
        new ForeSiteStorageError("Unexpected error during deletion receipt save.", "UNKNOWN", err)
      );
    }
  });
}

/**
 * Retrieves a deletion receipt by receipt ID.
 */
export async function getDeletionReceipt(receiptId: string): Promise<DeletionReceipt | null> {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([STORES.RECEIPTS], "readonly");
      const store = transaction.objectStore(STORES.RECEIPTS);
      const request = store.get(receiptId);

      request.onsuccess = () => {
        resolve((request.result as DeletionReceipt) || null);
      };
      request.onerror = () => {
        reject(
          new ForeSiteStorageError(
            `Failed to retrieve deletion receipt ${receiptId}: ${request.error?.message}`,
            "TRANSACTION_FAILED",
            request.error
          )
        );
      };
    } catch (err: unknown) {
      reject(
        new ForeSiteStorageError("Unexpected error during deletion receipt read.", "UNKNOWN", err)
      );
    }
  });
}

/**
 * Retrieves a deletion receipt by target inspection ID.
 */
export async function getDeletionReceiptByInspection(
  inspectionId: string
): Promise<DeletionReceipt | null> {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([STORES.RECEIPTS], "readonly");
      const store = transaction.objectStore(STORES.RECEIPTS);
      const index = store.index("by_inspectionId");
      const request = index.getAll(inspectionId);

      request.onsuccess = () => {
        const results = (request.result as DeletionReceipt[]) || [];
        if (results.length === 0) {
          resolve(null);
          return;
        }
        // If multiple exist, return the newest by createdAt
        results.sort((a, b) => b.createdAt - a.createdAt);
        resolve(results[0] || null);
      };
      request.onerror = () => {
        reject(
          new ForeSiteStorageError(
            `Failed to query deletion receipt for inspection ${inspectionId}: ${request.error?.message}`,
            "TRANSACTION_FAILED",
            request.error
          )
        );
      };
    } catch (err: unknown) {
      reject(
        new ForeSiteStorageError(
          "Unexpected error during deletion receipt inspection query.",
          "UNKNOWN",
          err
        )
      );
    }
  });
}

/**
 * Retrieves all deletion receipts, optionally filtered by ownerUid.
 */
export async function getAllDeletionReceipts(ownerUid?: string): Promise<DeletionReceipt[]> {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([STORES.RECEIPTS], "readonly");
      const store = transaction.objectStore(STORES.RECEIPTS);

      let request: IDBRequest;
      if (ownerUid) {
        const index = store.index("by_ownerUid");
        request = index.getAll(ownerUid);
      } else {
        request = store.getAll();
      }

      request.onsuccess = () => {
        const receipts = (request.result as DeletionReceipt[]) || [];
        receipts.sort((a, b) => b.createdAt - a.createdAt);
        resolve(receipts);
      };
      request.onerror = () => {
        reject(
          new ForeSiteStorageError(
            `Failed to query deletion receipts: ${request.error?.message}`,
            "TRANSACTION_FAILED",
            request.error
          )
        );
      };
    } catch (err: unknown) {
      reject(
        new ForeSiteStorageError("Unexpected error during deletion receipts query.", "UNKNOWN", err)
      );
    }
  });
}

/**
 * Deletes a deletion receipt by receipt ID.
 */
export async function deleteDeletionReceipt(receiptId: string): Promise<void> {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([STORES.RECEIPTS], "readwrite");
      const store = transaction.objectStore(STORES.RECEIPTS);
      const request = store.delete(receiptId);

      request.onsuccess = () => resolve();
      request.onerror = () => {
        reject(
          new ForeSiteStorageError(
            `Failed to delete deletion receipt ${receiptId}: ${request.error?.message}`,
            "TRANSACTION_FAILED",
            request.error
          )
        );
      };
    } catch (err: unknown) {
      reject(
        new ForeSiteStorageError("Unexpected error during deletion receipt deletion.", "UNKNOWN", err)
      );
    }
  });
}

/**
 * Purges all deletion receipts from IndexedDB (test and administrative use).
 */
export async function clearAllDeletionReceipts(): Promise<void> {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    try {
      if (!db.objectStoreNames.contains(STORES.RECEIPTS)) {
        resolve();
        return;
      }
      const transaction = db.transaction([STORES.RECEIPTS], "readwrite");
      transaction.objectStore(STORES.RECEIPTS).clear();

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    } catch (err) {
      reject(err);
    }
  });
}
