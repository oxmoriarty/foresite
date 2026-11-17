# ForeSite — Architectural Decision Register

**Document Version:** 2.0.0  
**Last Updated:** November 16, 2026  
**Status:** Approved & Synchronized  
**Master Reference:** [`../FORESITE_MASTER_REFERENCE.md`](../FORESITE_MASTER_REFERENCE.md)

---

## Decision Status Definitions

- **APPROVED:** Formally accepted by the project owner; authorized for execution.
- **IMPLEMENTED:** Written into the active application workspace codebase.
- **VERIFIED:** Validated by passing automated tests, typecheck, lint, or production build.
- **PROPOSED:** Documented architectural recommendation; requires validation against official documentation or environment before coding.
- **BLOCKED:** Cannot proceed due to an external or environmental prerequisite.
- **DEPRECATED:** Explicitly superseded, discarded, or prohibited.

---

## Phase 0 Approved Decision Areas (A through F)

### Decision Area A: Hybrid AI Architecture and Gemini Nano Integration
- **Decision:** Implement on-device Gemini Nano inference using the official Firebase AI Logic Web SDK (`firebase/ai`).
- **Routing:** Use `mode: InferenceMode.PREFER_ON_DEVICE` (when automatic fallback is ON) or `mode: InferenceMode.ONLY_ON_DEVICE` (when automatic fallback is OFF).
- **Model Management & Initialization:** Chrome's supported Prompt API manages the on-device Gemini Nano model. On-device models must be initialized via `initializeDeviceModel(onDownloadProgress)` upon user interaction (e.g. clicking "Generate AI Draft").
- **Download Feedback:** When the model is downloading for the first time (which may take several minutes), progress is reported to the user. In consent-controlled mode (`ONLY_ON_DEVICE`), the system waits for download to finish and does not treat downloading as an immediate failure. In automatic mode (`PREFER_ON_DEVICE`), the SDK may route to cloud while the model downloads.
- **Model Version Transparency:** Official Chrome documentation confirms Chrome's Prompt API uses Gemini Nano. While hackathon specifications describe the target as Gemini Nano 4, authoritative version-specific evidence establishing the exact runtime model version as Nano 4 is currently unverified. The application integrates via Firebase AI Logic without bypassing it.
- **Naming Rule:** Developers must **never** pass `"gemini-nano-4"` or `"gemini-nano"` as the model parameter to `getGenerativeModel()`. The model parameter dictates cloud fallback exclusively. Passing a local model string causes cloud fallback to fail with `UNKNOWN_MODEL`.
- **Multimodal Support:** Supported as a single-turn prompt combining text instructions with a base64 image part (`image/jpeg`, `image/png`). High-res photos must be downscaled client-side (max 1600px, 0.85 quality) to prevent >20MB HTTP payloads.
- **Source Reporting:** Display `ON_DEVICE` or `IN_CLOUD` **strictly** when verified by official SDK metadata (`result.response.inferenceSource`). Display `UNKNOWN` if metadata is missing or unverified. Never guess from latency or network heuristics.
- **Status:** **APPROVED**

### Decision Area B: Cloud Fallback Model
- **Decision:** Cloud inference is an approved fallback under five strict conditions:
  1. On-device inference is unavailable, downloading, or unsupported.
  2. The workstation is online.
  3. The user has provided explicit consent (either via the persistent Automatic Cloud Fallback setting or per-request consent dialog).
  4. The selected Firebase AI Logic configuration and model support the intended workflow.
  5. Applicable free-tier quota permits the request without billing.
- **Approved Proposed Model:** `gemini-3.5-flash-lite`.
- **Verification Confirmation:** Official Firebase and Google AI documentation identifies `gemini-3.5-flash-lite` as a supported, stable model and the default cloud-hosted fallback model starting with Firebase JS SDK v13.0.0. It supports multimodal (photo + text) inputs and structured JSON output.
- **Substitution Invariant:** No model substitution (e.g. to `gemini-2.5-flash-lite`) is permitted unless a specific, documented compatibility issue justifies it and the project owner explicitly approves it.
- **Status:** **APPROVED (PROPOSED MODEL: gemini-3.5-flash-lite)**

### Decision Area C: Firebase App Check
- **Decision:** App Check enforcement remains active to protect backend endpoints from unauthorized access.
- **Development:** Registered debug tokens (`FIREBASE_APPCHECK_DEBUG_TOKEN`) may be used in local development via `.env.local`. Debug tokens must **never** be checked into Git or included in production.
- **Production:** Must use an officially supported provider (e.g., `ReCaptchaEnterpriseProvider`).
- **Invariant:** App Check enforcement must never be weakened or disabled to work around implementation problems.
- **Status:** **APPROVED**

