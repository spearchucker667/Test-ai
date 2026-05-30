# Venice Forge — Exhaustive Bug & Quality Audit Report
**Date:** 2026-05-30  
**Scope:** Entire repository (source, tests, docs, config, CI, scripts)  
**Method:** Multi-agent parallel deep scan + manual validation  
**Baseline:** `npm run build` ✅ | `npm test` ✅ (298 passed, 1 skipped) | `npm run typecheck` ✅ | `npm run lint:eslint` ✅ | `npm run verify:safety-guard` ✅ | `npm run verify:icon` ✅ | `npm run verify:dist:mac` ✅

---

## Executive Summary

This audit inspected **~140 source files**, **39 documentation files**, **6 workflow files**, and **8 build scripts**. The codebase is well-structured and security-conscious, but **26 critical/high-severity issues** were identified across safety-guard bypass paths, production crash risks, memory leaks, race conditions, and documentation inaccuracies.

**Immediate action recommended** for 7 critical issues before the next release.

---

## 🔴 CRITICAL (7 issues)

### C-001 — Malformed Serialized FormData Bypasses Safety Guard
- **File:** `src/shared/safety/promptPayloadExtractor.ts:49-64`
- **Issue:** If `_isSerializedFormData === true` but `entries` is not an array, `extractFromSerializedFormData` returns `[]`. The guard sees zero fields and allows the request through. An attacker can craft `{ "_isSerializedFormData": true, "entries": "not-an-array", "prompt": "..." }` to bypass scanning entirely.
- **Fix:** Validate `entries` is an array; if malformed, fall back to generic object extraction or treat as an error.

### C-002 — MAX_SCAN_CHARS Truncation Evasion
- **File:** `src/shared/safety/childExploitationGuard.ts:248`, `promptPayloadExtractor.ts:33`
- **Issue:** `normalizeBase` slices to 16,384 chars **before** scanning; `extractPromptLikeFields` truncates each field to 8,000 chars. Malicious content placed after the truncation point is never scanned.
- **Fix:** Emit an audit warning when truncation occurs, or perform a reverse tail-scan. Increase limits if performance allows.

### C-003 — Main-Process Crash When Renderer Closes Mid-Stream
- **File:** `electron/ipc/handlers.ts:129`, `electron/services/veniceClient.ts:164`
- **Issue:** `event.sender.send("venice:streamDelta", ...)` is called from `onDelta` without checking `event.sender.isDestroyed()`. If the user closes the window during streaming, `.send()` throws synchronously and can crash the main process.
- **Fix:** Wrap `send` in `if (!event.sender.isDestroyed())` with a try/catch.

### C-004 — Static Vite Import Crashes in Production (`MODULE_NOT_FOUND`)
- **File:** `server.ts:6`
- **Issue:** `import { createServer as createViteServer } from "vite";` is a top-level ESM import. `vite` is a `devDependency`. When `dist/server.cjs` runs in production with `npm ci --omit=dev`, the process crashes immediately.
- **Fix:** Move to dynamic import inside the development-only branch: `const { createServer: createViteServer } = await import("vite");`

### C-005 — Module-Level `startServer()` Side Effect
- **File:** `server.ts:336-338`
- **Issue:** `if (AppConfig.NODE_ENV !== "test") startServer();` runs at module evaluation time. Vitest does not always set `NODE_ENV=test`, so importing `server.ts` in tests can start a Vite dev server and bind to a TCP port unexpectedly.
- **Fix:** Guard with `import.meta.url === new URL(process.argv[1], import.meta.url).href` (ESM `require.main === module` equivalent) or remove auto-invocation.

### C-006 — `npm start` Defaults to Vite Dev Mode
- **File:** `server.ts:293,299,328` + `package.json:28`
- **Issue:** `AppConfig.NODE_ENV` defaults to `"development"`. The `start` script (`"start": "node dist/server.cjs"`) does not set `NODE_ENV=production`, so production static serving is skipped and Vite dev mode is entered instead.
- **Fix:** Change `start` script to `cross-env NODE_ENV=production node dist/server.cjs`.

