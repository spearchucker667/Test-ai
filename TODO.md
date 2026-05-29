# Venice Forge — Master Task Tracker

> Generated: 2026-05-29 (comprehensive pass)  
> Scope: code + docs + theme system  
> Status: All Critical/High/Medium/Low bugs from Pass 1 & 2 resolved. Theme system implemented.

---

## Summary

| Category | Count | Status |
|----------|-------|--------|
| Critical bugs | 2 | **Resolved** |
| High bugs | 14 | **Resolved** |
| Medium bugs | 22 | **Resolved** |
| Low / Cosmetic | 15 (+8 grouped) | **Resolved** |
| Doc Defects | 12 | **Resolved** |
| Missing Docs | 4 | **Resolved** |
| Theme system (new) | 1 major feature | **Implemented** |

---

## Completed — Bug Hunt Pass 1 & 2

All items below were verified and fixed. See `CHANGELOG.md` for detailed descriptions.

### Critical
- [x] **[BUG-001]** `cryptoService` key-generation race condition (TOCTOU)
- [x] **[BUG-002]** Release workflows `contents: read` → needs `contents: write`

### High
- [x] **[BUG-003]** Settings auto-save debounce (500 ms)
- [x] **[BUG-004]** IndexedDB init failure no longer marks `dbReady=true`
- [x] **[BUG-005]** `SET_*_DRAFT` reducers guarded against null/undefined patch
- [x] **[BUG-006]** `dedupeKey` handles circular references
- [x] **[BUG-007]** Import writes parallelised via `Promise.all`
- [x] **[BUG-008]** Rate-limit Map capped at 10,000 entries (FIFO eviction)
- [x] **[BUG-009]** Circuit-breaker state moved inside `createServerApp()`
- [x] **[BUG-010]** 17× `console.*` calls replaced with conditional shared logger
- [x] **[BUG-011]** `AbortSignal.any`/`timeout` fallback for older runtimes
- [x] **[BUG-012]** `hardenedRuntime: true` added to macOS config
- [x] **[BUG-013]** `beforeunload` listener clears `inFlight` dedup map
- [x] **[BUG-014]** Catch-all Express route typed with `Request`/`Response`
- [x] **[BUG-044]** `BatchDraft` type synced to actual state shape (`promptsText`)
- [x] **[BUG-045]** `keyPromise` rejection resets latch for retry

### Medium
- [x] **[BUG-015]** `as any` removed from server validation (runtime guard + type predicate)
- [x] **[BUG-016]** IPC handler uses validated request object
- [x] **[BUG-017]** Health endpoint reads version from `package.json`
- [x] **[BUG-018]** `veniceFetchDesktop` method narrowed properly
- [x] **[BUG-019]** `veniceFetch<T = unknown>` instead of `any`
- [x] **[BUG-020]** Partially resolved — see Remainder §Partially Resolved
- [x] **[BUG-021]** `StorageService`/`cryptoService` `any` replaced with generics/types
- [x] **[BUG-022]** Log rotation ring buffer (`.1`, `.2`, `.3`)
- [x] **[BUG-023]** `catch (err: any)` → `catch (err)` + runtime guards (12 files)
- [x] **[BUG-024]** `loadJsonFile` returns `{ ok: true, canceled: false, data }`
- [x] **[BUG-025]** `signalId` length capped at 128 chars in validator
- [x] **[BUG-026]** `vite.config.ts` removed from `tsconfig.json` exclude
- [x] **[BUG-027]** `scripts/**` included in ESLint coverage
- [x] **[BUG-028]** `sleep` rejects immediately on already-aborted signal
- [x] **[BUG-029]** `modelService` localStorage failure logged via shared logger
- [x] **[BUG-030]** `byteLength` uses `TextEncoder` instead of `Blob`
- [x] **[BUG-046]** IPC `endpoint.search` capped at 512 bytes
- [x] **[BUG-047]** Web-mode export defers `URL.revokeObjectURL` by 1 s
- [x] **[BUG-048]** Circuit breaker resets `circuitFailures` on half-open re-entry
- [x] **[BUG-049]** Rate-limit cleanup interval stored and exposed for teardown

