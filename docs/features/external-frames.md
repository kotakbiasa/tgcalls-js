# Voice AI, Gemini Live & External Frame Bridge

`tgcalls-js` provides a **zero-ffmpeg, low-latency, bidirectional audio & video frame bridge** built directly on `ntgcalls`'s `MediaSource.EXTERNAL`, plus a **built-in Gemini Multimodal Live WebSocket bridge (`connectGeminiLive`)**, pure-JS PCM resampler (`16kHz / 24kHz ↔ 48kHz`), Voice Activity Detection (`onVoiceActivity`), paced barge-in interruption (`interruptAudio`), and incoming video frame subscription (`onVideoFrame` + `i420ToBmp`).

---

## 1. Built-In Gemini Live Bridge (`connectGeminiLive`)

Connect any Telegram group voice chat, 1-on-1 P2P call, or E2E conference directly to Google's **Gemini Multimodal Live API (`BidiGenerateContent`)** in a few lines of code — no external audio resamplers or WebSocket boilerplate required:

```ts
import { TgCallsClient } from 'tgcalls-js';

// 1. Join the voice chat with EXTERNAL audio capture (zero ffmpeg required)
await tg.join('@mygroup', {
  kind: 'external',
  sampleRate: 48000,
  channels: 1,
});

// 2. Attach Gemini Multimodal Live directly to the call
const gemini = await tg.connectGeminiLive('@mygroup', {
  apiKey: process.env.GEMINI_API_KEY!,
  model: 'models/gemini-2.5-flash-native-audio-preview-12-2025',
  voiceName: 'Aoede', // 'Aoede' | 'Puck' | 'Charon' | 'Kore' | 'Fenrir'
  systemInstruction: 'Kamu adalah asisten suara AI berbahasa Indonesia di Voice Chat Telegram.',
  videoFrameIntervalMs: 2000, // optional: forward 1 camera/screen frame every 2s for multimodal vision!
  onTextOutput: (text) => console.log('[Gemini]:', text),
  onInterrupted: () => console.log('[Gemini]: user interrupted (barge-in)'),
});

// Optional: send a text prompt into the active voice session
gemini.sendText('Sapa semua orang di voice chat ini!');

// Disconnect Gemini Live when done
await gemini.close();
```

### What `connectGeminiLive` Handles Automatically

1. **Incoming Speech (`48 kHz → 16 kHz`):** Subscribes to `tg.onAudioFrame` with `targetSampleRate: 16000` and streams `audio/pcm;rate=16000` chunks to Gemini Live's `realtimeInput.audio`.
2. **Outgoing AI Voice (`24 kHz → 48 kHz`):** Receives Gemini's `audio/pcm;rate=24000` chunks, resamples them to `48000 Hz`, and queues paced 10 ms frames into `ntgcalls`.
3. **Instant Barge-In Interruption:** When a participant interrupts Gemini (`serverContent.interrupted: true`), automatically calls `tg.interruptAudio(chat)` to drop remaining queued TTS frames immediately.
4. **Multimodal Vision (`videoFrameIntervalMs`):** When enabled, captures incoming `camera`/`screen` I420 frames via `onVideoFrame`, converts them to 24-bit RGB BMP via `i420ToBmp()`, and streams them to Gemini Live (`image/bmp`).

---

## 2. Custom Voice AI Pipelines (`onAudioFrame`, `pushAudioFrame`, `interruptAudio`, `onVoiceActivity`)

If you are connecting to **OpenAI Realtime**, **Deepgram**, **Whisper**, **ElevenLabs**, or your own custom pipeline:

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
| `sampleRate` | `number` | `48000` | Native `ntgcalls` PLAYBACK sample rate in Hz |
| `channels` | `1 \| 2` | `1` | Native `ntgcalls` PLAYBACK channels |
| `targetSampleRate` | `number` | `sampleRate` | Automatically resample delivered `frame.pcm` to this rate (e.g. `16000` for Gemini Live / STT) |
| `targetChannels` | `1 \| 2` | `channels` | Automatically convert mono ↔ stereo |

### `pushAudioFrame(chat | handle, pcm, options?)`

| Option (`PushAudioOptions`) | Type | Default | Description |
|---|---|---|---|
| `device` | `'microphone' \| 'speaker'` | `'microphone'` | Capture device target |
| `sampleRate` | `number` | `48000` | Call capture sample rate used to compute 10 ms frame byte size |
| `channels` | `1 \| 2` | `1` | Call capture channel count |
| `inputSampleRate` | `number` | `sampleRate` | Input `pcm` sample rate (e.g. `24000` from Gemini Live / OpenAI Realtime); resampled automatically |
| `inputChannels` | `1 \| 2` | `channels` | Input `pcm` channel count |
| `chunk10ms` | `boolean` | `true` | Automatically slices larger buffers into 10 ms frames with `+10n` ms timestamps and zero-pads the final partial frame |
| `paced` | `boolean` | `false` | Queues 10 ms frames into a paced sender so speech can be interrupted mid-sentence via `interruptAudio(chat)` |
| `timestampMs` | `bigint` | `BigInt(Date.now())` | Base capture timestamp in ms |

### `interruptAudio(chat | handle)` (Barge-In)

Immediately clears any unplayed 10 ms frames queued with `paced: true` and returns `{ droppedFrames, droppedBytes }`:

```ts
const { droppedFrames, droppedBytes } = await tg.interruptAudio('@mygroup');
```

### `onVoiceActivity(chat | handle, handler, options?)` (VAD)

Per-SSRC Voice Activity Detection computed from incoming PCM RMS energy:

```ts
const stopVad = await tg.onVoiceActivity('@mygroup', (event) => {
  // event: { type: 'speechStart' | 'speechEnd', ssrc, rms, timestampMs, peer? }
  console.log(event.type, 'from', event.peer?.id ?? event.ssrc, 'rms:', event.rms);
}, {
  thresholdRms: 0.015, // 0..1 normalized RMS threshold
  speechFrames: 3,     // consecutive active frames to trigger speechStart
  silenceFrames: 15,   // consecutive silent frames to trigger speechEnd
  autoInterrupt: true, // automatically call interruptAudio(chat) on speechStart!
});
```

### `onVideoFrame(chat | handle, handler, options?)` & `i420ToBmp`

Receive decoded remote `camera` and `screen` YUV420p (I420) video frames in real time:

```ts
import { i420ToBmp } from 'tgcalls-js';

const stopVideo = await tg.onVideoFrame('@mygroup', (frame) => {
  // frame: { ssrc, device: 'camera' | 'screen', i420: Buffer, width, height, rotation, timestampMs, peer? }
  const bmpBuffer = i420ToBmp(frame.i420, frame.width, frame.height);
}, {
  device: 'both', // 'camera' | 'screen' | 'both'
});
```

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
