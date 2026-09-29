# Changelog

## Unreleased

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
