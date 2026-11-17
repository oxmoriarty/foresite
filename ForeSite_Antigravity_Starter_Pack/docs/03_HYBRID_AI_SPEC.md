# ForeSite — Hybrid AI Specification

**Document Version:** 2.0.0  
**Last Updated:** November 16, 2026  
**Status:** Approved & Synchronized with Phase 0 Decisions  
**Master Reference:** [`../FORESITE_MASTER_REFERENCE.md`](../FORESITE_MASTER_REFERENCE.md)  
**Primary Guide:** [Firebase AI Logic Web Hybrid Documentation](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started)

---

## 1. Hybrid Inference Architecture

ForeSite implements the hackathon-required **Gemini Nano 4** on-device inference capability via the official **Firebase AI Logic Web SDK** (`firebase/ai`), with seamless, privacy-consented fallback to cloud inference.

### 1.1 SDK Initialization & Imports
```typescript
import { initializeApp } from "firebase/app";
import { 
  getAI, 
  getGenerativeModel, 
  GoogleAIBackend, 
  InferenceMode, 
  InferenceSource 
} from "firebase/ai";

// Initialize AI Logic with Google AI Developer backend (Spark free tier)
const ai = getAI(app, { backend: new GoogleAIBackend() });
```

### 1.2 Two-Mode Hybrid Inference Strategy & Invariant
ForeSite supports two distinct, user-controlled hybrid inference strategies based on the persistent user setting under **Settings → AI & Privacy → Automatic cloud fallback**:

```typescript
// Mode A: Setting ON (Automatic Cloud Fallback)
// Attempts on-device first; automatically falls back to cloud if local model is unavailable/unready.
const autoFallbackModel = getGenerativeModel(ai, {
  mode: InferenceMode.PREFER_ON_DEVICE,
  inCloudParams: {
    model: "gemini-3.5-flash-lite", // Official supported default cloud fallback model (JS SDK v13.0.0+)
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json"
    }
  }
});

// Mode B: Setting OFF (Consent-Controlled Cloud Fallback - Default)
// 1. Initial attempt: Strictly local on-device
const onDeviceOnlyModel = getGenerativeModel(ai, {
  mode: InferenceMode.ONLY_ON_DEVICE
});

// 2. Secondary attempt (Only if on-device fails AND user explicitly consents):
const cloudOnlyModel = getGenerativeModel(ai, {
  mode: InferenceMode.ONLY_IN_CLOUD,
  inCloudParams: {
    model: "gemini-3.5-flash-lite",
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json"
    }
  }
});
```

> [!CRITICAL]
> **Model Naming Invariant:** Developers must **never** pass `"gemini-nano-4"` or `"gemini-nano"` to `getGenerativeModel()`.
> - Chrome's built-in Prompt API manages the on-device model automatically when `mode: InferenceMode.PREFER_ON_DEVICE` or `mode: InferenceMode.ONLY_ON_DEVICE` is specified.
> - The `model` or `inCloudParams.model` parameter controls the **cloud fallback target exclusively**.
> - Passing a local model identifier will cause cloud fallback to fail with an `UNKNOWN_MODEL` error.

### 1.3 On-Device Model Initialization Sequencing (`initializeDeviceModel`)
Official Firebase AI Logic hybrid documentation specifies calling `initializeDeviceModel()` during or after an end-user interaction before sending an inference request. ForeSite strictly separates the initialization sequencing for Mode A and Mode B to prevent shared helpers from forcing unwanted download delays:

#### Mode A — Automatic Cloud Fallback ON
- Call `initializeDeviceModel()` after the relevant user interaction (e.g. inspector clicks "Generate AI Draft").
- **Do NOT await model-download completion** before submitting the `PREFER_ON_DEVICE` inference request.
- **Promise Rejection Handling:** Attach a non-blocking `.catch((err) => { console.warn("Background device model initialization warning:", err); })` handler to prevent unhandled promise rejections if on-device initialization fails in the background.
- Firebase AI Logic automatically utilizes cloud-hosted `gemini-3.5-flash-lite` while the on-device model downloads in the background, ensuring immediate response without multi-minute blocking.
- The UI reports the actual verified inference source (`ON_DEVICE`, `IN_CLOUD`, or `UNKNOWN`).

