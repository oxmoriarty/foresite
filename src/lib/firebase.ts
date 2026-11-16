/**
 * ForeSite Modular Firebase Client Configuration
 *
 * Adheres strictly to the Firebase Spark Plan (100% Free, zero billing):
 * - Modular tree-shakeable imports: firebase/app, firebase/auth, firebase/firestore, firebase/app-check
 * - Non-blocking App Check initialization with debug provider support
 * - Safe fallback for offline development, preview, and testing
 */

import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  CustomProvider,
  AppCheck,
} from "firebase/app-check";
import { config } from "../config/env";

let app: FirebaseApp;
let appCheck: AppCheck | null = null;

// Determine if we have valid Firebase credentials
const hasValidConfig = config.isFirebaseConfigured;

// Standard Firebase initialization
if (!getApps().length) {
  if (hasValidConfig) {
    app = initializeApp(config.firebase);
  } else {
    // Safe placeholder initialization for local testing and initial scaffolding
    app = initializeApp(
      {
        apiKey: "AIzaSyFakeKeyForeSitePreview00000000000",
        authDomain: "foresite-preview.firebaseapp.com",
        projectId: "foresite-preview",
        storageBucket: "foresite-preview.appspot.com",
        messagingSenderId: "000000000000",
        appId: "1:000000000000:web:foresitepreviewdummy",
      },
      "foreSiteApp"
    );
  }
} else {
  app = getApp("foreSiteApp") || getApp();
}

const auth: Auth = getAuth(app);
const db: Firestore = getFirestore(app);

// Initialize Firebase App Check safely (Client browser only)
if (typeof window !== "undefined" && hasValidConfig) {
  try {
    const isDev = config.appEnv === "development" || window.location.hostname === "localhost";
    
    if (isDev && config.appCheck.debugToken) {
      // In development, configure debug token
      // Note: Never hardcode or commit actual debug tokens into source control
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).FIREBASE_APPCHECK_DEBUG_TOKEN = config.appCheck.debugToken;
    }

    if (config.appCheck.siteKey) {
      // Production: reCAPTCHA Enterprise
      appCheck = initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(config.appCheck.siteKey),
        isTokenAutoRefreshEnabled: true,
      });
    } else if (isDev && config.appCheck.debugToken) {
      // Local development with custom debug provider
      appCheck = initializeAppCheck(app, {
        provider: new CustomProvider({
          getToken: () => {
            return Promise.resolve({
              token: config.appCheck.debugToken || "DEV_DEBUG_TOKEN_FORESITE",
              expireTimeMillis: Date.now() + 3600 * 1000,
            });
          },
        }),
        isTokenAutoRefreshEnabled: true,
      });
    }
  } catch (error) {
    // App Check failure should never crash local development or offline inspection workflows
    console.warn("[ForeSite App Check] Optional App Check initialization skipped:", error);
  }
}

export { app, auth, db, appCheck, hasValidConfig };
