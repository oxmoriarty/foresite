import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * ForeSite Firestore Security Rules Verification & Logic Test Suite
 * Stage 4D Hardened Rules Specification & Logic Verification
 *
 * Validates:
 * 1. File existence, syntax declarations, and deny-by-default wildcard structure
 * 2. Owner-scoped isolation logic: /users/{uid}/...
 * 3. Review state machine: isValidReviewTransition & isReviewHistoryValid
 * 4. Archival attribution: isArchivalAttributionValid
 * 5. Field bounds & allowlists: hasOnlyAllowedInspectionKeys & isInspectionPayloadBounded
 * 6. Immutability of ownerUid, createdAt, nonces, and revision monotonicity
 * 7. Prevention of cross-user unauthorized access and illegal deletion
 */

describe("Firestore Security Rules Specification & Syntax", () => {
  const rulesPath = path.resolve(__dirname, "../firestore.rules");
  const rulesContent = fs.readFileSync(rulesPath, "utf-8");

  it("should have firestore.rules present in the project root", () => {
    expect(fs.existsSync(rulesPath)).toBe(true);
    expect(rulesContent.length).toBeGreaterThan(0);
  });

  it("should declare rules_version = '2'", () => {
    expect(rulesContent).toMatch(/rules_version\s*=\s*['"]2['"];/);
  });

  it("should contain a strict deny-by-default fallback rule", () => {
    expect(rulesContent).toMatch(/match\s*\/\{document=\*\*\s*\}\s*\{\s*allow\s+read,\s*write:\s*if\s+false;\s*\}/);
  });

  it("should declare helper function owns(uid) checking request.auth != null and uid match", () => {
    expect(rulesContent).toMatch(/function\s+owns\s*\(\s*uid\s*\)/);
    expect(rulesContent).toContain("request.auth != null");
    expect(rulesContent).toContain("request.auth.uid == uid");
  });

  it("should declare review state machine validator isValidReviewTransition", () => {
    expect(rulesContent).toMatch(/function\s+isValidReviewTransition\s*\(\s*oldStatus,\s*newStatus\s*\)/);
    expect(rulesContent).toContain("draft_generated");
    expect(rulesContent).toContain("in_review");
    expect(rulesContent).toContain("approved");
    expect(rulesContent).toContain("rejected");
  });

  it("should declare single review event validator isNewReviewEventValid", () => {
    expect(rulesContent).toMatch(/function\s+isNewReviewEventValid\s*\(\s*newEvent,\s*oldStatus,\s*newStatus,\s*rev\s*\)/);
    expect(rulesContent).toContain("newEvent.fromStatus == oldStatus");
    expect(rulesContent).toContain("newEvent.toStatus == newStatus");
    expect(rulesContent).toContain("newEvent.byUid == request.auth.uid");
    expect(rulesContent).toContain("newEvent.revision == rev");
    expect(rulesContent).toContain("newEvent.timestamp is int");
  });

  it("should declare review history validator isReviewHistoryValid", () => {
    expect(rulesContent).toMatch(/function\s+isReviewHistoryValid\s*\(\s*oldData,\s*newData\s*\)/);
    expect(rulesContent).toContain("newHistory.hasAll(oldHistory)");
    expect(rulesContent).toContain("newHistory.size() == oldHistory.size() + 1");
  });

  it("should declare archival attribution validator isArchivalAttributionValid", () => {
    expect(rulesContent).toMatch(/function\s+isArchivalAttributionValid\s*\(\s*oldData,\s*newData\s*\)/);
    expect(rulesContent).toContain("newData.archivedByUid == request.auth.uid");
    expect(rulesContent).toContain("newData.archivedAt is int");
  });

  it("should declare field allowlist hasOnlyAllowedInspectionKeys", () => {
    expect(rulesContent).toMatch(/function\s+hasOnlyAllowedInspectionKeys\s*\(\s*data\s*\)/);
    expect(rulesContent).toContain("'creationMutationId'");
    expect(rulesContent).toContain("'clientCreationNonce'");
    expect(rulesContent).toContain("'appliedMutationIds'");
    expect(rulesContent).toContain("'reviewStatus'");
    expect(rulesContent).toContain("'reviewHistory'");
  });

  it("should declare payload bounds validator isInspectionPayloadBounded", () => {
    expect(rulesContent).toMatch(/function\s+isInspectionPayloadBounded\s*\(\s*data\s*\)/);
    expect(rulesContent).toContain("data.id is string && data.id.size() <= 100");
    expect(rulesContent).toContain("data.observation is string && data.observation.size() <= 10000");
    expect(rulesContent).toContain("data.createdAt is int && data.createdAt > 0");
    expect(rulesContent).toContain("data.updatedAt is int && data.updatedAt >= data.createdAt");
  });

  it("should scope projects under /users/{uid}/projects/{id} with owner checks", () => {
    expect(rulesContent).toContain("match /users/{uid}/projects/{id}");
    expect(rulesContent).toContain("request.resource.data.ownerUid == request.auth.uid");
    expect(rulesContent).toContain("request.resource.data.ownerUid == resource.data.ownerUid");
  });

  it("should scope inspections under /users/{uid}/inspections/{id} with Stage 4D checks", () => {
    expect(rulesContent).toContain("match /users/{uid}/inspections/{id}");
    expect(rulesContent).toContain("request.resource.data.ownerUid == request.auth.uid");
    expect(rulesContent).toContain("request.resource.data.ownerUid == resource.data.ownerUid");
    expect(rulesContent).toContain("request.resource.data.reviewStatus == 'draft_generated'");
    expect(rulesContent).toContain("request.resource.data.reviewHistory.size() == 0");
    expect(rulesContent).toContain("request.resource.data.appliedMutationIds.size() == 0");
    expect(rulesContent).toContain("request.resource.data.isArchived == false");
    expect(rulesContent).toContain("request.resource.data.revision in [0, 1]");
    expect(rulesContent).toContain("request.resource.data.revision == resource.data.revision + 1");
    expect(rulesContent).toContain("isReviewHistoryValid(resource.data, request.resource.data)");
    expect(rulesContent).toContain("isArchivalAttributionValid(resource.data, request.resource.data)");
  });
});

/**
 * Stage 4D Logic-level rule simulator testing rule constraints against security scenarios
 */
describe("Firestore Security Rules Stage 4D Logic Evaluation Engine", () => {
  interface AuthContext {
    uid: string | null;
  }

  interface ResourceData {
    id: string;
    ownerUid: string;
    projectId?: string;
    projectName?: string;
    title?: string;
    observation?: string;
    category?: string;
    reviewStatus?: string;
    reviewHistory?: Array<{
      fromStatus: string;
      toStatus: string;
      byUid: string;
      revision: number;
      timestamp: number;
      [key: string]: unknown;
    }>;
    revision?: number;
    creationMutationId?: string;
    clientCreationNonce?: string;
    appliedMutationIds?: string[];
    photoIds?: string[];
    isArchived?: boolean;
    archivedAt?: number | null;
    archivedByUid?: string | null;
    archiveReason?: string | null;
    createdAt?: number;
    updatedAt?: number;
    reviewedAt?: number;
    reviewedByUid?: string;
    [key: string]: unknown;
  }

  const allowedKeys = new Set([
    "id", "ownerUid", "projectId", "projectName", "title",
    "observation", "category", "items", "visibleEvidence",
    "uncertainties", "inspectorFollowUp", "summary", "weatherNotes",
    "photoIds", "photoMeta", "reviewStatus", "reviewHistory",
    "revision", "creationMutationId", "clientCreationNonce",
    "appliedMutationIds", "isArchived", "archivedAt", "archivedByUid",
    "archiveReason", "createdAt", "updatedAt", "reviewedAt",
    "reviewedByUid", "aiAssisted", "inferenceSource",
  ]);

  const allowedCategories = new Set([
    "surface_condition", "installation", "housekeeping", "equipment", "other",
    "structural", "electrical", "plumbing", "hvac", "fire_safety",
    "general", "environmental", "finishes",
  ]);

  function isValidReviewTransition(oldStatus: string, newStatus: string): boolean {
    return (
      (oldStatus === "draft_generated" && newStatus === "in_review") ||
      (oldStatus === "in_review" && newStatus === "approved") ||
      (oldStatus === "in_review" && newStatus === "rejected") ||
      (oldStatus === "approved" && newStatus === "in_review") ||
      (oldStatus === "rejected" && newStatus === "in_review")
    );
  }

  interface ReviewEventItem {
    fromStatus: string;
    toStatus: string;
    byUid: string;
    revision: number;
    timestamp: number;
    [key: string]: unknown;
  }

  function isNewReviewEventValid(newEvent: ReviewEventItem, oldStatus: string, newStatus: string, rev: number, authUid: string): boolean {
    return (
      newEvent.fromStatus === oldStatus &&
      newEvent.toStatus === newStatus &&
      newEvent.byUid === authUid &&
      newEvent.revision === rev &&
      typeof newEvent.timestamp === "number" &&
      newEvent.timestamp > 0
    );
  }

  function isReviewHistoryValid(oldData: ResourceData, newData: ResourceData, authUid: string): boolean {
    const oldStatus = oldData.reviewStatus!;
    const newStatus = newData.reviewStatus!;
    const oldHistory = oldData.reviewHistory || [];
    const newHistory = newData.reviewHistory || [];

    if (oldStatus === newStatus) {
      return JSON.stringify(newHistory) === JSON.stringify(oldHistory);
    }

    if (
      isValidReviewTransition(oldStatus, newStatus) &&
      newHistory.length === oldHistory.length + 1 &&
      newHistory.length > 0 &&
      newHistory.length <= 100 &&
      oldHistory.every((item, i) => JSON.stringify(item) === JSON.stringify(newHistory[i])) &&
      isNewReviewEventValid(newHistory[oldHistory.length]!, oldStatus, newStatus, newData.revision!, authUid) &&
      newData.reviewedAt === newHistory[oldHistory.length]!.timestamp &&
      newData.reviewedByUid === newHistory[oldHistory.length]!.byUid &&
      newData.reviewedByUid === authUid
    ) {
      return true;
    }

    return false;
  }

  function isArchivalAttributionValid(oldData: ResourceData, newData: ResourceData, authUid: string): boolean {
    // 1) Active to Active
    if (
      !oldData.isArchived &&
      !newData.isArchived &&
      (newData.archivedAt === undefined || newData.archivedAt === null) &&
      (newData.archivedByUid === undefined || newData.archivedByUid === null) &&
      (newData.archiveReason === undefined || newData.archiveReason === null)
    ) {
      return true;
    }

    // 2) Active to Archived
    if (
      !oldData.isArchived &&
      newData.isArchived &&
      newData.archivedByUid === authUid &&
      typeof newData.archivedAt === "number" &&
      newData.archivedAt > 0 &&
      (newData.archiveReason === undefined ||
        (typeof newData.archiveReason === "string" && newData.archiveReason.length <= 500))
    ) {
      return true;
    }

    // 3) Archived to Archived
    if (
      oldData.isArchived &&
      newData.isArchived &&
      newData.archivedByUid === oldData.archivedByUid &&
      newData.archivedAt === oldData.archivedAt &&
      (newData.archiveReason === undefined ||
        (typeof newData.archiveReason === "string" && newData.archiveReason.length <= 500))
    ) {
      return true;
    }

    // 4) Archived to Active
    if (
      oldData.isArchived &&
      !newData.isArchived &&
      (newData.archivedAt === undefined || newData.archivedAt === null) &&
      (newData.archivedByUid === undefined || newData.archivedByUid === null) &&
      (newData.archiveReason === undefined || newData.archiveReason === null)
    ) {
      return true;
    }

    return false;
  }

  function hasOnlyAllowedInspectionKeys(data: ResourceData): boolean {
    return Object.keys(data).every((k) => allowedKeys.has(k));
  }

  function isInspectionPayloadBounded(data: ResourceData): boolean {
    return (
      typeof data.id === "string" && data.id.length <= 100 &&
      typeof data.ownerUid === "string" && data.ownerUid.length <= 128 &&
      typeof data.projectId === "string" && data.projectId.length <= 100 &&
      typeof data.projectName === "string" && data.projectName.length <= 200 &&
      typeof data.title === "string" && data.title.length <= 200 &&
      typeof data.observation === "string" && data.observation.length <= 10000 &&
      allowedCategories.has(data.category!) &&
      (data.summary === undefined || (typeof data.summary === "string" && data.summary.length <= 10000)) &&
      (data.weatherNotes === undefined || (typeof data.weatherNotes === "string" && data.weatherNotes.length <= 1000)) &&
      ["draft_generated", "in_review", "approved", "rejected"].includes(data.reviewStatus!) &&
      Array.isArray(data.reviewHistory) && data.reviewHistory.length <= 100 &&
      Array.isArray(data.appliedMutationIds) && data.appliedMutationIds.length <= 10 &&
      Array.isArray(data.photoIds) && data.photoIds.length <= 50 &&
      typeof data.isArchived === "boolean" &&
      typeof data.revision === "number" &&
      (data.creationMutationId === undefined || (typeof data.creationMutationId === "string" && data.creationMutationId.length <= 100)) &&
      (data.clientCreationNonce === undefined || (typeof data.clientCreationNonce === "string" && data.clientCreationNonce.length <= 100)) &&
      (data.creationMutationId !== undefined || data.clientCreationNonce !== undefined) &&
      typeof data.createdAt === "number" && data.createdAt > 0 &&
      typeof data.updatedAt === "number" && data.updatedAt >= data.createdAt
    );
  }

  function evaluateRule({
    path,
    operation,
    auth,
    resource,
    requestResource,
  }: {
    path: string;
    operation: "read" | "create" | "update" | "delete";
    auth: AuthContext;
    resource?: ResourceData;
    requestResource?: ResourceData;
  }): { allowed: boolean; reason?: string } {
    const owns = (uid: string) => auth.uid !== null && auth.uid === uid;

    // Match /users/{uid}
    const profileMatch = path.match(/^\/users\/([^/]+)$/);
    if (profileMatch && profileMatch[1]) {
      const uid = profileMatch[1];
      if (owns(uid)) return { allowed: true };
      return { allowed: false, reason: "Unauthorized profile access" };
    }

    // Match /users/{uid}/projects/{id}
    const projectMatch = path.match(/^\/users\/([^/]+)\/projects\/([^/]+)$/);
    if (projectMatch && projectMatch[1]) {
      const uid = projectMatch[1];
      if (!owns(uid)) return { allowed: false, reason: "Path not owned by authenticated user" };

      if (operation === "read") return { allowed: true };
      if (operation === "create") {
        if (requestResource?.ownerUid === auth.uid) return { allowed: true };
        return { allowed: false, reason: "request.resource.data.ownerUid must match auth.uid" };
      }
      if (operation === "update") {
        if (resource?.ownerUid === auth.uid && requestResource?.ownerUid === resource?.ownerUid) {
          return { allowed: true };
        }
        return { allowed: false, reason: "Cannot mutate ownerUid" };
      }
      if (operation === "delete") {
        if (resource?.ownerUid === auth.uid) return { allowed: true };
        return { allowed: false, reason: "Only owner can delete" };
      }
    }

    // Match /users/{uid}/inspections/{id}
    const inspectionMatch = path.match(/^\/users\/([^/]+)\/inspections\/([^/]+)$/);
    if (inspectionMatch && inspectionMatch[1] && inspectionMatch[2]) {
      const uid = inspectionMatch[1];
      const docId = inspectionMatch[2];
      if (!owns(uid)) return { allowed: false, reason: "Path not owned by authenticated user" };

      if (operation === "read") return { allowed: true };

      if (operation === "create") {
        if (!requestResource) return { allowed: false };
        if (requestResource.ownerUid !== auth.uid) return { allowed: false, reason: "ownerUid must match auth.uid" };
        if (requestResource.id !== docId) return { allowed: false, reason: "doc id mismatch" };
        if (!hasOnlyAllowedInspectionKeys(requestResource)) return { allowed: false, reason: "Extraneous keys" };
        if (!isInspectionPayloadBounded(requestResource)) return { allowed: false, reason: "Payload un-bounded" };
        if (requestResource.reviewStatus !== "draft_generated") return { allowed: false, reason: "Initial status must be draft_generated" };
        if (!requestResource.reviewHistory || requestResource.reviewHistory.length !== 0) return { allowed: false, reason: "Initial reviewHistory must be empty" };
        if (!requestResource.appliedMutationIds || requestResource.appliedMutationIds.length !== 0) return { allowed: false, reason: "Initial appliedMutationIds must be empty" };
        if (requestResource.isArchived !== false) return { allowed: false, reason: "Initial isArchived must be false" };
        if (![0, 1].includes(requestResource.revision!)) return { allowed: false, reason: "Initial revision must be 0 or 1" };
        return { allowed: true };
      }

      if (operation === "update") {
        if (!resource || !requestResource) return { allowed: false };
        if (resource.ownerUid !== auth.uid) return { allowed: false, reason: "Only owner can update" };
        if (requestResource.ownerUid !== resource.ownerUid) return { allowed: false, reason: "Immutable ownerUid" };
        if (requestResource.id !== resource.id) return { allowed: false, reason: "Immutable id" };
        if (resource.clientCreationNonce !== undefined && requestResource.clientCreationNonce !== resource.clientCreationNonce) {
          return { allowed: false, reason: "Immutable clientCreationNonce" };
        }
        if (resource.creationMutationId !== undefined && requestResource.creationMutationId !== resource.creationMutationId) {
          return { allowed: false, reason: "Immutable creationMutationId" };
        }
        if (requestResource.createdAt !== resource.createdAt) return { allowed: false, reason: "Immutable createdAt" };
        if (!hasOnlyAllowedInspectionKeys(requestResource)) return { allowed: false, reason: "Extraneous keys" };
        if (!isInspectionPayloadBounded(requestResource)) return { allowed: false, reason: "Payload un-bounded" };
        if (typeof resource.revision !== "number") return { allowed: false, reason: "resource revision must be int" };
        if (requestResource.revision !== resource.revision + 1) return { allowed: false, reason: "revision must strictly increment by 1" };
        if (!isReviewHistoryValid(resource, requestResource, auth.uid!)) return { allowed: false, reason: "Invalid review history transition" };
        if (!isArchivalAttributionValid(resource, requestResource, auth.uid!)) return { allowed: false, reason: "Invalid archival attribution" };
        return { allowed: true };
      }

      if (operation === "delete") {
        if (!resource) return { allowed: false };
        if (resource.ownerUid !== auth.uid) return { allowed: false, reason: "Only owner can delete" };
        if (resource.reviewStatus !== "draft_generated") return { allowed: false, reason: "Only draft_generated can be deleted" };
        if (!resource.reviewHistory || resource.reviewHistory.length !== 0) return { allowed: false, reason: "Non-empty reviewHistory cannot be deleted" };
        if (resource.isArchived !== false) return { allowed: false, reason: "Archived inspections cannot be deleted" };
        return { allowed: true };
      }
    }

    return { allowed: false, reason: "Default deny" };
  }

  const inspectorA: AuthContext = { uid: "inspector-alice-123" };
  const inspectorB: AuthContext = { uid: "inspector-bob-456" };

  const validDraftInspection: ResourceData = {
    id: "insp-001",
    ownerUid: "inspector-alice-123",
    projectId: "proj-001",
    projectName: "Metro Tunnel",
    title: "Cracked foundation",
    observation: "Noticeable hairline fracture along foundation wall.",
    category: "structural",
    reviewStatus: "draft_generated",
    reviewHistory: [],
    appliedMutationIds: [],
    photoIds: [],
    isArchived: false,
    revision: 1,
    clientCreationNonce: "nonce-123",
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  };

  it("should allow creating a compliant inspection draft", () => {
    const result = evaluateRule({
      path: "/users/inspector-alice-123/inspections/insp-001",
      operation: "create",
      auth: inspectorA,
      requestResource: validDraftInspection,
    });
    expect(result.allowed).toBe(true);
  });

  it("should DENY creating an inspection starting directly with approved status", () => {
    const result = evaluateRule({
      path: "/users/inspector-alice-123/inspections/insp-001",
      operation: "create",
      auth: inspectorA,
      requestResource: { ...validDraftInspection, reviewStatus: "approved" },
    });
    expect(result.allowed).toBe(false);
  });

  it("should DENY creating an inspection with extraneous/unauthorized fields", () => {
    const result = evaluateRule({
      path: "/users/inspector-alice-123/inspections/insp-001",
      operation: "create",
      auth: inspectorA,
      requestResource: { ...validDraftInspection, maliciousField: true },
    });
    expect(result.allowed).toBe(false);
  });

  it("should DENY creating an inspection with invalid category", () => {
    const result = evaluateRule({
      path: "/users/inspector-alice-123/inspections/insp-001",
      operation: "create",
      auth: inspectorA,
      requestResource: { ...validDraftInspection, category: "unrecognized_cat" },
    });
    expect(result.allowed).toBe(false);
  });

  it("should allow transitioning reviewStatus from draft_generated to in_review with audit event", () => {
    const ts = 1700000010000;
    const oldDoc: ResourceData = { ...validDraftInspection };
    const newDoc: ResourceData = {
      ...validDraftInspection,
      reviewStatus: "in_review",
      revision: 2,
      updatedAt: ts,
      reviewedAt: ts,
      reviewedByUid: "inspector-alice-123",
      reviewHistory: [
        {
          fromStatus: "draft_generated",
          toStatus: "in_review",
          byUid: "inspector-alice-123",
          revision: 2,
          timestamp: ts,
        },
      ],
    };

    const result = evaluateRule({
      path: "/users/inspector-alice-123/inspections/insp-001",
      operation: "update",
      auth: inspectorA,
      resource: oldDoc,
      requestResource: newDoc,
    });
    expect(result.allowed).toBe(true);
  });

  it("should DENY jumping reviewStatus from draft_generated directly to approved", () => {
    const ts = 1700000010000;
    const oldDoc: ResourceData = { ...validDraftInspection };
    const newDoc: ResourceData = {
      ...validDraftInspection,
      reviewStatus: "approved",
      revision: 2,
      updatedAt: ts,
      reviewedAt: ts,
      reviewedByUid: "inspector-alice-123",
      reviewHistory: [
        {
          fromStatus: "draft_generated",
          toStatus: "approved",
          byUid: "inspector-alice-123",
          revision: 2,
          timestamp: ts,
        },
      ],
    };

    const result = evaluateRule({
      path: "/users/inspector-alice-123/inspections/insp-001",
      operation: "update",
      auth: inspectorA,
      resource: oldDoc,
      requestResource: newDoc,
    });
    expect(result.allowed).toBe(false);
  });

  it("should allow archival transition with valid attribution", () => {
    const ts = 1700000020000;
    const oldDoc: ResourceData = { ...validDraftInspection };
    const newDoc: ResourceData = {
      ...validDraftInspection,
      revision: 2,
      updatedAt: ts,
      isArchived: true,
      archivedAt: ts,
      archivedByUid: "inspector-alice-123",
      archiveReason: "Duplicate inspection record",
    };

    const result = evaluateRule({
      path: "/users/inspector-alice-123/inspections/insp-001",
      operation: "update",
      auth: inspectorA,
      resource: oldDoc,
      requestResource: newDoc,
    });
    expect(result.allowed).toBe(true);
  });

  it("should DENY spoofing another user as archivedByUid", () => {
    const ts = 1700000020000;
    const oldDoc: ResourceData = { ...validDraftInspection };
    const newDoc: ResourceData = {
      ...validDraftInspection,
      revision: 2,
      updatedAt: ts,
      isArchived: true,
      archivedAt: ts,
      archivedByUid: "inspector-bob-456", // Spoofed!
      archiveReason: "Duplicate",
    };

    const result = evaluateRule({
      path: "/users/inspector-alice-123/inspections/insp-001",
      operation: "update",
      auth: inspectorA,
      resource: oldDoc,
      requestResource: newDoc,
    });
    expect(result.allowed).toBe(false);
  });

  it("should DENY update without incrementing revision strictly by 1", () => {
    const ts = 1700000010000;
    const oldDoc: ResourceData = { ...validDraftInspection, revision: 1 };
    const newDoc: ResourceData = {
      ...validDraftInspection,
      revision: 1, // Same revision!
      updatedAt: ts,
    };

    const result = evaluateRule({
      path: "/users/inspector-alice-123/inspections/insp-001",
      operation: "update",
      auth: inspectorA,
      resource: oldDoc,
      requestResource: newDoc,
    });
    expect(result.allowed).toBe(false);
  });

  it("should allow deleting a fresh draft_generated inspection", () => {
    const result = evaluateRule({
      path: "/users/inspector-alice-123/inspections/insp-001",
      operation: "delete",
      auth: inspectorA,
      resource: validDraftInspection,
    });
    expect(result.allowed).toBe(true);
  });

  it("should DENY deleting an inspection that has reviewHistory", () => {
    const docWithHistory: ResourceData = {
      ...validDraftInspection,
      reviewHistory: [
        {
          fromStatus: "draft_generated",
          toStatus: "in_review",
          byUid: "inspector-alice-123",
          revision: 2,
          timestamp: 1700000010000,
        },
      ],
    };

    const result = evaluateRule({
      path: "/users/inspector-alice-123/inspections/insp-001",
      operation: "delete",
      auth: inspectorA,
      resource: docWithHistory,
    });
    expect(result.allowed).toBe(false);
  });

  it("should DENY deleting an archived inspection", () => {
    const archivedDoc: ResourceData = {
      ...validDraftInspection,
      isArchived: true,
      archivedAt: 1700000020000,
      archivedByUid: "inspector-alice-123",
    };

    const result = evaluateRule({
      path: "/users/inspector-alice-123/inspections/insp-001",
      operation: "delete",
      auth: inspectorA,
      resource: archivedDoc,
    });
    expect(result.allowed).toBe(false);
  });

  it("should DENY deleting an inspection owned by another user", () => {
    const result = evaluateRule({
      path: "/users/inspector-alice-123/inspections/insp-001",
      operation: "delete",
      auth: inspectorB,
      resource: validDraftInspection,
    });
    expect(result.allowed).toBe(false);
  });
});