### Decision Area D: Quota Management and Cooldowns
- **Decision:** Implement controlled handling of quota exhaustion, throttling (429), and temporary unavailability.
- **Dynamic Limits & Cooldowns:** Quota availability is provider- and project-dependent. Quotas are not treated as permanent or unlimited, and historical RPM/RPD limits are not hardcoded. Do not assume `Retry-After` is always exposed by Firebase AI Logic. If the SDK exposes a valid retry delay, the application respects it; otherwise, a conservative temporary cooldown is applied.
- **No Automatic Retry:** Never automatically retry a failed cloud request.
- **Zero-Billing Invariant:** Under no circumstances will billing be activated or paid plans enabled to overcome quota limits.
- **Continuity:** Manual inspection creation and editing must remain 100% operational when AI inference is throttled or offline.
- **Status:** **APPROVED**

### Decision Area E: Privacy, AI Processing Transmission, and Firestore Synchronization
- **Decision:** ForeSite must clearly distinguish **AI processing transmission** from **ordinary application synchronization**:
  1. **AI Processing Transmission:** Governs whether inspection photographs and notes are transmitted to Google's Gemini Developer API for AI-assisted draft generation. Under Google's Developer API free-tier terms, content submitted to the API (including inspection photographs and notes) may be processed by Google and used to improve Google products and services (`https://ai.google.dev/gemini-api/docs/pricing`).
  2. **Ordinary Application Synchronization:** ForeSite's established architecture continues to synchronize structured inspection records, including observations, visible evidence, identifiers, timestamps and metadata, to Cloud Firestore under `/users/{uid}/inspections/{id}`. Original photo binaries remain in IndexedDB and are not uploaded to Firestore.
- **Decline Path Boundaries:** When automatic fallback is OFF and an inspector declines cloud AI processing:
  - Inspection photographs and notes are **never** sent to the Gemini Developer API for inference.
  - The declined cloud request is **never** automatically retried.
  - The original photograph is preserved in IndexedDB.
  - The inspector continues authoring manually.
  - Ordinary Firestore synchronization continues according to existing application behavior and security rules.
  - The application does **not** falsely claim that all inspection information remains solely on the device.
- **Disabling Invariant:** Disabling cloud fallback must **never** disable on-device AI inference.
- **Status:** **APPROVED**

### Decision Area F: Hardware & Browser Compatibility
- **Decision:** ForeSite is architected for standard supported desktop environments and must **not** be designed around any specific personal computer's disk space, memory, or GPU limitations.
- **Browser Requirement:** Google Chrome Desktop version 139 or higher with required flags enabled (`#prompt-api-for-gemini-nano-multimodal-input` and `#optimization-guide-on-device-model`).
- **Verification Standard:** Distinguish documented API compatibility from actual on-device runtime execution evidence. Never claim Gemini Nano inference has been executed on a device without direct runtime evidence.
- **Status:** **APPROVED**

### Decision Area G: User-Controlled Automatic Cloud Fallback Setting & Two-Mode Inference Architecture
- **Decision:** ForeSite must provide a persistent user preference under **Settings → AI & Privacy → Automatic cloud fallback**.
- **Default:** Strictly **OFF** for all new users, guest/unauthenticated sessions, and whenever preference cannot be reliably established.
- **Mode A (Setting ON — Automatic Cloud Fallback):**
  - Configured with `mode: InferenceMode.PREFER_ON_DEVICE`.
  - Attempts on-device Gemini Nano inference first. Calls `initializeDeviceModel()` with non-blocking rejection handling (`.catch(...)`) without awaiting download completion before submitting inference.
  - Automatically falls back to Google Cloud (`gemini-3.5-flash-lite`) when on-device inference is unavailable, downloading, or unsupported, adhering to Firebase's documented behavior.
  - Pre-authorized by user: no separate modal prompt on each inspection, with upfront plain-language disclosure in Settings regarding cloud transmission and free-tier data-use terms.
- **Mode B (Setting OFF — Consent-Controlled Cloud Fallback):**
  - Configured with `mode: InferenceMode.ONLY_ON_DEVICE` for the initial attempt.
  - Calls and awaits `initializeDeviceModel(onDownloadProgress)` with percentage feedback before submitting inference.
  - On-device AI continues to run automatically whenever available.
  - If on-device inference cannot complete (distinguishing downloading from genuine failure), the UI explains that cloud processing is available and requests explicit user permission before transmitting any photograph or notes.
  - If accepted, a secondary request is dispatched with `mode: InferenceMode.ONLY_IN_CLOUD`.
  - If declined, inspection photographs and notes are **never** transmitted to Google Cloud; user returns to manual inspection while ordinary Firestore synchronization continues.
