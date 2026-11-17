# Phase 0: Discovery & Technical Verification

**Status:** **COMPLETED & EXPLICITLY APPROVED** (November 16, 2026)  
**Approval Record:** Approved by Project Owner across Decision Areas A through F  
**Master Reference:** [`../FORESITE_MASTER_REFERENCE.md`](../FORESITE_MASTER_REFERENCE.md)

---

## Executive Approval Notice

The Phase 0 Discovery and Technical Verification was completed as a read-only investigation. Its findings have been formally reviewed and **explicitly approved** by the project owner across the following six architectural decision areas:

1. **Decision Area A (Hybrid AI & Gemini Nano 4):** Approved implementation via Firebase AI Logic Web SDK (`firebase/ai`) with `InferenceMode.PREFER_ON_DEVICE`. Chrome Prompt API manages on-device Gemini Nano 4. Model string must never be `"gemini-nano-4"`. Multimodal photo+text supported. Exact inference source reporting (`ON_DEVICE`, `IN_CLOUD`, `UNKNOWN`).
2. **Decision Area B (Cloud Fallback):** Approved cloud fallback under 5 conditions (local unavailable, online, explicit user consent, SDK/model supports workflow, free-tier quota permits). Proposed model is `gemini-3.5-flash-lite`, subject to official SDK verification before coding. No silent model substitution.
3. **Decision Area C (Firebase App Check):** App Check enforcement remains active. Debug tokens for local dev only (never committed). Official provider in production. Never weakened.
4. **Decision Area D (Quota Management & Cooldowns):** Controlled handling of quota exhaustion and 429 throttling. User-friendly cooldown banners. Zero billing upgrades. Manual inspection remains 100% operational.
5. **Decision Area E (Privacy & Cloud Consent):** Explicit distinction between on-device and cloud processing. Mandatory pre-transmission consent dialog explaining Google Cloud data terms. Option to decline and use manual authoring.
6. **Decision Area F (Hardware Compatibility):** Architected for standard supported desktop environments (Chrome 138+); decoupled from individual developer PC limits. No claims of local inference without actual execution evidence.

---

## Original Phase 0 Prompt Scope (Preserved for Historical Reference)

READ-ONLY. Do not edit files, install packages, initialize Firebase, enable billing, or change accounts.

Read README, AGENTS.md, and all docs. Research current official Firebase docs and inspect installed environment only as needed. Report exact current Firebase AI Logic Web hybrid package/version; imports, initialization, model configuration and invocation; Gemini Nano 4 availability for the documented Chrome path; image MIME types/payload; local-first and cloud fallback settings; exact inference-source metadata; browser/OS/device/model readiness; behavior when local model/network/cloud is unavailable; App Check setup; current Spark/no-billing compatibility for AI Logic, App Check, Auth, Firestore, Remote Config, Hosting; quotas/terms/data-use constraints; feasibility of image + text on the actual target machine. Cite official URLs and exact API symbols. Mark unknowns NOT VERIFIED. End with GO / CONDITIONAL GO / NO-GO and user decisions. Do not guess or implement.
