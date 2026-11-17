# ForeSite — Data Security & Privacy Specification

**Document Version:** 2.0.0  
**Last Updated:** November 16, 2026  
**Status:** Approved & Synchronized with Phase 0 Decisions  
**Master Reference:** [`../FORESITE_MASTER_REFERENCE.md`](../FORESITE_MASTER_REFERENCE.md)

---

## 1. Data Classification and Boundaries

ForeSite enforces a strict physical separation between photographic evidence and cloud-synchronized metadata:

| Data Type | Storage Location | Sensitivity | Cloud Transmission Policy |
| :--- | :--- | :--- | :--- |
| **Original Photos (Blobs)** | Local IndexedDB (`evidencePhotos`) | High (Site confidentiality) | **Never uploaded to database storage.** Transmitted to Google Cloud for AI inference **only** if on-device model is unavailable AND user provides explicit affirmative consent. |
| **Inspection Drafts** | Local IndexedDB (`localInspections`) | Medium | Kept private on local client until explicitly submitted. |
| **Structured Records** | Cloud Firestore (`/users/{uid}/...`) | Low–Medium | Synchronized over TLS with owner-scoped security rules; contains zero binary data. |
| **Auth Credentials** | Firebase Authentication | High | Handled via Firebase Auth SDK; passwords never stored or logged in plain text. |
| **App Check Tokens** | Client Memory / HTTP Headers | Sensitive | Local debug tokens injected via `.env.local`; never committed to source control. |

---

## 2. Cloud Processing Privacy & User Consent

In accordance with approved **Decision Area E**, ForeSite treats the transmission of site evidence to cloud AI services as an explicit privacy event:

### 2.1 On-Device vs. Cloud Separation
- **On-Device (Gemini Nano 4):** Execution takes place locally in Chrome. Photographs and notes remain on the local machine and are never transmitted over the network for inference.
- **Cloud Fallback (Google Cloud / Gemini Developer API):** Involves transmitting downscaled photograph data and inspector notes to Google's backend servers.

### 2.2 Mandatory Explicit Consent Gate
- Prior to sending any evidence to Google Cloud for fallback inference, ForeSite displays an explicit consent dialog:
  > **Cloud AI Processing Consent**  
  > *"On-device AI processing is currently unavailable on this device. To generate an inspection draft, your photograph and observation notes can be processed via Google Cloud using the Gemini Developer API free tier. Google processes this data under its developer terms. Would you like to proceed with cloud processing or continue authoring manually?"*
- **Inspector Choices:**
  1. `Consent & Process in Cloud`: The request proceeds; inference source is displayed as `IN_CLOUD`.
  2. `Decline (Manual Authoring)`: No network request is initiated; the inspector returns to manual editing.
- **Product Requirement Notice:** This consent workflow is an approved ForeSite product and privacy requirement, not an SDK technical constraint.

---

## 3. Firestore Multi-Tenant Security Architecture

### 3.1 Owner-Scoped Path Isolation
All Firestore collections are nested under the authenticated user's UID:
- Projects: `/users/{uid}/projects/{projectId}`
- Inspections: `/users/{uid}/inspections/{inspectionId}`

### 3.2 Security Rules Specification (`firestore.rules`)
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper to verify user authentication and path ownership
    function owns(uid) { 
      return request.auth != null && request.auth.uid == uid; 
    }

    match /users/{uid}/projects/{id} {
      allow read: if owns(uid);
      allow create: if owns(uid) && request.resource.data.ownerUid == request.auth.uid;
      allow update: if owns(uid) && resource.data.ownerUid == request.auth.uid
        && request.resource.data.ownerUid == resource.data.ownerUid;
      allow delete: if owns(uid) && resource.data.ownerUid == request.auth.uid;
    }

    match /users/{uid}/inspections/{id} {
      allow read: if owns(uid);
      allow create: if owns(uid) && request.resource.data.ownerUid == request.auth.uid;
      allow update: if owns(uid) && resource.data.ownerUid == request.auth.uid
        && request.resource.data.ownerUid == resource.data.ownerUid;
      allow delete: if owns(uid) && resource.data.ownerUid == request.auth.uid;
    }

    // Default deny-all catch-all rule
    match /{document=**} { 
      allow read, write: if false; 
    }
  }
}
```

### 3.3 Security Invariants
- **Default Deny:** The root catch-all rule blocks all unauthorized read/write access.
- **Immutability of Ownership:** The condition `request.resource.data.ownerUid == resource.data.ownerUid` prevents users from changing the document owner or transferring data across tenants.
- **Zero Binary Blobs in Firestore:** Security rules and schema tests ensure that inspection documents store only lightweight metadata (~2 KB/record). Storing image bytes or Base64 payloads in Firestore is strictly forbidden.

---

## 4. Firebase App Check Attestation

In accordance with approved **Decision Area C**:
- **Purpose:** Protects Cloud Firestore and backend APIs from automated scraping, unauthorized clients, and API key abuse.
- **Local Development:** Uses `CustomProvider` or `FIREBASE_APPCHECK_DEBUG_TOKEN`. Debug tokens must **never** be checked into Git, committed to `.env.example`, or included in production builds.
- **Production:** Configured with an officially supported provider (such as `ReCaptchaEnterpriseProvider`).
- **Enforcement Invariant:** App Check enforcement must remain active and must **never** be weakened or disabled to circumvent implementation difficulties.

---

## 5. Local Evidence Storage & User Disclosures

- **IndexedDB Isolation:** Photographs are stored in `evidencePhotos` within `ForeSiteEvidenceDB` (Version 1).
- **Eviction Risk:** Browsers may evict IndexedDB storage if local disk space is low or if the user clears browser site data.
- **Mitigation:**
  - `navigator.storage.persist()` is requested upon user action to grant persistent storage status.
  - Prominent UI disclosure banner:
    > *"Local Photograph Retention: Inspection photos are stored as binary Blobs in your browser's private local IndexedDB. They are not uploaded to cloud storage or accessible from other browsers/devices. Clearing browser site data will remove local photos."*
