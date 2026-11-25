import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  REMOTE_CONFIG_DEFAULTS,
  getRemoteCloudFallbackModel,
  getRemoteMaxAiPayloadBytes,
  getRemoteSiteAnnouncement,
  getRemoteAiTemperature,
  initRemoteConfig,
} from "../src/services/remoteConfig";

describe("ForeSite Firebase Remote Config Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports sensible default parameters for all remote config keys", () => {
    expect(REMOTE_CONFIG_DEFAULTS.cloud_fallback_model).toBe("gemini-3.5-flash-lite");
    expect(REMOTE_CONFIG_DEFAULTS.max_ai_payload_bytes).toBe(4 * 1024 * 1024);
    expect(REMOTE_CONFIG_DEFAULTS.enable_experimental_categories).toBe(false);
    expect(REMOTE_CONFIG_DEFAULTS.site_announcement).toBe("");
    expect(REMOTE_CONFIG_DEFAULTS.ai_temperature).toBe(0.2);
  });

  it("returns defaults when remote config instance is not initialized", () => {
    expect(getRemoteCloudFallbackModel()).toBe("gemini-3.5-flash-lite");
    expect(getRemoteMaxAiPayloadBytes()).toBe(4194304);
    expect(getRemoteSiteAnnouncement()).toBe("");
    expect(getRemoteAiTemperature()).toBe(0.2);
  });

  it("safely handles initRemoteConfig in test environment without throwing", async () => {
    const result = await initRemoteConfig();
    // In headless test environments without full indexedDB support, safely resolves without error
    expect(result === null || typeof result === "object").toBe(true);
  });
});
