# Recording (Mixed & Per-Participant)

`tgcalls-js` provides three recording pipelines depending on your use case:

| Mode | Call Type | Output | Attribution | Validation |
|---|---|---|---|---|
| **Mixed audio** (`startRecording(chat, path)`) | Group call | Single `.wav`/`.mp3`/`.opus` file | All speakers mixed together | Best-effort `ffmpeg` pipe |
| **Per-participant folder** (`startRecording(chat, { dir, video })`) | Group call (RTC / STREAM) | Separate `.wav` (mic) + `.mp4` (camera/screen) per speaker + `manifest.json` | Full peer ID + SSRC + device | Drained + `ffprobe`-validated (`status: 'saved'`) |
| **P2P remote recording** (`listenCalls` / `callUser` `record`) | 1-on-1 P2P call | Remote audio or muxed H.264/AAC `.mp4`/`.mkv` | Remote peer user ID | `recordingStopped` status |

---

## 1. Mixed Group Audio Recording

Pass a file path string to `startRecording()`. `ntgcalls` mixes all remote speakers natively into a single `s16le` PCM stream and pipes it to `ffmpeg`, which chooses the container/codec from the file extension (`.wav`, `.mp3`, `.opus`, `.m4a`, etc.).

```ts
await tg.joinIdle('@mygroup');

const info = await tg.startRecording('@mygroup', './recordings/meeting.mp3', {
  sampleRate: 48000, // default: 48000
  channels: 1,       // default: 1 (mono); pass 2 for stereo
});

console.log('Recording started at:', new Date(info.startedAt));
console.log('Active?', tg.isRecording('@mygroup')); // true (sync)

// Later: stop recording (leaving the call also stops it automatically)
const filePath = await tg.stopRecording('@mygroup');
console.log('Saved to:', filePath);
```

> **Note:** Mixed recording requires an active call (`join` or `joinIdle`). Only one recording can be active per chat — calling `startRecording()` again stops the previous recording first.

---

## 2. Per-Participant Folder Recording

Pass a `FolderRecordingTarget` object to record every participant's microphone, camera, and screen share into **separate files** with automatic segment rotation and a JSON manifest.

### How It Works Under the Hood

1. `tgcalls-js` fetches all pages of `phone.getGroupParticipants` and subscribes to `UpdateGroupCallParticipants` deltas to map every audio/video SSRC to a Telegram peer (`user`, `channel`, or `chat`).
2. It configures `StreamMode.PLAYBACK` with `MediaSource.EXTERNAL` and receives raw decoded audio/video frames tagged by SSRC.
3. Each unique `(peer, device, endpoint, resolution)` opens its own dedicated writer:
   - **Microphone** → uncompressed `.wav`
   - **Camera / Screen** → H.264/AAC `.mp4` (constant frame rate using local monotonic arrival timestamps)
4. Whenever a participant switches devices, reconnects with a new endpoint, or changes video resolution, the current segment is closed, validated with `ffprobe`, and a new segment begins automatically.
5. On `stopRecording()` or `leave()`, all buffered frames are drained, all writers are closed, outputs are probed with `ffprobe`, `manifest.json` is written, and `recordingStopped` is emitted for each segment.

### Complete Example

```ts
await tg.joinIdle('@mygroup');

// Observe every finalized segment
tg.on('recordingStopped', (chatId, info) => {
  if (info.status === 'saved') {
    console.log(`Saved [${info.device} seg #${info.segment}]`, info.peer, '→', info.path);
  } else if (info.status === 'failed') {
    console.error(`Failed [${info.device}]`, info.error);
  }
});

// Observe disk / encoder / ffprobe errors
tg.on('recordingError', (chatId, err) => {
  console.error(`[${chatId}] recording error:`, err);
});

// Observe participant media transitions (camera/mic/screen active/paused/idling)
tg.on('remoteSourceChange', (chatId, src) => {
  console.log(`[${chatId}] source update:`, src.peer, src.device, src.state);
});

await tg.startRecording('@mygroup', {
  dir: './recordings/meeting-2026',
  video: true,
  sampleRate: 48000,
  channels: 1,
});

// ... wait for meeting to finish ...
const folderPath = await tg.stopRecording('@mygroup');
console.log('All artifacts finalized in:', folderPath);
```

### `FolderRecordingTarget` Options

| Field | Type | Default | Description |
|---|---|---|---|
| `dir` | `string` | required | Output directory for per-participant media files and `manifest.json` |
| `video` | `boolean` | `false` | Capture remote `camera` and `screen` video streams as H.264/AAC `.mp4` (requires `ffmpeg` + `ffprobe`) |
| `sampleRate` | `number` | `48000` | PCM sample rate for `.wav` microphone tracks |
| `channels` | `1 \| 2` | `1` | Channel count for `.wav` microphone tracks |

### `recordingStopped` Event Payload (`RecordingStoppedInfo`)

| Field | Type | Description |
|---|---|---|
| `path` | `string` | Path to the closed segment file |
| `peer` | `{ kind: 'user' \| 'channel' \| 'chat', id: bigint } \| undefined` | Attributed participant identity when resolved |
| `device` | `'microphone' \| 'camera' \| 'screen'` | Which stream device produced this segment |
| `segment` | `number` | Zero-based segment counter |
| `reason` | `string` | Reason the segment closed (`'stop'`, `'leave'`, `'rotation'`, `'rejoin'`, etc.) |
| `status` | `'saved' \| 'empty' \| 'failed'` | **Only `'saved'`** guarantees a non-empty, `ffprobe`-validated file |
| `error` | `Error \| undefined` | Error details when `status === 'failed'` |

### Constraints & Edge Cases

- **Single `PLAYBACK` owner:** Only one recording sink (mixed or folder) can own a group at a time. Starting a new recording stops the previous one cleanly first.
- **RTMP viewers excluded:** Unified RTMP broadcast streams do not carry per-speaker SSRCs, so folder recording is rejected on RTMP viewer sessions.
- **Audio/video clock note:** Native audio and video timestamps are not assumed to share a hardware clock; camera/screen segments use a monotonic arrival timeline with CFR output.

---

## 3. 1-on-1 P2P Call Recording

Configure `record` on `listenCalls()` as a default, and optionally override or disable it per call in `callUser()`:

```ts
await tg.listenCalls({
  source: { kind: 'file', path: './tone.mp3' },
  record: { path: './p2p/default-remote.mp4', video: true },
});

// Override output path for a specific outgoing call
await tg.callUser('@alice', {
  video: true,
  record: { path: './p2p/alice.mp4', video: true },
});

// Disable recording for another call
await tg.callUser('@bob', { record: false });
```

- **`.mp4` / `.mkv`:** Muxes remote camera (raw I420 → H.264) + remote audio (AAC) by default (`video: true`).
- **Any other extension** (`.wav`, `.mp3`, `.opus`): Records remote audio only.
- Emits `recordingStopped` (with `peer: { kind: 'user', id: peerId }`) and `recordingError` on failure.
