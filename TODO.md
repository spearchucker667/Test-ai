# Bug Hunt — TODO

> Generated: 2026-05-28 • Scope: code + docs • Files scanned: ~95 / ~149 tracked

## Summary

| Severity | Count |
|----------|-------|
| Critical | 2 |
| High | 13 |
| Medium | 18 |
| Low / Cosmetic | 14 (+8 grouped) |
| Doc Defect | 11 |
| Missing Doc | 4 |

---

## Critical

- [x] **[BUG-001] `cryptoService` key-generation race condition can overwrite encryption key and permanently lock user data** `src/services/cryptoService.ts:11`
  - **Type:** Concurrency / Data Loss
  - **What:** `getOrCreateKey()` reads the key DB, then (if missing) generates a new key and writes it. Two concurrent calls create a classic TOCTOU race: both read `existing === null`, both generate different keys, and the second `put` overwrites the first. Any data encrypted with the first key becomes permanently undecryptable.
  - **Evidence:**
    ```ts
    async function getOrCreateKey(): Promise<CryptoKey> {
      const db = await openKeyDB();
      const existing = await new Promise<any>((resolve, reject) => {
        const tx = db.transaction("keys", "readonly");
        const req = tx.objectStore("keys").get(KEY_NAME);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      if (existing) return existing.key;
      const key = await crypto.subtle.generateKey(...);
      return new Promise<CryptoKey>((resolve, reject) => {
        const tx = db.transaction("keys", "readwrite");
        const putReq = tx.objectStore("keys").put({ id: KEY_NAME, key });
        putReq.onsuccess = () => resolve(key);
        putReq.onerror = () => reject(putReq.error);
      });
    }
    ```
  - **Fix:** Use a single readwrite transaction for the check-and-set, or wrap the entire function in a promise mutex / `navigator.locks.request`.
  - **Confidence:** [VERIFIED]

- [x] **[BUG-002] Release workflows declare `contents: read` but `action-gh-release` needs `contents: write`** `.github/workflows/windows-release.yml:9` & `.github/workflows/macos-release.yml:9`
  - **Type:** CI / Security / Operational
  - **What:** Both release workflows set `permissions: contents: read` at the workflow level. The `softprops/action-gh-release@v2` step that publishes to GitHub Releases requires `contents: write` to create releases and upload assets. Unless the repository overrides this at the org level, public tag releases will fail at the publish step.
  - **Evidence:**
    ```yml
    permissions:
      contents: read
    ```
    ```yml
    - name: Publish to GitHub Releases
      if: startsWith(github.ref, 'refs/tags/v')
      uses: softprops/action-gh-release@v2
      with:
        files: |
          release/*.exe
          release/*.sha256
    ```
  - **Fix:** Add `permissions: contents: write` to the publish job, or scope it to the specific step via `jobs.release.permissions`.
  - **Confidence:** [VERIFIED]

---

## High

- [x] **[BUG-003] Settings auto-save has no debounce — rapid changes race and can persist out-of-order state** `src/App.tsx:157`
  - **Type:** Concurrency / Resource
  - **What:** `useEffect` watches `[dbReady, settingsHydrated, state.settings]` and fires `StorageService.saveItem` on every settings mutation. There is no debounce, leading to overlapping async writes.
  - **Why it matters:** If the user toggles multiple settings quickly, an earlier slow IndexedDB write can overwrite a later fast one, leaving persisted state inconsistent with in-memory state.
  - **Evidence:**
    ```tsx
    useEffect(() => {
      if (!dbReady || !settingsHydrated) return;
      StorageService.saveItem("settings", {
        id: "app-settings",
        value: state.settings,
        timestamp: Date.now(),
      }).catch((err) => { ... });
    }, [dbReady, settingsHydrated, state.settings]);
    ```
  - **Fix:** Add a debounce (e.g., 500 ms) or a sequential write queue so only the latest settings snapshot is persisted.
  - **Confidence:** [VERIFIED]

- [x] **[BUG-004] IndexedDB init failure still marks `dbReady=true`, causing later writes to a broken database** `src/App.tsx:132`
  - **Type:** Error Handling / Logic
  - **What:** The `finally` block in the IndexedDB bootstrap effect sets `dbReady(true)` and `settingsHydrated(true)` even when the `try` block threw. The settings auto-save effect then fires and attempts `StorageService.saveItem` on a null/broken DB connection.
  - **Evidence:**
    ```tsx
    } catch (err) {
      console.warn("IndexedDB init failed", err);
      dispatch({ type: "ADD_TOAST", toast: { ... } });
    } finally {
      if (mounted) {
        setDbReady(true);
        setSettingsHydrated(true);
      }
    }
    ```
  - **Fix:** Only set `dbReady`/`settingsHydrated` in the `try` block on success; set error flags in `catch` that gate downstream effects.
  - **Confidence:** [VERIFIED]

