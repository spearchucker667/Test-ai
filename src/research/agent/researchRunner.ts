// Code Owner: fayeblade (@spearchucker667)
/** @fileoverview Research runner skeleton with strict budget enforcement.
 *
 * Orchestrates search → dedupe → scrape while respecting:
 *   maxQueries, maxPages, perRequestTimeout, totalJobTimeout, domain filters.
 *
 * Does NOT perform AI synthesis (that lands in P6). This file only gathers
 * evidence and returns it together with citation URLs.
 */

import type { ResearchProvider, SearchResult, ScrapeResult } from "../providerTypes";
import { createEvidenceStore, type EvidenceStore } from "./evidenceStore";

export interface ResearchBudget {
  maxQueries: number;
  maxResultsPerQuery: number;
  maxPages: number;
  maxCharsPerPage: number;
  perRequestTimeoutMs: number;
  totalJobTimeoutMs: number;
  domainAllowlist?: string[];
  domainBlocklist?: string[];
}

export interface ResearchJobInput {
  question: string;
  provider: ResearchProvider;
  queries?: string[];
  budget: ResearchBudget;
  signal?: AbortSignal;
}

export interface ResearchEvidence {
  searchResults: SearchResult[];
  scrapes: ScrapeResult[];
  citations: string[];
}

export interface ResearchJobResult {
  ok: boolean;
  evidence: ResearchEvidence;
  store: EvidenceStore;
  queriesUsed: string[];
  pagesScraped: number;
  error?: string;
}

class ResearchBudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResearchBudgetExceededError";
  }
}

