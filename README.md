<div align="center">

<img src="docs/assets/logo.png" alt="tgcalls-js logo" width="112" />

# tgcalls-js

**Modern `pytgcalls`-style Telegram voice, video & livestream SDK for Node.js.**

Built on [`ntgcalls`](https://www.npmjs.com/package/ntgcalls) (native C++ WebRTC core — prebuilt binaries, zero compiling) and works with [`teleproto`](https://www.npmjs.com/package/teleproto), `telegram` (GramJS), or [`@mtcute/node`](https://www.npmjs.com/package/@mtcute/node).

[![Documentation](https://img.shields.io/badge/docs-tgcalls--js.gitbook.io-0284C7?style=flat&logo=gitbook&logoColor=white)](https://tgcalls-js.gitbook.io/docs/)
[![Release](https://img.shields.io/github/v/release/kotakbiasa/tgcalls-js?style=flat&color=0EA5E9)](https://github.com/kotakbiasa/tgcalls-js/releases)
[![Node](https://img.shields.io/badge/node-%E2%89%A518-339933?style=flat&logo=node.js&logoColor=white)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-64748B?style=flat)](LICENSE)

[**Read the Docs**](https://tgcalls-js.gitbook.io/docs/) · [**Quick Start**](https://tgcalls-js.gitbook.io/docs/getting-started/getting-started) · [**Features**](https://tgcalls-js.gitbook.io/docs/features-and-guides/group-calls) · [**API Reference**](https://tgcalls-js.gitbook.io/docs/api-reference/api) · [**Changelog**](CHANGELOG.md)

</div>

---

## Highlights

| Capability | What's Included | Guide |
|---|---|---|
| **Group Voice & Video** | Stream files, URLs, HLS, YouTube (`yt-dlp`), custom PCM shells, camera video (`360p`–`4K`), and screen share presentations | [Group Calls](https://tgcalls-js.gitbook.io/docs/features-and-guides/group-calls) |
| **Music & Room Controls** | Queue (`play`/`enqueue`/`playNext`/`shuffleQueue`), `seek`, `setVolume`, `setSpeed`, `setAudioFilter` (`bassboost`/`nightcore`/`8d`), `idleTimeoutMs`, `setCallTitle`, `endGroupCall`, `exportCallInvite`, `toggleNativeRecording` | [Playback & Controls](https://tgcalls-js.gitbook.io/docs/features-and-guides/playback-and-participants) |
| **1-on-1 P2P Calls** | Incoming & outgoing E2E voice/video calls, non-ringing preflight (`canRequestCall`), 4-emoji fingerprint, remote MP4/audio recording | [P2P Calls](https://tgcalls-js.gitbook.io/docs/features-and-guides/p2p-calls) |
| **Recording** | Mixed group audio (`.wav`/`.mp3`/`.opus`) and segmented per-participant folder WAV/MP4 + `manifest.json` | [Recording](https://tgcalls-js.gitbook.io/docs/features-and-guides/recording) |
| **RTMP & Livestreams** | H.264/AAC RTMP publisher (`joinRtmp` with queue, hold & reconnect) and broadcast viewer (`joinStreamMode`) | [RTMP & Streams](https://tgcalls-js.gitbook.io/docs/features-and-guides/rtmp-and-streams) |
| **E2E Conferences** | Multi-party encrypted conferences (`createConference`, `joinConference`, invites, emoji check, capability-aware E2E messages on `ntgcalls` 4.x) | [E2E Conferences](https://tgcalls-js.gitbook.io/docs/features-and-guides/conferences) |
| **Voice AI & Gemini Live** | Built-in `connectGeminiLive()`, zero-`ffmpeg` `{ kind: 'external' }` PCM resampler (`16k/24k ↔ 48k`), VAD (`onVoiceActivity`), barge-in (`interruptAudio`), and `onVideoFrame` + `i420ToBmp` | [Voice AI Bridge](https://tgcalls-js.gitbook.io/docs/features-and-guides/external-frames) |
| **Restart Persistence** | Opt-in atomic desired-state store (`statePath`) and explicit `resumeFromState()` recovery | [Persistence](https://tgcalls-js.gitbook.io/docs/features-and-guides/persistence) |

---

## Install

```bash
# Pin a release tag (npm 12+ requires --allow-git for GitHub dependencies)
npm install --allow-git=all github:kotakbiasa/tgcalls-js#v0.9.0
```

**Requirements:** Node.js ≥ 18, a Telegram **user account** session (bots cannot join voice chats), and `ffmpeg` / `ffprobe` on `PATH` (optional if you only use `{ kind: 'external' }` frames; `yt-dlp` only for `joinYouTube()`).

---

## Quick Start

```ts
import { TelegramClient } from 'teleproto';
import { StringSession } from 'teleproto/sessions/index.js';
import { TgCallsClient, VideoQuality } from 'tgcalls-js';

const client = new TelegramClient(
  new StringSession(process.env.TG_SESSION!),
  Number(process.env.TG_API_ID),
  process.env.TG_API_HASH!,
  { connectionRetries: 5 },
);
await client.connect();

const tg = new TgCallsClient({ client });

// Play audio or video in a group voice chat
await tg.play('@mygroup', { kind: 'file', path: './song.mp3' });
await tg.enqueue('@mygroup', { kind: 'file', path: './next.mp3' });
await tg.setVolume('@mygroup', 125);

// Clean shutdown
process.once('SIGINT', async () => {
  await tg.dispose();
  await client.disconnect();
});
```

<details>
<summary>Using <strong>@mtcute/node</strong> instead?</summary>

```ts
import { TelegramClient } from '@mtcute/node';
import { TgCallsClient } from 'tgcalls-js';

const client = new TelegramClient({
  apiId: Number(process.env.TG_API_ID),
  apiHash: process.env.TG_API_HASH!,
  storage: 'my-account',
});
await client.start(); // use start() so the updates loop is active

const tg = new TgCallsClient({ client });
await tg.join('@mygroup', { kind: 'file', path: './song.mp3' });
```

</details>

---

## Documentation

Full guides, architecture notes, runnable examples, and API tables are hosted at **[tgcalls-js.gitbook.io/docs](https://tgcalls-js.gitbook.io/docs/)**:

- **Getting Started:** [Installation](https://tgcalls-js.gitbook.io/docs/getting-started/getting-started) · [Usage Guide](https://tgcalls-js.gitbook.io/docs/getting-started/guide) · [Troubleshooting](https://tgcalls-js.gitbook.io/docs/getting-started/troubleshooting)
- **API & Internals:** [Core API Reference](https://tgcalls-js.gitbook.io/docs/api-reference/api) · [Extended APIs](https://tgcalls-js.gitbook.io/docs/api-reference/roadmap-api) · [Roadmap Status](https://tgcalls-js.gitbook.io/docs/internals-and-status/roadmap) · [Media Support](https://tgcalls-js.gitbook.io/docs/internals-and-status/media-support)
- **AI Agents & LLMs:** [`llms.txt`](https://tgcalls-js.gitbook.io/docs/llms.txt) · GitBook MCP (`https://tgcalls-js.gitbook.io/docs/~gitbook/mcp`)

---

## Development

```bash
npm install
npm run typecheck
npm test        # runs isolated offline test suite against real ntgcalls native core
```

## License

[MIT](LICENSE)
