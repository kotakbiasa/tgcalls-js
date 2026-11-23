# Changelog

## 0.4.0 (2026-11-24)

- **Gemini Multimodal Live Voice & Video AI Bridge (`connectGeminiLive`):** built-in WebSocket `BidiGenerateContent` session (`GeminiLiveSession`) connecting group voice chats, 1-on-1 P2P calls, and E2E conferences directly to Google's Gemini Live API (`models/gemini-2.5-flash-native-audio-latest`), with automatic `48 kHz ↔ 16 kHz / 24 kHz` PCM resampling, real-time input/output audio transcription, thought separation (`onThoughtOutput`), instant barge-in interruption, and optional multimodal video frame forwarding (`i420ToBmp`) — verified live over Telegram 1-on-1 P2P voice call.
- **Voice AI External Frame Bridge (`{ kind: 'external' }`):** zero-`ffmpeg` `MediaSource.EXTERNAL` capture & playback across group calls, P2P calls, and conferences (`onAudioFrame`, `onVideoFrame`, `pushAudioFrame` with auto-10ms slicing & paced queue, `pushVideoFrame`, `interruptAudio`, `onVoiceActivity` VAD, `resamplePcmS16le`, `computePcmRms`, `i420ToBmp`).
- **Playback Filters, Advanced Queue & Voice Chat Admin RPCs:**
  - `seek()`, `setVolume()` (0–200%), `setSpeed()` (0.5–2.0×), `setLoop('off' | 'one' | 'all')`, and `setAudioFilter()` (`'bassboost'`, `'nightcore'`, `'vaporwave'`, `'8d'`, `'karaoke'`, `'treble'`, `'normalizer'`, `'echo'`, or `{ custom }`).
  - `playNext()`, `removeQueueTrack()`, `moveQueueTrack()`, `shuffleQueue()`, and `idleTimeoutMs` auto-leave timer.
  - `joinAs` channel/alias support, `getParticipants()`, `editParticipant()`, `setRaiseHand()`, `muteParticipant()`, `setParticipantVolume()`, `setCallTitle()`, `endGroupCall()`, `exportCallInvite()`, and `toggleNativeRecording()`.
- **Call preflight without ringing (#17):** `canRequestCall()` and `getCallDenialReason()` via `users.getFullUser` and session checks on both GramJS/teleproto and mtcute adapters (verified live).
- **Per-participant folder recording (#18):** `startRecording(chat, { dir, video })`, `ParticipantRegistry`, `GroupParticipantController`, `FolderRecorder`, MTProto participant pagination/delta/min-field merge cache, attributed `remoteSourceChange` (`origin: 'mtproto'`), and `manifest.json` (verified live).
- **Outgoing P2P recording & finalization (#19, #23):** per-call `OutgoingCallOptions.record` override, active path collision guards, H.264/AAC MP4 muxing, `confirmCall` `phone.PhoneCall` unwrap, and `recordingStopped` / `recordingError` events (verified live: `1280×720` H.264/AAC MP4).
- **RTMP publisher & broadcast stream viewer (#20):** `getStreamRtmpUrl()` (`revoke: false`), `joinRtmp()` (`RtmpPublisher`), and `joinStreamMode()` (`BroadcastController`) with explicit media-DC routing (verified live on Telegram RTMP ingest & DC 5).
- **Experimental E2E conference core (#21):** `createConference()`, `joinConference()`, `exportConferenceInvite()`, `inviteConferenceParticipants()`, `getEmojiFingerprint()`, `leaveConference()`, and capability-aware `sendConferenceMessage()` / `conferenceMessage` for `ntgcalls >= 4.0.0-alpha03` (2-account live E2E audio + matching 4-emoji fingerprint verified).
- **Opt-in state persistence & fresh resume (#22):** `statePath`, `flushState()`, and `resumeFromState()` with atomic writes, fresh group rejoin/SSRC allocation, playlist restore, and fresh recording segment directories (verified live).
- **Media requirements (#24):** documented `ntgcalls@3.0.7` `FILE`/`FFMPEG` limits and `ffmpeg`/`ffprobe` requirements in `docs/media-support.md`; added `MediaDependencyError`.

## 0.3.0 (2026-11-20)

- **1-on-1 P2P voice & video calls (incoming & outgoing) — verified live** on both `teleproto`/GramJS and `@mtcute/node`:
  - `listenCalls({ source, video?, record?, autoAccept?, onIncoming?, debug? })`, `callUser(userId, { video?, record? })`, `stopListeningCalls()`, `activeCallPeers()`, and `getEmojiFingerprint()`.
  - Automatic plain-JS-array conversion (`jsBytes()`) across the `ntgcalls` N-API `bytes::binary` boundary (`initExchange`, `exchangeKeys`, `sendSignalingData`, `RTCServer.peerTag`).
  - V2 external MTProto signaling (`8.0.0`/`9.0.0`) negotiation, lossless 64-bit TL `accessHash` handling (`asBigInt0()`), and `ConnectionState.CLOSED` (`16`) emission on peer teardown.
  - Multi-handler event subscription (`on`, `off`, `once`) with unsubscribe callbacks and isolated error handling.

## 0.2.0 (2026-11-19)

- **Built-in playlist & queue:** `play()`, `enqueue()` / `then()`, `skip()`, `playOnHold()`, `clearQueue()`, `getCurrent()`, and `getQueue()` with automatic track advancement and hold-loop fallback.
- **Incoming call audio recording:** `startRecording(chat, path, opts?)`, `stopRecording(chat)`, `getRecording(chat)`, and `isRecording(chat)` mixing remote speakers natively via `ntgcalls` into `ffmpeg` (`.wav`, `.mp3`, `.opus`).

## 0.1.0 (2026-11-18)

- **Core group voice, video & screen-share SDK:**
  - `join()`, `joinYouTube()`, `joinIdle()`, `setSource()`, `startPresentation()`, `stopPresentation()`, `pause()`, `resume()`, `mute()`, `unmute()`, `leave()`, `time()`, and `dispose()`.
  - Dual MTProto adapter support (`GramjsAdapter` for `teleproto` / `telegram` and `MtcuteAdapter` for `@mtcute/node`) with automatic client detection.
  - High-resolution split video+audio stream resolution (`resolveYouTubeStreams()`, `VideoQuality` presets `360p`–`4K`), typed errors (`TgCallsError`, `AlreadyInCallError`, `NoVoiceChatError`, `UnrecognizedClientError`), and configurable `logger`.
