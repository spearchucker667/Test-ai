// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadImage } from "./download";

const originalFetch = globalThis.fetch;
const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;

describe("downloadImage", () => {
  beforeEach(() => {
    globalThis.fetch = originalFetch;
    URL.createObjectURL = vi.fn(() => "blob:download");
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
  });

  it("does not save HTTP error bodies as confirmed image downloads", async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("not found", { status: 404, statusText: "Not Found" })
    );

    const result = await downloadImage("https://example.com/missing.png", "missing.png");

    expect(result).toEqual({ confirmed: false, usedFallback: true });
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
