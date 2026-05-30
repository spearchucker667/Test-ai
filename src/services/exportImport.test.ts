/** @fileoverview Unit tests for export/import schema validation and redaction. */

import { describe, expect, it } from "vitest";
import {
  EXPORT_SCHEMA_VERSION,
  MAX_IMPORT_JSON_BYTES,
  createExportPayload,
  validateImportJson,
} from "./exportImport";

/** Tests for export/import schema validation. */
describe("export/import schema validation", () => {
  /** Verifies that exports include version metadata and strip API keys. */
  it("creates a versioned export without API keys", () => {
    const payload = createExportPayload(
      {
        images: [{ id: "img-1", prompt: "p", image: "data:image/png;base64,abc", timestamp: 1 }],
        chats: [{ id: "chat-1", prompt: "hello", response: "world", timestamp: 2 }],
        settings: [{ id: "app-settings", value: { apiKey: "secret", theme: "dark" }, timestamp: 3 }],
      },
      "1.2.3"
    );

    expect(payload.version).toBe(EXPORT_SCHEMA_VERSION);
    expect(payload.appVersion).toBe("1.2.3");
    expect(JSON.stringify(payload)).not.toContain("secret");
    expect(payload.data.settings[0].value).not.toHaveProperty("apiKey");
  });

  /** Verifies that valid imports are summarized and unsafe fields are stripped. */
  it("summarizes valid imports and strips unsafe fields", () => {
    const json = JSON.stringify({
      version: EXPORT_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      appVersion: "1.0.0",
      data: {
        images: [{ id: "img-1", prompt: "p", image: "img", timestamp: 1, apiKey: "secret" }],
        chats: [{ id: "chat-1", prompt: "p", response: "r", timestamp: 2 }],
        settings: [{ id: "app-settings", value: { webSearch: "off", apiKey: "secret" }, timestamp: 3 }],
      },
    });

    const result = validateImportJson(json);

    expect(result.summary).toEqual({
      imagesFound: 1,
      chatsFound: 1,
      settingsFound: 1,
      conversationsFound: 0,
      skippedRecords: 0,
    });
    expect(JSON.stringify(result.payload)).not.toContain("secret");
  });

  /** Verifies rejection of oversized payloads and unexpected store shapes. */
  it("rejects oversized or unexpected import shapes", () => {
    expect(() => validateImportJson("x".repeat(MAX_IMPORT_JSON_BYTES + 1))).toThrow(/too large/i);
    expect(() =>
      validateImportJson(
        JSON.stringify({
          version: EXPORT_SCHEMA_VERSION,
          exportedAt: new Date().toISOString(),
          appVersion: "1.0.0",
          data: { apiKeys: [] },
        })
      )
    ).toThrow(/unexpected/i);
  });

  /** Verifies that a custom theme round-trips through export and import intact. */
  it("round-trips a custom theme through export and import", () => {
    const customTheme = {
      id: "custom",
      name: "My Theme",
      mode: "dark" as const,
      tokens: {
        background: "#0a0a0a",
        surface: "#141414",
        surfaceElevated: "#1e1e1e",
        border: "#2a2a2a",
        textPrimary: "#f0f0f0",
        textSecondary: "#b0b0b0",
        textMuted: "#666666",
        accent: "#ff6600",
        accentHover: "#ff8844",
        accentForeground: "#ffffff",
        success: "#3fb950",
        warning: "#d29922",
        danger: "#f85149",
        info: "#58a6ff",
        focusRing: "#ff6600",
        overlay: "rgba(0,0,0,0.7)",
        glow: "rgba(255,102,0,0.25)",
      },
    };

    const payload = createExportPayload(
      {
        settings: [
          {
            id: "app-settings",
            value: { theme: "dark", selectedThemeId: "custom", customTheme },
            timestamp: 1,
          },
        ],
      },
      "1.0.0"
    );

    const imported = validateImportJson(JSON.stringify(payload));
    const settingsValue = imported.payload.data.settings[0].value as Record<string, unknown>;
    expect(settingsValue.selectedThemeId).toBe("custom");
    expect(settingsValue.customTheme).toEqual(customTheme);
  });

  /** Verifies that malformed custom themes are sanitized to null on import. */
  it("sanitizes malformed custom themes to null", () => {
    const json = JSON.stringify({
      version: EXPORT_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      appVersion: "1.0.0",
      data: {
        settings: [
          {
            id: "app-settings",
            value: { selectedThemeId: "custom", customTheme: { id: 123, bad: true } },
            timestamp: 1,
          },
        ],
      },
    });

    const imported = validateImportJson(json);
    const settingsValue = imported.payload.data.settings[0].value as Record<string, unknown>;
    expect(settingsValue.customTheme).toBeNull();
  });

  it("skips malformed record fields and non-finite timestamps", () => {
    const json = JSON.stringify({
      version: EXPORT_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      appVersion: "1.0.0",
      data: {
        images: [
          { id: "img-valid", prompt: "p", image: "img", timestamp: 1 },
          { id: "img-nan", prompt: "p", image: "img", timestamp: NaN },
          { id: "img-bad", image: 123, timestamp: 2 },
        ],
        chats: [
          { id: "chat-valid", prompt: "p", response: "r", timestamp: 1 },
          { id: "chat-long", prompt: "x".repeat(100_001), response: "r", timestamp: 2 },
        ],
        settings: [{ id: "app-settings", value: { theme: "dark" }, timestamp: 3 }],
      },
    });

    const result = validateImportJson(json);
    expect(result.summary).toEqual({
      imagesFound: 2,
      chatsFound: 1,
      settingsFound: 1,
      conversationsFound: 0,
      skippedRecords: 2,
    });
    const repaired = result.payload.data.images.find((img) => img.id === "img-nan");
    expect(typeof repaired?.timestamp).toBe("number");
    expect(Number.isFinite(repaired?.timestamp)).toBe(true);
  });
});
