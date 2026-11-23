# Media support and native decoder limits

For roadmap [#24](https://github.com/kotakbiasa/tgcalls-js/issues/24), the supported resolution is the **ffmpeg requirement fallback**. Install `ffmpeg` for container/file/URL audio and video sources and recording/muxing; install `ffprobe` for video metadata and sizing. The `ffmpegPath` and `ffprobePath` options select the executables. Supported container/codec combinations depend on the installed ffmpeg build.

There is no verified ffmpeg-free MP4, WebM or MKV decoder exposed by ntgcalls 3.0.7. This document makes no zero-transcode or compressed-packet passthrough claim. The wrapper decodes media to raw PCM/I420; native WebRTC subsequently handles its transport and encoding.

## What the source types mean

| API/source | Actual behavior | Requirement/limit |
| --- | --- | --- |
| Wrapper `{ kind: 'file', path }` | `audioDescription` / `videoDescription` build native **SHELL** commands that run ffmpeg | A container readable by the installed ffmpeg build, with the requested audio/video stream |
| Wrapper `{ kind: 'url', url }` | ffmpeg opens the URL and produces raw frames; separate `audioUrl` is used for audio when present | Same decoder requirement plus network access |
| Wrapper `{ kind: 'shell', command }` | Caller-owned command produces raw audio | Caller must output 48 kHz stereo signed 16-bit little-endian PCM; this command need not use ffmpeg |
| Native `MediaSource.FILE` | Opens a binary file and reads raw frame-sized chunks | Headerless PCM for audio or planar I420 video matching the description; **no container demux or codec decode** |
| Native `MediaSource.FFMPEG` | Throws `FFmpeg encoder is not yet supported` | Unimplemented for input and audio output in the pinned source/runtime |
| Native `MediaSource.EXTERNAL` | Application supplies raw frames | Requires a real application decoder for compressed inputs; compressed packets are not raw frames |

`MediaSource.FILE` is the native enum, not the wrapper's `kind: 'file'`. Passing an MP4 path to native FILE and observing a resolved `setStreamSources()` promise proves only that the configuration/file was accepted. It does not show that frames were read, decoded, delivered or heard. In the probe below even a JSON file was accepted by FILE as an audio source.

No public `kind: 'media'` or generic native container source is introduced by this fallback. Example using the existing wrapper API:

```ts
await tg.join(group, { kind: 'file', path: './clip.mp4' }, {
  video: { width: 640, height: 360, fps: 25 },
  autoLeave: false,
});
// ffmpeg -> s16le stereo PCM + yuv420p/I420 -> native WebRTC
```

## Pinned source evidence

Wrapper baseline: [`bdb4582dc433a37f54681e9ce93581eac7c389d8`](https://github.com/kotakbiasa/tgcalls-js/tree/bdb4582dc433a37f54681e9ce93581eac7c389d8). Native dependency: **ntgcalls 3.0.7**; inspected upstream revision: [`6cbf3c5404e00f72dcefb85c6b8fb856f7078557`](https://github.com/pytgcalls/ntgcalls/tree/6cbf3c5404e00f72dcefb85c6b8fb856f7078557). These are source/version pins; the installed prebuilt is identified separately by its hash below, not claimed to be a locally reproduced source build.

- [`src/media.ts` audio L10–31](https://github.com/kotakbiasa/tgcalls-js/blob/bdb4582dc433a37f54681e9ce93581eac7c389d8/src/media.ts#L10-L31) and [video L160–183](https://github.com/kotakbiasa/tgcalls-js/blob/bdb4582dc433a37f54681e9ce93581eac7c389d8/src/media.ts#L160-L183): file/URL inputs invoke ffmpeg and return `MediaSource.SHELL`. Audio is `-f s16le -ac 2 -ar 48000`; video is `-f rawvideo -pix_fmt yuv420p` with scaling and an explicit frame rate.
- [`MediaSourceFactory::from_input` L19–54](https://github.com/pytgcalls/ntgcalls/blob/6cbf3c5404e00f72dcefb85c6b8fb856f7078557/ntgcalls/src/media/media_source_factory.cpp#L19-L54): FILE constructs `io::FileReader`; FFMPEG throws at L43–45. [`from_audio_output` L57–78](https://github.com/pytgcalls/ntgcalls/blob/6cbf3c5404e00f72dcefb85c6b8fb856f7078557/ntgcalls/src/media/media_source_factory.cpp#L57-L78) throws the same exception for FFMPEG audio output at L72–74.
- [`FileReader` L9–45](https://github.com/pytgcalls/ntgcalls/blob/6cbf3c5404e00f72dcefb85c6b8fb856f7078557/ntgcalls/src/io/file_reader.cpp#L9-L45): binary `ifstream`, seek and `read(size)`; no media inspection, demuxer or codec decoder. [`ThreadedReader` L27–87](https://github.com/pytgcalls/ntgcalls/blob/6cbf3c5404e00f72dcefb85c6b8fb856f7078557/ntgcalls/src/io/threaded_reader.cpp#L27-L87) requests batches based on `sink_->frame_size()` and splits those bytes into frames.
- [`AudioSink` L9–19](https://github.com/pytgcalls/ntgcalls/blob/6cbf3c5404e00f72dcefb85c6b8fb856f7078557/ntgcalls/src/media/audio_sink.cpp#L9-L19): 10 ms frames, `sample_rate * 16 / 8 / 100 * channel_count` bytes. [`AudioStreamer` L20–26](https://github.com/pytgcalls/ntgcalls/blob/6cbf3c5404e00f72dcefb85c6b8fb856f7078557/ntgcalls/src/media/audio_streamer.cpp#L20-L26) sends these as 16-bit samples. The tested description uses 48 kHz stereo: 1,920 bytes per 10 ms.
- [`VideoSink` L11–22](https://github.com/pytgcalls/ntgcalls/blob/6cbf3c5404e00f72dcefb85c6b8fb856f7078557/ntgcalls/src/media/video_sink.cpp#L11-L22): `width * height * 1.5` bytes per frame. [`VideoStreamer` L20–39](https://github.com/pytgcalls/ntgcalls/blob/6cbf3c5404e00f72dcefb85c6b8fb856f7078557/ntgcalls/src/media/video_streamer.cpp#L20-L39) wraps those bytes as `I420ImageData`. Use even dimensions and matching frame rate. The fixture is 160×90 at 10 fps: 21,600 bytes per frame.
- [`StreamManager` L206–213](https://github.com/pytgcalls/ntgcalls/blob/6cbf3c5404e00f72dcefb85c6b8fb856f7078557/ntgcalls/src/media/stream_manager.cpp#L206-L213) opens configured readers when streams start; [`handle_capture_config` L489–519](https://github.com/pytgcalls/ntgcalls/blob/6cbf3c5404e00f72dcefb85c6b8fb856f7078557/ntgcalls/src/media/stream_manager.cpp#L489-L519) only opens immediately when initialized. An offline configuration acceptance is not an observed playback pass.

## Observed cloud evidence

Probe date: **2026-11-21 UTC**. Target: InstaBox `m_agq62wtsnkqjj3hlchtinfk5fi` (`tgcalls-test`), cwd `/data/home/tgcalls-media-lane-20261121`. Environment: Linux x64, Node **v22.23.3**, npm **10.9.9**, ffmpeg/ffprobe **6.1.1-3ubuntu5**. The lane clones the pinned wrapper baseline; its `node_modules` points to `/data/home/tgcalls-inspection-20261121/node_modules`, used without installation or dependency changes.

Installed native binary `@ntgcalls/linux-x64/ntgcalls.node`: **100896624 bytes**, SHA-256 `0c62cbcc0dd321719738a0678bb207f21b0743d5a0c6a8335c0a5806b44bf7f8`. Native `NTgCalls.ping()` returned `pong`. Observed runtime enums are FILE=1, SHELL=2, FFMPEG=4, EXTERNAL=32; the test imports the enums instead of inferring values from ordinal declarations.

### Native probe

A separate initial `node evidence/native-probe.mjs` run exited **0** with empty stderr:

```text
FFMPEG microphone CAPTURE -> Error: FFmpeg encoder is not yet supported
FILE microphone with headerless s16le fixture -> configuration resolved
FILE microphone with package.json -> configuration resolved (counterexample only)
```

The more complete media probe also observed:

```text
FILE microphone s16le stereo 48000Hz + camera I420 160x90@10 -> configuration resolved
FFMPEG microphone CAPTURE -> FFmpeg encoder is not yet supported
FFMPEG microphone PLAYBACK -> FFmpeg encoder is not yet supported
FFMPEG camera CAPTURE -> FFmpeg encoder is not yet supported
FILE microphone with compressed MP4 -> configuration resolved (NOT decode evidence)
```

These are real native calls on fresh offline P2P placeholders, each stopped afterward. There was no Telegram transport or receiving peer, so native raw playback and delivered remote frames remain unobserved.

### Representative container decode

The test generates one-second synthetic audio/video using real ffmpeg, verifies encoded codecs with ffprobe, runs the **actual wrapper audio/video command strings**, and checks non-silent signed PCM plus detailed, complete I420 frames. All subprocesses finish before constructing `NTgCalls`. This is decoder/output evidence, not a live-call test.

| Container | ffprobe-confirmed encoded codecs | Decoded PCM bytes, 48 kHz stereo s16le | Peak absolute PCM sample | Decoded I420 bytes | Frames, 160×90 at 10 fps |
| --- | --- | ---: | ---: | ---: | ---: |
| MP4 | H.264 + AAC | 192512 | 2979 | 216000 | 10 |
| WebM | VP9 + Opus | 192000 | 2931 | 216000 | 10 |
| MKV | HEVC/H.265 + AAC | 196608 | 2979 | 216000 | 10 |

AAC padding/timestamps make decoded audio lengths differ; the assertions allow approximately one second and check sample alignment. A deliberately corrupt MP4 produced **exit 183**, **0 decoded bytes** with the tested ffmpeg build. The assertion requires nonzero status rather than pinning a platform-specific exit number. The research probe exited **0** with empty stderr; its missing-dependency regression was explicitly excluded and reported separately as failing, so this result is **not** a full test pass.

These outputs were also reproduced by the complete `test/media-support.ts` after it was changed to retain a dependency-guard failure until all independent media probes finish. That complete run exited **1**, never emitted `MEDIA SUPPORT PASS`, and is retained as `verify-media-support.json` / `verification.json`.

The exercised encoder choices were `libx264`, `libvpx-vp9`, `libx265`, `aac`, `libopus`. This matrix is representative, not a guarantee for every codec profile, container combination, platform, ffmpeg build or URL. Upgrade the fixtures/source investigation when changing the native dependency.

### Missing-executable regression and integration requirement

Run the complete regression separately from `npm test`:

```sh
node --import tsx test/media-support.ts
```

The baseline `package.json` only runs `test/run.ts`; adding this file alone does not put it in that command. `npm run typecheck:all` does include it and exited **0** in the cloud lane. The first complete regression run against the pinned baseline exited **1**:

```text
AssertionError [ERR_ASSERTION]: Missing expected exception.
  at missingDependencies (.../test/media-support.ts:55:10)
```

This exposes a missing production guard, not an exempt pre-existing suite failure. The baseline receipt lists **no failing assertion exemption**. The complete regression retains a guard failure while continuing independent media evidence checks, then fails at the end; a research-only probe cannot close this regression.

Required guard behavior before passing a description to native:

- File/URL audio and video descriptions must reject a missing/non-executable `ffmpegPath` (default `ffmpeg`) with a `TgCallsError` subtype; the message identifies the executable and the `ffmpegPath` remedy. Recording commands require the same check.
- Video probing must reject a missing/non-executable `ffprobePath` with a typed error naming `ffprobePath`, rather than silently substituting default dimensions for ENOENT.
- Caller-owned shell/raw sources remain usable without ffmpeg. Resolving an executable should check PATH/file executability without spawning a child after native workers exist; this avoids introducing the known native-thread/process-spawn deadlock into every source helper.

The roadmap branch now implements these guards as `MediaDependencyError` and the complete media regression was rerun in the parent cloud worktree: `node --import tsx test/media-support.ts && npm run build && npm run typecheck:all` returned exit 0 (`media-support-green.json`). Executable discovery checks PATH and file executability without spawning. The research-phase red evidence above is retained as the regression witness. The canonical runner now discovers this entrypoint; the final combined candidate suite is still a separate gate.

One full verification pass on the isolated pinned baseline plus this lane's two artifacts returned:

| Check | Actual exit code | Scope/result |
| --- | ---: | --- |
| `npm run build` | 0 | Pinned wrapper source builds |
| `npm run typecheck:all` | 0 | Includes the new media-support test |
| `npm test` | 0 | Existing `test/run.ts`, `ALL TESTS PASSED`; intentional event-handler `Error: boom` fixture appears on stderr |
| `npm run smoke` | 0 | Built exports verified |
| `node --import tsx test/media-support.ts` | 1 | Container/native probes completed, missing executable guard still fails |
| `git diff --check` | 0 | Tracked patch whitespace check; the lane artifacts were new/untracked |

The overall verification command returned **1**. None of these results verifies the concurrent production changes in other lanes, a combined all-green candidate, Node 20, CI, live media, or a release.

### Reproducibility and receipts

Raw REST result envelopes and fetched pinned sources are retained locally in `/home/ocan/.hermes/cache/scratch/tgcalls-media-lane-20261121/`; cloud receipts are under `/data/home/tgcalls-media-lane-20261121/evidence/`. `evidence.json` records commands/results, pins, runtime/binary details and SHA-256 source receipts. `baseline-with-guard-test.json` preserves the original failing guard run, `research-probe.json` preserves the explicitly limited research-only run, and `source-manifest.json` pins the fetched source bytes. Generated fixtures are removed by the regression after inspection; measured output and hashes stay in the receipts.

To repeat: use the pinned dependencies, install an ffmpeg build with the listed codecs, then run the command above and `npm run typecheck:all`. Do not import this standalone test into a process that already owns native workers: it creates child processes, has a bounded deadline, and exits after stopping its own calls. A pass still requires separate authorized live playback/send/receive testing before claiming remote media support.
