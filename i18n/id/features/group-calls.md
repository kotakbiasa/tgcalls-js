# Panggilan Suara & Video Grup

`tgcalls-js` memungkinkan proses Node.js bergabung ke voice chat grup dan livestream channel Telegram untuk mengirim audio, video kamera, atau berbagi layar (presentasi). Di balik layar, library ini mengoordinasikan dua lapisan:

1. **Signaling MTProto** (lewat `teleproto`, `telegram`/GramJS, atau `@mtcute/node`) — me-resolve chat, mengambil atau membuat `InputGroupCall`, mengirim `phone.joinGroupCall`, dan menangkap `UpdateGroupCallConnection`.
2. **Engine media WebRTC native** (`ntgcalls`) — menangani transport ICE/DTLS/SRTP, encoding Opus/H.264, dan pipeline media lewat `ffmpeg` (atau frame terprogram langsung lewat `{ kind: 'external' }`).

> **Mengapa wajib akun pengguna (user account):** API MTProto Telegram melarang token bot (`@BotFather`) bergabung ke voice chat grup. Kamu harus login menggunakan akun pengguna Telegram biasa (`StringSession` di `teleproto`/GramJS atau penyimpanan SQLite di `mtcute`).

---

## Alur Kerja `join()` di Balik Layar

Saat kamu memanggil `tg.join(chat, source, options)`, `tgcalls-js` menjalankan langkah-langkah berikut secara atomik (dan otomatis membersihkan state native maupun MTProto jika salah satu langkah gagal):

1. **Resolve chat:** Mengubah `@username`, link `t.me/...`, ID numerik, atau `bigint` menjadi marked ID channel/supergroup (`-100...`) dan menyimpannya di cache memori untuk pengecekan sinkron (`isActive`, `getCall`).
2. **Ambil atau buat panggilan grup:** Memanggil `channels.getFullChannel` untuk mendapatkan `InputGroupCall` aktif. Jika belum ada dan `allowCreate: true` diberikan (butuh hak admin grup), otomatis membuat voice chat baru lewat `phone.createGroupCall`. Jika tidak, melempar `NoVoiceChatError`.
3. **Alokasi panggilan native:** Memanggil `ntgcalls.createCall(chatId)` satu kali untuk menghasilkan payload JSON WebRTC SDP/SSRC.
4. **Pasang sumber media (`CAPTURE`):** Mem-probe metadata video (jika `video` aktif) dan memanggil `ntgcalls.setStreamSources(chatId, StreamMode.CAPTURE, ...)` sebelum join agar media langsung mengalir begitu koneksi terbuka.
5. **Join lewat MTProto:** Memanggil `phone.joinGroupCall` dengan payload native dan menunggu `UpdateGroupCallConnection` berisi parameter koneksi WebRTC Telegram.
6. **Hubungkan transport:** Meneruskan parameter koneksi ke `ntgcalls.connect(chatId, connParams, false)`. Jika `presentation: true`, kanal berbagi layar juga langsung diinisialisasi dan dihubungkan.

---

## Format Referensi Chat (`ChatRef`)

Semua method **async** (`join`, `play`, `leave`, `pause`, dll.) menerima format berikut:

| Format | Contoh | Catatan |
|---|---|---|
| Marked `bigint` | `-1001234567890n` | Paling cepat — tidak perlu RPC resolusi username |
| Marked `number` | `-1001234567890` | Otomatis dikonversi ke `bigint` |
| Username | `'@grupku'` atau `'grupku'` | Di-resolve lewat MTProto dan di-cache di memori |
| Link publik | `'https://t.me/grupku'` | Dinormalisasi dan di-cache |

---

## Detail Empat Jenis `AudioSource`

### 1. File Lokal (`{ kind: 'file', path }`)

Membaca format audio/video apa pun yang didukung `ffmpeg` (`.mp3`, `.ogg`, `.opus`, `.wav`, `.flac`, `.m4a`, `.mp4`, `.mkv`, `.webm`).

```ts
await tg.join('@grupku', {
  kind: 'file',
  path: './media/podcast.mp3',
});
```

