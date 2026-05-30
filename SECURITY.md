# Security Policy

The full Venice Forge security model is maintained in [SECURITY.md](SECURITY.md).

## Reporting a Vulnerability

Do not include exploit details, API keys, tokens, or private user data in a public issue.

Use one of these routes:

- **GitHub private vulnerability reporting** — If enabled, use the
  [Security → Report a Vulnerability](../../security/advisories/new) workflow
  on the repository. This keeps the report private until a fix is coordinated
  and is the preferred channel.
- **Issue label routing** — If private reporting is not available, open a
  GitHub issue labeled `security` and request a private maintainer discussion
  in the issue body. Do not post exploit details publicly.

The maintainer will triage reports for supported versions and coordinate
disclosure before any public details are posted.

## Supported Versions

Only the latest release tag is actively maintained. Older versions do not
receive security patches.

## Reporting Unsafe Content / CSAM

If you encounter unsafe content, safety guard bypasses, or AI-generated material that inappropriately represents minors (CSAM), report it immediately:
1. **NCMEC CyberTipline**: If the material involves child exploitation, report it directly to the [National Center for Missing & Exploited Children (NCMEC)](https://report.cybertip.org/).
2. **Venice.ai Trust & Safety**: Report the incident to Venice.ai through their official support channels at [venice.ai/support](https://venice.ai/support).
3. **Repository Maintainers**: Report bypasses of the Venice Forge safety guard using GitHub's private vulnerability reporting feature in this repository.

## 18+ Age Requirement & Inherent Risks

**Venice Forge strictly requires users to be 18 years or older.**
The application connects to unrestricted AI endpoints that may generate explicit or sensitive content. Due to the inherent risk of producing AI-generated images that may inappropriately represent minors (CSAM), use of this software by minors is strictly prohibited. Users assume all responsibility for the generated content.

## Content Safety

All outgoing Venice API requests are screened by a content safety guard
(`src/shared/safety/childExploitationGuard.ts`) before the payload is
forwarded. This runs at every enforcement boundary — Electron IPC and Express
proxy. The guard implements advanced features such as cross-sentence context
detection and `negative_prompt` extraction. The proxy operates on a "fail-close"
design (returning a 500 status) if the guard encounters any extraction errors.
Raw prompt text is never logged by the safety system.

External URLs opened via `shell.openExternal` are validated by
`electron/utils/urlSecurity.ts`: only `https:` with public routable hostnames
is allowed. RFC 1918 and loopback addresses are blocked.

## API Key Storage

Venice Forge stores API keys using OS-provided encryption where available:
- **Windows**: `safeStorage` (DPAPI)
- **macOS**: `safeStorage` (Keychain)

Both the **Venice API key** and the optional **Jina API key** use the same storage policy and file (`secure-prefs.json`).

For Windows and macOS, there is **no plaintext fallback**. The application will refuse to save any API key if OS-level encryption is unavailable.
For Linux and other platforms, a plaintext fallback may be permitted if the `VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE=true` environment variable is explicitly set in the process environment (e.g., `.env` for web mode development, or the shell environment for Electron).

## Research Provider Security

- **Jina AI**: Requests are sent directly to `r.jina.ai` and `s.jina.ai`. The Jina API key is redacted from all logs, diagnostics, and exports.
- **Generic HTTP**: Disabled by default. When enabled, it uses a strict SSRF blocklist (no DNS resolution) and only allows `text/html`, `text/plain`, `application/xhtml+xml`, and `application/json` responses.
- All research traffic respects the same endpoint allowlist and safety guard as Venice API calls.

## Not Protected Against

The security model does **not** protect against the following:
- Unsigned Windows SmartScreen warnings.
- Unsigned macOS Gatekeeper warnings.
- Local malware or debuggers running under the same OS user account.
- Keychain/session compromise if the OS user is compromised.

**Clarification**: macOS Gatekeeper and quarantine flags are mechanisms for distribution trust and execution prevention. They are not app data encryption mechanisms.

## Code & Dependency Auditing

Dependencies are audited with `npm audit` before each release. To run a
manual audit:

```bash
npm audit
```

A clean audit (`0 vulnerabilities`) is a release gate requirement.

Furthermore, safety-guard enforcement is actively verified by a dedicated
script that ensures boundary completeness and strict no-logging rules:
```bash
npm run verify:safety-guard
```
This is a mandatory release and commit security gate.
