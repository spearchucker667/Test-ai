// Code Owner: fayeblade (@spearchucker667)
/** @fileoverview Public social profile discovery workflow.
 *
 * Generates public search queries for authorized targets only.
 * No login scraping, no private account access, no contact harvesting.
 */

import type { ResearchProvider, SearchResult } from "../providerTypes";

export interface SocialDiscoveryInput {
  targetName: string;
  knownUsername?: string;
  knownWebsite?: string;
  knownOrganization?: string;
  knownLocation?: string;
  allowedPlatforms: string[];
  maxSearchDepth: number;
  authorized: boolean;
}

export interface SocialProfileCandidate {
  platform: string;
  handle?: string;
  displayName?: string;
  url: string;
  bioSnippet?: string;
  matchedSignals: string[];
  confidence: "low" | "medium" | "high";
  confidenceScore: number; // 0–1
  evidenceUrls: string[];
  notes?: string;
  checkedAt: string;
}

const PLATFORM_DOMAINS: Record<string, string[]> = {
  GitHub: ["github.com"],
  LinkedIn: ["linkedin.com"],
  "X/Twitter": ["x.com", "twitter.com"],
  Instagram: ["instagram.com"],
  TikTok: ["tiktok.com"],
  YouTube: ["youtube.com"],
  Reddit: ["reddit.com"],
  Facebook: ["facebook.com"],
  Bluesky: ["bsky.app"],
  Threads: ["threads.net"],
  Mastodon: [], // federated — no fixed domain
  "personal website": [],
};

function nowIso(): string {
  return new Date().toISOString();
}

function generatePlatformQueries(input: SocialDiscoveryInput): string[] {
  const { targetName, knownUsername, knownWebsite, knownOrganization, knownLocation } = input;
  const queries: string[] = [];

  for (const platform of input.allowedPlatforms) {
    const domains = PLATFORM_DOMAINS[platform];
    if (domains && domains.length > 0) {
      for (const domain of domains) {
        queries.push(`site:${domain} "${targetName}"`);
        if (knownUsername) {
          queries.push(`site:${domain} "${knownUsername}"`);
        }
        if (knownOrganization) {
          queries.push(`site:${domain} "${targetName}" "${knownOrganization}"`);
        }
        if (knownLocation) {
          queries.push(`site:${domain} "${targetName}" "${knownLocation}"`);
        }
      }
    } else if (platform === "Mastodon") {
      queries.push(`"${targetName}" mastodon`);
      if (knownUsername) queries.push(`"${knownUsername}" mastodon`);
    } else if (platform === "personal website") {
      if (knownWebsite) {
        queries.push(`"${targetName}" "${knownWebsite}"`);
      } else {
        queries.push(`"${targetName}" "personal website" OR "portfolio"`);
      }
    }
  }

  // Deduplicate while preserving order
  return Array.from(new Set(queries)).slice(0, input.maxSearchDepth);
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    let pathname = u.pathname;
    if (pathname.length > 1 && pathname.endsWith("/")) {
      pathname = pathname.slice(0, -1);
    }
    return `${u.origin}${pathname}${u.search}`;
  } catch {
    return url;
  }
}

function extractCandidates(results: SearchResult[]): SocialProfileCandidate[] {
  const byUrl = new Map<string, SocialProfileCandidate>();

  for (const r of results) {
    if (!r.url) continue;
    const norm = normalizeUrl(r.url);
    const existing = byUrl.get(norm);

    if (existing) {
      existing.evidenceUrls.push(r.url);
      if (r.snippet && !existing.bioSnippet) {
        existing.bioSnippet = r.snippet;
      }
      continue;
    }

    const platform = detectPlatform(r.url);
    const handle = extractHandle(r.url, platform);
    const signals: string[] = [];
    if (r.title) signals.push("title match");
    if (r.snippet) signals.push("snippet match");

    byUrl.set(norm, {
      platform,
      handle,
      displayName: r.title,
      url: norm,
      bioSnippet: r.snippet,
      matchedSignals: signals,
      confidence: "low",
      confidenceScore: 0,
      evidenceUrls: [r.url],
      checkedAt: nowIso(),
    });
  }

  return Array.from(byUrl.values());
}

function detectPlatform(url: string): string {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    for (const [platform, domains] of Object.entries(PLATFORM_DOMAINS)) {
      for (const domain of domains) {
        if (hostname === domain || hostname.endsWith(`.${domain}`)) {
          return platform;
        }
      }
    }
    if (hostname.includes("mastodon")) return "Mastodon";
  } catch { /* ignore */ }
  return "unknown";
}

