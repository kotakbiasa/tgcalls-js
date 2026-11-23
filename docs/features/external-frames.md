# Voice AI & External Frame Bridge

`tgcalls-js` provides a **zero-ffmpeg, low-latency, bidirectional audio & video frame bridge** built directly on `ntgcalls`'s `MediaSource.EXTERNAL`. This lets you connect Telegram calls directly to:

- **Voice AI models** — Gemini Live API, OpenAI Realtime API, or custom STT (Deepgram / Whisper) + LLM + TTS (ElevenLabs / Cartesia / Kokoro) pipelines.
- **Live audio synthesizers / DSP** — WebAudio, mixers, soundboards, or VoIP bridges.
- **Programmatic video** — canvas rendering, live charts, headless browser frames, or AI avatar video (raw planar I420).

---

## Why `{ kind: 'external' }`?

Traditional `ffmpeg` file/shell piping adds process startup latency, container buffering, and breaks when you need to interrupt or stream dynamic AI speech chunks in real time.

With `{ kind: 'external' }`:
- **No `ffmpeg` binary required** (zero child processes spawned).
- **Direct PCM push (`pushAudioFrame`)** — pass any `Buffer`/`Uint8Array` of `s16le` PCM; `tgcalls-js` automatically slices it into exact **10 ms WebRTC frames** and handles the `ntgcalls` N-API JS-array conversion.
- **Direct PCM receive (`onAudioFrame`)** — receive decoded remote `s16le` PCM frames tagged with `ssrc`, `timestampMs`, and `peer` (speaker identity in group calls).
- **Works everywhere** — Group Voice Chats, 1-on-1 P2P Calls, and E2E Conferences all use the exact same API.

---

## PCM Format Specification

| Parameter | Requirement | Notes |
|---|---|---|
| Encoding | **Signed 16-bit little-endian (`s16le`)** | 2 bytes per sample per channel |
| Sample rate | Positive integer (`8000`–`192000` Hz, default **`48000`**) | 48 kHz is WebRTC Opus native (zero resampling overhead) |
| Channels | `1` (mono, default) or `2` (stereo) | Buffer `byteLength` must be a multiple of `channels * 2` |
| 10 ms frame size | `(sampleRate / 100) * channels * 2` bytes | At 48 kHz mono = **960 bytes** per 10 ms frame |

> **Tip for 16 kHz / 24 kHz Voice AI APIs:** If your STT expects 16 kHz or your TTS outputs 24 kHz, pass `sampleRate: 24000` (or resample to 48 kHz) consistently in both `{ kind: 'external', sampleRate }` and `pushAudioFrame(..., { sampleRate })`.

---

## Complete Voice AI Example (Group Call)

```ts
import { TgCallsClient } from 'tgcalls-js';

// 1. Join the group voice chat with EXTERNAL audio capture
await tg.join('@mygroup', {
  kind: 'external',
  sampleRate: 48000,
  channels: 1,
  keepOpen: true,
});

// 2. Receive decoded remote speech frames (e.g., feed into STT / Gemini Live)
const stopListening = await tg.onAudioFrame('@mygroup', (frame) => {
  // frame.ssrc: unsigned 32-bit SSRC (0 for P2P calls)
  // frame.pcm: Buffer (s16le PCM)
  // frame.timestampMs: bigint
  // frame.peer?: { kind: 'user' | 'channel' | 'chat', id: bigint }
  sttClient.sendAudio(frame.pcm, frame.peer?.id);
}, {
  sampleRate: 48000,
  channels: 1,
});

// 3. Stream synthesized TTS PCM chunks back into the Telegram call
ttsStream.on('data', async (pcmChunk: Buffer) => {
  // Arbitrary chunk sizes (e.g. 20ms, 100ms, 1s) are automatically sliced into 10ms frames!
  await tg.pushAudioFrame('@mygroup', pcmChunk, {
    sampleRate: 48000,
    channels: 1,
  });
});

// Cleanup
stopListening();
await tg.leave('@mygroup');
```

## Using with 1-on-1 P2P Calls & E2E Conferences

```ts
// --- 1-on-1 P2P Voice AI ---
await tg.listenCalls({
  source: { kind: 'external', sampleRate: 48000, channels: 1 },
});
tg.on('connectionChange', async (peerId, state) => {
  if (state === 2) { // CONNECTED
    const off = await tg.onAudioFrame(peerId, (frame) => stt.write(frame.pcm));
    await tg.pushAudioFrame(peerId, greetingPcm, { sampleRate: 48000, channels: 1 });
  }
});

// --- E2E Conference Voice AI ---
const handle = await tg.createConference({
  source: { kind: 'external', sampleRate: 48000, channels: 1 },
});
const off = await tg.onAudioFrame(handle, (frame) => stt.write(frame.pcm));
await tg.pushAudioFrame(handle, replyPcm, { sampleRate: 48000, channels: 1 });
```

---

## Detailed API Reference

### `onAudioFrame(chat | handle, handler, options?)`

Subscribes to incoming `StreamMode.PLAYBACK` microphone frames.
- For active **group calls** that do not have an active recording or broadcast viewer owning `PLAYBACK`, `onAudioFrame` automatically configures `PLAYBACK` microphone as `MediaSource.EXTERNAL` with your `sampleRate` and `channels`.
- Returns an unsubscribe function `() => void`.
- If a group participant registry is active (e.g. after `getParticipants()`), `frame.peer` is automatically populated for each SSRC.

| Option (`ExternalAudioSinkOptions`) | Type | Default | Description |
|---|---|---|---|
| `sampleRate` | `number` | `48000` | Decoded output sample rate in Hz |
| `channels` | `1 \| 2` | `1` | Mono or stereo |

### `pushAudioFrame(chat | handle, pcm, options?)`

| Option (`PushAudioOptions`) | Type | Default | Description |
|---|---|---|---|
| `device` | `'microphone' \| 'speaker'` | `'microphone'` | Capture device target |
| `sampleRate` | `number` | `48000` | Sample rate used to compute 10 ms frame byte size |
| `channels` | `1 \| 2` | `1` | Channel count (`pcm.byteLength` must align to `channels * 2`) |
| `chunk10ms` | `boolean` | `true` | Automatically slices larger buffers into 10 ms frames with `+10n` ms timestamps and zero-pads the final partial frame |
| `timestampMs` | `bigint` | `BigInt(Date.now())` | Base capture timestamp in ms |

### `pushVideoFrame(chat | handle, i420, options)`

Pushes a raw planar **YUV420p (I420)** video frame into an active `EXTERNAL` camera or screen capture stream.

| Option (`PushVideoOptions`) | Type | Default | Description |
|---|---|---|---|
| `width` | `number` | required | Positive **even** integer |
| `height` | `number` | required | Positive **even** integer (`i420.byteLength` must equal `width * height * 3 / 2`) |
| `device` | `'camera' \| 'screen'` | `'camera'` | Target capture video device |
| `rotation` | `0 \| 90 \| 180 \| 270` | `0` | Frame rotation metadata in degrees |
| `timestampMs` | `bigint` | `BigInt(Date.now())` | Capture timestamp in ms |

```ts
// Example: push a 640x360 I420 frame (640 * 360 * 1.5 = 345,600 bytes)
const width = 640;
const height = 360;
const i420 = new Uint8Array((width * height * 3) / 2);
// Y plane: width * height bytes, U plane: (width*height)/4, V plane: (width*height)/4

await tg.pushVideoFrame('@mygroup', i420, {
  width,
  height,
  device: 'camera',
  rotation: 0,
});
```