#### Mode B — Automatic Cloud Fallback OFF (Default)
- Call and **await `initializeDeviceModel((progressValue: number) => { ... })`**.
- Display download progress (percentage readout and advisory that initial model setup can take several minutes).
- Submit the `ONLY_ON_DEVICE` inference request strictly after initialization completes.
- If on-device inference cannot proceed (device unsupported, WebGPU missing, or initialization failure), halt execution immediately before network transmission and present the Cloud Processing Consent Modal.
- If consented, dispatch a separate `ONLY_IN_CLOUD` request.

> [!CRITICAL]
> **Architectural Guardrail:** Do **not** use a shared initialization helper that accidentally forces Mode A to await download completion. Mode A and Mode B must maintain distinct execution pipelines. Undocumented cancellation or retry APIs outside the Firebase SDK are strictly prohibited.

---

## 2. Multimodal Photo + Text Ingestion

### 2.1 Supported Payload Format & Input Validation
- **Supported MIME Types:** `image/jpeg` and `image/png` only.
- **Payload Structure:** Part object containing Base64 encoded image data without the `data:mime;base64,` prefix:
  ```typescript
  interface InlineDataPart {
    inlineData: {
      data: string; // Base64 string
      mimeType: "image/jpeg" | "image/png";
    };
  }
  ```
- **Distinguishing Invalid Application Input from Unsupported Provider Features:**
  - **Client-Side Pre-Validation:** Malformed images, invalid MIME types (e.g. WebP, GIF, PDF), unreadable files, or empty prompts are validated and rejected client-side before sending to the SDK. Invalid application input produces immediate client-side validation errors and **never** triggers AI inference or automatic cloud fallback.
  - **Valid but Unsupported On-Device Provider Features:** For valid inputs containing features supported in cloud models but not by the on-device provider, the system follows Firebase's documented behavior: in `PREFER_ON_DEVICE` mode, Firebase AI Logic routes to cloud fallback; in `ONLY_ON_DEVICE` mode, the SDK errors and halts locally.
- **Invocation Pattern:**
  ```typescript
  const result = await model.generateContent([textPrompt, imagePart]);
  ```

### 2.2 Client-Side Image Pre-Processing & Enforceable Size Safeguards
- High-resolution photographs (10–50 MB) can cause JavaScript heap memory spikes and exceed HTTP payload limits.
- **Enforceable Payload Safeguards:** A fixed maximum dimension (1600px) and JPEG quality (0.85) do **not** mathematically guarantee a payload below 20 MB (e.g. high-frequency textures, noisy construction scenes). The implementation enforces the following pipeline:
  1. **Preserve Original Blob:** The original full-resolution photograph `Blob` is preserved untouched in client-side IndexedDB (`evidencePhotos`).
  2. **Create Derivative:** A separate, ephemeral downscaled derivative is generated on an offscreen HTML Canvas (initial target: max dimension 1600px, JPEG quality 0.85).
  3. **Measure Encoded Output:** The implementation explicitly measures the actual byte size of the resulting encoded Base64/JPEG derivative.
  4. **Enforce Defined Ceiling:** A strict ceiling of **4 MB** is enforced for AI derivatives (comfortably below the 20 MB HTTP payload limit and safe for browser memory heaps).
  5. **Dynamic Downscaling or Controlled Rejection:** If the measured derivative exceeds 4 MB, the pre-processor automatically re-encodes at reduced dimensions (1200px) and lower quality (0.75). If the payload still exceeds the limit, the system rejects the image with a clear, user-facing error message before network transmission.
  6. **Prohibited Fallbacks:** The pre-processor must **never** silently fall back to transmitting the original uncompressed image.
  7. **Preference Protection:** Image pre-processing failures must **never** bypass or alter the user's cloud-fallback setting.

---

## 3. Cloud Fallback & Privacy Consent Flow

### 3.1 User-Controlled Automatic Cloud Fallback Setting & State-Based Service Contract
ForeSite provides a user-facing persistent setting under **Settings → AI & Privacy → Automatic cloud fallback**.

