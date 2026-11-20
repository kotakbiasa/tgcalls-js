# tgcalls-js

**pytgcalls-style Telegram group-call wrapper for Node.js.** Stream audio, video,
and screen shares into Telegram voice chats using a GramJS-family client
([`teleproto`](https://www.npmjs.com/package/teleproto) / `telegram`) or
[`mtcute`](https://www.npmjs.com/package/@mtcute/node), on top of the official
[`ntgcalls`](https://www.npmjs.com/package/ntgcalls) native binding (the C++ WebRTC
core by the pytgcalls team — prebuilt binaries, no compiling).

[![Release](https://img.shields.io/github/v/release/kotakbiasa/tgcalls-js)](https://github.com/kotakbiasa/tgcalls-js/releases)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

> **Status: v0.7.1** — audio + video + presentation + idle + playlist/queue + recording + P2P calls both directions (teleproto & mtcute).
> Verified end-to-end against live Telegram voice chats (audio, video up to
> 1080p60, and 40-minute idle presence) on Node 20+.

## Features

- 🎵 **Audio** from a file, direct URL, YouTube (via yt-dlp), or a custom shell PCM pipe.
- 📃 **Playlist/queue** — `play()` / `enqueue()` / `skip()` / `playOnHold()`; tracks auto-advance, hold music loops while the queue is empty.
- ⏺️ **Recording** — `startRecording()` / `stopRecording()`; records incoming call audio (native mix of all speakers) to wav/mp3/opus via ffmpeg.
- 📞 **P2P calls, both directions** *(verified live)* — `listenCalls()` answers 1-on-1 calls, `callUser()` places one; audio + video.
- ⏺️ **P2P recording** — audio, or video+audio muxed to mp4 (`record: {path}`).
- 🎬 **Video** from the same source (`video: {width, height, fps}`), camera or presentation channel.
- 🖥️ **Screen share** via `startPresentation()` / `stopPresentation()`.
- 🧍 **Idle presence** via `joinIdle()` — stay in a call with no media (stable on UDP-capable hosts).
- 🔌 **Client-agnostic** — auto-detects teleproto / GramJS / mtcute, or bring your own `MTProtoAdapter`.
- 🧯 **Typed errors**, injectable `logger`, queue-friendly `setSource()`, clean lifecycle (`leave` / `dispose`).
- ✅ **Offline test suite** — fake MTProto + the real ntgcalls native core, no Telegram credentials needed.

## Install

```bash
# Pin a tag for stability. npm 12+ blocks git dependencies by default, hence --allow-git:
npm install --allow-git=all github:kotakbiasa/tgcalls-js#v0.7.0
```

Requirements:

- **Node.js ≥ 18** (tested on 20 / 22).
- **ffmpeg** on `PATH` — required for every audio/video source.
- **yt-dlp** on `PATH` — only if you use `joinYouTube()`.
- A **user account** session (StringSession / mtcute storage). **Bots cannot join voice chats.**

`ntgcalls` ships prebuilt binaries for Linux x64/arm64, macOS arm64, and Windows x64.
If install skips the platform binary, see [Troubleshooting](docs/troubleshooting.md).

## Quick start

### teleproto / GramJS

```js
import { TelegramClient } from 'teleproto';
import { StringSession } from 'teleproto/sessions/index.js';
import { TgCallsClient } from 'tgcalls-js';

const client = new TelegramClient(new StringSession(SESSION), API_ID, API_HASH, {});
await client.connect();

const tg = new TgCallsClient({ client });
await tg.join(-1001234567890, { kind: 'file', path: './song.mp3' });
// streaming… auto-leaves when the track ends (autoLeave defaults to true)
```

> The archived `telegram` package works identically — just change the two import
> specifiers back to `telegram` / `telegram/sessions/index.js`.

### mtcute

```js
import { TelegramClient } from '@mtcute/node';
import { TgCallsClient } from 'tgcalls-js';

const client = new TelegramClient({ apiId: API_ID, apiHash: API_HASH, storage: 'account.session' });
await client.start();

const tg = new TgCallsClient({ client }); // client type auto-detected
await tg.join(-1001234567890, { kind: 'file', path: './song.mp3' });
```

### Video, YouTube, URL, shell

```js
// Video from the same file (camera channel)
await tg.join(chatId, { kind: 'file', path: './clip.mp4' }, {
  video: { width: 854, height: 480, fps: 30 },
});

// Screen share (presentation channel)
await tg.join(chatId, { kind: 'file', path: './clip.mp4' }, {
  video: { width: 1280, height: 720, fps: 30 }, presentation: true,
});

// YouTube / any yt-dlp-supported site
await tg.joinYouTube(chatId, 'https://youtube.com/watch?v=…');

// Direct URL (radio stream, mp3, m3u8, …)
await tg.join(chatId, { kind: 'url', url: 'https://example.com/stream.mp3' });

// Custom shell command piping s16le 48 kHz stereo PCM to stdout
await tg.join(chatId, {
  kind: 'shell',
  command: 'ffmpeg -i song.flac -loglevel panic -f s16le -ac 2 -ar 48000 pipe:1',
});
```

### Events

```js
tg.on('streamEnd', async ({ chatId, source, willAutoLeave }) => {
  // play the next track without leaving:
  await tg.setSource(chatId, { kind: 'file', path: './next.mp3' });
});
tg.on('connectionChange', (chatId, state) => { /* numeric ConnectionState */ });
```

## Documentation

| Doc | Contents |
|---|---|
| [Getting started](docs/getting-started.md) | Install, requirements, login, first stream |
| [Guide](docs/guide.md) | Sources, video, presentation, idle, queue, adapters, join flow |
| [API reference](docs/api.md) | Every method, option, type, event, and error |
| [Troubleshooting](docs/troubleshooting.md) | Native binary, ffmpeg, UDP/RTMP, YouTube, 2FA |

**For AI agents / LLM tooling:** [`llms.txt`](llms.txt) (concise index) and
[`llms-full.txt`](llms-full.txt) (full documentation in one file).
Coding agents working on this repo: see [`AGENTS.md`](AGENTS.md).

## API at a glance

| Method | Description |
|---|---|
| `join(chat, source, opts?)` | Join a voice chat and stream a source |
| `joinYouTube(chat, url, opts?)` | Resolve via yt-dlp, then `join` |
| `joinIdle(chat, opts?)` | Join with no media (idle presence) |
| `startPresentation(chat, source, video?)` / `stopPresentation(chat)` | Screen-share channel |
| `setSource(chat, source)` | Swap the audio of an active call (queue) |
| `pause / resume / mute / unmute(chat)` | Native media controls |
| `time(chat)` | Seconds streamed |
| `leave(chat)` / `dispose()` | Leave one call / tear down everything |
| `activeCalls() / getCall(chat) / isActive(chat)` | Introspection |
| `resolveChatId(chat)` | username / t.me link / id → marked id |
| `on(event, cb)` | `streamEnd`, `connectionChange`, `update` |

Full signatures and types: [API reference](docs/api.md).

## How it works

```
channels.getFullChannel ──► full_chat.call (InputGroupCall)
ntgcalls.createCall ──────► native join params (JSON: ufrag/pwd/fp/ssrc)
ntgcalls.setStreamSources ─ ffmpeg/yt-dlp PCM source (SHELL)
phone.joinGroupCall ──────► UpdateGroupCallConnection.params (connect JSON)
ntgcalls.connect ─────────► WebRTC → Telegram media servers
```

Telegram's connect params are passed to the native core verbatim. The audio SSRC
used for `phone.leaveGroupCall` comes from the join params produced by
`ntgcalls.createCall`.

## Caveats

- `ntgcalls` is pinned to an exact `3.0.x` (currently `3.0.7`); the 3.x line is young and may shift upstream.
- Using `telegram` **and** `teleproto` in one process? Pass the matching `Api` namespace to each `TgCallsClient`. mtcute uses its own TL schema and needs no `Api`.
- `process.exit()` immediately after using the native lib can abort during WebRTC teardown (cosmetic; long-running bots are unaffected). `await tg.dispose()` first.
- Presentation requires an RTC connection — unavailable on UDP-blocked hosts in RTMP/STREAM mode.

## Development

```bash
npm install
npm run build          # tsc → dist/
npm run typecheck:all  # src + examples + test
npm test               # offline suite (no credentials)
npm run smoke          # verify dist exports
```

See [`AGENTS.md`](AGENTS.md) for conventions and pitfalls.

## License

MIT for this wrapper. [`ntgcalls`](https://github.com/pytgcalls/ntgcalls) is
LGPL-3.0 (its own repo, installed as a dependency).
