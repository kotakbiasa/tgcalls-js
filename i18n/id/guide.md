# Panduan Penggunaan

Halaman ini merangkum pola penggunaan utama `tgcalls-js` sehari-hari. Untuk penjelasan teknis mendalam tiap fitur, lihat bagian **Fitur & Panduan** di sidebar.

## 1. Memilih Sumber Audio (`AudioSource`)

```ts
// File lokal
await tg.join('@grupku', { kind: 'file', path: './lagu.mp3' });

// URL langsung / HLS (.m3u8) / Radio stream
await tg.join('@grupku', { kind: 'url', url: 'https://stream.example.com/live.m3u8' });

// YouTube (via yt-dlp)
await tg.joinYouTube('@grupku', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');

// Perintah shell custom (output wajib s16le 48kHz stereo PCM ke stdout)
await tg.join('@grupku', {
  kind: 'shell',
  command: 'ffmpeg -f lavfi -i sine=f=440:r=48000 -f s16le -ac 2 -ar 48000 pipe:1',
});

// Frame PCM eksternal real-time (tanpa ffmpeg — untuk Voice AI / Gemini Live)
await tg.join('@grupku', { kind: 'external', sampleRate: 48000, channels: 1 });
```

## 2. Bot Musik & Antrean Lagu

Gunakan `play()` dan `enqueue()` dibanding `join()` manual jika ingin bot tetap berada di voice chat dan memutar antrean lagu secara berurutan:

```ts
await tg.play('@grupku', { kind: 'file', path: './lagu1.mp3' });
await tg.enqueue('@grupku', { kind: 'file', path: './lagu2.mp3' });
await tg.playNext('@grupku', { kind: 'file', path: './prioritas.mp3' });
await tg.playOnHold('@grupku', { kind: 'file', path: './lofi-tunggu.mp3' });

// Kontrol pemutaran real-time
await tg.seek('@grupku', 30);                  // loncat ke detik 30
await tg.setVolume('@grupku', 130);            // volume 130%
await tg.setSpeed('@grupku', 1.15);            // kecepatan 1.15x
await tg.setAudioFilter('@grupku', 'bassboost'); // efek bassboost
await tg.setLoop('@grupku', 'all');            // ulangi seluruh antrean
```

## 3. Video Kamera & Berbagi Layar (Screen Share)

```ts
import { VideoQuality } from 'tgcalls-js';

// Video kamera 720p30
await tg.join('@grupku', { kind: 'file', path: './video.mp4' }, {
  video: VideoQuality.HD_720p,
});

// Ganti ke screen share (presentasi) di tengah panggilan
await tg.startPresentation('@grupku', { kind: 'file', path: './slide.mp4' }, VideoQuality.HD_720p);
await tg.stopPresentation('@grupku');
```

## 4. Menangani Event & Penutupan Bersih (`dispose`)

Selalu panggil `await tg.dispose()` saat proses Node.js berhenti (`SIGINT`/`SIGTERM`) agar akun tidak tertinggal sebagai "peserta hantu" di voice chat:

```ts
tg.on('connectionChange', (chatId, state) => {
  console.log(`Status koneksi ${chatId}:`, state);
});

tg.on('streamEnd', ({ chatId, source, willAutoLeave }) => {
  console.log(`Selesai memutar di ${chatId}:`, source, { willAutoLeave });
});

process.once('SIGINT', async () => {
  await tg.dispose();
  await client.disconnect();
  process.exit(0);
});
```
