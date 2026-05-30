## Summary

- 

## Environment Validated

- [ ] Windows (10/11)
- [ ] macOS (13+)
- [ ] Apple Silicon (arm64)
- [ ] Intel (x64)

## Verification

- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] Platform packaging validated (`npm run verify:dist:win` or `npm run verify:dist:mac`)

## Release / Security Impact

- [ ] No API keys, tokens, certificates, or `.env` contents included
- [ ] Documentation updated when behavior or release process changed
- [ ] Venice endpoint allowlists updated in both shared and IPC validation if needed
- [ ] Windows and macOS packaging checked when Electron or release files changed