- **Exact Local Storage Key:** Strictly namespaced by authenticated UID:
  `foresite_pref_auto_cloud_fallback_${uid}`
- **State-Based Preference Contract:** To accurately represent loading, local-only, sync failure, and authoritative Firestore states, the preference service implements a state-based contract:
  ```typescript
  export type PreferenceSyncStatus = "synced" | "pending" | "failed" | "unavailable";
  export type PreferenceSource = "firestore" | "local" | "default";

  export interface CloudFallbackPreference {
    enabled: boolean;
    source: PreferenceSource;
    syncStatus: PreferenceSyncStatus;
  }
  ```
- **Inference Gating on Preference Resolution:** AI inference requests must **not** start while preference resolution is pending. The UI disables the "Generate AI Draft" button or awaits resolution before proceeding.
- **Default State:** An unresolved, invalid, or unavailable preference resolves strictly to `enabled: false` (OFF) with `source: "default"`.
- **Authoritative Reconciliation Rules:**
  1. **Local cache and Firestore agree:** The agreed state is authoritative (`enabled: value, syncStatus: "synced"`).
  2. **Local cache says ON but Firestore says OFF:**
     - *On account load / switch:* Firestore's **OFF** takes precedence to protect inspector privacy and prevent unauthorized data transmission.
     - *Deliberate local toggle during active session where Firestore write failed or is pending:* The local ON selection may be used on this device during the active session, but the UI must visibly label it as `"ON (Local Only - Unsynced)"` with `syncStatus: "failed"`, and never imply cloud propagation to other devices.
  3. **Firestore cannot be read (offline / error):** Resolves strictly to safe default **OFF** (`enabled: false, syncStatus: "unavailable"`). An unreadable or failed Firestore read must **never** be interpreted as permission for automatic cloud fallback.
  4. **Local cache is missing or invalid:**
     - Query Firestore `/users/{uid}.preferences.autoCloudFallback`.
     - If Firestore contains a valid Boolean preference, use that authoritative value (`source: "firestore", syncStatus: "synced"`) and populate the local cache.
     - If the Firestore document or preference field does not exist, resolve strictly to safe default **OFF** (`enabled: false, source: "default", syncStatus: "synced"`).
     - If Firestore cannot be read (offline / network error), resolve strictly to safe default **OFF** (`enabled: false, source: "default", syncStatus: "unavailable"`).
     - Never interpret an unreadable or invalid preference as permission for automatic cloud fallback.
  5. **Local update succeeds but Firestore synchronization fails:** The preference is stored under `foresite_pref_auto_cloud_fallback_${uid}`, but the UI displays a clear unsynchronized warning badge (`"Saved locally on this device; cloud sync failed"`). It is **never** presented as successfully synchronized.
  6. **Sign-Out / Account Switch:**
     - *Sign-Out:* Active preference in React state is immediately cleared and reset to safe default **OFF**. Active user scope is unbound.
     - *Account Switch:* Unbinds previous UID, reads `foresite_pref_auto_cloud_fallback_${newUid}`, queries Firestore `/users/{newUid}`, and reconciles per rules above.
  7. **Request-Time Immutability:** When an inspector clicks "Generate AI Draft", the function captures an immutable snapshot (`preferenceSnapshot: CloudFallbackPreference`). Mid-execution setting toggles do not alter in-flight requests.
  8. **Profile Field Preservation:** Nested preference updates (`updateDoc(userRef, { 'preferences.autoCloudFallback': value })`) strictly preserve all existing user profile attributes.
  9. **Firestore Security Rule Integrity:** Verified that existing rules (`match /users/{uid} { allow read, write: if owns(uid); }`) restrict read and write access strictly to the authenticated owner.

### 3.2 Two Operating Behaviors

#### Behavior A: Setting ON — Automatic Cloud Fallback
- Configures model with `mode: InferenceMode.PREFER_ON_DEVICE`.
- Attempts on-device inference first.
- If on-device inference cannot execute (documented model unavailability, unsupported on-device features, or active downloading), Firebase AI Logic routes to Google Cloud (`gemini-3.5-flash-lite`) in accordance with Firebase's documented behavior.
- Does not prompt for each inspection, as the user has granted blanket permission by enabling the setting.
- Settings UI provides prominent plain-language disclosure regarding cloud transmission and free-tier data-use terms.

