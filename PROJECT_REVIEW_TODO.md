# Venice Forge Project Review Todo

Reviewed: 2026-05-28

Scope: source review of renderer, Electron main/preload/IPC, web proxy, storage/import-export, packaging config, and tests. Verification run: `npm run typecheck`, `npm run lint:eslint`, and `npm test` outside the sandbox after the sandboxed Supertest bind failed with `listen EPERM 0.0.0.0`.

## P0 / Major Bugs

- [x] Fix desktop request diagnostics dropping response headers.
  - Evidence: `src/services/veniceClient.ts` creates `diagHeaders = {}` in `veniceFetchDesktop()` and never copies `response.headers`, so rate-limit and safety headers from `electron/services/veniceClient.ts` are discarded in desktop non-streaming calls.
  - Impact: diagnostics and `Retry-After`-based 429 waits are inaccurate in the production desktop path.
  - Suggested fix: set `diagHeaders = response.headers || {}` before diagnostics and retry calculations.

- [x] Fix desktop network-failure retry logic.
  - Evidence: `veniceFetchDesktop()` computes `isNetworkFailure = lastError.status == null || lastError.status === 0`, but the retry condition also requires `lastError.status !== undefined && lastError.status !== null`, so `null`/`undefined` network failures never retry.
  - Impact: transient desktop DNS/socket/upstream failures do not get the documented retry behavior.
  - Suggested fix: split retryable network failures from HTTP status checks and add a regression test for status `null`/`0`.

- [x] Fix desktop streaming failures being logged as successful diagnostics.
  - Evidence: `veniceStreamChat()` dispatches a desktop diagnostic with `error: ""` before checking `!response.ok`.
  - Impact: failed streaming chat responses show as failed by status but omit the error message in diagnostics/history.
  - Suggested fix: compute `error` from `readDesktopErrorBody(response.body)` when `!response.ok`, mirroring non-streaming requests.

- [x] Add backpressure/size protection to Electron response buffering.
  - Evidence: `electron/services/veniceClient.ts` buffers all non-streaming response chunks into memory without a maximum size.
  - Impact: a large or malicious upstream response can exhaust memory in the main process.
  - Suggested fix: enforce a response byte cap, destroy the request when exceeded, and return a sanitized 502/413-style error.

- [x] Normalize API upload limits across web, IPC JSON, and serialized FormData.
  - Evidence: IPC validation limits `JSON.stringify(body)` to 25 MiB, while renderer FormData serialization rejects based on estimated base64 size, so a file well under 25 MiB raw can fail desktop serialization before the Venice/proxy limit.
  - Impact: desktop text-parser may reject valid files earlier than web mode.
  - Suggested fix: define explicit raw file and serialized IPC limits in one shared config and display the raw-file limit in the UI.

## P1 / Functional Bugs

- [x] Fix import applying the wrong settings record after merge.
  - Evidence: `SettingsModule.importData()` saves imported settings, then uses `settings[0]?.value` after `getItems("settings")` sorts by timestamp descending. Imported records can have old timestamps, so the UI can apply a pre-existing setting instead of the imported `app-settings`.
  - Impact: import reports success but settings may not visibly change.
  - Suggested fix: apply `payload.data.settings.find(s => s.id === "app-settings")?.value`, or choose the imported record explicitly.

- [x] Make batch image generation handle watermark rejection like single-image generation.
  - Evidence: `ImageModule.generate()` retries 400 watermark failures without `hide_watermark`, but `BatchModule` sends `buildImagePayload()` once and marks the task failed.
  - Impact: batch image prompts fail on models/endpoints that reject watermark params while the same prompt works in the Image tab.
  - Suggested fix: extract a shared `generateImageWithWatermarkFallback()` helper and cover both modules.

- [x] Validate scrape URL before sending.
  - Evidence: `SearchScrapeModule.runScrape()` sends `url.trim()` directly.
  - Impact: users can submit unsupported schemes or malformed values and only learn through remote/API failure.
  - Suggested fix: reuse `safeHref()`-style validation and require `https:` unless Venice explicitly supports `http:`.

- [x] Reset stale search/scrape/parser output when a request is aborted or fails.
  - Evidence: module error paths set `error` but leave previous results/output visible.
  - Impact: users can mistake stale data for the latest failed request output.
  - Suggested fix: clear the relevant output at request start or on non-abort failure.

- [x] Prevent follow-up storage refresh after batch cancellation.
  - Evidence: `BatchModule.cancel()` sets state to cancelled, but `runBatch()` continues to final `getItems()` dispatches after the loop.
  - Impact: cancelled work can still trigger storage reads and UI updates after cancellation.
  - Suggested fix: check `abortRef.current?.signal.aborted` before final refreshes, or track a run id.

- [x] Restrict allowed stores at the storage service boundary.
  - Evidence: `StorageService.saveItem/getItems/deleteItem/clearStore` accept arbitrary `store: string` and pass it directly to `db.transaction`.
  - Impact: internal call-site mistakes become runtime `NotFoundError`s instead of typed or validated errors.
  - Suggested fix: type store params as `(typeof STORE_NAMES)[number]` and reject unknown names.

- [x] Improve import schema validation for record shape and field bounds.
  - Evidence: `exportImport.ts` accepts any string image, any number timestamp including `NaN`, and arbitrary nested values except functions/symbols/undefined.
  - Impact: bad imports can poison gallery/settings state or create records that UI components cannot render.
  - Suggested fix: per-store validators for `GalleryImage`, chat records, and settings; reject non-finite timestamps and oversized string fields.