- [x] **[BUG-005] `SET_CHAT_DRAFT`, `SET_IMAGE_DRAFT`, `SET_BATCH_DRAFT` reducers crash on null/undefined `patch`** `src/state/appReducer.ts:285`
  - **Type:** Null Safety / Crash
  - **What:** `Object.assign(draft.chatDraft, action.patch)` throws a `TypeError` if `action.patch` is `null` or `undefined`. There is no guard.
  - **Evidence:**
    ```ts
    case "SET_CHAT_DRAFT":
      Object.assign(draft.chatDraft, action.patch);
      break;
    ```
  - **Fix:** Add `if (action.patch && typeof action.patch === "object")` guard before `Object.assign`.
  - **Confidence:** [VERIFIED]

- [x] **[BUG-006] `dedupeKey` can throw unhandled `TypeError` on circular request bodies** `src/services/veniceClient.ts:28`
  - **Type:** Error Handling / Crash
  - **What:** `JSON.stringify(body)` inside `dedupeKey` throws when `body` contains circular references. Because `dedupeKey` is called before the try/catch in `veniceFetch`, the exception propagates uncaught to the caller.
  - **Evidence:**
    ```ts
    function dedupeKey(endpoint: string, method: string, body: unknown): string {
      const bodyHash = body === undefined ? "" : JSON.stringify(body);
      return `${method} ${endpoint} ${bodyHash}`;
    }
    ```
  - **Fix:** Wrap `JSON.stringify` in a try/catch and fall back to a hash of `Object.keys` or a placeholder.
  - **Confidence:** [VERIFIED]

- [x] **[BUG-007] Import loops over stores sequentially with `await` inside `for…of` — slow, no transaction atomicity** `src/modules/SettingsModule.tsx:239`
  - **Type:** Performance / Logic
  - **What:** Import writes images, chats, and settings one-by-one with sequential `await` inside loops. If any single `saveItem` throws, previously saved records remain while the import is half-applied.
  - **Evidence:**
    ```ts
    for (const img of payload.data.images) await StorageService.saveItem("images", img);
    for (const chat of payload.data.chats) await StorageService.saveItem("chats", chat);
    for (const s of payload.data.settings) await StorageService.saveItem("settings", s);
    ```
  - **Fix:** Wrap all writes in an IndexedDB transaction, or use `Promise.all` for each store batch. On failure, roll back or warn the user that partial data may exist.
  - **Confidence:** [VERIFIED]

- [x] **[BUG-008] Rate-limit `reqCounts` Map grows unbounded under multi-IP traffic** `server.ts:110`
  - **Type:** Resource / Performance
  - **What:** The cleanup `setInterval` only prunes entries whose `resetTime` has passed. If the server receives requests from a large number of unique IPs, the Map retains an entry per IP indefinitely until each individual window expires.
  - **Evidence:**
    ```ts
    const reqCounts = new Map<string, { count: number; resetTime: number }>();
    setInterval(() => {
      const now = Date.now();
      for (const [ip, record] of reqCounts.entries()) {
        if (now > record.resetTime) { reqCounts.delete(ip); }
      }
    }, ...);
    ```
  - **Fix:** Cap total Map size (e.g., LRU eviction at 10 000 entries) or tighten the cleanup interval.
  - **Confidence:** [VERIFIED]

- [x] **[BUG-009] Circuit-breaker state is module-level and leaks across `createServerApp()` calls** `server.ts:146`
  - **Type:** Logic / Testing
  - **What:** `circuitFailures`, `circuitOpenUntil`, and `reqCounts` are declared at module scope. Tests or server restarts that invoke `createServerApp()` multiple times share mutable state.
  - **Evidence:**
    ```ts
    let circuitFailures = 0;
    let circuitOpenUntil = 0;
    ```
  - **Fix:** Move circuit/rate-limit state inside `createServerApp()` so each app instance is isolated.
  - **Confidence:** [VERIFIED]

- [x] **[BUG-010] `console.error`, `console.warn` left in production renderer and server paths** — 17 occurrences
  - **Type:** Code Quality / Maintainability
  - **What:** Multiple source files contain `console.*` calls that will emit in production builds.
  - **Locations:**
    - `src/App.tsx:60,122,164` — 3× `console.warn`
    - `src/services/storageService.ts:100` — `console.warn`
    - `src/services/imageWorkflowService.ts:126` — `console.error`
    - `src/utils/veniceValidation.ts:37,44,58,72,85,90,104,114` — 8× `console.warn`
    - `server.ts:62,204,212,215,252` — 5× `console.warn` / `console.error`
  - **Fix:** Replace with a conditional logger or a no-op in production. The server already gates request logging behind `NODE_ENV !== "production"`; extend that pattern.
  - **Confidence:** [VERIFIED]

