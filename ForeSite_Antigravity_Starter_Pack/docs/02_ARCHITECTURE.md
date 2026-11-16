# Architecture

Chrome: React + Vite + TypeScript UI; Firebase Authentication; Firebase App Check; Firebase AI Logic Hybrid Inference SDK; IndexedDB for original photo Blobs and local drafts; Cloud Firestore for structured project/inspection data; Remote Config for non-sensitive feature settings if useful; Firebase Hosting for the static build if compatible with the selected no-billing plan.

Photos remain local in the browser/device. IndexedDB is not cloud backup or cross-device sync. Clearing browser data, losing the device/profile, storage eviction, or user action can make evidence unavailable. Explain this in the UI.

Firestore paths should be scoped to `/users/{uid}/...`; security rules, not client filtering, enforce ownership. Do not put service-account credentials in browser code. Do not put photo bytes/base64 in Firestore.

Show inference source only from official SDK metadata: ON_DEVICE, IN_CLOUD, or UNKNOWN. Never infer it from speed, browser version, or network state.
