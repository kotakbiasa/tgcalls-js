# Security Policy

## Supported Versions

Security fixes are applied to the latest release on the `main` branch.

| Version | Supported |
|---|---|
| `0.4.x` / `main` | ✅ |
| `< 0.4.0` | ❌ |

## Security Boundaries in `tgcalls-js`

`tgcalls-js` handles sensitive runtime inputs including MTProto sessions, RTMP ingest keys, persistence state files, and end-to-end encrypted P2P/conference calls:

- **End-to-End Encryption:** All P2P and conference cryptography runs inside the native `ntgcalls` binary. `tgcalls-js` never falls back to plaintext or custom JavaScript crypto.
- **Secrets Redaction:** `RtmpPublisher` redacts stream keys from error messages; `PersistenceError` never includes source URLs or shell commands in error messages.
- **Shell Sources:** `{ kind: 'shell', command }` executes a caller-supplied command and is disabled by default in persistence (`persistence.allowShell: false`, `restore.allowShell: false`). Never pass untrusted user input into a `shell` source.

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, use [GitHub Private Vulnerability Reporting](https://github.com/kotakbiasa/tgcalls-js/security/advisories/new) to submit a confidential report. Please include:

- A clear description of the vulnerability and its impact
- Steps to reproduce or a proof-of-concept
- Affected `tgcalls-js`, `ntgcalls`, and Node.js versions

We will acknowledge receipt within 72 hours and work with you on a fix and coordinated disclosure.
