# Research Providers

> Architecture and usage guide for Venice Forge's multi-provider research subsystem.

## Overview

Venice Forge supports pluggable research backends for **search**, **scrape**, and **public-profile discovery** operations. The default provider is Venice's own `/augment/*` endpoints. An optional **Jina AI** provider offers reader and search capabilities without consuming Venice API credits. A **Generic HTTP** fallback exists for scrape-only use cases but is **disabled by default** for security reasons.

All providers share a common type contract and are consumed through the same UI module (`SearchScrapeModule`).

## Provider Summary

| Provider | ID | Search | Scrape | Social Discovery | Document Parsing | Requires Key |
|----------|----|--------|--------|------------------|------------------|--------------|
| Venice | `venice` | Yes | Yes | No | Yes | Yes (Venice API key) |
| Jina AI | `jina` | Yes | Yes | No | No | Optional (free tier works without) |
| Generic HTTP | `generic-http` | No | Yes | No | No | No |

## Architecture

```
┌─────────────────────────────────────────────┐
│  SearchScrapeModule (React)                 │
│  - Provider selector                          │
│  - Authorization gate (profile discovery)     │
│  - Budget controls                            │
└───────────────────┬─────────────────────────┘
                    │
┌───────────────────▼─────────────────────────┐
│  ResearchProvider interface                   │
│  id, label, supports{}, search(), scrape()   │
└───────────────────┬─────────────────────────┘
                    │
    ┌───────────────┼───────────────┐
    ▼               ▼               ▼
┌─────────┐  ┌─────────────┐  ┌──────────────┐
│ Venice  │  │ Jina        │  │ Generic HTTP │
│ Provider│  │ Provider    │  │ Provider     │
└─────────┘  └─────────────┘  └──────────────┘
```

### Key Design Decisions

1. **Renderer never sees raw API keys.** The Jina key is stored via Electron `safeStorage` in the main process (same policy as the Venice key). The renderer only knows whether a key is configured, not its value.
2. **Fail-safe defaults.** The Generic HTTP provider is disabled until explicitly enabled in settings. This prevents accidental SSRF exposure.
3. **Budget enforcement.** Every research job runs through `researchRunner.ts`, which enforces hard limits on queries, results, pages, and timeouts.
4. **Evidence-only synthesis.** The AI Research tab gathers evidence first, then builds a constrained synthesis prompt. The model is never asked to browse autonomously.

## File Map

| File | Purpose |
|------|---------|
| `src/research/providerTypes.ts` | `ResearchProvider` interface and input/output types |
| `src/research/providers/veniceResearchProvider.ts` | Wraps existing `veniceFetch` for `/augment/search` and `/augment/scrape` |
| `src/research/providers/jinaResearchProvider.ts` | Adapts Jina Reader (`r.jina.ai`) and Search (`s.jina.ai`) |
| `src/research/providers/genericHttpScrapeProvider.ts` | SSRF-safe minimal HTTP client; disabled by default |
| `src/research/agent/researchRunner.ts` | Budgeted multi-step runner with `AbortSignal` support |
| `src/research/agent/researchSynthesis.ts` | Evidence-only prompt builder with citation rules |
| `src/research/agent/socialDiscovery.ts` | Public-profile query generator and confidence scorer |
| `src/research/index.ts` | Barrel export for the subsystem |

## Provider Selection in UI

The `SearchScrapeModule` renders a provider selector when running AI Research or Public Profile Discovery. "Auto" attempts Venice first, then falls back to Jina if the Venice key is not configured.

## Adding a New Provider

1. Implement `ResearchProvider` in `src/research/providers/<id>ResearchProvider.ts`.
2. Export a factory function if the provider needs runtime configuration (e.g., API keys).
3. Add tests in `src/research/providers/<id>ResearchProvider.test.ts`.
4. Register the provider in `SearchScrapeModule` and wire key storage if needed.
5. Update this document.

## Security Notes

- All search/scrape traffic respects the existing endpoint allowlist and safety guard.
- The Generic HTTP blocklist is string-based (no DNS resolution) to prevent TOCTOU attacks.
- Jina and Generic HTTP responses are stripped of `<script>` and `<style>` tags before display.
- No cookies, custom user-agents, or JavaScript execution are performed by any provider.
