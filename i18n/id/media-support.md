# Dukungan Media & Decoder

`tgcalls-js` berjalan di atas `ntgcalls@3.0.7` dan memanfaatkan `ffmpeg` + `ffprobe` untuk dekode kontainer media, probing resolusi video, muxing perekaman, serta upload RTMP.

## Ringkasan Kebutuhan Binary Eksternal

| Mode / Fitur | `ffmpeg` | `ffprobe` | `yt-dlp` |
|---|---|---|---|
| `{ kind: 'external' }` / `connectGeminiLive()` | **Tidak perlu** | **Tidak perlu** | **Tidak perlu** |
| `{ kind: 'shell', command }` | Opsional (sesuai command) | Tidak perlu | Tidak perlu |
| `{ kind: 'file' }` / `{ kind: 'url' }` (Audio saja) | **Wajib** | Tidak perlu | Tidak perlu |
| `{ kind: 'file' }` / `{ kind: 'url' }` (+ Video / Screen Share) | **Wajib** | **Wajib** | Tidak perlu |
| `joinYouTube()` / `resolveYouTube()` | **Wajib** | Opsional (jika video) | **Wajib** |
| Perekaman gabungan (`startRecording(chat, path)`) | **Wajib** | Tidak perlu | Tidak perlu |
| Perekaman folder per-peserta (`{ dir, video }`) | **Wajib** (jika `video: true`) | **Wajib** | Tidak perlu |
| Publisher RTMP (`joinRtmp`) | **Wajib** | Opsional | Tidak perlu |

## Mengapa `MediaSource.SHELL` + `ffmpeg` Dipakai untuk File/URL?

`MediaSource.FILE` bawaan `ntgcalls` hanya membaca PCM mentah tanpa demuxer kontainer, sedangkan `MediaSource.FFMPEG` tidak diaktifkan pada build prebuilt `ntgcalls@3.0.7`. Oleh karena itu, `tgcalls-js` secara otomatis mem-pipe output `ffmpeg` (`s16le` 48 kHz untuk audio dan `yuv420p` I420 untuk video) atau menggunakan `MediaSource.EXTERNAL` untuk Voice AI tanpa proses eksternal.
