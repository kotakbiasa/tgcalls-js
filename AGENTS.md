# AGENTS.md

Guidance for coding agents working on **tgcalls-js**.

## What this is

A TypeScript wrapper (`src/`) around the `ntgcalls` native binding that streams
audio/video into Telegram voice chats via a GramJS-family or mtcute MTProto client.
ESM (`"type": "module"`), strict TypeScript, Node ≥ 18.

## Commands

```bash
npm install            # npm 11+ may warn "install scripts blocked" for esbuild — cosmetic
npm run build          # tsc → dist/
npm run typecheck:all  # tsc -p tsconfig.all.json (src + examples + test)
npm test               # tsx test/run.ts — offline suite, NO Telegram credentials
npm run smoke          # node smoke.mjs — verify dist/index.js exports
```

CI without GitHub Actions: `scripts/ci.sh` (npm ci → build → typecheck:all → test →
smoke; `--fresh [ref]` clones pristine first). GitHub Actions may be disabled at the
account level — prefer `scripts/ci.sh` for verification.

## Hard rules

- **Never run live joins without an explicit user-account session and permission.**
  Bots cannot join voice chats. The offline test suite is the default verification path.
- The offline suite uses a **fake MTProto client + the real ntgcalls native core** — it
  proves protocol plumbing (ssrc round-trip, cleanup, races, dispose) without login.
- `ffmpeg` must be on PATH to run `npm test`; the suite fails fast with a clear message
  if it is missing.

## Native binary pitfall

`npm install` from a git URL on some npm versions (e.g. npm 12) skips the optional
`@ntgcalls/linux-x64` package → `Error: ntgcalls: no prebuilt binary for linux-x64`.
Fix: `npm install @ntgcalls/linux-x64@3.0.7 --no-save` (match the `ntgcalls` version).

## Domain pitfalls (do not regress these)

- Join order is fixed: getFullChannel → createCall → setStreamSources → joinGroupCall
  → connect. The same join-params string goes to JoinGroupCall; its ssrc is reused for
  LeaveGroupCall.
- `setStreamSources` REPLACES all devices — omitting the video channel drops it.
  `setSource()` must rebuild video. Camera and screen cannot be active simultaneously.
- `streamEnd` fires once per playback; with video, wait for BOTH audio and video to end
  before auto-leave.
- A failed join must stop the native call and send LeaveGroupCall (no zombie participant).
- mtcute TL `Long` (low/high) objects must be preserved by reference — do not convert to
  bigint. GramJS/teleproto use plain bigint.
- `ConnectionState` is numeric (CONNECTING=1, CONNECTED=2, FAILED=4, TIMEOUT=8, CLOSED=16).
- On native CLOSED/FAILED, leave via MTProto BEFORE notifying listeners.

## Conventions

- Library errors extend `TgCallsError` (`src/errors.ts`); add new typed errors there.
- Internal warnings go through `opts.logger` (default `console.error`) — do not
  `console.log` directly from library code.
- Public API is re-exported from `src/index.ts`; keep `src/types.ts` the source of truth
  for shared types. Examples live in `examples/`, tests in `test/`.
- Examples use `teleproto` (the maintained GramJS fork); runtime still supports `telegram`.
- Docs: `README.md`, `docs/*.md`, `llms.txt`, `llms-full.txt`. Keep them in sync with the
  public API when you change signatures.

## Release

Version in `package.json` + a `CHANGELOG.md` entry. Tag `vX.Y.Z` and
`gh release create vX.Y.Z` (releases via gh API work even when Actions is disabled).
