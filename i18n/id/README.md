<div align="center">

<img src="../../docs/assets/logo.png" alt="tgcalls-js logo" width="112" />

# tgcalls-js

**SDK panggilan suara, video, livestream & Voice AI Telegram bergaya `pytgcalls` untuk Node.js.**

Dibangun di atas [`ntgcalls`](https://www.npmjs.com/package/ntgcalls) (engine WebRTC C++ native — binary siap pakai tanpa kompilasi) dan mendukung [`teleproto`](https://www.npmjs.com/package/teleproto), `telegram` (GramJS), maupun [`@mtcute/node`](https://www.npmjs.com/package/@mtcute/node).

[![Documentation](https://img.shields.io/badge/docs-tgcalls--js.gitbook.io-0284C7?style=flat&logo=gitbook&logoColor=white)](https://tgcalls-js.gitbook.io/docs/)
[![Release](https://img.shields.io/github/v/release/kotakbiasa/tgcalls-js?style=flat&color=0EA5E9)](https://github.com/kotakbiasa/tgcalls-js/releases)
[![Node](https://img.shields.io/badge/node-%E2%89%A518-339933?style=flat&logo=node.js&logoColor=white)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-64748B?style=flat)](https://github.com/kotakbiasa/tgcalls-js/blob/main/LICENSE)

</div>

---

## Fitur Utama

| Kemampuan | Yang Tersedia | Panduan |
|---|---|---|
| **Suara & Video Grup** | Putar file lokal, URL, HLS, YouTube (`yt-dlp`), shell PCM custom, video kamera (`360p`–`4K`), dan berbagi layar (presentasi) | [Panggilan Grup](features/group-calls.md) |
| **Musik & Kontrol Room** | Antrean (`play`/`enqueue`/`playNext`/`shuffleQueue`), `seek`, `setVolume`, `setSpeed`, `setAudioFilter` (`bassboost`/`nightcore`/`8d`), `idleTimeoutMs`, `setCallTitle`, `endGroupCall`, `exportCallInvite`, `toggleNativeRecording` | [Pemutaran & Peserta](features/playback-and-participants.md) |
| **Panggilan P2P 1-lawan-1** | Panggilan suara/video E2E masuk & keluar, cek kelayakan tanpa dering (`canRequestCall`), 4-emoji fingerprint, perekaman MP4/audio lawan bicara | [Panggilan P2P](features/p2p-calls.md) |
| **Perekaman (Recording)** | Audio gabungan grup (`.wav`/`.mp3`/`.opus`) dan perekaman folder terpisah per peserta WAV/MP4 + `manifest.json` | [Perekaman](features/recording.md) |
| **RTMP & Livestream** | Publisher RTMP H.264/AAC (`joinRtmp` dengan antrean, hold & reconnect) dan penonton siaran (`joinStreamMode`) | [RTMP & Siaran](features/rtmp-and-streams.md) |
| **Konferensi E2E** | Konferensi multi-peserta terenkripsi (`createConference`, `joinConference`, undangan, cek emoji, pesan E2E di `ntgcalls` 4.x) | [Konferensi E2E](features/conferences.md) |
| **Voice AI & Gemini Live** | Integrasi langsung `connectGeminiLive()`, jembatan PCM `{ kind: 'external' }` tanpa `ffmpeg` dengan resampler (`16k/24k ↔ 48k`), VAD (`onVoiceActivity`), barge-in (`interruptAudio`), serta `onVideoFrame` + `i420ToBmp` | [Voice AI & Gemini Live](features/external-frames.md) |
| **Persistensi Restart** | Penyimpanan state atomik (`statePath`) dan pemulihan eksplisit `resumeFromState()` saat proses restart | [Persistensi](features/persistence.md) |

---

## Instalasi

```bash
# Gunakan tag rilis stabil (npm 12+ membutuhkan --allow-git untuk dependency GitHub)
npm install --allow-git=all github:kotakbiasa/tgcalls-js#v0.4.0
```

**Kebutuhan sistem:** Node.js ≥ 18, sesi **akun pengguna (userbot)** Telegram (akun bot biasa tidak diizinkan Telegram masuk ke voice chat), serta `ffmpeg` / `ffprobe` di `PATH` (opsional jika hanya memakai `{ kind: 'external' }`; `yt-dlp` hanya untuk `joinYouTube()`).

---

## Mulai Cepat

```ts
import { TelegramClient } from 'teleproto';
import { StringSession } from 'teleproto/sessions/index.js';
import { TgCallsClient } from 'tgcalls-js';

const client = new TelegramClient(
  new StringSession(process.env.TG_SESSION!),
  Number(process.env.TG_API_ID),
  process.env.TG_API_HASH!,
  { connectionRetries: 5 },
);
await client.connect();

const tg = new TgCallsClient({ client });

// Putar audio di voice chat grup
await tg.play('@grupku', { kind: 'file', path: './lagu.mp3' });
await tg.enqueue('@grupku', { kind: 'file', path: './berikutnya.mp3' });
await tg.setVolume('@grupku', 125);

// Bersihkan panggilan saat keluar
process.once('SIGINT', async () => {
  await tg.dispose();
  await client.disconnect();
});
```
