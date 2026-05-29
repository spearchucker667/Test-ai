# Venice Forge — Frequently Asked Questions

## General

### What is Venice Forge?
Venice Forge is an independent, open-source desktop client for the [Venice API](https://venice.ai). It provides a unified interface for text generation, image generation, web research, batch automation, and local data management — all without routing user content through any intermediary server beyond Venice itself.

### Is Venice Forge an official Venice.ai product?
No. Venice Forge is an independent MIT-licensed project. It is not endorsed by, sponsored by, or affiliated with Venice.ai, Inc. "Venice", "Venice.ai", and related marks belong to their respective owners.

### What platforms are supported?
- **Windows 10/11** (x64) — NSIS installer and portable `.exe`
- **macOS 13+** (Apple Silicon `arm64` and Intel `x64`) — DMG and ZIP
- **Linux** — Not officially packaged; development use only with plaintext key fallback
- **Web browser** — Supported in development mode only

See [PLATFORM_SUPPORT.md](DEVELOPMENT/platform-support.md) for the full matrix.

---

## Development & Building

### What Node.js version do I need?
Node.js **20 or 22** with npm 10+. The CI matrix tests both versions.

### How do I start development?
```bash
npm install
npm run dev:electron   # Desktop mode (recommended)
# or
npm run dev:web        # Web proxy mode
```

### What is the full validation gate?
```bash
npm run lint:eslint    # ESLint with --max-warnings=96
npm run typecheck      # TypeScript for renderer + Electron
npm test               # Vitest unit and integration tests
npm run build          # Build dist/ and dist-electron/
```

### Why does `npm run lint:eslint` fail?
The project enforces a warning budget of **96**. Common causes:
- Using `any` instead of narrow types — replace with `unknown` + runtime guards.
- Unused variables — prefix intentionally unused parameters with `_`.

### Why are `dev` and `dev:web` the same command?
Both run `tsx server.ts` (the Express web proxy). `dev:web` is the explicit alias used throughout documentation. `dev` is the shorthand default.

---

## API Keys & Security

### Where is my API key stored?
- **Desktop mode:** Encrypted with OS-level secure storage — DPAPI on Windows, Keychain on macOS. Never exposed to the renderer.
- **Web mode:** In the server's `.env` file; never sent to the browser.

### What if secure storage is unavailable?
On macOS and Windows, the app **refuses** to store the key if secure storage fails. On Linux, you can set `VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE=true` in `.env` to allow a documented plaintext fallback. **This reduces security.**

### How do I enable DevTools in a production build?
Set `VENICE_FORGE_DEBUG_DEVTOOLS=true` in your environment before launching. Only use this for debugging.

### Is there telemetry?
No. Venice Forge does not track users, log prompts, or monitor API key usage.

---

## Packaging & Releases

### How do I build for Windows?
```bash
npm run dist:win
npm run checksum:release
npm run verify:dist:win
npm run verify:dist:portable
```

### How do I build for macOS?
```bash
npm run dist:mac
npm run checksum:release
npm run verify:dist:mac
```

### What artifacts are generated?
- Windows: `Venice-Forge-<version>-x64-Setup.exe`, `Venice-Forge-<version>-x64-Portable.exe`
- macOS: `Venice-Forge-<version>-<arch>.dmg`, `Venice-Forge-<version>-<arch>.zip`
- All artifacts include `.sha256` checksum sidecars.

### Why does macOS Gatekeeper block my build?
Local builds are ad-hoc signed without an Apple Developer ID certificate. For your own locally trusted builds:
```bash
xattr -dr com.apple.quarantine "/Applications/Venice Forge.app"
```
**Never use this for untrusted or internet-downloaded binaries.**

---

## Themes & Appearance

### How do I change the theme?
Open **Config → Appearance → Theme Maker**. Choose from the built-in themes (Forge Graphite, Forge Daylight, Forge Copper) or create a custom theme by editing individual color tokens.

### Do custom themes persist across restarts?
Yes. Custom themes are saved to encrypted IndexedDB alongside your other settings. A lightweight `localStorage` cache also prevents any flash of unstyled content on startup.

### Are the built-in themes accessible?
All built-in themes are verified against WCAG AA contrast standards. The ThemeMaker warns you if a custom color combination falls below the recommended thresholds.

## Data & Storage

### Where is my data stored?
- **Images, chats, settings:** Renderer IndexedDB (local only).
- **API key:** OS secure storage (Windows DPAPI / macOS Keychain).
- **Logs:**
  - Windows: `%APPDATA%\Venice Forge\logs\venice-forge.log`
  - macOS: `~/Library/Application Support/Venice Forge/logs/venice-forge.log`

### Is my data encrypted?
Chats and settings are encrypted with AES-GCM using a browser-managed key stored in same-origin IndexedDB. This reduces casual local inspection risk but is **not equivalent to OS credential storage**.

### Can I export my data?
Yes. Use the **Config** tab → **Export**. Exports are versioned JSON with `version`, `exportedAt`, `appVersion`, and `data`. API keys are automatically redacted.

### Can I import data?
Yes. Use the **Config** tab → **Import**. Import validates JSON size and schema, rejects unexpected stores, strips secret-like fields, and merges by ID rather than clearing existing data. A pre-import backup is saved to disk.

---

## Troubleshooting

### I get a 400 error on chat/image generation
Usually a request schema mismatch. Ensure:
- The model ID is valid.
- `webSearch` is `"off"`, `"on"`, or `"auto"` (not a boolean).
- All API parameters are correct strings.

### I get a 401/403 error
Your API key is invalid, expired, or has insufficient scope. Check the **Status** tab for diagnostics.

### I get a 429 error
Venice rate limit exceeded. Wait for the reset period shown in the **Status** tab.

### The app crashes on startup
Check the logs folder (see Data & Storage above). Common causes:
- Missing icons: run `npm run generate:icon`.
- Secure storage unavailable: ensure your OS key manager is functioning.
- Corrupted IndexedDB: clear site data for the app.

---

## Contributing

### How do I report a bug?
Open a GitHub issue using the bug report template. Include:
- App version from `package.json` or the Status tab.
- Runtime mode (Electron desktop or web mode).
- OS, Node.js version, and CPU architecture.
- Steps to reproduce.
- Sanitized diagnostics from the Status tab.

### How do I report a security vulnerability?
**Do not open a public issue.** Follow [SECURITY.md](../SECURITY.md) and request a private maintainer discussion.

### What is the code style?
- TypeScript **strict mode**.
- Avoid `any`; use proper types or `unknown` + guards.
- Use `function` declarations for modules.
- Tailwind v4 utility classes inline with JSX.

---

## Further Reading

- [README.md](../README.md) — Setup and usage
- [ABOUT.md](ABOUT.md) — Architecture and goals
- [BUILDING.md](DEVELOPMENT/building.md) — Development and packaging commands
- [RELEASE.md](RELEASE/release.md) — Release checklist
- [SECURITY.md](../SECURITY.md) — Full security model
- [LEGAL.md](LEGAL.md) — Legal and TOS coverage
- [PLATFORM_SUPPORT.md](DEVELOPMENT/platform-support.md) — Supported platforms
- [TROUBLESHOOTING.md](DEVELOPMENT/troubleshooting.md) — Common issues and fixes
- [CHANGELOG.md](../CHANGELOG.md) — Version history
- [CONTRIBUTING.md](../CONTRIBUTING.md) — How to contribute