### 2. URL Media Langsung (`{ kind: 'url', url, audioUrl? }`)

Streaming langsung dari URL HTTP/HTTPS, playlist HLS (`.m3u8`), radio Icecast/Shoutcast, atau link CDN. Mendukung stream video dan audio terpisah lewat `audioUrl`.

```ts
await tg.join('@grupku', {
  kind: 'url',
  url: 'https://cdn.example.com/video-720p.mp4',
  audioUrl: 'https://cdn.example.com/audio-best.m4a',
}, {
  video: { width: 1280, height: 720, fps: 30 },
});
```

### 3. Perintah Shell Custom (`{ kind: 'shell', command }`)

Menjalankan perintah shell apa pun yang mengeluarkan **PCM `s16le` 48 kHz stereo (2 kanal)** ke `stdout`.

```ts
await tg.join('@grupku', {
  kind: 'shell',
  command: 'ffmpeg -f lavfi -i sine=frequency=440:sample_rate=48000 -f s16le -ac 2 -ar 48000 pipe:1',
});
```

### 4. Frame Eksternal Real-Time (`{ kind: 'external' }`)

Tanpa `ffmpeg` sama sekali (`MediaSource.EXTERNAL`). Digunakan bersama `pushAudioFrame()`, `pushVideoFrame()`, `onAudioFrame()`, atau `connectGeminiLive()`. Lihat [Voice AI, Gemini Live & Frame Eksternal](external-frames.md).

---

## Opsi Bergabung (`JoinOptions`)

| Opsi | Tipe | Default | Perilaku Detail |
|---|---|---|---|
| `muted` | `boolean` | `false` | Bergabung dalam keadaan mikrofon di-mute |
| `paused` | `boolean` | `false` | Menjeda capture sebelum koneksi transport terhubung |
| `autoLeave` | `boolean` | `true` | Otomatis keluar saat stream selesai (dinonaktifkan jika ada listener `streamEnd` atau antrean aktif) |
| `allowCreate` | `boolean` | `false` | Membuat voice chat baru jika belum ada (wajib admin) |
| `inviteHash` | `string` | — | Hash undangan panggilan (`?videochat=<hash>`) |
| `joinAs` | `ChatRef` | akun sendiri | Bergabung menggunakan identitas channel/peer lain (mis. `joinAs: '@channelku'`) |
| `idleTimeoutMs` | `number` | — | Otomatis keluar dari voice chat jika idle/antrean kosong selama `N` milidetik |
| `video` | `VideoOptions \| false` | — | Mengaktifkan video kamera dari sumber `file`/`url` yang sama |
| `presentation` | `boolean` | `false` | Mengirim video lewat kanal berbagi layar (screen share) |

---

## Video Kamera, Berbagi Layar & Preset `VideoQuality`

| Preset | Resolusi | FPS |
|---|---|---|
| `VideoQuality.UHD_4K` | `3840 × 2160` | `60` |
| `VideoQuality.QHD_2K` | `2560 × 1440` | `60` |
| `VideoQuality.FHD_1080p` | `1920 × 1080` | `60` |
| `VideoQuality.HD_720p` | `1280 × 720` | `30` |
| `VideoQuality.SD_480p` | `854 × 480` | `30` |
| `VideoQuality.SD_360p` | `640 × 360` | `30` |

```ts
import { VideoQuality } from 'tgcalls-js';

await tg.join('@grupku', { kind: 'file', path: './film.mp4' }, {
  video: VideoQuality.HD_720p,
});

// Beralih ke screen share di tengah panggilan
await tg.startPresentation('@grupku', { kind: 'file', path: './demo.mp4' }, VideoQuality.HD_720p);
await tg.stopPresentation('@grupku');
```

---

## Kehadiran Idle (`joinIdle`) & YouTube (`joinYouTube`)

```ts
// YouTube Audio + Video 720p (otomatis mengambil bestvideo + bestaudio terpisah)
await tg.joinYouTube('@grupku', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
  video: VideoQuality.HD_720p,
});

// Bergabung tanpa mengirim suara (cocok untuk bot perekam / pemantau)
await tg.joinIdle('@grupku', { allowCreate: true });
```
