# Build plan

0. Read-only discovery: verify SDK/API/model/image support, Chrome prerequisites, fallback/source metadata, App Check, no-billing compatibility. Gate: GO/CONDITIONAL/NO-GO.
1. Scaffold: Vite + React + strict TypeScript, accessible UI shell, lint/typecheck/tests/build.
2. Firebase: Auth, App Check, Firestore client, deny-by-default rules, ownership tests.
3. Local evidence: project/inspection UI, IndexedDB photos, validation, delete, local-only disclosure.
4. Hybrid AI: documented Firebase AI Logic API, image + text prompt, schema validation, actual source metadata, error handling.
5. Human review/sync: edit/approve/reject; Firestore structured records; resilient sync.
6. Hardening/demo: tests, accessibility, privacy/cost disclosures, hosted Chrome app, public <=3 minute YouTube video, submission checklist.
7. Android: separate feasibility assessment after Chrome MVP; no assumption of direct code portability.