- [x] **[BUG-011] `AbortSignal.any` and `AbortSignal.timeout` may throw in older runtimes** `src/services/veniceClient.ts:504`
  - **Type:** Compatibility / Crash
  - **What:** The web-mode fetch path uses `AbortSignal.any([signal, AbortSignal.timeout(60000)])`. These APIs shipped in Chromium 116+ / Node 20+. If the web build is opened in an older browser the call will throw a `TypeError` and break the request.
  - **Evidence:**
    ```ts
    const fetchSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(60000)])
      : AbortSignal.timeout(60000);
    ```
  - **Fix:** Add a feature-detect fallback: `typeof AbortSignal !== "undefined" && AbortSignal.any ? … : manual timeout via setTimeout + abortController`.
  - **Confidence:** [VERIFIED]

- [x] **[BUG-012] macOS `electron-builder` config omits `hardenedRuntime: true`** `electron-builder.config.cjs:64`
  - **Type:** Config / Security
  - **What:** The `mac` block does not set `hardenedRuntime: true`. Apple notarization requires hardened runtime; without it, public releases may fail notarization or Gatekeeper checks.
  - **Evidence:**
    ```js
    mac: {
      target: [ ... ],
      icon: "build/icon.icns",
      category: "public.app-category.productivity",
      // hardenedRuntime and notarization should be configured via environment ...
    },
    ```
  - **Fix:** Add `hardenedRuntime: true` inside the `mac` block.
  - **Confidence:** [VERIFIED]

- [x] **[BUG-013] `veniceFetch` deduplication map can leak promises on abrupt navigation** `src/services/veniceClient.ts:19`
  - **Type:** Memory / Edge case
  - **What:** `inFlight` is a module-level `Map`. Promises are removed via `.finally(() => inFlight.delete(key))`, but if the page reloads or the renderer process crashes before `finally` fires, the Map entry is orphaned for the lifetime of the JS context.
  - **Evidence:**
    ```ts
    const inFlight = new Map<string, Promise<...>>();
    promise.finally(() => inFlight.delete(key)).catch(() => {});
    ```
  - **Fix:** Add a periodic sweep or a TTL on entries, or clear the map on `beforeunload`.
  - **Confidence:** [SUSPECTED → verify by stress-testing rapid deduped requests with page reloads]

- [x] **[BUG-014] Catch-all Express route uses `req: any, res: any`** `server.ts:244`
  - **Type:** Type Safety
  - **What:** The SPA fallback handler is untyped, bypassing TypeScript checks for header manipulation, path traversal via `req.path`, or incorrect `res.sendFile` usage.
  - **Evidence:**
    ```ts
    app.get("*", (req: any, res: any) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    ```
  - **Fix:** Replace with `req: express.Request, res: express.Response`.
  - **Confidence:** [VERIFIED]

---

## Medium

- [x] **[BUG-015] `server.ts` validation uses `as any` to bypass strict tuple `includes` typing** `server.ts:161`
  - **Type:** Type Safety
  - **What:** `ALLOWED_VENICE_METHODS.includes(method as any)` and `ALLOWED_VENICE_ENDPOINTS.includes(req.path as any)` use `as any` instead of narrowing.
  - **Evidence:**
    ```ts
    if (!ALLOWED_VENICE_METHODS.includes(method as any)) { ... }
    const isAllowed = ALLOWED_VENICE_ENDPOINTS.includes(req.path as any);
    ```
  - **Fix:** Parse/narrow into the union type first, or use a runtime helper that returns the narrowed type.
  - **Confidence:** [VERIFIED]

- [x] **[BUG-016] `validateVeniceIpcRequest` return value discarded in `venice:request` handler** `electron/ipc/handlers.ts:46`
  - **Type:** Logic / Redundancy
  - **What:** The handler calls `validateVeniceIpcRequest(input)` and ignores the sanitized result, then passes the raw `input` to `performVeniceRequest`. `performVeniceRequest` re-validates internally, so the request is still safe, but the first validation is pure overhead.
  - **Evidence:**
    ```ts
    validateVeniceIpcRequest(input);
    return await performVeniceRequest(input);
    ```
  - **Fix:** Use the validated object: `const request = validateVeniceIpcRequest(input); return await performVeniceRequest(request);`
  - **Confidence:** [VERIFIED]

- [x] **[BUG-017] Health check version falls back to "unknown" outside npm** `server.ts:70`
  - **Type:** Logic / Operational
  - **What:** `process.env.npm_package_version` is only injected by npm/yarn. When the production server bundle is started directly via `node dist/server.cjs`, the version becomes `"unknown"`.
  - **Evidence:**
    ```ts
    res.status(200).json({ status: "ok", version: process.env.npm_package_version || "unknown" });
    ```
  - **Fix:** Read version from `package.json` at build or startup time and cache it.
  - **Confidence:** [VERIFIED]

