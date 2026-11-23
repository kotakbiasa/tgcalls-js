# Group Voice & Video Calls

`tgcalls-js` lets a Node.js process join Telegram group voice chats and channel livestreams to stream audio, camera video, or screen-share presentations. Under the hood, it coordinates two layers:

1. **MTProto signaling** (via `teleproto`, `telegram`/GramJS, or `@mtcute/node`) — resolves chats, fetches or creates the `InputGroupCall`, sends `phone.joinGroupCall`, and listens for `UpdateGroupCallConnection`.
2. **Native WebRTC media engine** (`ntgcalls`) — handles ICE/DTLS/SRTP transport, Opus/H.264 encoding, and media pipelines via `ffmpeg` (or raw programmatic frames with `{ kind: 'external' }`).

> **Why a user account is required:** Telegram's MTProto API does not allow bot tokens (`@BotFather`) to join group voice chats. You must authenticate with a regular Telegram user account (StringSession in `teleproto`/GramJS or SQLite storage in `mtcute`).

---

## How the Join Flow Works

When you call `tg.join(chat, source, options)`, `tgcalls-js` executes the following sequence atomically (and automatically cleans up native + MTProto state if any step fails):

1. **Resolve chat:** Converts `@username`, `t.me/...` link, numeric ID, or `bigint` into a marked channel/supergroup ID (`-100...`) and caches the alias for synchronous lookups (`isActive`, `getCall`).
2. **Fetch or create group call:** Calls `channels.getFullChannel` (or `messages.getFullChat`) to retrieve the active `InputGroupCall`. If none exists and `allowCreate: true` is passed (requires group admin rights), it creates one via `phone.createGroupCall`. Otherwise, it throws `NoVoiceChatError`.
3. **Allocate native call:** Calls `ntgcalls.createCall(chatId)` once to generate the WebRTC SDP/SSRC JSON payload.
4. **Configure capture sources:** Probes video metadata (if `video` is enabled) and calls `ntgcalls.setStreamSources(chatId, StreamMode.CAPTURE, ...)` before joining so media begins flowing immediately upon connection.
5. **Join via MTProto:** Calls `phone.joinGroupCall` with the native payload and waits for `UpdateGroupCallConnection` containing Telegram's WebRTC connection parameters.
6. **Connect transport:** Passes the connection parameters to `ntgcalls.connect(chatId, connParams, false)`. If `presentation: true`, it also initializes and connects the screen-share presentation channel.

---

## Accepted Chat References (`ChatRef`)

All **async** methods (`join`, `play`, `leave`, `pause`, etc.) accept any of these formats:

| Format | Example | Notes |
|---|---|---|
| Marked `bigint` | `-1001234567890n` | Fastest — no entity resolution RPC needed |
| Marked `number` | `-1001234567890` | Converted to `bigint` automatically |
| Username | `'@mygroup'` or `'mygroup'` | Resolved via MTProto and cached in memory |
| Invite / public link | `'https://t.me/mygroup'` | Normalized and cached |

> **Synchronous introspection (`isActive`, `getCall`, `getCurrent`, `getQueue`):** Works immediately with numeric/`bigint` IDs, or with `@username` / `t.me` links that have already been resolved by this `TgCallsClient` instance.

---

## Audio Sources (`AudioSource`) in Detail

Every call method accepts one of four `AudioSource` types:

### 1. Local File (`{ kind: 'file', path }`)

Reads any audio or video container supported by `ffmpeg` (`.mp3`, `.ogg`, `.opus`, `.wav`, `.flac`, `.m4a`, `.mp4`, `.mkv`, `.webm`).

```ts
await tg.join('@mygroup', {
  kind: 'file',
  path: './media/podcast.mp3',
});
```

`ffmpeg` automatically decodes and resamples audio to **48 kHz, 16-bit signed little-endian (`s16le`) stereo PCM** for `ntgcalls`.

### 2. Direct Media URL (`{ kind: 'url', url, audioUrl? }`)

Streams directly from HTTP/HTTPS URLs, HLS playlists (`.m3u8`), Icecast/Shoutcast radio streams, or CDN links.

```ts
// Single URL (audio-only or muxed video+audio)
await tg.join('@mygroup', {
  kind: 'url',
  url: 'https://stream.example.com/radio/live.m3u8',
});

// Split video + audio URLs (e.g., high-resolution DASH/YouTube streams)
await tg.join('@mygroup', {
  kind: 'url',
  url: 'https://cdn.example.com/video-1080p.mp4',
  audioUrl: 'https://cdn.example.com/audio-best.m4a',
}, {
  video: { width: 1280, height: 720, fps: 30 },
});
```