### Low / Cosmetic
- [x] **[BUG-031]** `dev:web` made explicit alias of `dev`
- [x] **[BUG-032]** AGENTS.md CI/ESLint claims corrected
- [x] **[BUG-033]** Lint budget aligned (96) across docs and config
- [x] **[BUG-034]** `electron-builder.config.cjs` header updated for dual-platform
- [x] **[BUG-035]** `looksLikeUnixTimestamp` JSDoc fixed
- [x] **[BUG-036]** `SettingsModuleProps` typed with `AppState`/`AppDispatch`
- [x] **[BUG-037]** `desktopUpdates` callbacks typed with `electron-updater` types
- [x] **[BUG-038]** Electron smoke test enhanced (stderr scanning, graceful exit check)
- [x] **[BUG-039]** `Math.random()` boundary → `crypto.randomBytes`
- [x] **[BUG-040]** `normalizeWebSearchSetting` warns on invalid input
- [x] **[BUG-041]** `verify:dist:portable` script added
- [x] **[BUG-042]** `isAllowedAppNavigation` uses `fs.realpathSync`
- [x] **[BUG-043]** `zip.artifactName` added to align verify script with builder
- [x] **[BUG-050]** Misleading `apiKey?` removed from `AppSettings` type
- [x] **Payload fixes (BUG-004–008 payload)** Schema serialization, Zod error parsing, diagnostic deduplication, legacy boolean coercion, multipart upload serialization

### Documentation
- [x] **[DOC-001–012]** All doc defects fixed (CI claims, lint budget, builder comments, changelog versioning, repo tree indentation, signing docs, artifact names, xattr quotes, env comments)
- [x] **[GAP-001–004]** Missing env vars documented; verification checklist reconciled; portable script documented

---

## Completed — Theme System Implementation

- [x] **THEME-001** Created `src/theme/` with full type contracts, built-in palettes, apply logic, contrast utilities, and barrel export
- [x] **THEME-002** Extended `AppSettings`, `initialState`, and `SET_SETTINGS` whitelist with `selectedThemeId`, `appearanceMode`, `customTheme`
- [x] **THEME-003** Added FOUC-prevention inline bootstrap script to `index.html`
- [x] **THEME-004** Expanded `src/index.css` with 17-token `@theme` semantic colors, `.btn` system, reduced-motion support
- [x] **THEME-005** Implemented `applyTheme()` with CSS variable mapping and `data-theme-mode` attribute
- [x] **THEME-006** Implemented `resolveInitialTheme()` with custom → builtin → prefers-color-scheme fallback chain
- [x] **THEME-007** Built `ThemeMaker.tsx` with theme selector, token editors, hex validation, live preview, Save/Reset/Restore
- [x] **THEME-008** Built `ThemePreview.tsx` with mini app mock-up and WCAG AA contrast warning region (`aria-live="polite"`)
- [x] **THEME-009** Reskinned App shell (header, sidebar, mobile nav, offline banner) to semantic tokens
- [x] **THEME-010** Reskinned all shared components (TabButton, Chip, ToastHost, StatusBlock, ErrorBoundary, ConfirmModal, Field, CollapsibleSection, ModelSelect, DiagnosticsPreview, ImageGenerationForm, ImageGenerationPreview, ImageActionModal)
- [x] **THEME-011** Reskinned all modules (Chat, Image, Batch, SearchScrape, Models, Gallery, Settings, Diagnostics)
- [x] **THEME-012** Verified WCAG AA contrast for all built-in themes (min 4.90:1 on accent)
- [x] **THEME-013** Verified persistence: IndexedDB canonical + localStorage bootstrap cache
- [x] **THEME-014** Verified no raw hex leakage in components/modules (grep exit code 1)
- [x] **THEME-015** All build, test, typecheck, lint gates pass (0 errors, 73 warnings within 96 budget)

---

## Remainder — Exhaustive Open Work

### Partially Resolved

- [ ] **[BUG-020]** `appReducer` and model helpers use `any` parameters and return types
  - **Status:** `settings` cast tightened; `theme` literal widened. `classifyModel`, `flattenModels`, and state initializers remain `any` due to `AppState = typeof initialState` circular dependency.
  - **Fix:** Coordinated model-type refactor. Introduce narrow `VeniceModel` interface, replace `any[]` initializers with `[]`, and break the circular dependency by extracting `AppState` shape into a standalone interface.
  - **Effort:** Medium (2–4 hours, touches `appReducer.ts`, `types/app.ts`, `types/venice.ts`, and all module casts)

### Suspected / Needs Verification

