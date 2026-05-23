/** @fileoverview Unit tests for chat and image payload builders. */

import { describe, expect, it } from "vitest";
import { buildChatPayload, normalizeImageDraft, buildImagePayload } from "./payloadBuilders";

/** Tests for the buildChatPayload helper. */
describe("buildChatPayload", () => {
  /** Verifies that a legacy boolean true is serialised to the "on" enum. */
  it("serializes web search as enum string for legacy boolean true", () => {
    const payload = buildChatPayload(
      "venice-uncensored",
      [{ role: "user", content: "hello" }],
      { webSearch: true as any }
    );
    expect((payload.venice_parameters as any).enable_web_search).toBe("on");
  });

  /** Verifies that a legacy boolean false is serialised to the "off" enum. */
  it("serializes web search as enum string for legacy boolean false", () => {
    const payload = buildChatPayload(
      "venice-uncensored",
      [{ role: "user", content: "hello" }],
      { webSearch: false as any }
    );
    expect((payload.venice_parameters as any).enable_web_search).toBe("off");
  });

  /** Verifies that invalid web search values fall back to "off". */
  it("falls back to off for invalid web search values", () => {
    const payload = buildChatPayload(
      "venice-uncensored",
      [{ role: "user", content: "hello" }],
      { webSearch: "invalid-mode" }
    );
    expect((payload.venice_parameters as any).enable_web_search).toBe("off");
  });
});

/** Tests for the normalizeImageDraft helper. */
describe("normalizeImageDraft", () => {
  /** Verifies that out-of-range dimensions are clamped to valid multiples. */
  it("clamps dimensions to nearest 64px multiple within [64, 2048]", () => {
    const result = normalizeImageDraft({
      prompt: "test",
      width: 50,
      height: 3000,
    });
    expect(result.width).toBe(64);
    expect(result.height).toBe(2048);
  });

  /** Verifies that steps are clamped to [1, 50]. */
  it("clamps steps to [1, 50]", () => {
    const low = normalizeImageDraft({ prompt: "test", steps: 0 });
    expect(low.steps).toBe(1);
    const high = normalizeImageDraft({ prompt: "test", steps: 100 });
    expect(high.steps).toBe(50);
  });

  /** Verifies that cfg is clamped to [1, 20]. */
  it("clamps cfg to [1, 20]", () => {
    const low = normalizeImageDraft({ prompt: "test", cfg: -5 });
    expect(low.cfg).toBe(1);
    const high = normalizeImageDraft({ prompt: "test", cfg: 99 });
    expect(high.cfg).toBe(20);
  });

  /** Verifies that imageCount is clamped to [1, 10]. */
  it("clamps imageCount to [1, 10]", () => {
    const low = normalizeImageDraft({ prompt: "test", imageCount: 0 });
    expect(low.imageCount).toBe(1);
    const high = normalizeImageDraft({ prompt: "test", imageCount: 50 });
    expect(high.imageCount).toBe(10);
  });

  /** Verifies that oversized prompts are truncated. */
  it("truncates prompts longer than 4000 characters", () => {
    const longPrompt = "a".repeat(5000);
    const result = normalizeImageDraft({ prompt: longPrompt });
    expect(result.prompt.length).toBe(4000);
  });

  /** Verifies that empty prompts are preserved (rejected later by UI). */
  it("trims empty prompts", () => {
    const result = normalizeImageDraft({ prompt: "   " });
    expect(result.prompt).toBe("");
  });
});

/** Tests for buildImagePayload with normalization integration. */
describe("buildImagePayload", () => {
  /** Verifies that invalid imported state is normalized before building payload. */
  it("normalizes invalid imported state before building payload", () => {
    const payload = buildImagePayload("flux-dev", {
      prompt: "test",
      width: "invalid",
      height: "",
      steps: "abc",
      cfg: null as any,
    });
    expect(payload.width).toBe(64);
    expect(payload.height).toBe(64);
    expect(payload.steps).toBe(1);
    expect(payload.cfg_scale).toBe(1);
  });
});
