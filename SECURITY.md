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

## Dependency Auditing

Dependencies are audited with `npm audit` before each release. To run a
manual audit:

```bash
npm audit
```

A clean audit (`0 vulnerabilities`) is a release gate requirement.
