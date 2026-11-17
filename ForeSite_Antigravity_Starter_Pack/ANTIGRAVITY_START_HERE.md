# ForeSite — Antigravity Setup & Master Guide

**Primary Entry Point:** Always read [`FORESITE_MASTER_REFERENCE.md`](./FORESITE_MASTER_REFERENCE.md) first before undertaking any development, review, or testing task.

---

## 1. Quick Start for Agents

1. **Read Master Specification:** Consult [`FORESITE_MASTER_REFERENCE.md`](./FORESITE_MASTER_REFERENCE.md) for the approved architecture, tech stack, constraints, and current phase status.
2. **Read Agent Rules:** Consult [`AGENTS.md`](./AGENTS.md) for behavioral rules, strict zero-cost invariants, and human-in-the-loop policies.
3. **Workspace Discipline:**
   - The application workspace is `C:\Users\Engr sam\Documents\Dev\ForeSite`.
   - This starter pack (`C:\Users\Engr sam\Documents\Dev\ForeSite\ForeSite_Antigravity_Starter_Pack`) is a **reference and documentation package only**. Do not create application code, dependencies, or build artifacts inside it.
4. **Tooling & Skills:**
   - Firebase Agent Skills: https://firebase.google.com/docs/ai-assistance/agent-skills
   - Firebase MCP tools are development-time aids; they are **not** the application's runtime AI integration.

---

## 2. Current Implementation Status

- **Phase 0 (Discovery & Technical Verification):** **APPROVED** by the project owner across Decision Areas A through F (Hybrid AI, Cloud Fallback, App Check, Quotas, Privacy Consent, Hardware Independence).
- **Phase 1 (Scaffolding & UI Foundation):** **IMPLEMENTED & VERIFIED** (Git commit `0bd4a7d`).
- **Phase 2 (Firebase Auth & Security Rules):** **IMPLEMENTED & VERIFIED** (Git commit `dbac94b`).
- **Phase 3 (Local Evidence & IndexedDB Management):** **IMPLEMENTED & VERIFIED** (Git commit `05c3b59`, 58/58 tests passing).
- **Phase 4 (Hybrid AI Integration):** **AUTHORIZED** by the project owner; NOT started during documentation tasks. Awaits separate explicit start instruction.
- **Phases 5–7:** **PENDING**.

---

## 3. Core Architectural Invariants

1. **Zero-Cost Policy:** Built 100% on the **Firebase Spark Plan** ($0/month, no credit card, no Blaze plan, no Cloud Functions, no Firebase Storage).
2. **Local-First Evidence:** Original photograph Blobs reside in client-side **IndexedDB (`ForeSiteEvidenceDB`)**. No image binaries or Base64 payloads are sent to Firestore.
3. **Runtime AI Integration:** Powered by **Firebase AI Logic Web SDK (`firebase/ai`)** with `InferenceMode.PREFER_ON_DEVICE` targeting Chrome's built-in **Gemini Nano 4** model via the Prompt API.
4. **Cloud Fallback Privacy Consent:** Cloud fallback requires explicit user consent, internet connectivity, and free-tier quota compliance. Proposed fallback model is `gemini-3.5-flash-lite` (subject to official SDK verification).
5. **Human-in-the-Loop:** AI produces preliminary drafts only (`draft_generated`). Mandatory human review and approval is required for all final records. ForeSite never certifies code compliance or safety autonomously.
