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
});
