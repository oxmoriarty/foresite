import { describe, it, expect } from "vitest";
import { ReviewStatus, ObservationCategory, InferenceSource, Project, Inspection } from "../src/types";

describe("ForeSite Domain Model & Types", () => {
  it("validates review status states", () => {
    const validStatuses: ReviewStatus[] = [
      "draft_generated",
      "in_review",
      "approved",
      "rejected",
    ];
    expect(validStatuses).toHaveLength(4);
  });

  it("validates observation categories", () => {
    const validCategories: ObservationCategory[] = [
      "surface_condition",
      "installation",
      "housekeeping",
      "equipment",
      "other",
    ];
    expect(validCategories).toHaveLength(5);
  });

  it("validates inference sources", () => {
    const validSources: InferenceSource[] = ["ON_DEVICE", "IN_CLOUD", "UNKNOWN"];
    expect(validSources).toHaveLength(3);
  });

  it("validates project and inspection contract structures", () => {
    const testProject: Project = {
      id: "proj-1",
      name: "Test Station",
      siteLabel: "SITE-01",
      inspectionCount: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };

    const testInspection: Inspection = {
      id: "insp-1",
      projectId: testProject.id,
      projectName: testProject.name,
      title: "Footing Rebar",
      observation: "Rebar spacing conforms to grid.",
      category: "installation",
      visibleEvidence: ["Chair height 75mm", "Bar spacing 200mm"],
      uncertainties: ["Mill certificates pending"],
      inspectorFollowUp: ["Verify concrete pour temperature"],
      reviewStatus: "draft_generated",
      aiAssisted: true,
      inferenceSource: "ON_DEVICE",
      createdAt: 1000,
      updatedAt: 1000,
    };

    expect(testProject.id).toBe("proj-1");
    expect(testInspection.projectId).toBe(testProject.id);
    expect(testInspection.reviewStatus).toBe("draft_generated");
    expect(testInspection.inferenceSource).toBe("ON_DEVICE");
  });
});