function extractHandle(url: string, platform: string): string | undefined {
  try {
    const pathname = new URL(url).pathname;
    if (platform === "GitHub") {
      const m = pathname.match(/^\/([^\/]+)(?:\/.*)?$/);
      return m?.[1];
    }
    if (platform === "LinkedIn") {
      const m = pathname.match(/\/in\/([^\/]+)/);
      return m?.[1];
    }
    if (platform === "X/Twitter" || platform === "Instagram" || platform === "TikTok" || platform === "Threads") {
      const m = pathname.match(/^\/([^\/]+)(?:\/.*)?$/);
      return m?.[1];
    }
    if (platform === "Reddit") {
      const m = pathname.match(/^\/user\/([^\/]+)/);
      return m?.[1];
    }
    if (platform === "Bluesky") {
      const m = pathname.match(/\/profile\/([^\/]+)/);
      return m?.[1];
    }
    if (platform === "YouTube") {
      const m = pathname.match(/\/@([^\/]+)/) || pathname.match(/\/c\/([^\/]+)/) || pathname.match(/\/channel\/([^\/]+)/);
      return m?.[1];
    }
    if (platform === "Mastodon") {
      const m = pathname.match(/^\/(@[^\/]+)/);
      return m?.[1];
    }
  } catch { /* ignore */ }
  return undefined;
}

function scoreCandidates(
  candidates: SocialProfileCandidate[],
  input: SocialDiscoveryInput
): SocialProfileCandidate[] {
  const { targetName, knownUsername, knownWebsite, knownOrganization } = input;
  const nameLower = targetName.toLowerCase();
  const userLower = knownUsername?.toLowerCase();
  const orgLower = knownOrganization?.toLowerCase();
  const webLower = knownWebsite?.toLowerCase();

  return candidates.map((c) => {
    let score = 0;
    const signals: string[] = [...c.matchedSignals];

    if (c.displayName?.toLowerCase().includes(nameLower)) {
      score += 0.3;
      signals.push("display name match");
    }
    if (c.bioSnippet?.toLowerCase().includes(nameLower)) {
      score += 0.2;
      signals.push("bio name match");
    }
    if (userLower && c.handle?.toLowerCase() === userLower) {
      score += 0.4;
      signals.push("exact handle match");
    }
    if (orgLower && c.bioSnippet?.toLowerCase().includes(orgLower)) {
      score += 0.2;
      signals.push("organization match");
    }
    if (webLower && c.url.toLowerCase().includes(webLower)) {
      score += 0.3;
      signals.push("website match");
    }

    // Platform-specific penalties/boosts
    if (c.platform === "Mastodon" || c.platform === "Bluesky") {
      score *= 0.7; // federated = lower confidence
      signals.push("federated platform");
    }

    score = Math.min(1, Math.max(0, score));

    let confidence: SocialProfileCandidate["confidence"] = "low";
    if (score >= 0.7) confidence = "high";
    else if (score >= 0.4) confidence = "medium";

    return {
      ...c,
      confidence,
      confidenceScore: Math.round(score * 100) / 100,
      matchedSignals: Array.from(new Set(signals)),
    };
  });
}

export interface SocialDiscoveryResult {
  ok: boolean;
  candidates: SocialProfileCandidate[];
  queriesUsed: string[];
  error?: string;
}

/**
 * Runs public profile discovery for an authorized target.
 *
 * Requires `input.authorized === true`; otherwise returns an error.
 */
export async function runSocialDiscovery(
  input: SocialDiscoveryInput,
  provider: ResearchProvider
): Promise<SocialDiscoveryResult> {
  if (!input.authorized) {
    return {
      ok: false,
      candidates: [],
      queriesUsed: [],
      error: "Authorization required. Confirm this search is for an authorized public-interest use.",
    };
  }

  if (!provider.supports.search) {
    return {
      ok: false,
      candidates: [],
      queriesUsed: [],
      error: "Provider does not support search.",
    };
  }

  const queries = generatePlatformQueries(input);
  const allResults: SearchResult[] = [];

  try {
    for (const query of queries) {
      const results = await provider.search!({ query, maxResults: 10 });
      for (const r of results) {
        if (!r.url) continue;
        const norm = normalizeUrl(r.url);
        if (allResults.some((x) => normalizeUrl(x.url || "") === norm)) continue;
        allResults.push(r);
      }
    }

    let candidates = extractCandidates(allResults);
    candidates = scoreCandidates(candidates, input);
    candidates.sort((a, b) => b.confidenceScore - a.confidenceScore);

    return {
      ok: true,
      candidates,
      queriesUsed: queries,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      candidates: [],
      queriesUsed: queries,
      error: message,
    };
  }
}
