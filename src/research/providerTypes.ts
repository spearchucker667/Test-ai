// Code Owner: fayeblade (@spearchucker667)
/** @fileoverview Typed provider interface for the Venice Forge research subsystem.
 *
 * All research providers — Venice, Jina, generic HTTP — normalize into this shape.
 * The renderer never sees provider API keys; keys are managed by the main process.
 */

export type ResearchProviderId = "venice" | "jina" | "generic-http";

export interface SearchInput {
  query: string;
  maxResults?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  options?: Record<string, unknown>;
}

export interface ScrapeInput {
  url: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  options?: {
    outputFormat?: "markdown" | "text" | "json";
    respectRobotsTxt?: boolean;
    doNotCache?: boolean;
    removeImages?: boolean;
    includeLinksSummary?: boolean;
    includeImagesSummary?: boolean;
    tokenBudget?: number;
  };
}

export interface SearchResult {
  provider: ResearchProviderId;
  title: string;
  url: string;
  snippet?: string;
  content?: string;
  publishedAt?: string;
  raw?: unknown;
}

export interface ScrapeResult {
  provider: ResearchProviderId;
  url: string;
  finalUrl?: string;
  title?: string;
  markdown?: string;
  text?: string;
  content?: string;
  raw?: unknown;
  fetchedAt: string;
}

export interface ResearchProvider {
  id: ResearchProviderId;
  label: string;
  supports: {
    search: boolean;
    scrape: boolean;
    socialDiscovery: boolean;
    documentParsing: boolean;
  };
  search?(input: SearchInput): Promise<SearchResult[]>;
  scrape?(input: ScrapeInput): Promise<ScrapeResult>;
}
