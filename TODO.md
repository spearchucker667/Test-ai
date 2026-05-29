# 🐛 Bug Hunt — TODO

> Generated: 2026-05-29 • Scope: code + docs • Files scanned: 140 / 147

## Recon Summary
- [x] This is a TypeScript/Electron/React app with dual transports: sandboxed Electron renderer through `window.veniceForge`, and web mode through an Express proxy.
- [x] Primary entry points scanned: `src/App.tsx`, `src/main.tsx`, `server.ts`, `electron/main.ts`, `electron/preload.ts`, `electron/ipc/*`, and `electron/services/*`.
- [x] Security-sensitive paths scanned: IPC validation, preload bridge, Venice HTTPS client, secure key storage, redaction, crypto-at-rest, CSP/navigation guards, import/export, and download flows.
- [x] Build/test/lint config scanned: `package.json`, TypeScript configs, Vite config, ESLint config, Electron Builder config, GitHub Actions, release verification scripts, and `.env.example`.
- [x] Documentation scanned: README, AGENTS, contributing/security/support/changelog/license docs, `.github` templates/instructions, and `docs/*.md`; large generated/reference files were inventory-checked but not line-reviewed.

## Summary
| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 High | 2 |
| 🟡 Medium | 9 |
| 🟢 Low / Cosmetic | 4 |
| 📄 Doc Defect | 11 |
| 📭 Missing Doc | 0 |

---

## 🔴 Critical
✅ No confirmed critical issues found in the scanned code/docs.

## 🟠 High
- [x] **[BUG-001] Image generation cancel can leave the UI permanently loading** `src/modules/ImageModule.tsx:168`
  - **Type:** Async / UI State
  - **What:** `onCancel` increments `runIdRef.current` and aborts the controller, but does not clear `loading`. The `finally` block only clears loading if the current run id still matches, which cancel deliberately invalidates.
  - **Why it matters:** A common user action can strand the Image tab in `Generating...`, with the Generate button disabled until the component remounts.
  - **Evidence:**
    ```tsx
    // src/modules/ImageModule.tsx:168-173
    } finally {
      if (runIdRef.current === runId) {
        setLoading(false);
        abortRef.current = null;
      }
    }

    // src/modules/ImageModule.tsx:286-289
    onCancel={() => {
      runIdRef.current += 1;
      abortRef.current?.abort();
    }}
    ```
  - **Locations:** `src/modules/ImageModule.tsx:168`, `src/modules/ImageModule.tsx:286`, `src/components/ImageGenerationForm.tsx:222` — 3 occurrences in one flow.
  - **Fix:** In `onCancel`, abort and immediately reset `loading`/`abortRef`, or change the `finally` logic so aborted current work always clears loading safely.
  - **Confidence:** [VERIFIED]

- [x] **[BUG-002] Chat local settings do not update after async settings hydration** `src/modules/ChatModule.tsx:24`
  - **Type:** State Sync / Correctness
  - **What:** Chat initializes local controls from `state.settings` once. App settings hydrate asynchronously after mount, but Chat has no effect to synchronize local state when reducer settings change.
  - **Why it matters:** Saved/imported defaults such as system prompt, web search, scraping, citations, and prompt inclusion can be ignored on the initially mounted Chat tab until a remount/reload.
  - **Evidence:**
    ```tsx
    // src/App.tsx:64-81
    storage.get("settings").then((settings) => {
      const stored = settings.find((s) => s.id === "user-settings") as Partial<AppSettings> | undefined;
      if (stored) {
        dispatch({ type: "SET_SETTINGS", settings: stored });
      }
    })

    // src/modules/ChatModule.tsx:24-39
    const [systemPrompt, setSystemPrompt] = useState(state.settings.defaultSystemPrompt);
    const [includePrompt, setIncludePrompt] = useState(state.settings.includeSystemPrompt);
    const [webSearch, setWebSearch] = useState(state.settings.webSearch);
    const [webScraping, setWebScraping] = useState(state.settings.webScraping);
    const [includeCitations, setIncludeCitations] = useState(state.settings.includeCitations);
    ```
  - **Locations:** `src/App.tsx:64`, `src/modules/ChatModule.tsx:24` — 2 occurrences in one startup flow.
  - **Fix:** Add a guarded sync effect in Chat for settings-backed local state, or lift these controls fully into reducer state.
  - **Confidence:** [VERIFIED]

