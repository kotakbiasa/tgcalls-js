# Roadmap

Status per **v0.8.0** (2026-11-20). Tracking issue: [#25](https://github.com/kotakbiasa/tgcalls-js/issues/25).

Reference point: [MadelineProto — Telegram voice/video/group calls](https://docs.madelineproto.xyz/docs/CALLS.html).

## Sudah jalan

| Fitur | Bukti |
|---|---|
| P2P 1:1 voice + video, dua arah (teleproto & mtcute) | live: `state 1 → 2`, `Encoder is active`, `First audio RTP packet sent to pacer` |
| `callUser(userId, { video })` | v0.8.0, live verified |
| `listenCalls()` auto-jawab + gate `onIncoming` | live verified |
| playlist: `play` / `then` / `playOnHold` / `pause` / `resume` / `skip` / `clearQueue` | offline tests |
| screen share (`startPresentation` / `stopPresentation`) | offline tests |
| recording: audio-only atau mux mp4 (panggilan masuk + grup) | live: 1280x720@25, 252 frame, audio ada |
| `getEmojiFingerprint()` (parity `getVisualization`) | `573faee` |
| `remoteSourceChange` event (parity `onStreams`) | `573faee` |
| `getConnectionMode()` → NONE / RTC / STREAM / RTMP | `573faee` |

## Belum selesai

| # | Item | Ukuran | Catatan |
|---|---|---|---|
| [#17](https://github.com/kotakbiasa/tgcalls-js/issues/17) | `canRequestCall` / `getCallDenialReason` | kecil | cek privasi peer sebelum menelepon |
| [#19](https://github.com/kotakbiasa/tgcalls-js/issues/19) | rekaman panggilan **keluar** | kecil | `REC_PATH` diabaikan jalur `call()` |
| [#18](https://github.com/kotakbiasa/tgcalls-js/issues/18) | rekaman per-peserta + folder mode | sedang | pakai `remoteSourceChange` yang sudah ada |
| [#23](https://github.com/kotakbiasa/tgcalls-js/issues/23) | RTC server hilang di mtcute | sedang | `phone.getCall` tak ada di skema TL mtcute 0.32 → `servers=0`, rawan `state 8` |
| [#20](https://github.com/kotakbiasa/tgcalls-js/issues/20) | livestream / RTMP / stream mode | sedang | ntgcalls sudah punya `sendBroadcastPart` |
| [#21](https://github.com/kotakbiasa/tgcalls-js/issues/21) | conference call E2E (+ MultiCall) | besar | `initConference` + `CallType.CONFERENCE` sudah ada di native |
| [#22](https://github.com/kotakbiasa/tgcalls-js/issues/22) | persistensi lintas restart | besar | sesi, playlist, rekaman |
| [#24](https://github.com/kotakbiasa/tgcalls-js/issues/24) | format mp4/webm/mkv tanpa ffmpeg | riset | sekarang wajib transcode ffmpeg |

## Batasan yang diketahui (jangan diklaim sudah beres)

- **mtcute + panggilan keluar**: `phone.confirmCall` tidak membawa `connections`, dan `phone.getCall` tidak ada di skemanya. Panggilan tersambung hanya kalau callee cepat mengangkat; kalau lambat → ICE `TIMEOUT` (`state 8`). Lihat #23.
- **Rekaman panggilan keluar** belum ada; hanya jalur masuk dan grup (#19).
- **Format media**: semua lewat ffmpeg (rawvideo I420 + s16le PCM). Tanpa ffmpeg, `source: {kind:'file'}` tidak jalan (#24).
- **Conference call & livestream** belum disentuh sama sekali; native sudah menyediakan API-nya (#20, #21).
- **Restart** menghapus semua state proses: panggilan, antrean, dan writer rekaman (#22).

## Urutan yang disarankan

1. #17, #19, #18 — murah, langsung terasa, semua bisa diuji offline + satu panggilan live.
2. #23 — memperbaiki keandalan panggilan keluar di mtcute.
3. #20 — livestream/RTMP, butuh kredensial RTMP asli untuk verifikasi.
4. #21 — conference, pekerjaan terbesar; pecah jadi: create/join → blok exchange → emoji → MultiCall.
5. #22 — persistensi, paling akhir karena bergantung pada bentuk state di atas.
