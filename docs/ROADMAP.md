# Call roadmap status

Tracks the call stack roadmap in [#25](https://github.com/kotakbiasa/tgcalls-js/issues/25). All features below are merged on `main` and shipped in **`v0.4.0`**.

| Issue | Status | Implemented behavior | Verification evidence |
| --- | --- | --- | --- |
| [#17](https://github.com/kotakbiasa/tgcalls-js/issues/17) | **Closed** | `canRequestCall` / `getCallDenialReason`, profile flags and session checks without ringing | Offline adapter fixtures + live read-only Telegram verification (`SELF_CALL`, peer eligibility, zero ringing RPCs) |
| [#18](https://github.com/kotakbiasa/tgcalls-js/issues/18) | **Closed** | Folder output by peer/device, MTProto participant registry, camera/screen subscriptions, segmented WAV/MP4 and `manifest.json` | Offline multi-peer fixtures + live audio (`25.68s` WAV) & camera (`640×360` ↔ `1280×720` H.264/AAC MP4 segment rotation, `droppedFrames: 0`) |
| [#19](https://github.com/kotakbiasa/tgcalls-js/issues/19) | **Closed** | Per-call outgoing recording override, inherited listener default, `false` to disable, path collision checks, `.webm` rejection, recovery retention, `recordingStopped` | Offline finalization tests + live outgoing video call recording (`1280×720` H.264/AAC MP4, `4.24s`, `ffprobe` verified) |
| [#20](https://github.com/kotakbiasa/tgcalls-js/issues/20) | **Closed** | `getStreamRtmpUrl` (`revoke: false`), RTMP H.264/AAC publisher (`joinRtmp`), and separate server-selected stream viewer (`joinStreamMode`) | Offline loopback/DC fixtures + live Telegram RTMP publish (`dc5-1.rtmp.t.me`), `joinStreamMode` (`mode: 'RTMP'`, `broadcastErrors: 0`), media DC 5 `getStreamChannels` |
| [#21](https://github.com/kotakbiasa/tgcalls-js/issues/21) | **Open** *(core live-verified)* | Native E2E conference core, subchain relay, invite link, ringing invite, participant mappings, capability-aware `sendConferenceMessage` / `conferenceMessage` (`ntgcalls` 4.x) | Offline port/simulator tests + live 2-account E2E conference (`CONNECTED`, encrypted audio heard, matching 4-emoji fingerprint `🔶🐚🚶🔋`). Removal/rekey remains blocked upstream by `ntgcalls` |
| [#22](https://github.com/kotakbiasa/tgcalls-js/issues/22) | **Closed** | Opt-in private atomic state file (`statePath`), `flushState`, `resumeFromState` with fresh group rejoin, queue/hold and fresh recording segments | Offline two-process fixtures + live Telegram resume (fresh SSRC, preserved queue, fresh recording segment directory) |
| [#23](https://github.com/kotakbiasa/tgcalls-js/issues/23) | **Closed** | Unwrap `confirmCall` `{ phoneCall, users }`, remove nonexistent `phone.getCall`, preserve endpoints/protocol/`customParameters`/explicit `p2pAllowed` | Offline teleproto/mtcute regressions + live outgoing P2P (`servers=2`, `CONNECTED`) |
| [#24](https://github.com/kotakbiasa/tgcalls-js/issues/24) | **Closed** | Investigated `ntgcalls@3.0.7` (`FILE` raw only, `FFMPEG` unimplemented); documented `ffmpeg`/`ffprobe` requirement + `MediaDependencyError` | Native probes + `docs/media-support.md` fallback acceptance completed |

No issue is closed solely because an offline suite passes. The independent review, final combined suite and GitHub CI status must be recorded separately in the delivery report.

## Corrections to the original diagnosis

`phone.confirmCall` returns a `phone.PhoneCall` wrapper containing `phoneCall` and `users`. The old outgoing path read the wrapper as the inner call, losing endpoints and permissions. `phone.getCall` is absent from both installed client schemas and the official MTProto schema. A slow answer was not established as the cause of the endpoint bug.

Outgoing calls already shared the listener recording setup through `startTransport`; the missing part was an explicit per-call API and reliable isolation/finalization. Native group source-change callbacks do not discover participants in the inspected binary: the new registry uses MTProto participant updates.

`sendBroadcastPart` supplies downloaded media to a native decoder. RTMP publication uses its own ffmpeg process and never uploads with that native method.

## Native and media limits

The pinned dependency is `ntgcalls@3.0.7`. Native FILE consumes raw PCM/I420; FFMPEG throws an unimplemented-encoder error. File/URL container playback requires ffmpeg. Caller-owned shell PCM does not require ffmpeg if it uses another producer. See [media support](media-support.md) for the source pins and measured decoder outputs.

Conference removal/rekey, encrypted application messages and observable cryptographic chain health are not exposed by native 3.0.7. These operations reject explicitly; there is no plaintext or custom JavaScript crypto replacement. A resolved `applyBlocks` promise and an emoji callback do not attest cryptographic conformance. The conference API is experimental until the native security and live gates are met.

State persistence stores group intent only. It does not serialize native sockets, SSRCs, P2P sessions, conference keys or RTMP keys. Restore starts the current source again and opens a fresh recording segment; it does not resume a native transport or provide gapless seeking.

## Verification contract

Run `npm run build`, `npm run typecheck:all`, `npm test`, and `npm run smoke` in a pinned cloud candidate. The canonical test runner discovers every `test/*.ts` entrypoint and isolates each in a fresh Node process. Media child processes must complete before native workers are created in tests that use both.

Live tests need an authorized user session and the requested peers/groups. Existing release-level live observations do not verify the changed candidate. Keep live requirements open until that candidate is exercised.
