# Jina AI Provider

> Configuration, endpoints, and known limitations for the Jina AI research provider.

## What Is Jina AI?

[Jina AI](https://jina.ai) provides free and paid APIs for reading web pages and performing web searches. Venice Forge integrates two Jina endpoints:

- **Reader** — `https://r.jina.ai/<URL>` returns extracted article text from any public URL.
- **Search** — `https://s.jina.ai/?q=<query>` returns search results as structured text.

Both endpoints work without an API key for low-volume usage. A paid key increases rate limits and unlocks higher throughput.

## Configuration

### Desktop (Electron)

1. Open **Settings → Jina API Key**.
2. Enter your Jina API key (starts with `jina_`).
3. Click **Save key**.

The key is encrypted with OS-level safeStorage (DPAPI on Windows, Keychain on macOS) and stored in `secure-prefs.json` alongside the Venice API key. The renderer process never sees the raw key.

### Web Mode

Jina key storage is desktop-only. In web mode, Jina endpoints are called without authentication (free tier). If you need authenticated Jina access in web mode, set the key server-side in the Express proxy environment.

### Removing the Key

Click **Delete key** in Settings to remove the stored key from secure storage. The Jina provider will continue to work in unauthenticated (free) mode.

## Endpoints

### Reader (`r.jina.ai`)

```
GET https://r.jina.ai/<absolute-target-url>
Authorization: Bearer <jina-api-key>   (optional)
Accept: application/json               (optional, for structured output)
```

**Response (JSON mode):**
```json
{
  "title": "Page Title",
  "url": "https://example.com/article",
  "content": "Extracted plain-text content...",
  "description": "Meta description or summary"
}
```

**Response (plain text):** Markdown-formatted article text.

### Search (`s.jina.ai`)

```
GET https://s.jina.ai/?q=<url-encoded-query>
Authorization: Bearer <jina-api-key>   (optional)
Accept: application/json               (optional)
```

**Response (JSON mode):** Array of search results with `title`, `url`, `content`, and `description`.

**Response (plain text):** Numbered markdown list of results.

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Invalid URL | Returns `Error("Invalid URL")` before network call |
| HTTP 4xx/5xx | Normalized to `Error("Jina request failed: <status>")` |
| JSON parse failure | Falls back to plain-text parsing; if that also fails, returns `Error("Jina response unreadable")` |
| Network timeout | Uses the same `AbortSignal` timeout as the research runner budget |

## Known Limitations

The following Jina features are documented in Jina's API reference but **not confirmed live** and are therefore not wired in Venice Forge:

- `x-respond-with` (alternative output formats)
- `x-timeout` (per-request server-side timeout)
- `x-no-cache` (cache bypass)
- `x-token-budget` and `x-max-tokens` (output length limits)
- `x-with-links-summary` and `x-with-images-summary` (metadata enrichment)

These may be added in a future release once behavior is verified.

## Privacy & Security

- Jina requests are sent directly from the Electron main process (desktop) or Express proxy (web). No third-party server other than Jina is involved.
- The API key header (`Authorization: Bearer ...`) is redacted from all diagnostics, logs, and exports.
- Jina Reader only fetches **public** URLs. Private networks, `localhost`, and RFC 1918 addresses are blocked by the Generic HTTP provider's SSRF blocklist, which also applies to any URL passed to Jina Reader.
