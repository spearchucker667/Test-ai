# Venice Forge — Agent Guide

> This file is for AI coding agents. If you are reading this, you are expected to know nothing about the project; everything you need is documented below.

## Project Overview

Venice Forge is a **dual-platform (Windows & macOS) Electron desktop application** that provides a private AI creation studio for the [Venice API](https://venice.ai). It supports streaming chat, image generation, batch prompting, web research, model discovery, a local image gallery, and data import/export.

The project is designed to run in **two modes** from a single renderer codebase:

- **Electron desktop mode** (production): The renderer is sandboxed with no Node.js access. API calls travel through a narrow preload bridge (`window.veniceForge`) to the main process, which holds the API key in OS-encrypted storage and makes HTTPS calls to `api.venice.ai`.
- **Web mode** (development): The renderer runs in a browser and calls an Express proxy server (`/api/venice/*`) that forwards requests to `api.venice.ai`. The API key lives in a `.env` file.

Key design goals: privacy by default (API keys never reach the renderer), offline-first storage (IndexedDB, no cloud sync), and practical security (strict IPC validation, CSP, navigation lockdown).

## Technology Stack

| Layer | Technology |
|-------|-----------|
| UI | React 19, TypeScript strict mode, Tailwind CSS v4 |
| Build tool (renderer) | Vite 6 |
| Desktop shell | Electron 42 |
| Packaging | electron-builder 26 (Windows NSIS + portable, macOS DMG + ZIP) |
| Web proxy (dev) | Express 4, `http-proxy-middleware` 4 |
| State management | React `useReducer` + Immer |
| Storage | IndexedDB (`StorageService`) for images, chats, settings; Electron `safeStorage` for the API key |
| Testing | Vitest 4, `@testing-library/react`, `jsdom`, `supertest` |
| Build (Electron main) | `tsc` (CommonJS → `dist-electron/`) |
| Build (server) | esbuild (`server.ts` → `dist/server.cjs`) |

Requirements: Node.js 20 or 22, npm 10+, Windows 10/11 or macOS for release builds.

## Project Structure

```
├── electron/               # Electron main-process code
│   ├── main.ts             # Entry point: window creation, CSP, navigation guards
│   ├── preload.ts          # contextBridge API exposed to renderer
│   ├── ipc/
│   │   ├── handlers.ts     # ipcMain.handle registrations
│   │   ├── updates.ts      # Auto-updater IPC channels and broadcasting
│   │   ├── validation.ts   # Input validation for all Venice IPC requests
│   │   └── validation.test.ts
│   └── services/
│       ├── logger.ts       # Rotated file logging with redaction
│       ├── secureStore.ts  # Electron safeStorage API key management
│       └── veniceClient.ts # Raw Node.js HTTPS client to api.venice.ai
├── src/
│   ├── components/         # Reusable UI primitives (Chip, TabButton, ToastHost, etc.)
│   ├── constants/          # App-wide constants (tabs, fallback models, DB config)
│   ├── modules/            # One file per application tab (ChatModule, ImageModule, ...)
│   ├── services/           # Business logic, API clients, storage, crypto, export/import
│   ├── shared/             # Code shared between renderer and main process
│   │   └── validation.ts   # Allowed Venice endpoints and methods
│   ├── state/
│   │   ├── appReducer.ts   # Global reducer (used with Immer)
│   │   └── appReducer.test.ts
│   ├── types/              # TypeScript interfaces (app.ts, venice.ts, storage.ts, desktop.ts)
│   ├── utils/              # Pure utilities (image.ts, markdown.tsx, downloads.ts)
│   ├── App.tsx             # Root shell: reducer, tab routing, bridge init
│   ├── main.tsx            # React root entry
│   └── index.css           # Global styles + CSS variables
├── server.ts               # Express app factory + Vite dev server bootstrap
├── server.test.ts          # Express proxy validation and rate-limit tests
├── vite.config.ts          # Vite config (renderer build)
├── tsconfig.json           # Renderer TypeScript config (ESNext, no emit)
├── tsconfig.electron.json  # Electron main TypeScript config (CommonJS, emits to dist-electron/)
├── electron-builder.config.cjs # electron-builder config (NSIS + portable)
├── package.json
├── build/icon.ico          # Required for Windows packaging
└── .env.example            # Environment variable template
```

## Build and Development Commands

```bash
# Development
npm run dev:electron       # Electron desktop mode (recommended)
npm run dev:web            # Vite + Express web mode

# Building
npm run build              # Full build: web (dist/) + server (dist/server.cjs) + Electron main (dist-electron/)
npm run build:web          # Vite renderer build only
npm run build:server       # esbuild server.ts → dist/server.cjs
npm run build:electron     # tsc electron/ → dist-electron/ + create CJS package.json

# Type checking
npm run typecheck          # TypeScript check for renderer AND Electron main
npm run lint               # Alias for tsc --noEmit (renderer only)

# Testing
npm test                   # Run all tests once (Vitest)
npm run test:watch         # Vitest in watch mode
npx vitest run <path>      # Run a single test file

# Packaging
npm run dist:win           # Build + create Windows NSIS installer and portable .exe
npm run dist:mac           # Build + create macOS DMG and ZIP
npm run dist               # Windows defaults (NSIS)
npm run verify:icon        # Ensure build/icon.ico and icon.icns exists
npm run verify:dist        # Validate release/ artifacts

# Maintenance
npm run clean              # Remove dist/, dist-electron/, release/
npm run generate:icon      # Generate a placeholder icon (replace before public release)
```

The full CI pipeline is `npm run ci` → `npm ci && npm run typecheck && npm test && npm run build`.

## Code Organization and Module Divisions

### Renderer (`src/`)

- **`App.tsx`** holds the single global `useReducer` and routes between tabs. Every module receives `{ state, dispatch }`.
- **`modules/`** contains one self-contained module per tab:
  - `ChatModule.tsx` — streaming chat completions
  - `ImageModule.tsx` — image generation, upscaling, recent prompts
  - `BatchModule.tsx` — sequential batch text/image prompting
  - `SearchScrapeModule.tsx` — web search, page scrape, document text parsing
  - `ModelsModule.tsx` — live model catalog browser
  - `GalleryModule.tsx` — local IndexedDB image gallery
  - `SettingsModule.tsx` — API key, theme, defaults, import/export
  - `DiagnosticsModule.tsx` — transport info, rate limits, logs
- **`services/veniceClient.ts`** is the **only** renderer entry point for Venice API calls. Use `veniceFetch()` (non-streaming) and `veniceStreamChat()` (streaming). Do not call `fetch('/api/venice/...')` directly and never call `window.veniceForge.venice` directly from modules.
- **`services/desktopBridge.ts`** abstracts Electron vs. web mode. Any code that behaves differently between the two must use `isElectron()` from this module. It re-exports all Electron-only APIs with safe no-op fallbacks for web mode.
- **`services/storageService.ts`** manages IndexedDB. Stores: `images`, `chats`, `settings`, `diagnostics`.
- **`services/cryptoService.ts`** encrypts `chats` and `settings` at rest in IndexedDB using AES-GCM.

### Electron Main Process (`electron/`)

- **`main.ts`** bootstraps the app, creates the `BrowserWindow` with `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, injects CSP headers, and locks navigation to app URLs + trusted external HTTPS links.
- **`preload.ts`** is the **only** bridge to the renderer. It exposes `window.veniceForge` with methods for Venice requests, API key management, app diagnostics, and JSON file dialogs. No raw `ipcRenderer` is leaked.
- **`ipc/handlers.ts`** registers all `ipcMain.handle` channels. Every handler sanitizes errors with `sanitizeError()` to redact API keys before returning them to the renderer.
- **`ipc/validation.ts`** enforces strict input validation on all Venice-bound IPC requests: endpoint whitelist, method whitelist (GET/POST only), body size ≤ 25 MiB, forbidden header stripping (`authorization`, `host`, `cookie`), and origin locking.
- **`services/veniceClient.ts`** performs the actual HTTPS requests to `api.venice.ai` using Node.js `https.request`. Supports streaming (SSE) and abort via `signalId`.
- **`services/secureStore.ts`** stores the API key using Electron `safeStorage`. On Windows, DPAPI encryption is mandatory; saving fails if it is unavailable. Plaintext fallback is gated behind `VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE=true`.
- **`services/logger.ts`** writes to a rotated log file (`userData/logs/venice-forge.log`, 1 MiB cap). Redacts secrets before writing.

### Shared Code

- **`src/shared/validation.ts`** defines `ALLOWED_VENICE_ENDPOINTS` and `ALLOWED_VENICE_METHODS`. This file is imported by both the renderer (web proxy path) and the Electron main process (IPC validation path) to ensure the allowlist never drifts.

## Development Conventions

### TypeScript

- Strict mode is enabled globally (`strict: true`, `noImplicitAny: true`).
- The renderer compiles with `module: ESNext`, `moduleResolution: bundler`, `noEmit: true`.
- The Electron main compiles with `module: CommonJS`, `moduleResolution: node`, emitting to `dist-electron/`.
- Path alias `@/*` maps to the project root.

### State and API Patterns

- **State:** Single global `useReducer` in `App.tsx`, mutated with Immer (`produce`). Action types are a discriminated union in `src/types/app.ts`.
- **Diagnostics:** Pass `dispatch` to every `veniceFetch`/`veniceStreamChat` call so `SET_DIAGNOSTICS` actions are emitted automatically.
- **Abort:** All long-running requests accept an `AbortSignal` and clean up on unmount.
- **Retries:** `veniceFetch` and `veniceStreamChat` automatically retry up to 3 times with exponential back-off for `429`, `500`, and `503` responses.

### Image Workflow

- Always use `extractImages(payload)` from `src/utils/image.ts` to normalize Venice API image responses. It handles multiple payload shapes and deduplicates.
- Save images via `saveImageRecord()` in `src/services/imageWorkflowService.ts`. When saving in a loop, pass `skipRefresh: true` and call `refreshGallery(dispatch)` once at the end.
- Bulk gallery download is capped at 50 images with a 300 ms inter-item delay.
- Filenames are built with `galleryFilename(item)`, which sanitizes to `[a-z0-9_-]` and produces `<model>-<id>.png`.

### Export / Import

- Export format: `{ version: 1, exportedAt, appVersion, data: { images, chats, settings } }`.
- Max payload: 25 MB.
- Only `images`, `chats`, and `settings` stores are allowed. Unknown stores are rejected.
- Import merges by ID; it never clears existing data. A pre-import backup is saved to disk before overwriting.
- API keys are **never** exported or imported. `redactSecrets()` strips fields matching `/api[-_ ]?key|authorization|password|secret|token/i` and scrubs Bearer tokens and Venice key patterns (`vn-...`).

### Component Conventions

- Modules use `function` declarations, not arrow functions.
- Local module state (forms, loading, errors) uses `useState`; shared state uses the global reducer.
- CSS classes use kebab-case (e.g., `content-card`, `chip-row`).
- Theming is CSS-variable driven in `index.css`.

## Testing Instructions

- **Runner:** Vitest 4 with `jsdom` as the default environment.
- **Server tests** must opt in to the Node environment with `// @vitest-environment node` at the top of the file (see `server.test.ts`).
- **File locations:** Tests live next to the source file they cover (e.g., `src/services/foo.ts` → `src/services/foo.test.ts`). The only exception is `server.test.ts` at the repo root.

### Key Testing Patterns

1. **Mocking the proxy** — `server.test.ts` stubs `http-proxy-middleware` with `vi.mock(...)` before importing `server.ts` so tests assert validation behavior (403/405) without real network calls.
2. **Stubbing `window.veniceForge`** — `desktopBridge.test.ts` uses `vi.stubGlobal("window", {})` to simulate browser (non-Electron) mode and verify no-op fallbacks.
3. **Pure-function tests** — Prefer testing pure functions directly with no mocking: call the function, assert on the return value.
4. **Regression guards** — When fixing a bug, add or annotate a test with `// BUG-NNN regression guard` so the same bug cannot regress.
5. **Rate-limit state isolation** — Create a fresh `app` in `beforeEach` (not `beforeAll`) for any test that depends on in-process mutable state.

### Running Tests

```bash
npm test                          # All tests
npm run test:watch                # Watch mode
npx vitest run server.test.ts     # Single file
npx vitest run src/services/exportImport.test.ts
```

## Security Considerations

### API Key

- The Venice API key is **never** exposed to the renderer.
- In Electron, it is stored via `safeStorage` (DPAPI on Windows, Keychain on macOS, Secret Service on Linux).
- In web mode, it is read from `VENICE_API_KEY` in `.env` and kept server-side.
- The key is never exported, imported, written to IndexedDB, or included in diagnostics.

### IPC and Transport

- Only these Venice endpoints are permitted (enforced in both Electron IPC and the web proxy):
  - `GET /models`
  - `POST /chat/completions`
  - `POST /image/generate`
  - `POST /image/upscale`
  - `POST /augment/search`
  - `POST /augment/scrape`
  - `POST /augment/text-parser`
- If you add a new endpoint, update **both** `src/shared/validation.ts` and `electron/ipc/validation.ts`.
- If you add a new IPC channel, update **all three** of `electron/preload.ts`, `electron/ipc/handlers.ts`, and `electron/ipc/validation.ts`.
- Max request body: 25 MiB (both IPC and web proxy).
- Forbidden headers (`authorization`, `host`, `cookie`) are stripped from renderer-supplied headers.

### CSP and Navigation

- Production CSP is strict: `default-src 'self'`, `script-src 'self'`, `style-src 'self' 'unsafe-inline'`, `img-src 'self' data: blob:`, `connect-src 'self'`.
- Navigation is blocked except for app files and trusted external HTTPS links (which open in the OS browser).
- Packaged production DevTools are disabled unless `VENICE_FORGE_DEBUG_DEVTOOLS=true`.

### Web Proxy Hardening

- Security headers on every response: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Content-Security-Policy`.
- Per-IP rate limiting: default 60 requests per 60-second window (`RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX_REQUESTS`).
- Circuit breaker: trips after 5 consecutive upstream 5xx/network errors, stays open for 30 seconds.
- The rate-limit map is periodically cleaned to prevent unbounded memory growth.

### Redaction

- Use `redactSecrets()` from `src/services/redaction.ts` before logging or surfacing any user-supplied or API-supplied content.
- `sanitizeError()` in `electron/ipc/handlers.ts` redacts API keys from error messages before they reach the renderer.
- `logger.ts` redacts `Bearer ...` tokens, `vn-...` keys, and generic secret fields before writing to disk.

### Known Limitations

- Auto-updates are fetched securely via GitHub Releases.
- Release signing is optional and not required for local builds.
- IndexedDB contents are not encrypted at rest (except `chats` and `settings` via `cryptoService`).
- Malware or a debugger running as the same OS user is out of scope.
- Unsigned installers trigger Windows SmartScreen warnings.

## Deployment and Packaging

### Local Windows Build

```bash
npm run verify:icon
npm run dist:win
npm run verify:dist
```

Artifacts are written to `release/`:

- `Venice-Forge-<version>-x64-Setup.exe` — NSIS installer
- `Venice-Forge-<version>-x64-Portable.exe` — portable executable

### Code Signing

- Local builds are unsigned by default.
- To sign, set standard electron-builder environment variables: `CSC_LINK`, `CSC_KEY_PASSWORD`, `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`.
- Do not commit certificates or passwords to the repository.

### Release Process

1. Update `version` in `package.json`.
2. Run `npm install` to sync `package-lock.json`.
3. Update `CHANGELOG.md` with the new version section.
4. Run the full CI pipeline: `npm run ci`.
5. Run `npm run dist:win` and `npm run verify:dist`.
6. Create and push a Git tag: `git tag v<version> && git push origin v<version>`.
7. The GitHub Actions `windows-release.yml` workflow builds and uploads artifacts automatically.
8. Smoke-test on a clean Windows VM, then publish the release notes.

### CI / CD

- **CI** (`.github/workflows/ci.yml`): Runs on every push/PR to `main` on `ubuntu-latest`, matrix across Node 20.x and 22.x. Steps: `npm ci` → `typecheck` → `test` → `build`.
- **Windows Release** (`.github/workflows/windows-release.yml`): Triggered by manual `workflow_dispatch` or tags `v*`. Runs on `windows-latest`, Node 22. Steps: install → verify icon → typecheck → test → build → `dist:win` → verify dist → upload artifacts.

## Environment Variables

Copy `.env.example` to `.env` for local development:

| Variable | Default | Purpose |
|----------|---------|---------|
| `VENICE_API_KEY` | — | Venice API inference key (web mode only) |
| `PORT` | `3000` | Express server port |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate-limit time window |
| `RATE_LIMIT_MAX_REQUESTS` | `60` | Max requests per window per IP |
| `MAX_PROXY_BODY_BYTES` | `26214400` (25 MiB) | Max proxy request body size |
| `DISABLE_HMR` | `false` | Set to `true` to disable Vite HMR |
| `TRUST_PROXY` | — | Express `trust proxy` setting (numeric hops or string) |

Electron-only runtime variables:

| Variable | Purpose |
|----------|---------|
| `NODE_ENV` | `development` or `production` |
| `VENICE_FORGE_DEBUG_DEVTOOLS` | Set to `true` to enable DevTools in packaged builds |
| `VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE` | Set to `true` to allow plaintext API key fallback on non-Windows platforms |