- [x] **[BUG-018] `veniceFetchDesktop` asserts `method as "GET" | "POST"`** `src/services/veniceClient.ts:351`
  - **Type:** Type Safety
  - **What:** Even though validation already happened upstream, the function casts `method` instead of narrowing it.
  - **Evidence:**
    ```ts
    method: method as "GET" | "POST",
    ```
  - **Fix:** Change the parameter type to the union or validate before the call.
  - **Confidence:** [VERIFIED]

- [x] **[BUG-019] Explicit `any` in `veniceFetch` generic default** `src/services/veniceClient.ts:643`
  - **Type:** Type Safety
  - **What:** `export async function veniceFetch<T = any>(...)` disables TypeScript inference for consumers who omit the generic.
  - **Evidence:**
    ```ts
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    export async function veniceFetch<T = any>( ...
    ```
  - **Fix:** Default to `unknown` instead of `any`, or require callers to supply the type.
  - **Confidence:** [VERIFIED]

- [ ] **[BUG-020] `appReducer` and model helpers use `any` parameters and return types** — 6 occurrences
  - **Type:** Type Safety
  - **What:** `classifyModel(model: any)`, `flattenModels(payload: any)`, and state initializers use `any` arrays.
  - **Locations:**
    - `src/state/appReducer.ts:13` — `classifyModel(model: any)`
    - `src/state/appReducer.ts:44` — `flattenModels(payload: any)`
    - `src/state/appReducer.ts:58` — `list.forEach((m: any) => ...)`
    - `src/state/appReducer.ts:122` — `diagnostics: null as any`
    - `src/state/appReducer.ts:124` — `gallery: [] as any[]`
    - `src/state/appReducer.ts:125` — `chats: [] as any[]`
  - **Fix:** Replace with narrow interfaces or `unknown` + guards.
  - **Confidence:** [VERIFIED]

- [ ] **[BUG-021] `StorageService` and `cryptoService` expose `any` in public APIs** — 4 occurrences
  - **Type:** Type Safety
  - **What:** Several public methods accept or return `any`.
  - **Locations:**
    - `src/services/storageService.ts:11` — `GetItemsResult<T = any>`
    - `src/services/storageService.ts:54` — `saveItem<T extends Record<string, any>>`
    - `src/services/cryptoService.ts:53` — `encryptData(data: any): Promise<any>`
    - `src/services/cryptoService.ts:75` — `decryptData(encryptedPayload: any): Promise<any>`
  - **Fix:** Prefer `unknown` for inputs and generics for outputs.
  - **Confidence:** [VERIFIED]

- [x] **[BUG-022] Log rotation overwrites the single backup file** `electron/services/logger.ts:42`
  - **Type:** Data Loss / Operational
  - **What:** When the log exceeds 1 MiB, it is renamed to `.1`, overwriting any previous `.1` file. Only one backup is ever kept.
  - **Evidence:**
    ```ts
    fs.renameSync(logPath, `${logPath}.1`);
    ```
  - **Fix:** Implement a small ring buffer (`.1`, `.2`, `.3`) or append a timestamp.
  - **Confidence:** [VERIFIED]

- [x] **[BUG-023] `catch (err: any)` used in 8+ files — loose error typing masks safety** — 12 occurrences
  - **Type:** Type Safety
  - **What:** The `any` annotation on caught errors prevents the compiler from catching unsafe property accesses.
  - **Locations:**
    - `electron/services/secureStore.ts:40`
    - `electron/services/veniceClient.ts:120,141`
    - `src/services/veniceClient.ts:587,600`
    - `src/services/imageWorkflowService.ts:40,125`
    - `src/modules/SettingsModule.tsx:259`
    - `src/services/desktopBridge.ts:130`
    - `src/services/modelService.ts:42,54`
    - `src/utils/download.ts:38`
    - `src/modules/SearchScrapeModule.tsx:29`
    - `src/shared/configSchema.ts:32`
  - **Fix:** Use `unknown` catch variables with runtime guards (`err instanceof Error`).
  - **Confidence:** [VERIFIED]

- [x] **[BUG-024] `loadJsonFile` success return lacks `ok: true`, inconsistent with `saveJsonFile`** `electron/ipc/handlers.ts:170`
  - **Type:** API Consistency / Logic
  - **What:** `app:loadJsonFile` returns `{ canceled: false, data }` on success, while `app:saveJsonFile` returns `{ ok: true, canceled: false }`. Renderer code must use `!result.canceled` as a proxy for success.
  - **Evidence:**
    ```ts
    return { canceled: false, data };
    ```
  - **Fix:** Return `{ ok: true, canceled: false, data }`.
  - **Confidence:** [VERIFIED]