#### Behavior B: Setting OFF — Consent-Controlled Cloud Fallback (Default)
- Configures model with `mode: InferenceMode.ONLY_ON_DEVICE` for the initial inference attempt.
- Always leverages on-device AI whenever available.
- If on-device inference cannot complete (due to model unavailability or documented errors, but NOT merely being in an active downloading state), the system halts before contacting any cloud endpoint.
- An explicit modal asks the user for permission to use cloud processing, explaining that the photograph and observation notes will be processed in Google Cloud under the Gemini Developer API free-tier terms.
- **User Actions:**
  - `Consent & Process in Cloud`: Triggers a separate request using `mode: InferenceMode.ONLY_IN_CLOUD`.
  - `Decline (Manual Authoring)`: Cancels the AI request entirely. The photograph and notes are **not** transmitted to the Gemini Developer API for inference, and the inspector continues with manual authoring.
- **Data Boundaries on Decline:**
  - The inspection photograph and accompanying draft notes are **not** transmitted to the Gemini Developer API for AI inference.
  - The declined cloud inference request is **never** automatically retried.
  - The original high-resolution photograph is preserved untouched in browser IndexedDB.
  - The inspector continues with manual authoring.
  - Ordinary Firestore synchronization of structured inspection records, including observations, visible evidence, identifiers, timestamps and metadata, continues according to existing application behavior and security rules.
  - The application does **not** falsely claim that all inspection information remains exclusively on the device; structured inspection records still synchronize to Firestore as designed.
- Disabling automatic cloud fallback must **never** disable on-device AI.

### 3.3 Explicit Fallback & Failure-Handling Matrix
Firebase documents `PREFER_ON_DEVICE` as using the on-device model when available and otherwise falling back to the cloud-hosted model. ForeSite does not extrapolate this into a guarantee that arbitrary exceptions trigger automatic fallback. Operational behavior is defined as follows:

| Condition | Setting ON (`PREFER_ON_DEVICE`) | Setting OFF (`ONLY_ON_DEVICE` - Default) |
| :--- | :--- | :--- |
| **Documented Model Unavailability** (hardware/flags unsupported) | Automatically routes to cloud `gemini-3.5-flash-lite`. | Halts locally; prompts user with Cloud Consent Modal. |
| **Model Downloading** (`initializeDeviceModel`) | SDK routes to cloud while model downloads in background. | Awaits download completion (shows progress %); NOT a failure. |
| **Invalid Application Input** (malformed image/invalid MIME/empty) | Rejected client-side before inference; halts with error; NO fallback. | Rejected client-side before inference; halts with error; NO fallback. |
| **Documented Unsupported On-Device Input** (features in cloud only)| Documented SDK behavior: routes to cloud fallback. | SDK rejects/errors; halts locally and prompts for cloud consent. |
| **Local Inference Execution Error** (undocumented runtime error/abort)| Does NOT promise fallback; preserves local draft, surfaces error, manual authoring. | Halts execution, surfaces error, allows manual authoring or cloud prompt. |
| **Cloud Network Failure** (offline/server error) | Throws network error; preserves local draft; manual authoring active. | Throws network error; preserves local draft; manual authoring active. |
| **Cloud Quota Exhaustion** (HTTP 429) | Displays cooldown banner (uses SDK delay if exposed, else conservative delay); manual authoring active. | Displays cooldown banner (uses SDK delay if exposed, else conservative delay); manual authoring active. |

- **Strict Fallback Rules:**
  - For undocumented local error conditions, do not promise automatic fallback. Preserve the local draft, surface the error, and provide manual authoring.
  - Never implement an independent cloud retry when automatic fallback is OFF.
  - Consent-controlled mode only creates an `ONLY_IN_CLOUD` request after explicit user approval for that particular request.
  - A declined request is never retried automatically.

