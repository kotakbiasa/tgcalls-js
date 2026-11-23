# tgcalls-js

**pytgcalls-style Telegram group-call wrapper for Node.js.** Stream audio, video,
and screen shares into Telegram voice chats using a GramJS-family client
([`teleproto`](https://www.npmjs.com/package/teleproto) / `telegram`) or
[`mtcute`](https://www.npmjs.com/package/@mtcute/node), on top of the official
[`ntgcalls`](https://www.npmjs.com/package/ntgcalls) native binding (the C++ WebRTC
core by the pytgcalls team — prebuilt binaries, no compiling).

[![Docs](https://img.shields.io/badge/docs-gitbook-blue)](https://tgcalls-js.gitbook.io/docs/)
[![Release](https://img.shields.io/github/v/release/kotakbiasa/tgcalls-js)](https://github.com/kotakbiasa/tgcalls-js/releases)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

> **Latest release: v0.9.0.** Includes call preflight (`#17`), participant folder recording (`#18`), outgoing P2P recording (`#19`), RTMP publisher & stream viewer (`#20`), experimental E2E conference core (`#21`), opt-in group state persistence (`#22`), and `confirmCall` unwrap (`#23`). See [roadmap status](docs/ROADMAP.md) and [new APIs](docs/roadmap-api.md) for verification details and native limits.
> Verified end-to-end against live Telegram voice chats, P2P video calls, RTMP livestreams, and 2-account E2E conferences on Node 20+.

## Features

- 🎵 **Audio** from a file, direct URL, YouTube (via yt-dlp), custom shell PCM pipe, or real-time `{ kind: 'external' }` PCM frames (no ffmpeg required).
- 🎙️ **Voice AI / External Frame Bridge** — `pushAudioFrame()` (auto-sliced 10ms PCM), `pushVideoFrame()` (raw I420), and `onAudioFrame()` for live STT/TTS pipelines.
- 📃 **Playlist & Playback Controls** — `play()` / `enqueue()` / `skip()` / `playOnHold()`, plus `seek()`, `setVolume()` (0–200%), `setSpeed()` (0.5–2.0×), and `setLoop('off' | 'one' | 'all')`.
- ⏺️ **Recording (Mixed & Per-Participant Folder)** — `startRecording(chat, path)` for mixed audio, or `startRecording(chat, { dir, video })` for segmented per-participant WAV/MP4 + `manifest.json` *(verified live)*.
- 📞 **P2P Calls, Both Directions** *(verified live)* — `canRequestCall()` / `getCallDenialReason()` preflight without ringing, `listenCalls()`, `callUser()` with per-call `record` override, audio + video.
- 📡 **RTMP Livestream & Broadcast Viewer** *(verified live)* — `getStreamRtmpUrl()`, `joinRtmp()` (`RtmpPublisher`), and `joinStreamMode()` (`BroadcastController`).
- 🔐 **E2E Conference Calls** *(core verified live)* — `createConference()`, `joinConference()`, `exportConferenceInvite()`, `inviteConferenceParticipants()`, `getEmojiFingerprint()`, and capability-aware `sendConferenceMessage()` (`ntgcalls` 4.x).
- 💾 **Opt-in Restart Persistence** *(verified live)* — `statePath`, `flushState()`, and `resumeFromState()` for fresh group rejoin and recording segment recovery.
- 👥 **Voice Chat Controls & `joinAs`** — join as a channel/alias (`joinAs`), `getParticipants()`, `setRaiseHand()`, `muteParticipant()`, and `setParticipantVolume()`.
- 🎬 **Video & Screen Share** — camera (`video: { width, height, fps }`) and presentation (`startPresentation()` / `stopPresentation()`).
- 🔌 **Client-agnostic** — auto-detects teleproto / GramJS / mtcute, or bring your own `MTProtoAdapter`.
- ✅ **Offline test suite** — isolated per-file test runner (`npm test`) with fake MTProto + real ntgcalls native core.

## Roadmap

Sudah jalan vs belum: [`docs/ROADMAP.md`](docs/ROADMAP.md) (tracking: [#25](https://github.com/kotakbiasa/tgcalls-js/issues/25)).

## Install

```bash
# Pin a tag for stability. npm 12+ blocks git dependencies by default, hence --allow-git:
npm install --allow-git=all github:kotakbiasa/tgcalls-js#v0.9.0
```

Requirements:

- **Node.js ≥ 18** (tested on 20 / 22).
- **ffmpeg** on `PATH` for file/URL container audio/video, mixed recording, video muxing and RTMP publication. Caller-owned raw PCM shell commands can use another producer.
- **ffprobe** on `PATH` for video probing and folder artifact validation. Configure `ffmpegPath` / `ffprobePath` when needed; see [media support](docs/media-support.md).
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
| [Extended APIs](docs/roadmap-api.md) | Preflight, folder recording, RTMP, conference, persistence, external frame bridge, playback & participant controls |
| [Media support](docs/media-support.md) | Measured decoder support and ffmpeg requirement |

**For AI agents / LLM tooling:** [`llms.txt`](llms.txt) (concise index) and
[`llms-full.txt`](llms-full.txt) (full documentation in one file).
Coding agents working on this repo: see [`AGENTS.md`](AGENTS.md).

## API at a glance

| Method | Description |
|---|---|
| `join(chat, source, opts?)` | Join a voice chat (supports `joinAs`, `video`, `presentation`, `{ kind: 'external' }`) |
| `joinYouTube(chat, url, opts?)` | Resolve via yt-dlp, then `join` |
| `joinIdle(chat, opts?)` | Join with no media (idle presence) |
| `play / enqueue / skip / playOnHold` | Playlist & queue management |
| `seek / setVolume / setSpeed / setLoop` | Playback seek, volume (0–200%), speed (0.5–2×), and loop (`off`/`one`/`all`) |
| `pushAudioFrame / pushVideoFrame / onAudioFrame` | Real-time external PCM/I420 frame bridge (Voice AI) |
| `startRecording(chat, path \| { dir, video })` | Mixed audio or per-participant folder recording |
| `canRequestCall / getCallDenialReason` | P2P preflight eligibility check without ringing |
| `listenCalls / callUser / stopListeningCalls` | Incoming & outgoing 1-on-1 P2P audio/video calls + recording |
| `getStreamRtmpUrl / joinRtmp / joinStreamMode` | RTMP livestream publishing & broadcast stream viewing |
| `createConference / joinConference / leaveConference` | E2E conference lifecycle, invites, emoji fingerprint & messages |
| `getParticipants / setRaiseHand / muteParticipant / setParticipantVolume` | Voice chat participant controls |
| `flushState / resumeFromState` | Opt-in state persistence & fresh restart recovery |
| `startPresentation / stopPresentation` | Screen-share channel |
| `pause / resume / mute / unmute / time` | Native media controls & elapsed seconds |
| `leave(chat)` / `dispose()` | Leave one call / tear down everything |
| `on(event, cb)` | `streamEnd`, `connectionChange`, `remoteSourceChange`, `recordingStopped`, `recordingError`, `broadcastError`, `conferenceMessage`, `conferenceError`, `persistenceError`, `update` |

Full signatures and types: [API reference](docs/api.md) and [Extended APIs](docs/roadmap-api.md).

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
