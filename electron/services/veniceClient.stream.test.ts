import { EventEmitter } from "events";
import https from "https";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getVersion: vi.fn(() => "1.0.0-test") },
}));

vi.mock("https", () => ({
  default: { request: vi.fn() },
}));

vi.mock("./secureStore", () => ({
  getApiKey: vi.fn(() => "vn-test"),
}));

vi.mock("./logger", () => ({
  logError: vi.fn(),
  setLastApiError: vi.fn(),
}));

import { performVeniceRequest } from "./veniceClient";

interface MockRequest extends EventEmitter {
  write: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  destroy: (error?: Error) => void;
}

interface MockResponse extends EventEmitter {
  headers: Record<string, string>;
  statusCode: number;
  statusMessage: string;
}

interface HttpsRequestMock {
  mockImplementation: (
    implementation: (options: unknown, callback: (response: MockResponse) => void) => MockRequest
  ) => void;
}

describe("performVeniceRequest streaming safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects successful SSE responses that exceed the local response cap", async () => {
    const requestMock = https.request as unknown as HttpsRequestMock;
    requestMock.mockImplementation((_options, callback) => {
      const req = new EventEmitter() as MockRequest;
      req.write = vi.fn();
      req.destroy = (error?: Error) => {
        req.emit("error", error || new Error("destroyed"));
        req.emit("close");
      };
      req.end = vi.fn(() => {
        const res = new EventEmitter() as MockResponse;
        res.headers = { "content-type": "text/event-stream" };
        res.statusCode = 200;
        res.statusMessage = "OK";
        callback(res);
        res.emit("data", Buffer.alloc(25 * 1024 * 1024 + 1));
      });
      return req;
    });

    await expect(
      performVeniceRequest(
        { endpoint: "/chat/completions", method: "POST", body: { model: "venice-uncensored" } },
        { onDelta: vi.fn() }
      )
    ).rejects.toThrow("Venice response exceeded the local safety limit.");
  });
});
