# Dual-Platform Release Checklist

## Version

1. Update `version` in `package.json`.
2. Run `npm install` so `package-lock.json` stays in sync.
3. Update `CHANGELOG.md` with the new version section.
4. Confirm `README.md`, [LEGAL.md](LEGAL.md), [SECURITY.md](SECURITY.md), [REPOSITORY_TREE.md](REPOSITORY_TREE.md), and this checklist match the release.
5. Confirm public-facing badges and GitHub templates still point at `spearchucker667/Windows-Venice-API-connector`.

## Local Windows Build

Run on Windows PowerShell:

```powershell
npm run clean
npm install
npm run typecheck
npm test
npm run build
npm run dist:win
npm run checksum:release
npm run verify:dist:win
npm run verify:dist:portable
```

Expected artifacts:

- `release/Venice-Forge-<version>-x64-Setup.exe`
- `release/Venice-Forge-<version>-x64-Portable.exe`
- `release/Venice-Forge-<version>-x64-Setup.exe.sha256`
- `release/Venice-Forge-<version>-x64-Portable.exe.sha256`

## Local macOS Build

Run on macOS Bash/Zsh:

```bash
npm run clean
npm install
npm run typecheck
npm test
npm run build
npm run dist:mac
npm run checksum:release
npm run verify:dist:mac
```

Expected artifacts:

- `release/Venice-Forge-<version>-arm64.dmg` and `.zip`
- `release/Venice-Forge-<version>-x64.dmg` and `.zip`
- Associated `.sha256` checksums

## Signing & Notarization

### Windows
Signing is optional for local development. Configure electron-builder-compatible signing with `CSC_LINK`/`CSC_KEY_PASSWORD` or `WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD` for distribution. Unsigned builds may trigger SmartScreen.

### macOS
Local builds are ad-hoc signed. To distribute, you must configure macOS code signing (using `CSC_LINK` and `CSC_KEY_PASSWORD` containing a Developer ID Application certificate) and submit the build to Apple's notary service using notarization parameters. Unsigned/ad-hoc signed builds will trigger Gatekeeper warnings unless stripped of their quarantine flags via `xattr -dr com.apple.quarantine`.

## GitHub Actions

Use `.github/workflows/windows-release.yml` and `.github/workflows/macos-release.yml` for Windows and macOS builds.

Triggers:
- Manual `workflow_dispatch`
- Version tags matching `v*`

The workflows run `npm ci`, typecheck, tests, build, packaging commands (`dist:win` or `dist:mac`), checksum generation, and verification scripts (`verify:dist`), then upload the signed/unsigned bundles as release assets.

## Smoke Test

- [ ] Fresh launch routes to API key setup when no key exists.
- [ ] Save, test, and delete API key.
- [ ] Invalid key returns a clean `401`/`403` style message.
- [ ] Model refresh succeeds after a valid key is saved.
- [ ] Chat and image generation work.
- [ ] Batch run completes successfully.
- [ ] Research (web search, scrape, text-parser) returns results.
- [ ] Export data creates versioned JSON without secrets.
- [ ] Import validates and merges data without clearing existing records; pre-import backup saved to disk.
- [ ] Copy diagnostics redacts secrets.
- [ ] Open logs folder works.
- [ ] Setup installer installs and uninstalls without deleting user data.
- [ ] Portable exe launches without installation.
- [ ] `verify:dist:portable` passes (`Venice-Forge-<version>-x64-Portable.exe` + `.sha256`).
- [ ] SHA-256 checksum files match the final uploaded `.exe` files.
- [ ] Release notes state whether artifacts are signed or unsigned.
- [ ] Legal/TOS notes in [LEGAL.md](LEGAL.md) still link to current Venice pages.

## Publish

1. Create a tag: `git tag v<version> && git push origin v<version>`.
2. Download artifacts from the workflow or use local `release/`.
3. Smoke test on clean Windows and macOS environments.
4. Upload artifacts and checksums to the release.
5. Note whether artifacts are signed or unsigned.
6. Update the GitHub Release notes from `CHANGELOG.md`.