### C-007 — Stream Read Timeout Never Fires (Stalled SSE Hangs Forever)
- **File:** `src/services/veniceClient.ts:811-876`
- **Issue:** `AbortSignal.timeout(300_000)` covers the `fetch()` phase only. Once headers arrive, `reader.read()` is no longer bound to the timeout. A stalled SSE connection after headers will hang the renderer forever.
- **Fix:** Create a `setTimeout` that calls `reader.cancel()` or wrap the entire `while(true)` read loop with a timeout mechanism.

---

## 🟠 HIGH (19 issues)

### H-001 — Nested Object Extraction Misses Wrapped Prompts
- **File:** `src/shared/safety/promptPayloadExtractor.ts:81-118`
- **Issue:** `extractFromObject` only recurses into nested objects when the parent key is in `fieldNames`. A payload like `{ "wrapper": { "prompt": "loli" } }` to `/augment/text-parser` will not extract the nested `prompt`.
- **Fix:** For unknown endpoints, add a defensive shallow recursive scan (depth ≤ 2) with `fieldNames: ["*"]` when no fields are extracted at the top level.

### H-002 — Spelled-Out Ages & Missing Youth Terms
- **File:** `src/shared/safety/childExploitationGuard.ts:155-167,235-241`
- **Issue:** `AGE_EXTRACTION_PATTERNS` only matches numeric ages. Spelled-out ages ("thirteen") and high-risk youth nouns ("baby", "toddler", "boy", "girl", "juvenile") are absent.
- **Fix:** Add spelled-out ages ("thirteen"–"seventeen") and allowlist-safe youth nouns.

### H-003 — Homoglyph Normalization Gaps
- **File:** `src/shared/safety/childExploitationGuard.ts:255-273`
- **Issue:** `HOMOGLYPH_MAP` covers only a subset of Cyrillic/Greek lookalikes. Many common homoglyphs (Cyrillic `л`, `т`, `в`, `н`, `к`, `м`, `у`; Greek `α`, `β`, `γ`, `δ`, `ζ`, `η`, `κ`, `λ`, `μ`, `ν`, `π`, `ρ`, `σ`, `τ`, `φ`, `χ`, `ω`) are missing. NFKC does not fold these to Latin.
- **Fix:** Expand the map with the full set of visually confusable Cyrillic/Greek letters, or adopt a Unicode confusables table.

### H-004 — IPv6 / Short-Form IPv4 Bypass in URL Security
- **File:** `electron/utils/urlSecurity.ts:2-15`
- **Issue:** `isPrivateHostname` does not block IPv6 link-local (`fe80::*`), IPv4-mapped IPv6 loopback (`::ffff:127.0.0.1`), or short-form IPv4 (`127.1`, `10.1`). `new URL("https://127.1/").hostname` is `"127.1"` (2 parts) and is treated as public.
- **Fix:** Strip `::ffff:` prefix and re-test; normalize short-form IPv4; reject `fe80::*`, `fc00::*`, `fd00::*`, `::1`.

### H-005 — Plaintext API Key Tampering on Windows/macOS
- **File:** `electron/services/secureStore.ts:90-105`
- **Issue:** `getApiKey` returns raw plaintext when `apiKeyEncrypted === "false"`, regardless of platform. An attacker with filesystem access can manually edit `secure-prefs.json` to `"apiKeyEncrypted": "false"` and the app will use it without decryption.
- **Fix:** Reject `apiKeyEncrypted !== "true"` unconditionally on Windows and macOS.

### H-006 — Linux Plaintext Fallback Without User Consent
- **File:** `electron/services/secureStore.ts:71-83`
- **Issue:** On Linux, `VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE=true` permits plaintext storage with no in-app warning or user consent. A malicious launcher script could inject this env var.
- **Fix:** Show a persistent warning in Settings UI and require explicit user acknowledgment before storing the key.

### H-007 — Dedupe Key Retains Raw Prompt Text in Memory
- **File:** `src/services/veniceClient.ts:35-46`
- **Issue:** `dedupeKey` JSON-stringifies the request body to create a deduplication key. The raw prompt text persists in the `inFlight` Map until the request completes, making it visible in memory dumps.
- **Fix:** Hash the body (e.g., using `simpleHash`) instead of stringifying it for the dedupe key.

