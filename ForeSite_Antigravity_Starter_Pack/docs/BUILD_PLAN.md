# ForeSite — Development Build Plan

**Document Version:** 2.0.0  
**Last Updated:** November 16, 2026  
**Status:** Synchronized with Project Progress  
**Master Reference:** [`../FORESITE_MASTER_REFERENCE.md`](../FORESITE_MASTER_REFERENCE.md)

---

## Phase Status Summary

```
[Phase 0: APPROVED] ──> [Phase 1: VERIFIED] ──> [Phase 2: VERIFIED] ──> [Phase 3: VERIFIED] ──> [Phase 4: AUTHORIZED] ──> [Phase 5: PENDING] ──> [Phase 6: PENDING] ──> [Phase 7: PENDING]
```

---

## Phase Breakdown & Deliverables

### Phase 0: Technical Verification & Discovery
- **Status:** **APPROVED** (Explicitly approved across Decision Areas A through F on November 16, 2026)
- **Deliverables:** Technical verification report, zero-cost Spark plan validation, Firebase AI Logic hybrid routing verification, Chrome Prompt API requirements, App Check strategy.

### Phase 1: Application Scaffolding & Foundation
- **Status:** **IMPLEMENTED & VERIFIED** (Git commit `0bd4a7d`)
- **Deliverables:** Vite 6 + React 19 + TypeScript strict mode, Tailwind CSS design system, accessible UI shell (`Button`, `Card`, `Badge`, `Modal`, `EmptyState`, `DisclaimerBanner`), navigation shell (`OverviewScreen`, `ProjectsScreen`, `InspectionsScreen`, `ReportsScreen`, `SettingsScreen`), domain types, initial unit tests.

### Phase 2: Firebase Foundation & Authentication
- **Status:** **IMPLEMENTED & VERIFIED** (Git commit `dbac94b`)
- **Deliverables:** Firebase Web initialization, `firebase.json`, `firestore.rules` (owner-scoped subcollections with default deny), `AuthContext.tsx`, `AuthModal.tsx` (Sign In, Register, Password Reset), Firestore CRUD services, 16 automated security rules tests, 5 authentication UI tests.

### Phase 3: Local Evidence & IndexedDB Management
- **Status:** **IMPLEMENTED & VERIFIED** (Git commit `05c3b59`)
- **Deliverables:** `ForeSiteEvidenceDB` (Version 1) with `evidencePhotos`, `localInspections`, and `localProjects` object stores; `PhotoEvidenceManager` (drag-and-drop, $\le$10 MB validation, object URL revocation); `InspectionEditorModal` with dynamic checklists and 1500 ms debounced auto-save; project cascade deletion; local-only storage disclosures; storage quota monitoring; 58/58 tests passing across 8 test suites.

### Phase 4: Hybrid AI Integration
- **Status:** **AUTHORIZED BY PROJECT OWNER (Implementation NOT Started)**
- **Prerequisite:** Explicit approval of Phase 0 Hybrid AI API design (Approved).
- **Deliverables:**
  - Independent verification of exact SDK package (`firebase/ai`) and supported model identifier against current official documentation.
  - Implement `InferenceMode.PREFER_ON_DEVICE` targeting on-device Gemini Nano 4 via Chrome Prompt API.
  - Model naming compliance (Chrome manages local model; model string governs cloud fallback).
  - Implement cloud fallback for proposed model `gemini-3.5-flash-lite` (subject to official SDK verification) under approved conditions: online, user consented, free-tier quota permits.
  - Implement explicit pre-transmission user consent modal disclosing Google Cloud data-handling terms, with decline option returning to manual inspection.
  - Multimodal single-turn photo + text ingestion with client-side canvas downscaling.
  - Runtime schema validation of untrusted model output into structured inspection drafts.
  - Inference source reporting: `ON_DEVICE`, `IN_CLOUD`, `UNKNOWN` strictly from SDK metadata.
  - Quota exhaustion and throttling (429) cooldown handling.
  - Unit and integration tests covering initialization, validation, source mapping, and error handling.
  - Verification gates: typecheck, lint, automated tests, production build.

### Phase 5: Human Review & Cloud Synchronization
- **Status:** **PENDING**
- **Deliverables:** Review lifecycle state transitions (`draft_generated` $\rightarrow$ `in_review` $\rightarrow$ `approved` / `rejected`), recording reviewer UID and timestamp; Firestore synchronization of structured metadata; offline resilience and draft conflict resolution; ensuring original photo Blobs remain strictly in IndexedDB.

### Phase 6: Production Hardening & Demo Preparation
- **Status:** **PENDING**
- **Deliverables:** Comprehensive test suite audit, accessibility compliance checks, security audit (no debug tokens or secrets committed), Firebase Hosting static deployment, public $\le$3 minute YouTube demo video, submission checklist verification.

### Phase 7: Android Feasibility Assessment
- **Status:** **PENDING (Post-MVP)**
- **Deliverables:** Standalone feasibility research report assessing Firebase AI Logic Android hybrid SDK, mobile Gemini Nano 4 hardware requirements, platform-specific storage, and native UI architecture.