- [x] **[BUG-025] `signalId` length is not bounded in IPC request validator** `electron/ipc/validation.ts:105`
  - **Type:** Security / Resource
  - **What:** The validator only checks `typeof request.signalId !== "string"`. A multi-megabyte `signalId` passes validation and is used as a Map key in `activeRequests`. The abort handler caps at 128 chars, but the request validator does not.
  - **Evidence:**
    ```ts
    if (request.signalId !== undefined && typeof request.signalId !== "string") {
      throw new Error("Venice signalId must be a string.");
    }
    ```
  - **Fix:** Add `request.signalId.length <= 128` in the validator.
  - **Confidence:** [VERIFIED]

- [x] **[BUG-026] `tsconfig.json` excludes `vite.config.ts` from type-checking** `tsconfig.json:32`
  - **Type:** Type Safety / Config
  - **What:** `vite.config.ts` is listed in `"exclude"`, so `tsc --noEmit` never checks it. Type errors in the Vite config are only caught at runtime.
  - **Evidence:**
    ```json
    "exclude": [
      "node_modules",
      "dist",
      "dist-electron",
      "release",
      "vite.config.ts"
    ]
    ```
  - **Fix:** Create a separate `tsconfig.vite.json` that includes `vite.config.ts` and add it to the typecheck command, or include it in the main config.
  - **Confidence:** [VERIFIED]

- [x] **[BUG-027] `eslint.config.mjs` ignores `scripts/**` and `*.config.*`** `eslint.config.mjs:41`
  - **Type:** Config / Quality
  - **What:** The ignore list excludes all build scripts and config files from linting, meaning bugs in `scripts/verify-dist-*.cjs`, `electron-builder.config.cjs`, etc. are never caught by ESLint.
  - **Evidence:**
    ```js
    ignores: [
      ...
      "scripts/**",
      "*.config.*",
    ],
    ```
  - **Fix:** Remove `"scripts/**"` and `"*.config.*"` from ignores, or add a separate lint pass for Node CJS scripts.
  - **Confidence:** [VERIFIED]

- [x] **[BUG-028] `sleep` ignores already-aborted signals, allowing stale timeouts to proceed** `src/services/veniceClient.ts:47`
  - **Type:** Async / Logic
  - **What:** `sleep` adds an abort listener without checking `signal.aborted` first. If called with an already-aborted signal, the timeout continues instead of rejecting immediately. Callers currently check before invocation, but `sleep` is a public utility that should be robust.
  - **Evidence:**
    ```ts
    function sleep(ms: number, signal?: AbortSignal): Promise<void> {
      return new Promise((resolve, reject) => {
        const id = setTimeout(resolve, ms);
        if (signal) {
          signal.addEventListener("abort", () => {
            clearTimeout(id);
            reject(new DOMException("Request aborted", "AbortError"));
          }, { once: true });
        }
      });
    }
    ```
  - **Fix:** Check `if (signal?.aborted) { reject(...); return; }` before setting the timeout.
  - **Confidence:** [VERIFIED]

- [x] **[BUG-029] `modelService` swallows localStorage write failures silently** `src/services/modelService.ts:52`
  - **Type:** Logic / Maintainability
  - **What:** `writeCache` has an empty catch block. If localStorage is full or disabled, the app silently fails to cache models.
  - **Evidence:**
    ```ts
    try {
      window.localStorage.setItem(CACHE_KEY, JSON.stringify({ grouped, fetchedAt: Date.now() }));
    } catch {
      // localStorage may be full or unavailable.
    }
    ```
  - **Fix:** Surface a warning toast or log to the diagnostics reducer.
  - **Confidence:** [VERIFIED]

- [x] **[BUG-030] `byteLength` uses `new Blob([value]).size` — slow for large strings** `src/services/exportImport.ts:58`
  - **Type:** Performance
  - **What:** `new Blob` allocates memory just to measure UTF-8 byte length.
  - **Evidence:**
    ```ts
    function byteLength(value: string): number {
      return new Blob([value]).size;
    }
    ```
  - **Fix:** Use `Buffer.byteLength(value, "utf-8")` in Node contexts, or `TextEncoder` in the browser.
  - **Confidence:** [VERIFIED]

---

## Low / Cosmetic

- [ ] **[BUG-031] `package.json` `dev` and `dev:web` scripts are identical** `package.json:20`
  - **Type:** Config
  - **What:** Both scripts run `tsx server.ts`, making `dev:web` redundant.
  - **Fix:** Remove `dev:web` or make `dev` an alias that prints a selection prompt.
  - **Confidence:** [VERIFIED]