- [x] Add user-facing warning when encrypted IndexedDB rows cannot decrypt.
  - Evidence: `StorageService.getItems()` only `console.warn`s skipped encrypted rows.
  - Impact: users may silently lose visible history after key-store/profile corruption.
  - Suggested fix: return a `{ items, decryptFailures }` result or dispatch a toast during app hydration.

- [x] Make model cache resilient to malformed cached shape.
  - Evidence: `modelService.readCache()` trusts parsed `grouped` and `fetchedAt` shape beyond JSON parse.
  - Impact: corrupted `localStorage` can dispatch malformed models and break model selectors.
  - Suggested fix: validate cached groups with a lightweight schema before dispatching.

## P2 / Minor Bugs And UX Gaps

- [x] Rename the web-mode settings badge.
  - Evidence: Settings shows `Local Key Active` when `apiKeyConfigured` is true, but web mode uses a server `.env` key.
  - Impact: misleading privacy/security wording.
  - Suggested fix: use `Server key active` or `Proxy key configured`.

- [ ] Remove unused imports/variables before tightening lint.
  - Evidence: ESLint reports unused `DiagPreview`, `activeLabel`, `StatusBlock`, `VeniceIpcRequest`, and a gallery map index.
  - Impact: makes review noise and hides real future warnings.

- [x] Decide whether ESLint warnings should fail CI.
  - Evidence: `npm run lint:eslint` emits 131 warnings but exits 0.
  - Impact: type-safety cleanup can regress indefinitely.
  - Suggested fix: set a warning budget, then move toward `--max-warnings=0`.

- [ ] Replace placeholder branding assets before broad release.
  - Evidence: existing `TODO.md` still tracks placeholder icon replacement.
  - Impact: public distribution looks unfinished and can reduce trust.

- [ ] Add copied/downloaded success/error feedback consistency.
  - Evidence: several copy/download handlers call utilities without checking or surfacing failures.
  - Impact: failed clipboard/download actions can appear successful.

- [x] Add invalid-response user messages in Search module.
  - Evidence: invalid search response clears results and returns without `setError`.
  - Impact: users see “No search results” instead of “unexpected response”.

- [x] Disable or scope request logging in production web mode.
  - Evidence: `server.ts` logs every request with `console.log`.
  - Impact: noisy logs and potential operational metadata leakage.

- [ ] Review broad external-link policy.
  - Evidence: Electron opens any `https:` URL after confirmation.
  - Impact: appropriate for search results, but broad for all app-rendered content.
  - Suggested fix: keep confirmation, but consider stronger display of punycode/host and optional denylist for private-network hostnames if URL parsing ever permits them.

- [x] Improve cancel semantics in chat/image modules.
  - Evidence: cancel aborts and clears loading, but request finalizers can still run and mutate status/success.
  - Impact: cancelled requests can produce confusing status messages.
  - Suggested fix: track per-request IDs and ignore stale finalizers.

## P3 / Maintainability And Architecture

- [ ] Replace pervasive `any` in module props and service boundaries.
  - Evidence: ESLint reports many `no-explicit-any` warnings across modules, reducer, storage, and tests.
  - Impact: strict TypeScript is undermined at the highest-change surfaces.
  - Suggested fix: introduce `ModuleProps`, typed diagnostics entries, model groups, and storage record unions.

- [ ] Extract shared API request workflows from modules.
  - Candidates: chat save/refresh, image generate/upscale/save, watermark retry, batch delay/cancel handling.
  - Impact: reduces behavior drift between single and batch flows.

- [ ] Consolidate body-size and timeout constants.
  - Evidence: limits exist in IPC validation, renderer FormData serialization, import/export, server proxy, and shared API config.
  - Impact: user-facing limits drift from actual transport limits.

- [ ] Add tests for desktop retry/diagnostic paths.
  - Current coverage catches many validators and utilities, but not the desktop renderer wrapper bugs above.
  - Suggested tests: desktop non-streaming headers, network retry on null status, streaming non-OK diagnostic error.

- [ ] Add tests for import precedence and malformed record rejection.
  - Suggested tests: imported `app-settings` applies even with older timestamp; `NaN` timestamps and oversized images are rejected/skipped.

- [ ] Add an Electron smoke test for packaged renderer load and text-parser upload.
  - Existing backlog already calls out real-key desktop file upload validation.

- [ ] Add build verification for macOS icon assets before mac release commands.
  - Evidence: `electron-builder.config.cjs` references `build/icon.icns`; ensure `verify:icon` covers both Windows and macOS assets consistently.

- [ ] Consider structured logging for the Express proxy.
  - Use redaction and levels instead of direct console calls; align with Electron logger behavior.

- [ ] Document exact sandbox limitation for `server.test.ts`.
  - Evidence: sandboxed run failed with `listen EPERM 0.0.0.0`; escalated run passed.
  - Suggested doc: tests requiring local bind need normal local permissions.

## Verification Notes

- `npm run typecheck`: passed.
- `npm run lint:eslint`: passed with 131 warnings.
- `npm test`: passed outside the sandbox, 21 files and 141 tests.
- Sandboxed `npm test`: failed only because Supertest could not bind local ephemeral listeners (`listen EPERM 0.0.0.0`).
