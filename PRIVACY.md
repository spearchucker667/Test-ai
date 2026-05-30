# Venice Forge Privacy & Security Model

**Age Requirement**: Use of this application is strictly limited to individuals 18 years of age and older. The privacy terms and data collection boundaries outlined here apply solely to adult users.

Venice Forge is designed with a strict "privacy-by-default" and "offline-first" architecture. Your data stays on your machine until you explicitly send it to the Venice API.

## API Key Security
- **Desktop Mode (Production):** The Venice API key is encrypted at rest using OS-level secure storage (DPAPI on Windows, Keychain on macOS). It is **never** exposed to the application renderer, the React frontend, or any third-party tracking scripts.
- **Web Mode (Development):** The API key is held securely in the Node.js Express server (`.env`) and is never sent to the browser.
- **No Telemetry:** We do not track you, we do not log your prompts, and we do not monitor your API key usage.

## Data Storage
- All your chats, generated images, settings, and local galleries are stored **locally** in your browser's IndexedDB.
- We implement local encryption (AES-GCM) for your images, conversations, settings, and legacy chat databases. The `diagnostics` store is not encrypted — it contains only sanitized timing and status metadata, never raw prompt content.
- **No Cloud Sync:** Your data is never synced to a remote server. The only network connections made are direct, encrypted HTTPS requests to `api.venice.ai` for model inference.

## Network Architecture
- Venice Forge restricts all outgoing network requests to a strict allowlist of Venice API endpoints.
- Path traversal and malicious endpoint injections are structurally prevented by both the Electron main process and the Express proxy layer.
- **Content safety screening** is applied to every outgoing Venice request before the payload is forwarded. Requests that fail the content assessment are blocked at the IPC or proxy boundary and never leave the app. The safety system employs advanced features like cross-sentence detection and `negative_prompt` extraction, and fails closed via a 500 status if extraction encounters an error. Raw prompt text is never logged or stored by the safety system — only a coarse non-identifying hash is retained for audit counters.
- **External URL guard** — `shell.openExternal` only allows `https:` URLs with public routable hostnames. RFC 1918 and loopback addresses are blocked.

## Export and Import
- You have full control over your data. You can export your entire workspace at any time.
- API Keys are automatically redacted and stripped during the export process to prevent accidental key leakage.
