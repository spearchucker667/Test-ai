/** @fileoverview Unit tests for redaction of secrets and tokens. */

import { describe, expect, it } from "vitest";
import { redactSecrets } from "./redaction";

/** Tests for redactSecrets. */
describe("redactSecrets", () => {
  /** Verifies redaction of bearer tokens, API keys, and authorization headers. */
  it("redacts bearer tokens, API keys, and authorization headers", () => {
    const value = redactSecrets({
      Authorization: "Bearer vn-secret-token",
      message: "api_key=vn-another-secret",
      nested: { token: "vn-token-value" },
    });

    const serialized = JSON.stringify(value);
    expect(serialized).not.toContain("vn-secret-token");
    expect(serialized).not.toContain("vn-another-secret");
    expect(serialized).not.toContain("vn-token-value");
    expect(serialized).toContain("[REDACTED]");
  });

  // BUG-011 regression guard: redaction must not recurse forever on cyclic objects.
  it("replaces cyclic references with a placeholder", () => {
    const value: { name: string; self?: unknown } = { name: "diagnostics" };
    value.self = value;

    expect(redactSecrets(value)).toEqual({
      name: "diagnostics",
      self: "[Circular]",
    });
  });
});
