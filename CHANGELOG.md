# Changelog

All notable changes to this project will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Venice Forge uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- Added dual-platform macOS + Windows packaging support.
- Added generated macOS `.icns` application icon.
- Added cross-platform checksum sidecar generation (`.sha256`) for distribution artifacts.
- Added cross-platform local testing and release verification scripts.
- Added macOS release workflow (`macos-release.yml`) for `arm64` and `x64` builds.
- Added ESLint configuration (`eslint.config.mjs`) with TypeScript-ESLint and React Hooks rules.
- Added Vitest coverage reporting via `@vitest/coverage-v8` and `npm run test:coverage`.
- Added GitHub CodeQL security analysis workflow (`.github/workflows/codeql.yml`).
- Added `npm run lint:eslint` script for static analysis.
- Added README release ribbon and badges for CI, Windows release, latest GitHub release, license, Node support, TypeScript strict mode, Electron, and Venice API.
- Added `docs/REPOSITORY_TREE.md` with a public repository map and segment ownership notes.
- Added `docs/LEGAL.md` with Venice.ai TOS/privacy/API links, affiliation notice, API key handling notes, and release disclaimers.
- Added root `SECURITY.md`, `SUPPORT.md`, GitHub issue templates, pull request template, and Dependabot configuration.
- Added `docs/Venice_swagger_api.yaml` and `docs/venice_llm_info.md` as the canonical API reference used for alignment work.

### Changed
- Refactored `verify-dist` to support both Windows and macOS file validations.
- `secureStore.ts` strictly enforces macOS Keychain encryption exactly like Windows DPAPI.
- Updated all supporting documentation to match the current app status and public release process.
- CI workflow now uses `npm ci --prefer-offline` for slightly faster installs and reproducibility.
- Windows release workflow now generates and uploads SHA-256 checksum sidecar files for `.exe` artifacts.
- Updated `metadata.json` to describe Venice Forge instead of the previous empty/generated metadata.
- `readDesktopErrorBody` (`src/services/veniceClient.ts`) and `readResponseError` (`electron/services/veniceClient.ts`) both now correctly parse Venice `DetailedError` (Zod format: `{ details: { _errors, fieldName: { _errors } } }`) — previously fell through to "Unknown Venice API error" for all schema-validation failures.
- Diagnostic dispatch deduplication: failed Venice requests now emit exactly one `SET_DIAGNOSTICS` entry with the resolved error message. Previously, each failure emitted two entries — an initial empty-error entry and a second entry with the error — causing duplicate rows in the Status log.
- Web-mode diagnostics parity: non-2xx responses in the web transport now parse Venice `DetailedError` consistently and avoid catch-path duplicate diagnostics once an HTTP diagnostics entry has already been emitted.

### Fixed
- **CI:** `.github/workflows/windows-release.yml` referenced non-existent `actions/checkout@v6` and `actions/setup-node@v6`. Downgraded to `@v4` to match the latest published action versions and restore the release pipeline.
- **Test:** `src/services/desktopBridge.test.ts` failed with `ReferenceError: indexedDB is not defined` because `vi.stubGlobal("window", {})` stripped the fake-indexeddb instance from jsdom. The test now stubs `window` with `{ indexedDB: global.indexedDB }` so the `isConfigured()` path can open the fake database.
- **BUG-004:** `enable_web_search` was serialised as a boolean (`true`/`false`) instead of the required string enum (`"auto"` / `"on"` / `"off"`), causing HTTP 400 on every `/chat/completions` request. `buildChatPayload` now passes the string value directly (defaulting to `"off"`).
- **BUG-005:** Venice `DetailedError` responses (Zod validation failures) were not parsed — the error body contains a `details` object with `_errors` arrays and no top-level `error` field. Both the renderer and Electron main-process clients now extract the first `_errors` message or a field-level error when present.
- **BUG-006:** Every failed Venice request produced two entries in the diagnostics log: one with `error: ""` from the initial HTTP dispatch, and a second with the actual message from the retry/catch path. The redundant dispatch has been removed; the initial entry now carries the fully resolved error.
- **BUG-007:** Legacy persisted settings could still carry boolean `webSearch` values (`true`/`false`), which mapped to invalid API payloads and recurring `400` schema errors. Settings ingestion now coerces legacy values to `on`/`off`/`auto`, and chat payload construction enforces the same normalization.
- **BUG-008:** Desktop `/augment/text-parser` uploads were unstable because `veniceFetchDesktop` serialized `FormData` but still sent the raw body over IPC. The request now correctly sends the serialized multipart payload, restoring reliable file-upload request construction.

