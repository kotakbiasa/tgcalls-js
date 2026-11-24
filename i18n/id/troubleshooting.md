# Pemecahan Masalah (Troubleshooting)

## 1. Binary Native `ntgcalls` Tidak Terinstal

`ntgcalls` mendistribusikan binary C++ siap pakai lewat `optionalDependencies` (`@ntgcalls/linux-x64-gnu`, `@ntgcalls/darwin-arm64`, `@ntgcalls/win32-x64-msvc`, dll). Jika `npm` melewati optional dependencies:

```bash
npm install --include=optional ntgcalls
```

## 2. Error `MediaDependencyError: ffmpeg/ffprobe not found`

Pastikan binary `ffmpeg` dan `ffprobe` terpasang di sistem atau berikan path lengkapnya saat membuat `TgCallsClient`:

```ts
const tg = new TgCallsClient({
  client,
  ffmpegPath: '/usr/local/bin/ffmpeg',
  ffprobePath: '/usr/local/bin/ffprobe',
  ytDlpPath: '/usr/local/bin/yt-dlp',
});
```

> **Catatan:** Jika kamu hanya memakai `{ kind: 'external' }` (misalnya untuk Voice AI / `connectGeminiLive`), `ffmpeg` **tidak diperlukan sama sekali**.

## 3. Panggilan P2P di `@mtcute/node` Tidak Menerima Update

Di `mtcute`, `await client.connect()` hanya membuka koneksi socket tanpa menyalakan dispatcher update. Selalu gunakan **`await client.start()`** agar `updatePhoneCall` dan `UpdateGroupCallConnection` diterima oleh `tgcalls-js`.

## 4. Terputus Setelah ~25 Detik di VPS yang Memblokir UDP

WebRTC membutuhkan koneksi UDP keluar. Pada host yang memblokir semua UDP:
- Untuk kehadiran idle (`joinIdle`), gunakan `await tg.joinIdle(chat, { allowCreate: true })` saat membuat voice chat baru (otomatis dibuat dalam mode RTMP-stream).
- Untuk siaran video/audio satu arah di channel/grup, gunakan `joinRtmp()` yang berjalan murni di atas TCP (RTMP/RTMPS).

## 5. Error `USER_PRIVACY_RESTRICTED` Saat `callUser()`

Target pengguna membatasi siapa yang boleh menelepon mereka di pengaturan privasi Telegram. Gunakan `await tg.getCallDenialReason(user)` sebelum memanggil `callUser()` untuk mengecek alasan penolakan tanpa membunyikan dering telepon.