### H-008 — `shell.openExternal` Bypasses Confirmation for Windowless webContents
- **File:** `electron/main.ts:222,229`
- **Issue:** If `BrowserWindow.fromWebContents(contents)` returns `null` (background pages, DevTools), the code falls back to `shell.openExternal(url)` without calling `promptExternalLink()`.
- **Fix:** Never call `shell.openExternal` directly from the fallback; block navigation for windowless contents or route through a focused window.

### H-009 — `getApiKey` Returns Raw Encrypted Bytes on Type Mismatch
- **File:** `electron/services/secureStore.ts:90-105`
- **Issue:** If `apiKeyEncrypted` is the boolean `true` instead of the string `"true"`, strict equality fails and the function returns the raw base64 ciphertext as the API key.
- **Fix:** Validate types explicitly: `typeof raw === "string"` and handle both `"true"` and `true`.

### H-010 — Static-File Rate-Limiter Map Grows Unbounded
- **File:** `server.ts:301-320`
- **Issue:** The `staticRequestCounts` Map has no expiration, cleanup interval, or max-size cap. Under sustained traffic from many unique IPs, it will grow until OOM.
- **Fix:** Add the same cleanup interval and `MAX_RATE_LIMIT_ENTRIES` eviction logic used by the `/api/venice` rate limiter.

### H-011 — `vitest.config.ts` Spreads Function Object Instead of Calling It
- **File:** `vitest.config.ts:5`
- **Issue:** `vite.config.ts` exports a function (`defineConfig(() => ({ ... }))`). `vitest.config.ts` spreads it directly (`...viteConfig`), which copies no enumerable properties. Vite plugins, path aliases, and `stripCrossorigin` are not inherited.
- **Fix:** Change to `...viteConfig()` or `...viteConfig.default()`.

### H-012 — `electron-builder.config.cjs` Couples Windows & macOS Signing
- **File:** `electron-builder.config.cjs:10-15,82-84`
- **Issue:** `isCIRelease` requires **both** Windows signing env vars **and** Apple env vars to enable `hardenedRuntime`. A macOS-only CI pipeline with Apple credentials will still produce unsigned-like builds.
- **Fix:** Decouple into `isMacCIRelease` and `isWinCIRelease` checks.

### H-013 — `tsconfig.json` Missing `electron/` Exclusion
- **File:** `tsconfig.json`
- **Issue:** No `exclude` array means `electron/**/*.ts` is type-checked with `module: "ESNext"` and `moduleResolution: "bundler"`, conflicting with the CJS-targeting `tsconfig.electron.json`.
- **Fix:** Add `"electron"` to `exclude` or add explicit `"include": ["src/**/*", "server.ts"]`.

### H-014 — Blob URL Revoked Before Download Completes
- **File:** `src/services/desktopBridge.ts:206-212`, `src/utils/download.ts:26-41`
- **Issue:** `exportJson` revokes the object URL after `1000 ms`; `downloadImage` revokes after `100 ms`. For large exports or slow connections, the browser may still be processing the download when the URL becomes invalid.
- **Fix:** Increase delays to `60_000 ms` / `30_000 ms`, or tie revocation to `window.beforeunload`.

### H-015 — Pending Settings Save Lost on Unmount
- **File:** `src/hooks/useSettingsPersistence.ts:18-46`
- **Issue:** The cleanup function only clears the debounce timeout; it does **not** flush the pending IndexedDB write. If a user changes a setting and immediately closes the tab, the change is lost.
- **Fix:** In cleanup, if `timeoutRef.current` is non-null, await the pending `StorageService.saveItem(...)` directly before clearing.

### H-016 — O(n) Conversation Lookup in Web Mode
- **File:** `src/services/chatStorage.ts:47-54`
- **Issue:** `getConversation` fetches **all** conversations from IndexedDB and scans them in memory. This is wasteful for large histories.
- **Fix:** Add `IDBObjectStore.get(id)` support in `StorageService` instead of scanning.

### H-017 — RegExp Lookbehind Crashes Old Safari at Parse Time
- **File:** `src/shared/safety/childExploitationGuard.ts:306-314`
- **Issue:** `stitchSpacedChars` uses `(?<![a-z\d])` and `(?![a-z\d])`. Safari < 16.4 throws a **SyntaxError during script parse**, breaking app boot.
- **Fix:** Replace lookbehind/lookahead with a manual loop or `split`/`filter` logic.

