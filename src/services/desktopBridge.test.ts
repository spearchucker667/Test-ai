/** @fileoverview Unit tests for desktopBridge web fallback behavior. */

import { describe, expect, it, vi, beforeEach } from "vitest";
// @ts-expect-error - fake-indexeddb ESM exports lack proper typings
import FDBFactory from "fake-indexeddb/lib/FDBFactory";
import {
  desktopApiKey,
  desktopApp,
  desktopVenice,
  isElectron,
} from "./desktopBridge";

vi.mock("./veniceClient", () => ({
  veniceFetch: vi.fn(),
}));

import { veniceFetch } from "./veniceClient";

/** Resets IndexedDB and clears mocks before each test. */
beforeEach(() => {
  global.indexedDB = new FDBFactory();
  vi.clearAllMocks();
});

/** Tests for desktopBridge fallback behavior in web (non-Electron) mode. */
describe("desktopBridge web fallback", () => {
  /** Verifies that web mode reports correctly and delegates to veniceFetch. */
  it("reports non-Electron mode and avoids desktop IPC calls in browser mode", async () => {
    vi.stubGlobal("window", { indexedDB: global.indexedDB });

    expect(isElectron()).toBe(false);
    await expect(desktopApiKey.isConfigured()).resolves.toBe(false);

    // In web mode test() delegates to veniceFetch; mock a network failure to verify fallback.
    vi.mocked(veniceFetch).mockRejectedValue(new Error("Network error"));
    await expect(desktopApiKey.test()).resolves.toMatchObject({
      ok: false,
      message: "Network error",
    });

    await expect(desktopApp.getDiagnostics()).resolves.toMatchObject({
      isDesktop: false,
      transport: "web-proxy",
    });
    await expect(
      desktopVenice.request({ endpoint: "/models", method: "GET" })
    ).rejects.toThrow(/desktop mode/i);
  });

  /** Verifies that web mode refuses to store API keys locally. */
  it("rejects setting API key in web mode", async () => {
    vi.stubGlobal("window", { indexedDB: global.indexedDB });
    await expect(desktopApiKey.set("vn-test-key")).rejects.toThrow(
      /desktop-only/i
    );
  });

  /** Verifies that deleting API key in web mode is a safe no-op. */
  it("allows deleting API key in web mode as a no-op", async () => {
    vi.stubGlobal("window", { indexedDB: global.indexedDB });
    await expect(desktopApiKey.delete()).resolves.toEqual({ ok: true });
  });
});
