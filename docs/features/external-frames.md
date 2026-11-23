# Voice AI & External Frame Bridge

`tgcalls-js` supports **zero-ffmpeg, real-time bidirectional PCM audio and raw I420 video** via `ntgcalls`'s `MediaSource.EXTERNAL` — designed for Voice AI agents (Gemini Live, OpenAI Realtime, Whisper/Deepgram STT + ElevenLabs/Cartesia TTS), custom DSP pipelines, and live synthesized video.

## End-to-End Voice AI Example

```ts
import { TgCallsClient } from 'tgcalls-js';

// 1. Join a group call (or P2P call / conference) with { kind: 'external' }
await tg.join('@mygroup', {
  kind: 'external',
  sampleRate: 48000,
  channels: 1,
  keepOpen: true,
});

// 2. Receive decoded remote s16le PCM frames in real time
const unsubscribe = await tg.onAudioFrame('@mygroup', (frame) => {
  // frame: { ssrc: number, pcm: Buffer, timestampMs: bigint, peer?: PeerIdentity }
  sttStream.write(frame.pcm);
}, {
  sampleRate: 48000,
  channels: 1,
});

// 3. Push synthesized TTS PCM audio back into the call
// Arbitrary buffer sizes are automatically sliced into 10ms WebRTC frames!
ttsStream.on('data', async (pcmChunk: Buffer) => {
  await tg.pushAudioFrame('@mygroup', pcmChunk, {
    sampleRate: 48000,
    channels: 1,
  });
});

// Cleanup
unsubscribe();
await tg.leave('@mygroup');
```

## Supported Call Types

The external frame bridge works identically across all three call modes:

- **Group Voice Chats:** `tg.join(chat, { kind: 'external' })`
- **1-on-1 P2P Calls:** `tg.listenCalls({ source: { kind: 'external' } })` + `tg.callUser(peer)`
- **E2E Conferences:** `tg.createConference({ source: { kind: 'external' } })` (pass `ConferenceHandle` directly to `onAudioFrame` / `pushAudioFrame` / `pushVideoFrame`)

## API Reference

### `{ kind: 'external' }` Source Options

| Field | Type | Default | Description |
|---|---|---|---|
| `kind` | `'external'` | required | Selects `MediaSource.EXTERNAL` (no `ffmpeg` required) |
| `sampleRate` | `number` | `48000` | Capture sample rate in Hz (`8000`–`192000`) |
| `channels` | `1 \| 2` | `1` | Mono (`1`) or stereo (`2`) |
| `keepOpen` | `boolean` | `true` | Keep stream open between silence/bursts |

### `onAudioFrame(chat | handle, handler, options?)`

Subscribes to incoming decoded `s16le` PCM frames from remote speakers. For active group calls without an active recorder, it configures `StreamMode.PLAYBACK` automatically. Returns an unsubscribe function `() => void`.

**Options (`ExternalAudioSinkOptions`):**

| Field | Type | Default | Description |
|---|---|---|---|
| `sampleRate` | `number` | `48000` | Output PCM sample rate |
| `channels` | `1 \| 2` | `1` | Mono (`1`) or stereo (`2`) |

**Callback payload (`ExternalAudioFrame`):**

| Field | Type | Description |
|---|---|---|
| `ssrc` | `number` | Unsigned 32-bit SSRC (`0` for P2P calls) |
| `pcm` | `Buffer` | Raw signed 16-bit little-endian (`s16le`) PCM bytes |
| `timestampMs` | `bigint` | Capture timestamp in ms from `ntgcalls` |
| `peer` | `PeerIdentity \| undefined` | Attributed speaker identity when group participant tracking is active |

### `pushAudioFrame(chat | handle, pcm, options?)`

Pushes signed 16-bit little-endian (`s16le`) PCM audio into the active `EXTERNAL` capture stream. Automatically converts `Uint8Array`/`Buffer` across the `ntgcalls` N-API JS-array boundary and slices large buffers into 10 ms WebRTC frames (`(sampleRate / 100) * channels * 2` bytes, zero-padding the final tail frame).

**Options (`PushAudioOptions`):**

| Field | Type | Default | Description |
|---|---|---|---|
| `device` | `'microphone' \| 'speaker'` | `'microphone'` | Target capture device |
| `sampleRate` | `number` | `48000` | Sample rate used for 10 ms frame slicing |
| `channels` | `1 \| 2` | `1` | Channel count (`pcm.byteLength` must be aligned to `channels * 2`) |
| `chunk10ms` | `boolean` | `true` | Slice buffers into 10 ms frames with monotonic timestamps |
| `timestampMs` | `bigint` | `BigInt(Date.now())` | Starting capture timestamp in ms |

### `pushVideoFrame(chat | handle, i420, options)`

Pushes a raw planar **YUV420p (I420)** video frame into an active `EXTERNAL` `camera` or `screen` capture stream.

**Options (`PushVideoOptions`):**

| Field | Type | Default | Description |
|---|---|---|---|
| `width` | `number` | required | Positive even integer (`i420.byteLength` must equal `width * height * 3 / 2`) |
| `height` | `number` | required | Positive even integer |
| `device` | `'camera' \| 'screen'` | `'camera'` | Target video device |
| `rotation` | `0 \| 90 \| 180 \| 270` | `0` | Video rotation in degrees |
| `timestampMs` | `bigint` | `BigInt(Date.now())` | Capture timestamp in ms |

```ts
// Push a 640x360 I420 frame (345,600 bytes)
await tg.pushVideoFrame('@mygroup', i420Buffer, {
  width: 640,
  height: 360,
  device: 'camera',
  rotation: 0,
});
```
