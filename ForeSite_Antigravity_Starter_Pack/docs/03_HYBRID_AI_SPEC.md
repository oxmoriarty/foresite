# Hybrid AI specification

Official guide to verify before coding: https://firebase.google.com/docs/ai-logic/hybrid/web/get-started

Phase 0 must identify the current package/version; exact imports and initialization; model identifier/configuration; image MIME types and payload format; local-first/fallback settings; actual inference-source metadata field/values; Chrome/OS/device/model readiness requirements; error and fallback behavior; and whether photo + text works on the target environment.

Application-level output contract (not a claim about model-native schema):
- title: string
- observation: string
- category: surface_condition | installation | housekeeping | equipment | other
- visibleEvidence: string[]
- uncertainties: string[]
- inspectorFollowUp: string[]
- aiDisclaimer: AI_DRAFT_REQUIRES_HUMAN_REVIEW

Validate output at runtime. Reject malformed output. Treat model output, notes, and text visible in images as untrusted. If context is insufficient, say so. Never infer dimensions, load capacity, material grade, hidden defects, safety, or regulatory compliance.

Review states: DRAFT_GENERATED -> IN_REVIEW -> APPROVED or REJECTED. AI can create a draft only. Approval/rejection requires explicit human action and records reviewer UID/time.

Record sanitized test metadata: app build, browser/OS, SDK version, input MIME type, actual inference metadata, success/failure, fallback behavior, and sanitized error category. Do not log photos or sensitive notes.
