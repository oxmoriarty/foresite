/**
 * ForeSite Firebase Remote Config Service
 *
 * Implements centralized parameter management, client defaults,
 * and safe non-blocking background synchronization with fallback.
 */

import {
  getRemoteConfig,
  fetchAndActivate,
  getString,
  getNumber,
  isSupported,
  RemoteConfig,
} from "firebase/remote-config";
import { app, hasValidConfig } from "../lib/firebase";

export interface ForeSiteRemoteConfigValues {
  cloudFallbackModel: string;
  maxAiPayloadBytes: number;
  enableExperimentalCategories: boolean;
  siteAnnouncement: string;
  aiTemperature: number;
}

export const REMOTE_CONFIG_DEFAULTS: Record<string, string | number | boolean> = {
  cloud_fallback_model: "gemini-3.5-flash-lite",
  max_ai_payload_bytes: 4 * 1024 * 1024,
  enable_experimental_categories: false,
  site_announcement: "",
  ai_temperature: 0.2,
};

let remoteConfigInstance: RemoteConfig | null = null;
let isInitialized = false;

export async function initRemoteConfig(): Promise<RemoteConfig | null> {
  if (remoteConfigInstance) return remoteConfigInstance;

  try {
    const supported = await isSupported();
    if (!supported || typeof window === "undefined" || !hasValidConfig) {
      return null;
    }

    const rc = getRemoteConfig(app);
    rc.defaultConfig = REMOTE_CONFIG_DEFAULTS;
    rc.settings = {
      minimumFetchIntervalMillis: 3600000,
      fetchTimeoutMillis: 10000,
    };

    if (typeof window !== "undefined" && window.location?.hostname === "localhost") {
      rc.settings.minimumFetchIntervalMillis = 60000;
    }

    fetchAndActivate(rc)
      .then((activated) => {
        if (activated) {
          console.log("[ForeSite Remote Config] Fetched and activated latest server parameters.");
        }
      })
      .catch((err) => {
        console.warn("[ForeSite Remote Config] Background fetch failed (using local defaults):", err);
      });

    remoteConfigInstance = rc;
    isInitialized = true;
    return rc;
  } catch (err) {
    console.warn("[ForeSite Remote Config] Initialization failed (using local defaults):", err);
    return null;
  }
}

export function getRemoteCloudFallbackModel(): string {
  if (remoteConfigInstance && isInitialized) {
    try {
      const val = getString(remoteConfigInstance, "cloud_fallback_model");
      if (val && val.trim().length > 0) return val.trim();
    } catch {
      // fallback
    }
  }
  return String(REMOTE_CONFIG_DEFAULTS.cloud_fallback_model);
}

export function getRemoteMaxAiPayloadBytes(): number {
  if (remoteConfigInstance && isInitialized) {
    try {
      const val = getNumber(remoteConfigInstance, "max_ai_payload_bytes");
      if (val && val > 0) return val;
    } catch {
      // fallback
    }
  }
  return Number(REMOTE_CONFIG_DEFAULTS.max_ai_payload_bytes);
}

export function getRemoteSiteAnnouncement(): string {
  if (remoteConfigInstance && isInitialized) {
    try {
      return getString(remoteConfigInstance, "site_announcement");
    } catch {
      // fallback
    }
  }
  return String(REMOTE_CONFIG_DEFAULTS.site_announcement);
}

export function getRemoteAiTemperature(): number {
  if (remoteConfigInstance && isInitialized) {
    try {
      const val = getNumber(remoteConfigInstance, "ai_temperature");
      if (typeof val === "number" && !isNaN(val)) return val;
    } catch {
      // fallback
    }
  }
  return Number(REMOTE_CONFIG_DEFAULTS.ai_temperature);
}
