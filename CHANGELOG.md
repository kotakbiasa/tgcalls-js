# Changelog

## 0.6.0 (2026-11-19)

- Feat: **incoming P2P (1-on-1) voice calls** — `listenCalls({ source, autoAccept?, onIncoming? })`,
  `stopListeningCalls()`, `activeCallPeers()`. Answers incoming Telegram voice calls
  and streams an audio source into them. The DH key exchange and WebRTC engine run
  in the ntgcalls native core; the library orchestrates the MTProto signaling
  (`phone.acceptCall` / `sendSignalingData`, `UpdatePhoneCall` / `UpdatePhoneCallSignalingData`),
  including signaling queueing before connect and clean teardown on discard.
- Adapter: new optional P2P methods on `MTProtoAdapter` (getDhConfig/acceptCall/
  requestCall/confirmCall/discardCall/sendSignalingData/installCallHandler/resolveUserId),
  implemented for GramJS/teleproto. New `P2PCallManager` + `ListenCallsOptions` exports.
- Scope: incoming calls only this release; outgoing calls and multi-party conference
  are follow-up phases. Requires a GramJS/teleproto client (mtcute P2P not yet wired).
- Docs: P2P section in guide + API reference; `examples/call-gramjs.ts`.

## 0.5.0 (2026-11-19)

- Feat: call recording — `startRecording(chat, path, opts?)`, `stopRecording(chat)`,
  `getRecording(chat)`, `isRecording(chat)`. Records **incoming** call audio:
  ntgcalls mixes all remote speakers (its native `ThreadedAudioMixer`) and pipes
  s16le PCM to ffmpeg, which encodes to `path` (container from the extension:
  `.wav` / `.mp3` / `.opus`). Options: `sampleRate` (default 48000), `channels`
  (default 1). Stopping SIGTERMs ffmpeg so the container finalizes cleanly.
- New types: `RecordOptions`, `RecordingInfo`; new media helper `recordingDescription()`.
- Docs: recording section in the guide + API reference; `examples/record-gramjs.ts`.

## 0.4.0 (2026-11-19)

- Feat: built-in playlist/queue — `play()`, `enqueue()`/`then()`, `skip()`,
  `playOnHold()`, `clearQueue()`, `getCurrent()`, `getQueue()`. Tracks advance
  automatically when each one ends; a hold track loops while the queue is empty.
  The call only auto-leaves when the queue **and** hold are empty. `skip()` with
  nothing queued pauses playback (the call stays open).
- Non-breaking: the lower-level `setSource()`/`join()` and the manual `streamEnd`
  queue pattern still work unchanged.
- Docs: playlist section in the guide + API reference; new `examples/playlist-gramjs.ts`.

## 0.3.1 (2026-11-18)

- Fix: typed errors — new `TgCallsError` base plus `AlreadyInCallError`,
  `NoVoiceChatError`, `UnrecognizedClientError` (with `chatId` where
  applicable) replace bare `Error` throws, so consumers can `instanceof`
  instead of matching message strings. All still extend `Error`.
- Feat: `logger` option on `TgCallsOptions` — route the library's internal
  warnings (e.g. a throwing event handler) into your own logger. Defaults to
  `console.error` (previous behaviour).
- Fix: test suite now fails fast with a clear message when `ffmpeg` is not on
  PATH (previously the missing binary surfaced from ntgcalls as a confusing
  `vfork_launcher` ENOENT crash).
- Chore: dev dependency `telegram` (archived GramJS) replaced by its maintained
  fork `teleproto`; examples updated. Runtime support for `telegram` is
  unchanged.
- Docs: install troubleshooting for the native binary on npm versions that
  skip optional dependencies, and the ffmpeg PATH requirement.

## 0.3.0 (2026-11-10)

- Feat: Add support for mtcute (`@mtcute/node`, `@mtcute/core`) via modular `MTProtoAdapter` and automatic client detection.
- Feat: Export `MtcuteAdapter`, `GramjsAdapter`, `createAdapter`, `isMtcuteClient`, and `isGramjsClient`.

- Fix: `setSource()` no longer drops the camera/screen video channel (ntgcalls removes any device omitted from `setStreamSources`); the video is rebuilt from the new source.
- Fix: `streamEnd` fires once per playback. With video active it waits for both audio and video to end (was: once per stream type, auto-leaving early).
- Fix: a failed `join()` now stops the native call and sends `LeaveGroupCall` (no zombie participant).
- Fix: an event handler that throws/rejects no longer crashes the process (logged instead).
- Fix: `joinYouTube()` with video/presentation now requests separate `bestvideo[height<=720]+bestaudio` streams (new `resolveYouTubeStreams()`, `audioUrl` on url sources) instead of the low-res pre-merged format that looked blurry.
- Perf: video scaling `lanczos` -> `bicubic` (lighter on small VPS).
- `startPresentation()`: skips the empty idle audio source; marks camera inactive (ntgcalls can't mix camera and screen).

## 0.2.0 (2026-09-08)

- Video sharing: `join(..., { video: {width, height, fps} })`
- Screen share: `startPresentation()` / `stopPresentation()`
- `joinIdle()` for stable idle presence

## 0.1.0 (2026-09-08)

First release. Audio-only.

- `join()` / `joinYouTube()` with file / URL / shell PCM sources
- `setSource()` — swap track without leaving (queue support)
- `pause` / `resume` / `mute` / `unmute` / `leave` / `time`
- Events: `streamEnd`, `connectionChange`, `update`
- Works with GramJS (`telegram`) and teleproto; offline test suite with fake
  MTProto + real ntgcalls native core