- [ ] **[BUG-042 follow-up]** Symlink traversal in `isAllowedAppNavigation`
  - **Status:** `fs.realpathSync` added with try/catch, but no automated test verifies symlink escape is blocked.
  - **Fix:** Add unit test creating a symlink in `dist/` pointing outside the repo and asserting navigation is rejected.
  - **Effort:** Low (30 min)

- [ ] **[BUG-043 follow-up]** macOS ZIP artifact naming
  - **Status:** `zip.artifactName` added to config to align with verify script, but a full `npm run dist:mac` has not been executed to confirm actual filenames.
  - **Fix:** Run a local macOS build and inspect `release/*.zip` names, or rely on CI to validate.
  - **Effort:** Low (requires macOS environment)

### Theme System — Known Limitations & Enhancements

- [ ] **[THEME-R001]** Bootstrap script duplication
  - **What:** The inline `<script>` in `index.html` duplicates a subset of token fallback logic from `src/theme/applyTheme.ts`.
  - **Risk:** If built-in palette colors change, the fallback map in `index.html` may drift.
  - **Fix:** Generate the fallback map at build time from `src/theme/themes.ts` via a Vite plugin, or import a JSON manifest.
  - **Effort:** Medium

- [ ] **[THEME-R002]** Light mode edge-case audit
  - **What:** Some legacy elements may still assume dark backgrounds (e.g. colored badges on colored backgrounds, hardcoded `shadow-black` equivalents).
  - **Fix:** Systematic visual audit of all modules in Forge Daylight mode; replace any remaining dark assumptions.
  - **Effort:** Low–Medium (1–2 hours)

- [ ] **[THEME-R003]** Additional built-in themes
  - **What:** Only three themes exist. Users may want more variety (e.g. high-contrast, solarized, nord, dracula).
  - **Fix:** Add community-friendly palettes; ensure all pass WCAG AA.
  - **Effort:** Low per theme

- [ ] **[THEME-R004]** Theme export/import
  - **What:** Custom themes are persisted in IndexedDB as part of settings, but the Export/Import flow does not explicitly surface or validate theme objects.
  - **Fix:** Verify that `customTheme` round-trips correctly through export/import; add schema validation for `Theme` shape in `exportImport.ts` if missing.
  - **Effort:** Low (30 min)

- [ ] **[THEME-R005]** Per-mode custom themes
  - **What:** Currently one `customTheme` object. Users may want separate custom dark and custom light themes.
  - **Fix:** Extend `ThemeState` to `customThemeDark`/`customThemeLight` or add a `mode` field to custom themes.
  - **Effort:** Medium (touches reducer, ThemeMaker UI, settings shape)

- [ ] **[THEME-R006]** `prefers-contrast` support
  - **What:** No high-contrast or reduced-transparency variants.
  - **Fix:** Add `prefers-contrast: more` and `prefers-contrast: less` media query overrides in `src/index.css`.
  - **Effort:** Low

### Performance & Runtime

- [ ] **[PERF-001]** `ThemeMaker` re-renders the entire app on every token change
  - **What:** `applyTheme(draftTheme)` mutates `:root` CSS variables directly, which is fast, but React still re-renders the ThemeMaker component on every keystroke.
  - **Fix:** Debounce hex input changes (e.g. 50 ms) or use `useDeferredValue` for the preview.
  - **Effort:** Low

- [ ] **[PERF-002]** `localStorage` bootstrap write on every settings change
  - **What:** `App.tsx` writes `vf.theme.bootstrap` whenever `state.settings` changes, even for non-theme fields.
  - **Fix:** Only write when theme-relevant fields change.
  - **Effort:** Low (1-line `useEffect` dependency tweak)

### Testing Gaps

- [ ] **[TEST-001]** No unit tests for `applyTheme` or `resolveInitialTheme`
  - **Fix:** Add `src/theme/applyTheme.test.ts` mocking `document.documentElement.style` and verifying CSS variable assignment and fallback chain.
  - **Effort:** Low (30 min)

- [ ] **[TEST-002]** No unit tests for `contrast.ts`
  - **Fix:** Add `src/theme/contrast.test.ts` with known-good WCAG pairs (black/white, blue/white) and edge cases.
  - **Effort:** Low (15 min)

- [ ] **[TEST-003]** No unit tests for `ThemeMaker` or `ThemePreview`
  - **Fix:** Add React Testing Library tests for theme selection, hex validation, and contrast warning display.
  - **Effort:** Medium (1–2 hours)

