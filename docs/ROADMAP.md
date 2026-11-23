# Call roadmap implementation

This working branch contains implementations for the roadmap in [#25](https://github.com/kotakbiasa/tgcalls-js/issues/25). New APIs below are **unreleased**. The last approved release remains `v0.8.0`; its tag does not contain these additions. No full parity claim is made for MadelineProto.

| Issue | Implemented behavior | Evidence and remaining acceptance |
| --- | --- | --- |
| [#17](https://github.com/kotakbiasa/tgcalls-js/issues/17) | `canRequestCall` / `getCallDenialReason`, profile flags and session checks without ringing | Concrete adapter fixtures and no-ringing regression pass; live read-only profile comparison remains open |
| [#19](https://github.com/kotakbiasa/tgcalls-js/issues/19) | Per-call outgoing recording override, inherited listener default, `false` to disable, active path collision checks | Outgoing fixture media, lifecycle and RPC-shape tests; finalization integration and candidate live recording still require final verification |
| [#18](https://github.com/kotakbiasa/tgcalls-js/issues/18) | Folder output by peer/device, MTProto participant registry, camera/screen subscriptions, segmented WAV/MP4 and manifest | Real PCM/I420 fixture output and public facade tests pass; two live publishers and real AV sync remain open |
| [#23](https://github.com/kotakbiasa/tgcalls-js/issues/23) | Unwrap `confirmCall`, preserve endpoints/protocol/custom JSON, direct P2P only with explicit permission | Red/green teleproto/mtcute-shaped regressions pass; candidate live adapter check remains open |
| [#20](https://github.com/kotakbiasa/tgcalls-js/issues/20) | RTMP H.264/AAC publisher plus separate server-selected stream viewer | Real RTMP loopback and controller/facade fixtures pass; actual Telegram key, viewer download/decode and reconnect remain open |
| [#21](https://github.com/kotakbiasa/tgcalls-js/issues/21) | Experimental native conference core, chain relay, invite, participant mappings, capability refusals | Offline port and labelled native simulator tests; full E2E/security acceptance blocked by native 3.0.7, live two-account test not run |
| [#22](https://github.com/kotakbiasa/tgcalls-js/issues/22) | Opt-in private atomic state file, explicit fresh group rejoin, queue/hold and new recording segments | Two-process persistence fixtures and facade restore pass; live restart acceptance remains open |
| [#24](https://github.com/kotakbiasa/tgcalls-js/issues/24) | Documented ffmpeg requirement and typed executable errors | MP4/WebM/MKV decode probes plus native FILE/FFMPEG investigation; combined candidate suite is the final gate |

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