- [x] **[BUG-032] AGENTS.md and AGENT_REINITIALIZATION.md falsely claim CI omits ESLint** `AGENTS.md` & `AGENT_REINITIALIZATION.md`
  - **Type:** Documentation
  - **What:** Both docs state that `.github/workflows/ci.yml` does not run `npm run lint:eslint`, but the workflow file clearly includes it.
  - **Evidence:**
    ```yml
    - run: npm run lint:eslint
    ```
  - **Fix:** Update both docs to reflect that CI runs the full lint gate.
  - **Confidence:** [VERIFIED]

- [x] **[BUG-033] Lint warning budget mismatch: docs claim 120, package.json enforces 96** `package.json:37`
  - **Type:** Config / Documentation
  - **What:** `AGENT_REINITIALIZATION.md` and `AGENTS.md` mention `--max-warnings=120`, but `package.json` uses `96`.
  - **Evidence:**
    ```json
    "lint:eslint": "eslint src electron server.ts --max-warnings=96"
    ```
  - **Fix:** Align docs with the actual budget, or bump the budget to 120 if that was the intended policy.
  - **Confidence:** [VERIFIED]

- [x] **[BUG-034] `electron-builder.config.cjs` header comment only mentions Windows** `electron-builder.config.cjs:1`
  - **Type:** Documentation
  - **What:** The file header says "Produces a Windows NSIS installer and a portable .exe" but the config also defines macOS targets.
  - **Fix:** Update header to mention dual-platform packaging.
  - **Confidence:** [VERIFIED]

- [x] **[BUG-035] `JSDoc` for `looksLikeUnixTimestamp` is copy-pasted from another function** `src/services/veniceClient.ts:76`
  - **Type:** Documentation
  - **What:** The JSDoc reads "The number to evaluate" with no description of what the function actually does.
  - **Fix:** Write a proper description.
  - **Confidence:** [VERIFIED]

- [x] **[BUG-036] `SettingsModuleProps` uses `state: any, dispatch: any`** `src/modules/SettingsModule.tsx:13`
  - **Type:** Type Safety
  - **What:** The module props are untyped, losing all downstream intellisense and guard safety.
  - **Fix:** Import `AppState` and `AppDispatch` types.
  - **Confidence:** [VERIFIED]

- [x] **[BUG-037] `desktopUpdates` callbacks typed as `(info: unknown)` / `(progress: unknown)`** `src/services/desktopBridge.ts:244`
  - **Type:** Type Safety
  - **What:** Several update callbacks accept `unknown` instead of structured types, forcing consumers to cast.
  - **Fix:** Define narrow IPC types for update info / progress objects.
  - **Confidence:** [VERIFIED]

- [ ] **[BUG-038] `smoke:electron` test only verifies 5-second survival, not actual functionality** `tests/smoke/electron-smoke.test.ts:64`
  - **Type:** Testing
  - **What:** The smoke test spawns the packaged app, waits 5 s, then kills it. It does not verify window creation, preload injection, or IPC reachability.
  - **Fix:** Add a minimal Playwright or Spectron check that the window title is "Venice Forge".
  - **Confidence:** [VERIFIED]

- [x] **[BUG-039] `buildMultipartBody` uses `Math.random()` for boundary token** `electron/services/veniceClient.ts:63`
  - **Type:** Security / Cosmic
  - **What:** Boundary generation is not cryptographically random. Collision probability is negligible for multipart, but it violates the principle of using `crypto.randomBytes` for tokens.
  - **Fix:** Replace with `crypto.randomBytes(16).toString("hex")`.
  - **Confidence:** [VERIFIED]

- [x] **[BUG-040] `normalizeWebSearchSetting` does not warn on invalid input** `src/state/appReducer.ts:99`
  - **Type:** Logic / UX
  - **What:** Any non-boolean, non-recognized string silently falls back to `"off"`.
  - **Fix:** Add a diagnostic toast or log when coercion happens.
  - **Confidence:** [VERIFIED]

- [x] **[BUG-041] `package.json` missing `verify:dist:portable` script** `package.json`
  - **Type:** Config
  - **What:** There is `dist:portable` to build a Windows portable exe, but no corresponding `verify:dist:portable` script.
  - **Fix:** Add `verify:dist:portable` to `scripts/verify-dist-win.cjs` or create a dedicated script.
  - **Confidence:** [VERIFIED]

- [x] **[BUG-042] `isAllowedAppNavigation` path traversal check uses `path.normalize` without symlink resolution** `electron/main.ts:110`
  - **Type:** Security / Logic
  - **What:** `path.normalize` does not resolve symlinks. A symlink inside `dist/` pointing outside the root could bypass containment.
  - **Evidence:**
    ```ts
    const targetPath = path.normalize(fileURLToPath(parsed));
    const normalizedRoot = path.normalize(rendererRoot);
    return targetPath === indexHtml || targetPath.startsWith(`${normalizedRoot}${path.sep}`);
    ```
  - **Fix:** Use `fs.realpathSync` (with try/catch) before containment checks.
  - **Confidence:** [SUSPECTED → verify by creating a symlink escape in dist/]

