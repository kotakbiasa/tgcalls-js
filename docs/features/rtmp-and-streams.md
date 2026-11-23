# RTMP Streaming & Broadcast Viewer

`tgcalls-js` supports both sides of Telegram channel/group livestreams:

1. **RTMP Publisher (`joinRtmp`)** — encode and push H.264/AAC FLV streams via `ffmpeg` to Telegram's RTMP/RTMPS ingest endpoint (with queueing, hold tracks, reconnect, and POSIX pause/resume).
2. **Broadcast / Stream Viewer (`joinStreamMode`)** — join an active Telegram RTMP/STREAM broadcast, download HLS/broadcast segments from the exact media DC, and feed them to `ntgcalls` for decoding.

## Publishing to RTMP (`joinRtmp`)

```ts
// 1. Fetch the chat's RTMP URL and stream key without revoking the existing key.
// SECURITY: Never log `endpoint.key`!
const endpoint = await tg.getStreamRtmpUrl('@mychannel');

// 2. Prepare the publisher (allowCreate: true creates a missing RTMP livestream;
//    it will NOT convert an existing regular RTC voice chat).
const publisher = await tg.joinRtmp('@mychannel', endpoint.url, endpoint.key, {
  allowCreate: true,
  reconnect: { maxAttempts: 5, maxDelayMs: 10_000, baseDelayMs: 500 },
  onStateChange: (state) => console.log('RTMP state:', state),
  onError: (err) => console.error('RTMP error:', err.message),
});

// 3. Start encoding and uploading
await publisher.play({ kind: 'file', path: './clip1.mp4' }, {
  width: 1280,
  height: 720,
  fps: 30,
});

// 4. Queue next videos and an optional hold loop
publisher.queue({ kind: 'file', path: './clip2.mp4' });
publisher.hold({ kind: 'file', path: './brb-loop.mp4' });

await publisher.skip();   // jump to clip2.mp4
await publisher.pause();  // POSIX SIGSTOP (Linux/macOS only)
await publisher.resume(); // POSIX SIGCONT
await publisher.stop();   // stop ffmpeg, clear playlist
await publisher.close();  // permanently close publisher
```

### `joinRtmp` Options

| Option | Type | Default | Description |
|---|---|---|---|
| `allowCreate` | `boolean` | `false` | Create a new RTMP stream call if none exists (refuses to convert an active RTC voice chat) |
| `source` | `AudioSource` | — | Optional initial `file`/`url` source to start playing immediately |
| `video` | `VideoOptions` | — | Target resolution/fps for the initial `source` |
| `ffmpegPath` | `string` | inherited | Override `ffmpeg` binary |
| `readyTimeoutMs` | `number` | `15000` | Max ms to wait for `ffmpeg` encoder progress before failing `play()` |
| `stopTimeoutMs` | `number` | `2000` | Graceful termination timeout before `SIGKILL` |
| `reconnect` | `{ maxAttempts, maxDelayMs, baseDelayMs? }` | — | Exponential backoff reconnect config (restarts current track from beginning) |
| `onStateChange` | `(state: RtmpPublisherState) => void` | — | Callback for state transitions |
| `onError` | `(error: RtmpPublisherError) => void` | — | Callback for encoder/network errors (stream key is redacted automatically) |

### `RtmpPublisher` States & Methods

- **States:** `'ready' | 'starting' | 'publishing' | 'reconnecting' | 'paused' | 'stopped' | 'failed'`
- **Methods:** `play(source, video?)`, `queue(source, video?)`, `hold(source | null, video?)`, `skip()`, `pause()`, `resume()`, `stop()`, `close()`
- **Sources:** Accepts `'file'` and `'url'`. Raw PCM `'shell'` and `'external'` sources are rejected because RTMP requires container/video framing.
- **Cleanup:** Calling `tg.leave(chat)` or `tg.dispose()` automatically closes owned publishers.

## Viewing a Livestream (`joinStreamMode`)

```ts
tg.on('broadcastError', (chatId, err) => {
  console.error('Broadcast segment error:', chatId, err);
});

const viewer = await tg.joinStreamMode('@mychannel', {
  requireStream: true, // reject if Telegram returns RTC instead of STREAM/RTMP
});

console.log('Connected mode:', viewer.mode); // 'RTMP' | 'STREAM' (or 'RTC' if requireStream: false)

// Optionally receive decoded PCM audio frames from the broadcast
const off = await tg.onAudioFrame('@mychannel', (frame) => {
  // frame.pcm: Buffer (s16le 48kHz mono)
});

await tg.leave('@mychannel');
```

### How `joinStreamMode` Works

1. Joins muted using the native `ntgcalls` payload.
2. Reads the connection JSON returned by Telegram (`mode: 'RTMP' | 'STREAM' | 'RTC'`).
3. If `requireStream !== false` (the default) and Telegram selected `'RTC'`, it rolls back and throws. Set `{ requireStream: false }` to allow RTC fallback.
4. Downloads broadcast segments from the exact `streamDcId` media DC and forwards them to `ntgcalls` via `sendBroadcastPart` / `sendBroadcastTimestamp`.
5. Automatically handles segment rejoin recovery and surfaces download failures via the `broadcastError` event.
