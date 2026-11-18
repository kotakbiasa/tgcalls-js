# tgcalls-js

**pytgcalls-style Telegram group call wrapper for Node.js** — stream audio into
Telegram voice chats using GramJS-family clients (`telegram`, `teleproto`) or
`mtcute` (`@mtcute/node`, `@mtcute/core`) on top of the official [`ntgcalls`](https://www.npmjs.com/package/ntgcalls)
native binding (C++ WebRTC core by the pytgcalls team, prebuilt binaries, no compiling).

Status: v0.3.1 — audio + video + screen share (presentation) + mtcute support. Tested with teleproto 1.233 and mtcute 0.32 on Node 20+.

## Install

```bash
# npm publish is pending — install from the git repo for now:
npm install github:kotakbiasa/tgcalls-js
```

`ntgcalls` ships prebuilt native binaries for Linux x64/arm64, macOS arm64 and
Windows x64 — no compiler needed. You also need `ffmpeg` on PATH (and
`yt-dlp` only if you use joinYouTube).

## Troubleshooting the native binary

`Error: ntgcalls: no prebuilt binary for linux-x64` — some npm versions (seen
with npm 12 installing from a git URL) skip `ntgcalls`' platform-specific
optional dependency. Install it yourself:

```bash
npm install @ntgcalls/linux-x64@3.0.6 --no-save   # match the ntgcalls version
```

Use `linux-arm64` / `darwin-arm64` / `win32-x64` on other platforms. Installing
tgcalls-js from the npm registry (once published) resolves optional dependencies
normally and avoids this entirely.

**ffmpeg must be on PATH before you run anything** — ntgcalls spawns it per
source, and without it the native core fails with a confusing
`default_launcher: No such file or directory (vfork_launcher)` error instead of
"ffmpeg not found" (Debian/Ubuntu: `sudo apt-get install ffmpeg`).


## Quick start

### GramJS / teleproto

```js
// teleproto is the maintained GramJS fork; the archived `telegram` package
// works identically — just change the two import specifiers back.
import { TelegramClient } from 'teleproto';
import { StringSession } from 'teleproto/sessions/index.js';
import { TgCallsClient } from 'tgcalls-js';

const client = new TelegramClient(new StringSession(SESSION), API_ID, API_HASH, {});
await client.connect();

const tg = new TgCallsClient({ client });

await tg.join(-1001234567890, { kind: 'file', path: './song.mp3' });
console.log('streaming…');
```

### mtcute

```js
import { TelegramClient } from '@mtcute/node';
import { TgCallsClient } from 'tgcalls-js';

const client = new TelegramClient({ apiId: API_ID, apiHash: API_HASH, storage: 'account.session' });
await client.start();

// Client type is automatically detected:
const tg = new TgCallsClient({ client });

await tg.join(-1001234567890, { kind: 'file', path: './song.mp3' });
console.log('streaming…');
```


### Video and presentation

Pass `video` options to stream the same file or URL as video. For example,
854×480 at 30 FPS is a useful starting point when higher resolutions stutter:

```js
await tg.join(chatId, { kind: 'file', path: './clip.mp4' }, {
  video: { width: 854, height: 480, fps: 30 },
});
```

To send that source through Telegram's presentation channel instead of camera
video, also set `presentation: true`:

```js
await tg.join(chatId, { kind: 'file', path: './clip.mp4' }, {
  video: { width: 854, height: 480, fps: 30 },
  presentation: true,
});
```

Supported frame rate and resolution depend on the device and network. Adjust
`width`, `height`, and `fps` if playback stutters.

YouTube / any supported site:

```js
await tg.joinYouTube(chatId, 'https://youtube.com/watch?v=…');
```

Direct URL (radio stream, mp3 URL, …):

```js
await tg.join(chatId, { kind: 'url', url: 'https://example.com/stream.mp3' });
```

Custom shell (pipes s16le 48 kHz stereo PCM to stdout):

```js
await tg.join(chatId, {
  kind: 'shell',
  command: 'ffmpeg -i song.flac -loglevel panic -f s16le -ac 2 -ar 48000 pipe:1',
});
```

Events:

```js
tg.on('streamEnd', async ({ chatId, source, willAutoLeave }) => {
  // play next track via tg.setSource(chatId, …) or let auto-leave happen
});
tg.on('connectionChange', (chatId, state) => { /* CONNECTING/CONNECTED/… */ });
```

## API

| Method | Description |
|---|---|
| `join(chat, source, opts?)` | Join VC + start streaming. `source`: `{kind:'file'\|'url'\|'shell', …}`. Opts: `muted`, `autoLeave` (default true), `allowCreate`, `inviteHash`, `video` (share video from the same source; `{width,height,fps}` or `false`). |
| `joinYouTube(chat, url, opts?)` | Resolve via yt-dlp then `join`. |
| `joinIdle(chat, opts?)` | Join with no media. If `allowCreate: true` creates a missing call, it requests RTMP-stream mode; an existing call is not converted. |
| `startPresentation(chat, source, video?)` | Screen share: join the presentation channel with a file/url video source. |
| `stopPresentation(chat)` | Leave the presentation channel (call stays). |
| `setSource(chat, source)` | Swap audio of an active call without leaving (queue). |
| `leave(chat)` | `ntgcalls.stop` + `phone.leaveGroupCall` (best-effort both). |
| `dispose()` | Stop active calls and detach MTProto update handlers; `await` it before disposing the MTProto client. |
| `pause / resume / mute / unmute(chat)` | Native media controls (returns bool). |
| `time(chat)` | Seconds streamed. |
| `activeCalls() / getCall(chat) / isActive(chat)` | Introspection. |
| `on('streamEnd' \| 'connectionChange' \| 'update', cb)` | Events. |
| `resolveChatId(chat)` | username / t.me link / id → marked id. |

`join`, `joinIdle`, `resolveChatId`, and asynchronous control methods accept a marked id (`-100…`), username or t.me link. Synchronous `getCall()` and `isActive()` accept numeric ids or aliases previously resolved by this client (for example, an alias used to join the call). `activeCalls()` always returns marked ids.

## How it works

```
channels.getFullChannel ──► full_chat.call (InputGroupCall)
ntgcalls.createCall ──────► native join params (JSON: ufrag/pwd/fp/ssrc)
ntgcalls.setStreamSources ─ ffmpeg/yt-dlp PCM source (SHELL)
phone.joinGroupCall ──────► UpdateGroupCallConnection.params (native connect JSON)
ntgcalls.connect ─────────► WebRTC → Telegram media servers
```

The connect params from Telegram are passed through to the native core
verbatim — no re-shaping. Our audio SSRC for `phone.leaveGroupCall` comes from
the join params generated by `ntgcalls.createCall`.

## Caveats

- `ntgcalls` is pinned to an exact `3.0.x` version (currently 3.0.6; the 3.x line is still young — the API may shift upstream).
- When using both `telegram` (GramJS) and `teleproto` in one process, pass the matching `Api` namespace to each `TgCallsClient` to avoid ambiguous automatic detection. `mtcute` uses its own TL schema and does not need `Api`.
- `process.exit()` right after using the native lib can abort during WebRTC
  teardown (cosmetic; long-running bots are unaffected).
- Video: pass `video: {width, height, fps}` to `join()` to stream video from the same file/URL. Set `presentation: true` to use the presentation channel, or call `startPresentation()` for an active call. Presentation requires an RTC connection and is unavailable on UDP-blocked hosts in RTMP/STREAM modes.

## License

MIT for this wrapper. [`ntgcalls`](https://github.com/pytgcalls/ntgcalls) is
LGPL-3.0 (its own repo, installed as a dependency).
