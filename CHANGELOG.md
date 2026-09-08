# Changelog

## 0.1.0 (2026-09-08)

First release. Audio-only.

- `join()` / `joinYouTube()` with file / URL / shell PCM sources
- `setSource()` — swap track without leaving (queue support)
- `pause` / `resume` / `mute` / `unmute` / `leave` / `time`
- Events: `streamEnd`, `connectionChange`, `update`
- Works with GramJS (`telegram`) and teleproto; offline test suite with fake
  MTProto + real ntgcalls native core
