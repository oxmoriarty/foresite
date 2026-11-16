# Data, security, privacy

Firestore proposed types:
- Project: ownerUid, name, optional siteLabel, createdAt, updatedAt.
- Inspection: ownerUid, projectId, title, observation, category, visibleEvidence[], uncertainties[], inspectorFollowUp[], reviewStatus, aiAssisted, optional inferenceSource, createdAt, updatedAt, optional reviewedAt/reviewedByUid.

IndexedDB proposed stores:
- evidencePhotos: id, local inspection ID, Blob, MIME type, createdAt.
- localInspections: local IDs, draft payload, sync state, timestamps.

Use versioned IndexedDB schema and migration tests. Keep original images local. Store only structured records and metadata in Firestore. Provide explicit photo deletion and local-storage disclosure.

Use Firebase Auth and owner-scoped Firestore rules. Begin deny-by-default. Test cross-user access. Configure App Check using current official docs. Debug tokens are local development only; never commit, publish, or ship them. Do not log credentials or sensitive site data. Use synthetic demo data.
