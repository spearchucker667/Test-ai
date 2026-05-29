# Contributing to Venice Forge

Thank you for your interest in contributing to **Venice Forge**! This document provides guidelines and workflows for contributors.

## Code of Conduct

Please read and follow our [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Public Repository Expectations

- Keep pull requests focused and reviewable.
- Do not commit secrets, `.env` files, generated release artifacts, or local logs.
- Keep README, [docs/ABOUT.md](docs/ABOUT.md), [docs/SECURITY.md](docs/SECURITY.md), [docs/RELEASE.md](docs/RELEASE.md), and [docs/LEGAL.md](docs/LEGAL.md) current when behavior, packaging, or legal assumptions change.
- Treat all Venice API keys as secrets. Never expose them to renderer code, frontend bundles, issue screenshots, or test fixtures.

## Getting Started

### Prerequisites

- Node.js 20 or 22
- npm 10+
- Windows 10/11 or macOS 13+ (for full Electron packaging tests)
- A Venice API key ([venice.ai](https://venice.ai))

### Development Setup

```bash
git clone https://github.com/spearchucker667/Windows-Venice-API-connector.git
cd Windows-Venice-API-connector
npm install
```

Copy `.env.example` to `.env` and set your `VENICE_API_KEY` for web-mode development.

### Running in Development

```bash
# Electron desktop mode (recommended)
npm run dev:electron

# Web mode (Vite + Express proxy)
npm run dev:web
```

## Development Workflow

### Branch Naming

- `feature/description` — new features
- `fix/description` — bug fixes
- `security/description` — security patches
- `docs/description` — documentation updates

### Before Committing

```bash
# Lint and type-check everything (renderer + Electron main)
npm run lint:eslint
npm run typecheck

# Run tests
npm test

# Build all targets
npm run build

# Validate icons and dist builds
npm run verify:icon
npm run dist:mac # or dist:win, depending on your OS
npm run checksum:release
npm run verify:dist:mac # or verify:dist:win
npm run verify:dist:portable # Windows only
```

All commands and validations must pass before opening a PR. Note that Windows releases must be validated on Windows, and macOS releases on macOS.

### Testing

- Tests live next to the source file: `src/services/foo.ts` → `src/services/foo.test.ts`.
- Use pure-function tests where possible (no mocking).
- When fixing a bug, add a regression guard comment: `// BUG-NNN regression guard`.
- Server tests must include `// @vitest-environment node` at the top.

### Code Style

- TypeScript **strict mode** is enforced. Avoid `any`; use proper types.
- Use `function` declarations for modules, not arrow functions.
- CSS styling relies on Tailwind v4 utility classes inline with JSX, following the "Premium Dark Glass" theme.
- Keep changes minimal and focused.

## Security

If you discover a security vulnerability, **do not open a public issue**. Instead:

1. Follow [SECURITY.md](SECURITY.md).
2. Request a private maintainer discussion before sharing exploit details.
3. Never post API keys, bearer tokens, `.env` contents, certificates, or private logs.

See [docs/SECURITY.md](docs/SECURITY.md) for the full security model.

## Pull Request Checklist

- [ ] `npm run lint:eslint` passes
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] `npm run build` passes
- [ ] Platform-specific packaging checks (`npm run verify:dist:win`, `npm run verify:dist:mac`, and `npm run verify:dist:portable`) pass
- [ ] New code includes tests where applicable
- [ ] Documentation updated (README, AGENTS.md, etc.)
- [ ] CHANGELOG.md updated under `[Unreleased]`
- [ ] Legal/TOS notes reviewed if Venice API behavior, privacy, or release claims changed
- [ ] Markdown links checked when docs changed

## Questions?

Use [SUPPORT.md](SUPPORT.md) for issue routing.

---

**Maintainer:** @spearchucker667
