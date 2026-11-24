# Instalasi & Mulai Cepat

## Kebutuhan Sistem

| Kebutuhan | Alasan |
|---|---|
| Node.js ≥ 18 | Runtime (sudah diuji di Node 20 & 22) |
| `ffmpeg` di `PATH` | Dekode file/URL, perekaman audio gabungan, muxing video, dan encoding RTMP (tidak diperlukan jika hanya memakai `{ kind: 'external' }`) |
| `ffprobe` di `PATH` | Probing resolusi/FPS video dan validasi hasil rekaman folder |
| `yt-dlp` di `PATH` | Hanya diperlukan untuk `joinYouTube()` / `resolveYouTube()` |
| Sesi **akun user** Telegram | Telegram tidak mengizinkan akun bot (`@BotFather`) bergabung ke voice chat |
| `api_id` / `api_hash` | Dari <https://my.telegram.org> |

Instal `ffmpeg` & `yt-dlp`:

```bash
sudo apt-get install ffmpeg        # Debian / Ubuntu
brew install ffmpeg yt-dlp         # macOS
```

## Instal Paket

```bash
npm install --allow-git=all github:kotakbiasa/tgcalls-js#v0.4.0
```

Pasang juga salah satu client MTProto pilihanmu:

```bash
npm install teleproto              # Fork GramJS yang aktif dirawat (Layer 234+)
# atau
npm install @mtcute/node           # Client MTProto modern alternatif
```

---

## Membuat Sesi Akun Pengguna (User Session)

### Dengan `teleproto` / GramJS

Jalankan sekali untuk mendapatkan `StringSession`:

```ts
import { TelegramClient } from 'teleproto';
import { StringSession } from 'teleproto/sessions/index.js';
import input from 'input';

const client = new TelegramClient(new StringSession(''), API_ID, API_HASH, {
  connectionRetries: 5,
});

await client.start({
  phoneNumber: async () => await input.text('Nomor HP (+62...): '),
  password: async () => await input.text('Password 2FA (jika ada): '),
  phoneCode: async () => await input.text('Kode OTP Telegram: '),
  onError: (err) => console.error(err),
});

console.log('Simpan StringSession ini di .env:', client.session.save());
```

### Dengan `@mtcute/node`

`mtcute` menyimpan sesi otomatis ke file SQLite lokal saat `client.start()` dijalankan pertama kali:

```ts
import { TelegramClient } from '@mtcute/node';
import { TgCallsClient } from 'tgcalls-js';

const client = new TelegramClient({
  apiId: Number(process.env.API_ID),
  apiHash: process.env.API_HASH!,
  storage: 'sesi-akun-saya',
});

// PENTING: gunakan start(), bukan connect(), agar loop update MTProto aktif!
await client.start();

const tg = new TgCallsClient({ client });
await tg.join('@grupku', { kind: 'file', path: './lagu.mp3' });
```
