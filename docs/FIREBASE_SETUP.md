# ForeSite — Firebase Foundation & Setup Guide

This document provides step-by-step instructions for establishing the Firebase backend infrastructure for **ForeSite**.

ForeSite is engineered to run exclusively under the **Firebase Spark Plan** ($0.00/month, strictly zero billing, no credit card or billing account attached).

---

## 1. Zero-Cost & Spark Plan Invariants

The following constraints are permanently enforced:
- **Billing Tier:** Firebase Spark Plan ($0.00/month free tier).
- **No Credit Card Required:** Do NOT attach a billing account or upgrade to the Blaze plan.
- **Allowed Services:**
  - **Firebase Authentication:** Up to 50,000 monthly active users (MAUs).
  - **Cloud Firestore:** 1 GiB total stored data, 50,000 reads/day, 20,000 writes/day, 20,000 deletes/day.
  - **Firebase Hosting:** 10 GB storage, 360 MB/day data transfer.
  - **Firebase App Check:** 10,000 verifications/day with reCAPTCHA Enterprise free tier.
- **Strictly Prohibited Services:**
  - Firebase Cloud Storage (requires Blaze plan or incurs risk of unexpected charges).
  - Firebase Cloud Functions / Google Cloud Functions.
  - Paid Identity Platform add-ons (multi-tenant auth, phone SMS verification).
  - Any third-party service that requires a payment method.

---

## 2. Firebase Console Setup Walkthrough

