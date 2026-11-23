# Recording (Mixed & Per-Participant)

`tgcalls-js` supports three recording modes:

1. **Group mixed audio** — single audio file containing all remote speakers mixed together by `ntgcalls`.
2. **Group per-participant folder recording** — separate audio (`.wav`) and video (`.mp4`) files per participant, per device, and per resolution segment, plus a JSON manifest.
3. **1-on-1 P2P recording** — remote audio or muxed H.264/AAC video+audio `.mp4`/`.mkv`.

## 1. Mixed Group Audio Recording

Pass a file path string to `startRecording()`. The output format is inferred from the extension (`.wav`, `.mp3`, `.opus`, `.m4a`, etc.):

```ts
await tg.joinIdle('@mygroup');
const info = await tg.startRecording('@mygroup', './recordings/meeting.mp3', {
  sampleRate: 48000,
  channels: 1,
});

// Check status synchronously
console.log(tg.isRecording('@mygroup'), tg.getRecording('@mygroup'));

// Stop and finalize
const savedPath = await tg.stopRecording('@mygroup');
```

## 2. Per-Participant Folder Recording

Pass a `FolderRecordingTarget` object (`{ dir, video?, sampleRate?, channels? }`) to record each speaker and camera/screen stream into separate files:

```ts
await tg.joinIdle('@mygroup');

tg.on('recordingStopped', (chatId, info) => {
  // info: { path, peer?, device, segment, reason, status, error? }
  // Only status === 'saved' guarantees a closed, ffprobe-validated file.
  console.log('Segment finalized:', info.status, info.path, info.peer);
});

tg.on('recordingError', (chatId, err) => {
  console.error('Recording error:', err);
});

await tg.startRecording('@mygroup', {
  dir: './recordings/session-1',
  video: true,
  sampleRate: 48000,
  channels: 1,
});

// ... later: drains buffered frames, closes writers, probes outputs, writes manifest
const dir = await tg.stopRecording('@mygroup');
```

### `FolderRecordingTarget` Options

| Field | Type | Default | Description |
|---|---|---|---|
| `dir` | `string` | required | Output directory for per-participant media files and manifest |
| `video` | `boolean` | `false` | Capture remote `camera` and `screen` video streams as H.264/AAC MP4 |
| `sampleRate` | `number` | `48000` | Audio PCM sample rate |
| `channels` | `1 \| 2` | `1` | Audio channel count (mono or stereo) |

### Output & Segment Rotation

- **Microphone** tracks are saved as `.wav`.
- **Camera** and **Screen** tracks are encoded as H.264/AAC `.mp4` (CFR monotonic arrival timeline).
- A **new segment** is created automatically whenever a participant's peer ID, device, endpoint, or video resolution changes.
- A **manifest file** records participant identities, SSRCs, segment timing, dropped frames, and finalization status.
- Leaving the call (`leave()` / `dispose()`) automatically drains and finalizes open recordings before returning.

### `recordingStopped` Event Payload (`RecordingStoppedInfo`)

| Field | Type | Description |
|---|---|---|
| `path` | `string` | Path to the recorded segment file |
| `peer` | `PeerIdentity \| undefined` | Attributed participant (`{ kind, id }`) when known |
| `device` | `'microphone' \| 'camera' \| 'screen'` | Source device |
| `segment` | `number` | Segment index |
| `reason` | `string` | Why the segment closed (`'stop'`, `'leave'`, `'rotation'`, `'rejoin'`, etc.) |
| `status` | `'saved' \| 'empty' \| 'failed'` | Only `'saved'` means the file was closed and validated with `ffprobe` |
| `error` | `Error \| undefined` | Present when `status === 'failed'` |

### Limitations & Rules

- Only **one** `PLAYBACK` recording sink owns a group at a time — calling `startRecording()` again stops the previous recording first.
- Unified **RTMP viewer** streams cannot be attributed per participant and are rejected for folder recording.
- `remoteSourceChange` emits `{ ssrc, device, state, peer?, endpoint?, origin? }` using MTProto participant deltas (`origin: 'mtproto'`), mapping removed sources to `StreamStatus.IDLING`.

## 3. P2P Call Recording

Configure `record` on `listenCalls()` or override per call in `callUser()`:

```ts
await tg.listenCalls({
  source: { kind: 'file', path: './tone.mp3' },
  record: { path: './p2p/remote.mp4', video: true },
});

// Override or disable on a specific outgoing call
await tg.callUser('@alice', { record: false });
await tg.callUser('@bob', { record: './p2p/bob-audio.wav' });
```

- Extensions `.mp4` and `.mkv` mux remote video (I420 → H.264) + audio by default (`video: true`).
- Any other extension (`.wav`, `.mp3`, `.opus`) records remote audio only.
- Finalization emits `recordingStopped` (and `recordingError` on failure).
