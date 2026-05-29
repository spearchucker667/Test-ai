# Venice Forge — Agent Entry Guide

This is the token-lean entrypoint. Read [`AGENT_REINITIALIZATION.md`](./AGENT_REINITIALIZATION.md) first for full current context.

## Primary Rules

1. Protect security boundaries first.
2. Keep renderer/main/web-mode contracts aligned.
3. Prefer narrow, test-backed changes in high-churn files.
4. Never assume architecture history; verify in git.

## Startup Checklist (Always)

1. Open `AGENT_REINITIALIZATION.md` and scan:
   - architecture model,
   - recent change table,
   - pitfalls,
   - commands/CI.
2. Confirm current scripts in `package.json`.
3. Confirm current workflows in `.github/workflows/`.
4. If changing transport/security, read first:
   - `src/services/veniceClient.ts`
   - `server.ts`
   - `electron/ipc/validation.ts`
   - `electron/ipc/handlers.ts`
   - `electron/main.ts`

## Non-Negotiable Boundaries

- Renderer API traffic goes through `src/services/veniceClient.ts`.
- Electron renderer must stay sandboxed (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`).
- Venice endpoint/method allowlist must stay synced across:
  - `src/shared/validation.ts`
  - `electron/ipc/validation.ts`
  - `server.ts`
- New IPC surface requires coordinated updates:
  - `electron/preload.ts`
  - `electron/ipc/handlers.ts`
  - validation path
  - renderer bridge/types/tests

## Current Operational Reality

- Dual mode exists:
  - Electron direct IPC transport.
  - Web proxy transport (`/api/venice/*`).
- Release targets are Windows + macOS.
- ESLint gate exists locally (`npm run lint:eslint`) with `--max-warnings=96`.
- GitHub `ci.yml` runs lint:eslint, typecheck, test, and build.

## Coding Expectations

- Keep edits scoped; avoid mixed restyle + logic + security diffs in one patch.
- Add regression tests for bug fixes (`BUG-###` comment convention when applicable).
- Preserve decrypt-failure warning behavior in storage flows.
- Reuse shared limits/constants instead of hardcoding bytes or endpoint lists.

## Quick Commands

```bash
npm run dev:electron
npm run dev:web
npm run typecheck
npm run lint:eslint
npm test
npm run build
```

Release and verification commands are documented in `AGENT_REINITIALIZATION.md`.

## When You Must Refresh Context

Refresh `AGENT_REINITIALIZATION.md` after:

- architecture or transport boundary changes,
- workflow/script changes,
- shared validation/limits changes,
- major refactors in high-churn modules.

Use git-grounded evidence only; if unknown, write:

`UNKNOWN — not inferable from repo`

