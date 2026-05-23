# Venice Forge

[![CI](https://github.com/spearchucker667/Windows-Venice-API-connector/actions/workflows/ci.yml/badge.svg)](https://github.com/spearchucker667/Windows-Venice-API-connector/actions/workflows/ci.yml)
[![Windows Release](https://github.com/spearchucker667/Windows-Venice-API-connector/actions/workflows/windows-release.yml/badge.svg)](https://github.com/spearchucker667/Windows-Venice-API-connector/actions/workflows/windows-release.yml)
[![Release](https://img.shields.io/github/v/release/spearchucker667/Windows-Venice-API-connector?include_prereleases&label=release)](https://github.com/spearchucker667/Windows-Venice-API-connector/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node 20/22](https://img.shields.io/badge/node-20%20%7C%2022-339933.svg)](package.json)
[![TypeScript strict](https://img.shields.io/badge/typescript-strict-3178c6.svg)](tsconfig.json)
[![Electron 42](https://img.shields.io/badge/electron-42-47848f.svg)](package.json)
[![Venice API](https://img.shields.io/badge/API-Venice.ai-111827.svg)](https://docs.venice.ai/)

<img width="2816" height="1536" alt="Gemini_Generated_Image_3tkcjm3tkcjm3tkc" src="https://github.com/user-attachments/assets/079845cb-0eb2-4ba1-858a-189a1d90f6b7" />

See [docs/ABOUT.md](docs/ABOUT.md) for project background and architecture overview.

## Features

| Tab | Name | Description |
|-----|------|-------------|
| Prompt | Chat | Streaming chat completions with system-prompt control and conversation history |
| Create | Image generation | Single and batch image generation with upscaling and gallery save |
| Batch | Batch runner | Run one prompt across multiple inputs or run many prompts in sequence |
| Research | Web research | Venice-augmented web search, page scraping, and document text extraction |
| Catalog | Models | Live Venice model catalog with type, traits, and capability details |
| Library | Gallery | Local image library with download, upscale, and bulk-export |
| Config | Settings | API key management, theme, model defaults, data import/export |
| Status | Diagnostics | Transport mode, runtime info, rate-limit headers, and log access |

## Repository Map

The full public file tree and ownership map live in [docs/REPOSITORY_TREE.md](docs/REPOSITORY_TREE.md).

```text
.
├── electron/              # Electron main, preload, IPC validation, secure storage
├── src/                   # React renderer, modules, services, state, types, utilities
├── scripts/               # Build and release verification helpers
├── docs/                  # Architecture, release, security, legal, repo tree
├── .github/               # CI, release automation, ownership, issue/PR templates
├── server.ts              # Express web proxy for development web mode
└── package.json           # Commands, dependencies, version metadata
```

## Requirements

- Windows 10/11 for release builds
- Node.js 20 or 22
- npm 10+
- A Venice API key ([venice.ai](https://venice.ai))

## Development

```bash
npm install
npm run dev:electron   # Electron desktop mode (recommended)
npm run dev:web        # Vite + Express web mode
```

Useful scripts:

| Command | Description |
|---------|-------------|
| `npm run typecheck` | TypeScript check for renderer and Electron |
| `npm test` | Vitest unit and integration tests |
| `npm run build` | Build `dist/` (web) and `dist-electron/` (main process) |
| `npm run clean` | Remove all generated build output |
| `npm run test:watch` | Re-run tests on file changes |

## Windows Builds

```bash
npm run verify:icon
npm run dist:win
npm run verify:dist
```

Artifacts are written to `release/`:

- `Venice-Forge-<version>-x64-Setup.exe` — NSIS installer
- `Venice-Forge-<version>-x64-Portable.exe` — portable executable

`build/icon.ico` is required before packaging. This repo includes a generated placeholder; run `npm run generate:icon` if it is missing, then replace it with final artwork before public release.

Local builds are unsigned unless standard electron-builder signing environment variables are set (`CSC_LINK`, `CSC_KEY_PASSWORD`, `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`). Unsigned installers can trigger Windows SmartScreen warnings.

## API Key Setup

**Desktop mode:** open **Config**, paste the Venice API key, click **Save key**, then **Test connection**. On Windows, Venice Forge refuses to store the key if Electron `safeStorage` encryption is unavailable.

**Web mode:** copy `.env.example` to `.env` and set `VENICE_API_KEY`.

```
VENICE_API_KEY="your-venice-inference-key"
```

## Storage

| Data | Location |
|------|----------|
| API key | Electron `safeStorage` — `%APPDATA%\Venice Forge\secure-prefs.json` |
| Logs | `%APPDATA%\Venice Forge\logs\venice-forge.log` |
| Images, chats, settings | Renderer IndexedDB |
| Exports | Versioned JSON with `version`, `exportedAt`, `appVersion`, and `data` |

Import validates JSON size and schema, rejects unexpected stores, strips secret-like fields, and merges by ID rather than clearing existing data. API keys are never imported or exported. A backup of existing data is saved to disk before any import is applied.

## Security Model

Desktop Venice API calls go through a narrow preload API and main-process IPC transport. The renderer cannot read the raw API key, cannot invoke arbitrary IPC channels, and cannot choose arbitrary Venice endpoints. Allowed endpoints:

- `GET /models`
- `POST /chat/completions`
- `POST /image/generate`
- `POST /image/upscale`
- `POST /augment/search`
- `POST /augment/scrape`
- `POST /augment/text-parser`

Production CSP does not allow localhost networking. Navigation is blocked except for the app files; trusted external HTTPS links open in the OS browser. Packaged production DevTools are disabled unless `VENICE_FORGE_DEBUG_DEVTOOLS=true`. Web proxy mode adds `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and `Content-Security-Policy` headers to all responses.

See [docs/SECURITY.md](docs/SECURITY.md) for the full security model.

## Legal and Terms

Venice Forge is an independent open-source client for the Venice API. It is not endorsed by, sponsored by, or affiliated with Venice.ai, Inc. Users are responsible for complying with the current [Venice Terms of Service](https://venice.ai/legal/tos), [Venice privacy information](https://venice.ai/privacy), and [Venice API documentation](https://docs.venice.ai/) when using their own API keys.

See [docs/LEGAL.md](docs/LEGAL.md) for the public-readiness legal notes, trademark notice, privacy limits, and release disclaimers.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Missing icon | `npm run generate:icon` then `npm run verify:icon` |
| Packaging failure | `npm run clean && npm install && npm run dist:win` |
| SmartScreen warning | Expected for unsigned local builds; see [docs/RELEASE.md](docs/RELEASE.md) for signing |
| No API key prompt at launch | Open **Config**, save a key, then test connection |
| `400` on chat/image | Usually a request schema mismatch — ensure the model ID is valid and all API parameters are correct strings |
| `401` / `403` | Invalid key or insufficient key scope |
| `429` | Venice rate limit; wait for the reset period shown in the Status tab |
| Transport failure | Open **Status**, copy diagnostics, inspect the logs folder |

## Known Limitations

- No auto-update is configured.
- Release signing is optional and not required for local builds.
- IndexedDB records are encrypted with a browser-managed AES-GCM key stored in same-origin IndexedDB. This reduces casual local inspection risk but is not equivalent to OS credential storage and does not protect against malware, XSS, same-origin compromise, browser profile compromise, or a compromised OS user. Export before risky upgrades.
- Malware running as the same OS user is out of scope and may access user data or process memory.

## Further Reading

- [docs/ABOUT.md](docs/ABOUT.md) — Project background and architecture
- [docs/SECURITY.md](docs/SECURITY.md) — Full security model
- [docs/RELEASE.md](docs/RELEASE.md) — Release checklist
- [docs/LEGAL.md](docs/LEGAL.md) — Legal, TOS, and public release notes
- [docs/REPOSITORY_TREE.md](docs/REPOSITORY_TREE.md) — Repository structure and ownership map
- [SUPPORT.md](SUPPORT.md) — Support and issue routing
- [CHANGELOG.md](CHANGELOG.md) — Version history
- [CONTRIBUTING.md](CONTRIBUTING.md) — How to contribute
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) — Community standards


IndexedDB records are encrypted with a browser-managed AES-GCM key stored in same-origin IndexedDB. This reduces casual local inspection risk but is not equivalent to OS credential storage and does not protect against malware, XSS, same-origin compromise, browser profile compromise, or a compromised OS user.
