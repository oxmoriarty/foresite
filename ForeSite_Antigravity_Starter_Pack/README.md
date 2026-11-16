# ForeSite

ForeSite is a Chrome-first site-inspection workspace. It helps an inspector turn a site photograph and their own notes into a structured **draft** using Firebase AI Logic hybrid inference. A qualified human must review and approve every final inspection record.

## Start
1. Open this folder in Antigravity.
2. Read `ANTIGRAVITY_START_HERE.md` and `AGENTS.md`.
3. Run `prompts/PHASE_0_DISCOVERY.md` as a read-only task.
4. Do not implement the AI workflow until Phase 0 verifies the exact current Firebase SDK/API, image support, model path, runtime inference metadata, Chrome prerequisites, and no-billing feasibility.
5. Build one phase at a time using `docs/BUILD_PLAN.md`.

## Architecture decisions
- Chrome desktop first; Android is a later assessment.
- Firebase AI Logic is the app's runtime AI path.
- App Check, Authentication, Firestore, Remote Config, and Firebase Hosting are planned Firebase products, subject to current plan/cost verification.
- Original photos stay in IndexedDB. They are local to the browser/device and are not automatically backed up or shared.
- Firestore stores structured records and metadata, not image bytes.
- AI suggestions are not engineering, safety, or regulatory determinations.
- No billing activation, Blaze upgrade, paid services, or paid dependencies.

This is a starter pack, not a completed app. It does not claim that hybrid inference has been implemented or tested.
