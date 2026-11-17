# ForeSite — Antigravity Reference Starter Pack

**Project:** ForeSite (BuildHybridAI 2026 Hackathon)  
**Target Platform:** Desktop Google Chrome  
**Repository:** `https://github.com/oxmoriarty/foresite.git`  
**Master Specification:** [`FORESITE_MASTER_REFERENCE.md`](./FORESITE_MASTER_REFERENCE.md)

---

## About ForeSite

ForeSite is a professional, Chrome-first site inspection and observation workspace. It empowers construction inspectors to transform field photographs and observation notes into structured inspection drafts using **Firebase AI Logic hybrid inference**—preferring Chrome's on-device **Gemini Nano 4** model and falling back to cloud inference when necessary.

Original high-resolution photograph Blobs remain stored locally in client-side **IndexedDB**, while lightweight structured observation metadata syncs to **Cloud Firestore** under owner-scoped security rules.

AI outputs are strictly preliminary drafts (`draft_generated`). Mandatory human review and sign-off (`approved` / `rejected`) are required for every inspection record. ForeSite never certifies regulatory compliance or structural safety autonomously.

---

## Directory Notice

- **Starter Pack Directory (Reference Only):** `C:\Users\Engr sam\Documents\Dev\ForeSite\ForeSite_Antigravity_Starter_Pack`  
  Contains product requirements, specifications, architecture documentation, decision logs, and phase prompts. Treat as reference documentation.
- **Application Workspace:** `C:\Users\Engr sam\Documents\Dev\ForeSite`  
  The actual application workspace containing all source code, dependencies, configurations, tests, and build outputs.

---

## Project Status

- **Phase 0: Technical Verification & Discovery:** **APPROVED** by the project owner across Decision Areas A through F.
- **Phase 1: Application Scaffolding & Foundation:** **IMPLEMENTED & VERIFIED** (Git commit `0bd4a7d`).
- **Phase 2: Firebase Foundation & Authentication:** **IMPLEMENTED & VERIFIED** (Git commit `dbac94b`).
- **Phase 3: Local Evidence & IndexedDB Management:** **IMPLEMENTED & VERIFIED** (Git commit `05c3b59`, 58/58 automated tests passing).
- **Phase 4: Hybrid AI Integration:** **AUTHORIZED** by the project owner (Implementation awaits separate instruction).
- **Phase 5: Human Review & Cloud Synchronization:** **PENDING**.
- **Phase 6: Production Hardening & Demo Video:** **PENDING**.
- **Phase 7: Android Feasibility Assessment:** **PENDING** (Post-MVP).

---

## Documentation Index

- **Master Reference:** [`FORESITE_MASTER_REFERENCE.md`](./FORESITE_MASTER_REFERENCE.md) (Central entry point for all agents)
- **Agent Rules:** [`AGENTS.md`](./AGENTS.md)
- **Product Brief:** [`docs/00_PRODUCT_BRIEF.md`](./docs/00_PRODUCT_BRIEF.md)
- **Hackathon Requirements:** [`docs/01_HACKATHON_REQUIREMENTS.md`](./docs/01_HACKATHON_REQUIREMENTS.md)
- **System Architecture:** [`docs/02_ARCHITECTURE.md`](./docs/02_ARCHITECTURE.md)
- **Hybrid AI Specification:** [`docs/03_HYBRID_AI_SPEC.md`](./docs/03_HYBRID_AI_SPEC.md)
- **Data Security & Privacy:** [`docs/04_DATA_SECURITY_PRIVACY.md`](./docs/04_DATA_SECURITY_PRIVACY.md)
- **Decisions Register:** [`docs/DECISIONS.md`](./docs/DECISIONS.md)
- **Build Plan:** [`docs/BUILD_PLAN.md`](./docs/BUILD_PLAN.md)
- **No-Cost Policy:** [`docs/NO_COST_POLICY.md`](./docs/NO_COST_POLICY.md)
