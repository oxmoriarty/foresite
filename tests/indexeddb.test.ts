import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getDatabase,
  closeDatabase,
  saveEvidencePhoto,
  getEvidencePhoto,
  getEvidencePhotosByInspection,
  getEvidencePhotosByProject,
  deleteEvidencePhoto,
  deleteEvidencePhotosByInspection,
  getAllEvidencePhotosCount,
  saveLocalDraft,
  getLocalDraft,
  getAllLocalDrafts,
  deleteLocalDraft,
  saveLocalProject,
  getLocalProject,
  deleteProjectCascade,
  clearAllLocalEvidence,
  saveDeletionReceipt,
  getDeletionReceipt,
  getDeletionReceiptByInspection,
  getAllDeletionReceipts,
  deleteDeletionReceipt,
  clearAllDeletionReceipts,
  STORES,
  DB_VERSION,
} from "../src/services/indexeddb";
import { LocalEvidencePhoto, LocalDraftInspection, Project, DeletionReceipt } from "../src/types";

describe("ForeSite Versioned IndexedDB Storage Engine", () => {
  beforeEach(async () => {
    await clearAllLocalEvidence();
  });

  afterEach(() => {
    closeDatabase();
  });

  it("initializes database with correct version and required object stores", async () => {
    const db = await getDatabase();
    expect(db.name).toBe("ForeSiteEvidenceDB");
    expect(db.version).toBe(DB_VERSION);

    expect(db.objectStoreNames.contains(STORES.PHOTOS)).toBe(true);
    expect(db.objectStoreNames.contains(STORES.DRAFTS)).toBe(true);
    expect(db.objectStoreNames.contains(STORES.PROJECTS)).toBe(true);
    expect(db.objectStoreNames.contains(STORES.RECEIPTS)).toBe(true);
  });

  it("stores, retrieves, and purges deletion receipts with typed lifecycle stages", async () => {
    const receipt: DeletionReceipt = {
      id: "del-rcpt-test-01",
      inspectionId: "insp-test-01",
      ownerUid: "user-test-uid",
      mutationId: "mut-del-01",
      stage: "pending_remote_delete",
      photoIds: ["photo-1", "photo-2"],
      deletedPhotoIds: [],
      retainedPhotoIds: [],
      photosDeletedCount: 0,
      createdAt: 1000,
      retryCount: 0,
    };

    await saveDeletionReceipt(receipt);

    const retrieved = await getDeletionReceipt("del-rcpt-test-01");
    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe("del-rcpt-test-01");
    expect(retrieved?.stage).toBe("pending_remote_delete");
    expect(retrieved?.photoIds).toEqual(["photo-1", "photo-2"]);

    const byInspection = await getDeletionReceiptByInspection("insp-test-01");
    expect(byInspection).not.toBeNull();
    expect(byInspection?.id).toBe("del-rcpt-test-01");

    const byOwner = await getAllDeletionReceipts("user-test-uid");
    expect(byOwner.length).toBe(1);

    await deleteDeletionReceipt("del-rcpt-test-01");
    expect(await getDeletionReceipt("del-rcpt-test-01")).toBeNull();

    await saveDeletionReceipt(receipt);
    await clearAllDeletionReceipts();
    expect(await getDeletionReceipt("del-rcpt-test-01")).toBeNull();
  });

  it("stores and retrieves photographic evidence Blobs", async () => {
    const photoBlob = new Blob(["test-binary-image-data-12345"], { type: "image/jpeg" });
    const photoRecord: LocalEvidencePhoto = {
      id: "photo-unit-01",
      inspectionId: "insp-unit-01",
      projectId: "proj-unit-01",
      blob: photoBlob,
      fileName: "foundation_wall.jpg",
      fileSizeBytes: photoBlob.size,
      mimeType: "image/jpeg",
      caption: "Exposed rebar at footing junction",
      capturedAt: Date.now() - 1000,
      createdAt: Date.now(),
    };

    await saveEvidencePhoto(photoRecord);

    const retrieved = await getEvidencePhoto("photo-unit-01");
    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe("photo-unit-01");
    expect(retrieved?.fileName).toBe("foundation_wall.jpg");
    expect(retrieved?.mimeType).toBe("image/jpeg");
    expect(retrieved?.blob).toBeInstanceOf(Blob);
    expect(retrieved?.blob.size).toBe(photoBlob.size);
  });

  it("queries photographic evidence by inspection ID and project ID", async () => {
    const blob1 = new Blob(["photo-data-1"], { type: "image/png" });
    const blob2 = new Blob(["photo-data-2"], { type: "image/jpeg" });

    await saveEvidencePhoto({
      id: "photo-01",
      inspectionId: "insp-alpha",
      projectId: "proj-alpha",
      blob: blob1,
      fileName: "crack_detail.png",
      fileSizeBytes: blob1.size,
      mimeType: "image/png",
      capturedAt: Date.now(),
      createdAt: Date.now(),
    });

    await saveEvidencePhoto({
      id: "photo-02",
      inspectionId: "insp-alpha",
      projectId: "proj-alpha",
      blob: blob2,
      fileName: "wall_elevation.jpg",
      fileSizeBytes: blob2.size,
      mimeType: "image/jpeg",
      capturedAt: Date.now(),
      createdAt: Date.now(),
    });

    const inspectionPhotos = await getEvidencePhotosByInspection("insp-alpha");
    expect(inspectionPhotos.length).toBe(2);

    const projectPhotos = await getEvidencePhotosByProject("proj-alpha");
    expect(projectPhotos.length).toBe(2);

    const count = await getAllEvidencePhotosCount();
    expect(count).toBe(2);
  });

  it("deletes individual photographs and batch deletes by inspection", async () => {
    const blob = new Blob(["dummy-image"], { type: "image/jpeg" });
    await saveEvidencePhoto({
      id: "photo-del-1",
      inspectionId: "insp-batch-del",
      projectId: "proj-batch-del",
      blob,
      fileName: "del1.jpg",
      fileSizeBytes: blob.size,
      mimeType: "image/jpeg",
      capturedAt: Date.now(),
      createdAt: Date.now(),
    });
    await saveEvidencePhoto({
      id: "photo-del-2",
      inspectionId: "insp-batch-del",
      projectId: "proj-batch-del",
      blob,
      fileName: "del2.jpg",
      fileSizeBytes: blob.size,
      mimeType: "image/jpeg",
      capturedAt: Date.now(),
      createdAt: Date.now(),
    });

    // Delete photo 1
    await deleteEvidencePhoto("photo-del-1");
    const photo1 = await getEvidencePhoto("photo-del-1");
    expect(photo1).toBeNull();

    // Batch delete remaining photos for inspection
    const deletedCount = await deleteEvidencePhotosByInspection("insp-batch-del");
    expect(deletedCount).toBe(1);

    const remaining = await getEvidencePhotosByInspection("insp-batch-del");
    expect(remaining.length).toBe(0);
  });

  it("saves, retrieves, and deletes local inspection drafts", async () => {
    const draft: LocalDraftInspection = {
      id: "draft-insp-001",
      projectId: "proj-draft-01",
      title: "Preliminary Trench Inspection",
      observation: "Excavation walls show no immediate signs of soil sloughing.",
      category: "surface_condition",
      visibleEvidence: ["Trench depth 1.5m", "Hydraulic shores installed"],
      uncertainties: ["Soil moisture classification pending lab test"],
      inspectorFollowUp: ["Re-inspect after expected rain tomorrow"],
      photoIds: ["photo-01"],
      isSynced: false,
      lastSavedAt: Date.now(),
      createdAt: Date.now(),
    };

    await saveLocalDraft(draft);

    const retrieved = await getLocalDraft("draft-insp-001");
    expect(retrieved).not.toBeNull();
    expect(retrieved?.title).toBe("Preliminary Trench Inspection");
    expect(retrieved?.observation).toContain("Excavation walls");
    expect(retrieved?.visibleEvidence.length).toBe(2);
    expect(retrieved?.isSynced).toBe(false);

    const allDrafts = await getAllLocalDrafts();
    expect(allDrafts.length).toBe(1);

    await deleteLocalDraft("draft-insp-001");
    const afterDelete = await getLocalDraft("draft-insp-001");
    expect(afterDelete).toBeNull();
  });

  it("performs safe cascade deletion when a project is removed", async () => {
    const project: Project = {
      id: "proj-cascade-01",
      name: "Highway Overpass Repair",
      siteLabel: "HWY-OV-01",
      inspectionCount: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveLocalProject(project);

    const blob = new Blob(["overpass-photo"], { type: "image/jpeg" });
    await saveEvidencePhoto({
      id: "photo-cascade-01",
      inspectionId: "insp-cascade-01",
      projectId: "proj-cascade-01",
      blob,
      fileName: "girder.jpg",
      fileSizeBytes: blob.size,
      mimeType: "image/jpeg",
      capturedAt: Date.now(),
      createdAt: Date.now(),
    });

    await saveLocalDraft({
      id: "draft-cascade-01",
      projectId: "proj-cascade-01",
      title: "Overpass Draft",
      observation: "Girder deflection observation",
      category: "equipment",
      visibleEvidence: [],
      uncertainties: [],
      inspectorFollowUp: [],
      photoIds: ["photo-cascade-01"],
      isSynced: false,
      lastSavedAt: Date.now(),
      createdAt: Date.now(),
    });

    const result = await deleteProjectCascade("proj-cascade-01");
    expect(result.photosDeleted).toBe(1);
    expect(result.draftsDeleted).toBe(1);

    expect(await getLocalProject("proj-cascade-01")).toBeNull();
    expect(await getEvidencePhoto("photo-cascade-01")).toBeNull();
    expect(await getLocalDraft("draft-cascade-01")).toBeNull();
  });

  it("handles queries for non-existent records gracefully", async () => {
    const missingPhoto = await getEvidencePhoto("non-existent-id");
    expect(missingPhoto).toBeNull();

    const missingDraft = await getLocalDraft("non-existent-draft");
    expect(missingDraft).toBeNull();

    const emptyPhotos = await getEvidencePhotosByInspection("non-existent-insp");
    expect(emptyPhotos).toEqual([]);
  });
});
