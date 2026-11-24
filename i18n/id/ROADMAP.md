# Status Roadmap

Melacak progres roadmap panggilan Telegram ([#25](https://github.com/kotakbiasa/tgcalls-js/issues/25) — sudah selesai dan ditutup di **`v0.4.0`**).

| Issue | Fitur | Status | Bukti Verifikasi Live |
|---|---|---|---|
| **#17** | Preflight panggilan P2P tanpa dering (`canRequestCall`, `getCallDenialReason`) | ✅ Selesai | Terverifikasi live di `teleproto` & `mtcute` |
| **#18** | Perekaman folder per-peserta (`.wav` + `.mp4` + `manifest.json`) | ✅ Selesai | Terverifikasi live (rotasi segmen audio & kamera MP4) |
| **#19** | Perekaman panggilan keluar P2P (video+audio MP4) | ✅ Selesai | Terverifikasi live (`1280×720` H.264/AAC MP4) |
| **#20** | Publisher RTMP (`joinRtmp`) & Penonton Siaran (`joinStreamMode`) | ✅ Selesai | Terverifikasi live di ingest RTMP Telegram & DC 5 |
| **#21** | Konferensi E2E (`createConference`, `joinConference`, 4-emoji, pesan E2E 4.x) | ✅ Core Selesai | Audio E2E 2 akun + 4-emoji cocok; kick/rekey menunggu upstream `ntgcalls` |
| **#22** | Persistensi state grup & `resumeFromState()` | ✅ Selesai | Terverifikasi live (fresh rejoin + segmen rekaman baru) |
| **#23** | Unwrap `phone.PhoneCall` pada `confirmCall` P2P keluar | ✅ Selesai | Terverifikasi live (`servers=2`, `CONNECTED`) |
| **#24** | Dokumentasi batas decoder native & validasi `ffmpeg`/`ffprobe` | ✅ Selesai | Terdokumentasi di [Dukungan Media](media-support.md) |
| **v0.4.0** | Integrasi **Gemini Live (`connectGeminiLive`)**, Voice AI Toolkit, Filter Audio & Admin Room | ✅ Selesai | Terverifikasi live lewat panggilan P2P Telegram dengan Gemini Live |
