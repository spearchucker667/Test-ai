# Signing and Notarization

Public distribution of Electron applications requires OS-level code signing to bypass security warnings.

> **Note**: Local builds executed via `npm run dist:win` or `npm run dist:mac` are unsigned by default. Unsigned builds will trigger Windows SmartScreen and macOS Gatekeeper warnings.

## Windows Authenticode

Windows requires an EV or Standard Code Signing Certificate to clear SmartScreen warnings.
`electron-builder` requires the following environment variables:
- `WIN_CSC_LINK`: Path or URL to the certificate.
- `WIN_CSC_KEY_PASSWORD`: Password for the certificate.

## macOS Developer ID and Notarization

Apple requires both application signing and automated Notarization.
`electron-builder` will attempt to sign and notarize the app if the following are provided:
- `CSC_LINK` / `CSC_KEY_PASSWORD`: P12 certificate and password.
- Apple App Store Connect credentials (usually configured via `APPLE_ID` and `APPLE_APP_SPECIFIC_PASSWORD`).

For our local builds, `hardenedRuntime: true` is enabled in `electron-builder.config.cjs`. Unsigned local binaries will still successfully build; the hardened runtime flag primarily affects notarization requirements for public releases. 

**Never commit code signing certificates or passwords to the repository.**
