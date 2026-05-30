# Public Profile Discovery

> Guide to the public-profile discovery feature in Venice Forge.

## Overview

Public Profile Discovery helps you find **publicly available** online profiles for a person or brand. It is not an OSINT reconnaissance tool — it only queries search engines with structured `site:` queries and scores the resulting candidates by confidence.

## Supported Platforms

The following platforms have predefined `site:` query templates:

| Platform | Query Strategy |
|----------|---------------|
| GitHub | `site:github.com "<name>"` + handle if known |
| LinkedIn | `site:linkedin.com/in "<name>"` |
| X (Twitter) | `site:twitter.com "<name>"` or `site:x.com "<name>"` |
| Facebook | `site:facebook.com "<name>"` |
| Instagram | `site:instagram.com "<name>"` |
| Reddit | `site:reddit.com/user "<name>"` |
| Mastodon | `site:mastodon.social "<name>"` (generic instance) |
| Bluesky | `site:bsky.app "<name>"` |
| YouTube | `site:youtube.com "<name>"` |
| Medium | `site:medium.com "<name>"` |
| Dev.to | `site:dev.to "<name>"` |
| Stack Overflow | `site:stackoverflow.com/users "<name>"` |

## Authorization Gate

Before running a discovery job, you **must** check the authorization box confirming one of the following:

- The search is for yourself.
- The search is for your organization or brand.
- The search is for a consenting person.
- The search is for a public figure.
- The search is for another authorized public-interest use.

The **Run Discovery** button is disabled until the checkbox is checked.

## Confidence Scoring

Results are scored deterministically based on matched signals:

| Level | Score | Signals Required |
|-------|-------|-----------------|
| **High** | ≥ 0.7 | Domain match + handle match + name match |
| **Medium** | 0.4 – 0.69 | Name match + one weak identifier (org, partial handle) |
| **Low** | < 0.4 | Name-only or ambiguous match |

### Important Notes on Low Confidence

- Mastodon and Bluesky results are often scored **Low** because instance handles are federated and hard to verify without exact prior knowledge.
- A Low score does not mean the result is wrong — it means you should manually verify the link before using it.

## What Is NOT Collected

The tool explicitly does **not** attempt to discover or display:

- Phone numbers
- Home or work addresses
- Family members or relationships
- Private email addresses
- Inferred sensitive attributes (political affiliation, religion, health status, etc.)

## Output Format

Each candidate result includes:

```ts
{
  platform: string;           // e.g. "github"
  handle?: string;            // Username if extracted
  displayName?: string;       // Name as shown on profile
  url: string;                // Direct profile URL
  bioSnippet?: string;        // Short bio text if available
  matchedSignals: string[];   // Which signals triggered the match
  confidence: "low" | "medium" | "high";
  confidenceScore: number;    // 0.0 – 1.0
  evidenceUrls: string[];     // Search result URLs that produced this candidate
  notes?: string;             // Human-readable caveats
  checkedAt: string;          // ISO timestamp
}
```

## Data Retention

Discovery results are **not persisted** to disk or IndexedDB. They exist only in the current React component state and are lost when the tab is changed or the app is closed. If you need to keep results, export them manually via copy/paste or the module's export flow.

## Security & Compliance

- All queries are sent through the configured research provider (Venice, Jina, or Generic HTTP) and are subject to the same safety guard and endpoint allowlist.
- The feature requires explicit user authorization on every run — there is no batch or automated mode.
- Results are sourced from public search indices only. No private databases, breach dumps, or dark-web sources are queried.