### Security
- Explicitly disabled plaintext API-key fallback on macOS.
- Documented web proxy forbidden-header stripping and proxy-root rejection.
- Added Venice.ai TOS, privacy, and API documentation coverage for public releases.

---

## [1.0.1] — 2026-05-20

### Security
- **SEC-001:** Added `/augment/search`, `/augment/scrape`, `/augment/text-parser` to the IPC and web-proxy endpoint allowlist. These endpoints were previously blocked, making the Research tab non-functional in both Electron and web modes.
- **SEC-002:** Added `safeHref()` sanitization to search result anchor tags. Only `http:` and `https:` scheme URLs are allowed; `javascript:`, `data:`, and other schemes are replaced with `#` to prevent XSS.
- **SEC-003 (web proxy):** Added security response headers — `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and `Content-Security-Policy` — to all web-proxy responses.

### Fixed
- **BUG-001:** `galleryFilename` was called with a plain string instead of the item object in bulk gallery download, producing `venice-undefined-undefined.png` filenames for all downloads.
- **BUG-002:** Import backup was constructed in memory but never written to disk before import records were applied, misleading the user with a "backup prepared" message.
- **BUG-003:** Removed dead `const endedAt = nowIso()` variable captured before `fetch()` was called in `veniceClient.ts`.

### Changed
- `upscaleGalleryImage` now accepts a `model` parameter (default `"upscale-model"`); `GalleryModule` passes `state.selectedImageModel` so the currently selected model is used.
- Express `trust proxy` is configurable through `TRUST_PROXY`; removed deprecated `req.connection.remoteAddress` fallback so rate limiting uses the correct client IP behind a configured reverse proxy.
- Excluded `vite.config.ts` and test files from `tsconfig.json`; `npm run typecheck` now exits with zero errors.

### Added
- 25 new tests across `server.test.ts`, `src/utils/image.test.ts`, `src/utils/markdown.test.ts` — total 41 tests (was 16). Coverage includes: augment endpoint validation, rate limiter enforcement, security header assertions, `galleryFilename` regression guard, `normalizeImageData`, `extractImages`, markdown XSS safety, and `escapeHtml`.

---

## [1.0.0] — 2026-05-20

### Added

**Core features**
- Dual-mode application: Electron desktop (Windows) and Vite/Express web development mode.
- **Prompt tab:** Streaming chat completions with system-prompt control, model selection, stop/abort, and conversation history stored in IndexedDB.
- **Create tab:** Single and batch image generation with configurable dimensions, steps, guidance scale, negative prompt, seed, and watermark control. One-click upscaling via Venice upscale endpoint. Images saved to local gallery.
- **Batch tab:** Run one prompt across multiple inputs, or run many prompts in sequence, with live progress, abort, and per-result download.
- **Research tab:** Venice-augmented web search (Brave and Google providers), page scraping, and document text extraction via Venice augment endpoints.
- **Catalog tab:** Live Venice model browser showing model ID, type, traits, and capabilities; falls back to built-in model list on network error.
- **Library tab:** Local image gallery with individual download, upscale, delete, and bulk-download (up to 50 images at a time).
- **Config tab:** API key save/test/delete (desktop), theme selection, image/chat model defaults, JSON data import/export with schema validation and ID-merge (not overwrite).
- **Status tab:** Diagnostics panel showing transport mode, runtime/app versions, storage info, API key state, rate-limit headers, and one-click log folder access.

**Architecture and security**
- Electron main process with strict IPC validation (`validateVeniceIpcRequest`), sandboxed renderer, context isolation, and preload bridge (`window.veniceForge`).
- API key stored via Electron `safeStorage`; plaintext fallback disabled unless `VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE=true`.
- Restrictive production CSP; navigation blocked to non-app URLs; external HTTPS links open in OS browser.
- Express web proxy with endpoint allowlist, method validation, rate limiting, circuit breaker, and `express.raw` body passthrough.
- Log redaction for authorization headers, API keys, bearer tokens, and secret-like field values.
- Versioned JSON export/import with size validation, store validation, and secret field stripping.

**Developer experience**
- TypeScript strict mode throughout renderer and Electron main.
- Vitest test suite with supertest integration tests for the Express proxy.
- CI matrix (Node 20 + 22) via GitHub Actions.
- Windows release workflow with NSIS installer and portable exe, upload to GitHub Releases.
- Placeholder icon generation and verification scripts.
- `npm run clean`, `npm run typecheck`, `npm run verify:dist` convenience scripts.
- `.env.example` with all configurable environment variables documented.

[Unreleased]: #unreleased
[1.0.1]: #101--2026-05-20
[1.0.0]: #100--2026-05-20