### 3.4 Proposed Cloud Fallback Model
- **Proposed Selection:** `gemini-3.5-flash-lite`.
- **Documentation Verification:** Official Firebase documentation identifies `gemini-3.5-flash-lite` as a supported, stable model and the default cloud-hosted fallback model starting with Firebase JS SDK v13.0.0.
  - References:
    - `https://firebase.google.com/docs/ai-logic/hybrid/web/configuration-options`
    - `https://firebase.google.com/docs/ai-logic/models`
    - `https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite`
- **Capabilities:** Fully supports multimodal photograph + text inputs, and structured JSON output via `responseMimeType: "application/json"`.
- **Substitution Policy:** No model substitution (e.g. to `gemini-2.5-flash-lite`) is permitted unless a specific, documented compatibility issue justifies that decision and the project owner explicitly approves it.

### 3.5 Detailed Privacy, Data-Flow & Quota Disclosures
ForeSite clearly distinguishes four distinct data categories across its storage and network flows:

```
+-----------------------------------------------------------------------------------------------------------------------+
| Data Category              | Storage / Network Target     | Data Transmitted & Architectural Invariants               |
+-----------------------------------------------------------------------------------------------------------------------+
| 1. AI Inference Payload    | Google Gemini Developer API  | Ephemeral downscaled JPEG + Observation Notes.            |
|                            | (Developer free tier)        | Sent ONLY when permitted by selected mode & consent.      |
+-----------------------------------------------------------------------------------------------------------------------+
| 2. Original Photo Blobs    | Browser IndexedDB Only       | Original photo binaries remain in browser IndexedDB.       |
|                            | (Device-local disk)          | ForeSite does not upload them to Firestore or cloud storage|
+-----------------------------------------------------------------------------------------------------------------------+
| 3. Local Working Copies    | Browser IndexedDB Only       | Unsynchronized drafts and local working cache.            |
|    and Drafts              | (localInspections)           | Maintained locally for offline recovery and resilience.   |
+-----------------------------------------------------------------------------------------------------------------------+
| 4. Saved Structured Records| Google Cloud Firestore       | Structured inspection records, including observations,    |
|    and Metadata            | (/users/{uid}/inspections)   | visible evidence, identifiers, timestamps and metadata.   |
|                            |                              | Synchronized according to existing application workflow.  |
+-----------------------------------------------------------------------------------------------------------------------+
```

#### A. AI Processing Transmission vs. Ordinary Firestore Synchronization
- **AI Processing Transmission:** Governs sending photographs and notes across the network to Google's Gemini Developer API for AI-assisted draft generation.
  - **Free-Tier Terms:** Under Google's Gemini Developer API free-tier terms, content submitted to the API (including inspection photographs and notes) may be processed by Google and used to improve Google products and services (`https://ai.google.dev/gemini-api/docs/pricing`).
  - **Inspection Control on Decline:** When automatic cloud fallback is OFF and an inspector declines cloud AI processing, photographs and notes are **not** transmitted to the Gemini Developer API, and cloud inference is not retried.
- **Ordinary Application Synchronization:** ForeSite's established architecture continues to synchronize saved structured inspection records, including observations, visible evidence, identifiers, timestamps and metadata, to Cloud Firestore under `/users/{uid}/inspections/{id}`.
- **No False Local Claims:** Declining Gemini cloud AI processing prevents transmission of photographs and notes for AI processing, but does **not** disable ordinary Firestore synchronization of saved structured inspection records. The application does not falsely claim that all inspection notes remain local if the existing application workflow synchronizes them. Original photo binaries remain strictly in IndexedDB.

#### B. Dynamic Quota & Cooldown Terms
- Spark Plan status does not guarantee permanent or unlimited quotas. Quota availability is provider- and project-dependent; requests may encounter HTTP 429 throttling.
- Historical RPM, TPM, or RPD limits are not hardcoded.
- If the SDK exposes a valid retry delay (e.g. `Retry-After`), the application respects it. Otherwise, a conservative temporary cooldown (e.g. 60 seconds) is applied.
- The application never automatically retries a failed cloud request. Manual inspection authoring remains 100% operational throughout.

---

## 4. Inference Source Transparency

