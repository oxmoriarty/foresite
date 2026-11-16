/**
 * ForeSite Safe Environment Configuration
 * Provides type-safe access to environment variables without crashing if undefined.
 */

export interface AppConfig {
  appName: string;
  appEnv: "development" | "production" | "test";
  appVersion: string;
  isFirebaseConfigured: boolean;
  firebase: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
  };
}

const env = import.meta.env;

export const config: AppConfig = {
  appName: env.VITE_APP_NAME || "ForeSite",
  appEnv: (env.VITE_APP_ENV as AppConfig["appEnv"]) || "development",
  appVersion: env.VITE_APP_VERSION || "0.1.0",
  isFirebaseConfigured: Boolean(
    env.VITE_FIREBASE_API_KEY &&
      !env.VITE_FIREBASE_API_KEY.includes("placeholder") &&
      env.VITE_FIREBASE_PROJECT_ID
  ),
  firebase: {
    apiKey: env.VITE_FIREBASE_API_KEY || "",
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "",
    projectId: env.VITE_FIREBASE_PROJECT_ID || "",
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
    appId: env.VITE_FIREBASE_APP_ID || "",
  },
};