When `audioUrl` is provided, `url` is fed to the video encoder and `audioUrl` is fed to the audio decoder independently.

### 3. Custom Shell Command (`{ kind: 'shell', command }`)

Runs any shell command whose **stdout** outputs raw **48 kHz, 2-channel (stereo), `s16le` PCM**. Useful for custom audio pipelines, synthesizers, or tools like `sox`, `gst-launch-1.0`, or custom `ffmpeg` filter graphs.

```ts
// Generate a 440 Hz sine wave directly via ffmpeg
await tg.join('@mygroup', {
  kind: 'shell',
  command: 'ffmpeg -f lavfi -i sine=frequency=440:sample_rate=48000 -f s16le -ac 2 -ar 48000 pipe:1',
});
```

> **Note:** Shell sources are audio-only (cannot be combined with `video` or `presentation`).

### 4. Real-Time External Frames (`{ kind: 'external' }`)

Bypasses `ffmpeg` completely and configures `ntgcalls` with `MediaSource.EXTERNAL`. You push raw PCM audio frames via `pushAudioFrame()` and/or raw I420 video frames via `pushVideoFrame()`. See [Voice AI & External Frame Bridge](external-frames.md) for full details.

---

## Join Options (`JoinOptions`)

| Option | Type | Default | Detailed Behavior |
|---|---|---|---|
| `muted` | `boolean` | `false` | Calls `ntgcalls.mute()` before connecting and sets `muted: true` in `phone.joinGroupCall`. |
| `paused` | `boolean` | `false` | Calls `ntgcalls.pause()` before connecting so media waits until you call `resume()`. |
| `autoLeave` | `boolean` | `true` | Automatically calls `leave()` when playback finishes. Automatically disabled if you register any `streamEnd` event listener, or if a playlist queue/hold track is active. |
| `allowCreate` | `boolean` | `false` | If the chat has no active voice chat, creates one via `phone.createGroupCall`. Requires admin permissions in the group/channel. |
| `inviteHash` | `string` | — | Required when joining a private voice chat via a call invite link (`?videochat=<hash>`). |
| `joinAs` | `ChatRef` | self | Join as a different peer identity (for example, a channel you own: `joinAs: '@mychannel'`). |
| `video` | `VideoOptions \| false` | — | Enables camera video from the same `file` or `url` source. Pass `VideoQuality.*` or custom `{ width, height, fps }`. |
| `presentation` | `boolean` | `false` | Sends video on Telegram's **screen-share** channel instead of the camera channel. |

---

## Video & Screen Sharing (Presentation)

### Automatic Probing & Scaling

When you pass `video: { width, height, fps }`, `tgcalls-js` runs `ffprobe` on the input media to read its native resolution and frame rate:

- It preserves aspect ratio and scales down to fit your target bounds (controlled by `adjustByHeight`, default `true`, matching `pytgcalls`).
- If `ffprobe` cannot read the stream metadata (e.g., some live streams), it falls back to `640×360 @ 25 fps` or your explicit `VideoOptions`.

### `VideoQuality` Presets

| Preset | Resolution | FPS | Recommended Use |
|---|---|---|---|
| `VideoQuality.UHD_4K` | `3840 × 2160` | `60` | High-bandwidth server streaming |
| `VideoQuality.QHD_2K` | `2560 × 1440` | `60` | Desktop/gaming streams |
| `VideoQuality.FHD_1080p` | `1920 × 1080` | `60` | Crisp 1080p video playback |
| `VideoQuality.HD_720p` | `1280 × 720` | `30` | Best balance of quality and CPU |
| `VideoQuality.SD_480p` | `854 × 480` | `30` | Low-CPU / VPS streaming |
| `VideoQuality.SD_360p` | `640 × 360` | `30` | Minimal bandwidth / mobile |

### Camera vs Presentation (Screen Share)

Telegram voice chats have two separate video channels per participant: **camera** and **presentation (screen share)**.

- `ntgcalls` cannot transmit `camera` and `screen` at the same time on the same call.
- Calling `startPresentation()` initializes the presentation channel (`phone.joinGroupCallPresentation`), replaces any active camera stream with the screen stream, and restarts audio in sync with it.
- Calling `stopPresentation()` tears down only the screen-share channel (`phone.leaveGroupCallPresentation`) while keeping you in the voice chat.

```ts
import { VideoQuality } from 'tgcalls-js';

// Join with camera video
await tg.join('@mygroup', { kind: 'file', path: './movie.mp4' }, {
  video: VideoQuality.HD_720p,
});

// Switch to screen share mid-call
await tg.startPresentation('@mygroup', { kind: 'file', path: './slides.mp4' }, VideoQuality.HD_720p);

// Turn off screen share (voice chat stays open)
await tg.stopPresentation('@mygroup');
```

