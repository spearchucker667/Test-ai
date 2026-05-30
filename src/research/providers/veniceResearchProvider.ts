// Code Owner: fayeblade (@spearchucker667)
/** @fileoverview Venice research provider adapter.
 *
 * Wraps the existing Venice /augment/search and /augment/scrape endpoints.
 * Does NOT bypass the endpoint allowlist, safety guard, or API-key security model.
 * The renderer-side safety guard is enforced inside veniceFetch before any POST.
 */

import { veniceFetch } from "../../services/veniceClient";
import type {
  ResearchProvider,
  SearchInput,
  ScrapeInput,
  SearchResult,
  ScrapeResult,
} from "../providerTypes";

function nowIso(): string {
  return new Date().toISOString();
}

/** Normalizes a Venice /augment/search response into SearchResult items. */
function normalizeSearch(data: unknown, query: string): SearchResult[] {
  if (!data || typeof data !== "object") return [];
  const d = data as Record<string, unknown>;
  const rawResults =
    d.results ?? d.data ?? d.items ?? (Array.isArray(data) ? data : []);
  if (!Array.isArray(rawResults)) return [];

  return rawResults
    .map((item: unknown, idx: number): SearchResult => {
      const r = (item ?? {}) as Record<string, unknown>;
      return {
        provider: "venice",
        title: String(r.title ?? r.name ?? `Result ${idx + 1}`),
        url: String(r.url ?? r.link ?? ""),
        snippet:
          typeof r.snippet === "string"
            ? r.snippet
            : typeof r.content === "string"
            ? r.content
            : typeof r.description === "string"
            ? r.description
            : undefined,
        publishedAt: r.date ? String(r.date) : undefined,
        raw: item,
      };
    })
    .filter((r) => r.url);
}

/** Normalizes a Venice /augment/scrape response into a ScrapeResult. */
function normalizeScrape(url: string, data: unknown): ScrapeResult {
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    provider: "venice",
    url,
    finalUrl: typeof d.url === "string" ? d.url : url,
    title: typeof d.title === "string" ? d.title : undefined,
    markdown: typeof d.markdown === "string" ? d.markdown : undefined,
    text: typeof d.text === "string" ? d.text : undefined,
    content:
      typeof d.content === "string"
        ? d.content
        : typeof d.markdown === "string"
        ? d.markdown
        : typeof d.text === "string"
        ? d.text
        : undefined,
    raw: data,
    fetchedAt: nowIso(),
  };
}

export const veniceResearchProvider: ResearchProvider = {
  id: "venice",
  label: "Venice",
  supports: {
    search: true,
    scrape: true,
    socialDiscovery: false,
    documentParsing: true,
  },

  async search(input: SearchInput): Promise<SearchResult[]> {
    const { query, maxResults, timeoutMs, signal, options } = input;
    const provider =
      typeof options?.provider === "string" ? options.provider : "brave";

    const { data } = await veniceFetch("/augment/search", {
      method: "POST",
      body: {
        query,
        provider,
        maxResults,
      },
      signal,
      // Forward timeout as an AbortSignal if the runtime supports it.
      ...(timeoutMs
        ? { signal: composeTimeoutSignal(timeoutMs, signal) }
        : {}),
    });

    return normalizeSearch(data, query);
  },

  async scrape(input: ScrapeInput): Promise<ScrapeResult> {
    const { url, timeoutMs, signal } = input;

    const { data } = await veniceFetch("/augment/scrape", {
      method: "POST",
      body: { url },
      signal,
      ...(timeoutMs
        ? { signal: composeTimeoutSignal(timeoutMs, signal) }
        : {}),
    });

    return normalizeScrape(url, data);
  },
};

/** Composes a timeout signal with an optional parent signal. */
function composeTimeoutSignal(
  ms: number,
  parent?: AbortSignal
): AbortSignal {
  if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) {
    const timeoutSignal = AbortSignal.timeout(ms);
    if (parent && typeof AbortSignal !== "undefined" && AbortSignal.any) {
      return AbortSignal.any([parent, timeoutSignal]);
    }
    return timeoutSignal;
  }
  // Fallback for older runtimes
  const controller = new AbortController();
  let onAbort: (() => void) | undefined;
  const id = setTimeout(() => {
    if (onAbort && parent) {
      parent.removeEventListener("abort", onAbort);
    }
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