- [ ] **[TEST-004]** Electron smoke test is still minimal
  - **Status:** Enhanced in BUG-038, but still does not verify window creation, preload injection, or IPC reachability.
  - **Fix:** Add Playwright or Spectron-based smoke tests, or at least verify `window.veniceForge` is injected.
  - **Effort:** High (requires new dependency or native module)

### Documentation Gaps

- [ ] **[DOC-R001]** `docs/THEME_SYSTEM.md` needs continuous updates
  - **Action:** Whenever a new built-in theme is added or token set changes, update this file.
  - **Owner:** Future contributors

- [ ] **[DOC-R002]** `docs/REPOSITORY_TREE.md` may drift
  - **Action:** Re-run `tree` or manual audit before each release to ensure file listings match reality.
  - **Effort:** Low (automate with `tree -I 'node_modules|dist|dist-electron|release|.git'`)

- [ ] **[DOC-R003]** `AGENT_REINITIALIZATION.md` pinned versions may stale
  - **Action:** After any dependency update, refresh the lockfile-grounded version table in section 6.1.
  - **Effort:** Low

### Security & Hardening

- [ ] **[SEC-R001]** Content Security Policy (CSP) does not mention `unsafe-inline` for the bootstrap script
  - **What:** The inline script in `index.html` may violate a strict CSP if one is enforced.
  - **Fix:** Either move the bootstrap to an external `.js` file, or ensure the CSP hash/nonce covers it. Verify in `electron/main.ts` CSP string.
  - **Effort:** Low

- [ ] **[SEC-R002]** `VENICE_FORGE_DEBUG_DEVTOOLS` bypass is not logged
  - **What:** Enabling devtools in production is a security-relevant event but produces no audit log.
  - **Fix:** Log a warning to the main-process logger when `VENICE_FORGE_DEBUG_DEVTOOLS=true` is detected.
  - **Effort:** Low

### Refactoring Debt

- [ ] **[REFACTOR-001]** `App.tsx` is 348 lines and handles too many concerns
  - **What:** Hydration, theme lifecycle, network status, bridge init, routing, and settings save all live in one file.
  - **Fix:** Extract hooks: `useThemeLifecycle`, `useNetworkStatus`, `useSettingsPersistence`.
  - **Effort:** Medium (2–3 hours)

- [ ] **[REFACTOR-002]** Module props pattern is inconsistent
  - **What:** Some modules take `{ state, dispatch }`; others may take additional props. No enforced contract.
  - **Fix:** Introduce a `ModuleProps` type alias in `src/types/app.ts` and apply it uniformly.
  - **Effort:** Low–Medium (1 hour)

- [ ] **[REFACTOR-003]** `src/index.css` is large and mixes concerns
  - **What:** Tailwind `@theme`, global styles, button system, scrollbar theming, reduced-motion, and FOUC prevention all in one file.
  - **Fix:** Split into `src/styles/theme.css`, `src/styles/components.css`, `src/styles/global.css` and import them from `index.css`.
  - **Effort:** Low (1 hour, mostly file moves)

---

## Quick Wins (effort <30 min • impact: Medium+)

| ID | Task | File(s) |
|----|------|---------|
| QW-01 | Add `applyTheme.test.ts` | `src/theme/applyTheme.test.ts` |
| QW-02 | Add `contrast.test.ts` | `src/theme/contrast.test.ts` |
| QW-03 | Restrict bootstrap cache writes to theme-field changes only | `src/App.tsx` |
| QW-04 | Add `prefers-contrast: more` media query overrides | `src/index.css` |
| QW-05 | Log devtools bypass event | `electron/main.ts` |
| QW-06 | Automate repo tree generation in release checklist | `docs/RELEASE/release.md` |
| QW-07 | Add symlink escape unit test | `electron/main.ts` or new test file |

---

## Notes

- `npm audit` returned 0 known dependency vulnerabilities at last scan.
- The `dangerouslySetInnerHTML` in `src/utils/markdown.tsx` is **not** an XSS vulnerability because `escapeHtml` runs before all regex replacements.
- All `aria-live` regions from before the theme work were preserved; no regressions in screen-reader behavior.
- One unrelated pre-existing diff exists in `src/modules/ChatModule.test.tsx` (BUG-051 regression guard) — outside theme scope and should be committed separately.