- [x] **[BUG-043] `verify-dist-mac.cjs` artifact name pattern may not match `electron-builder` default zip naming** `scripts/verify-dist-mac.cjs:66`
  - **Type:** Config / Build
  - **What:** The script expects `Venice-Forge-${version}-${arch}.zip`, but `electron-builder`'s default mac zip naming for x64 is `Venice Forge-${version}-mac.zip` (space, no arch suffix, `-mac` suffix). Only the DMG uses the custom `artifactName` template; zip files do not.
  - **Evidence:**
    ```js
    const zipPattern = new RegExp(`^Venice-Forge-${escapedVersion}-${arch}\\.zip$`);
    ```
  - **Fix:** Add `zip.artifactName` to `electron-builder.config.cjs` to align with the verify script, or update the verify script to match electron-builder's default naming.
  - **Confidence:** [SUSPECTED → verify by running `npm run dist:mac` and inspecting `release/*.zip`]

> +8 additional low/cosmetic items not individually listed (minor whitespace inconsistencies, redundant `as const` casts, stray blank lines).

---

## Documentation Defects

- [x] **[DOC-001] AGENTS.md claims CI omits ESLint, but `ci.yml` runs it** `AGENTS.md §Current Operational Reality`
  - **What:** Doc says "GitHub `ci.yml` currently runs typecheck/test/build, not ESLint."
  - **Fix:** Update to "CI runs lint:eslint, typecheck, test, and build."
  - **Confidence:** [VERIFIED]

- [x] **[DOC-002] AGENT_REINITIALIZATION.md section 9.2 incorrectly states ci.yml omits ESLint** `AGENT_REINITIALIZATION.md:366`
  - **What:** "`ci.yml` does not call `npm run lint:eslint`. `[VERIFIED]`" — directly contradicted by the workflow file.
  - **Fix:** Remove the false claim and update the command table.
  - **Confidence:** [VERIFIED]

- [x] **[DOC-003] AGENT_REINITIALIZATION.md says lint budget is 120, actual is 96** `AGENT_REINITIALIZATION.md:14`
  - **What:** "local `npm run lint:eslint` (`--max-warnings=120`)"
  - **Fix:** Change to 96 or update `package.json` to 120.
  - **Confidence:** [VERIFIED]

- [x] **[DOC-004] `electron-builder.config.cjs` stale comment about Windows-only** `electron-builder.config.cjs:3`
  - **What:** Comment says "Produces a Windows NSIS installer and a portable .exe" but config now builds macOS too.
  - **Fix:** Update header comment to reflect dual-platform support.
  - **Confidence:** [VERIFIED]

- [x] **[DOC-005] `CHANGELOG.md` has no versioned release sections** `CHANGELOG.md`
  - **What:** The file only contains `[Unreleased]`. With `package.json` at `1.0.1` and release artifacts in `release/`, there should be dated `## [1.0.1]` and `## [1.0.0]` sections.
  - **Fix:** Add versioned sections with release dates.
  - **Confidence:** [VERIFIED]

- [x] **[DOC-006] `docs/REPOSITORY_TREE.md` has broken indentation under `workflows/`** `docs/REPOSITORY_TREE.md:16`
  - **What:** `ci.yml`, `macos-release.yml`, and `windows-release.yml` are rendered at the same level as `workflows/`, not as children.
  - **Evidence:**
    ```text
    │   ├── workflows/
    │   ├── ci.yml                     # Main CI/CD pipeline ...
    │   ├── macos-release.yml          # macOS build...
    │   └── windows-release.yml        # Windows build...
    ```
  - **Fix:** Indent the workflow files under `workflows/`.
  - **Confidence:** [VERIFIED]

- [x] **[DOC-007] `docs/REPOSITORY_TREE.md` says CI does "lint, test, build" but omits `typecheck`** `docs/REPOSITORY_TREE.md:16`
  - **What:** The `ci.yml` comment says "lint, test, build" but the actual steps are `lint:eslint`, `typecheck`, `test`, `build`.
  - **Fix:** Update the comment to include `typecheck`.
  - **Confidence:** [VERIFIED]

- [x] **[DOC-008] `docs/SIGNING_AND_NOTARIZATION.md` claims `hardenedRuntime: true` was disabled, but config never had it** `docs/SIGNING_AND_NOTARIZATION.md:21`
  - **What:** "`hardenedRuntime: true` has intentionally been disabled in `electron-builder.config.cjs`" — the config never explicitly set it to true; it simply omits the field.
  - **Fix:** Clarify that the field is absent (defaults false), not explicitly disabled.
  - **Confidence:** [VERIFIED]