## 🟡 Medium
- [x] **[BUG-003] Clear local settings leaves global web/citation toggles stale** `src/modules/SettingsModule.tsx:105`
  - **Type:** State Sync / Correctness
  - **What:** The settings clear action removes the IndexedDB row and resets local form state, but only dispatches `defaultSystemPrompt` to the global reducer. Other settings remain unchanged in `state.settings`.
  - **Why it matters:** The UI reports that settings were cleared while other tabs can still observe stale global settings until reload or save.
  - **Evidence:**
    ```tsx
    // src/modules/SettingsModule.tsx:105-113
    await storage.delete("settings", "user-settings");
    dispatch({
      type: "SET_SETTINGS",
      settings: { ...state.settings, defaultSystemPrompt: DEFAULT_SYSTEM_PROMPT },
    });
    setDefaultSystemPrompt(DEFAULT_SYSTEM_PROMPT);
    setWebSearch(false);
    setIncludePrompt(false);
    ```
  - **Locations:** `src/modules/SettingsModule.tsx:105`, `src/state/appReducer.ts:217` — 2 occurrences in one flow.
  - **Fix:** Dispatch the complete reset settings object, including `webSearch`, `webScraping`, `includeCitations`, and `includeSystemPrompt`.
  - **Confidence:** [VERIFIED]

- [x] **[BUG-004] Web `veniceFetch` does not retry network failures** `src/services/veniceClient.ts:587`
  - **Type:** Error Handling / Retry Logic
  - **What:** Fetch failures are recognized as `TypeError`, but the retry condition also requires a non-null status. Pure network failures have no status, so they are never retried.
  - **Why it matters:** The documented retry policy does not apply to common transient web-mode failures such as proxy restarts, dropped connections, or local network interruptions.
  - **Evidence:**
    ```ts
    // src/services/veniceClient.ts:587-627
    const isFetchFailure = err instanceof TypeError;
    lastError = Object.assign(new Error(errorObj.message || "Venice request failed"), {
      status: errorObj.status ?? response?.status ?? null,
    });

    if (
      attempt < maxRetries &&
      lastError.status !== undefined &&
      lastError.status !== null &&
      (isFetchFailure || [429, 500, 503].includes(lastError.status))
    ) {
      await delay(retryDelay(attempt), signal);
      continue;
    }
    ```
  - **Locations:** `src/services/veniceClient.ts:587`, `src/services/veniceClient.ts:624`, `src/services/veniceClient.ts:634` — 3 occurrences in one flow.
  - **Fix:** Retry `isFetchFailure` independently of HTTP status, while preserving abort behavior.
  - **Confidence:** [VERIFIED]

- [x] **[BUG-005] Web streaming diagnostics hide HTTP failure messages** `src/services/veniceClient.ts:745`
  - **Type:** Observability / Error Handling
  - **What:** `veniceStreamChat` records diagnostics immediately after receiving the response with `error: ""`, then parses and throws the HTTP error afterward.
  - **Why it matters:** Failed streaming calls can show as diagnostics with no error text, making the Status/Diagnostics flow misleading during real outages or validation failures.
  - **Evidence:**
    ```ts
    // src/services/veniceClient.ts:745-767
    dispatch?.({
      type: "SET_DIAGNOSTICS",
      diagnostics: {
        lastStatus: response.status,
        latencyMs: Date.now() - started,
        error: "",
      },
    });

    if (!response.ok) {
      const error = await parseErrorResponse(response);
      throw error;
    }
    ```
  - **Locations:** `src/services/veniceClient.ts:745`, `src/services/veniceClient.ts:761` — 2 occurrences in one flow.
  - **Fix:** Move diagnostics dispatch after `response.ok`, or dispatch the parsed error message/status before throwing.
  - **Confidence:** [VERIFIED]

