# Legal and Public Release Notes

This document is informational, not legal advice. It records the legal and policy assumptions used for the public Venice Forge repository and release materials.

## Project Status

Venice Forge is an independent MIT-licensed desktop client for the Venice API. It is not endorsed by, sponsored by, or affiliated with Venice.ai, Inc. "Venice", "Venice.ai", and related marks belong to their respective owners.

The app does not ship with an API key. Users provide their own Venice API key and are responsible for their own Venice account, usage, billing, content, and compliance obligations.

## Venice.ai Terms Coverage

Before using the app with the Venice API, users should review the current official Venice materials:

- [Venice Terms of Service](https://venice.ai/legal/tos)
- [Venice privacy information](https://venice.ai/privacy)
- [Venice API documentation](https://docs.venice.ai/)
- [Venice API quickstart](https://docs.venice.ai/overview/getting-started)

Repository documentation should link to Venice's current public terms instead of copying them. Venice can update its terms, privacy statements, product behavior, models, pricing, and API requirements independently of this project.

## API Key Handling

Venice's API documentation states that API keys are secrets and should not be exposed in client-side code. Venice Forge follows that boundary:

- Electron mode stores the key in the main process through Electron `safeStorage`.
- Web development mode reads `VENICE_API_KEY` from `.env` on the local Express server.
- The renderer never receives the raw API key.
- Exports, imports, diagnostics, and logs redact API-key-like values.

## Privacy and Data Limits

Venice Forge stores chats, settings, and gallery records locally in IndexedDB. These records are encrypted by the app before storage using a browser-managed AES-GCM key stored in same-origin IndexedDB. This reduces casual local inspection risk but is not equivalent to OS credential storage. API requests still leave the device and are processed by Venice and any applicable upstream provider or privacy mode selected by Venice.

Venice's own privacy material describes multiple privacy modes with different protections and trade-offs. Users should consult Venice's current privacy pages before sending sensitive content.

## Release Disclaimers

- Local builds are unsigned unless the maintainer configures code-signing certificates.
- Unsigned Windows installers may trigger SmartScreen or antivirus warnings.
- The MIT license provides the software "as is" without warranty.
- This app is not a compliance, legal, medical, financial, or safety-critical system.
- Malware or a debugger running as the same OS user is outside the app's threat model.

## Maintainer Checklist

Before a public release:

- Confirm README, [SECURITY.md](../SECURITY.md), [RELEASE.md](RELEASE/release.md), and this document match the shipped version.
- Confirm no API keys, tokens, certificates, or generated `.env` files are committed.
- Run the full release verification in [RELEASE.md](RELEASE/release.md).
- State whether Windows artifacts are signed or unsigned in release notes.
- Include SHA-256 checksums for all `.exe` artifacts.
