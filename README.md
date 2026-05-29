# Venice Forge

[![CI](https://github.com/spearchucker667/Windows-Venice-API-connector/actions/workflows/ci.yml/badge.svg)](https://github.com/spearchucker667/Windows-Venice-API-connector/actions/workflows/ci.yml)
[![Windows Release](https://github.com/spearchucker667/Windows-Venice-API-connector/actions/workflows/windows-release.yml/badge.svg)](https://github.com/spearchucker667/Windows-Venice-API-connector/actions/workflows/windows-release.yml)
[![macOS Release](https://github.com/spearchucker667/Windows-Venice-API-connector/actions/workflows/macos-release.yml/badge.svg)](https://github.com/spearchucker667/Windows-Venice-API-connector/actions/workflows/macos-release.yml)
[![Release](https://img.shields.io/github/v/release/spearchucker667/Windows-Venice-API-connector?include_prereleases&label=release)](https://github.com/spearchucker667/Windows-Venice-API-connector/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node 20/22](https://img.shields.io/badge/node-20%20%7C%2022-339933.svg)](package.json)
[![TypeScript strict](https://img.shields.io/badge/typescript-strict-3178c6.svg)](tsconfig.json)
[![Electron 42](https://img.shields.io/badge/electron-42-47848f.svg)](package.json)
[![Venice API](https://img.shields.io/badge/API-Venice.ai-111827.svg)](https://docs.venice.ai/)

<img width="1697" height="927" alt="ChatGPT Image May 28, 2026, 09_36_58 PM" src="https://github.com/user-attachments/assets/e992bed4-df0c-4693-a0c2-1b95e7ffc281" />


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
| Config | Settings | API key management, theme editor, model defaults, data import/export |
| Status | Diagnostics | Transport mode, runtime info, rate-limit headers, and log access |

## Documentation

All documentation is organized in the [docs](docs/) directory and root level. See the index below:

### Getting Started
- **[README.md](README.md)** — This file. Project overview, features, and quick-start.
- **[docs/ABOUT.md](docs/ABOUT.md)** — Architecture, dual-transport design, security model.

### Development
- **[CONTRIBUTING.md](CONTRIBUTING.md)** — Contributor guidelines and code of conduct.
- **[docs/DEVELOPMENT/building.md](docs/DEVELOPMENT/building.md)** — Build system, Vite, Electron, esbuild.
- **[docs/DEVELOPMENT/platform-support.md](docs/DEVELOPMENT/platform-support.md)** — Windows/macOS/Linux requirements and support matrix.
- **[docs/DEVELOPMENT/troubleshooting.md](docs/DEVELOPMENT/troubleshooting.md)** — Common development issues and solutions.
- **[docs/DEVELOPMENT/macos.md](docs/DEVELOPMENT/macos.md)** — macOS-specific build and deployment notes.

### Release & Deployment
- **[docs/RELEASE/release.md](docs/RELEASE/release.md)** — Release process, versioning, and automation.
- **[docs/RELEASE/signing-and-notarization.md](docs/RELEASE/signing-and-notarization.md)** — Windows/macOS code signing and notarization.
- **[CHANGELOG.md](CHANGELOG.md)** — Version history, breaking changes, and bug fixes.

### Governance & Legal
- **[SECURITY.md](SECURITY.md)** — Security policy, vulnerability disclosure, and supported versions.
- **[docs/LEGAL.md](docs/LEGAL.md)** — Legal notices, disclaimers, and terms.
- **[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)** — Community standards and reporting procedures.
- **[PRIVACY.md](PRIVACY.md)** — Privacy policy and data handling.
- **[SUPPORT.md](SUPPORT.md)** — Support channels and escalation.

### Reference
- **[docs/FAQ.md](docs/FAQ.md)** — Frequently asked questions.
- **[docs/REPOSITORY_TREE.md](docs/REPOSITORY_TREE.md)** — Full file tree and module ownership.
- **[docs/AGENTS/](docs/AGENTS/)** — AI agent setup guides (Copilot, Gemini).

### Repository Map

```text
.
├── electron/              # Electron main, preload, IPC validation, secure storage
├── src/                   # React renderer, modules, services, state, types, utilities
├── scripts/               # Build and release verification helpers
├── docs/                  # Organized documentation (see index above)
├── .github/               # CI, release automation, ownership, issue/PR templates
├── server.ts              # Express web proxy for development web mode
└── package.json           # Commands, dependencies, version metadata
```

## Requirements

- Windows 10/11 or macOS 13+ for release builds
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
| `npm run lint:eslint` | ESLint with `--max-warnings=96` budget |
| `npm run typecheck` | TypeScript check for renderer and Electron |
| `npm test` | Vitest unit and integration tests |
| `npm run build` | Build `dist/` (web) and `dist-electron/` (main process) |
| `npm run clean` | Remove all generated build output |
| `npm run test:watch` | Re-run tests on file changes |

## Windows Builds

```bash
npm run verify:icon
npm run dist:win
npm run checksum:release
npm run verify:dist:win
npm run verify:dist:portable
```

Artifacts are written to `release/`:

- `Venice-Forge-<version>-x64-Setup.exe` — NSIS installer
- `Venice-Forge-<version>-x64-Portable.exe` — portable executable

## macOS Builds

```bash
npm run verify:icon
npm run dist:mac
npm run checksum:release
npm run verify:dist:mac
```

Artifacts are written to `release/`:

- `Venice-Forge-<version>-arm64.dmg` / `.zip` — Apple Silicon
- `Venice-Forge-<version>-x64.dmg` / `.zip` — Intel

`build/icon.ico` and `build/icon.icns` are required before packaging. This repo includes a generated placeholder; run `npm run generate:icon` if they are missing, then replace them with final artwork before public release.

Local builds are unsigned unless standard electron-builder signing environment variables are set (`CSC_LINK`, `CSC_KEY_PASSWORD`, `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`). Unsigned installers can trigger Windows SmartScreen warnings or macOS Gatekeeper blocks. To bypass Gatekeeper for local unsigned builds on macOS, you may need to clear the quarantine flag (`xattr -dr com.apple.quarantine "/path/to/Venice Forge.app"`).

Official public releases must be signed using Apple Developer ID credentials and notarized via Apple's notary service.

## API Key Setup

**Desktop mode:** open **Config**, paste the Venice API key, click **Save key**, then **Test connection**. Venice Forge refuses to store the key if Electron `safeStorage` encryption (DPAPI on Windows, Keychain on macOS) is unavailable.

**Web mode:** copy `.env.example` to `.env` and set `VENICE_API_KEY`.

### Optional Environment Variables

| Variable | Purpose |
|----------|---------|
| `VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE` | Allow plaintext fallback when OS secure storage is unavailable (Linux/non-GNOME only). **Warning:** reduces security. |
| `VENICE_FORGE_DEBUG_DEVTOOLS` | Allow DevTools in packaged production builds. Only enable for debugging. |

```
VENICE_API_KEY="your-venice-inference-key"
```

## Storage

| Data | Location |
|------|----------|
| API key | Electron `safeStorage` — Win: `%APPDATA%\Venice Forge\secure-prefs.json`<br>Mac: `~/Library/Application Support/Venice Forge/secure-prefs.json` |
| Logs | Win: `%APPDATA%\Venice Forge\logs\venice-forge.log`<br>Mac: `~/Library/Application Support/Venice Forge/logs/venice-forge.log` |
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

Read our full [Privacy & Security Model](PRIVACY.md) and the technical [SECURITY.md](SECURITY.md) for more details.

## Legal and Terms

Venice Forge is an independent open-source client for the Venice API. It is not endorsed by, sponsored by, or affiliated with Venice.ai, Inc. Users are responsible for complying with the current [Venice Terms of Service](https://venice.ai/legal/tos), [Venice privacy information](https://venice.ai/privacy), and [Venice API documentation](https://docs.venice.ai/) when using their own API keys.

See [docs/LEGAL.md](docs/LEGAL.md) for the public-readiness legal notes, trademark notice, privacy limits, and release disclaimers.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Missing icon | `npm run generate:icon` then `npm run verify:icon` |
| Packaging failure | `npm run clean && npm install && npm run dist:win` |
| SmartScreen warning | Expected for unsigned local builds; see [docs/RELEASE/release.md](docs/RELEASE/release.md) for signing |
| No API key prompt at launch | Open **Config**, save a key, then test connection |
| `400` on chat/image | Usually a request schema mismatch — ensure the model ID is valid and all API parameters are correct strings |
| `401` / `403` | Invalid key or insufficient key scope |
| `429` | Venice rate limit; wait for the reset period shown in the Status tab |
| Transport failure | Open **Status**, copy diagnostics, inspect the logs folder |

## Theme System

Venice Forge includes a full token-based theme system with three built-in palettes (Forge Graphite, Forge Daylight, Forge Copper) and a live theme editor. Open **Config → Appearance → Theme Maker** to customize colors, preview changes in real time, and save custom themes. Themes persist across restarts via encrypted IndexedDB storage.

## Known Limitations

- Auto-updates are fetched securely via GitHub Releases.
- Release signing is optional and not required for local builds.
- IndexedDB records are encrypted with a browser-managed AES-GCM key stored in same-origin IndexedDB. This reduces casual local inspection risk but is not equivalent to OS credential storage and does not protect against malware, XSS, same-origin compromise, browser profile compromise, or a compromised OS user. Export before risky upgrades.
- Malware running as the same OS user is out of scope and may access user data or process memory.

## Further Reading

- [docs/ABOUT.md](docs/ABOUT.md) — Project background and architecture
- [SECURITY.md](SECURITY.md) — Full security model
- [docs/RELEASE/release.md](docs/RELEASE/release.md) — Release checklist
- [docs/LEGAL.md](docs/LEGAL.md) — Legal, TOS, and public release notes
- [docs/REPOSITORY_TREE.md](docs/REPOSITORY_TREE.md) — Repository structure and ownership map
- [SUPPORT.md](SUPPORT.md) — Support and issue routing
- [CHANGELOG.md](CHANGELOG.md) — Version history
- [CONTRIBUTING.md](CONTRIBUTING.md) — How to contribute
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) — Community standards