### H-018 — `AbortSignal.any` / `AbortSignal.timeout` Not Polyfilled
- **File:** `src/services/veniceClient.ts:811-814`
- **Issue:** These APIs are unavailable in Firefox < 124, Safari < 16.4, Chrome < 116. `veniceStreamChat` calls them directly without the existing `createTimeoutSignal` fallback.
- **Fix:** Use the existing `createTimeoutSignal()` helper instead.

### H-019 — `crypto.randomUUID()` Throws in Non-Secure Contexts
- **File:** `src/services/desktopBridge.ts:30-32`
- **Issue:** If served over plain `http` (e.g., LAN dev), `crypto.randomUUID` is undefined and crashes the IPC request path.
- **Fix:** Add a fallback: `crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}``.

---

## 🟡 MEDIUM (26 issues)

### M-001 — Server Proxy Body-Type Fragility
- **File:** `server.ts:214`
- **Issue:** If a future body-parser middleware is added before the safety middleware, `req.body` would be an object instead of a Buffer, and the guard would receive `undefined` (allowing the request through with zero fields scanned).
- **Fix:** Defensively reject non-Buffer POST bodies or convert them to Buffer.

### M-002 — Audit Gap on Guard Exception in Web Proxy
- **File:** `server.ts:220-225`
- **Issue:** In the catch block around `assessChildExploitationSafety`, `recordDecision` is never called when the guard crashes, leaving no audit counter entry.
- **Fix:** Record a synthetic decision (`reasonCode: "GUARD_EXCEPTION"`) before returning 500.

### M-003 — Depth Limit Exhaustion for Deeply Nested Payloads
- **File:** `src/shared/safety/promptPayloadExtractor.ts:73`
- **Issue:** Recursion aborts at `depth > 4`. An attacker could wrap prompt fields deeper than 4 levels to evade extraction.
- **Fix:** Increase depth limit to 8, or emit an audit warning when depth is exhausted.

### M-004 — Array Payload Only Checks `content` and `prompt`
- **File:** `src/shared/safety/promptPayloadExtractor.ts:205-218`
- **Issue:** When top-level payload is an array, only `item.content` and `item.prompt` are extracted. Other text-bearing keys are ignored.
- **Fix:** Iterate over `fieldNames` for array items, or extract all string values up to `MAX_FIELDS`.

### M-005 — Vision Content Array Only Checks `text`
- **File:** `src/shared/safety/promptPayloadExtractor.ts:96-100`
- **Issue:** Inside `messages[].content` arrays, only `part.text` is extracted. Other text-bearing keys (e.g., `caption`, `description`) would be missed.
- **Fix:** Extract all string properties from each content part up to `MAX_FIELDS`.

### M-006 — Incomplete MIME Header Stripping in Buffer Fallback
- **File:** `src/shared/safety/promptPayloadExtractor.ts:146-147`
- **Issue:** The fallback regex is too narrow for multipart bodies with unusual headers. Boundary noise may remain, causing pattern misses.
- **Fix:** Use a more robust multipart parser, or return the raw decoded string without regex stripping.

### M-007 — `checkPathContained` Case-Sensitivity Blocks Legitimate Navigation on Windows
- **File:** `electron/utils/navigation.ts:22`
- **Issue:** On Windows, exact-equality `resolvedTarget === indexHtml` fails if on-disk casing differs.
- **Fix:** Use case-insensitive comparison on Windows.

### M-008 — Per-Window CSP Listener Accumulates on Shared Session
- **File:** `electron/main.ts:129`
- **Issue:** `onHeadersReceived` is registered inside `createWindow()`. The default session is shared, so every new window adds another identical listener.
- **Fix:** Register the handler once globally (e.g., in `bootstrap()` after `app.whenReady()`).

### M-009 — `apiKey:set` / `apiKey:delete` IPC Handlers Can Throw
- **File:** `electron/ipc/handlers.ts:171-180`
- **Issue:** `setApiKey()` can throw (e.g., DPAPI/Keychain unavailable). The IPC handler lacks try/catch, causing unhandled renderer promise rejections.
- **Fix:** Wrap in try/catch and return `{ ok: false, error: redactErrorMessage(err) }`.

### M-010 — `writeStore` is Non-Atomic
- **File:** `electron/services/secureStore.ts:54`
- **Issue:** `fs.writeFileSync` writes directly to the target file. A crash during write can truncate `secure-prefs.json`.
- **Fix:** Adopt atomic write pattern (write to `.tmp`, then `fs.renameSync`).

### M-011 — TOCTOU Race in `getConversation`
- **File:** `electron/services/chatStorage.ts:130-134`
- **Issue:** `fs.access()` is called before `readConversationFile()`. Between these async points the file can be deleted, causing a misleading "corrupt" log and useless backup rename.
- **Fix:** Remove `fs.access` check; distinguish `ENOENT` (return `null`) from actual parse errors.

### M-012 — ChatModule Impure State Updater
- **File:** `src/modules/ChatModule.tsx:217-221,236-242,249-263`
- **Issue:** `persistMessages` (async IndexedDB/fs call + dispatch) is called **inside** `setMessages` updater functions. React expects state updaters to be pure and synchronous.
- **Fix:** Call `setMessages(next)` synchronously, then `await persistMessages(conv, next)` afterwards.

### M-013 — SearchScrape Overlapping Request Race
- **File:** `src/modules/SearchScrapeModule.tsx:53-89,91-120,122-151`
- **Issue:** Each click overwrites `abortRef.current`. Rapid clicks cause the first response to overwrite newer results.
- **Fix:** Add a `runIdRef`, increment at handler start, and bail in `.then`/`.catch` if `runIdRef.current !== runId`.

### M-014 — Chat Cancel Removes User's Prompt
- **File:** `src/modules/ChatModule.tsx:244-263`
- **Issue:** On cancel, the catch block pops both the empty assistant message **and** the preceding user message, permanently losing the prompt.
- **Fix:** In the `AbortError` branch, remove only the assistant placeholder.

### M-015 — Batch Blocked-Error Stored in Non-Existent Property
- **File:** `src/modules/BatchModule.tsx:106-111`
- **Issue:** When safety guard blocks a batch item, code sets `response: itemGuard.userMessage`, but `BatchResult` interface only has `error: string | null`. The render code reads `r.error`, so the message is never shown.
- **Fix:** Change to `error: itemGuard.userMessage`.

### M-016 — Abort Listener Leak in `sleep` / `createTimeoutSignal`
- **File:** `src/services/veniceClient.ts:63-81,97-109`
- **Issue:** Both attach a `once` listener to `signal`. If the timeout fires first and the signal never aborts, the listener is never removed.
- **Fix:** Save listener reference and remove it in the timeout callback.

### M-017 — Placeholder Collision in Markdown Renderer
- **File:** `src/utils/markdown.tsx:17-35`
- **Issue:** `minimalMarkdown` uses `@@CODEBLOCK_${i}@@` as a placeholder. If user input contains this exact string, it will be replaced by an unrelated code block.
- **Fix:** Use a cryptographically random or highly improbable placeholder (e.g., `\u0000CODEBLOCK_${crypto.randomUUID()}`).

### M-018 — Weak `customTheme` Runtime Validation
- **File:** `src/state/appReducer.ts:278-283`
- **Issue:** The reducer accepts any object with `id` and `tokens` keys. `exportImport.ts` has a stricter `isValidTheme` check. Mismatch means malformed themes can enter state but be rejected on import.
- **Fix:** Re-use `isValidTheme` inside the reducer before assigning.

### M-019 — `Object.assign` on Drafts Can Pollute Shape
- **File:** `src/state/appReducer.ts:321-333`
- **Issue:** `SET_CHAT_DRAFT`, `SET_IMAGE_DRAFT`, `SET_BATCH_DRAFT` use `Object.assign(draft.*, action.patch)`. Extra keys in the patch pollute the draft shape.
- **Fix:** Use explicit spread (`draft.chatDraft = { ...draft.chatDraft, ...action.patch }`) or iterate over known keys.

### M-020 — Heading Regex Matches `####` as H3
- **File:** `src/utils/markdown.tsx:26-28`
- **Issue:** `^### (.*)$` on `#### H4` captures `# H4` in the group, producing `<h3># H4</h3>`.
- **Fix:** Use `/^### (?!\#) (.*)$/gm`.

