/**
 * ForeSite Phase 5 Stage 4A: Three-Way Merge Engine & Review Reconciliation Tests
 *
 * Verifies:
 * 1. Pure scalar 3-way merge rules (L=B, R=B, L=R, Divergent Conflict, null/empty/boundary values).
 * 2. Checklist item 3-way merge (matching by stable id, subfield merges, additive additions, edit-delete conflicts, duplicate id validation).
 * 3. String array symmetric 3-way set-difference merge (additions, deletions, concurrent changes, duplicate suppression, photoIds reference preservation).
 * 4. Exhaustive 64-case review status reconciliation matrix verification.
 * 5. Complete three-way inspection merge with human review precedence and archival protection.
 */

import { describe, it, expect } from "vitest";
import {
  deepEqual,
  mergeScalarField,
  mergeStringArrays,
  mergeChecklistItems,
  reconcileReviewStatus,
  generate64CaseMatrix,
  REVIEW_RECONCILIATION_MATRIX_64,
  threeWayMerge,
  FIELD_CLASSIFICATIONS,
} from "../src/services/merge";
import { ChecklistItem, Inspection, ReviewStatus } from "../src/types";

describe("ForeSite Phase 5 Stage 4A: Three-Way Merge Engine", () => {
  describe("1. Deep Equality and Helper Invariants", () => {
    it("correctly evaluates primitives, arrays, and nested structures without mutation", () => {
      expect(deepEqual(1, 1)).toBe(true);
      expect(deepEqual("a", "a")).toBe(true);
      expect(deepEqual("a", "b")).toBe(false);
      expect(deepEqual(undefined, undefined)).toBe(true);
      expect(deepEqual(null, null)).toBe(true);
      expect(deepEqual(null, undefined)).toBe(false);
      expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
      expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
      expect(deepEqual({ a: 1, b: "x" }, { a: 1, b: "x" })).toBe(true);
      expect(deepEqual({ a: 1, b: "x" }, { b: "x", a: 1 })).toBe(true);
      expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    });

    it("verifies authoritative field classifications for all 29 Firestore fields", () => {
      expect(FIELD_CLASSIFICATIONS.id).toBe("IMMUTABLE_IDENTITY");
      expect(FIELD_CLASSIFICATIONS.ownerUid).toBe("IMMUTABLE_IDENTITY");
      expect(FIELD_CLASSIFICATIONS.projectId).toBe("IMMUTABLE_IDENTITY");
      expect(FIELD_CLASSIFICATIONS.title).toBe("THREE_WAY_MERGED");
      expect(FIELD_CLASSIFICATIONS.observation).toBe("THREE_WAY_MERGED");
      expect(FIELD_CLASSIFICATIONS.category).toBe("THREE_WAY_MERGED");
      expect(FIELD_CLASSIFICATIONS.summary).toBe("THREE_WAY_MERGED");
      expect(FIELD_CLASSIFICATIONS.weatherNotes).toBe("THREE_WAY_MERGED");
      expect(FIELD_CLASSIFICATIONS.items).toBe("THREE_WAY_MERGED");
      expect(FIELD_CLASSIFICATIONS.visibleEvidence).toBe("THREE_WAY_MERGED");
      expect(FIELD_CLASSIFICATIONS.uncertainties).toBe("THREE_WAY_MERGED");
      expect(FIELD_CLASSIFICATIONS.inspectorFollowUp).toBe("THREE_WAY_MERGED");
      expect(FIELD_CLASSIFICATIONS.photoIds).toBe("THREE_WAY_MERGED");
      expect(FIELD_CLASSIFICATIONS.reviewStatus).toBe("HUMAN_REVIEW_PROTECTED");
      expect(FIELD_CLASSIFICATIONS.reviewHistory).toBe("HUMAN_REVIEW_PROTECTED");
      expect(FIELD_CLASSIFICATIONS.revision).toBe("SYSTEM_MANAGED");
      expect(FIELD_CLASSIFICATIONS.appliedMutationIds).toBe("SYSTEM_MANAGED");
      expect(FIELD_CLASSIFICATIONS.isArchived).toBe("CONFLICT_MANUAL_RESOLUTION");
    });
  });

  describe("2. Pure Scalar Field Three-Way Merge", () => {
    it("Case L === B: takes Remote when local is unchanged and remote changed", () => {
      const res = mergeScalarField("title", "Base Title", "Base Title", "Remote Edited Title");
      expect(res.value).toBe("Remote Edited Title");
      expect(res.conflict).toBeUndefined();
    });

    it("Case R === B: takes Local when remote is unchanged and local changed", () => {
      const res = mergeScalarField("title", "Base Title", "Local Edited Title", "Base Title");
      expect(res.value).toBe("Local Edited Title");
      expect(res.conflict).toBeUndefined();
    });

    it("Case L === R: takes common value when both changed to the same value", () => {
      const res = mergeScalarField("title", "Base Title", "Convergent Title", "Convergent Title");
      expect(res.value).toBe("Convergent Title");
      expect(res.conflict).toBeUndefined();
    });

    it("Case Divergent (L !== B && R !== B && L !== R): flags genuine scalar conflict", () => {
      const res = mergeScalarField("title", "Base Title", "Local Title", "Remote Title");
      expect(res.conflict).toBeDefined();
      expect(res.conflict?.field).toBe("title");
      expect(res.conflict?.category).toBe("SCALAR_FIELD");
      expect(res.conflict?.baseValue).toBe("Base Title");
      expect(res.conflict?.localValue).toBe("Local Title");
      expect(res.conflict?.remoteValue).toBe("Remote Title");
    });

    it("handles null, undefined, and optional boundary values cleanly", () => {
      const res1 = mergeScalarField("summary", undefined, "Local Summary Added", undefined);
      expect(res1.value).toBe("Local Summary Added");
      expect(res1.conflict).toBeUndefined();

      const res2 = mergeScalarField("weatherNotes", undefined, undefined, "Remote Weather Added");
      expect(res2.value).toBe("Remote Weather Added");
      expect(res2.conflict).toBeUndefined();

      const res3 = mergeScalarField("weatherNotes", "Sunny", "", "Sunny");
      expect(res3.value).toBe("");
      expect(res3.conflict).toBeUndefined();

      const res4 = mergeScalarField("summary", "Base Summary", "", "Remote Summary");
      expect(res4.conflict).toBeDefined();
      expect(res4.conflict?.baseValue).toBe("Base Summary");
      expect(res4.conflict?.localValue).toBe("");
      expect(res4.conflict?.remoteValue).toBe("Remote Summary");
    });
  });

  describe("3. Checklist Items Three-Way Merge (Stable ID Matching)", () => {
    it("merges non-conflicting field modifications on the same checklist item", () => {
      const base: ChecklistItem[] = [{ id: "item-1", status: "pass", notes: "All clear", recommendation: "None" }];
      const local: ChecklistItem[] = [{ id: "item-1", status: "pass", notes: "Local updated note", recommendation: "None" }];
      const remote: ChecklistItem[] = [{ id: "item-1", status: "pass", notes: "All clear", recommendation: "Remote recommendation" }];

      const res = mergeChecklistItems(base, local, remote);
      expect(res.conflicts).toHaveLength(0);
      expect(res.mergedItems).toHaveLength(1);
      expect(res.mergedItems[0]).toEqual({
        id: "item-1",
        status: "pass",
        notes: "Local updated note",
        recommendation: "Remote recommendation",
      });
    });

    it("flags a conflict when both local and remote modify the same item field differently", () => {
      const base: ChecklistItem[] = [{ id: "item-1", status: "pass", notes: "Base" }];
      const local: ChecklistItem[] = [{ id: "item-1", status: "fail", notes: "Base" }];
      const remote: ChecklistItem[] = [{ id: "item-1", status: "na", notes: "Base" }];

      const res = mergeChecklistItems(base, local, remote);
      expect(res.conflicts).toHaveLength(1);
      expect(res.conflicts[0]!.field).toBe("items.status");
      expect(res.conflicts[0]!.itemId).toBe("item-1");
      expect(res.conflicts[0]!.category).toBe("CHECKLIST_FIELD");
      expect(res.conflicts[0]!.baseValue).toBe("pass");
      expect(res.conflicts[0]!.localValue).toBe("fail");
      expect(res.conflicts[0]!.remoteValue).toBe("na");
    });

    it("preserves additive additions from both local and remote without conflict", () => {
      const base: ChecklistItem[] = [{ id: "item-1", status: "pass" }];
      const local: ChecklistItem[] = [{ id: "item-1", status: "pass" }, { id: "item-local", status: "pass", notes: "Local" }];
      const remote: ChecklistItem[] = [{ id: "item-1", status: "pass" }, { id: "item-remote", status: "fail", notes: "Remote" }];

      const res = mergeChecklistItems(base, local, remote);
      expect(res.conflicts).toHaveLength(0);
      expect(res.mergedItems).toHaveLength(3);
      expect(res.mergedItems.map((i) => i.id)).toEqual(["item-1", "item-remote", "item-local"]);
    });

    it("handles cleanly deleted items when unmodified on the other side", () => {
      const base: ChecklistItem[] = [
        { id: "item-1", status: "pass" },
        { id: "item-2", status: "pass" },
      ];
      // Local deletes item-1 (unmodified by remote)
      const local: ChecklistItem[] = [{ id: "item-2", status: "pass" }];
      // Remote deletes item-2 (unmodified by local)
      const remote: ChecklistItem[] = [{ id: "item-1", status: "pass" }];

      const res = mergeChecklistItems(base, local, remote);
      expect(res.conflicts).toHaveLength(0);
      expect(res.mergedItems).toHaveLength(0); // Both cleanly deleted!
    });

    it("flags an EDIT-DELETE conflict when one side deletes while the other side modifies", () => {
      const base: ChecklistItem[] = [{ id: "item-1", status: "pass", notes: "Original" }];
      // Local deleted item-1
      const local: ChecklistItem[] = [];
      // Remote modified item-1
      const remote: ChecklistItem[] = [{ id: "item-1", status: "fail", notes: "Critical structural defect" }];

      const res = mergeChecklistItems(base, local, remote);
      expect(res.conflicts).toHaveLength(1);
      expect(res.conflicts[0]!.category).toBe("CHECKLIST_EDIT_DELETE");
      expect(res.conflicts[0]!.itemId).toBe("item-1");
      expect(res.conflicts[0]!.localValue).toBeUndefined();
      expect(res.conflicts[0]!.remoteValue).toEqual(remote[0]);
    });

    it("flags INCOMPATIBLE_DATA when duplicate or invalid IDs are present", () => {
      const malformed: ChecklistItem[] = [
        { id: "dup-1", status: "pass" },
        { id: "dup-1", status: "fail" },
      ];
      const res = mergeChecklistItems([], malformed, []);
      expect(res.conflicts).toHaveLength(1);
      expect(res.conflicts[0]!.category).toBe("INCOMPATIBLE_DATA");
    });
  });

  describe("4. String Array Symmetric Set-Difference Merge", () => {
    it("merges additions from both local and remote with no duplicates", () => {
      const base = ["A", "B"];
      const local = ["A", "B", "C"];
      const remote = ["A", "B", "D"];

      const res = mergeStringArrays("visibleEvidence", base, local, remote);
      expect(res.conflicts).toHaveLength(0);
      expect(res.mergedArray).toEqual(["A", "B", "D", "C"]);
    });

    it("correctly removes deleted items relative to base", () => {
      const base = ["A", "B", "C", "D"];
      const local = ["A", "B", "D"]; // Deleted C
      const remote = ["A", "C", "D"]; // Deleted B

      const res = mergeStringArrays("uncertainties", base, local, remote);
      expect(res.conflicts).toHaveLength(0);
      expect(res.mergedArray).toEqual(["A", "D"]);
    });

    it("handles identical additions from both sides without introducing duplicates", () => {
      const base = ["A"];
      const local = ["A", "NEW"];
      const remote = ["A", "NEW"];

      const res = mergeStringArrays("inspectorFollowUp", base, local, remote);
      expect(res.mergedArray).toEqual(["A", "NEW"]);
    });

    it("merges photoIds references cleanly without affecting IndexedDB storage Blobs", () => {
      const base = ["photo-1", "photo-2"];
      const local = ["photo-1", "photo-2", "photo-local-new"];
      const remote = ["photo-1", "photo-remote-new"]; // Remote removed photo-2 reference, added photo-remote-new

      const res = mergeStringArrays("photoIds", base, local, remote);
      expect(res.conflicts).toHaveLength(0);
      expect(res.mergedArray).toEqual(["photo-1", "photo-remote-new", "photo-local-new"]);
    });

    it("handles empty arrays and undefined inputs gracefully", () => {
      const res = mergeStringArrays("visibleEvidence", undefined, [], undefined);
      expect(res.mergedArray).toEqual([]);
      expect(res.conflicts).toHaveLength(0);
    });
  });

  describe("5. Complete 64-Case Review Reconciliation Matrix", () => {
    it("generates and verifies all 64 exhaustive (B, L, R) permutations", () => {
      const matrix = generate64CaseMatrix();
      expect(matrix).toHaveLength(64);
      expect(REVIEW_RECONCILIATION_MATRIX_64).toHaveLength(64);

      // Verify category partition counts
      const cat1 = matrix.filter((c) => c.category === "Cat 1 (No change)");
      const cat2 = matrix.filter((c) => c.category === "Cat 2 (Only Local)");
      const cat3 = matrix.filter((c) => c.category === "Cat 3 (Only Remote)");
      const cat4 = matrix.filter((c) => c.category === "Cat 4 (Convergent)");
      const cat5 = matrix.filter((c) => c.category === "Cat 5 (Divergent)");

      expect(cat1).toHaveLength(4);
      expect(cat2).toHaveLength(12);
      expect(cat3).toHaveLength(12);
      expect(cat4).toHaveLength(12);
      expect(cat5).toHaveLength(24);
      expect(cat1.length + cat2.length + cat3.length + cat4.length + cat5.length).toBe(64);

      // Verify resolution distribution
      const resolved = matrix.filter((c) => c.expectedResult.resolved);
      const conflicts = matrix.filter((c) => c.expectedResult.conflictType === "CONCURRENT_HUMAN_CONFLICT");
      const invalid = matrix.filter((c) => c.expectedResult.conflictType === "INVALID_TRANSITION");

      expect(resolved).toHaveLength(35);
      expect(conflicts).toHaveLength(2);
      expect(invalid).toHaveLength(27);
      expect(resolved.length + conflicts.length + invalid.length).toBe(64);
    });

    it("strictly flags CONCURRENT_HUMAN_CONFLICT on opposing human reviews (in_review -> approved vs in_review -> rejected)", () => {
      const res1 = reconcileReviewStatus("in_review", "approved", "rejected");
      expect(res1.resolved).toBe(false);
      expect(res1.outcomeStatus).toBeNull();
      expect(res1.conflictType).toBe("CONCURRENT_HUMAN_CONFLICT");
      expect(res1.requiresHumanResolution).toBe(true);

      const res2 = reconcileReviewStatus("in_review", "rejected", "approved");
      expect(res2.resolved).toBe(false);
      expect(res2.outcomeStatus).toBeNull();
      expect(res2.conflictType).toBe("CONCURRENT_HUMAN_CONFLICT");
      expect(res2.requiresHumanResolution).toBe(true);
    });

    it("validates all 5 valid lifecycle transitions commit when only one side changes", () => {
      const validTransitions: [ReviewStatus, ReviewStatus][] = [
        ["draft_generated", "in_review"],
        ["in_review", "approved"],
        ["in_review", "rejected"],
        ["approved", "in_review"],
        ["rejected", "in_review"],
      ];

      for (const [from, to] of validTransitions) {
        // Local changed
        const localRes = reconcileReviewStatus(from, to, from);
        expect(localRes.resolved).toBe(true);
        expect(localRes.outcomeStatus).toBe(to);

        // Remote changed
        const remoteRes = reconcileReviewStatus(from, from, to);
        expect(remoteRes.resolved).toBe(true);
        expect(remoteRes.outcomeStatus).toBe(to);

        // Convergent both changed
        const convRes = reconcileReviewStatus(from, to, to);
        expect(convRes.resolved).toBe(true);
        expect(convRes.outcomeStatus).toBe(to);
      }
    });

    it("rejects prohibited direct terminal transitions (draft_generated -> approved | rejected)", () => {
      const res1 = reconcileReviewStatus("draft_generated", "approved", "draft_generated");
      expect(res1.resolved).toBe(false);
      expect(res1.conflictType).toBe("INVALID_TRANSITION");

      const res2 = reconcileReviewStatus("draft_generated", "rejected", "draft_generated");
      expect(res2.resolved).toBe(false);
      expect(res2.conflictType).toBe("INVALID_TRANSITION");
    });

    it("rejects prohibited retrograde transitions (in_review/approved/rejected -> draft_generated)", () => {
      expect(reconcileReviewStatus("in_review", "draft_generated", "in_review").resolved).toBe(false);
      expect(reconcileReviewStatus("approved", "draft_generated", "approved").resolved).toBe(false);
      expect(reconcileReviewStatus("rejected", "draft_generated", "rejected").resolved).toBe(false);
    });

    it("rejects prohibited lateral terminal transitions (approved <-> rejected without in_review reopening)", () => {
      expect(reconcileReviewStatus("approved", "rejected", "approved").resolved).toBe(false);
      expect(reconcileReviewStatus("rejected", "approved", "rejected").resolved).toBe(false);
    });
  });

  describe("6. Full Three-Way Inspection Merge", () => {
    const baseInspection: Inspection = {
      id: "insp-full-1",
      ownerUid: "user-123",
      projectId: "proj-1",
      projectName: "Main Plaza Project",
      title: "Foundation Footing Review",
      observation: "Base observation details",
      category: "surface_condition",
      summary: "Base summary",
      weatherNotes: "Clear, 72F",
      items: [{ id: "item-1", status: "pass", notes: "Base note" }],
      visibleEvidence: ["Crack along south footing"],
      uncertainties: ["Soil moisture variance"],
      inspectorFollowUp: ["Core sample verification"],
      photoIds: ["photo-1", "photo-2"],
      reviewStatus: "draft_generated",
      reviewHistory: [],
      revision: 1,
      aiAssisted: true,
      inferenceSource: "ON_DEVICE",
      isArchived: false,
      createdAt: 1000,
      updatedAt: 1000,
      appliedMutationIds: ["mut-create"],
    };

    it("cleanly merges non-conflicting divergent edits between local and remote", () => {
      const local: Partial<Inspection> = {
        ...baseInspection,
        title: "Foundation Footing Review - Local Note",
        observation: "Base observation details", // unchanged
        visibleEvidence: ["Crack along south footing", "Local new evidence"],
        weatherNotes: "Overcast, 68F", // local updated weather
      };

      const remote: Partial<Inspection> = {
        ...baseInspection,
        title: "Foundation Footing Review", // unchanged
        observation: "Base observation details with remote structural notes", // remote updated observation
        summary: "Updated remote executive summary", // remote updated summary
        photoIds: ["photo-1", "photo-2", "photo-3-remote"], // remote added photo reference
        revision: 2,
      };

      const res = threeWayMerge(baseInspection, local, remote);
      expect(res.success).toBe(true);
      expect(res.hasConflicts).toBe(false);
      expect(res.conflicts).toHaveLength(0);

      const merged = res.mergedData!;
      expect(merged.title).toBe("Foundation Footing Review - Local Note");
      expect(merged.observation).toBe("Base observation details with remote structural notes");
      expect(merged.summary).toBe("Updated remote executive summary");
      expect(merged.weatherNotes).toBe("Overcast, 68F");
      expect(merged.visibleEvidence).toEqual(["Crack along south footing", "Local new evidence"]);
      expect(merged.photoIds).toEqual(["photo-1", "photo-2", "photo-3-remote"]);
    });

    it("flags field conflicts when both local and remote edit the same scalar text field differently", () => {
      const local: Partial<Inspection> = {
        ...baseInspection,
        title: "Local Title Edit",
      };

      const remote: Partial<Inspection> = {
        ...baseInspection,
        title: "Remote Title Edit",
        revision: 2,
      };

      const res = threeWayMerge(baseInspection, local, remote);
      expect(res.success).toBe(false);
      expect(res.hasConflicts).toBe(true);
      expect(res.conflictType).toBe("FIELD_CONFLICT");
      expect(res.conflicts).toHaveLength(1);
      expect(res.conflicts[0]!.field).toBe("title");
      expect(res.conflicts[0]!.baseValue).toBe("Foundation Footing Review");
      expect(res.conflicts[0]!.localValue).toBe("Local Title Edit");
      expect(res.conflicts[0]!.remoteValue).toBe("Remote Title Edit");
    });

    it("preserves human review decision when remote is approved and local attempts draft update", () => {
      const local: Partial<Inspection> = {
        ...baseInspection,
        title: "Local Title Tweak",
        reviewStatus: "draft_generated",
      };

      const remote: Partial<Inspection> = {
        ...baseInspection,
        reviewStatus: "approved",
        reviewedAt: 2000,
        reviewedByUid: "lead-inspector-456",
        revision: 2,
      };

      const res = threeWayMerge(baseInspection, local, remote);
      expect(res.success).toBe(false);
      expect(res.hasConflicts).toBe(true);
      expect(res.conflicts.some((c) => c.field === "reviewStatus")).toBe(true);
    });

    it("flags an ARCHIVE_STATE conflict if remote is archived", () => {
      const local: Partial<Inspection> = {
        ...baseInspection,
        observation: "Attempted edit on archived draft",
      };

      const remote: Partial<Inspection> = {
        ...baseInspection,
        isArchived: true,
        archivedAt: 3000,
        archivedByUid: "admin-uid",
        archiveReason: "Project superseded",
        revision: 2,
      };

      const res = threeWayMerge(baseInspection, local, remote);
      expect(res.success).toBe(false);
      expect(res.hasConflicts).toBe(true);
      expect(res.conflicts.some((c) => c.category === "ARCHIVE_STATE")).toBe(true);
    });
  });
});
