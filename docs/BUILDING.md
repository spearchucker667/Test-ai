# Building Venice Forge

This document covers all commands for local development, packaging, and validation across Windows and macOS.

## Quick Start (Development)

```bash
npm install
npm run dev:electron   # Start the desktop app in development mode
# or
npm run dev:web        # Start the web proxy development mode
```

## Cross-Platform Validation

Before submitting a PR, always run the cross-platform baseline validations:
```bash
npm run lint:eslint
npm run typecheck
npm test
npm run build
npm run verify:icon
```

## Packaging for Windows

Run the following on Windows PowerShell:
```powershell
npm run dist:win
npm run checksum:release
npm run verify:dist:win
npm run verify:dist:portable
```

This generates NSIS setup executables and portable binaries in the `release/` directory.

## Packaging for macOS

Run the following on macOS Terminal:
```bash
npm run dist:mac
npm run checksum:release
npm run verify:dist:mac
```

This generates Apple Silicon and Intel `.dmg` and `.zip` artifacts in the `release/` directory.

## Checksums
The `npm run checksum:release` script runs deterministically across platforms, outputting a `<filename>.sha256` sidecar for every `.exe`, `.dmg`, and `.zip` artifact.
