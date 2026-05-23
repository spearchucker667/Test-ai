// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import request from "supertest";

// Stub out the proxy so the augment (and other allowed) endpoint tests don't make
// real network calls to api.venice.ai. The assertions only care about validation
// behaviour (403/405 gating), not upstream responses.
vi.mock("http-proxy-middleware", () => ({
  createProxyMiddleware: () => (_req: any, res: any) => {
    res.status(200).json({ mocked: true });
  },
}));

import { applyVeniceProxyHeaders, createServerApp } from "./server";

describe("server.ts health endpoint", () => {
  it("should return 200 and status ok on /health", async () => {
    const app = createServerApp();
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});

describe("server.ts proxy validation", () => {
  let app: any;

  beforeAll(() => {
    app = createServerApp();
  });

  it("should allow valid endpoints", async () => {
    // Testing the validation logic to make sure the endpoint is allowed.
    // Given the upstream might not exist, it will likely return 502 Bad Gateway
    // But importantly, it should NOT return 403 Forbidden or 405 Method Not Allowed.
    const res = await request(app).get("/api/venice/models");
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(405);
  });

  it("should block disallowed endpoints", async () => {
    const res = await request(app).get("/api/venice/admin/users");
    expect(res.status).toBe(403);
  });

  it("should block the proxy root because it is not an allowlisted Venice endpoint", async () => {
    const res = await request(app).get("/api/venice");
    expect(res.status).toBe(403);
  });

  it("should explicitly block path traversal attempts", async () => {
    const res1 = await request(app).get("/api/venice/%2e%2e/internal/secrets");
    expect(res1.status === 403 || res1.status === 404).toBe(true);

    const res2 = await request(app).get("/api/venice/models/../internal");
    expect(res2.status === 403 || res2.status === 404).toBe(true);
  });

  it("should block unallowed methods", async () => {
     const res = await request(app).delete("/api/venice/models");
     expect(res.status).toBe(405);
  });

  it("should block allowed methods on the wrong Venice endpoint", async () => {
    // BUG-010 regression guard: method allowlist and endpoint allowlist must be paired.
    const postModels = await request(app).post("/api/venice/models").send({});
    expect(postModels.status).toBe(405);

    const getChat = await request(app).get("/api/venice/chat/completions");
    expect(getChat.status).toBe(405);
  });

  it("should allow augment endpoints", async () => {
    // These were previously blocked (BUG-001). They should now pass validation
    // and fail upstream (502) rather than being rejected with 403.
    const search = await request(app)
      .post("/api/venice/augment/search")
      .send({ query: "test" });
    expect(search.status).not.toBe(403);
    expect(search.status).not.toBe(405);

    const scrape = await request(app)
      .post("/api/venice/augment/scrape")
      .send({ url: "https://example.com" });
    expect(scrape.status).not.toBe(403);
    expect(scrape.status).not.toBe(405);

    const parser = await request(app)
      .post("/api/venice/augment/text-parser")
      .send({});
    expect(parser.status).not.toBe(403);
    expect(parser.status).not.toBe(405);
  });

  it("should set security headers on responses", async () => {
    const res = await request(app).get("/api/venice/admin/blocked");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    expect(res.headers["content-security-policy"]).toBeTruthy();
  });
});

describe("server.ts proxy header sanitization", () => {
  it("should strip renderer-controlled forbidden headers before proxying", () => {
    process.env.VENICE_API_KEY = "fixture";
    const proxyReq = {
      removeHeader: vi.fn(),
      setHeader: vi.fn(),
      write: vi.fn(),
    };

    applyVeniceProxyHeaders(proxyReq, {
      method: "POST",
      body: Buffer.from("{}"),
    });

    expect(proxyReq.removeHeader).toHaveBeenCalledWith("Authorization");
    expect(proxyReq.removeHeader).toHaveBeenCalledWith("Cookie");
    expect(proxyReq.removeHeader).toHaveBeenCalledWith("Host");
    expect(proxyReq.setHeader).toHaveBeenCalledWith(
      "Authorization",
      "Bearer fixture"
    );
    expect(proxyReq.setHeader).toHaveBeenCalledWith("Host", "api.venice.ai");

    delete process.env.VENICE_API_KEY;
  });
});

describe("server.ts rate limiting", () => {
  let app: any;

  beforeEach(() => {
    // Create a fresh app per test so rate-limit state doesn't bleed between tests.
    // Use a very short window so the limit is easy to trip in tests.
    process.env.RATE_LIMIT_WINDOW_MS = "5000";
    process.env.RATE_LIMIT_MAX_REQUESTS = "3";
    app = createServerApp();
    delete process.env.RATE_LIMIT_WINDOW_MS;
    delete process.env.RATE_LIMIT_MAX_REQUESTS;
  });

  it("should allow requests within the limit", async () => {
    for (let i = 0; i < 3; i++) {
      const res = await request(app).get("/api/venice/admin/x");
      // 403 = reached validation (not rate-limited), which is fine
      expect(res.status).not.toBe(429);
    }
  });

  it("should return 429 when the rate limit is exceeded", async () => {
    // Exhaust the limit of 3
    for (let i = 0; i < 3; i++) {
      await request(app).get("/api/venice/admin/x");
    }
    // The 4th request should be rate-limited
    const res = await request(app).get("/api/venice/admin/x");
    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/too many requests/i);
  });
});
