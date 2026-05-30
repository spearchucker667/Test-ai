# Venice Forge — Agent Guide

> This file is for AI coding agents. If you are a human contributor, start with [README.md](README.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

## Project Overview

Venice Forge is an unofficial, third-party desktop client for the [Venice API](https://venice.ai). It is a dual-platform Electron application for Windows and macOS, plus a Vite/Express web application for local development. The app provides a unified interface for text generation, image generation, web research, batch automation, and local data management.

- **Product name:** Venice Forge
- **Version:** 1.0.2
- **License:** MIT
- **Maintainer:** fayeblade (@spearchucker667)
- **Repository:** https://github.com/spearchucker667/Venice-API-connector
- **Requirements:** Node.js 20 or 22, npm 10+

**Important legal note:** This project is not affiliated with, endorsed by, sponsored by, or certified by Venice.ai, Inc. Venice names and marks are used solely for nominative identification of API compatibility.

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend UI | React 19, TypeScript strict, Tailwind CSS v4, Vite 6 |
| Desktop shell | Electron 42, electron-builder 26 |
| Web dev server | Express 4, http-proxy-middleware 4, esbuild |
| State management | React `useReducer` + Immer |
| Storage (renderer) | IndexedDB via `StorageService`, AES-GCM encrypted |
| Storage (desktop chat) | Electron main-process filesystem (`chat-history/*.json`) |
| Secure key storage | Electron `safeStorage` (DPAPI / Keychain) |
| Testing | Vitest 4, jsdom, @testing-library/react, supertest |
| Linting | ESLint 9 + typescript-eslint + react-hooks plugin |
| CI/CD | GitHub Actions (Node 20/22 matrix) |

## Architecture

The project has two runtime modes:

1. **Electron desktop (production):** Renderer (React) ↔ IPC preload bridge ↔ Main process (Node.js) ↔ `api.venice.ai`
2. **Web mode (development):** Browser ↔ Vite dev server ↔ Express `/api/venice` proxy ↔ `api.venice.ai`

### Key Directories

| Path | Purpose |
|------|---------|
| `src/` | React renderer: components, modules, services, state, types, styles, theme |
| `electron/` | Electron main process: BrowserWindow, preload, IPC handlers, secure storage, HTTPS client, logger |
| `server.ts` | Express web proxy with Venice API forwarding, rate limiting, circuit breaker, security headers |
| `scripts/` | Build and release verification helpers (CJS) |
| `build/` | Application icons (`icon.ico`, `icon.icns`, `icon.png`) |
| `docs/` | Project documentation (development, release, legal, FAQ) |
| `.github/` | CI workflows, issue/PR templates, Dependabot config |

### Source Organization

- **`src/modules/`** — One file per app tab: `ChatModule`, `ImageModule`, `BatchModule`, `SearchScrapeModule`, `ModelsModule`, `GalleryModule`, `SettingsModule`, `DiagnosticsModule`
- **`src/components/`** — Reusable UI primitives (`TabButton`, `Chip`, `ToastHost`, `ErrorBoundary`, `ConfirmModal`, etc.)
- **`src/services/`** — Renderer-side services:
  - `veniceClient.ts` — Single entry point for all Venice API calls (desktop + web transport)
  - `desktopBridge.ts` — Electron-vs-web abstraction (never call `window.veniceForge` directly from modules)
  - `storageService.ts` — IndexedDB persistence (images, legacy chats, settings, conversations, diagnostics)
  - `chatStorage.ts` — Unified conversation storage abstraction (IPC in Electron, IndexedDB in web)
  - `cryptoService.ts` — AES-GCM encryption for IndexedDB records
  - `exportImport.ts` — Versioned JSON export/import with secret redaction
  - `modelService.ts` — Model fetching and caching
- **`src/state/`** — Global `appReducer` using Immer for immutable updates
- **`src/shared/`** — Code shared between renderer, Electron main, and web proxy:
  - `validation.ts` — Allowed Venice endpoints and methods
  - `safety/` — Content safety guard (child exploitation detection)
  - `apiConfig.ts`, `configSchema.ts` — API host and env configuration
  - `logger.ts`, `limits.ts`, `legal.ts`
- **`electron/ipc/`** — IPC handler registration and request validation
- **`electron/services/`** — Main-process services: `veniceClient.ts`, `secureStore.ts`, `chatStorage.ts`, `logger.ts`
- **`electron/utils/`** — `urlSecurity.ts` (trusted external URL validation), `navigation.ts` (path containment)

## Build and Test Commands

### Development

```bash
npm install
npm run dev:electron   # Desktop app in development mode (recommended)
npm run dev:web        # Vite + Express web proxy mode
```

### Validation (run before any PR)

```bash
npm run lint:eslint    # ESLint with --max-warnings=96 budget
npm run typecheck      # TypeScript check for renderer + Electron
npm test               # Vitest unit and integration tests
npm run build          # Build dist/ (web) and dist-electron/ (main process)
npm run verify:icon    # Validate build icons exist
```

### Packaging

```bash
# Windows
npm run dist:win
npm run checksum:release
npm run verify:dist:win
npm run verify:dist:portable

# macOS
npm run dist:mac
npm run checksum:release
npm run verify:dist:mac
```

Artifacts are written to `release/`. Windows produces NSIS installers and portable executables. macOS produces DMG and ZIP bundles for both x64 and arm64.

### Other Useful Commands

| Command | Description |
|---------|-------------|
| `npm run build:web` | Vite production build |
| `npm run build:electron` | Compile Electron main process TypeScript |
| `npm run build:server` | Bundle `server.ts` to `dist/server.cjs` via esbuild |
| `npm run clean` | Remove `dist/`, `dist-electron/`, `release/` |
| `npm run verify:safety-guard` | Run the script to enforce the safety guard boundaries and no-log policies |
| `npm run test:watch` | Re-run tests on file changes |
| `npm run test:coverage` | Run tests with v8 coverage report |
| `npm run smoke:electron` | Run Electron smoke tests |
| `npm run ci` | Full CI pipeline: `npm ci`, lint, typecheck, test, build |

## Code Style Guidelines

- **TypeScript strict mode** is enforced. Avoid `any`; use proper types.
- Use `function` declarations for modules, not arrow functions.
- CSS styling uses Tailwind v4 utility classes inline with JSX.
- Prefer minimal, focused changes.
- Every file that touches security-critical code should have a `// Code Owner:` header.
- Branch naming convention: `feature/description`, `fix/description`, `security/description`, `docs/description`.

### ESLint Configuration

- Config: `eslint.config.mjs`
- Parser: `typescript-eslint` with project references to both `tsconfig.json` and `tsconfig.electron.json`
- Key rules:
  - `@typescript-eslint/no-explicit-any`: warn
  - `@typescript-eslint/no-unused-vars`: warn (allows `_` prefix)
  - `no-console`: warn (allows `console.warn` and `console.error`)
  - `react-hooks` recommended rules enabled
- Ignored paths: `dist/`, `dist-electron/`, `release/`, `node_modules/`

### TypeScript Configuration

- `tsconfig.json` — Renderer source (`src/`, `server.ts`)
  - Target: ES2022, module: ESNext, moduleResolution: bundler
  - JSX: react-jsx
  - Path alias: `@/*` maps to `./*`
  - `strict: true`, `noImplicitAny: true`
- `tsconfig.electron.json` — Electron main process (`electron/`)
  - Extends `tsconfig.json`
  - Module: CommonJS, moduleResolution: node
  - `outDir`: `dist-electron`
  - Excludes tests and renderer source

## Testing Instructions

- **Framework:** Vitest 4 with jsdom environment
- **Coverage:** v8 provider with thresholds: branches 70%, functions 80%, lines 80%, statements 80%
- **Test location:** Tests live next to the source file: `src/services/foo.ts` → `src/services/foo.test.ts`
- **File parallelism:** Disabled (`--fileParallelism=false`) to avoid IndexedDB and global state conflicts
- **Server tests:** Must include `// @vitest-environment node` at the top
- **Pure functions:** Prefer pure-function tests without mocking where possible
- **Regression guards:** When fixing a bug, add a comment: `// BUG-NNN regression guard`

### Coverage Exclusions

`node_modules/`, `dist/`, `dist-electron/`, `release/`, `scripts/`, `**/*.test.ts`, `**/*.test.tsx`, `vite.config.ts`, `vitest.config.ts`, `server.ts`

### Test Commands

```bash
npm test                    # Run all tests once
npm run verify:safety-guard # Mandatory check for safety guard compliance
npm run test:watch          # Watch mode
npm run test:coverage       # With coverage report
npm run smoke:electron      # Electron smoke tests in tests/smoke/
```

## Security Considerations

This is a security-sensitive project. The following rules are non-negotiable.

### API Key Handling
- The renderer process **never** reads the raw API key.
- In Electron, keys are stored via `safeStorage` (OS-level encryption).
- In web mode, the key lives only in the server-side `.env` file.
- Never commit `.env` files, keys, tokens, or certificates.
- Never expose keys in test fixtures, screenshots, or logs.

### Content Safety Guard
- **Every new prompt-sending path must call `assessChildExploitationSafety()` and `recordDecision()`** before forwarding to Venice.
- Do not bypass the guard. Be aware that the guard actively screens `negative_prompt` fields and analyzes cross-sentence contexts. Do not log raw prompt text.
- Safety tests must use synthetic/redacted fixtures only.
- The guard runs at every enforcement boundary: renderer (`veniceClient.ts`), Electron IPC handlers, and Express web proxy. The proxy uses a "fail-close" design (500 status) on extraction errors.

### Security Audit (May 2026)
This project underwent a comprehensive security audit of its safety guard capabilities in May 2026. The `verify-safety-guard.cjs` script was introduced as a mandatory gate to ensure adherence to 18+ legal constraints and robust CSAM protection.

### Allowed Venice Endpoints
The IPC validator and web proxy share an allowlist in `src/shared/validation.ts`:
- `GET /models`
- `POST /chat/completions`
- `POST /image/generate`
- `POST /image/upscale`
- `POST /augment/search`
- `POST /augment/scrape`
- `POST /augment/text-parser`

Only these endpoints may be invoked. No arbitrary URL or method forwarding is permitted.

### External URL Security
- `shell.openExternal` only allows `https:` URLs with non-private hostnames.
- RFC 1918 addresses (10.x, 192.168.x, 172.16–31.x), loopback, and `::1` are blocked even over HTTPS.
- See `electron/utils/urlSecurity.ts`.

### Electron Hardening
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- Content-Security-Policy is injected on every response
- Navigation is blocked except to app files; external links open via user-confirmed native dialog
- DevTools are disabled in packaged production builds unless `VENICE_FORGE_DEBUG_DEVTOOLS=true`

### Reporting Vulnerabilities
- Do **not** open public issues for security bugs.
- Use GitHub private vulnerability reporting or request a private maintainer discussion.
- Only the latest release tag is actively maintained for security patches.
- `npm audit` must be clean before release.

## Environment Variables

Copy `.env.example` to `.env` for web-mode development:

| Variable | Purpose |
|----------|---------|
| `VENICE_API_KEY` | Venice API inference key (required for web mode) |
| `PORT` | Express server port (default: 3000) |
| `HOST` | Express bind host (default: 127.0.0.1) |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window (default: 60000) |
| `RATE_LIMIT_MAX_REQUESTS` | Rate limit max requests per window (default: 60) |
| `MAX_PROXY_BODY_BYTES` | Max proxy body size (default: 26214400) |
| `TRUST_PROXY` | Express trust proxy setting (disabled by default) |
| `VENICE_API_HOST` | Upstream API host (default: api.venice.ai) |
| `VENICE_API_BASE_PATH` | Upstream API base path (default: /api/v1) |
| `VENICE_API_TIMEOUT_MS` | Request timeout (default: 60000) |
| `DISABLE_HMR` | Set to `true` to disable Vite HMR |
| `VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE` | Allow plaintext fallback when OS secure storage unavailable (Linux/non-GNOME only). **Warning:** reduces security. |
| `VENICE_FORGE_DEBUG_DEVTOOLS` | Allow DevTools in packaged production builds. Only for debugging. |

## Data Storage Locations

| Data | Location |
|------|----------|
| API key (desktop) | Electron `safeStorage` → `%APPDATA%\Venice Forge\secure-prefs.json` (Win) or `~/Library/Application Support/Venice Forge/secure-prefs.json` (Mac) |
| Logs (desktop) | `%APPDATA%\Venice Forge\logs\venice-forge.log` (Win) or `~/Library/Application Support/Venice Forge/logs/venice-forge.log` (Mac) |
| Conversations (desktop) | `chat-history/*.json` in app data directory (atomic writes, corruption recovery) |
| Images, legacy chats, settings, conversations | Renderer IndexedDB (4 stores encrypted, diagnostics unencrypted) |

## Release and Deployment

- CI runs on Ubuntu with a Node 20/22 matrix for lint, typecheck, test, and build.
- Release workflows (`windows-release.yml`, `macos-release.yml`) build signed/unsigned artifacts, verify them, and emit SHA-256 checksums.
- Code signing is optional for local builds. Official releases require Apple Developer ID (macOS) and standard `CSC_LINK` / `CSC_KEY_PASSWORD` (Windows).
- Auto-updates are fetched via GitHub Releases using `electron-updater`.

## Important Files to Keep Current

When changing behavior, packaging, or legal assumptions, update these files:
- `README.md`
- `docs/ABOUT.md`
- `SECURITY.md`
- `docs/RELEASE/release.md`
- `docs/LEGAL.md`
- `CHANGELOG.md`
- `AGENTS.md` (this file)
