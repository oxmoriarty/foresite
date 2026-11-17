/**
 * ForeSite AI Output Runtime Schema Validation Service
 *
 * Validates untrusted AI responses against the ForeSite domain contract:
 * - 8 approved categories: structural, electrical, plumbing, hvac, fire_safety, general, environmental, finishes
 * - Required fields: title (max 120 chars), observation, category, visibleEvidence (1-8 items),
 *   uncertainties, inspectorFollowUp, aiDisclaimer ("AI_DRAFT_REQUIRES_HUMAN_REVIEW")
 * - Robust JSON extraction from markdown code fences
 * - Controlled errors: never silently cast malformed data into valid records
 */

import { AIInspectionDraftOutput, InspectionCategory } from "../types";

export const APPROVED_INSPECTION_CATEGORIES: readonly InspectionCategory[] = [
  "structural",
  "electrical",
  "plumbing",
  "hvac",
  "fire_safety",
  "general",
  "environmental",
  "finishes",
] as const;

export const AI_DISCLAIMER_CONSTANT = "AI_DRAFT_REQUIRES_HUMAN_REVIEW";

export interface AIValidationResult {
  success: boolean;
  data?: AIInspectionDraftOutput;
  error?: string;
}

/**
 * Extracts raw JSON string from text that may contain markdown code fences.
 */
export function extractJsonFromText(rawText: string): string {
  if (!rawText || typeof rawText !== "string") {
    throw new Error("Empty or non-string response received from AI model.");
  }

  const trimmed = rawText.trim();

  // Match ```json ... ``` or ``` ... ```
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    return codeBlockMatch[1].trim();
  }

  // If no code block, look for first { and last }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.substring(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

/**
 * Validates parsed JavaScript object against the AIInspectionDraftOutput schema.
 */
export function validateAIInspectionOutput(input: unknown): AIValidationResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      success: false,
      error: "Model output is not a valid JSON object.",
    };
  }

  const record = input as Record<string, unknown>;

  // 1. Validate title
  if (typeof record.title !== "string" || !record.title.trim()) {
    return {
      success: false,
      error: "Missing or invalid 'title' field. Title must be a non-empty string.",
    };
  }
  if (record.title.trim().length > 120) {
    return {
      success: false,
      error: `Title exceeds maximum limit of 120 characters (${record.title.trim().length} chars).`,
    };
  }

  // 2. Validate observation
  if (typeof record.observation !== "string" || !record.observation.trim()) {
    return {
      success: false,
      error: "Missing or invalid 'observation' field. Observation must be a non-empty string.",
    };
  }

  // 3. Validate category
  if (
    typeof record.category !== "string" ||
    !APPROVED_INSPECTION_CATEGORIES.includes(record.category as InspectionCategory)
  ) {
    return {
      success: false,
      error: `Invalid 'category' ("${record.category}"). Must be one of: ${APPROVED_INSPECTION_CATEGORIES.join(", ")}.`,
    };
  }

  // 4. Validate visibleEvidence (array of strings, 1-8 items)
  if (!Array.isArray(record.visibleEvidence)) {
    return {
      success: false,
      error: "'visibleEvidence' must be an array of strings.",
    };
  }
  if (record.visibleEvidence.length === 0) {
    return {
      success: false,
      error: "'visibleEvidence' array must contain at least 1 concrete visible evidence item.",
    };
  }
  if (record.visibleEvidence.length > 8) {
    return {
      success: false,
      error: `'visibleEvidence' array exceeds maximum limit of 8 items (${record.visibleEvidence.length} items).`,
    };
  }
  for (let i = 0; i < record.visibleEvidence.length; i++) {
    if (typeof record.visibleEvidence[i] !== "string" || !record.visibleEvidence[i].trim()) {
      return {
        success: false,
        error: `visibleEvidence item at index ${i} must be a non-empty string.`,
      };
    }
  }

  // 5. Validate uncertainties (array of strings)
  if (!Array.isArray(record.uncertainties)) {
    return {
      success: false,
      error: "'uncertainties' must be an array of strings.",
    };
  }
  for (let i = 0; i < record.uncertainties.length; i++) {
    if (typeof record.uncertainties[i] !== "string") {
      return {
        success: false,
        error: `uncertainties item at index ${i} must be a string.`,
      };
    }
  }

  // 6. Validate inspectorFollowUp (array of strings)
  let followUpList: string[] = [];
  if (Array.isArray(record.inspectorFollowUp)) {
    for (let i = 0; i < record.inspectorFollowUp.length; i++) {
      if (typeof record.inspectorFollowUp[i] !== "string") {
        return {
          success: false,
          error: `inspectorFollowUp item at index ${i} must be a string.`,
        };
      }
    }
    followUpList = record.inspectorFollowUp.map((s) => (s as string).trim()).filter(Boolean);
  } else if (typeof record.inspectorFollowUp === "string" && record.inspectorFollowUp.trim()) {
    // Gracefully normalize single string recommendation into array
    followUpList = [record.inspectorFollowUp.trim()];
  } else {
    return {
      success: false,
      error: "'inspectorFollowUp' must be an array of strings.",
    };
  }

  // 7. Validate aiDisclaimer
  const disclaimer = typeof record.aiDisclaimer === "string" ? record.aiDisclaimer.trim() : "";
  if (!disclaimer || disclaimer !== AI_DISCLAIMER_CONSTANT) {
    return {
      success: false,
      error: `Missing or invalid 'aiDisclaimer'. Must match constant "${AI_DISCLAIMER_CONSTANT}".`,
    };
  }

  const cleanData: AIInspectionDraftOutput = {
    title: record.title.trim(),
    observation: record.observation.trim(),
    category: record.category as InspectionCategory,
    visibleEvidence: (record.visibleEvidence as string[]).map((s) => s.trim()),
    uncertainties: (record.uncertainties as string[]).map((s) => s.trim()).filter(Boolean),
    inspectorFollowUp: followUpList,
    aiDisclaimer: AI_DISCLAIMER_CONSTANT,
  };

  return {
    success: true,
    data: cleanData,
  };
}

/**
 * Extracts, parses, and validates AI response text into AIInspectionDraftOutput.
 * Throws a detailed error on validation or parsing failure.
 */
export function parseAndValidateAIOutput(rawResponseText: string): AIInspectionDraftOutput {
  const jsonStr = extractJsonFromText(rawResponseText);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (parseErr) {
    throw new Error(
      `Failed to parse AI output as JSON: ${parseErr instanceof Error ? parseErr.message : "Invalid syntax"}. Raw output: ${rawResponseText.slice(0, 200)}`
    );
  }

  const validation = validateAIInspectionOutput(parsed);
  if (!validation.success || !validation.data) {
    throw new Error(`AI output failed schema validation: ${validation.error}`);
  }

  return validation.data;
}
