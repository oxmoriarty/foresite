import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getAutoCloudFallbackPreference,
  setAutoCloudFallbackSetting,
  clearCachedPreference,
  getPreferenceStorageKey,
  SAFE_DEFAULT_PREFERENCE,
} from "../src/services/preferences";
import * as firestore from "firebase/firestore";

// Mock Firebase client library
vi.mock("../src/lib/firebase", () => ({
  db: {},
  hasValidConfig: true,
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_db, _col, id) => ({ path: `users/${id}` })),
  getDoc: vi.fn(),
  updateDoc: vi.fn(),
}));

describe("ForeSite Preference Service & Authoritative Reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    clearCachedPreference();
  });

  it("returns SAFE_DEFAULT_PREFERENCE when no UID is provided", async () => {
    const pref = await getAutoCloudFallbackPreference();
    expect(pref).toEqual(SAFE_DEFAULT_PREFERENCE);
    expect(pref.enabled).toBe(false);
    expect(pref.source).toBe("default");
    expect(pref.syncStatus).toBe("unavailable");
  });

  it("namespaces local cache keys strictly by authenticated UID", () => {
    expect(getPreferenceStorageKey("inspector-123")).toBe(
      "foresite_pref_auto_cloud_fallback_inspector-123"
    );
    expect(getPreferenceStorageKey("inspector-456")).toBe(
      "foresite_pref_auto_cloud_fallback_inspector-456"
    );
  });

  it("reconciles when local cache and Firestore agree on enabled: true", async () => {
    const uid = "insp-agreed";
    localStorage.setItem(getPreferenceStorageKey(uid), JSON.stringify(true));

    vi.mocked(firestore.getDoc).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        preferences: { autoCloudFallback: true },
      }),
    } as unknown as firestore.DocumentSnapshot);

    const pref = await getAutoCloudFallbackPreference(uid);
    expect(pref.enabled).toBe(true);
    expect(pref.source).toBe("firestore");
    expect(pref.syncStatus).toBe("synced");
  });

  it("prioritizes Firestore OFF over local ON during initial load to protect privacy", async () => {
    const uid = "insp-privacy-guard";
    localStorage.setItem(getPreferenceStorageKey(uid), JSON.stringify(true));

    vi.mocked(firestore.getDoc).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        preferences: { autoCloudFallback: false },
      }),
    } as unknown as firestore.DocumentSnapshot);

    const pref = await getAutoCloudFallbackPreference(uid);
    expect(pref.enabled).toBe(false);
    expect(pref.source).toBe("firestore");
    expect(pref.syncStatus).toBe("synced");

    // Confirms local cache was corrected to false
    expect(localStorage.getItem(getPreferenceStorageKey(uid))).toBe("false");
  });

  it("populates local cache from Firestore when local cache is missing", async () => {
    const uid = "insp-cache-miss";

    vi.mocked(firestore.getDoc).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        preferences: { autoCloudFallback: true },
      }),
    } as unknown as firestore.DocumentSnapshot);

    const pref = await getAutoCloudFallbackPreference(uid);
    expect(pref.enabled).toBe(true);
    expect(pref.source).toBe("firestore");
    expect(pref.syncStatus).toBe("synced");
    expect(localStorage.getItem(getPreferenceStorageKey(uid))).toBe("true");
  });

  it("resolves to safe default OFF when preference field does not exist in Firestore", async () => {
    const uid = "insp-missing-field";

    vi.mocked(firestore.getDoc).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        displayName: "Inspector Without Prefs",
      }),
    } as unknown as firestore.DocumentSnapshot);

    const pref = await getAutoCloudFallbackPreference(uid);
    expect(pref.enabled).toBe(false);
    expect(pref.source).toBe("default");
    expect(pref.syncStatus).toBe("synced");
    expect(localStorage.getItem(getPreferenceStorageKey(uid))).toBe("false");
  });

  it("resolves strictly to OFF (unavailable) when Firestore cannot be read", async () => {
    const uid = "insp-offline";

    vi.mocked(firestore.getDoc).mockRejectedValueOnce(new Error("Network offline"));

    const pref = await getAutoCloudFallbackPreference(uid);
    expect(pref.enabled).toBe(false);
    expect(pref.source).toBe("default");
    expect(pref.syncStatus).toBe("unavailable");
  });

  it("synchronizes user setting update to Firestore using dot notation", async () => {
    const uid = "insp-sync-success";
    vi.mocked(firestore.updateDoc).mockResolvedValueOnce(undefined);

    const pref = await setAutoCloudFallbackSetting(uid, true);
    expect(pref.enabled).toBe(true);
    expect(pref.source).toBe("firestore");
    expect(pref.syncStatus).toBe("synced");

    expect(firestore.updateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: "users/insp-sync-success" }),
      { "preferences.autoCloudFallback": true }
    );
    expect(localStorage.getItem(getPreferenceStorageKey(uid))).toBe("true");
  });

  it("marks deliberate local toggle as failed sync if Firestore write fails", async () => {
    const uid = "insp-sync-fail";
    vi.mocked(firestore.updateDoc).mockRejectedValueOnce(new Error("Firestore write timeout"));

    const pref = await setAutoCloudFallbackSetting(uid, true);
    expect(pref.enabled).toBe(true);
    expect(pref.source).toBe("local");
    expect(pref.syncStatus).toBe("failed");
    expect(localStorage.getItem(getPreferenceStorageKey(uid))).toBe("true");

    // In the active session, querying preference reflects deliberate local change
    const activePref = await getAutoCloudFallbackPreference(uid);
    expect(activePref.enabled).toBe(true);
    expect(activePref.source).toBe("local");
    expect(activePref.syncStatus).toBe("failed");
  });

  it("enforces UID isolation between different inspectors", async () => {
    const userA = "inspector-alpha";
    const userB = "inspector-beta";

    vi.mocked(firestore.updateDoc).mockResolvedValue(undefined);

    // Inspector A turns setting ON
    await setAutoCloudFallbackSetting(userA, true);

    // Inspector B defaults to OFF
    vi.mocked(firestore.getDoc).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ preferences: { autoCloudFallback: false } }),
    } as unknown as firestore.DocumentSnapshot);

    const prefB = await getAutoCloudFallbackPreference(userB);
    expect(prefB.enabled).toBe(false);
    expect(localStorage.getItem(getPreferenceStorageKey(userA))).toBe("true");
    expect(localStorage.getItem(getPreferenceStorageKey(userB))).toBe("false");
  });

  it("clears cached preferences on sign-out or account switch", () => {
    const uid = "insp-logout";
    localStorage.setItem(getPreferenceStorageKey(uid), "true");

    clearCachedPreference(uid);
    expect(localStorage.getItem(getPreferenceStorageKey(uid))).toBeNull();
  });
});
