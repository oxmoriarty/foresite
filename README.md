# ForeSite — Hybrid AI Construction Site Inspection Workspace

**Live App:** [https://useforesite.web.app](https://useforesite.web.app)

ForeSite is a Chrome-first, hybrid on-device and cloud generative AI workspace for construction site inspections. It helps field inspectors and supervisors turn site photographs and field notes into structured observation drafts while keeping original photo evidence stored locally on the device and enforcing human-in-the-loop review before any inspection is approved.

---

## Value Proposition

Construction inspectors often work in low-connectivity environments and handle sensitive site photographs that teams do not want uploaded automatically to third-party servers. ForeSite solves this by:

1. **On-Device First AI Drafting:** Runs multimodal inspection drafting locally on-device using Chrome's built-in Gemini Nano model via Firebase AI Logic before ever touching the cloud.
2. **Consent-Gated Cloud Fallback:** Automatic cloud fallback is **off by default**. When on-device inference is unavailable, ForeSite halts network calls and prompts the inspector for explicit approval (or lets them enable automatic cloud fallback in Settings).
3. **Local Photo Retention:** High-resolution inspection photographs remain in the browser's IndexedDB database and are never uploaded to cloud storage. Only compressed, resized copies are used during approved cloud AI drafting.
4. **Offline-First Resilience & Human Review:** Supports local drafting, a durable background **Uploads** queue with conflict resolution, and a strict review lifecycle (`Draft Generated -> In Review -> Approved / Rejected`) with an audit trail.

---

## How Firebase AI Logic Is Used at Runtime

ForeSite imports and calls the Firebase AI Logic Web SDK (`firebase/ai`) at runtime in [`src/services/ai.ts`](src/services/ai.ts):

- **SDK Initialization:** Uses `getAI(app, { backend: new GoogleAIBackend() })` and `getGenerativeModel(...)`.
- **Two User-Controlled Inference Modes:**
  - **Consent-Controlled Mode (Default, Automatic Cloud Fallback OFF):** Initializes `InferenceMode.ONLY_ON_DEVICE` and awaits `initializeDeviceModel()` + `generateContent([prompt, imagePart])`. If on-device AI is unavailable, it halts and opens `CloudConsentModal`. Only if the inspector approves does it dispatch a single `InferenceMode.ONLY_IN_CLOUD` request.
  - **Automatic Cloud Fallback Mode (Optional, Setting ON):** Initializes `InferenceMode.PREFER_ON_DEVICE` with both `onDeviceParams` and `inCloudParams` (`gemini-3.5-flash-lite` by default, configurable via Firebase Remote Config).
- **Verified Inference Attribution:** Inspects `result.response.inferenceSource` and tags drafts as `ON_DEVICE`, `IN_CLOUD`, or `UNKNOWN`.
- **Interactive Demo Studio (`/demo`):** Lets judges and visitors test multimodal Firebase AI Logic live on sample site scenarios without signing in.

---

## Core Features

- **Dashboard (`/dashboard`) & Overview:** Live metrics for active projects, total inspections, pending reviews, and AI drafts, with Grid and List views.
- **Projects & Inspections (`/project`, `/inspection`):** Create, edit, filter, and cascade-delete projects; capture manual or AI-assisted inspections with local JPEG/PNG/WebP photos; archive or restore records.
- **Human Review Lifecycle & Audit History:** Enforced state machine (`draft_generated`, `in_review`, `approved`, `rejected`) with reviewer attribution and comments.
- **Uploads Queue (`/uploads`):** Durable mutation queue with retry tracking, side-by-side conflict resolution, and diagnostic export.
- **Settings (`/settings`):** Persistent `Automatic cloud fallback` toggle synced per user, local IndexedDB storage usage summary, and local data cleanup.
- **Security & Access Control:** Firebase Authentication with mandatory email verification, owner-scoped Cloud Firestore security rules (`firestore.rules`), Firebase App Check, and Firebase Remote Config.

---

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite 6, Tailwind CSS, Lucide React
- **AI:** Firebase AI Logic (`firebase/ai` — On-Device Gemini Nano & Cloud Gemini `gemini-3.5-flash-lite`)
- **Backend & Security:** Firebase Authentication, Cloud Firestore, Firebase App Check, Firebase Remote Config, Firebase Hosting
- **Local Storage:** IndexedDB (`ForeSiteEvidenceDB` for photo Blobs, local drafts, and upload queue)
- **Testing:** Vitest, Testing Library, JSDOM, `fake-indexeddb` (335 automated tests across 25 suites)

---

## Getting Started Locally

### Prerequisites

- Node.js 20+ and npm
- A Firebase project with Authentication (Email/Password), Cloud Firestore, Firebase AI Logic, Remote Config, and App Check enabled

### 1. Clone and Install

```bash
git clone https://github.com/oxmoriarty/foresite.git
cd foresite
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env.local` and fill in your Firebase web app credentials:

```bash
cp .env.example .env.local
```

Required variables in `.env.local`:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID` (optional)
- `VITE_FIREBASE_APP_CHECK_SITE_KEY` (optional, for reCAPTCHA App Check)

### 3. Run Locally

```bash
npm run dev
```

Open `http://localhost:3000` in Google Chrome.

### 4. Run Tests, Typecheck, and Production Build

```bash
npm test       # Runs all 335 unit and integration tests
npm run typecheck
npm run lint
npm run build  # Outputs production bundle to dist/
```

---

## License

Licensed under the [Apache License, Version 2.0](LICENSE).
