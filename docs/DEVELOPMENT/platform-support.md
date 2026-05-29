# Platform Support Matrix

| OS | Architecture | Status | Packaging | Storage |
|----|--------------|--------|-----------|---------|
| Windows 10/11 | x64 | **Supported** | NSIS, Portable | DPAPI |
| macOS 13+ | Apple Silicon (arm64) | **Supported** | DMG, ZIP | Keychain |
| macOS 13+ | Intel (x64) | **Supported** | DMG, ZIP | Keychain |
| Linux | x64 / arm64 | *Not officially packaged* | - | Plaintext Fallback (Dev Only) |
| Web (Browser) | Any | **Supported (Dev Mode)** | - | Server `.env` |

### Known Limitations
- Windows ARM64 is not currently packaged by default.
- Linux builds are intentionally excluded from `electron-builder` configs until an icon standard (`icon.png`) and smoke-testing workflow is implemented.
