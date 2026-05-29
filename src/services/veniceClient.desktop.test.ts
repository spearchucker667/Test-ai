import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppDispatch } from "../types/app";

vi.mock("./desktopBridge", () => ({
  isElectron: vi.fn(() => true),
  desktopVenice: {
    request: vi.fn(),
    streamChat: vi.fn(),
  },
}));

import { veniceFetch, veniceStreamChat } from "./veniceClient";
import { desktopVenice } from "./desktopBridge";

describe("veniceClient desktop regressions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes desktop response headers in diagnostics", async () => {
    const dispatch = vi.fn() as unknown as AppDispatch;
    vi.mocked(desktopVenice.request).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { "retry-after": "3", "x-ratelimit-reset-requests": "2" },
      body: { data: [] },
      contentType: "application/json",
    });

    await veniceFetch("/models", { method: "GET", dispatch, retry: false });

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SET_DIAGNOSTICS",
        diagnostics: expect.objectContaining({
          headers: expect.objectContaining({
            "retry-after": "3",
            "x-ratelimit-reset-requests": "2",
          }),
        }),
      })
    );
  });

  it("logs normalized error details for failed desktop streaming responses", async () => {
    const dispatch = vi.fn() as unknown as AppDispatch;
    vi.mocked(desktopVenice.streamChat).mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      headers: {},
      body: { details: { _errors: ["invalid payload"] } },
      contentType: "application/json",
    });

    await expect(
      veniceStreamChat(
        { model: "venice-uncensored", messages: [] },
        { dispatch, onDelta: vi.fn() }
      )
    ).rejects.toThrow("400 request/schema/model error: invalid payload");

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SET_DIAGNOSTICS",
        diagnostics: expect.objectContaining({
          ok: false,
          status: 400,
          error: "400 request/schema/model error: invalid payload",
        }),
      })
    );
  });
});
