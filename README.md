# tgcalls-js

**pytgcalls-style Telegram group call wrapper for Node.js** — stream audio into
Telegram voice chats using any GramJS-family MTProto client (GramJS `telegram`,
`teleproto`, …) on top of the official [`ntgcalls`](https://www.npmjs.com/package/ntgcalls)
native binding (C++ WebRTC core by the pytgcalls team, prebuilt binaries, no compiling).

Status: v0.2.0 — audio + video + screen share (presentation). The live smoke-test example uses teleproto 1.229.

## Install

```bash
npm install tgcalls-js
# or use the git repo directly:
npm install github:kotakbiasa/tgcalls-js
```

`ntgcalls` ships prebuilt native binaries for Linux x64/arm64, macOS arm64 and
Windows x64 — no compiler needed. You also need `ffmpeg` on PATH (and
`yt-dlp` only if you use `joinYouTube`).

## Quick start (GramJS)

```js
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { TgCallsClient } from 'tgcalls-js';

const client = new TelegramClient(new StringSession(SESSION), API_ID, API_HASH, {});
await client.connect();

const tg = new TgCallsClient({ client });

await tg.join(-1001234567890, { kind: 'file', path: './song.mp3' });
console.log('streaming…');

// later:
await tg.pause(chatId);
await tg.resume(chatId);
await tg.mute(chatId);
await tg.setSource(chatId, { kind: 'file', path: './next.mp3' }); // queue, no rejoin
await tg.leave(chatId);
```

### Live smoke test with teleproto

The repository includes [`examples/file-teleproto.ts`](examples/file-teleproto.ts)
for testing with a real user session. Install the dependencies and copy
`.env.example` to `.env`:

```bash
npm install
cp .env.example .env
```

On Windows PowerShell, use `Copy-Item .env.example .env` for the second command.
Fill `API_ID` and `API_HASH` in `.env` (create an application at
https://my.telegram.org/apps), then start QR login:

```bash
npm run auth:qr
```

Open the generated `.qr-login.png` immediately and scan it in Telegram under
**Settings → Devices → Link Desktop Device**. The image is refreshed when the
login QR expires. After login, the script saves the session into the
git-ignored `.env` without printing it. Set `CHAT_ID` and `FILE` there, then
run:

```bash
npx tsx examples/file-teleproto.ts
```

By default, the example streams audio only. To stream video from the same file,
set these optional values in `.env`:

```dotenv
VIDEO=true
PRESENTATION=false
VIDEO_WIDTH=854
VIDEO_HEIGHT=480
VIDEO_FPS=30
```

`PRESENTATION=true` uses Telegram's presentation channel instead of camera
video. 854×480 at 30 FPS played smoothly in the live smoke test; higher
resolutions can require more CPU and bandwidth. Adjust the size
and frame rate for your device and connection. The example joins the active
voice chat, streams the selected file, and leaves when playback ends or you
press Ctrl+C. Keep the session string out of source control.

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
| `joinIdle(chat, opts?)` | Join with no media — stable idle presence (RTMP-stream mode). |
| `startPresentation(chat, source, video?)` | Screen share: join the presentation channel with a file/url video source. |
| `stopPresentation(chat)` | Leave the presentation channel (call stays). |
| `setSource(chat, source)` | Swap audio of an active call without leaving (queue). |
| `leave(chat)` | `ntgcalls.stop` + `phone.leaveGroupCall` (best-effort both). |
| `pause / resume / mute / unmute(chat)` | Native media controls (returns bool). |
| `time(chat)` | Seconds streamed. |
| `activeCalls() / getCall(chat) / isActive(chat)` | Introspection. |
| `on('streamEnd' \| 'connectionChange' \| 'update', cb)` | Events. |
| `resolveChatId(chat)` | username / t.me link / id → marked id. |

`chat` can be a marked id (`-100…`), username or t.me link.

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

- `ntgcalls` is pinned to `3.0.0-rc02` (RC — API may shift upstream).
- `process.exit()` right after using the native lib can abort during WebRTC
  teardown (cosmetic; long-running bots are unaffected).
- Video: pass `video: {width, height, fps}` to `join()` to stream video from the same file/URL. Set `presentation: true` to send it through the presentation channel, or use `startPresentation()` for an active call. Presentation requires an RTC connection; it is unavailable on UDP-blocked hosts in RTMP/STREAM modes.

## License

MIT for this wrapper. [`ntgcalls`](https://github.com/pytgcalls/ntgcalls) is
LGPL-3.0 (its own repo, installed as a dependency).
