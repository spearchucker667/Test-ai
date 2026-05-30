import { describe, it, expect, vi } from "vitest";
import { runResearchJob, type ResearchBudget } from "./researchRunner";
import type { ResearchProvider, SearchResult, ScrapeResult } from "../providerTypes";

function makeMockProvider(
  searchResults: SearchResult[],
  scrapeResult?: ScrapeResult
): ResearchProvider {
  return {
    id: "venice",
    label: "Mock",
    supports: { search: true, scrape: !!scrapeResult, socialDiscovery: false, documentParsing: false },
    async search() {
      return searchResults;
    },
    async scrape() {
      if (!scrapeResult) throw new Error("No scrape");
      return scrapeResult;
    },
  };
}

const defaultBudget: ResearchBudget = {
  maxQueries: 3,
  maxResultsPerQuery: 5,
  maxPages: 2,
  maxCharsPerPage: 1000,
  perRequestTimeoutMs: 5000,
  totalJobTimeoutMs: 30000,
};

describe("runResearchJob budgets", () => {
  it("respects maxQueries", async () => {
    const provider = makeMockProvider([
      { provider: "venice", title: "R1", url: "https://r1.com" },
    ]);
    const searchSpy = vi.spyOn(provider, "search");

    const result = await runResearchJob({
      question: "q",
      provider,
      budget: { ...defaultBudget, maxQueries: 2 },
    });

    expect(result.ok).toBe(true);
    expect(searchSpy).toHaveBeenCalledTimes(2);
    expect(result.queriesUsed).toHaveLength(2);
  });

  it("respects maxPages", async () => {
    const provider = makeMockProvider(
      [
        { provider: "venice", title: "A", url: "https://a.com" },
        { provider: "venice", title: "B", url: "https://b.com" },
        { provider: "venice", title: "C", url: "https://c.com" },
      ],
      {
        provider: "venice",
        url: "https://x.com",
        markdown: "md",
        fetchedAt: new Date().toISOString(),
      }
    );
    const scrapeSpy = vi.spyOn(provider, "scrape");

    const result = await runResearchJob({
      question: "q",
      provider,
      budget: { ...defaultBudget, maxPages: 1 },
    });

    expect(result.ok).toBe(true);
    expect(scrapeSpy).toHaveBeenCalledTimes(1);
    expect(result.pagesScraped).toBe(1);
  });

  it("enforces totalJobTimeoutMs", async () => {
    const provider: ResearchProvider = {
      id: "venice",
      label: "Mock",
      supports: { search: true, scrape: false, socialDiscovery: false, documentParsing: false },
      async search(input) {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => resolve([]), 10_000);
          input.signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(new DOMException("Request aborted", "AbortError"));
          });
        });
        return [];
      },
    };

    const result = await runResearchJob({
      question: "q",
      provider,
      budget: { ...defaultBudget, totalJobTimeoutMs: 100 },
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/aborted|timeout/i);
  });

  it("enforces perRequestTimeoutMs via signal", async () => {
    const provider: ResearchProvider = {
      id: "venice",
      label: "Mock",
      supports: { search: true, scrape: false, socialDiscovery: false, documentParsing: false },
      async search(input) {
        // If signal is wired, it should abort before 10s
        await new Promise((_, reject) => {
          const timer = setTimeout(() => reject(new Error("too slow")), 10_000);
          input.signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(new DOMException("Request aborted", "AbortError"));
          });
        });
        return [];
      },
    };

    const result = await runResearchJob({
      question: "q",
      provider,
      budget: { ...defaultBudget, perRequestTimeoutMs: 100, totalJobTimeoutMs: 5000 },
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/aborted/i);
  });

  it("dedupes URLs across queries", async () => {
    const provider = makeMockProvider([
      { provider: "venice", title: "A", url: "https://a.com" },
      { provider: "venice", title: "A2", url: "https://a.com" },
    ]);

    const result = await runResearchJob({
      question: "q",
      provider,
      queries: ["q1", "q2"],
      budget: defaultBudget,
    });

    expect(result.evidence.searchResults).toHaveLength(1);
  });

  it("filters by domain blocklist", async () => {
    const provider = makeMockProvider([
      { provider: "venice", title: "Bad", url: "https://bad.com/x" },
      { provider: "venice", title: "Good", url: "https://good.com/y" },
    ]);

    const result = await runResearchJob({
      question: "q",
      provider,
      budget: { ...defaultBudget, domainBlocklist: ["bad.com"] },
    });

    expect(result.evidence.searchResults).toHaveLength(1);
    expect(result.evidence.searchResults[0].url).toBe("https://good.com/y");
  });

  it("filters by domain allowlist", async () => {
    const provider = makeMockProvider([
      { provider: "venice", title: "A", url: "https://a.com" },
      { provider: "venice", title: "B", url: "https://b.com" },
    ]);

    const result = await runResearchJob({
      question: "q",
      provider,
      budget: { ...defaultBudget, domainAllowlist: ["a.com"] },
    });

    expect(result.evidence.searchResults).toHaveLength(1);
    expect(result.evidence.searchResults[0].url).toBe("https://a.com");
  });

  it("returns error when provider lacks search support", async () => {
    const provider: ResearchProvider = {
      id: "venice",
      label: "Mock",
      supports: { search: false, scrape: false, socialDiscovery: false, documentParsing: false },
    };

    const result = await runResearchJob({
      question: "q",
      provider,
      budget: defaultBudget,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/does not support search/i);
  });
});