---

## YouTube & `yt-dlp` Integration

`joinYouTube()` uses `yt-dlp` under the hood to extract direct media URLs:

- **Audio-only (`video` omitted):** Resolves the best audio stream URL and calls `join()`.
- **Video enabled (`video` or `presentation` set):** Calls `resolveYouTubeStreams()` to fetch **separate** high-resolution `bestvideo` + `bestaudio` URLs (avoiding YouTube's low-resolution pre-merged 360p fallback) and passes both `{ url, audioUrl }` to `join()`.

```ts
// Audio only
await tg.joinYouTube('@mygroup', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');

// 720p Video + Audio
await tg.joinYouTube('@mygroup', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
  video: VideoQuality.HD_720p,
});
```

---

## Idle Presence (`joinIdle`)

`joinIdle()` joins a voice chat **muted with no local media source** (`autoLeave: false`). This is ideal for:
- Recording-only bots (`joinIdle` → `startRecording`)
- Participant trackers (`joinIdle` → `getParticipants` / `remoteSourceChange`)
- Standby bots waiting for a command before calling `play()` or `setSource()`

```ts
await tg.joinIdle('@mygroup');
```

> **UDP-restricted hosts:** On servers where outbound UDP is blocked, a regular WebRTC join can be kicked by Telegram after ~25 seconds due to ICE timeout. When `joinIdle(chat, { allowCreate: true })` creates a **new** voice chat, it creates it in RTMP-stream mode so idle presence stays connected. Existing RTC voice chats are never converted.

---

## Events & Lifecycle Behavior

### `streamEnd` and `autoLeave`

When a file finishes playing:
- For **audio-only** calls, `streamEnd` fires when the audio stream ends.
- For **video+audio** calls, `tgcalls-js` waits until **both** `StreamType.AUDIO` and `StreamType.VIDEO` have ended so `streamEnd` is never fired twice or prematurely.
- If a playlist queue, loop mode, or hold track is configured, `tgcalls-js` automatically advances to the next track instead of leaving.
- Otherwise, if `autoLeave: true` **and** no `streamEnd` listener is registered, `tgcalls-js` automatically calls `leave(chatId)`.

```ts
tg.on('streamEnd', ({ chatId, source, willAutoLeave }) => {
  console.log(`Finished playing in ${chatId}`, { source, willAutoLeave });
});
```

### `connectionChange`

Reports native WebRTC connection state transitions (`ConnectionState` enum from `ntgcalls`):

| Value | Enum | Meaning |
|---|---|---|
| `1` | `CONNECTING` | ICE/DTLS handshake in progress |
| `2` | `CONNECTED` | Media transport established |
| `4` | `FAILED` | ICE/transport failed (triggers automatic cleanup) |
| `8` | `TIMEOUT` | Connection timed out |
| `16` | `CLOSED` | Call ended or disconnected (triggers automatic cleanup) |

When `CLOSED` or `FAILED` occurs, `tgcalls-js` automatically stops any active recordings, leaves the MTProto call, cleans up internal state, and then notifies your `connectionChange` listeners.

---

## Complete Runnable Example

```ts
import { TelegramClient } from 'teleproto';
import { StringSession } from 'teleproto/sessions/index.js';
import {
  TgCallsClient,
  VideoQuality,
  AlreadyInCallError,
  NoVoiceChatError,
} from 'tgcalls-js';

const client = new TelegramClient(
  new StringSession(process.env.TG_SESSION!),
  Number(process.env.TG_API_ID),
  process.env.TG_API_HASH!,
  { connectionRetries: 5 },
);

await client.connect();
const tg = new TgCallsClient({ client });

tg.on('connectionChange', (chatId, state) => {
  console.log(`[${chatId}] connection state:`, state);
});

tg.on('streamEnd', async ({ chatId, source }) => {
  console.log(`[${chatId}] finished:`, source);
  await tg.leave(chatId);
});

try {
  const result = await tg.join('@mygroup', { kind: 'file', path: './video.mp4' }, {
    video: VideoQuality.HD_720p,
    allowCreate: true,
    joinAs: '@mychannel',
  });
  console.log('Joined call:', result.chatId, 'ssrc:', result.ssrc);
} catch (err) {
  if (err instanceof AlreadyInCallError) {
    console.log('Already in call:', err.chatId);
  } else if (err instanceof NoVoiceChatError) {
    console.log('No active voice chat and allowCreate was false');
  } else {
    throw err;
  }
}

// Always dispose cleanly on exit so Telegram does not leave a ghost participant
process.once('SIGINT', async () => {
  await tg.dispose();
  await client.disconnect();
  process.exit(0);
});
```