- [x] **[DOC-009] `docs/RELEASE.md` expected artifacts for macOS omit the `-mac` suffix on zip files** `docs/RELEASE.md:50`
  - **What:** The doc lists `Venice-Forge-<version>-arm64.zip` but `electron-builder` default naming produces `Venice Forge-<version>-arm64-mac.zip`.
  - **Fix:** Align expected artifact names with actual `electron-builder` output, or set `zip.artifactName` in the config.
  - **Confidence:** [SUSPECTED]

- [x] **[DOC-010] `AGENT_REINITIALIZATION.md` section 8.4 still claims CI omits ESLint** `AGENT_REINITIALIZATION.md:314`
  - **What:** "CI workflow (`.github/workflows/ci.yml`) currently does not run `npm run lint:eslint`" — contradicted by the file.
  - **Fix:** Remove or correct the claim.
  - **Confidence:** [VERIFIED]

- [x] **[DOC-011] `README.md` uses backslash-escaped space in `xattr` example instead of quotes** `README.md:98`
  - **What:** `xattr -dr com.apple.quarantine /path/to/Venice\ Forge.app` is valid bash but less readable than quoted paths. More importantly, if a user copies this into a shell that doesn't interpret backslash escapes the same way, it may fail.
  - **Fix:** Use quotes: `"/path/to/Venice Forge.app"`.
  - **Confidence:** [VERIFIED]

---

## Missing Documentation

- [x] **[GAP-001] `.env.example` missing `VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE`** `.env.example`
  - **What:** Read by `electron/services/secureStore.ts` but not listed.
  - **Fix:** Add it with a comment explaining the Linux plaintext fallback risk.
  - **Confidence:** [VERIFIED]

- [x] **[GAP-002] `.env.example` missing `VENICE_FORGE_DEBUG_DEVTOOLS`** `.env.example`
  - **What:** Read by `electron/main.ts` to allow devtools in production builds. Not documented.
  - **Fix:** Add to `.env.example` with a security warning.
  - **Confidence:** [VERIFIED]

- [x] **[GAP-003] `AGENT_REINITIALIZATION.md` section 10.4 verification checklist is not itself verified against current files** `AGENT_REINITIALIZATION.md:439`
  - **What:** The checklist claims to verify command accuracy, but the lint budget and CI commands are wrong.
  - **Fix:** Run the checklist against the current repo state and fix discrepancies.
  - **Confidence:** [VERIFIED]

- [x] **[GAP-004] No `verify:dist:portable` script documented or implemented** `package.json` & `docs/RELEASE.md`
  - **What:** `dist:portable` exists but there is no verification script or docs for it.
  - **Fix:** Add script and document expected portable artifact.
  - **Confidence:** [VERIFIED]

---

## Quick Wins (effort: <30 min • impact: High+)

- [x] BUG-016 — Use validated request object in IPC handler (1-line fix)
- [x] BUG-014 — Add Express types to catch-all route (2-line fix)
- [x] BUG-015 — Remove `as any` in server validation (use runtime guard + type predicate)
- [x] BUG-017 — Read version from `package.json` in health endpoint (5-line fix)
- [x] BUG-032 / DOC-001 / DOC-002 / DOC-003 — Sync docs with actual CI and lint config (text-only)
- [x] BUG-039 — Replace `Math.random()` boundary with `crypto.randomBytes` (1-line fix)
- [x] BUG-024 — Add `ok: true` to `loadJsonFile` success return (1-line fix)
- [x] BUG-025 — Add `signalId` length cap in validator (1-line fix)
- [x] BUG-026 — Remove `vite.config.ts` from `tsconfig.json` exclude (1-line fix)
- [x] BUG-027 — Include `scripts/**` in ESLint coverage (config-only)

---

## Notes & Open Questions

- Files not scanned in full (scope limit): `src/modules/ChatModule.tsx`, `src/modules/ImageModule.tsx`, `src/modules/BatchModule.tsx`, `src/modules/SearchScrapeModule.tsx`, `src/modules/ModelsModule.tsx`, `src/modules/GalleryModule.tsx`, `src/modules/DiagnosticsModule.tsx`, most files under `src/components/` and `src/hooks/` (other than those explicitly read), `electron/preload.ts`.
- Background explore agents (`agent-8n0zvup1`, `agent-x9u6wex8`, `agent-26agulef`, `agent-ha7v730r`) contributed additional suspected issues; all significant verified findings have been merged above.
- The `dangerouslySetInnerHTML` in `src/utils/markdown.tsx` was reviewed and is **not** an XSS vulnerability because `escapeHtml` runs before all regex replacements. However, the ordering of markdown transforms may produce unexpected rendering for edge-case inputs (e.g., headings inside blockquotes).
- `npm audit` returned 0 known dependency vulnerabilities at scan time.
