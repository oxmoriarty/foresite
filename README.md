# ForeSite — Chrome-First AI-Assisted Site Inspection Workspace

ForeSite is a professional construction site inspection and observation workspace developed for the **BuildHybridAI 2026 Hackathon**.

It provides a Chrome-first, hybrid on-device and cloud generative AI experience that helps construction inspectors and supervisors turn field photographs and notes into structured inspection observation drafts—keeping original photo evidence local by default while enforcing mandatory human-in-the-loop review.

---

## Current Status: Phase 1 (Application Scaffolding Complete)

- [x] **Phase 0: Technical Verification & Discovery** (Approved - CONDITIONAL GO)
- [x] **Phase 1: Application Scaffolding & Foundation** (Completed)
- [ ] **Phase 2: Firebase Foundation & Security Rules** (Pending Approval)
- [ ] **Phase 3: Local Evidence & IndexedDB Management** (Pending)
- [ ] **Phase 4: Hybrid AI Logic Integration** (Pending)
- [ ] **Phase 5: Human Review & Cloud Synchronization** (Pending)
- [ ] **Phase 6: Production Hardening & Video Demo** (Pending)

---

## Key Invariants & Architectural Rules

1. **Human-in-the-Loop Approval:** AI generates preliminary observation drafts only. A qualified human must review, edit, and approve or reject every record. ForeSite never certifies regulatory or structural compliance autonomously.
2. **Local Evidence Retention:** Original high-resolution photograph binary Blobs remain stored locally on the client device (IndexedDB) by default. Only structured inspection metadata syncs to the cloud.
3. **Zero-Billing / No-Cost Policy:** Built entirely on the **Firebase Spark Plan** ($0/month, no credit card, no billing account attached) with hard usage caps that eliminate unexpected costs.
4. **Verified Inference Source:** Displays `ON_DEVICE` (Gemini Nano) vs `IN_CLOUD` (Gemini Flash) strictly when verified by SDK metadata; displays `UNKNOWN` otherwise.

---

## Directory Structure

```
ForeSite/
├── .gitignore
├── .env.example                     # Client environment template
├── package.json                     # Project scripts and dependencies
├── tsconfig.json                    # Strict TypeScript configuration
├── vite.config.ts                   # Vite bundler & Vitest configuration
├── tailwind.config.js               # Construction-themed design system
├── postcss.config.js
├── eslint.config.js                 # Strict ESLint configuration
├── index.html
├── public/                          # Static assets and favicon
├── src/
│   ├── main.tsx                     # Application entry point
│   ├── App.tsx                      # Root application component & state coordinator
│   ├── index.css                    # Tailwind directives & focus styles
│   ├── types/
│   │   └── index.ts                 # Domain models (Project, Inspection, ReviewStatus, etc.)
│   ├── config/
│   │   └── env.ts                   # Type-safe environment configuration helper
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.tsx           # Branding, storage status, user placeholder
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
│       ├── ProjectsScreen.tsx       # Project catalog, parcel tags, project creation modal
│       ├── InspectionsScreen.tsx    # Inspection cards, review status filters, detail/review modal
│       └── SettingsScreen.tsx       # Local storage policy, Chrome AI flags, zero-cost rules
├── tests/
│   ├── setup.ts                     # Jest-DOM matchers setup
│   ├── navigation.test.tsx          # Screen routing and view navigation tests
│   ├── domain-types.test.ts         # Domain models and status contracts tests
│   └── components.test.tsx          # Button, Badge, Modal, EmptyState component tests
└── ForeSite_Antigravity_Starter_Pack/ # Reference-only starter pack (Read-Only)
```

---

## Development & Testing Scripts

```bash
# Install dependencies
npm install

# Start local development server (http://localhost:3000)
npm run dev

# Run unit and integration tests
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
- **Language:** TypeScript 5.7 (Strict Mode)
- **Styling:** Tailwind CSS 3.4 (Slate & Safety Orange brand palette)
- **Icons:** Lucide React
- **Testing:** Vitest 3.0, Testing Library React, JSDOM
- **Target Platform:** Google Chrome Desktop (138+)
