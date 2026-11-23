# RTMP Streaming & Broadcast Viewer

Telegram channels and supergroups support **RTMP/STREAM livestreams** (the same mode used by OBS Studio) for broadcasting high-bitrate H.264/AAC video to thousands of viewers. `tgcalls-js` supports **both** roles:

1. **RTMP Publisher (`joinRtmp`)** — fetches your chat's RTMP ingest URL/key and pushes an H.264/AAC FLV stream via `ffmpeg`, complete with playlist queue, hold loops, exponential-backoff reconnect, and secret redaction.
2. **Broadcast / Stream Viewer (`joinStreamMode`)** — joins an active Telegram livestream as a viewer, downloads broadcast segments from the exact media DC (`streamDcId`), and feeds them into `ntgcalls` for decoding.

---

## Publishing an RTMP Livestream (`joinRtmp`)

### How It Works

1. `getStreamRtmpUrl(chat)` calls Telegram's `phone.getGroupCallStreamRtmpUrl` with `revoke: false` so your existing stream key is **not** invalidated.
2. `joinRtmp(chat, url, key, options)` verifies the group call exists (or creates a new RTMP stream call when `allowCreate: true`) and refuses to touch an existing regular RTC voice chat.
3. `publisher.play(source, video)` spawns `ffmpeg` directly (without a shell) encoding H.264 video + AAC audio into an FLV muxer targeting `url/key`.
4. `play()` resolves only after `ffmpeg` reports actual encoder progress (bounded by `readyTimeoutMs`, default `15000` ms).
5. All error messages automatically **redact** the stream key and full RTMP URL so secrets never leak into logs.

### Complete Publisher Example

```ts
// 1. Fetch RTMP URL & key (never log `endpoint.key`!)
const endpoint = await tg.getStreamRtmpUrl('@mychannel');

// 2. Prepare the publisher (does not start encoding until play() or options.source)
const publisher = await tg.joinRtmp('@mychannel', endpoint.url, endpoint.key, {
  allowCreate: true, // creates a missing RTMP livestream; refuses existing RTC calls
  readyTimeoutMs: 15_000,
  reconnect: {
    maxAttempts: 5,
    baseDelayMs: 500,
    maxDelayMs: 10_000,
  },
  onStateChange: (state) => console.log('[RTMP] state:', state),
  onError: (err) => console.error('[RTMP] error:', err.message),
});

// 3. Start streaming first video
await publisher.play({ kind: 'file', path: './episode1.mp4' }, {
  width: 1280,
  height: 720,
  fps: 30,
});

// 4. Queue upcoming videos & a standby loop
publisher.queue({ kind: 'file', path: './episode2.mp4' }, { width: 1280, height: 720, fps: 30 });
publisher.hold({ kind: 'file', path: './be-right-back.mp4' });

// 5. Runtime controls
await publisher.skip();   // immediately switch to episode2.mp4
await publisher.pause();  // POSIX SIGSTOP (Linux/macOS only)
await publisher.resume(); // POSIX SIGCONT
await publisher.stop();   // stop ffmpeg & clear queue (publisher remains reusable)
await publisher.close();  // permanently close publisher
```

### `joinRtmp` & `RtmpPublisherOptions`

| Option | Type | Default | Detailed Behavior |
|---|---|---|---|
| `allowCreate` | `boolean` | `false` | Creates a missing RTMP stream call (requires admin rights). Never converts an active regular RTC voice chat. |
| `source` | `AudioSource` | — | Optional initial `'file'` or `'url'` source to start playing immediately. |
| `video` | `VideoOptions` | — | Target `{ width, height, fps }` for the initial `source`. |
| `ffmpegPath` | `string` | inherited | Override `ffmpeg` binary path. |
| `readyTimeoutMs` | `number` | `15000` | Maximum time to wait for `ffmpeg` encoder progress before rejecting `play()`. |
| `stopTimeoutMs` | `number` | `2000` | Wait time for graceful `SIGTERM` exit before sending `SIGKILL`. |
| `reconnect` | `{ maxAttempts, maxDelayMs, baseDelayMs? }` | — | Retries dropped uploads with exponential backoff (`maxAttempts`: `0`–`100`). Restarts the current source from its beginning. |
| `onStateChange` | `(state: RtmpPublisherState) => void` | — | Called on every state transition. |
| `onError` | `(error: RtmpPublisherError) => void` | — | Called on encoder or network failure (stream key is stripped). |

### Publisher State Machine

| State | Meaning |
|---|---|
| `'ready'` | Publisher initialized and idle |
| `'starting'` | `ffmpeg` spawned, waiting for encoder progress |
| `'publishing'` | Actively uploading frames to Telegram RTMP ingest |
| `'reconnecting'` | Upload dropped; waiting on backoff timer before retry |
| `'paused'` | `ffmpeg` suspended via POSIX `SIGSTOP` (long pauses may time out server-side) |
| `'stopped'` | Explicitly stopped; ready for a new `play()` call |
| `'failed'` | Retries exhausted or fatal error |

> **Supported sources:** Only `'file'` and `'url'` are accepted. Raw PCM `'shell'` and `'external'` sources are rejected with `RtmpPublisherError` because RTMP requires container/video framing. Calling `tg.leave(chat)` or `tg.dispose()` automatically closes owned publishers.

---

## Viewing a Livestream (`joinStreamMode`)

### How It Works

Telegram decides whether a participant joins via `RTC`, `STREAM`, or `RTMP` based on the call's server-side configuration (there is no MTProto flag that forces STREAM mode). When you call `joinStreamMode(chat)`:

1. `tgcalls-js` fetches the active `InputGroupCall` and its media `streamDcId`.
2. It joins muted with the native `ntgcalls` payload and inspects the server's connection JSON (`{ stream?: boolean, rtmp?: boolean }`).
3. If Telegram selected `'RTC'` and `requireStream` is `true` (default), `tgcalls-js` rolls back (`leaveGroupCall` + `ntgcalls.stop`) and throws. Pass `{ requireStream: false }` to allow RTC fallback.
4. For `'STREAM'` / `'RTMP'`, `BroadcastController` listens to `ntgcalls` callbacks (`requestBroadcastPart`, `requestBroadcastTimestamp`), downloads the exact segments from `streamDcId` via `upload.getFile`, and feeds them back via `sendBroadcastPart` / `sendBroadcastTimestamp`.
5. If Telegram rotates the stream or expires the session, `BroadcastController` performs an automatic rejoin recovery and surfaces errors on `tg.on('broadcastError', ...)`.

### Complete Viewer Example

```ts
tg.on('broadcastError', (chatId, err) => {
  console.error(`[${chatId}] broadcast download/recovery error:`, err);
});

const viewer = await tg.joinStreamMode('@mychannel', {
  requireStream: true, // set false to allow RTC fallback
});

console.log('Viewing mode:', viewer.mode); // 'RTMP' | 'STREAM'

// Consume decoded live PCM audio from the livestream
const off = await tg.onAudioFrame('@mychannel', (frame) => {
  // frame.pcm: raw s16le 48kHz mono PCM Buffer
  audioSink.write(frame.pcm);
});

// Leave cleanly
off();
await tg.leave('@mychannel');
```