### M-021 — Prototype Pollution Risk in Export Import
- **File:** `src/services/exportImport.ts:98-101`
- **Issue:** `record.id` values `__proto__`, `constructor`, or `prototype` could trigger prototype pollution.
- **Fix:** Reject these ids explicitly.

### M-022 — Infinite Recursion Risk in `normalizeImageData`
- **File:** `src/utils/image.ts:29-44`
- **Issue:** No cycle detection. A circular reference will cause stack overflow.
- **Fix:** Add a `seen: WeakSet` parameter.

### M-023 — `importJsonString` Silently Unavailable in Web Mode
- **File:** `src/services/desktopBridge.ts:223-230`
- **Issue:** Returns `null` immediately in the browser with no user feedback. Inconsistent with `exportJson` which has a working web fallback.
- **Fix:** Implement a web fallback using `<input type="file">` + `FileReader`, or return a rejected promise with a clear message.

### M-024 — `bodySizeBytes` Throws on Circular References
- **File:** `electron/ipc/validation.ts:30`
- **Issue:** `JSON.stringify(body)` can throw on circular structures. The resulting error is generic.
- **Fix:** Wrap in a local try/catch with a descriptive message.

### M-025 — Corrupt-File Backup Overwrites Previous Backup
- **File:** `electron/services/chatStorage.ts:59`
- **Issue:** `fs.rename(filePath, \`${filePath}.backup\`)` silently overwrites existing backups on POSIX.
- **Fix:** Append a timestamp: `\`${filePath}.backup-${Date.now()}\``.