### Step 1: Create a Free Firebase Project
1. Navigate to the [Firebase Console](https://console.firebase.google.com/).
2. Click **Add project** (or **Create a project**).
3. Project Name: `fore-site-inspection` (or your chosen name).
4. Google Analytics: Optional (can be enabled or disabled; Analytics is free).
5. Click **Create project** and wait for provisioning to complete.
6. Verify billing tier: Look at the bottom left of the console—it must show **Spark plan (Free)**.

---

### Step 2: Register a Web Application
1. In the Project Overview page, click the **Web icon (`</>`)** to add a web application.
2. App nickname: `ForeSite Chrome Web App`.
3. Check the box: **Also set up Firebase Hosting for this app**.
4. Click **Register app**.
5. Copy the `firebaseConfig` object values provided in the console.

---

### Step 3: Enable Firebase Authentication
1. In the left navigation menu, go to **Build** &rarr; **Authentication**.
2. Click **Get started**.
3. Under the **Sign-in method** tab:
   - Select **Email/Password**.
   - Toggle **Enable** to ON.
   - Leave *Email link (passwordless sign-in)* disabled.
   - Click **Save**.
4. (Optional) Under **Settings** &rarr; **Authorized domains**:
   - Ensure `localhost` is listed for local development.

---

### Step 4: Provision Cloud Firestore
1. In the left navigation menu, go to **Build** &rarr; **Firestore Database**.
2. Click **Create database**.
3. Choose a database location closest to your field operations (e.g., `nam5 (us-central)`). *Note: Database location cannot be changed after creation.*
4. Select **Start in production mode** (all reads/writes are denied by default until security rules are deployed).
5. Click **Create**.

---

### Step 5: Deploy Security Rules
ForeSite enforces path-isolated, owner-scoped multi-tenancy. All inspection and project records are strictly confined to `/users/{uid}/...`.

#### Option A: Deploy via Firebase Console (Immediate)
1. In the Firebase Console, go to **Firestore Database** &rarr; **Rules** tab.
2. Replace all existing text with the exact contents of `firestore.rules` located in the ForeSite project root:

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function owns(uid) {
      return request.auth != null && request.auth.uid == uid;
    }

    // Inspector user profile record
    match /users/{uid} {
      allow read, write: if owns(uid);
    }

    // Owner-scoped project subcollection
    match /users/{uid}/projects/{id} {
      allow read: if owns(uid);
      allow create: if owns(uid) && request.resource.data.ownerUid == request.auth.uid;
      allow update: if owns(uid) && resource.data.ownerUid == request.auth.uid
        && request.resource.data.ownerUid == resource.data.ownerUid;
      allow delete: if owns(uid) && resource.data.ownerUid == request.auth.uid;
    }

    // Owner-scoped inspection subcollection
    match /users/{uid}/inspections/{id} {
      allow read: if owns(uid);
      allow create: if owns(uid) && request.resource.data.ownerUid == request.auth.uid;
      allow update: if owns(uid) && resource.data.ownerUid == request.auth.uid
        && request.resource.data.ownerUid == resource.data.ownerUid;
      allow delete: if owns(uid) && resource.data.ownerUid == request.auth.uid;
    }

    // Deny all other access by default
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```
3. Click **Publish**.

#### Option B: Deploy via Firebase CLI
If `firebase-tools` is installed on your workstation:
```bash
firebase login
firebase use <your-project-id>
firebase deploy --only firestore:rules
```

---

### Step 6: Configure Firebase App Check (Zero Cost)
App Check protects your Firestore backend from API abuse, scrapers, and unauthorized clients.

1. In the Firebase Console, go to **Build** &rarr; **App Check**.
2. Click **Get started**.
3. Under the **Apps** tab, select your Web App.
4. Provider: **reCAPTCHA Enterprise**.
5. Follow the prompt to enable the reCAPTCHA Enterprise API in Google Cloud (free tier includes 10,000 monthly assessments at zero cost).
6. Copy your **reCAPTCHA Enterprise Site Key**.
7. For local development:
   - In the App Check console, click the three-dots menu next to your Web App &rarr; **Manage debug tokens**.
   - Click **Add debug token**, give it a name (e.g. `Local Dev`), and paste your `VITE_APP_CHECK_DEBUG_TOKEN`.

---

## 3. Local Environment Configuration

1. In the ForeSite project root, copy the environment template:
   ```bash
   cp .env.example .env.local
   ```
2. Populate `.env.local` with your project credentials:
   ```env
   # Application Metadata
   VITE_APP_NAME="ForeSite"
   VITE_APP_ENV="development"
   VITE_APP_VERSION="0.1.0"

   # Firebase Client Configuration (Spark Plan - 100% Free)
   VITE_FIREBASE_API_KEY="AIzaSyYourActualApiKeyHere..."
   VITE_FIREBASE_AUTH_DOMAIN="fore-site-inspection.firebaseapp.com"
   VITE_FIREBASE_PROJECT_ID="fore-site-inspection"
   VITE_FIREBASE_STORAGE_BUCKET="fore-site-inspection.appspot.com"
   VITE_FIREBASE_MESSAGING_SENDER_ID="123456789012"
   VITE_FIREBASE_APP_ID="1:123456789012:web:abcdef12345678"

   # App Check (Optional in local development)
   VITE_APP_CHECK_DEBUG_TOKEN="your-development-debug-token"
   VITE_RECAPTCHA_ENTERPRISE_SITE_KEY=""
   ```
3. Save the file. Vite automatically loads `.env.local` upon start.
4. **Security Notice:** `.env.local` is listed in `.gitignore` and must NEVER be committed to Git.

---

## 4. Verification & Testing

Verify that your environment and rules are functioning correctly:

```bash
# 1. Typecheck the entire codebase
npm run typecheck

# 2. Run automated test suite (including auth and firestore rules tests)
npm test

# 3. Check for linting compliance
npm run lint

# 4. Build production bundle
npm run build
```

---

## 5. Security Rules Verification Matrix

| Actor | Action | Target Collection | Expected Result | Reason |
| :--- | :--- | :--- | :--- | :--- |
| Unauthenticated | Read/Write | Any | **DENIED** | `request.auth == null` |
| Inspector Alice | Read/Write | `/users/alice/projects/p1` | **ALLOWED** | `request.auth.uid == 'alice'` |
| Inspector Bob | Read/Write | `/users/alice/projects/p1` | **DENIED** | `request.auth.uid != 'alice'` |
| Inspector Alice | Create | `/users/alice/projects/p1` with `ownerUid: 'bob'` | **DENIED** | `request.resource.data.ownerUid != auth.uid` |
| Inspector Alice | Update | `/users/alice/projects/p1` modifying `ownerUid` | **DENIED** | `ownerUid` is immutable |
| Any User | Read/Write | `/admin/...` or arbitrary paths | **DENIED** | Deny-by-default wildcard match |
