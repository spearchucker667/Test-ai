// Code Owner: fayeblade (@spearchucker667)
/** @fileoverview In-memory evidence store for research jobs.
 *
 * Holds search results and scraped pages with citation URLs.
 * Nothing is persisted to disk unless the caller explicitly exports.
 */

import type { SearchResult, ScrapeResult } from "../providerTypes";

export interface EvidenceRecord {
  id: string;
  type: "search" | "scrape";
  url: string;
  title?: string;
  snippet?: string;
  content?: string;
  fetchedAt: string;
}

export interface EvidenceStore {
  addSearch(results: SearchResult[]): void;
  addScrape(result: ScrapeResult): void;
  list(): readonly EvidenceRecord[];
  uniqueUrls(): string[];
  citations(): string[];
  clear(): void;
}

/** Creates a fresh evidence store for a single research job. */
export function createEvidenceStore(): EvidenceStore {
  const records: EvidenceRecord[] = [];
  const urlSet = new Set<string>();
  let counter = 0;

  function nextId(): string {
    counter++;
    return `ev-${counter.toString(36).padStart(4, "0")}`;
  }

  return {
    addSearch(results: SearchResult[]) {
      for (const r of results) {
        if (!r.url || urlSet.has(r.url)) continue;
        urlSet.add(r.url);
        records.push({
          id: nextId(),
          type: "search",
          url: r.url,
          title: r.title,
          snippet: r.snippet,
          content: r.content,
          fetchedAt: r.publishedAt ?? new Date().toISOString(),
        });
      }
    },

    addScrape(result: ScrapeResult) {
      const url = result.finalUrl || result.url;
      if (!url) return;
      urlSet.add(url);
      records.push({
        id: nextId(),
        type: "scrape",
        url,
        title: result.title,
        content:
          result.markdown ?? result.text ?? result.content ?? undefined,
        fetchedAt: result.fetchedAt,
      });
    },

    list(): readonly EvidenceRecord[] {
      return records.slice();
    },

    uniqueUrls(): string[] {
      return Array.from(urlSet);
    },

    citations(): string[] {
      return records
        .filter((r) => r.url)
        .map((r) => `${r.title ? r.title + " — " : ""}${r.url}`);
    },

    clear() {
      records.length = 0;
      urlSet.clear();
      counter = 0;
    },
  };
}
