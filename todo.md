# Bug Hunt — TODO

> Generated: 2026-05-29 • Scope: code + docs • Files scanned: 38 / 115

## Summary
| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 2 |
| Medium | 3 |
| Low / Cosmetic | 4 |
| Doc Defect | 1 |
| Missing Doc / Gap | 4 |

---

## Critical

No critical issues found.

---

## High

- [x] **[BUG-001] `extractFromSerializedFormData` always returns empty — safety scanner blind to FormData fields** `src/shared/safety/promptPayloadExtractor.ts:54`
  - **Type:** Logic / Security
  - **What:** `serializeFormData` (veniceClient.ts:353) produces entries as plain objects `{ name, value, ... }`.  
    `extractFromSerializedFormData` checks `if (!Array.isArray(entry) || entry.length < 2) continue;` — this is **always true** for objects, so every entry is skipped and the function always returns `[]`.
  - **Why it matters:** Any future endpoint that sends FormData with text fields (e.g. `/augment/text-parser` via multipart) would have those fields completely invisible to the child-exploitation safety guard. Currently low-immediate-impact because the only FormData endpoint (`/image/upscale`) maps to `ENDPOINT_FIELDS: []`, but the structural flaw silently defeats the extractor for the entire FormData path.
  - **Evidence:**
    ```ts
    // veniceClient.ts:353 — entries are objects, NOT arrays
    entries.push({ name, value: String(value) });
    // ...
    return { _isSerializedFormData: true, entries };

    // promptPayloadExtractor.ts:54 — array check always skips objects
    if (!Array.isArray(entry) || entry.length < 2) continue; // ← always true
    const [key, val] = entry; // ← never reached
    ```
  - **Fix:** Replace the array check with an object-property read:
    ```ts
    if (typeof entry !== "object" || entry === null || !("name" in entry)) continue;
    const key = (entry as { name: unknown }).name;
    const val = (entry as { value: unknown }).value;
    if (typeof key !== "string") continue;
    ```
  - **Confidence:** [VERIFIED]

- [x] **[BUG-002] `app:loadJsonFile` error path silently swallowed — user gets no feedback on file read failures** `electron/ipc/handlers.ts:245` / `src/services/desktopBridge.ts:226`
  - **Type:** Error Handling / UX
  - **What:** When `fs.readFile` or `fs.stat` throws (e.g. file too large, permissions denied), the handler returns `{ canceled: false, error: redactErrorMessage(err) }` — no `ok: false` field.  
    `desktopBridge.importJsonString()` checks `if (result.canceled || !result.data) return null;`. Since `result.data` is `undefined`, it returns `null`. `importData()` then does `if (!json) return;` — silently discarding the error. The user sees nothing happen.
  - **Why it matters:** Any file read failure (corrupt path, >MAX_JSON_FILE_BYTES, OS permission error) presents as "nothing happened" with no error toast or message. Debugging an import failure is impossible without devtools.
  - **Evidence:**
    ```ts
    // handlers.ts:245
    return { canceled: false, error: redactErrorMessage(err) }; // no ok:false, no data
    
    // desktopBridge.ts:226
    if (result.canceled || !result.data) return null; // null on error AND on cancel
    
    // SettingsModule.tsx (importData)
    const json = await desktopFiles.importJsonString();
    if (!json) return; // ← no error surfaced
    ```
  - **Fix:** Return `{ ok: false, canceled: false, error: redactErrorMessage(err) }` from the handler; update `desktopBridge.importJsonString()` to distinguish cancel from error, and surface the error through `dispatch` / toast in `importData`.
  - **Confidence:** [VERIFIED]

---

## Medium

