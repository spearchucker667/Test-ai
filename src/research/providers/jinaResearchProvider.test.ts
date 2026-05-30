import { describe, it, expect, vi, beforeEach } from "vitest";
import { createJinaProvider } from "./jinaResearchProvider";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

describe("jinaResearchProvider", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("constructs search URL with encoded query", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      headers: new Map([["content-type", "application/json"]]),
      json: async () => ({ data: [] }),
    } as any);

    const provider = createJinaProvider();
    await provider.search!({ query: "hello world" });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toBe("https://s.jina.ai/hello%20world");
  });

  it("constructs reader URL with encoded target", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      headers: new Map([["content-type", "text/plain"]]),
      text: async () => "md",
    } as any);

    const provider = createJinaProvider();
    await provider.scrape!({ url: "https://example.com?q=1" });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toBe("https://r.jina.ai/https%3A%2F%2Fexample.com%3Fq%3D1");
  });

  it("does not include Authorization header when no key configured", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      headers: new Map([["content-type", "text/plain"]]),
      text: async () => "md",
    } as any);

    const provider = createJinaProvider();
    await provider.scrape!({ url: "https://a.com" });

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers["Authorization"]).toBeUndefined();
  });

  it("includes Authorization header when key is configured", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      headers: new Map([["content-type", "text/plain"]]),
      text: async () => "md",
    } as any);

    const provider = createJinaProvider({ getApiKey: () => "secret-key" });
    await provider.scrape!({ url: "https://a.com" });

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer secret-key");
  });

  it("normalizes JSON reader response", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      headers: new Map([["content-type", "application/json"]]),
      json: async () => ({
        data: "# Hello",
        title: "T",
        url: "https://final.com",
      }),
    } as any);

    const provider = createJinaProvider();
    const result = await provider.scrape!({ url: "https://a.com" });

    expect(result.provider).toBe("jina");
    expect(result.markdown).toBe("# Hello");
    expect(result.title).toBe("T");
    expect(result.finalUrl).toBe("https://final.com");
  });

  it("normalizes plain-text reader response", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      headers: new Map([["content-type", "text/plain"]]),
      text: async () => "plain text",
    } as any);

    const provider = createJinaProvider();
    const result = await provider.scrape!({ url: "https://a.com" });

    expect(result.text).toBe("plain text");
    expect(result.content).toBe("plain text");
  });

  it("normalizes JSON search response", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      headers: new Map([["content-type", "application/json"]]),
      json: async () => ({
        data: [
          { title: "A", url: "https://a.com", description: "desc a" },
          { title: "B", url: "https://b.com", content: "content b" },
        ],
      }),
    } as any);

    const provider = createJinaProvider();
    const results = await provider.search!({ query: "q" });

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      provider: "jina",
      title: "A",
      url: "https://a.com",
      snippet: "desc a",
    });
    expect(results[1]).toMatchObject({
      provider: "jina",
      title: "B",
      url: "https://b.com",
    });
  });

  it("falls back to markdown link parsing for plain-text search", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      headers: new Map([["content-type", "text/plain"]]),
      text: async () =>
        "[Example](https://example.com) something [Other](https://other.com)",
    } as any);

    const provider = createJinaProvider();
    const results = await provider.search!({ query: "q" });

    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].url).toBe("https://example.com");
  });

  it("normalizes errors", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => "rate limited",
    } as any);

    const provider = createJinaProvider();
    await expect(provider.scrape!({ url: "https://a.com" })).rejects.toThrow(
      /Jina 429/
    );
  });

  it("maps confirmed options to headers", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      headers: new Map([["content-type", "text/plain"]]),
      text: async () => "md",
    } as any);

    const provider = createJinaProvider({ getApiKey: () => "k" });
    await provider.scrape!({
      url: "https://a.com",
      options: {
        outputFormat: "text",
        doNotCache: true,
        removeImages: true,
        includeLinksSummary: true,
        includeImagesSummary: true,
        tokenBudget: 2000,
      },
    });

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers["X-Return-Format"]).toBe("text");
    expect(headers["X-No-Cache"]).toBe("true");
    expect(headers["X-Retain-Images"]).toBe("none");
    expect(headers["X-With-Links-Summary"]).toBe("true");
    expect(headers["X-With-Images-Summary"]).toBe("true");
    expect(headers["X-Token-Budget"]).toBe("2000");
  });
});