### M-026 — `isValidConversation` Rejects Optional `systemPrompt`
- **File:** `electron/services/chatStorage.ts:85`
- **Issue:** Type guard requires `typeof c.systemPrompt === "string"`. If the type allows `undefined`, legitimate conversations are rejected.
- **Fix:** Allow `undefined`: `c.systemPrompt === undefined || typeof c.systemPrompt === "string"`.

---

## 🟢 LOW / CODE SMELL (22 issues)

### L-001 — `listConversations` Loads Unbounded Files into Memory
- **File:** `electron/services/chatStorage.ts:106-118`
- **Fix:** Cap files processed (e.g., most recent 1000 by mtime).

### L-002 — `ensureLogFile` TOCTOU Between `existsSync` and `statSync`
- **File:** `electron/services/logger.ts:42-53`
- **Fix:** Wrap size-check in try/catch.

### L-003 — `promptExternalLink` URL Truncation Off-by-One
- **File:** `electron/main.ts:62-68`
- **Issue:** When `protocolAndHost.length >= MAX_DISPLAY_URL_LENGTH`, `availableLength` becomes 0 and truncated path is `""`. Cosmetic only.

### L-004 — `crypto.randomUUID()` Global Reliance in Preload
- **File:** `electron/preload.ts:34`
- **Fix:** Use `globalThis.crypto.randomUUID()` explicitly.

### L-005 — Duplicate `isElectron` Logic
- **File:** `src/services/desktopBridge.ts:137-193` vs `src/services/chatStorage.ts:13`
- **Fix:** Export `isElectron` from `desktopBridge.ts` and import it.

### L-006 — Duplicate Web-Search Normalization
- **File:** `src/state/appReducer.ts:103-109` vs `src/utils/payloadBuilders.ts`
- **Fix:** Remove reducer copy and import the utility.

### L-007 — `veniceFetch` Default Type `any`
- **File:** `src/services/veniceClient.ts:705-744`
- **Fix:** Default to `T = unknown` instead of `T = any`.

### L-008 — Anchor Element Not Removed on Exception
- **File:** `src/utils/download.ts:8-15`
- **Fix:** Use `try…finally`.

### L-009 — `ToastHost` Permanent-Toast Duration Bug
- **File:** `src/components/ToastHost.tsx:24`
- **Issue:** `toast.duration || 3000` treats `0` as falsy, making permanent toasts impossible.
- **Fix:** Use `toast.duration ?? 3000`.

### L-010 — High-Contrast Mode Uses Undefined CSS Variable
- **File:** `src/styles/accessibility.css:8`
- **Issue:** `var(--background)` is used, but token is `--bg`.
- **Fix:** Change to `var(--bg)`.

### L-011 — GalleryModule Test Leaks `scrollIntoView` Stub
- **File:** `src/modules/GalleryModule.test.tsx:67`
- **Issue:** `Element.prototype.scrollIntoView = vi.fn()` is set in `beforeEach` but never deleted in `afterEach`.
- **Fix:** Add `delete (Element.prototype as any).scrollIntoView` in `afterEach`.