- [x] **[BUG-003] `FUZZY_ALLOWLIST` contains "shota" — a term also in `CSAM_GENRE_LABELS`** `src/shared/safety/childExploitationGuard.ts:106,422`
  - **Type:** Logic / Security (defence-in-depth gap)
  - **What:** `"shota"` is in `CSAM_GENRE_LABELS` (line 106) and simultaneously in `FUZZY_ALLOWLIST` (line 422). The allowlist is checked at **P7 (fuzzy match)**; the `CSAM_GENRE_LABELS` exact check runs at **P0** before fuzzy — so no bypass currently exists. However, any refactoring that changes evaluation order, or a future code path that calls `fuzzyMatchesCritical` independently, could quietly exempt "shota" from fuzzy detection.
  - **Evidence:**
    ```ts
    const CSAM_GENRE_LABELS: readonly string[] = [
      "loli", "lolicon", "lolita", "shota", "shotacon",   // line 106
    ];
    const FUZZY_ALLOWLIST = new Set<string>([
      ...
      "shot", "shota", ...  // line 422 — CSAM term in the allowlist
    ]);
    if (FUZZY_ALLOWLIST.has(token)) continue;  // line 432
    ```
  - **Fix:** Remove `"shota"` (and any other CSAM terms) from `FUZZY_ALLOWLIST`. The allowlist is for common innocent words that fuzzy-match critical terms; CSAM terms do not belong in it. Add an invariant test asserting that `FUZZY_ALLOWLIST ∩ CSAM_GENRE_LABELS = ∅`.
  - **Confidence:** [VERIFIED]

