/** @fileoverview Unit tests for Electron IPC request validation and API key input
 *  sanitization. */

import { describe, expect, it } from "vitest";
import {
  MAX_VENICE_IPC_BODY_BYTES,
  validateApiKeyInput,
  validateVeniceIpcRequest,
} from "./validation";

/** Validates that a user-provided API key is a non-empty string within length limits. */
describe("Electron IPC validation", () => {
  /** Allows only supported Venice endpoints and methods. */
  it("allows only supported Venice endpoints and methods", () => {
    expect(
      validateVeniceIpcRequest({ endpoint: "/models?type=all", method: "GET" })
    ).toMatchObject({ endpoint: "/models?type=all", method: "GET" });

    expect(() =>
      validateVeniceIpcRequest({ endpoint: "/billing", method: "GET" })
    ).toThrow(/not allowed/i);

    expect(() =>
      validateVeniceIpcRequest({ endpoint: "/models", method: "DELETE" })
    ).toThrow(/method/i);
  });

  /** BUG-010 regression guard: allowed methods must still match the endpoint. */
  it("rejects allowed methods on the wrong Venice endpoint", () => {
    expect(() =>
      validateVeniceIpcRequest({ endpoint: "/models", method: "POST" })
    ).toThrow(/method/i);

    expect(() =>
      validateVeniceIpcRequest({ endpoint: "/chat/completions", method: "GET" })
    ).toThrow(/method/i);
  });

  /** Rejects Venice IPC payloads that exceed the maximum body size. */
  it("rejects oversized Venice IPC payloads", () => {
    const tooLarge = "x".repeat(MAX_VENICE_IPC_BODY_BYTES + 1);

    expect(() =>
      validateVeniceIpcRequest({
        endpoint: "/chat/completions",
        method: "POST",
        body: { prompt: tooLarge },
      })
    ).toThrow(/too large/i);
  });

  /** Rejects GET bodies, absolute URLs, and forbidden headers. */
  it("rejects GET bodies, absolute urls and forbidden headers", () => {
    expect(() =>
      validateVeniceIpcRequest({ endpoint: "/models", method: "GET", body: { bad: true } })
    ).toThrow();
    expect(() =>
      validateVeniceIpcRequest({ endpoint: "https://api.venice.ai/models", method: "GET" })
    ).toThrow();
    const sanitized = validateVeniceIpcRequest({
      endpoint: "/chat/completions",
      method: "POST",
      headers: { Authorization: "x", "x-client": "ok" },
    });
    expect(sanitized.headers).toEqual({ "x-client": "ok" });
  });

  /** Validates API key input without leaking the value in errors. */
  it("validates API key input without leaking the value", () => {
    expect(validateApiKeyInput("  vn-test-key  ")).toBe("vn-test-key");
    expect(() => validateApiKeyInput("")).toThrow(/enter/i);
    expect(() => validateApiKeyInput("x".repeat(513))).toThrow(/too long/i);
  });
});
