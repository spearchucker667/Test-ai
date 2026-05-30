import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createGenericHttpProvider,
  isSafeUrl,
} from "./genericHttpScrapeProvider";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

describe("isSafeUrl SSRF blocklist", () => {
  it("allows public https URLs", () => {
    expect(isSafeUrl("https://example.com")).toBe(true);
    expect(isSafeUrl("https://api.github.com/users/octocat")).toBe(true);
  });

  it("allows public http URLs", () => {
    expect(isSafeUrl("http://example.com")).toBe(true);
  });

  it("blocks non-http schemes", () => {
    expect(isSafeUrl("ftp://example.com")).toBe(false);
    expect(isSafeUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeUrl("data:text/html,foo")).toBe(false);
  });

  it("blocks localhost", () => {
    expect(isSafeUrl("http://localhost")).toBe(false);
    expect(isSafeUrl("http://localhost:3000")).toBe(false);
    expect(isSafeUrl("https://localhost")).toBe(false);
  });

  it("blocks .local hostnames", () => {
    expect(isSafeUrl("http://myhost.local")).toBe(false);
    expect(isSafeUrl("http://myhost.local:8080")).toBe(false);
  });

  it("blocks .internal hostnames", () => {
    expect(isSafeUrl("http://myhost.internal")).toBe(false);
  });

  it("blocks 127.0.0.0/8", () => {
    expect(isSafeUrl("http://127.0.0.1")).toBe(false);
    expect(isSafeUrl("http://127.0.0.53")).toBe(false);
    expect(isSafeUrl("http://127.255.255.255")).toBe(false);
  });

  it("blocks 10.0.0.0/8", () => {
    expect(isSafeUrl("http://10.0.0.1")).toBe(false);
    expect(isSafeUrl("http://10.255.255.255")).toBe(false);
  });

  it("blocks 172.16.0.0/12", () => {
    expect(isSafeUrl("http://172.16.0.1")).toBe(false);
    expect(isSafeUrl("http://172.31.255.255")).toBe(false);
    expect(isSafeUrl("http://172.15.0.1")).toBe(true); // outside
  });

  it("blocks 192.168.0.0/16", () => {
    expect(isSafeUrl("http://192.168.0.1")).toBe(false);
    expect(isSafeUrl("http://192.168.255.255")).toBe(false);
  });

  it("blocks 169.254.0.0/16 (link-local IPv4)", () => {
    expect(isSafeUrl("http://169.254.1.1")).toBe(false);
    expect(isSafeUrl("http://169.254.0.0")).toBe(false);
  });

  it("blocks 0.0.0.0", () => {
    expect(isSafeUrl("http://0.0.0.0")).toBe(false);
  });

  it("blocks 100.64.0.0/10 (CGNAT)", () => {
    expect(isSafeUrl("http://100.64.0.1")).toBe(false);
    expect(isSafeUrl("http://100.127.255.255")).toBe(false);
    expect(isSafeUrl("http://100.63.255.255")).toBe(true); // outside
  });

  it("blocks ::1", () => {
    expect(isSafeUrl("http://[::1]")).toBe(false);
  });

  it("blocks fc00::/7 (ULA)", () => {
    expect(isSafeUrl("http://[fc00::1]")).toBe(false);
    expect(isSafeUrl("http://[fd00::1]")).toBe(false);
    expect(isSafeUrl("http://[fb00::1]")).toBe(true); // outside
  });

  it("blocks fe80::/10 (link-local IPv6)", () => {
    expect(isSafeUrl("http://[fe80::1]")).toBe(false);
    expect(isSafeUrl("http://[fe80::ffff]")).toBe(false);
    expect(isSafeUrl("http://[fe7f::1]")).toBe(true); // outside
  });

  it("blocks ::ffff:<private-v4>", () => {
    expect(isSafeUrl("http://[::ffff:127.0.0.1]")).toBe(false);
    expect(isSafeUrl("http://[::ffff:10.0.0.1]")).toBe(false);
    expect(isSafeUrl("http://[::ffff:192.168.1.1]")).toBe(false);
    expect(isSafeUrl("http://[::ffff:8.8.8.8]")).toBe(true); // public
  });
});

describe("genericHttpScrapeProvider", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("rejects when disabled", async () => {
    const provider = createGenericHttpProvider({ enabled: false });
    await expect(
      provider.scrape!({ url: "https://example.com" })
    ).rejects.toThrow(/disabled by default/i);
  });

  it("fetches public URL when enabled", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      url: "https://example.com",
      headers: new Map([["content-type", "text/html"]]),
      body: {
        getReader() {
          const text = "<html><body>Hello</body></html>";
          const encoder = new TextEncoder();
          const bytes = encoder.encode(text);
          let done = false;
          return {
            async read() {
              if (done) return { done: true, value: undefined };
              done = true;
              return { done: false, value: bytes };
            },
            releaseLock() {},
          };
        },
      },
    } as any);

    const provider = createGenericHttpProvider({ enabled: true });
    const result = await provider.scrape!({ url: "https://example.com" });

    expect(result.provider).toBe("generic-http");
    expect(result.text).toBe("Hello");
    expect(result.url).toBe("https://example.com");
  });

  it("rejects blocked URLs even when enabled", async () => {
    const provider = createGenericHttpProvider({ enabled: true });
    await expect(
      provider.scrape!({ url: "http://localhost/secret" })
    ).rejects.toThrow(/blocked by SSRF/i);
  });

  it("rejects disallowed content types", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      url: "https://example.com",
      headers: new Map([["content-type", "application/pdf"]]),
    } as any);

    const provider = createGenericHttpProvider({ enabled: true });
    await expect(
      provider.scrape!({ url: "https://example.com/file.pdf" })
    ).rejects.toThrow(/Content-Type not allowed/i);
  });

  it("enforces timeout", async () => {
    fetchMock.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_, reject) => {
          const timer = setTimeout(() => reject(new Error("network")), 10_000);
          init.signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(new DOMException("Aborted", "AbortError"));
          });
        })
    );

    const provider = createGenericHttpProvider({ enabled: true });
    await expect(
      provider.scrape!({ url: "https://example.com", timeoutMs: 100 })
    ).rejects.toThrow();
  });

  it("strips script and style tags", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      url: "https://example.com",
      headers: new Map([["content-type", "text/html"]]),
      body: {
        getReader() {
          const text = `<html><script>alert(1)</script><style>.x{}</style><body>Safe</body></html>`;
          const encoder = new TextEncoder();
          const bytes = encoder.encode(text);
          let done = false;
          return {
            async read() {
              if (done) return { done: true, value: undefined };
              done = true;
              return { done: false, value: bytes };
            },
            releaseLock() {},
          };
        },
      },
    } as any);

    const provider = createGenericHttpProvider({ enabled: true });
    const result = await provider.scrape!({ url: "https://example.com" });
    expect(result.text).toBe("Safe");
  });
});