/** Returns an AbortSignal that fires after ms, optionally linked to a parent. */
function createTimeoutSignal(ms: number, parent?: AbortSignal): AbortSignal {
  if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) {
    const timeoutSignal = AbortSignal.timeout(ms);
    if (parent && typeof AbortSignal !== "undefined" && AbortSignal.any) {
      return AbortSignal.any([parent, timeoutSignal]);
    }
    return timeoutSignal;
  }
  const controller = new AbortController();
  let onAbort: (() => void) | undefined;
  const id = setTimeout(() => {
    if (onAbort && parent) parent.removeEventListener("abort", onAbort);
    controller.abort();
  }, ms);
  if (parent) {
    onAbort = () => {
      clearTimeout(id);
      controller.abort();
    };
    parent.addEventListener("abort", onAbort, { once: true });
  }
  return controller.signal;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Request aborted", "AbortError"));
      return;
    }
    let onAbort: (() => void) | undefined;
    const id = setTimeout(() => {
      if (onAbort && signal) signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    if (signal) {
      onAbort = () => {
        clearTimeout(id);
        reject(new DOMException("Request aborted", "AbortError"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

/** Generates simple search queries from a research question if none are supplied. */
function generateQueries(question: string, maxQueries: number): string[] {
  const base = question.trim();
  if (!base) return [];
  const queries: string[] = [base];
  if (maxQueries >= 2) queries.push(`${base} overview`);
  if (maxQueries >= 3) queries.push(`${base} latest`);
  if (maxQueries >= 4) queries.push(`${base} guide`);
  if (maxQueries >= 5) queries.push(`${base} examples`);
  return queries.slice(0, maxQueries);
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    // Strip trailing slash for dedupe, but keep path structure
    let pathname = u.pathname;
    if (pathname.length > 1 && pathname.endsWith("/")) {
      pathname = pathname.slice(0, -1);
    }
    return `${u.origin}${pathname}${u.search}`;
  } catch {
    return url;
  }
}

function isDomainAllowed(url: string, budget: ResearchBudget): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (budget.domainBlocklist?.length) {
    for (const blocked of budget.domainBlocklist) {
      if (hostname === blocked.toLowerCase() || hostname.endsWith(`.${blocked.toLowerCase()}`)) {
        return false;
      }
    }
  }
  if (budget.domainAllowlist?.length) {
    for (const allowed of budget.domainAllowlist) {
      if (hostname === allowed.toLowerCase() || hostname.endsWith(`.${allowed.toLowerCase()}`)) {
        return true;
      }
    }
    return false;
  }
  return true;
}

/** Truncates content to maxChars. */
function trimContent(content: string | undefined, maxChars: number): string | undefined {
  if (!content) return content;
  if (content.length <= maxChars) return content;
  return content.slice(0, maxChars) + "\n…[truncated]";
}

/**
 * Runs a research job within the given budget.
 *
 * Budget rules enforced:
 * - maxQueries: hard cap on number of search queries sent
 * - maxPages: hard cap on number of unique URLs scraped
 * - perRequestTimeoutMs: passed to each provider call via AbortSignal
 * - totalJobTimeoutMs: overall job timeout via AbortSignal
 * - maxCharsPerPage: scraped content is truncated to this length
 * - domainAllowlist / domainBlocklist: filters both search results and scrape targets
 */
export async function runResearchJob(input: ResearchJobInput): Promise<ResearchJobResult> {
  const { question, provider, queries: explicitQueries, budget, signal } = input;
  const store = createEvidenceStore();

  // Total job timeout
  const jobSignal = budget.totalJobTimeoutMs > 0
    ? createTimeoutSignal(budget.totalJobTimeoutMs, signal)
    : signal;

  const allSearchResults: SearchResult[] = [];
  const scrapes: ScrapeResult[] = [];
  const seenUrls = new Set<string>();
  const queriesUsed: string[] = [];

  function assertNotAborted(): void {
    if (jobSignal?.aborted) {
      throw new DOMException("Research job aborted", "AbortError");
    }
  }

  try {
    assertNotAborted();

    if (!provider.supports.search) {
      throw new ResearchBudgetExceededError("Provider does not support search.");
    }

    const queries = (explicitQueries && explicitQueries.length > 0)
      ? explicitQueries.slice(0, budget.maxQueries)
      : generateQueries(question, budget.maxQueries);

    if (queries.length === 0) {
      throw new ResearchBudgetExceededError("No queries generated.");
    }

    // Phase 1: Search
    for (const query of queries) {
      assertNotAborted();
      if (queriesUsed.length >= budget.maxQueries) break;

      const requestSignal = budget.perRequestTimeoutMs > 0
        ? createTimeoutSignal(budget.perRequestTimeoutMs, jobSignal)
        : jobSignal;
      const results = await provider.search!({
        query,
        maxResults: budget.maxResultsPerQuery,
        timeoutMs: budget.perRequestTimeoutMs,
        signal: requestSignal,
      });

      queriesUsed.push(query);

      for (const r of results) {
        if (!r.url) continue;
        const norm = normalizeUrl(r.url);
        if (seenUrls.has(norm)) continue;
        if (!isDomainAllowed(r.url, budget)) continue;
        seenUrls.add(norm);
        allSearchResults.push(r);
      }
    }

    store.addSearch(allSearchResults);

    // Phase 2: Scrape top unique URLs up to maxPages
    if (provider.supports.scrape && budget.maxPages > 0) {
      const urlsToScrape = allSearchResults
        .map((r) => r.url)
        .filter((url): url is string => !!url)
        .filter((url) => isDomainAllowed(url, budget));

      let pagesScraped = 0;
      for (const url of urlsToScrape) {
        assertNotAborted();
        if (pagesScraped >= budget.maxPages) break;

        try {
          const requestSignal = budget.perRequestTimeoutMs > 0
            ? createTimeoutSignal(budget.perRequestTimeoutMs, jobSignal)
            : jobSignal;
          const result = await provider.scrape!({
            url,
            timeoutMs: budget.perRequestTimeoutMs,
            signal: requestSignal,
          });

          // Trim content to budget
          result.markdown = trimContent(result.markdown, budget.maxCharsPerPage);
          result.text = trimContent(result.text, budget.maxCharsPerPage);
          result.content = trimContent(result.content, budget.maxCharsPerPage);

          scrapes.push(result);
          store.addScrape(result);
          pagesScraped++;
        } catch (scrapeErr) {
          // Individual scrape failures are non-fatal; continue to next URL
          // after a short cooldown to avoid hammering a failing host.
          await sleep(300, jobSignal).catch(() => {});
        }
      }
    }

    return {
      ok: true,
      evidence: {
        searchResults: allSearchResults,
        scrapes,
        citations: store.citations(),
      },
      store,
      queriesUsed,
      pagesScraped: scrapes.length,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      evidence: {
        searchResults: allSearchResults,
        scrapes,
        citations: store.citations(),
      },
      store,
      queriesUsed,
      pagesScraped: scrapes.length,
      error: message,
    };
  }
}
