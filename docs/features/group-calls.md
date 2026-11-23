# Group Voice & Video Calls

`tgcalls-js` streams audio, camera video, and screen presentations into Telegram group voice chats and channel livestreams using `ntgcalls` (native WebRTC) and your MTProto client (`teleproto`, `telegram`/GramJS, or `@mtcute/node`).

## Audio Sources (`AudioSource`)

Every call method (`join`, `play`, `enqueue`, `setSource`, `listenCalls`, `createConference`) accepts an `AudioSource`:

| `kind` | Shape | Requirements | Best for |
|---|---|---|---|
| `'file'` | `{ kind: 'file', path: string }` | `ffmpeg` | Local `.mp3`, `.ogg`, `.wav`, `.mp4`, `.mkv`, etc. |
| `'url'` | `{ kind: 'url', url: string, audioUrl?: string }` | `ffmpeg` | Direct HTTP/HTTPS media, HLS (`.m3u8`), icecast/radio streams, split video+audio URLs |
| `'shell'` | `{ kind: 'shell', command: string }` | Custom CLI | Any command outputting raw `s16le` 48 kHz stereo PCM to stdout |
| `'external'` | `{ kind: 'external', sampleRate?: number, channels?: 1 \| 2, keepOpen?: boolean }` | **None** (no `ffmpeg`) | Voice AI agents, TTS/STT pipelines, real-time programmatic PCM/I420 frames |

## Joining a Group Call

```ts
// 1. Stream a local audio file
await tg.join('@mygroup', { kind: 'file', path: './song.mp3' });

// 2. Join as a channel alias and create the voice chat if missing (requires admin)
await tg.join('@mygroup', { kind: 'file', path: './song.mp3' }, {
  allowCreate: true,
  joinAs: '@mychannel',
  autoLeave: false,
});

// 3. Join via invite link hash
await tg.join(-1001234567890n, { kind: 'url', url: 'https://stream.example.com/live.m3u8' }, {
  inviteHash: 'AbCdEf123456',
});
```

### `JoinOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `muted` | `boolean` | `false` | Join with microphone muted |
| `paused` | `boolean` | `false` | Pause native capture before connecting transport |
| `autoLeave` | `boolean` | `true` | Automatically leave when audio/video ends (suppressed if a `streamEnd` listener is registered) |
| `allowCreate` | `boolean` | `false` | Create a voice chat if none is active (requires admin rights) |
| `inviteHash` | `string` | — | Invite hash when joining via a call invite link |
| `joinAs` | `ChatRef` | self | Peer identity to join as (e.g., `@mychannel`, numeric ID, or `bigint`) |
| `video` | `VideoOptions \| false` | — | Share camera video from the same `file`/`url` source |
| `presentation` | `boolean` | `false` | Share video on the screen-share (presentation) channel instead of camera |

## Video & Screen Sharing (Presentation)

Video dimensions and frame rate are automatically probed with `ffprobe` and clamped to your target `VideoOptions` (or `VideoQuality` presets).

```ts
import { VideoQuality } from 'tgcalls-js';

// Camera video at 720p30
await tg.join('@mygroup', { kind: 'file', path: './movie.mp4' }, {
  video: VideoQuality.HD_720p,
});

// Screen share (presentation channel) from the start
await tg.join('@mygroup', { kind: 'file', path: './slides.mp4' }, {
  presentation: true,
  video: { width: 1280, height: 720, fps: 25 },
});

// Or toggle screen share mid-call
await tg.startPresentation('@mygroup', { kind: 'file', path: './demo.mp4' }, VideoQuality.HD_720p);
await tg.stopPresentation('@mygroup'); // call stays open
```

### `VideoQuality` Presets

| Preset | Resolution | FPS |
|---|---|---|
| `VideoQuality.UHD_4K` | `3840 × 2160` | `60` |
| `VideoQuality.QHD_2K` | `2560 × 1440` | `60` |
| `VideoQuality.FHD_1080p` | `1920 × 1080` | `60` |
| `VideoQuality.HD_720p` | `1280 × 720` | `30` |
| `VideoQuality.SD_480p` | `854 × 480` | `30` |
| `VideoQuality.SD_360p` | `640 × 360` | `30` |

> **Note:** `ntgcalls` cannot mix `camera` and `screen` simultaneously on the same call; `startPresentation()` replaces the camera channel with the screen channel while keeping audio active.

## YouTube & `yt-dlp` Streams

```ts
// Audio only
await tg.joinYouTube('@mygroup', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');

// Video + Audio (automatically resolves split high-res video + audio streams)
await tg.joinYouTube('@mygroup', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
  video: VideoQuality.HD_720p,
});

// Resolve a URL manually without joining
const directUrl = await tg.resolveYouTube('https://www.youtube.com/watch?v=dQw4w9WgXcQ', false);
```

## Idle Presence (`joinIdle`)

Join a voice chat without streaming any media — useful for recording-only bots, participant monitors, or standby assistants:

```ts
await tg.joinIdle('@mygroup');

// Create a missing call in RTMP-stream mode so idle presence survives UDP-blocked hosts
await tg.joinIdle('@mygroup', { allowCreate: true });
```

## Lifecycle & Introspection

```ts
tg.activeCalls();                  // bigint[] of marked chat IDs
tg.isActive('@mygroup');           // boolean (sync, after alias resolved)
tg.getCall('@mygroup');            // ActiveCall | null
await tg.time('@mygroup');         // seconds streamed so far
await tg.getConnectionMode('@mygroup'); // 'RTC' | 'STREAM' | 'RTMP' | 'NONE' | null
await tg.leave('@mygroup');        // stop native + phone.leaveGroupCall
await tg.dispose();                // cleanly tear down all calls, listeners, and publishers
```
