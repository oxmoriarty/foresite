import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * ForeSite Firestore Security Rules Verification & Logic Test Suite
 *
 * Validates:
 * 1. File existence, syntax declarations, and deny-by-default wildcard structure
 * 2. Owner-scoped isolation logic: /users/{uid}/...
 * 3. Prevention of cross-user unauthorized access
 * 4. Immutability of ownerUid on create and update operations
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

  it("should scope projects under /users/{uid}/projects/{id} with owner checks", () => {
    expect(rulesContent).toContain("match /users/{uid}/projects/{id}");
    expect(rulesContent).toContain("request.resource.data.ownerUid == request.auth.uid");
    expect(rulesContent).toContain("request.resource.data.ownerUid == resource.data.ownerUid");
  });

  it("should scope inspections under /users/{uid}/inspections/{id} with owner checks", () => {
    expect(rulesContent).toContain("match /users/{uid}/inspections/{id}");
    expect(rulesContent).toContain("request.resource.data.ownerUid == request.auth.uid");
    expect(rulesContent).toContain("request.resource.data.ownerUid == resource.data.ownerUid");
  });
});

/**
 * Logic-level rule simulator testing rule constraints against security scenarios
 */
describe("Firestore Security Rules Logic Evaluation Engine", () => {
  interface AuthContext {
    uid: string | null;
  }

  interface ResourceData {
    ownerUid: string;
    [key: string]: unknown;
  }

  // Simulated logic equivalent to rules_version 2 in firestore.rules
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

    // Match /users/{uid} (user profile)
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

      if (operation === "read") {
        return { allowed: true };
      }
      if (operation === "create") {
        if (requestResource?.ownerUid === auth.uid) return { allowed: true };
        return { allowed: false, reason: "request.resource.data.ownerUid must match auth.uid" };
      }
      if (operation === "update") {
        if (
          resource?.ownerUid === auth.uid &&
          requestResource?.ownerUid === resource?.ownerUid
        ) {
          return { allowed: true };
        }
        return { allowed: false, reason: "Cannot mutate ownerUid or update other owner's document" };
      }
      if (operation === "delete") {
        if (resource?.ownerUid === auth.uid) return { allowed: true };
        return { allowed: false, reason: "Only owner can delete" };
      }
    }

    // Match /users/{uid}/inspections/{id}
    const inspectionMatch = path.match(/^\/users\/([^/]+)\/inspections\/([^/]+)$/);
    if (inspectionMatch && inspectionMatch[1]) {
      const uid = inspectionMatch[1];
      if (!owns(uid)) return { allowed: false, reason: "Path not owned by authenticated user" };

      if (operation === "read") {
        return { allowed: true };
      }
      if (operation === "create") {
        if (requestResource?.ownerUid === auth.uid) return { allowed: true };
        return { allowed: false, reason: "request.resource.data.ownerUid must match auth.uid" };
      }
      if (operation === "update") {
        if (
          resource?.ownerUid === auth.uid &&
          requestResource?.ownerUid === resource?.ownerUid
        ) {
          return { allowed: true };
        }
        return { allowed: false, reason: "Cannot mutate ownerUid or update other owner's document" };
      }
      if (operation === "delete") {
        if (resource?.ownerUid === auth.uid) return { allowed: true };
        return { allowed: false, reason: "Only owner can delete" };
      }
    }

    // Default: Deny-by-default fallback
    return { allowed: false, reason: "Default deny-by-default" };
  }

  const inspectorA: AuthContext = { uid: "inspector-alice-123" };
  const inspectorB: AuthContext = { uid: "inspector-bob-456" };
  const unauthenticated: AuthContext = { uid: null };

  it("should allow an authenticated user to read their own projects", () => {
    const result = evaluateRule({
      path: "/users/inspector-alice-123/projects/proj-1",
      operation: "read",
      auth: inspectorA,
    });
    expect(result.allowed).toBe(true);
  });

  it("should DENY unauthenticated user from reading projects", () => {
    const result = evaluateRule({
      path: "/users/inspector-alice-123/projects/proj-1",
      operation: "read",
      auth: unauthenticated,
    });
    expect(result.allowed).toBe(false);
  });

  it("should DENY Inspector Bob from reading Inspector Alice's projects", () => {
    const result = evaluateRule({
      path: "/users/inspector-alice-123/projects/proj-1",
      operation: "read",
      auth: inspectorB,
    });
    expect(result.allowed).toBe(false);
  });

  it("should allow Inspector Alice to create a project with ownerUid == Alice", () => {
    const result = evaluateRule({
      path: "/users/inspector-alice-123/projects/proj-1",
      operation: "create",
      auth: inspectorA,
      requestResource: { ownerUid: "inspector-alice-123", name: "Metro Station" },
    });
    expect(result.allowed).toBe(true);
  });

  it("should DENY Inspector Alice from creating a project with a forged ownerUid", () => {
    const result = evaluateRule({
      path: "/users/inspector-alice-123/projects/proj-1",
      operation: "create",
      auth: inspectorA,
      requestResource: { ownerUid: "inspector-bob-456", name: "Spoofed Project" },
    });
    expect(result.allowed).toBe(false);
  });

  it("should DENY Inspector Alice from creating a project in Bob's path", () => {
    const result = evaluateRule({
      path: "/users/inspector-bob-456/projects/proj-1",
      operation: "create",
      auth: inspectorA,
      requestResource: { ownerUid: "inspector-alice-123", name: "Intruder Project" },
    });
    expect(result.allowed).toBe(false);
  });

  it("should allow Inspector Alice to update their inspection preserving ownerUid", () => {
    const result = evaluateRule({
      path: "/users/inspector-alice-123/inspections/insp-1",
      operation: "update",
      auth: inspectorA,
      resource: { ownerUid: "inspector-alice-123", reviewStatus: "draft_generated" },
      requestResource: { ownerUid: "inspector-alice-123", reviewStatus: "approved" },
    });
    expect(result.allowed).toBe(true);
  });

  it("should DENY updating an inspection if ownerUid is tampered", () => {
    const result = evaluateRule({
      path: "/users/inspector-alice-123/inspections/insp-1",
      operation: "update",
      auth: inspectorA,
      resource: { ownerUid: "inspector-alice-123", reviewStatus: "draft_generated" },
      requestResource: { ownerUid: "inspector-bob-456", reviewStatus: "approved" },
    });
    expect(result.allowed).toBe(false);
  });

  it("should DENY Inspector Bob from deleting Inspector Alice's inspection", () => {
    const result = evaluateRule({
      path: "/users/inspector-alice-123/inspections/insp-1",
      operation: "delete",
      auth: inspectorB,
      resource: { ownerUid: "inspector-alice-123" },
    });
    expect(result.allowed).toBe(false);
  });

  it("should DENY all access to unmapped collections (wildcard deny-by-default)", () => {
    const result = evaluateRule({
      path: "/admin/secrets",
      operation: "read",
      auth: inspectorA,
    });
    expect(result.allowed).toBe(false);
  });
});
