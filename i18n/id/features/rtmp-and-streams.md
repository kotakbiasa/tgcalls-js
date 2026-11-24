# Streaming RTMP & Penonton Siaran

Channel dan supergroup Telegram mendukung **siaran langsung RTMP/STREAM** (mode yang sama dengan OBS Studio). `tgcalls-js` mendukung **kedua sisi**:

1. **Publisher RTMP (`joinRtmp`)** — mengambil URL & stream key RTMP chat lalu meng-upload stream FLV H.264/AAC lewat `ffmpeg`, lengkap dengan antrean video, loop tunggu (`hold`), auto-reconnect, dan penyensoran stream key otomatis di log error.
2. **Penonton Siaran (`joinStreamMode`)** — bergabung ke livestream Telegram sebagai penonton, mengunduh segmen siaran dari media DC yang tepat (`streamDcId`), dan meneruskannya ke `ntgcalls` untuk didekode.

---

## Mengirim Siaran RTMP (`joinRtmp`)

```ts
// 1. Ambil URL & stream key RTMP tanpa me-revoke key yang sedang aktif.
// KEAMANAN: Jangan pernah mencetak `endpoint.key` ke log!
const endpoint = await tg.getStreamRtmpUrl('@channelku');

// 2. Siapkan publisher (allowCreate: true membuat panggilan RTMP baru jika belum ada)
const publisher = await tg.joinRtmp('@channelku', endpoint.url, endpoint.key, {
  allowCreate: true,
  reconnect: { maxAttempts: 5, baseDelayMs: 500, maxDelayMs: 10_000 },
  onStateChange: (state) => console.log('[RTMP] status:', state),
  onError: (err) => console.error('[RTMP] error:', err.message),
});

// 3. Mulai encoding & upload
await publisher.play({ kind: 'file', path: './episode1.mp4' }, {
  width: 1280,
  height: 720,
  fps: 30,
});

// 4. Antrekan video berikutnya & loop tunggu
publisher.queue({ kind: 'file', path: './episode2.mp4' });
publisher.hold({ kind: 'file', path: './tunggu-sebentar.mp4' });

// 5. Kontrol runtime
await publisher.skip();   // pindah ke episode2.mp4
await publisher.pause();  // POSIX SIGSTOP (Linux/macOS)
await publisher.resume(); // POSIX SIGCONT
await publisher.stop();   // hentikan ffmpeg & bersihkan antrean
await publisher.close();  // tutup publisher permanen
```

---

## Menonton Siaran Langsung (`joinStreamMode`)

```ts
tg.on('broadcastError', (chatId, err) => {
  console.error(`[${chatId}] error unduh segmen siaran:`, err);
});

const viewer = await tg.joinStreamMode('@channelku', {
  requireStream: true, // tolak jika server memilih RTC biasa
});

console.log('Mode terhubung:', viewer.mode); // 'RTMP' | 'STREAM'

// Terima frame audio PCM hasil dekode siaran
const off = await tg.onAudioFrame('@channelku', (frame) => {
  // frame.pcm: Buffer (s16le 48kHz mono)
});

off();
await tg.leave('@channelku');
```
