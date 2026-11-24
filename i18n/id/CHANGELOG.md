# Catatan Rilis (Changelog)

## 0.4.0 (2026-11-24)

- **Integrasi Gemini Multimodal Live (`connectGeminiLive`):** sesi WebSocket `BidiGenerateContent` bawaan (`GeminiLiveSession`) yang menghubungkan voice chat grup, panggilan P2P 1-lawan-1, dan konferensi E2E langsung ke Google Gemini Live API (`models/gemini-2.5-flash-native-audio-latest`), lengkap dengan resampling PCM otomatis (`48 kHz ↔ 16 kHz / 24 kHz`), transkripsi audio input/output real-time, interupsi barge-in instan, dan pengiriman frame video multimodal (`i420ToBmp`) — terverifikasi live di panggilan suara P2P Telegram.
- **Voice AI External Frame Bridge (`{ kind: 'external' }`):** capture & playback `MediaSource.EXTERNAL` tanpa `ffmpeg` (`onAudioFrame`, `onVideoFrame`, `pushAudioFrame` dengan pemotongan 10ms otomatis & antrean `paced`, `pushVideoFrame`, `interruptAudio`, `onVoiceActivity` VAD, `resamplePcmS16le`, `computePcmRms`, `i420ToBmp`).
- **Filter Audio, Kontrol Antrean Lanjutan & RPC Admin Voice Chat:**
  - `seek()`, `setVolume()` (0–200%), `setSpeed()` (0.5–2.0×), `setLoop('off' | 'one' | 'all')`, dan `setAudioFilter()` (`'bassboost'`, `'nightcore'`, `'vaporwave'`, `'8d'`, `'karaoke'`, `'treble'`, `'normalizer'`, `'echo'`, atau `{ custom }`).
  - `playNext()`, `removeQueueTrack()`, `moveQueueTrack()`, `shuffleQueue()`, dan timer keluar otomatis `idleTimeoutMs`.
  - `joinAs`, `getParticipants()`, `editParticipant()`, `setRaiseHand()`, `muteParticipant()`, `setParticipantVolume()`, `setCallTitle()`, `endGroupCall()`, `exportCallInvite()`, dan `toggleNativeRecording()`.
- **Selesai Seluruh Roadmap Panggilan (`#17`–`#24`):** preflight panggilan tanpa dering (`#17`), perekaman folder per-peserta (`#18`), perekaman panggilan keluar P2P & unwrap `confirmCall` (`#19`, `#23`), publisher RTMP & penonton siaran (`#20`), konferensi E2E (`#21`), dan persistensi state (`#22`).

## 0.3.0 (2026-11-20)

- **Panggilan Suara & Video P2P 1-lawan-1 (Masuk & Keluar):** `listenCalls()`, `callUser()`, `stopListeningCalls()`, `activeCallPeers()`, dan `getEmojiFingerprint()` di `teleproto`/GramJS maupun `@mtcute/node`.

## 0.2.0 (2026-11-19)

- **Playlist & Antrean Lagu Bawaan:** `play()`, `enqueue()`/`then()`, `skip()`, `playOnHold()`, `clearQueue()`, `getCurrent()`, `getQueue()`.
- **Perekaman Audio Gabungan:** `startRecording(chat, path)`, `stopRecording(chat)`, `getRecording(chat)`, `isRecording(chat)`.

## 0.1.0 (2026-11-18)

- **Rilis Perdana SDK Suara, Video & Berbagi Layar Grup:** `join()`, `joinYouTube()`, `joinIdle()`, `setSource()`, `startPresentation()`, `stopPresentation()`, dukungan adapter `teleproto`/GramJS dan `@mtcute/node`.