- [x] **[BUG-006] Electron SSE responses are not capped by the shared response-size limit** `electron/services/veniceClient.ts:245`
  - **Type:** Resource / Memory
  - **What:** Non-stream Electron responses enforce `MAX_RESPONSE_BODY_BYTES`, but successful `text/event-stream` responses append to `streamText` without a total byte cap.
  - **Why it matters:** A buggy or malicious upstream stream can grow main-process memory indefinitely. The renderer also receives the full accumulated text at completion.
  - **Evidence:**
    ```ts
    // electron/services/veniceClient.ts:245-257
    if (contentType.includes("text/event-stream") && res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
      sseBuffer += chunk;
      streamText += processSseChunk(sseBuffer, onChunk);
      sseBuffer = trimProcessedBuffer(sseBuffer);
      return;
    }

    receivedBytes += buffer.length;
    if (receivedBytes > MAX_RESPONSE_BODY_BYTES) {
      req.destroy(new Error(`Venice response exceeded ${MAX_RESPONSE_BODY_BYTES} bytes`));
    }
    ```
  - **Locations:** `electron/services/veniceClient.ts:245`, `electron/services/veniceClient.ts:252`, `electron/services/veniceClient.ts:261` — 3 occurrences in one flow.
  - **Fix:** Count stream bytes and abort when the shared response limit is exceeded; consider returning only final text needed by callers.
  - **Confidence:** [VERIFIED]

- [x] **[BUG-007] CSP blocks remote image URLs that the app accepts and stores** `src/utils/image.ts:21`
  - **Type:** Rendering / Config
  - **What:** Image normalization accepts `http` and `https` image URLs, but both Electron and web CSP only allow `img-src 'self' data: blob:`.
  - **Why it matters:** If Venice returns URL-based image payloads, the app can accept/save the records but fail to render them in gallery/preview under CSP.
  - **Evidence:**
    ```ts
    // src/utils/image.ts:21-25
    if (
      (value.startsWith("data:image/") ||
        value.startsWith("http://") ||
        value.startsWith("https://")) &&
      !seen.has(value)

    // electron/main.ts:24-30
    "img-src 'self' data: blob:",

    // server.ts:91-95
    "img-src 'self' data: blob:",
    ```
  - **Locations:** `src/utils/image.ts:21`, `electron/main.ts:24`, `server.ts:91`, `src/modules/GalleryModule.tsx:147`, `src/components/ImageGenerationPreview.tsx:76` — 5 occurrences across normalization and rendering.
  - **Fix:** Either stop accepting remote image URLs and normalize to local blobs/data URLs, or explicitly allow the intended trusted image origins in CSP and download paths.
  - **Confidence:** [VERIFIED]

- [x] **[BUG-008] Electron bridge initialization failure can leave model loading disabled** `src/App.tsx:49`
  - **Type:** Async / Startup Resilience
  - **What:** App startup calls `initDesktopBridge().then(...)` without `catch` or `finally`. A diagnostics IPC failure rejects the promise before `bridgeReady` is set.
  - **Why it matters:** One startup diagnostics failure can prevent the model refresh effect from running and can produce an unhandled promise rejection.
  - **Evidence:**
    ```tsx
    // src/App.tsx:49-57
    initDesktopBridge().then((status) => {
      dispatch({ type: "SET_DESKTOP_STATUS", status });
      setBridgeReady(true);
    });

    // src/App.tsx:124-128
    if (!bridgeReady) {
      return;
    }
    ```
  - **Locations:** `src/App.tsx:49`, `src/App.tsx:124`, `src/services/desktopBridge.ts:20` — 3 occurrences in one startup flow.
  - **Fix:** Catch initialization errors, dispatch degraded diagnostics, and set `bridgeReady` in a `finally` path when the renderer can continue.
  - **Confidence:** [VERIFIED]

- [x] **[BUG-009] Bulk gallery download can report failed downloads as successful** `src/services/imageWorkflowService.ts:169`
  - **Type:** Error Handling / UX
  - **What:** `downloadImage` swallows fetch failures by falling back to a direct anchor click and does not throw. The bulk downloader increments `downloaded` after `await downloadImage(...)`, so blocked/failed fetches can be counted as success.
  - **Why it matters:** Users can get a success toast even when a file was not actually saved, especially for CSP-blocked or remote URLs.
  - **Evidence:**
    ```ts
    // src/utils/download.ts:14-34
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      triggerDownload(URL.createObjectURL(blob), filename);
    } catch (e) {
      triggerDownload(url, filename);
    }

    // src/services/imageWorkflowService.ts:169-180
    await downloadImage(item.url, galleryFilename(item));
    downloaded++;
    ```
  - **Locations:** `src/utils/download.ts:14`, `src/services/imageWorkflowService.ts:169` — 2 occurrences in one flow.
  - **Fix:** Make `downloadImage` return an explicit success/fallback status, check `res.ok`, and only count confirmed saves as downloaded.
  - **Confidence:** [VERIFIED]

