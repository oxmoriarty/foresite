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
} from "../types";

export const DB_NAME = "ForeSiteEvidenceDB";
export const DB_VERSION = 1;

export const STORES = {
  PHOTOS: "evidencePhotos",
  DRAFTS: "localInspections",
  PROJECTS: "localProjects",
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
        resolve((request.result as LocalDraftInspection) || null);
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
        // Return drafts sorted by newest lastSavedAt
        const drafts = (request.result as LocalDraftInspection[]) || [];
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
        const drafts = (request.result as LocalDraftInspection[]) || [];
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
 */
export async function clearAllLocalEvidence(): Promise<void> {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(
        [STORES.PHOTOS, STORES.DRAFTS, STORES.PROJECTS],
        "readwrite"
      );
      transaction.objectStore(STORES.PHOTOS).clear();
      transaction.objectStore(STORES.DRAFTS).clear();
      transaction.objectStore(STORES.PROJECTS).clear();

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    } catch (err) {
      reject(err);
    }
  });
}
