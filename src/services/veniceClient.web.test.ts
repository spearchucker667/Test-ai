import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppDispatch } from "../types/app";
import { veniceFetch, veniceStreamChat } from "./veniceClient";

const originalFetch = globalThis.fetch;

describe("veniceClient web regressions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  it("retries fetch failures that do not have an HTTP status", async () => {
    vi.useFakeTimers();
    const dispatch = vi.fn() as unknown as AppDispatch;
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );
    globalThis.fetch = fetchMock;

    const request = veniceFetch("/models", { method: "GET", dispatch });
    await vi.advanceTimersByTimeAsync(2400);

    await expect(request).resolves.toMatchObject({ data: { data: [] } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SET_DIAGNOSTICS",
        diagnostics: expect.objectContaining({
          ok: false,
          status: null,
          error: expect.stringContaining("Fetch failure"),
        }),
      })
    );
  });

  it("dispatches parsed error diagnostics for failed web streaming responses", async () => {
    const dispatch = vi.fn() as unknown as AppDispatch;
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ error: "invalid stream payload" }), {
        status: 400,
        statusText: "Bad Request",
        headers: { "content-type": "application/json" },
      })
    );
    globalThis.fetch = fetchMock;

    await expect(
      veniceStreamChat(
        { model: "venice-uncensored", messages: [] },
        { dispatch, onDelta: vi.fn() }
      )
    ).rejects.toThrow("400 request/schema/model error: invalid stream payload");

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SET_DIAGNOSTICS",
        diagnostics: expect.objectContaining({
          ok: false,
          status: 400,
          error: "400 request/schema/model error: invalid stream payload",
        }),
      })
    );
  });
});