The user interface must accurately report the execution environment based **strictly** on verified SDK response metadata:

```typescript
export type VerifiedInferenceSource = "ON_DEVICE" | "IN_CLOUD" | "UNKNOWN";

export function resolveInferenceSource(rawSource: unknown): VerifiedInferenceSource {
  if (rawSource === InferenceSource.ON_DEVICE || rawSource === "ON_DEVICE" || rawSource === "on_device") {
    return "ON_DEVICE";
  }
  if (rawSource === InferenceSource.IN_CLOUD || rawSource === "IN_CLOUD" || rawSource === "in_cloud") {
    return "IN_CLOUD";
  }
  return "UNKNOWN";
}
```

> [!WARNING]
> The inference source must **never** be inferred from response latency, browser version, device specs, model availability checks, or network state. If SDK metadata is missing or ambiguous, the UI must report `UNKNOWN`.

---

## 5. Runtime Output Validation & Domain Contract

Model output is treated as **untrusted input**. Raw responses must be validated at runtime before updating domain state:

### 5.1 Application Output Schema
```typescript
interface AIInspectionDraftOutput {
  title: string;              // Max 120 chars; concise summary of visible condition
  observation: string;        // Objective description of visible evidence only
  category: InspectionCategory; // Must match one of 8 approved categories
  visibleEvidence: string[];  // 1-8 concrete visible physical items
  uncertainties: string[];    // Items that cannot be determined from the photo
  inspectorFollowUp: string[];// Recommended follow-up actions for the human inspector
  aiDisclaimer: string;       // Constant: "AI_DRAFT_REQUIRES_HUMAN_REVIEW"
}
```

### 5.2 Approved Categories
- `structural`
- `electrical`
- `plumbing`
- `hvac`
- `fire_safety`
- `general`
- `environmental`
- `finishes`

### 5.3 Validation Rules
- Required fields must exist and match expected types.
- Strings must have bounded lengths; arrays must have bounded item counts.
- Malformed, incomplete, or JSON-parse-failing responses must trigger a controlled error state. Never silently cast malformed output into valid domain records.

---

## 6. Safety Boundaries & Human Oversight

1. **Mandatory Draft Mode:** AI-generated records are stamped with `reviewStatus: "draft_generated"` and `aiAssisted: true`.
2. **Strict Prohibitions:** The AI prompt and system instructions strictly forbid the model from:
   - Certifying building code, regulatory, or OSHA compliance.
   - Declaring a site, structure, or equipment "safe" or "unsafe".
   - Estimating physical dimensions, structural load capacities, or material grades.
   - Inferring hidden, concealed, or non-visible defects.
   - Modifying review statuses or bypassing human sign-off.
3. **Inspector Control:** An authenticated human inspector must review, edit, and explicitly sign off (`approved` or `rejected`) on every inspection record.

---

## 7. Quota Management & Cooldowns

- **Free-Tier Limits:** Gemini Developer API free tier provides 15 RPM (requests per minute) and 1,500 RPD (requests per day) at $0 cost on the Spark plan.
- **Throttling Handling:** When `429 Too Many Requests` or quota errors occur:
  1. The error is intercepted gracefully.
  2. A user-friendly cooldown banner is displayed with the remaining retry window (respecting `Retry-After` if present).
  3. The local draft and attached photos are preserved intact in IndexedDB.
  4. The inspector can continue authoring manually without interruption.
- **Zero Billing Rule:** Under no circumstances will billing be upgraded or paid services enabled to bypass rate limits.

---

## 8. Hardware Compatibility & Verification Standards

- **Standard Platform Target:** Google Chrome Desktop version 139 or higher on Windows, macOS, or Linux.
- **Chrome Prerequisites:**
  - `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` set to **Enabled**.
  - `chrome://flags/#optimization-guide-on-device-model` set to **Enabled BypassPerfRequirement**.
- **Hardware Independence:** ForeSite is architected for standard compliant systems and is **not** designed around the specific hardware or disk constraints of any developer's personal computer.
- **Verification Integrity:** Never claim Gemini Nano 4 on-device inference has been verified on a device or platform unless an actual live test confirms execution.