- [x] **[BUG-010] GitHub CI does not enforce the local ESLint warning budget** `.github/workflows/ci.yml:27`
  - **Type:** Config / CI Drift
  - **What:** `package.json` defines `npm run ci` as `npm ci && npm run lint:eslint && npm run typecheck && npm test && npm run build`, but GitHub Actions manually runs only install, typecheck, test, and build.
  - **Why it matters:** PRs can pass GitHub CI while increasing ESLint warnings beyond the intended local policy.
  - **Evidence:**
    ```json
    // package.json:36-49
    "lint:eslint": "eslint src electron server.ts --max-warnings=120",
    "ci": "npm ci && npm run lint:eslint && npm run typecheck && npm test && npm run build"
    ```
    ```yaml
    # .github/workflows/ci.yml:27-30
    - run: npm ci --prefer-offline
    - run: npm run typecheck
    - run: npm test
    - run: npm run build
    ```
  - **Locations:** `package.json:37`, `package.json:49`, `.github/workflows/ci.yml:27` — 3 occurrences.
  - **Fix:** Use `npm run ci` in GitHub Actions, or add an explicit `npm run lint:eslint` step before typecheck.
  - **Confidence:** [VERIFIED]

- [x] **[BUG-011] `redactSecrets` can recurse forever on cyclic objects** `src/services/redaction.ts:34`
  - **Type:** Robustness / Error Handling
  - **What:** The recursive redactor tracks arrays and objects without a visited set.
  - **Why it matters:** A cyclic diagnostic/import/export object can crash the redaction path with maximum call stack exceeded.
  - **Evidence:**
    ```ts
    // src/services/redaction.ts:34-48
    if (Array.isArray(value)) {
      return value.map((item) => redactValue(item));
    }

    if (typeof value === "object" && value !== null) {
      return Object.fromEntries(
        Object.entries(value).map(([key, child]) => [
          key,
          SECRET_FIELD_PATTERN.test(key) ? "[REDACTED]" : redactValue(child),
        ]),
      );
    }
    ```
  - **Locations:** `src/services/redaction.ts:34` — 1 occurrence.
  - **Fix:** Add a `WeakSet<object>` visited guard and return a safe placeholder for cycles.
  - **Confidence:** [VERIFIED]

## 🟢 Low / Cosmetic
- [x] **[BUG-012] `downloadImage` saves error bodies because HTTP status is ignored** `src/utils/download.ts:15`
  - **Type:** Edge Case / UX
  - **What:** The helper converts every fetch response to a blob without checking `res.ok`.
  - **Why it matters:** A 404/500 response body can be downloaded as if it were an image.
  - **Evidence:**
    ```ts
    // src/utils/download.ts:15-17
    const res = await fetch(url);
    const blob = await res.blob();
    triggerDownload(URL.createObjectURL(blob), filename);
    ```
  - **Locations:** `src/utils/download.ts:15` — 1 occurrence.
  - **Fix:** Throw on `!res.ok` and let callers surface an accurate failure.
  - **Confidence:** [VERIFIED]

