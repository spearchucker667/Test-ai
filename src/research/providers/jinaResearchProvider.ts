// Code Owner: fayeblade (@spearchucker667)
/** @fileoverview Jina AI Reader/Search research provider adapter.
 *
 * Confirmed endpoints (verified against live docs, May 2026):
 *   Reader: GET https://r.jina.ai/<absolute-target-url>
 *   Search: GET https://s.jina.ai/<url-encoded-query>
 *   Optional API key: Authorization: Bearer <key>
 *   JSON mode: Accept: application/json
 *
 * Confirmed headers:
 *   X-Return-Format, X-No-Cache, X-Timeout, X-Max-Tokens, X-Token-Budget,
 *   X-With-Links-Summary, X-With-Images-Summary, X-Retain-Images
 *
 * Unverified / not implemented in this pass:
 *   respectRobotsTxt — no user-controllable header confirmed.
 */

import type {
  ResearchProvider,
  ResearchProviderId,
  SearchInput,
  ScrapeInput,
  SearchResult,
  ScrapeResult,
} from "../providerTypes";

const JINA_READER_BASE = "https://r.jina.ai";
const JINA_SEARCH_BASE = "https://s.jina.ai";

export interface JinaProviderConfig {
  /** Returns the Jina API key, or undefined if unauthenticated. */
  getApiKey?: () => string | undefined;
}

function nowIso(): string {
  return new Date().toISOString();
}

function buildHeaders(config: JinaProviderConfig, options?: ScrapeInput["options"]): Record<string, string> {
  const headers: Record<string, string> = {};

  const key = config.getApiKey?.();
  if (key) {
    headers["Authorization"] = `Bearer ${key}`;
  }

  if (options?.outputFormat === "json") {
    headers["Accept"] = "application/json";
  } else if (options?.outputFormat) {
    headers["X-Return-Format"] = options.outputFormat;
  }

  if (options?.doNotCache) {
    headers["X-No-Cache"] = "true";
  }

  if (options?.removeImages) {
    headers["X-Retain-Images"] = "none";
  }

  if (options?.includeLinksSummary) {
    headers["X-With-Links-Summary"] = "true";
  }

  if (options?.includeImagesSummary) {
    headers["X-With-Images-Summary"] = "true";
  }

  if (options?.tokenBudget && options.tokenBudget > 0) {
    headers["X-Token-Budget"] = String(options.tokenBudget);
  }

  // X-Timeout is in seconds, max 180 per Jina docs.
  if (options && "timeoutMs" in options && typeof options.timeoutMs === "number" && options.timeoutMs > 0) {
    const seconds = Math.min(180, Math.ceil(options.timeoutMs / 1000));
    if (seconds > 0) {
      headers["X-Timeout"] = String(seconds);
    }
  }

  return headers;
}

function buildScrapeUrl(input: ScrapeInput): string {
  const target = encodeURIComponent(input.url);
  return `${JINA_READER_BASE}/${target}`;
}

function buildSearchUrl(input: SearchInput): string {
  const query = encodeURIComponent(input.query);
  return `${JINA_SEARCH_BASE}/${query}`;
}

async function jinaFetch(
  url: string,
  headers: Record<string, string>,
  signal?: AbortSignal,
  timeoutMs?: number
): Promise<unknown> {
  const fetchSignal = composeTimeoutSignal(timeoutMs, signal);
  const response = await fetch(url, {
    method: "GET",
    headers,
    signal: fetchSignal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "Jina request failed");
    throw new Error(`Jina ${response.status}: ${text.slice(0, 200)}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json().catch(() => null);
  }
  return response.text();
}

function composeTimeoutSignal(ms?: number, parent?: AbortSignal): AbortSignal {
  if (!ms || ms <= 0) return parent || new AbortController().signal;
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

/** Normalizes a Jina Reader response into ScrapeResult. */
function normalizeReader(url: string, data: unknown): ScrapeResult {
  if (typeof data === "string") {
    return {
      provider: "jina" as ResearchProviderId,
      url,
      markdown: data,
      text: data,
      content: data,
      fetchedAt: nowIso(),
    };
  }

  const d = (data ?? {}) as Record<string, unknown>;
  const content =
    typeof d.data === "string"
      ? d.data
      : typeof d.markdown === "string"
      ? d.markdown
      : typeof d.text === "string"
      ? d.text
      : undefined;

  return {
    provider: "jina" as ResearchProviderId,
    url,
    finalUrl: typeof d.url === "string" ? d.url : url,
    title: typeof d.title === "string" ? d.title : undefined,
    markdown: content,
    text: content,
    content,
    raw: data,
    fetchedAt: nowIso(),
  };
}

/** Normalizes a Jina Search response into SearchResult items. */
function normalizeSearch(query: string, data: unknown): SearchResult[] {
  if (typeof data === "string") {
    // Fallback: parse URLs from markdown text heuristically
    return parseUrlsFromMarkdown(data);
  }

  const d = (data ?? {}) as Record<string, unknown>;
  const items = Array.isArray(d.data) ? d.data : Array.isArray(d.results) ? d.results : undefined;
  if (items && Array.isArray(items)) {
    return items
      .map((item: unknown, idx: number): SearchResult => {
        const r = (item ?? {}) as Record<string, unknown>;
        return {
          provider: "jina" as ResearchProviderId,
          title: String(r.title ?? r.name ?? `Result ${idx + 1}`),
          url: String(r.url ?? r.link ?? ""),
          snippet:
            typeof r.description === "string"
              ? r.description
              : typeof r.snippet === "string"
              ? r.snippet
              : typeof r.content === "string"
              ? r.content.slice(0, 500)
              : undefined,
          publishedAt: r.date ? String(r.date) : undefined,
          raw: item,
        };
      })
      .filter((r) => r.url);
  }

  return [];
}

/** Heuristic fallback: extract markdown links as SearchResult stubs. */
function parseUrlsFromMarkdown(text: string): SearchResult[] {
  const results: SearchResult[] = [];
  const seen = new Set<string>();
  // Match markdown links [title](url)
  const linkRe = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(text)) !== null) {
    const url = m[2];
    if (seen.has(url)) continue;
    seen.add(url);
    results.push({
      provider: "jina" as ResearchProviderId,
      title: m[1],
      url,
    });
  }
  return results;
}

export function createJinaProvider(config: JinaProviderConfig = {}): ResearchProvider {
  return {
    id: "jina",
    label: "Jina AI",
    supports: {
      search: true,
      scrape: true,
      socialDiscovery: false,
      documentParsing: false,
    },

    async search(input: SearchInput): Promise<SearchResult[]> {
      const url = buildSearchUrl(input);
      const headers: Record<string, string> = {};
      const key = config.getApiKey?.();
      if (key) headers["Authorization"] = `Bearer ${key}`;
      headers["Accept"] = "application/json";

      const data = await jinaFetch(url, headers, input.signal, input.timeoutMs);
      return normalizeSearch(input.query, data);
    },

    async scrape(input: ScrapeInput): Promise<ScrapeResult> {
      const url = buildScrapeUrl(input);
      const headers = buildHeaders(config, input.options);
      const data = await jinaFetch(url, headers, input.signal, input.timeoutMs);
      return normalizeReader(input.url, data);
    },
  };
}
