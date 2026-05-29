# Support

Use this routing guide for public support and maintenance requests.

## Where to Ask

- Bugs: open a GitHub issue using the bug report template.
- Feature requests: open a GitHub issue using the feature request template.
- Security reports: follow [SECURITY.md](SECURITY.md).
- Release and packaging questions: check [docs/RELEASE/release.md](docs/RELEASE/release.md).
- Architecture questions: check [docs/ABOUT.md](docs/ABOUT.md) and [docs/REPOSITORY_TREE.md](docs/REPOSITORY_TREE.md).
- General questions: check [docs/FAQ.md](docs/FAQ.md).

## What to Include

For bugs, include:

- App version from `package.json` or the Status tab.
- Runtime mode: Electron desktop or web mode.
- OS, Node.js version, and CPU Architecture (e.g., Apple Silicon vs Intel).
- Artifact type (e.g., NSIS installer, Portable exe, macOS DMG, macOS ZIP).
- For macOS locally built unsigned artifacts: Did you see Gatekeeper or quarantine errors?
- Steps to reproduce.
- Expected behavior and actual behavior.
- Sanitized diagnostics from the Status tab.

Never post Venice API keys, bearer tokens, `.env` contents, certificates, or raw logs that contain secrets.