- [x] **[BUG-013] ESLint warning budget is masking 96 maintainability/type-safety warnings** `package.json:37`
  - **Type:** Type Safety / Maintainability
  - **What:** `npm run lint:eslint` previously passed with a stale warning budget of 120; the current run emits 96 warnings, mostly `@typescript-eslint/no-explicit-any` and unused variables.
  - **Why it matters:** High-churn modules and reducers continue to accumulate weakly typed boundaries while CI remains green.
  - **Evidence:**
    ```json
    // package.json:37
    "lint:eslint": "eslint src electron server.ts --max-warnings=120"
    ```
    ```ts
    // src/state/appReducer.ts:13
    function updateImages(images: any[], incoming: ImageRecord[]): ImageRecord[] {

    // src/modules/SettingsModule.tsx:14-15
    const isDesktopApiKeyInfo = (value: any): value is DesktopApiKeyInfo =>
      value && typeof value === "object" && typeof value.hasKey === "boolean";
    ```
  - **Locations:** `package.json:37`, `src/state/appReducer.ts:13`, `src/modules/SettingsModule.tsx:14`, `server.ts:191` — 96 warnings total from `npm run lint:eslint`.
  - **Fix:** Ratchet `--max-warnings` downward as warnings are cleared; current gate is set to 96 to prevent regressions.
  - **Confidence:** [VERIFIED]

- [x] **[BUG-014] Unused import in Electron Venice client** `electron/services/veniceClient.ts:9`
  - **Type:** Maintainability
  - **What:** `VeniceIpcRequest` is imported but not used.
  - **Why it matters:** Small but noisy lint debt in a security-sensitive transport file.
  - **Evidence:**
    ```ts
    // electron/services/veniceClient.ts:9
    import type { VeniceIpcRequest, VeniceIpcResponse } from "../ipc/validation";
    ```
  - **Locations:** `electron/services/veniceClient.ts:9` — 1 occurrence.
  - **Fix:** Remove the unused type import or use it where appropriate.
  - **Confidence:** [VERIFIED]

- [x] **[BUG-015] Unused import in Image module** `src/modules/ImageModule.tsx:16`
  - **Type:** Maintainability
  - **What:** `StatusBlock` is imported but not used.
  - **Why it matters:** Adds lint noise in a high-churn UI module.
  - **Evidence:**
    ```tsx
    // src/modules/ImageModule.tsx:16
    import { StatusBlock } from "../components/StatusBlock";
    ```
  - **Locations:** `src/modules/ImageModule.tsx:16` — 1 occurrence.
  - **Fix:** Remove the unused import.
  - **Confidence:** [VERIFIED]

## 📄 Documentation Defects
- [x] **[DOC-001] `docs/ABOUT.md` still describes the app as Windows-first / Windows-only in places** `docs/ABOUT.md:5`
  - **What:** The project now has macOS packaging and docs, but ABOUT still frames the app as Windows-first and says packaging outputs Windows executables only.
  - **Why it matters:** New agents/users get the wrong platform mental model.
  - **Evidence:**
    ```md
    <!-- docs/ABOUT.md:5-13 -->
    Windows-first Electron desktop application
    packaged Electron desktop app for Windows (`.exe`) and a browser-based dev server
    Windows release automation
    ```
  - **Locations:** `docs/ABOUT.md:5`, `docs/ABOUT.md:7`, `docs/ABOUT.md:13`, `docs/ABOUT.md:57` — 4 occurrences.
  - **Fix:** Update ABOUT to dual-platform Windows/macOS language and mention current release workflows.
  - **Confidence:** [VERIFIED]

- [x] **[DOC-002] `docs/ABOUT.md` says batch runs are parallel, but code runs sequentially** `docs/ABOUT.md:66`
  - **What:** The docs advertise "Parallel prompt runs" while `BatchModule` executes a `for` loop and the UI labels the feature sequential.
  - **Evidence:**
    ```md
    <!-- docs/ABOUT.md:66 -->
    - **Batch:** Parallel prompt runs for text or images.
    ```
    ```tsx
    // src/modules/BatchModule.tsx:92-94
    for (let i = 0; i < prompts.length; i++) {
      if (abortRef.current.signal.aborted) break;
    ```
  - **Fix:** Either implement parallelism with safe limits or change the docs to "sequential batch runs."
  - **Confidence:** [VERIFIED]

- [x] **[DOC-003] `docs/ABOUT.md` non-goals contradict current features** `docs/ABOUT.md:98`
  - **What:** ABOUT says auto-update, IndexedDB encryption, and macOS packaging are unsupported/non-goals, but current code/docs include update IPC, encrypted stores, and macOS release workflow.
  - **Evidence:**
    ```md
    <!-- docs/ABOUT.md:98-103 -->
    - Native auto-update UI or background updater.
    - Full encrypted-at-rest database.
    - macOS/Linux packaging.
    ```
    ```ts
    // electron/ipc/updates.ts:110
    ipcMain.handle("app:updates:check", async () => {
    ```
  - **Fix:** Replace the stale non-goals with current limitations.
  - **Confidence:** [VERIFIED]

