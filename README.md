# ForeSite — Chrome-First AI-Assisted Site Inspection Workspace

ForeSite is a professional construction site inspection and observation workspace developed for the **BuildHybridAI 2026 Hackathon**.

It provides a Chrome-first, hybrid on-device and cloud generative AI experience that helps construction inspectors and supervisors turn field photographs and notes into structured inspection observation drafts—keeping original photo evidence local by default while enforcing mandatory human-in-the-loop review.

---

## Current Status: Phase 3 (Local Evidence & IndexedDB Management Complete)

- [x] **Phase 0: Technical Verification & Discovery** (Approved - CONDITIONAL GO)
- [x] **Phase 1: Application Scaffolding & Foundation** (Completed)
- [x] **Phase 2: Firebase Foundation & Authentication** (Completed)
- [x] **Phase 3: Local Evidence & IndexedDB Management** (Completed)
- [ ] **Phase 4: Hybrid AI Logic Integration** (Pending Approval)
- [ ] **Phase 5: Human Review & Cloud Synchronization** (Pending)
- [ ] **Phase 6: Production Hardening & Video Demo** (Pending)

---

## Key Invariants & Architectural Rules

1. **Human-in-the-Loop Approval:** AI generates preliminary observation drafts only. A qualified human must review, edit, and approve or reject every record. ForeSite never certifies regulatory or structural compliance autonomously.
2. **Local Evidence Retention:** Original high-resolution photograph binary Blobs remain stored locally on the client device (IndexedDB) by default. Only structured inspection metadata syncs to the cloud.
3. **Zero-Billing / No-Cost Policy:** Built entirely on the **Firebase Spark Plan** ($0/month, no credit card, no billing account attached) with hard usage caps that eliminate unexpected costs.
4. **Owner-Scoped Multi-Tenancy:** Firestore paths are isolated under `/users/{uid}/...` with deny-by-default security rules and immutable `ownerUid` validation.
5. **Verified Inference Source:** Displays `ON_DEVICE` (Gemini Nano) vs `IN_CLOUD` (Gemini Flash) strictly when verified by SDK metadata; displays `UNKNOWN` otherwise.

---

## Directory Structure

