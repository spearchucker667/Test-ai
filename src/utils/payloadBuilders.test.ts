import { describe, expect, it } from "vitest";
import { buildChatPayload } from "./payloadBuilders";

describe("buildChatPayload", () => {
  it("serializes web search as enum string for legacy boolean true", () => {
    const payload = buildChatPayload(
      "venice-uncensored",
      [{ role: "user", content: "hello" }],
      { webSearch: true as any }
    );
    expect((payload.venice_parameters as any).enable_web_search).toBe("on");
  });

  it("serializes web search as enum string for legacy boolean false", () => {
    const payload = buildChatPayload(
      "venice-uncensored",
      [{ role: "user", content: "hello" }],
      { webSearch: false as any }
    );
    expect((payload.venice_parameters as any).enable_web_search).toBe("off");
  });

  it("falls back to off for invalid web search values", () => {
    const payload = buildChatPayload(
      "venice-uncensored",
      [{ role: "user", content: "hello" }],
      { webSearch: "invalid-mode" }
    );
    expect((payload.venice_parameters as any).enable_web_search).toBe("off");
  });
});
