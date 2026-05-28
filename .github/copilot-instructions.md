# Venice Forge — Copilot Instructions

## Project Overview

Venice Forge is a **dual-platform (Windows + macOS) Electron desktop app** (also runnable as a Vite/Express web app) for the [Venice API](https://venice.ai). It provides chat, image generation, batch prompting, web research, model discovery, and a local image gallery — all privacy-focused with no telemetry.

Stack: React 19 + TypeScript strict + Tailwind CSS v4 + Vite 6 (renderer), Electron 42 (desktop), Express 4 (web proxy), Vitest 4 (tests), tsc (Electron main build), esbuild (Express server bundle).

---

## Commands

```bash
npm run dev:electron    # Electron desktop (recommended for full dev)
npm run dev:web         # Web mode only (Vite + Express)
npm run typecheck       # Type-check renderer AND Electron main (both tsconfigs)
npm run lint            # TypeScript linter (tsc --noEmit)
npm run lint:eslint     # ESLint for src/, electron/, and server.ts
npm test                # Vitest unit + integration tests (single run)
npm run test:watch      # Vitest in watch mode
npx vitest run src/services/veniceClient.test.ts   # Run a single test file
npx vitest run server.test.ts -t "should block disallowed endpoints"  # Run one test case
npm run test:coverage   # Vitest with coverage report
npm run build           # Full build: web (dist/) + Electron main (dist-electron/)
npm run build:web       # Renderer build only
npm run build:server    # Express server bundle only
npm run build:electron  # Electron main/preload build only
npm run ci              # CI parity: npm ci + typecheck + test + build
npm run clean           # Remove dist/, dist-electron/, release/
npm run dist:win        # Build Windows NSIS + portable installers
npm run dist:mac        # Build macOS DMG + ZIP archives
```

Before opening a PR, follow `CONTRIBUTING.md`: run `npm run typecheck`, `npm test`, and `npm run build`.

---

## Architecture

### Two transports, one renderer

The renderer (`src/`) runs identically in both modes. Transport is selected at runtime by `isElectron()` in `src/services/desktopBridge.ts`:

- **Electron mode**: renderer calls `window.veniceForge.*` (the contextBridge API exposed by `electron/preload.ts`), which invokes IPC channels handled in `electron/ipc/handlers.ts`. The main process holds the API key in `safeStorage` and makes HTTPS calls directly to `api.venice.ai`.
- **Web mode**: renderer calls `fetch('/api/venice/...')`, proxied by the Express server in `server.ts` to `api.venice.ai`. The server injects `Authorization` from `VENICE_API_KEY` in `.env`. In web mode the Settings UI can also save a key to IndexedDB (used only for the "key configured" UI indicator — not forwarded to the proxy).

All Venice API requests go through `src/services/veniceClient.ts` — `veniceFetch()` for non-streaming and `veniceStreamChat()` for chat streams. Both paths include up to 3 retries with exponential back-off for 429/500/503 responses.

### State management

Single global `useReducer` in `App.tsx` using `appReducer` from `src/state/appReducer.ts`. State is mutated with **Immer** (`produce`). All action types are defined in `src/types/app.ts` as a discriminated union (`AppAction`). Every module receives `{ state, dispatch }` props.

### Storage

- **IndexedDB** (`src/services/storageService.ts`): images, chats, settings. All three stores are encrypted at rest using `src/services/cryptoService.ts` (AES-GCM).
- **Electron `safeStorage`** (`electron/services/secureStore.ts`): API key only — encrypted by the OS keychain, never in plaintext.
- **Exports**: versioned JSON with `{ version, exportedAt, appVersion, data }`. Import merges by ID, never clears; strips secret-like fields; validates schema and size.

### IPC surface (Electron)

The renderer can only call the channels declared in `electron/preload.ts` via `window.veniceForge`. The allowed Venice endpoints and HTTP methods are enforced in both `src/shared/validation.ts` (web proxy) and `electron/ipc/validation.ts` (IPC handler). In **Electron mode**, the renderer cannot choose arbitrary Venice endpoints or read the raw API key (it lives in `safeStorage` in the main process).

### Allowed Venice endpoints

```
GET  /models
POST /chat/completions
POST /image/generate
POST /image/upscale
POST /augment/search
POST /augment/scrape
POST /augment/text-parser
```

### Auto-Updates
Auto-updates are fetched via GitHub Releases. The `electron/ipc/updates.ts` module securely exposes `checkForUpdates`, `downloadUpdate`, and `installUpdate` to the renderer while keeping download logic in the sandboxed main process.

---

## Key Conventions

### Dual-mode guards

Any code that differs between Electron and web **must** use `isElectron()` from `src/services/desktopBridge.ts`. The `desktopBridge` module re-exports all Electron-only APIs with safe no-op fallbacks for web mode — use these rather than calling `window.veniceForge` directly.

### `veniceFetch` is the only API entry point

All Venice HTTP calls go through `veniceFetch()` or `veniceStreamChat()` in `src/services/veniceClient.ts`. Do not `fetch('/api/venice/...')` directly, and never call `window.veniceForge.venice` directly from modules.

### Action dispatch carries diagnostics

Every `veniceFetch`/`veniceStreamChat` call accepts a `dispatch` parameter. Passing the app `dispatch` causes the function to emit `SET_DIAGNOSTICS` actions automatically, updating the Status tab. Always pass `dispatch` when calling from a module.

### Module structure

Each tab is a self-contained module file in `src/modules/`. Modules receive `{ state: AppState, dispatch: AppDispatch }` props. Shared UI primitives (buttons, chips, fields) live in `src/components/`.

### Type files

- `src/types/app.ts` — `AppState`, `AppAction`, `AppDispatch`, `ToastMessage`, drafts
- `src/types/venice.ts` — `ModelInfo`, `DiagnosticsEntry`, Venice API shapes
- `src/types/storage.ts` — `GalleryImage` and other IndexedDB record types
- `src/types/desktop.ts` — `window.veniceForge` type augmentation

### Electron build pipeline

`electron/` is compiled separately via `tsconfig.electron.json` (CommonJS output to `dist-electron/`) using `tsc`. The Express server is bundled via esbuild (`server.ts` → `dist/server.cjs`). Run `npm run build:electron` after any change to `electron/`. The renderer builds via Vite with `ELECTRON_BUILD=true` to set `base: "./"` for relative asset paths.

### Security constraints

- Never expose the API key to the renderer — it lives in `electron/services/secureStore.ts` (main process) or the Express server env.
- Do not add new IPC channels without adding them to `electron/preload.ts` and `electron/ipc/handlers.ts`, and validating inputs in `electron/ipc/validation.ts`.
- Do not add new Venice endpoints without updating `src/shared/validation.ts`.
- CSP is strict in production — no inline scripts, no external `connect-src`.
- macOS requires `build/icon.icns` for packaging. Never weaken `safeStorage` — macOS Keychain and Windows DPAPI parity is required. Plaintext storage is completely disabled for Windows and macOS.

---

## Image Workflow

Image data from the Venice API arrives in several shapes. **Always use `extractImages(payload)`** from `src/utils/image.ts` to normalise the response — it handles `{ data: [{ b64_json }] }`, `{ images: [] }`, bare base64 strings, and URL strings, and deduplicates results.

`GalleryImage` records (defined in `src/types/storage.ts`) are saved via `saveImageRecord()` in `src/services/imageWorkflowService.ts`, which calls `StorageService.saveItem("images", ...)` and then dispatches `SET_GALLERY` to refresh state. Pass `skipRefresh: true` when saving multiple images in a loop, then call `refreshGallery(dispatch)` once at the end.

Upscaled images are linked to their source via `parentId` on the `GalleryImage` record. The upscale model field defaults to `"upscale-model"`; pass the actual model string in `UpscaleOptions`.

Bulk gallery download is capped at 50 images with a 300 ms inter-item delay to avoid freezing the UI. Filenames are built via `galleryFilename(item)` — sanitises model/id to `[a-z0-9_-]` and produces `<model>-<id>.png`.

---

## Export / Import

Export format is versioned: `{ version: 1, exportedAt, appVersion, data: { images, chats, settings } }`. The current version constant is `EXPORT_SCHEMA_VERSION` in `src/services/exportImport.ts`.

**Key rules enforced by `validateImportJson` and `createExportPayload`:**

- Max payload: 25 MB (`MAX_IMPORT_JSON_BYTES`)
- Only `images`, `chats`, and `settings` stores are allowed — unknown stores cause a hard rejection
- Every record must have a valid `id` (string) and `timestamp` (number); missing values are auto-generated
- Store-specific shape requirements: `images` must have `image` (string); `chats` must have `prompt` or `response`; `settings` must have a plain-object `value`
- Import **merges by ID** — it never clears existing IndexedDB data
- **API keys are never exported or imported** — both `createExportPayload` and `validateImportJson` run `redactSecrets()` (from `src/services/redaction.ts`) and strip any key whose name matches `/api[-_ ]?key|authorization|password|secret|token/i`

`redactSecrets()` also scrubs Bearer tokens and Venice key patterns (`vn-...`) from string values recursively — use it whenever logging or surfacing user-supplied content.

---

## Testing

### Test environment and tooling

- Framework: **Vitest 4** with `@testing-library/react` and `supertest`
- Default environment: `jsdom` (browser APIs available)
- Server-side tests must opt in with the file-level directive `// @vitest-environment node` (see `server.test.ts`)
- Run a single file: `npx vitest run <path>` (e.g. `npx vitest run src/services/exportImport.test.ts`)

### Test file locations

Tests live next to the source files they cover: `src/services/foo.ts` → `src/services/foo.test.ts`. The one exception is `server.test.ts` at the repo root (tests `server.ts`).

### Key patterns

**Mocking the proxy** — `server.test.ts` stubs `http-proxy-middleware` with `vi.mock(...)` before importing `server.ts` so tests can assert validation behaviour (403/405) without real network calls. Import the module under test _after_ `vi.mock` calls.

**Stubbing `window.veniceForge`** — `desktopBridge.test.ts` uses `vi.stubGlobal("window", {})` to simulate browser (non-Electron) mode and verify the no-op fallbacks. Use the same pattern for any code guarded by `isElectron()`.

**Pure-function tests** — most service tests (`exportImport`, `redaction`, `appReducer`, `image`) test pure functions directly with no mocking needed. Prefer this style: call the function, assert on the return value.

**Regression guards** — bugs that were fixed get a test with a `BUG-NNN` comment (e.g. `// BUG-002 regression guard`). Follow this convention when fixing a bug: add or annotate a test that would have caught it.

**Rate-limit state isolation** — `server.test.ts` creates a fresh `app` in `beforeEach` (not `beforeAll`) for rate-limit tests to prevent state from bleeding between test cases. Do the same for any test that depends on in-process mutable state.