- [x] **[DOC-004] Copilot instructions document stale web API-key behavior and CI parity** `.github/copilot-instructions.md:28`
  - **What:** The doc says web Settings can save the API key into IndexedDB and describes `npm run ci` without ESLint, but code rejects web key saves and `package.json` includes `lint:eslint` in `ci`.
  - **Evidence:**
    ```md
    <!-- .github/copilot-instructions.md:28,45 -->
    `npm run ci` mirrors required validation: `npm ci`, typecheck, tests, and build.
    The web Settings UI can save a key to IndexedDB for browser-only runs.
    ```
    ```ts
    // src/services/desktopBridge.ts:107-110
    setApiKey: async () => {
      throw new Error("API key storage is available only in Electron mode. Set VENICE_API_KEY in your .env for web mode.");
    },
    ```
  - **Fix:** Update the agent instruction file to match current server-only web key handling and CI command.
  - **Confidence:** [VERIFIED]

- [x] **[DOC-005] Legal docs say gallery image records are not encrypted** `docs/LEGAL.md:33`
  - **What:** LEGAL says gallery image records are not encrypted by the app, but `StorageService` now encrypts `images`, `chats`, and `settings`.
  - **Evidence:**
    ```md
    <!-- docs/LEGAL.md:33 -->
    Local gallery image records are stored in IndexedDB and are not encrypted by this app.
    ```
    ```ts
    // src/services/storageService.ts:8-9
    const ENCRYPTED_STORES: StoreName[] = ["chats", "settings", "images"];
    ```
  - **Fix:** Update legal/security wording to describe current browser-managed AES-GCM encryption and its limitations.
  - **Confidence:** [VERIFIED]

- [x] **[DOC-006] Security docs overstate OS-encryption startup failure behavior** `docs/SECURITY.md:58`
  - **What:** The doc says the app refuses to start if OS encryption is unavailable. The code throws when saving an API key if encryption is unavailable; startup itself is not blocked.
  - **Evidence:**
    ```md
    <!-- docs/SECURITY.md:58 -->
    If OS encryption is unavailable, the app refuses to start unless explicit plaintext fallback is enabled.
    ```
    ```ts
    // electron/services/secureStore.ts:65-84
    if (!safeStorage.isEncryptionAvailable()) {
      if (!isPlaintextFallbackAllowed()) {
        throw new Error("Secure credential storage is unavailable...");
      }
    }
    ```
  - **Fix:** Reword to "API key save fails unless plaintext fallback is enabled" unless startup blocking is intentionally implemented.
  - **Confidence:** [VERIFIED]

- [x] **[DOC-007] README and release docs omit checksum generation before verification** `README.md:72`
  - **What:** Local build docs run `verify:dist:*` immediately after packaging, but verification scripts require `.sha256` sidecar files generated by `npm run checksum:release`.
  - **Evidence:**
    ```md
    <!-- README.md:72-75 -->
    npm run verify:icon
    npm run dist:win
    npm run verify:dist:win
    ```
    ```js
    // scripts/verify-dist-win.cjs:25-27
    const checksumFile = `${filePath}.sha256`;
    if (!fs.existsSync(checksumFile)) throw new Error(`Missing checksum file for ${path.basename(filePath)}`);
    ```
  - **Locations:** `README.md:72`, `README.md:85`, `docs/RELEASE.md:15`, `docs/RELEASE.md:36`, `scripts/verify-dist-win.cjs:25`, `scripts/verify-dist-mac.cjs:25` — 6 occurrences.
  - **Fix:** Insert `npm run checksum:release` before `verify:dist:win` and `verify:dist:mac`, matching `docs/BUILDING.md` and release workflows.
  - **Confidence:** [VERIFIED]