### L-012 — `package.json` — Redundant `lint` Script
- **File:** `package.json:38`
- **Issue:** `"lint": "tsc --noEmit"` duplicates part of `typecheck`.
- **Fix:** Remove or rename to `lint:tsc`.

### L-013 — `package.json` — Missing `engines` Field
- **File:** `package.json`
- **Fix:** Add `"engines": { "node": ">=20.0.0", "npm": ">=10.0.0" }`.

### L-014 — `server.ts` — Hardcoded `process.cwd()` Assumptions
- **File:** `server.ts:76,300`
- **Fix:** Derive paths from `import.meta.url`.

### L-015 — `server.ts` — `VENICE_API_TIMEOUT_MS` Parsed But Never Applied
- **File:** `server.ts:16,238-278`
- **Fix:** Pass `timeout: VENICE_API_TIMEOUT_MS` in `createProxyMiddleware` options.

### L-016 — `server.ts` — `HOST` Env Var Bypasses `AppConfig` Schema
- **File:** `server.ts:329`
- **Fix:** Add `HOST` to `EnvConfig` and `AppConfig`.

### L-017 — `server.ts` — `appVersion` Reads `package.json` on Every Call
- **File:** `server.ts:74-80`
- **Fix:** Cache the version at module level.

### L-018 — `electron-builder.config.cjs` — Unused `linux` Target
- **File:** `electron-builder.config.cjs:104-108`
- **Fix:** Remove or add `dist:linux` script and CI job.

### L-019 — `@types/express` Lags Behind `express`
- **File:** `package.json:56,68`
- **Fix:** Upgrade `@types/express` to match `express` patch version.

### L-020 — Vitest / Coverage Provider Minor Version Drift
- **File:** `package.json:74,92`
- **Fix:** Align both to same patch version.

### L-021 — `configSchema.ts` — No Validation of `VENICE_API_HOST` Format
- **File:** `src/shared/configSchema.ts:40-41`
- **Fix:** Reject protocols/slashes in host, enforce leading slash in base path.

### L-022 — `scripts/verify-dist.cjs` — Skips Windows Verification for `--arch arm64`
- **File:** `scripts/verify-dist.cjs:73`
- **Issue:** `winArches` becomes empty when `--win --arch arm64` is passed.
- **Fix:** Default `winArches` to `["x64"]` regardless of `targetArches` for Windows.

---

## 📄 DOCUMENTATION (24 issues)

### Doc-001 — `.github/ISSUE_TEMPLATE/config.yml` Wrong Security URL
- Points to `.../Test-ai/security` instead of `.../Venice-API-connector/security`.

### Doc-002 — `docs/AGENTS/gemini.md` Incorrect OS
- States Windows/PowerShell; actual environment is macOS.

### Doc-003 — `docs/REPOSITORY_TREE.md` References Deleted Scripts
- Still lists `verify-dist-mac.cjs` and `verify-dist-win.cjs`.

### Doc-004 — `docs/HQE_AUDIT_REPORT.md` Outdated Claims
- Claims no circuit breaker and missing server tests; both now exist.

### Doc-005 — `CHANGELOG.md` References Missing Workflow
- Claims CodeQL workflow exists; it does not.

### Doc-006 — Broken Link to `TROUBLESHOOTING.md`
- `docs/ABOUT.md` and `docs/REPOSITORY_TREE.md` link to `TROUBLESHOOTING.md` instead of `DEVELOPMENT/troubleshooting.md`.

### Doc-007 — `docs/THEME_SYSTEM.md` Wrong CSS File Location
- Still cites `src/index.css` for `@theme` block; actual location is `src/styles/theme.css`.

### Doc-008 — `docs/AGENTS/gemini.md` Incomplete Export Format
- Omits `conversations` store from documented export format.

### Doc-009 — `docs/AGENTS/gemini.md` Omits macOS Keychain
- Only mentions DPAPI on Windows.

### Doc-010 — `README.md` Missing Web Conversations in Storage Table
- IndexedDB row omits `conversations`.

### Doc-011 — `docs/FAQ.md` Missing Conversations in IndexedDB Description
- Same as Doc-010.

