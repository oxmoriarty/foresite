# Phase 4: Hybrid AI Integration

**Status:** **AUTHORIZED BY PROJECT OWNER (Implementation NOT Started)**  
**Prerequisites:** Phase 0 Explicitly Approved; Phases 1, 2, and 3 Implemented & Verified  
**Master Reference:** [`../FORESITE_MASTER_REFERENCE.md`](../FORESITE_MASTER_REFERENCE.md)  
**Detailed Spec:** [`../docs/03_HYBRID_AI_SPEC.md`](../docs/03_HYBRID_AI_SPEC.md)

---

## 1. Objective and Authorization

Phase 4 is authorized to implement photo-plus-text inspection drafting using **Firebase AI Logic Hybrid Inference only**, adhering strictly to the approved Phase 0 decision areas and the updated inference preference architecture:

1. **On-Device Gemini Nano 4:** Routed via Chrome's Prompt API. Developers must **never** pass `"gemini-nano-4"` as a model string to `getGenerativeModel()`.
2. **User-Controlled Automatic Cloud Fallback Setting:** Located under `Settings → AI & Privacy → Automatic cloud fallback`. Default is strictly **OFF** for new users.
   - **Setting ON (Mode A):** Uses `InferenceMode.PREFER_ON_DEVICE`. Automatically falls back to Google Cloud if on-device inference is unready/unavailable. Pre-authorized by user; no separate per-inspection prompt.
   - **Setting OFF (Mode B - Default):** Uses `InferenceMode.ONLY_ON_DEVICE` initially. If on-device inference fails/unavailable, presents an explicit modal for cloud processing consent. If accepted, runs `InferenceMode.ONLY_IN_CLOUD`. If declined, cancels transmission and allows manual editing.
3. **Cloud Fallback Model:** Proposed `gemini-3.5-flash-lite` verified against official registries; official production replacement is `gemini-2.5-flash-lite`.
4. **App Check:** Enforced using debug tokens during local development (never committed to Git) and an official provider in production. Enforcement must never be weakened or disabled.
5. **Quota Cooldowns:** Controlled handling of 429 throttling and quota limits. Manual inspection remains 100% operational. No billing upgrades.
6. **Privacy & Data Security:** Mandatory pre-transmission consent when automatic fallback is OFF. Plain language disclosure in Settings when automatic fallback is ON.
7. **Hardware Independence:** Designed for standard Chrome 139+ environments; not tailored to individual developer PC limitations. No claims of local inference without actual execution evidence.

---

## 2. Implementation Execution Steps (When Authorized to Start)

1. **Verify Official Documentation First:**
   - Confirm exact Firebase JavaScript SDK version (`firebase@^12.5.0` or latest compatible) and imports (`firebase/ai`).
   - Confirm exact supported cloud model identifier for `inCloudParams.model` (verifying proposed `gemini-3.5-flash-lite`).
   - Document verification findings before writing code.
2. **AI Service Module (`src/services/ai.ts`):**
   - Initialize Firebase AI Logic with `GoogleAIBackend()`.
   - Separate initialization paths: In Mode A (`PREFER_ON_DEVICE`), call `initializeDeviceModel()` without awaiting download completion before inference. In Mode B (`ONLY_ON_DEVICE`), call and await `initializeDeviceModel(onProgress)` with progress feedback before inference. Do not use a shared helper that forces Mode A to wait.
   - Build single-turn multimodal payload (`[textPrompt, { inlineData: { data, mimeType } }]`) with JPEG/PNG restriction.
   - Implement canvas downscaling (max dimension 1600px, JPEG quality 0.85) to prevent heap crashes and stay under 20 MB.
3. **Runtime Schema Validation (`src/services/aiValidation.ts`):**
   - Treat model output as untrusted input.
   - Validate required fields (`title`, `observation`, `category`, `visibleEvidence`, `uncertainties`, `inspectorFollowUp`, `aiDisclaimer`).
   - Validate category against the 8 approved domain enums.
   - Controlled error handling for malformed or incomplete output.
4. **Inference Source Mapping:**
   - Map `result.response.inferenceSource` strictly to `ON_DEVICE`, `IN_CLOUD`, or `UNKNOWN`.
   - Never infer source from latency, browser, or network state.
5. **Settings & Privacy UI (`SettingsScreen.tsx`):**
   - Add "AI & Privacy" section with "Automatic cloud fallback" switch.
   - Default: strictly OFF for all new users and unauthenticated sessions.
   - Namespace local storage keys by authenticated UID (`foresite_pref_auto_cloud_fallback_${uid}`).
   - Handle sign-out, account switching, and unauthenticated use safely.
   - Reconcile local cache with Firestore `/users/{uid}.preferences.autoCloudFallback`.
   - Surface Firestore sync errors without falsely indicating saved state.
   - Plain-language disclosure explaining cloud transmission and Gemini Developer API free-tier data-use terms (data may be used to train/improve Google products).
6. **Cloud Fallback Consent Dialog (`CloudConsentModal.tsx`):**
   - Triggered when setting is OFF and on-device inference cannot complete (distinguishing active downloading from genuine failure).
   - Clearly distinguish AI processing transmission to Gemini Developer API from ordinary Firestore synchronization.
   - Disclose Google Cloud / Gemini Developer API free-tier data-use terms (data may be used to train/improve Google products).
   - Provide clear `Consent & Process in Cloud` vs `Decline (Manual Authoring)` actions.
   - On decline, keep evidence in IndexedDB, cancel cloud transmission, never retry automatically, and allow manual authoring while ordinary Firestore sync continues.
7. **UI Integration (`InspectionEditorModal.tsx`):**
   - Add "Generate AI Draft" button.
   - Loading and progress states.
   - Transparent inference source badge (`ON_DEVICE`, `IN_CLOUD`, `UNKNOWN`).
   - User-friendly cooldown alerts on rate limits.
   - Editable draft fields with mandatory human review disclaimer.
7. **Automated Testing:**
   - Unit tests for AI initialization, request formatting, schema validation, source mapping, and error handling.
   - Distinguish mocked unit tests from real live inference tests.
8. **Quality Gates:**
   - `npm run typecheck`
   - `npm test` (all regression tests passing)
   - `npm run lint`
   - `npm run build`
9. **Git Commit & Push:**
   - Commit Phase 4 changes: `feat(phase-4): hybrid ai logic integration, gemini nano 4, and cloud fallback consent`
   - Push to GitHub: `git push origin main`
