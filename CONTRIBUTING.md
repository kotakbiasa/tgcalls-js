# Contributing to `tgcalls-js`

Thank you for considering contributing to **tgcalls-js**! Whether you are fixing a bug, improving an MTProto adapter (`teleproto`, GramJS, `mtcute`), adding a feature, or refining documentation, your help is welcome.

## Code of Conduct

This project adheres to the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## Getting Started

### Prerequisites

- **Node.js ≥ 18** (tested on 20 / 22)
- **`ffmpeg`** and **`ffprobe`** on `PATH` (for media/recording tests)

### Local Setup

```bash
git clone https://github.com/kotakbiasa/tgcalls-js.git
cd tgcalls-js
npm install
```

### Running Checks

Before opening a pull request, run typechecking and the offline test suite:

```bash
npm run typecheck
npm test
```

> **Note:** `npm test` runs isolated per-file test entrypoints using fake MTProto adapters against the real `ntgcalls` native core — no Telegram credentials are required.

## Making Changes

1. Fork the repository and create a branch from `main` (e.g. `fix/p2p-timeout` or `feat/voice-ai-helper`).
2. Keep changes focused and well-typed (strict TypeScript).
3. Add or update unit/integration tests under `tests/` covering your change.
4. If you add or change public APIs, update the relevant documentation in `docs/` (and run `python3 scripts/generate-docs.py` if applicable).
5. **Never commit secrets:** Do not commit Telegram `StringSession` values, `api_id`/`api_hash`, SQLite session files, or RTMP stream keys.

## Reporting Bugs & Requesting Features

- **Bugs:** Use the [Bug Report](.github/ISSUE_TEMPLATE/bug_report.yml) template and include your Node.js version, OS/arch, MTProto client (`teleproto`, `telegram`, or `@mtcute/node`), `ntgcalls` version, and a minimal reproduction.
- **Features:** Use the [Feature Request](.github/ISSUE_TEMPLATE/feature_request.yml) template and describe the use case and expected API.
- **Security vulnerabilities:** Please follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Pull Request Process

1. Ensure `npm run typecheck` and `npm test` pass cleanly.
2. Fill out the [Pull Request Template](.github/PULL_REQUEST_TEMPLATE.md).
3. Maintainers will review and provide feedback as soon as possible.
