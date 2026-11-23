# Changelog

## 0.9.0 (2026-11-23)

- **Call preflight without ringing (#17):** `canRequestCall()` and `getCallDenialReason()` via `users.getFullUser` and session checks on both GramJS/teleproto and mtcute adapters (verified live).
- **Outgoing P2P recording & finalization (#19):** per-call `OutgoingCallOptions.record` override (`false` to disable, string/object to override listener default), active path collision guards, `.webm` rejection for H.264/AAC muxing, recovery file retention on failure, setup-error cleanup, and `recordingStopped` / `recordingError` events (verified live: `1280×720` H.264/AAC MP4).
- **Outgoing `confirmCall` unwrap & RTC servers (#23):** unwraps `phone.PhoneCall { phoneCall, users }`, removes nonexistent `phone.getCall`, preserves relay endpoints, protocol versions, `customParameters`, and explicit `p2pAllowed` (verified live: `servers=2`, `CONNECTED`).
- **RTMP publisher & broadcast stream viewer (#20):** `getStreamRtmpUrl()` (`revoke: false`), `joinRtmp()` (`RtmpPublisher`), and `joinStreamMode()` (`BroadcastController`) with explicit media-DC routing (verified live on Telegram RTMP ingest & DC 5).
- **Per-participant folder recording (#18):** `startRecording(chat, { dir, video })`, `ParticipantRegistry`, `GroupParticipantController`, `FolderRecorder`, MTProto participant pagination/delta/min-field merge cache, attributed `remoteSourceChange` (`origin: 'mtproto'`), and `manifest.json` (verified live for single remote participant + multi-peer offline).
- **Opt-in state persistence & fresh resume (#22):** `statePath`, `flushState()`, and `resumeFromState()` with atomic writes, fresh group rejoin/SSRC allocation, playlist restore, and fresh recording segment directories (verified live).
- **Experimental native conference core (#21):** `createConference()`, `joinConference()`, `exportConferenceInvite()`, `inviteConferenceParticipants()`, `getEmojiFingerprint()`, and `leaveConference()` (2-account live E2E audio + matching 4-emoji fingerprint verified; removal/rekey and encrypted app messages remain blocked by `ntgcalls@3.0.7`).
- **Media requirements (#24):** documented `ntgcalls@3.0.7` `FILE`/`FFMPEG` limits and `ffmpeg`/`ffprobe` requirements in `docs/media-support.md`; added `MediaDependencyError`.
- **Isolated test runner:** `npm test` (`test/all.mjs`) runs every `test/*.ts` entrypoint in an isolated Node process (`18/18` passing).

## 0.8.0 (2026-11-20)

- Feat: **P2P calls on mtcute** — the adapter now implements accept/request/
  confirm/signaling/discard and routes `updatePhoneCall` + `updatePhoneCallSignalingData`.
  Two silent traps fixed: `client.connect()` never starts mtcute's updates loop
  (use `start()`), and phone-call updates carry `_` (`phoneCallRequested`) while the
  dispatcher only read `className`.
- Feat: **video in outgoing calls** — `callUser(userId, { video })` mounts the camera
  device and asks Telegram for a video call; verified live (ICE `CONNECTED`,
  `Encoder is active`, audio RTP flowing).
- Fix: `phone.requestCall` result is wrapped (`{ phoneCall, users }`) — the call id
  was read from the wrapper and came out as `0`.
- Fix: `phone.confirmCall` has no `gB` field; the adapter now sends `gA` and a raw
  `Buffer` (the native-facing `jsBytes()` array is wrong for MTProto).

## 0.7.1 (2026-11-20)

- Fix: **`connectionChange` now reports the final state** — after a peer hangs up
  (or `stopListeningCalls()` runs) consumers received no transition, so state maps
  stayed stuck on `CONNECTED` (2). `P2PCallManager` emits `ConnectionState.CLOSED`
  (16) for each torn-down peer. Covered by an offline test.
## 0.7.0 (2026-11-20)

**P2P calls now work end-to-end — verified live** (ICE `CONNECTED`, audio RTP flowing,
caller hears the stream). Four defects were fixed on the way; all were silent or
misattributed, so they are documented here.

- Fix: **byte parameters must be JS arrays** — the ntgcalls N-API glue reads
  `bytes::binary` via `v.As<Napi::Array>()`, so `Buffer`/`Uint8Array`/`ArrayBuffer`
  throw `An array was expected`. New `jsBytes()` helper converts at every binding
  boundary (`initExchange` p/random/gaHash, `exchangeKeys` gAOrB, `sendSignalingData`,
  `RTCServer.peerTag`). The published `index.d.ts` claiming `Buffer` is wrong.
- Fix: **64-bit TL integers were lossy** — teleproto represents `long` as a
  `big-integer` object; `BigInt(obj)` goes through `valueOf()` → `Number` and loses
  precision above 2^53, so `accessHash` was corrupted and `phone.acceptCall` returned
  `CALL_PEER_INVALID`. New `asBigInt0()` converts via `toString()`.
- Fix: **`connectP2p` customParameters** — `''` is a *present* optional, so the native
  `json::parse("")` threw `incomplete JSON`. Now sends `'{}'`.
- Fix: **signaling version selection** — ntgcalls picks the highest supported version
  from the list; `12.0.0`/`13.0.0` select `SignalingSctpConnection` (signaling over the
  SCTP data channel), but Telegram 1:1 calls carry signaling over MTProto. Inbound
  packets were fed into SCTP (`Failed to parse received SCTP packet`), remote candidates
  never reached ICE, and the call timed out with `Sorting 0 available connections`.
  Now restricted to the peer's V2 subset (`8.0.0`/`9.0.0`).
- Feat: `listenCalls({ debug: true })` for per-step signaling/ICE diagnostics; the
  verbose `[p2p]` logs are off by default.
- Docs: P2P marked verified; implementer notes on arrays, V2 signaling and `debug`.

## 0.6.0 (2026-11-19)

> **Superseded by 0.7.0** — the blocker described below was a binding-usage issue,
> not an upstream bug: byte arguments must be plain JS arrays. P2P works in 0.7.0.

> **⚠️ P2P calls are EXPERIMENTAL and not yet functional live.** The signaling
> orchestration is implemented and offline-tested, but actual calls are blocked by
> an ntgcalls **JS-binding** bug: `initExchange` throws `An array was expected`
> when converting `DhConfig` (`std::vector<byte>`) — reproduced with Buffer /
> Uint8Array / Array / ArrayBuffer / DataView inputs, on ntgcalls 3.0.7 **and**
> 3.1.0-beta01. The Python/Go bindings accept the same inputs. Needs an upstream
> ntgcalls fix before P2P works end-to-end. Group-call features are unaffected.

- Feat: **multi-handler events** — `on()` now supports multiple handlers per event
  (all run in registration order) and returns an unsubscribe function; new `off()`
  and `once()`. A throwing handler no longer blocks the others. Previously the last
  registration won. Non-breaking for single-handler use.
- Feat (experimental): **incoming P2P (1-on-1) voice calls** — `listenCalls({ source, autoAccept?, onIncoming? })`,
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
