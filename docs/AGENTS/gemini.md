# Venice Forge — Gemini Developer Guide

> **Developer Note**: This file is a project-specific instruction manual tailored for Google Gemini models (e.g., Gemini 3.1 Pro) operating on the Venice Forge codebase. Use this file as a reference for architectural invariants, testing strategies, security controls, and codebase navigation.

---

## 1. Project Overview & Architecture

Venice Forge is a privacy-first AI creator studio client for the [Venice API](https://venice.ai). It is built as a **dual-platform Windows and macOS Electron desktop application**, but supports running in a **web proxy development mode**.

### The Dual-Transport Architecture
A single React renderer codebase runs in both environments. Transport routing is resolved at runtime using `isElectron()` from `src/services/desktopBridge.ts`:

```
               ┌──────────────────────────────────────────────────┐
               │                  React Renderer                  │
               │                    (src/...)                     │
               └────────────────────────┬─────────────────────────┘
                                        │
                         Is isElectron() true or false?
                                        │
                    ┌───────────────────┴───────────────────┐
                   Yes                                     No
                    ▼                                       ▼
       ┌─────────────────────────┐             ┌─────────────────────────┐
       │   Preload IPC Bridge    │             │   Vite Dev Web Mode     │
       │ (window.veniceForge.*)  │             │   (fetch('/api/...'))   │
       └────────────┬────────────┘             └────────────┬────────────┘
                    │                                       │
            Main Process IPC                        Express Proxy Server
         (electron/ipc/handlers.ts)                     (server.ts)
                    │                                       │
         SafeStorage (DPAPI Key)                     .env API Key Variable
                    │                                       │
                    └───────────────────┬───────────────────┘
                                        ▼
                               Venice API Endpoint
                              (api.venice.ai/v1)
```

- **Electron Desktop Mode (Production)**:
  - The renderer is fully sandboxed (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`).
  - No direct Node.js or filesystem access is exposed to the renderer.
  - Communication is routed through the narrow preload bridge at [electron/preload.ts](file:///electron/preload.ts).
  - The Venice API key is stored using Electron's `safeStorage` (DPAPI on Windows) and never crosses the IPC boundary back to the renderer. HTTPS requests are dispatched from the main process.
- **Web Proxy Mode (Development)**:
  - The app runs in standard web browsers.
  - The renderer forwards requests to `/api/venice/*` which is intercepted and proxied by the Express server at [server.ts](file:///server.ts).
  - The API key is loaded server-side from a `.env` file (`VENICE_API_KEY`).

---

## 2. Gemini Orchestrator Integration Guidelines

When executing code modifications, security audits, or feature additions as a Gemini agent, adhere to the following operational parameters:

### Context Window & File Viewing
- Gemini features a native 1M token context window. You are encouraged to read complete files (up to the 800-line tool limits) to achieve perfect semantic understanding.
- Always use the `view_file` tool to inspect code references before editing.
- Never write placeholder code (`// TODO`, `// ...`). Every output file must contain complete, production-ready source code.

### Command Execution in Windows/PowerShell
- The workspace OS is **Windows** using **PowerShell**.
- **Rule**: Never propose `cd` commands. Set the correct `Cwd` path in the execution arguments.
- Use `npm run typecheck` to verify that both the renderer and the Electron main configurations compile successfully.

### Planning and Progress Tracking
- For non-trivial modifications, define your plan inside `implementation_plan.md` and request user approval.
- Maintain an active status checklist in `task.md` using `[ ]`, `[/]`, and `[x]` syntax.
- Summarize final changes and embed validation artifacts in `walkthrough.md`.

---

## 3. Technology Stack & Commands Reference

| Component | Technology | Version / Configuration |
| :--- | :--- | :--- |
| **UI Library** | React 19 | `src/main.tsx` |
| **Styling** | Tailwind CSS v4 | "Premium Dark Glass" theme with CSS tokens in `src/index.css` |
| **Build Tool (Renderer)** | Vite 6 | `vite.config.ts` |
| **Desktop Shell** | Electron 42 | `electron/main.ts` |
| **Packaging** | electron-builder 26 | `electron-builder.config.cjs` |
| **Web Proxy** | Express 4 + HTTP Proxy Middleware | `server.ts` |
| **State Management** | React `useReducer` + Immer | `src/state/appReducer.ts` |
| **Testing Framework** | Vitest 4 + `@testing-library/react` | `server.test.ts`, `*.test.ts` |

### Primary Developer Commands
```powershell
# Start Electron app in development mode
npm run dev:electron

# Start browser-only proxy development environment
npm run dev:web

# Run TypeScript compilation checks for both tsconfigs
npm run typecheck

# Execute Vitest test suite once
npm test

# Run Vitest in hot-reloading watch mode
npm run test:watch

# Build production bundles (Renderer and Main process)
npm run build

# Clear all dist and packaging artifacts
npm run clean
```

---

## 4. Key Codebase Conventions

### 1. State Management & Immer Mutability
All global application state is centered in [src/App.tsx](file:///src/App.tsx) and managed by [src/state/appReducer.ts](file:///src/state/appReducer.ts). 
- State modifications **must** leverage `immer` (`produce`) to ensure immutable updates.
- Action types are declared as a strict discriminated union (`AppAction`) in [src/types/app.ts](file:///src/types/app.ts).
- Pass `{ state, dispatch }` down as props to the modular views.

### 2. Network Client & Retries
Do not call `fetch()` directly for Venice API endpoints. All Venice interactions must route through [src/services/veniceClient.ts](file:///src/services/veniceClient.ts):
- Use `veniceFetch()` for standard JSON requests.
- Use `veniceStreamChat()` for server-sent event (SSE) streaming completions.
- **Diagnostics**: Both methods accept `dispatch`. Always pass the global application dispatch so that request status and rate limits automatically trigger `SET_DIAGNOSTICS` updates.
- Both methods support automatic retry logic up to 3 times with exponential back-off for status codes `429` (rate limits), `500`, and `503`.

### 3. Image Processing Workflow
- **Normalisation**: Venice API response payloads can vary. Normalize responses using `extractImages(payload)` from [src/utils/image.ts](file:///src/utils/image.ts).
- **Storage**: Save images through `saveImageRecord()` in [src/services/imageWorkflowService.ts](file:///src/services/imageWorkflowService.ts).
- **Gallery Loops**: When storing multiple images in a loop, supply `{ skipRefresh: true }` to avoid intermediate rendering stutter. Call `refreshGallery(dispatch)` once after the loop finishes.
- **Downloads**: Filenames must be built via `galleryFilename(item)`, which enforces the filename pattern `[a-z0-9_-]` to output `<model>-<id>.png`.

### 4. Backup Export / Import Rules
- **Format**: All exported application states are structured JSON in this shape:
  ```json
  {
    "version": 1,
    "exportedAt": 1716298400000,
    "appVersion": "1.0.0",
    "data": {
      "images": [],
      "chats": [],
      "settings": []
    }
  }
  ```
- **Constraints**:
  - Size Limit: Supported imports are limited to 25 MB (`MAX_IMPORT_JSON_BYTES`).
  - Strict Allowed Stores: Only `images`, `chats`, and `settings` collections can exist in the data block.
  - Secret Cleansing: Both import validation and export generation MUST invoke `redactSecrets()` from [src/services/redaction.ts](file:///src/services/redaction.ts) to strip API keys, Bearer tokens, and credential strings.

---

## 5. Security & IPC Boundary

Venice Forge enforces strict application security boundaries to guarantee user privacy.

### Preload Bridge Security
- No raw `ipcRenderer` calls or internal Electron objects are exposed to the renderer. 
- The preload script [electron/preload.ts](file:///electron/preload.ts) acts as a strict gateway.
- If a new IPC channel is required, it must be added to:
  1. Preload declarations: [electron/preload.ts](file:///electron/preload.ts)
  2. IPC handler registry: [electron/ipc/handlers.ts](file:///electron/ipc/handlers.ts)
  3. Preload TypeScript definition: [src/types/desktop.ts](file:///src/types/desktop.ts)

### Venice Endpoint Whitelist
All outgoing Venice HTTP requests are restricted to validated paths. The endpoints allowlist is stored in [src/shared/validation.ts](file:///src/shared/validation.ts) and shared by both the Express web proxy and the Electron main validation layer:

```typescript
export const ALLOWED_VENICE_ENDPOINTS = [
  'GET /models',
  'POST /chat/completions',
  'POST /image/generate',
  'POST /image/upscale',
  'POST /augment/search',
  'POST /augment/scrape',
  'POST /augment/text-parser'
] as const;
```

> [!IMPORTANT]
> If a new Venice API route is implemented, both [src/shared/validation.ts](file:///src/shared/validation.ts) and [electron/ipc/validation.ts](file:///electron/ipc/validation.ts) must be updated.

### Redaction & Error Handling
- Never write API keys or raw tokens into logger streams.
- IPC handlers must catch errors and return them through `sanitizeError()`, redacting any plaintext key material prior to rendering.

---

## 6. Testing Patterns & Guidelines

Venice Forge utilizes **Vitest 4** for unit and integration testing.

### Test Environment Directives
- **Renderer Tests**: The default testing environment is `jsdom` (simulating browser APIs).
- **Server/Main Process Tests**: Server files require access to Node.js modules. Force Node execution using the following header:
  ```typescript
  // @vitest-environment node
  ```

### Mocks and Stubs
- **Express Server**: In [server.test.ts](file:///server.test.ts), mock `http-proxy-middleware` prior to importing `server.ts` to validate router rate-limit controls without hitting the live network.
- **Desktop Bridge**: Mock `window.veniceForge` using `vi.stubGlobal("window", { veniceForge: ... })` to verify that `isElectron()` behaves properly in headless browser states.

### Regression Guards
When correcting any bug, write a unit test matching the failure scenario. Label the test block with the bug index:
```typescript
// BUG-014 regression guard
test("should properly redact vn- prepended keys from nested data structures", () => {
  // Test code here...
});
```