```
ForeSite/
├── .gitignore
├── .env.example                     # Client environment template
├── firestore.rules                  # Hardened owner-scoped deny-by-default rules
├── firebase.json                    # Firestore rules & Hosting rewrites config
├── package.json                     # Project scripts and dependencies
├── tsconfig.json                    # Strict TypeScript configuration
├── vite.config.ts                   # Vite bundler & Vitest configuration
├── tailwind.config.js               # Construction-themed design system
├── postcss.config.js
├── eslint.config.js                 # Strict ESLint configuration
├── index.html
├── public/                          # Static assets and favicon
├── docs/
│   ├── INDEXEDDB_ARCHITECTURE.md    # Schema, versioning, quota & photo validation spec
│   ├── FIREBASE_SETUP.md            # Step-by-step console setup & security deployment
│   ├── 00_PRODUCT_BRIEF.md
│   ├── 01_HACKATHON_REQUIREMENTS.md
│   ├── 02_ARCHITECTURE.md
│   ├── 03_HYBRID_AI_SPEC.md
│   ├── 04_DATA_SECURITY_PRIVACY.md
│   ├── BUILD_PLAN.md
│   ├── DECISIONS.md
│   └── NO_COST_POLICY.md
├── src/
│   ├── main.tsx                     # Application entry point
│   ├── App.tsx                      # Root component, state coordinator, IndexedDB/Firestore sync
│   ├── index.css                    # Tailwind directives & focus styles
│   ├── types/
│   │   └── index.ts                 # Domain models (LocalEvidencePhoto, LocalDraftInspection, Project, etc.)
│   ├── config/
│   │   └── env.ts                   # Type-safe environment configuration helper
│   ├── lib/
│   │   └── firebase.ts              # Modular Firebase client SDK & App Check initialization
│   ├── context/
│   │   └── AuthContext.tsx          # Full auth lifecycle (login, register, reset, verification)
│   ├── services/
│   │   ├── firestore.ts             # Path-isolated owner-scoped CRUD operations
│   │   ├── indexeddb.ts             # Versioned IndexedDB repository for Blobs, drafts & local cache
│   │   └── photoValidation.ts       # MIME format, 10MB limit & object URL lifecycle
│   ├── components/
│   │   ├── auth/
│   │   │   └── AuthModal.tsx        # Tabbed modal: Sign In, Register, Password Reset
│   │   ├── evidence/
│   │   │   └── PhotoEvidenceManager.tsx # Local photo intake, validation, preview & delete
│   │   ├── inspection/
│   │   │   └── InspectionEditorModal.tsx# Manual inspection editor with debounced draft auto-save
│   │   ├── layout/
│   │   │   ├── Header.tsx           # Branding, storage status, auth buttons & inspector avatar
│   │   │   ├── Navigation.tsx       # Primary navigation tabs with badge counters
│   │   │   └── Footer.tsx           # Hackathon attribution, license, no-cost guarantee
│   │   └── ui/
│   │       ├── Button.tsx           # Accessible polymorphic button (variants/sizes/loading)
│   │       ├── Badge.tsx            # Status, inference source, and category badges
│   │       ├── Card.tsx             # Surface card, header, body, footer
│   │       ├── Modal.tsx            # Accessible dialog with ESC handler & focus management
│   │       ├── EmptyState.tsx       # Standardized empty states with action button
│   │       └── DisclaimerBanner.tsx # Prominent mandatory human review disclosure
│   └── screens/
│       ├── OverviewScreen.tsx       # Metric cards, pending review queue, recent observations
│       ├── ProjectsScreen.tsx       # Project catalog, creation, editing, and cascade deletion
│       ├── InspectionsScreen.tsx    # Inspection cards, review status filters, local drafts recovery
│       └── SettingsScreen.tsx       # Real-time storage quota, persistence status & zero-cost rules
├── tests/
│   ├── setup.ts                     # Jest-DOM matchers & unified Blob/IndexedDB setup
│   ├── navigation.test.tsx          # Screen routing and view navigation tests
│   ├── domain-types.test.ts         # Domain models and status contracts tests
│   ├── components.test.tsx          # Button, Badge, Modal, EmptyState component tests
│   ├── auth.test.tsx                # Authentication modal, tabs, and form validation tests
│   ├── firestore-rules.test.ts      # Owner isolation, cross-user denial, and syntax tests
│   ├── indexeddb.test.ts            # Database initialization, Blob CRUD, drafts, cascade deletion
│   ├── photo-validation.test.ts     # JPEG/PNG/WebP validation, 10MB limit, preview URL tests
│   └── inspection-workflows.test.tsx# Full manual project/inspection creation and draft recovery
└── ForeSite_Antigravity_Starter_Pack/ # Reference-only starter pack (Read-Only)
```

---

## Local Evidence & IndexedDB Architecture

ForeSite keeps high-resolution evidence photographs stored directly inside the browser's local **IndexedDB** database (`ForeSiteEvidenceDB`, Version 1). Photo binaries are never transmitted to Cloud Firestore.

- **Photo Evidence Store (`evidencePhotos`):** Stores raw image Blobs indexed by `inspectionId` and `projectId`.
- **Local Drafts Store (`localInspections`):** Preserves unfinished inspection notes and observations with debounced auto-saving.
- **Photo Constraints:** Validates JPEG, PNG, and WebP files up to 10 MB per photo.
- **Disclosure:** Explicit warnings highlight that clearing browser site data will permanently remove local evidence.

For detailed documentation, see [docs/INDEXEDDB_ARCHITECTURE.md](file:///c:/Users/Engr%20sam/Documents/Dev/ForeSite/docs/INDEXEDDB_ARCHITECTURE.md).

---

## Development & Verification Scripts

```bash
# Install dependencies
npm install

# Start local development server (http://localhost:3000)
npm run dev

# Run all automated tests (58 tests across 8 suites)
npm test

# Run strict TypeScript typecheck
npm run typecheck

# Run ESLint check
npm run lint

# Build production bundle
npm run build

# Preview production build locally
npm run preview
```

---

## Technology Stack

- **Framework:** React 18, Vite 6
- **Local Storage:** Native IndexedDB (Version 1: `ForeSiteEvidenceDB` for Blobs & Drafts)
- **Backend / Identity:** Firebase Web SDK 11 (Authentication, Cloud Firestore, App Check)
- **Language:** TypeScript 5.7 (Strict Mode)
- **Styling:** Tailwind CSS 3.4 (Slate & Safety Orange brand palette)
- **Icons:** Lucide React
- **Testing:** Vitest 3.0, Testing Library React, JSDOM, Fake-IndexedDB (58 automated tests)
- **Target Platform:** Google Chrome Desktop (138+)
- **Billing Tier:** Firebase Spark Plan (100% Free, Zero Billing)
