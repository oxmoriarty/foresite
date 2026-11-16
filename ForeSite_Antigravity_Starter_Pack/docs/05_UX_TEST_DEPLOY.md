# UX, testing, deployment

Screens: sign-in, overview, project list/detail, inspection editor, AI draft review, inspection detail/history, settings/privacy.

Required states: empty lists, no photo, invalid/oversized image, AI unavailable, local model unavailable, cloud fallback unavailable, malformed output, Firestore offline/write failure, IndexedDB quota failure, expired session, loading, success, draft awaiting review, approved, rejected.

Accessibility: keyboard navigation, visible focus, labelled controls, status not conveyed by color alone, accessible async status.

Tests: output schema; source metadata mapping (unknown when absent); draft-only AI state; explicit approval; IndexedDB create/read/delete/migrations; file validation; Firestore ownership; AI failure/manual fallback; sync failure; App Check configuration. Test on actual target Chrome/OS/device and record environment details.

Deploy static build to Firebase Hosting only after current plan/pricing verification. No billing account or Blaze upgrade. Never commit `.env`, debug tokens, private credentials, or real site photos.