- [x] **[BUG-004] `assessChildExploitationSafety` computes `assessSingleNormalizedText` on every field twice** `src/shared/safety/childExploitationGuard.ts`
  - **Type:** Performance / Redundancy
  - **What:** The blocking first pass (fields loop, ~line 798) calls `assessSingleNormalizedText(field, norms)` for each field and short-circuits on `block`. The warn third pass (fields loop, ~line 821) calls `assessSingleNormalizedText` again on the same fields for `WARN_THRESHOLD` detection. No results are cached between passes, so every field is normalized and scanned twice on every safe-context request.
  - **Why it matters:** For batch prompting with many concurrent requests, every assessment runs O(2 × fields) work. Safety assessment is on the hot path for every Venice API call.
  - **Fix:** Cache the `assessSingleNormalizedText` result per field in the first pass; reuse the cached result in the warn pass (or merge the logic into a single pass with separate accumulator flags for block vs warn).
  - **Confidence:** [VERIFIED — same `assessSingleNormalizedText` call signature in both passes]`

- [x] **[BUG-005] `simpleHash` truncates to 256 chars of leet-folded text — audit hashes unreliable for long prompts** `src/shared/safety/childExploitationGuard.ts` (simpleHash function)
  - **Type:** Logic / Audit Integrity
  - **What:** `simpleHash` reads only the first 256 chars and uses djb2 (non-cryptographic). Two distinct long prompts that share the same leet-folded 256-char prefix will produce identical `promptHash` values in the audit record. Since the hash is used for audit correlation, this creates phantom duplicates and makes audit trails for long prompts unreliable.
  - **Evidence:** The function is documented as "coarse" — but callers and audit consumers don't necessarily know that, and the 256-char truncation is not documented at the call site.
  - **Fix:** Increase truncation to at least 1024 chars; add an inline comment at every call site clarifying the coarse-hash guarantee. If audit fidelity is required, use a one-way digest (e.g. `crypto.subtle.digest`) on the full string.
  - **Confidence:** [VERIFIED]

---

## Low / Cosmetic

- [x] **[BUG-006] `FUZZY_ALLOWLIST` contains duplicate entries** `src/shared/safety/childExploitationGuard.ts:421`
  - **Type:** Code Quality
  - **What:** The `Set` constructor receives duplicate literals: `"lori"` (×2), `"lore"` (×2), `"lock"` (×2). `Set` silently deduplicates at runtime — no functional impact — but the source code contains stale copy-paste artifacts.
  - **Evidence:**
    ```ts
    const FUZZY_ALLOWLIST = new Set<string>([
      "lori", "lori", "lore", "lore", "loci", ...
      "logic", "login", "logo", "lost", "look", "lock", "lock",
    ]);
    ```
  - **Fix:** Remove the six duplicate literals.
  - **Confidence:** [VERIFIED]

- [x] **[BUG-007] `server.ts:67` uses `console.warn` for access logging instead of the structured logger** `server.ts:67`
  - **Type:** Code Quality / Logging Consistency
  - **What:** The development/test request logger at line 67 calls `console.warn(...)` directly. Every other non-test log call in the codebase uses `warn`/`error` from `./src/shared/logger`. This means access log output bypasses any future structured-logging middleware applied to the `warn`/`error` function.
  - **Evidence:**
    ```ts
    // server.ts:67
    console.warn(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    ```
  - **Fix:** Replace with `warn(...)` (imported at line 18) or remove the block entirely (it's dev-only).
  - **Confidence:** [VERIFIED]

- [x] **[BUG-008] `isTrustedExternalUrl` allows any `https:` URL including private-network addresses** `electron/main.ts`
  - **Type:** Security / Low (user-prompted)
  - **What:** `isTrustedExternalUrl` accepts any URL where `protocol === "https:"`. This includes `https://192.168.1.1/admin`, `https://10.0.0.0/`, `https://localhost/`. The user is prompted via `dialog.showMessageBox` before `shell.openExternal` is called, which mitigates direct exploitation. However, an attacker-controlled page that injects a link with a private-IP target can try to trick the user with a convincing display.
  - **Fix:** Additionally reject URLs whose hostname resolves to RFC 1918 ranges (127.x, 10.x, 192.168.x, 172.16–31.x) and `localhost`. A simple hostname check (no DNS involved) suffices.
  - **Confidence:** [VERIFIED — function defined in electron/main.ts, logic confirmed]

- [x] **[BUG-009] `diagnostics` store not encrypted; asymmetry undocumented** `src/services/storageService.ts:10`
  - **Type:** Low (intentional but undocumented)
  - **What:** `ENCRYPTED_STORES = ["chats", "settings", "images", "conversations"]` — the `diagnostics` store is deliberately excluded. Diagnostics contain sanitized API timing/response metadata (no raw prompts, no API keys), so the omission is defensible. However, no comment documents *why* diagnostics are unencrypted. A future developer adding sensitive content to diagnostics entries would not see a guard.
  - **Fix:** Add a one-line comment at `ENCRYPTED_STORES` explaining the intentional exclusion of `diagnostics`.
  - **Confidence:** [VERIFIED]

---

## Documentation Defects

- [x] **[DOC-001] `.github/copilot-instructions.md` describes 3 IndexedDB stores; codebase has 5** `.github/copilot-instructions.md:55,133,138`
  - **What:**
    - Line 55: *"IndexedDB … images, chats, settings. All three stores are encrypted at rest"* — there are actually **five** stores (`images`, `chats`, `settings`, `diagnostics`, `conversations`), and four of them are encrypted (all except `diagnostics`).
    - Line 133: Export format example `{ images, chats, settings }` — omits `conversations`.
    - Line 138: *"Only `images`, `chats`, and `settings` stores are allowed"* — `conversations` is also allowed and validated.
  - **Evidence:**
    ```ts
    // src/constants/venice.ts:74
    export const STORE_NAMES = ["images", "chats", "settings", "diagnostics", "conversations"];
    // src/services/storageService.ts:10
    const ENCRYPTED_STORES = ["chats", "settings", "images", "conversations"];
    // src/services/exportImport.ts:14
    const EXPORT_STORES = ["images", "chats", "settings", "conversations"] as const;
    ```
  - **Fix:** Update the three affected lines in `.github/copilot-instructions.md` to list all 5 stores, note which 4 are encrypted, and include `conversations` in export descriptions.

---

## Missing Documentation / Gaps

- [x] **[GAP-001] No regression test for `extractFromSerializedFormData` (BUG-001)** `src/shared/safety/promptPayloadExtractor.ts`
  - The FormData extraction path has zero test coverage. After fixing BUG-001, add a test that creates a mock serialized FormData body `{ _isSerializedFormData: true, entries: [{ name: "prompt", value: "..." }] }` and asserts extracted fields are non-empty.

- [ ] **[GAP-002] No test for `loadJsonFile` error path (BUG-002)** `electron/ipc/handlers.ts:245`
  - There is no test asserting that a file-read error is surfaced to the user. After fixing BUG-002, add a test that stubs `fs.readFile` to reject and asserts the UI receives an error toast (or the bridge returns `{ ok: false, error }`).

- [ ] **[GAP-003] `docs/DEVELOPMENT` and `docs/AGENTS` directories not scanned** *(scope limit)*
  - These directories were present in the repo root but not opened during this scan. They may contain stale build instructions, architecture diagrams, or agent-usage examples that contradict current code. Recommend reviewing for freshness.

- [x] **[GAP-004] `assessChildExploitationSafety` public API has no JSDoc** `src/shared/safety/childExploitationGuard.ts`
  - The exported function signature (`input`, `AssessmentResult`) is the primary integration point for all callers (server.ts, handlers.ts, ChatModule, ImageModule, BatchModule). It has no JSDoc block documenting inputs, return shape, or side effects (audit logging, `recordDecision` call). Add at minimum a function-level `/** ... */` comment.

---

## Quick Wins (effort: < 30 min • impact: High+)

- [x] **BUG-001** — 2-line fix in `extractFromSerializedFormData`: replace array check with object-property read. Closes the FormData scanner blind spot.
- [x] **BUG-002** — Add `ok: false` to error return in `handlers.ts`, thread the error message through `desktopBridge` to the import UI.
- [x] **BUG-006** — Delete 6 duplicate literals from `FUZZY_ALLOWLIST`.
- [x] **BUG-003** — Remove `"shota"` from `FUZZY_ALLOWLIST`; add invariant test `FUZZY_ALLOWLIST ∩ CSAM_GENRE_LABELS = ∅`.
- [x] **DOC-001** — Update 3 lines in `.github/copilot-instructions.md` to match actual store counts.

---

## Notes & Open Questions

**Files not scanned (scope cap — 38 of 115 source files opened):**
- `src/modules/BatchModule.tsx`, `SearchScrapeModule.tsx` — guard wiring (partially verified via grep)
- `src/App.tsx`, `src/state/appReducer.ts` (lines 80+)
- `src/services/redaction.ts`, `imageWorkflowService.ts`
- `src/types/app.ts`, `src/types/venice.ts`, `src/types/storage.ts`
- `electron/ipc/updates.ts` — auto-update security surface (not scanned)
- `electron/services/logger.ts`, `electron/services/chatStorage.ts`
- `vite.config.ts`, `vitest.config.ts`, `tsconfig*.json`, `electron-builder.config.cjs`
- `package.json` (versions vs. known-vulnerable advisories — not checked)
- `docs/DEVELOPMENT/`, `docs/AGENTS/` directory contents
- `CHANGELOG.md`, `FAQ.md`, `SECURITY.md`, `CONTRIBUTING.md` — content not reviewed for accuracy

**Files referenced but not provided / not found:**
- `docs/REPOSITORY_TREE.md` — referenced in copilot-instructions but path does not exist in repo root; a `REPOSITORY_TREE.md` was found at root under `docs/` listing; confirmed absent.

**Open questions:**
- `electron/ipc/updates.ts`: auto-update download is in the main process (correct), but the renderer-exposed `downloadUpdate` / `installUpdate` surface was not audited for input validation. Recommend a targeted review.
- `package.json` dependency versions were not checked against current CVE advisories. Run `npm audit` and review high/critical advisories.
- Diagnostics store contents: confirm that diagnostics records never include raw prompt text before accepting that unencrypted storage is safe for that store.

---

## 2026-05-30 Safety Guard Audit & Fixes Completed
- **[H-001]** Express proxy middleware guard was wrapped in `try/catch` resolving a fail-open risk where guard exceptions could bypass enforcement.
- **[H-002]** Added documentation clarifying that only `POST` requests are validated; `GET` requests (e.g. `/models`) skip the guard.
- **[H-003]** Extensive transport-layer integration tests added (`server.test.ts`, `veniceClient.web.test.ts`, `veniceClient.desktop.test.ts`).
- **[H-004]** Implemented the `verify:safety-guard` script enforcing that all transport layers call the guard and do not leak prompts.
- **[M-001]** Added `server.ts` proxy comments explaining skipped `GET` logic.
- **[M-002]** Prompt payload extractor updated to include `"question"` in the fallback array.
- **[M-004]** Cross-sentence detection improved to properly break sentences on newline boundaries, preventing line-break evasion.
- **[M-005]** Extractor logic for `Buffer` in `server.ts` was fixed to dynamically pull field names based on the endpoint, successfully catching `negative_prompt` bypassing in image endpoints.
- **[M-006]** Clarified JSDoc requiring callers of `assessChildExploitationSafety` to run `recordDecision`.
- **[L-002]** Added test verifying that `FUZZY_ALLOWLIST` doesn't intersect with `CSAM_GENRE_LABELS`.

## Deferred Dual-Platform Improvements
- [ ] Implement Apple Notarization auto-submission in `macos-release.yml` for CI pipelines.
- [ ] Add explicit auto-updater UI for macOS.