- **State-Based Preference Service Contract:**
  - Implements `CloudFallbackPreference` distinguishing `enabled`, `source: "firestore" | "local" | "default"`, and `syncStatus: "synced" | "pending" | "failed" | "unavailable"`.
  - Inference must not start while preference resolution is pending. Unresolved/invalid/failed preference resolves to OFF.
- **Payload Safeguards:**
  - Strict 4 MB ceiling enforced on encoded AI derivatives before inference, with dynamic reduction or controlled rejection. Original Blobs remain untouched in IndexedDB.
- **Explicit Fallback & Error Classification:**
  - The system distinguishes model unavailability, downloading state, unsupported inputs, local execution crashes, cloud network failure, and HTTP 429 quota exhaustion.
  - Does not assume every arbitrary error triggers fallback.
  - Never implements independent cloud retry when automatic fallback is OFF.
  - A declined request is never retried automatically.
- **Account Isolation & Persistence:**
  - Local preference keys are strictly namespaced by authenticated UID: `foresite_pref_auto_cloud_fallback_${uid}`.
  - Sign-out resets in-memory active preference to safe default OFF and detaches the user scope.
  - Account switching loads the incoming UID's namespaced local cache and reconciles with Firestore `/users/{uid}.preferences.autoCloudFallback`.
  - Unauthenticated preview sessions use safe default OFF.
  - Firestore write failures are caught and surfaced; unsaved changes are not falsely indicated as synchronized.
  - Requests capture an immutable scoped snapshot of the preference at click-time; in-flight requests are never mutated mid-execution.
  - Disabling automatic cloud fallback must **never** disable on-device AI.
- **Status:** **APPROVED (PHASE 4 ARCHITECTURAL UPDATE)**

---

## Phase 1–3 Implemented & Verified Decisions

| # | Topic | Decision | Status | Verification Evidence |
| :--- | :--- | :--- | :--- | :--- |
| **1** | **Platform Target** | Chrome desktop first; Android assessed post-MVP in Phase 7. | **VERIFIED** | Vite React app operational; Android deferred. |
| **2** | **Zero-Cost Plan** | 100% Firebase Spark Plan ($0/month, no credit card attached). | **VERIFIED** | Zero paid dependencies; hard quota stops active. |
| **3** | **Local Evidence Storage** | Original photo Blobs stored in IndexedDB (`ForeSiteEvidenceDB` v1). | **VERIFIED** | Unit tests in `indexeddb.test.ts` pass (7/7). |
| **4** | **Photo Validation** | JPEG, PNG, WebP $\le$10 MB; client-side memory management via object URL revocation. | **VERIFIED** | Unit tests in `photo-validation.test.ts` pass (9/9). |
| **5** | **Draft Auto-Save** | 1500 ms debounced auto-save directly to IndexedDB. | **VERIFIED** | Integration tests in `inspection-workflows.test.tsx` pass. |
| **6** | **Cascade Deletion** | Deleting a project purges all linked local drafts and photo Blobs. | **VERIFIED** | Tested and verified in `indexeddb.test.ts`. |
| **7** | **Auth Architecture** | Firebase Auth with email/password; UID used as tenant isolation key. | **VERIFIED** | Tested and verified in `auth.test.tsx` (5/5). |
| **8** | **Security Rules** | Owner-scoped `/users/{uid}/...` subcollections with default deny. | **VERIFIED** | Tested and verified in `firestore-rules.test.ts` (16/16). |
| **9** | **Human-in-the-Loop** | AI output is preliminary draft (`draft_generated`); explicit human review required. | **VERIFIED** | Workflows tested in `inspection-workflows.test.tsx`. |

---

## Deprecated Decisions

| Decision | Status | Reason for Deprecation |
| :--- | :--- | :--- |
| **`"gemini-nano-4"` as Model String** | **DEPRECATED** | Passing local model string to `getGenerativeModel()` causes `UNKNOWN_MODEL` cloud fallback failure. |
| **Firebase Cloud Storage for Photos** | **DEPRECATED** | Excluded to eliminate billing requirements and maintain zero-cost Spark compliance. |
| **Supabase Storage Integration (MVP)** | **DEPRECATED** | Researched in Phase 0; excluded from MVP to keep photos strictly local by default. |
| **Direct Gemini API Keys in Client** | **DEPRECATED** | Excluded for security; all inference must route through approved Firebase AI Logic SDK. |
| **Autonomous Compliance Certification**| **DEPRECATED** | Prohibited; human inspector must make all final safety and regulatory judgments. |
