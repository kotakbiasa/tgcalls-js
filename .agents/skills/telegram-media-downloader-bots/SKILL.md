---
name: telegram-media-downloader-bots
version: 1.0.0
description: "Use when maintaining or debugging Telegram media-downloader bots (DownBot @AyundaraBot) — upload failures, empty files, ESM pitfalls, fallback chains, deploy cycle, health checks."
metadata:
  {
    "openclaw":
      {
        "emoji": "⬇️",
      },
  }
---

# Bot Telegram Media-Downloader: Pitfall Upload & Fallback Chain

Pola untuk bot yang mendownload media dari platform eksternal lalu mengirimkannya ke user
via `sendVideo`/`sendPhoto`/`sendAudio`. Direkam dari sesi debugging DownBot
(grammY TypeScript, PM2, yt-dlp fallback chain).

## Trigger

- Bot Telegram error `400: Bad Request: file must be non-empty` saat kirim media
- Log `require is not defined` di project TypeScript/ESM hasil build
- Download YouTube dari VPS gagal padahal kode benar
- Merancang fallback chain multi-sumber (API A → API B → tunnel → yt-dlp)

## 1. `require()` mati di project ESM

Jika `package.json` memakai `"type": "module"` (umum untuk bot TS modern), **jangan**
pakai `require("child_process")` inline di dalam fungsi — hasil build ESM melempar
`ReferenceError: require is not defined`, dan jika dipanggil di dalam `try/catch`,
kegagalannya **senyap** (fungsi selalu masuk branch catch tanpa crash, mis. probe
metadata selalu return kosong → validasi turunannya ikut mati).

```typescript
import { execFileSync } from "child_process"; // ✅ import statis, aman ESM
// const { execFileSync } = require("child_process"); // ❌ mati di ESM
```

Gejala di log produksi: `ffprobe failed for <file>: require is not defined`.
Grep `require(` di seluruh `src/` sebelum deploy build ESM.

## 2. Validasi file kosong SEBELUM upload

Sumber downloader pihak ketiga kadang membalas **HTTP 200 dengan body kosong** — file
0 byte tertulis di disk, kode menganggap download sukses, Telegram menolak upload.
Dua lapis pertahanan:

1. **Di handler**: cek `fs.statSync(path).size === 0` bersamaan cek oversize;
   balas pesan "download gagal" yang jelas ke user, jangan biarkan error 400 mentah.
2. **Di setiap attempt fallback chain**: lempar error bila hasil attempt kosong —
   tanpa ini chain "berhasil" di attempt pertama dan tidak pernah mencoba sumber lain:

```typescript
const isEmptyFile = (p: string) => {
  try { return fs.statSync(p).size === 0; } catch { return true; }
};
// setelah fetchToFile(...) dalam tiap attempt:
if (isEmptyFile(part)) throw new Error("stream is empty (0 byte)");
// catch di luar akan melanjutkan ke sumber berikutnya secara otomatis
```

## 3. Diagnosa kegagalan YouTube di VPS — bedakan mode sebelum ubah kode

| Gejala | Arti |
|--------|------|
| Satu video gagal, video lain sukses via chain sama | Video berlisensi/label besar — proteksi lebih ketat, **bukan bug** |
| Semua client yt-dlp: `Sign in to confirm you're not a bot` | IP datacenter di-flag YouTube |
| URL googlevideo dari API pihak ketiga → HTTP 403 saat di-fetch | URL expired/invalid (umum jika API mengekstraksi dari IP mereka) |
| Tunnel (mis. Cobalt) balas URL tapi fetch = 0 byte / 404 | Ekstraksi server mereka gagal diam-diam untuk video itu |

**Langkah isolasi pertama**: test video pembanding yang pasti tidak berlisensi
(mis. Rick Astley). Kalau sukses → masalah video spesifik, jangan sentuh kode.

Catatan yt-dlp versi baru: butuh JS runtime untuk ekstraksi YouTube — pass
`--js-runtimes node` bila deno tidak ada (Node cukup). Cek plugin PO Token provider
di `~/.config/yt-dlp/plugins/`; provider script hanya jalan bila path
`<repo>/server/build/generate_once.js` benar-benar ada (mode HTTP server lebih awet).

## 4. Verifikasi setelah fix

1. `npm run build` → grep hasil build (`grep -rn "require(" dist/`) harus nol.
2. Restart PM2, cek log boot sampai "bot is running".
3. Test chain end-to-end dengan script kecil yang manggil service langsung
   (bukan lewat bot), cek `statSync(file).size > 0`, lalu cleanup file test.
4. Commit + push setelah verifikasi lolos.

## Terkait

- Skill `grammy` (user-owned): arsitektur middleware & Rich Messages
- Skill `telegram-bot-api` (user-owned): referensi Bot API 10.x


## Deploy Cycle & Health-Check (DownBot pattern)

Applies to `/root/projects/downbot` (@AyundaraBot, PM2) and bots built the same way: per-platform extractor services (`src/services/*.ts`, each `supports/getMetadata/download`) tried in priority order, ending in yt-dlp catch-all.

```bash
cd /root/projects/downbot && npm run build   # tsc → dist/
pm2 restart downbot --update-env             # NEVER edit dist/ manually
git add -A && git commit && git push origin master
```

Health-check via public entry points: `getService(url)` → `getMetadata(url)` (title/thumbnail present) → `download(url)` (**assert every file statSync().size > 0**, then delete). Slow platforms: metadata-only unless regression suspected. Deleted/licensed posts fail everywhere — retest with another URL before blaming the service.