- [x] **[DOC-008] README repeats the same IndexedDB limitation paragraph twice** `README.md:160`
  - **What:** The Known Limitations section contains the IndexedDB encryption limitation, then repeats the same paragraph after Further Reading.
  - **Evidence:**
    ```md
    <!-- README.md:160-178 -->
    IndexedDB records are encrypted with a browser-managed AES-GCM key stored in same-origin IndexedDB...
    ...
    IndexedDB records are encrypted with a browser-managed AES-GCM key stored in same-origin IndexedDB...
    ```
  - **Fix:** Remove the trailing duplicate paragraph.
  - **Confidence:** [VERIFIED]

- [x] **[DOC-009] Changelog has duplicate `[Unreleased]` sections** `CHANGELOG.md:5`
  - **What:** `CHANGELOG.md` defines two separate `[Unreleased]` headings, which splits current changes and confuses the single link reference.
  - **Evidence:**
    ```md
    <!-- CHANGELOG.md:5 and CHANGELOG.md:27 -->
    ## [Unreleased]
    ...
    ## [Unreleased]
    ```
  - **Fix:** Merge both unreleased sections into one.
  - **Confidence:** [VERIFIED]

- [x] **[DOC-010] Changelog claims DuckDuckGo search provider exists** `CHANGELOG.md:95`
  - **What:** Changelog says Research includes DuckDuckGo, but the UI only exposes Brave and Google providers.
  - **Evidence:**
    ```md
    <!-- CHANGELOG.md:95 -->
    Research tab: Brave, Google, and DuckDuckGo search plus scrape/text-parser workflows.
    ```
    ```tsx
    // src/modules/SearchScrapeModule.tsx:178-186
    <option value="brave">Brave</option>
    <option value="google">Google</option>
    ```
  - **Fix:** Remove DuckDuckGo from the changelog or add provider support.
  - **Confidence:** [VERIFIED]

- [x] **[DOC-011] `.env.example` documents only the legacy Venice timeout variable** `.env.example:19`
  - **What:** The config schema reads primary `VENICE_API_TIMEOUT_MS` with legacy fallback `VENICE_TIMEOUT_MS`, but `.env.example` only shows the legacy name.
  - **Evidence:**
    ```env
    # .env.example:19
    # VENICE_TIMEOUT_MS=60000
    ```
    ```ts
    // src/shared/configSchema.ts:42
    VENICE_API_TIMEOUT_MS: parseOptionalIntegerEnv(process.env.VENICE_API_TIMEOUT_MS ?? process.env.VENICE_TIMEOUT_MS, "VENICE_API_TIMEOUT_MS"),
    ```
  - **Fix:** Document `VENICE_API_TIMEOUT_MS` as primary and note `VENICE_TIMEOUT_MS` only as legacy compatibility.
  - **Confidence:** [VERIFIED]

## 📭 Missing Documentation
✅ No standalone missing-documentation gaps found beyond the concrete documentation defects listed above. Core docs present include `README.md`, `CONTRIBUTING.md`, `LICENSE`, `SECURITY.md`, `SUPPORT.md`, `CHANGELOG.md`, `.env.example`, issue templates, PR template, CODEOWNERS, Dependabot, and CI/release workflows.

---

## Quick Wins (effort: <30 min • impact: 🟠 High+)
- [x] Fix **BUG-001** by clearing `loading` in the Image cancel handler and adding a regression test.
- [x] Fix **BUG-002** with a guarded Chat settings sync effect after storage hydration.
- [x] Fix **BUG-010** by adding `npm run lint:eslint` to `.github/workflows/ci.yml` or replacing the manual steps with `npm run ci`.

## Notes & Open Questions
- Files not line-reviewed due scope/size/binary/reference limits: `package-lock.json` (used by `npm audit` only), `build/icon.ico`, `build/icon.icns`, `docs/Venice_swagger_api.yaml`, `docs/venice_llm_info.md`, `dev-electron.log`, and `rup/*`.
- Files referenced but not provided: none observed; referenced docs and config files in the repo were present.
- `npm audit --json` reported 0 vulnerabilities for the current lockfile at scan time.
- `npm run lint:eslint` completed with 0 errors and 96 warnings under the current `--max-warnings=96` budget.
- `todo.md` and `TODO.md` resolve to the same inode on this filesystem; this file updates that existing task document.
