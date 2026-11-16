# ForeSite agent instructions

Authority: user-approved decisions; the BuildHybridAI 2026 Devpost brief; current official Firebase documentation; installed package types/runtime; clearly labelled engineering inference. Resolve conflicts by stopping and reporting them.

- Use the name ForeSite everywhere. Do not use SiteSentry.
- TypeScript strict mode; typed modules; runtime validation for AI output.
- Firebase AI Logic must be imported and actually invoked at runtime.
- Follow the current official Firebase AI Logic Web hybrid guide. Verify exact package, version, API symbols, model config, image MIME types, fallback behavior, and inference metadata. Never guess.
- Display ON_DEVICE or IN_CLOUD only when official SDK metadata confirms the source. Otherwise display UNKNOWN.
- Browser version alone does not prove local model availability.
- AI creates drafts only. Human approval is mandatory. Never declare a site/component safe or unsafe or certify compliance.
- Store original photo Blobs in IndexedDB. Clearly disclose local-only storage and data-loss limitations. Do not store photos in Firestore.
- No billing activation, Blaze, paid APIs, paid dependencies, or unapproved Firebase products.
- Verify current pricing/plan requirements before enabling each Firebase product.
- Keep credentials and App Check debug tokens out of source control.
- Inspect before editing; implement only the approved phase; run tests, typecheck, lint, and build; report actual results without claiming unrun checks.
