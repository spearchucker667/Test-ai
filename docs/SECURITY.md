# Security Model

Venice Forge is an Electron app with a sandboxed React renderer, a preload bridge, and a privileged main process.

## Renderer, Preload, Main

- **Renderer:** no Node integration, sandbox enabled, context isolation enabled.
- **Preload:** exposes only `window.veniceForge` with typed methods for Venice requests, API key status/actions, diagnostics, logs, and JSON file dialogs.
- **Main:** owns filesystem access, OS dialogs, logging, secure storage, and Venice HTTPS requests.

The renderer cannot access arbitrary IPC channels, shell execution, local files, or the raw Venice API key.

## Code Signing Policy

Official public releases of Venice Forge MUST be cryptographically signed to establish trust and prevent malware tampering.
- **Windows:** Authenticode signing using `CSC_LINK` and `CSC_KEY_PASSWORD` (or `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD`).
- **macOS:** Apple Developer ID signing and Notarization using `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`.

Unsigned builds are only permitted for local development or CI/CD testing. Unsigned binaries will be explicitly labeled and may trigger OS trust warnings such as Windows SmartScreen or macOS Gatekeeper.

## Local Builds

Local builds are generated via `npm run dist:win` or `npm run dist:mac` using `electron-builder`. By default, these local builds are unsigned unless Apple Developer ID and Windows code signing credentials are provided via environment variables.

## Venice Transport

Desktop mode uses direct IPC, not a loopback proxy. The main process validates every request before sending HTTPS traffic to `api.venice.ai`.

Allowed endpoints:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/models` | Fetch live model catalog |
| `POST` | `/chat/completions` | Streaming chat completions |
| `POST` | `/image/generate` | Image generation |
| `POST` | `/image/upscale` | Image upscaling |
| `POST` | `/augment/search` | Web search augmentation |
| `POST` | `/augment/scrape` | Web page scraping |
| `POST` | `/augment/text-parser` | Document text extraction |

Validation rejects unsupported methods, endpoints not in the allowlist, unexpected origins, and payloads larger than 25 MB. Authorization is injected only in the main process. Error messages and logs are redacted before they reach the UI.

Web development mode uses the Express `/api/venice` proxy from `server.ts` and requires `.env`. The same endpoint allowlist is enforced in both Electron IPC and the web proxy to prevent drift.

The web proxy also strips renderer-controlled `Authorization`, `Cookie`, and `Host` headers before forwarding requests. It then injects the server-side Venice bearer token and pins the outbound host to `api.venice.ai` (or the configured `VENICE_API_HOST` override). The proxy root `/api/venice` is rejected because it is not an allowlisted Venice endpoint.

## Web Proxy Security Headers

The Express proxy adds the following headers to every response:

- `X-Content-Type-Options: nosniff` — prevents MIME-type sniffing
- `X-Frame-Options: DENY` — disallows embedding in frames
- `Referrer-Policy: no-referrer` — suppresses Referer headers
- `Content-Security-Policy` — restricts scripts, styles, connections, and objects to `'self'`

## API Key Storage

Storage API: Electron `safeStorage` (Windows DPAPI, macOS Keychain). If OS-level encryption is unavailable (e.g., missing dependencies or running on unsupported environments), saving an API key fails to prevent plaintext storage. Plaintext fallback is explicitly blocked by default unless overridden via environment variables.

The key is never exported, imported, written to IndexedDB, copied into diagnostics, or exposed to the renderer.

On macOS and Windows, Venice Forge enforces strict network boundaries.

## CSP and Navigation

Development CSP allows the Vite dev server and HMR. Production CSP is restrictive and does not allow broad localhost or websocket connections. Unexpected navigation is blocked, malformed URLs fail closed, and trusted external HTTPS links open in the OS browser. Packaged production DevTools are disabled unless `VENICE_FORGE_DEBUG_DEVTOOLS=true`.

## Logs and Diagnostics

Logs are stored under Electron `userData/logs/venice-forge.log`, capped and rotated at 1 MB. Authorization headers, API-key-like values, bearer tokens, and secret-like fields are redacted. Diagnostics show app/runtime versions, storage mode, userData path, transport mode, API key configured state, and last sanitized API error.

## URL Sanitization

URLs returned by the Venice augment/search endpoint are validated before being rendered as anchor `href` attributes. Only `https:` and `http:` scheme URLs are allowed; `javascript:`, `data:`, and all other schemes are replaced with `#`.

## Rate Limiting

The web proxy enforces a per-IP request rate limit (default: 60 requests per 60-second window, configurable via `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX_REQUESTS`). Excess requests receive `429 Too Many Requests`. The rate-limit map is periodically cleaned up to prevent unbounded memory growth.

A circuit breaker trips after five consecutive upstream 5xx or network errors and holds the circuit open for 30 seconds, returning `503 Service Unavailable` until upstream recovers.

## Not Protected Against

- Malware or a debugger running as the same OS user.
- Screen capture, clipboard capture, or memory scraping by local compromise.
- IndexedDB records are encrypted with a browser-managed AES-GCM key stored in same-origin IndexedDB. This reduces casual local inspection risk but is not equivalent to OS credential storage and does not protect against malware, XSS, same-origin compromise, browser profile compromise, or a compromised OS user.
- Unsigned installer trust warnings.
- Venice account misuse if the user pastes a compromised key.
- Upstream Venice API behavior, model behavior, pricing, account status, or terms changes.

## Reporting a Vulnerability

If you discover a security issue, follow the root [SECURITY.md](../SECURITY.md). Do not include exploit details, API keys, bearer tokens, `.env` contents, certificates, or private logs in a public issue.
