import { describe, it, expect } from "vitest";
import {
  extractJsonFromText,
  validateAIInspectionOutput,
  parseAndValidateAIOutput,
  APPROVED_INSPECTION_CATEGORIES,
  AI_DISCLAIMER_CONSTANT,
} from "../src/services/aiValidation";

describe("ForeSite AI Output Runtime Schema Validation", () => {
  const validMockRecord = {
    title: "Cracked Concrete Column Base",
    observation: "Diagonal shear crack measuring approx. 2mm wide visible at column base interface.",
    category: "structural",
    visibleEvidence: ["Diagonal 2mm crack", "Spalling at corner edge"],
    uncertainties: ["Subsurface reinforcement condition", "Foundation settlement status"],
    inspectorFollowUp: ["Perform ultrasonic pulse test", "Review structural design drawings"],
    aiDisclaimer: AI_DISCLAIMER_CONSTANT,
  };

  it("extracts pure JSON from raw markdown code fences", () => {
    const rawMarkdown = "Here is the inspection draft:\n```json\n" + JSON.stringify(validMockRecord, null, 2) + "\n```\nHope this helps!";
    const extracted = extractJsonFromText(rawMarkdown);
    expect(JSON.parse(extracted)).toEqual(validMockRecord);
  });

  it("extracts pure JSON from code fences without language specifier", () => {
    const rawMarkdown = "```\n" + JSON.stringify(validMockRecord) + "\n```";
    const extracted = extractJsonFromText(rawMarkdown);
    expect(JSON.parse(extracted)).toEqual(validMockRecord);
  });

  it("extracts pure JSON from text with leading and trailing prose", () => {
    const rawText = "ForeSite Output:\n" + JSON.stringify(validMockRecord) + "\nEnd of report.";
    const extracted = extractJsonFromText(rawText);
    expect(JSON.parse(extracted)).toEqual(validMockRecord);
  });

  it("validates a compliant AI inspection draft record", () => {
    const result = validateAIInspectionOutput(validMockRecord);
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.title).toBe(validMockRecord.title);
    expect(result.data?.category).toBe("structural");
    expect(result.data?.aiDisclaimer).toBe(AI_DISCLAIMER_CONSTANT);
  });

  it("validates all 8 approved domain categories", () => {
    for (const cat of APPROVED_INSPECTION_CATEGORIES) {
      const rec = { ...validMockRecord, category: cat };
      const res = validateAIInspectionOutput(rec);
      expect(res.success).toBe(true);
      expect(res.data?.category).toBe(cat);
    }
  });

  it("rejects unapproved or hallucinated categories", () => {
    const invalidRec = { ...validMockRecord, category: "unapproved_category" };
    const res = validateAIInspectionOutput(invalidRec);
    expect(res.success).toBe(false);
    expect(res.error).toContain("Invalid 'category'");
  });

  it("rejects title exceeding 120 characters", () => {
    const longTitle = "A".repeat(121);
    const invalidRec = { ...validMockRecord, title: longTitle };
    const res = validateAIInspectionOutput(invalidRec);
    expect(res.success).toBe(false);
    expect(res.error).toContain("Title exceeds maximum limit of 120 characters");
  });

  it("rejects empty or missing title", () => {
    const invalidRec = { ...validMockRecord, title: "   " };
    const res = validateAIInspectionOutput(invalidRec);
    expect(res.success).toBe(false);
    expect(res.error).toContain("Missing or invalid 'title'");
  });

  it("rejects empty visibleEvidence array", () => {
    const invalidRec = { ...validMockRecord, visibleEvidence: [] };
    const res = validateAIInspectionOutput(invalidRec);
    expect(res.success).toBe(false);
    expect(res.error).toContain("must contain at least 1 concrete visible evidence item");
  });

  it("rejects visibleEvidence array exceeding 8 items", () => {
    const nineItems = Array.from({ length: 9 }, (_, i) => `Evidence item ${i + 1}`);
    const invalidRec = { ...validMockRecord, visibleEvidence: nineItems };
    const res = validateAIInspectionOutput(invalidRec);
    expect(res.success).toBe(false);
    expect(res.error).toContain("exceeds maximum limit of 8 items");
  });

  it("rejects missing or tampered aiDisclaimer constant", () => {
    const invalidRec = { ...validMockRecord, aiDisclaimer: "CERTIFIED_SAFE_BY_AI" };
    const res = validateAIInspectionOutput(invalidRec);
    expect(res.success).toBe(false);
    expect(res.error).toContain("Missing or invalid 'aiDisclaimer'");
  });

  it("parseAndValidateAIOutput throws clear errors on malformed JSON", () => {
    expect(() => parseAndValidateAIOutput("This is not JSON at all.")).toThrow(
      /Failed to parse AI output as JSON/
    );
  });

  it("parseAndValidateAIOutput returns structured draft on valid markdown string", () => {
    const rawMarkdown = "```json\n" + JSON.stringify(validMockRecord) + "\n```";
    const draft = parseAndValidateAIOutput(rawMarkdown);
    expect(draft.title).toBe(validMockRecord.title);
    expect(draft.category).toBe("structural");
  });
});
