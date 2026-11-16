# Decisions

1. Chrome-first; Android later.
2. Firebase AI Logic is the only runtime AI integration.
3. Core workflow is photo + inspector text; Phase 0 must verify exact support before implementation.
4. Original photos in IndexedDB; no cloud photo backup or sharing in MVP.
5. AI output is a draft; explicit human approval required.
6. No billing activation or paid dependencies.
7. Inference source shown only from verified SDK metadata; UNKNOWN is valid.
8. Authentication, Firestore, Remote Config, and Hosting are planned only after no-billing compatibility checks.
