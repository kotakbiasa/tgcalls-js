# Referensi Core API

Semua ekspor berasal dari root paket (`import { ... } from 'tgcalls-js'`).

## `TgCallsClient`

### Konstruktor & `TgCallsOptions`

```ts
new TgCallsClient(options: TgCallsOptions)
```

| Field | Tipe | Default | Deskripsi |
|---|---|---|---|
| `client` | `MTProtoLike \| MtcuteLike \| MTProtoAdapter` | wajib | Client `teleproto`/GramJS, `mtcute`, atau adapter kustom |
| `Api` | `unknown` | auto | Namespace TL API |
| `statePath` | `string` | — | Path file JSON untuk persistensi state grup |
| `persistence` | `{ allowShell?: boolean; maxBytes?: number }` | `{ false, 1 MiB }` | Opsi penyimpanan state |
| `restore` | `ResumeControllerOptions` | — | Opsi pemulihan `resumeFromState()` |
| `idleTimeoutMs` | `number` | — | Otomatis keluar dari panggilan grup jika idle selama `N` ms |
| `ffmpegPath` | `string` | `"ffmpeg"` | Path binary `ffmpeg` |
| `ffprobePath` | `string` | `"ffprobe"` | Path binary `ffprobe` |
| `ytDlpPath` | `string` | `"yt-dlp"` | Path binary `yt-dlp` |
| `logger` | `{ error(...args: unknown[]): void }` | `console.error` | Penerima log peringatan internal |

---

### Daftar Method Utama

#### Bergabung & Video Grup
- `join(chat, source, options?): Promise<JoinResult>`
- `joinYouTube(chat, url, options?): Promise<JoinResult>`
- `joinIdle(chat, options?): Promise<JoinResult>`
- `resolveYouTube(url, video?): Promise<string | null>`
- `startPresentation(chat, source, video?): Promise<void>`
- `stopPresentation(chat): Promise<void>`
- `leave(chat): Promise<void>`
- `dispose(options?: { preserveState?: boolean }): Promise<void>`

#### Pemutaran, Filter & Antrean
- `play(chat, source, options?): Promise<JoinResult>`
- `enqueue(chat, source): Promise<void>` (alias: `then()`)
- `playNext(chat, source): Promise<void>`
- `removeQueueTrack(chat, index): Promise<AudioSource | null>`
- `moveQueueTrack(chat, fromIndex, toIndex): Promise<boolean>`
- `shuffleQueue(chat): Promise<AudioSource[]>`
- `skip(chat): Promise<void>`
- `playOnHold(chat, source | null): Promise<void>`
- `clearQueue(chat): Promise<void>`
- `getCurrent(chat): AudioSource | null`
- `getQueue(chat): AudioSource[]`
- `setSource(chat, source, playback?): Promise<void>`
- `seek(chat, seconds): Promise<void>`
- `setVolume(chat, percent): Promise<void>` (`0`..`200`)
- `setSpeed(chat, rate): Promise<void>` (`0.5`..`2.0`)
- `setAudioFilter(chat, filter): Promise<void>` (`'bassboost' | 'nightcore' | 'vaporwave' | '8d' | 'karaoke' | 'treble' | 'normalizer' | 'echo' | 'off' | { custom }`)
- `getAudioFilter(chat): AudioFilterPreset`
- `setLoop(chat, mode): Promise<void>` (`'off' | 'one' | 'all'`)
- `getLoop(chat): LoopMode`
- `getPlaybackControls(chat): PlaybackControls`
- `pause(chat)` / `resume(chat)` / `mute(chat)` / `unmute(chat)` / `time(chat)`

#### Kontrol Peserta & Manajemen Room
- `getParticipants(chat): Promise<ParticipantInfo[]>`
- `editParticipant(chat, participant | 'self', options): Promise<void>`
- `setRaiseHand(chat, raised): Promise<void>`
- `muteParticipant(chat, participant, muted?): Promise<void>`
- `setParticipantVolume(chat, participant, percent): Promise<void>`
- `setCallTitle(chat, title): Promise<void>`
- `endGroupCall(chat): Promise<void>`
- `exportCallInvite(chat, options?): Promise<string>`
- `toggleNativeRecording(chat, enabled, options?): Promise<void>`

#### Voice AI, Gemini Live & Frame Eksternal
- `connectGeminiLive(chat | handle, options): Promise<GeminiLiveSession>`
- `onAudioFrame(chat | handle, handler, options?): Promise<() => void>`
- `onVoiceActivity(chat | handle, handler, options?): Promise<() => void>`
- `onVideoFrame(chat | handle, handler, options?): Promise<() => void>`
- `pushAudioFrame(chat | handle, pcm, options?): Promise<void>`
- `interruptAudio(chat | handle): Promise<InterruptAudioResult>`
- `pushVideoFrame(chat | handle, i420, options): Promise<void>`
- Helper murni: `resamplePcmS16le()`, `computePcmRms()`, `i420ToBmp()`, `slicePcm10ms()`

#### Perangkat Hardware Lokal & Diagnostik
- `getMediaDevices()` / `TgCallsClient.getMediaDevices(): MediaDevices` — daftar mikrofon, speaker, webcam, dan monitor lokal
- `{ kind: 'device', microphone?, camera?, screen? }` — tangkap mikrofon, webcam (`MediaSource.DEVICE`), dan layar monitor (`MediaSource.DESKTOP`) langsung tanpa `ffmpeg`
- `enableSpeakerOutput(chat | handle, speaker?, opts?): Promise<void>` — putar suara panggilan langsung ke speaker komputer lokal
- `ping(): Promise<number>` — ukur latensi RTT MTProto asli ke server Telegram (ms)
- `cpuUsage(): Promise<number>` — cek pemakaian CPU WebRTC native `ntgcalls`
- `getMediaState(chat | handle): Promise<MediaState | null>` — status mute/video/presentasi native
- `TgCallsClient.nativePing(): string` (`"pong"`) & `TgCallsClient.setNativeLogLevel(level)`

#### Panggilan P2P, Perekaman, RTMP, Konferensi E2E & Persistensi
- **P2P:** `getCallDenialReason(user, opts?)`, `canRequestCall(user, opts?)`, `listenCalls(opts)`, `callUser(user, opts?)`, `stopListeningCalls()`, `activeCallPeers()`, `getEmojiFingerprint(chat | handle)`
- **Perekaman:** `startRecording(chat, path | { dir, video? }, opts?)`, `stopRecording(chat)`, `getRecording(chat)`, `isRecording(chat)`
- **RTMP & Siaran:** `getStreamRtmpUrl(chat)`, `joinRtmp(chat, url, key, opts?)`, `joinStreamMode(chat, opts?)`
- **Konferensi E2E:** `createConference(opts?)`, `joinConference(ref, opts?)`, `exportConferenceInvite(handle)`, `inviteConferenceParticipants(handle, users, opts?)`, `sendConferenceMessage(handle, msg)`, `getConferenceCapabilities()`, `activeConferences()`, `leaveConference(handle)`
- **Persistensi:** `flushState()`, `resumeFromState(opts?)`
