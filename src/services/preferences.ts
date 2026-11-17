/**
 * ForeSite Automatic Cloud Fallback Preference Service
 *
 * Implements the state-based preference contract and authoritative reconciliation:
 * - Persistent setting under Settings → AI & Privacy → Automatic cloud fallback
 * - Key namespaced by authenticated UID: foresite_pref_auto_cloud_fallback_${uid}
 * - Firestore field under /users/{uid}.preferences.autoCloudFallback
 * - Safe default: OFF (enabled: false)
 * - Strict reconciliation rules protecting inspector privacy and preventing unauthorized data transmission
 */

import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db, hasValidConfig } from "../lib/firebase";
import { CloudFallbackPreference } from "../types";

export const PREFERENCE_STORAGE_PREFIX = "foresite_pref_auto_cloud_fallback_";

// In-memory registry tracking deliberate local changes that failed cloud synchronization during an active session
const unsyncedSessionFlags = new Map<string, boolean>();

export function getPreferenceStorageKey(uid: string): string {
  return `${PREFERENCE_STORAGE_PREFIX}${uid}`;
}

export const SAFE_DEFAULT_PREFERENCE: CloudFallbackPreference = {
  enabled: false,
  source: "default",
  syncStatus: "unavailable",
};

/**
 * Reconciles and retrieves the active CloudFallbackPreference for an inspector.
 *
 * Invariants:
 * 1. An unresolved or missing preference resolves strictly to OFF (enabled: false).
 * 2. Unauthenticated sessions resolve strictly to SAFE_DEFAULT_PREFERENCE.
 * 3. If local cache and Firestore agree: { enabled, source: "firestore", syncStatus: "synced" }.
 * 4. On initial load/account switch: Firestore's OFF takes precedence over local ON.
 * 5. If Firestore cannot be read: resolves strictly to safe default OFF (syncStatus: "unavailable"),
 *    unless a deliberate local change occurred during the current session where sync failed.
 * 6. Never interpret an unreadable or invalid preference as permission for automatic cloud fallback.
 */
export async function getAutoCloudFallbackPreference(
  uid?: string
): Promise<CloudFallbackPreference> {
  if (!uid) {
    return { ...SAFE_DEFAULT_PREFERENCE };
  }

  const storageKey = getPreferenceStorageKey(uid);
  let localValue: boolean | null = null;

  // 1. Read local storage cache
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        if (typeof parsed === "boolean") {
          localValue = parsed;
        }
      }
    } catch {
      // Malformed local cache; treat as missing/invalid
      localValue = null;
    }
  }

  // If Firebase configuration is not valid / unconfigured
  if (!hasValidConfig) {
    if (localValue !== null && unsyncedSessionFlags.get(uid)) {
      return {
        enabled: localValue,
        source: "local",
        syncStatus: "failed",
      };
    }
    return {
      enabled: false,
      source: "default",
      syncStatus: "unavailable",
    };
  }

  // 2. Query Firestore for authoritative account preference
  try {
    const userDocRef = doc(db, "users", uid);
    const snap = await getDoc(userDocRef);

    if (!snap.exists()) {
      // Document does not exist in Firestore. Resolve strictly to safe default OFF.
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(storageKey, JSON.stringify(false));
      }
      return {
        enabled: false,
        source: "default",
        syncStatus: "synced",
      };
    }

    const data = snap.data();
    const remotePref = data?.preferences?.autoCloudFallback;

    if (typeof remotePref === "boolean") {
      // Case A: Deliberate local toggle during active session where sync failed
      if (localValue !== null && localValue !== remotePref && unsyncedSessionFlags.get(uid)) {
        return {
          enabled: localValue,
          source: "local",
          syncStatus: "failed",
        };
      }

      // Case B: Firestore is authoritative. Populate/update local cache.
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(storageKey, JSON.stringify(remotePref));
      }

      return {
        enabled: remotePref,
        source: "firestore",
        syncStatus: "synced",
      };
    }

    // Preference field does not exist in Firestore. Resolve strictly to safe default OFF.
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(storageKey, JSON.stringify(false));
    }
    return {
      enabled: false,
      source: "default",
      syncStatus: "synced",
    };
  } catch (err) {
    console.warn("Failed to read preference from Firestore:", err);

    // If an active session deliberate toggle occurred on this device:
    if (localValue !== null && unsyncedSessionFlags.get(uid)) {
      return {
        enabled: localValue,
        source: "local",
        syncStatus: "failed",
      };
    }

    // Rule: If Firestore cannot be read, resolve strictly to safe default OFF.
    // Never interpret an unreadable preference as permission for automatic cloud fallback.
    return {
      enabled: false,
      source: "default",
      syncStatus: "unavailable",
    };
  }
}

/**
 * Persists the Automatic Cloud Fallback setting for an inspector.
 *
 * Saves to local cache immediately and synchronizes to Cloud Firestore under
 * `/users/{uid}.preferences.autoCloudFallback`.
 *
 * Uses nested field update to preserve all other UserProfile attributes.
 */
export async function setAutoCloudFallbackSetting(
  uid: string | undefined,
  enabled: boolean
): Promise<CloudFallbackPreference> {
  if (!uid) {
    return { ...SAFE_DEFAULT_PREFERENCE };
  }

  const storageKey = getPreferenceStorageKey(uid);

  // 1. Write to local storage cache immediately
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(enabled));
    } catch (storageErr) {
      console.warn("Failed to write preference to local storage:", storageErr);
    }
  }

  // 2. If unconfigured or offline, mark as local-only failed sync
  if (!hasValidConfig) {
    unsyncedSessionFlags.set(uid, true);
    return {
      enabled,
      source: "local",
      syncStatus: "failed",
    };
  }

  // 3. Synchronize to Firestore
  try {
    const userDocRef = doc(db, "users", uid);
    await updateDoc(userDocRef, {
      "preferences.autoCloudFallback": enabled,
    });

    // Cloud sync succeeded; clear unsynced session flag
    unsyncedSessionFlags.delete(uid);

    return {
      enabled,
      source: "firestore",
      syncStatus: "synced",
    };
  } catch (syncErr) {
    console.warn("Failed to synchronize preference to Firestore:", syncErr);
    // Mark as local-only failed sync for the active session
    unsyncedSessionFlags.set(uid, true);

    return {
      enabled,
      source: "local",
      syncStatus: "failed",
    };
  }
}

/**
 * Clears local preference cache and session flags (e.g. on sign-out or account switch).
 */
export function clearCachedPreference(uid?: string): void {
  if (uid) {
    unsyncedSessionFlags.delete(uid);
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        window.localStorage.removeItem(getPreferenceStorageKey(uid));
      } catch {
        // Ignore storage errors on cleanup
      }
    }
  } else {
    unsyncedSessionFlags.clear();
  }
}
