# Perekaman (Gabungan & Per-Peserta)

`tgcalls-js` menyediakan tiga mode perekaman panggilan:

| Mode | Jenis Panggilan | Output | Atribusi | Validasi |
|---|---|---|---|---|
| **Audio gabungan** (`startRecording(chat, path)`) | Grup | Satu file `.wav`/`.mp3`/`.opus` | Semua pembicara digabung | Pipe `ffmpeg` |
| **Folder per-peserta** (`startRecording(chat, { dir, video })`) | Grup (RTC / STREAM) | File `.wav` (mic) & `.mp4` (kamera/layar) terpisah per peserta + `manifest.json` | Peer ID + SSRC + perangkat | Drain + validasi `ffprobe` (`status: 'saved'`) |
| **Perekaman P2P** (`listenCalls` / `callUser` `record`) | P2P 1-lawan-1 | Audio lawan bicara atau video+audio `.mp4`/`.mkv` | User ID lawan bicara | Event `recordingStopped` |

---

## 1. Perekaman Audio Gabungan Grup

Berikan string path file ke `startRecording()`. Format kontainer otomatis mengikuti ekstensi file (`.wav`, `.mp3`, `.opus`, `.m4a`):

```ts
await tg.joinIdle('@grupku');

await tg.startRecording('@grupku', './rekaman/rapat.mp3', {
  sampleRate: 48000,
  channels: 1,
});

console.log('Sedang merekam?', tg.isRecording('@grupku'));

// Hentikan dan simpan
const savedPath = await tg.stopRecording('@grupku');
```

---

## 2. Perekaman Folder Per-Peserta (Audio & Video Terpisah)

Berikan objek `FolderRecordingTarget` (`{ dir, video?, sampleRate?, channels? }`) untuk merekam mikrofon, kamera, dan screen share setiap peserta ke file terpisah lengkap dengan rotasi segmen otomatis dan `manifest.json`:

```ts
await tg.joinIdle('@grupku');

tg.on('recordingStopped', (chatId, info) => {
  // Hanya status === 'saved' yang menjamin file selesai ditutup & lolos cek ffprobe
  console.log(`[Segmen #${info.segment}] ${info.device} (${info.status}) -> ${info.path}`, info.peer);
});

tg.on('recordingError', (chatId, err) => {
  console.error('Error perekaman:', err);
});

await tg.startRecording('@grupku', {
  dir: './rekaman/sesi-1',
  video: true,
  sampleRate: 48000,
  channels: 1,
});

// Saat selesai: menguras sisa frame, menutup file, memvalidasi lewat ffprobe, dan menulis manifest.json
const folder = await tg.stopRecording('@grupku');
```

---

## 3. Perekaman Panggilan P2P 1-lawan-1

Rekam suara atau video+suara lawan bicara di panggilan P2P lewat opsi `record` pada `listenCalls()` atau `callUser()`:

```ts
await tg.listenCalls({
  source: { kind: 'file', path: './nada.mp3' },
  record: { path: './rekaman/p2p-default.mp4', video: true },
});

// Override per panggilan keluar
await tg.callUser('@alice', {
  video: true,
  record: { path: './rekaman/alice.mp4', video: true },
});
```