### Doc-012 — `todo.md` False Claim About `REPOSITORY_TREE.md`
- Claims file is absent; it exists.

### Doc-013 — `docs/ABOUT.md` Incomplete Packaging Description
- Only mentions Windows NSIS + portable; omits macOS DMG + ZIP.

### Doc-014 — `docs/DEVELOPMENT/platform-support.md` Misleading Linux Storage
- Implies plaintext fallback is standard dev behavior; it requires explicit env var.

### Doc-015 — `SECURITY.md` vs `docs/FAQ.md` Inconsistent Plaintext Instructions
- One says "environment variable", the other says "in `.env`". For Electron desktop, `.env` is not read by main process.

### Doc-016 — Inconsistent Maintainer Nomenclature
- "Project Owner", "Maintainer", "fayeblade" used inconsistently across docs.

### Doc-017 — `AGENTS.md` Missing CI Gap for Safety Guard
- Claims `verify:safety-guard` is mandatory gate, but `ci.yml` does not run it.

### Doc-018 — `README.md` Missing `THEME_SYSTEM.md` from Index
- Theming is a major feature but docs index omits it.

### Doc-019 — `CHANGELOG.md` Missing Release Script Consolidation Entry
- Commit consolidating verify-dist scripts is unrecorded.

### Doc-020 — `docs/RELEASE/release.md` Missing Docs in Checklist
- Omits `AGENTS.md`, `CHANGELOG.md`, `docs/ABOUT.md` from release checklist.

### Doc-021 — `docs/RELEASE/release.md` Uses `npm install` Instead of `npm ci`
- Release builds should use `npm ci` for reproducibility.

### Doc-022 — `docs/RELEASE/signing-and-notarization.md` Imprecise Apple Credential Naming
- Conflates App Store Connect API credentials with Apple ID + app-specific password.

### Doc-023 — `docs/REPOSITORY_TREE.md` Duplicate Table Entry
- `electron/services/chatStorage.ts` appears twice.

### Doc-024 — `docs/THEME_SYSTEM.md` / `docs/AGENTS/gemini.md` Stale `src/index.css` References
- Multiple references to `src/index.css` after CSS was split into `src/styles/`.

---

## ✅ Positive Observations

- **Fail-closed design:** All enforcement boundaries catch guard exceptions and block rather than forward.
- **No hardcoded secrets:** No API keys, tokens, or credentials in source.
- **No disable switches:** No env vars or code paths bypass the safety guard.
- **IPC hardening:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, strict allowlists.
- **Redaction robust:** Cycle-safe, covers Bearer tokens, Venice keys, and API keys.
- **AES-GCM correct:** 12-byte random IV, non-extractable 256-bit key, Web Crypto API.
- **Rate limiting:** Cleanup interval + 10K entry cap on `/api/venice`.
- **Circuit breaker:** Correctly fails closed on upstream 5xx, resets on 2xx.
- **Atomic chat writes:** `chatStorage.ts` uses tmp-file + rename pattern.
- **Path traversal blocked:** `VALID_ID_RE` correctly blocks `/`, `\`, `..`.

---

## Recommended Prioritization

### Block Release (do before v1.0.3)
1. **C-004** — Static Vite import crashes production server
2. **C-006** — `npm start` defaults to dev mode
3. **C-003** — Main-process crash on window close mid-stream
4. **C-007** — Stream read timeout never fires
5. **C-001** — Malformed FormData bypasses guard

### Next Sprint
6. **H-004** — IPv6/short-form IPv4 URL bypass
7. **H-005** — Plaintext API key tampering on Windows/macOS
8. **H-010** — Unbounded static-file rate limiter memory leak
9. **H-011** — `vitest.config.ts` broken inheritance
10. **H-012** — electron-builder signing credential coupling
11. **H-013** — tsconfig.json missing electron exclusion
12. **H-014/H-015** — Blob URL revocation races
13. **H-017/H-018** — Safari compat issues (lookbehind + AbortSignal)

### Backlog
14. All MEDIUM severity issues (guard depth limits, nested extraction, case sensitivity, CSP listener accumulation, IPC error handling, atomic writes, TOCTOU races)
15. All LOW severity issues (cosmetic, hygiene, type safety)
16. All 24 documentation inconsistencies
