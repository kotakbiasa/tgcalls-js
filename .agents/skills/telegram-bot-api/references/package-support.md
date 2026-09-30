# Dukungan Fitur per Package/Library (per 2026-08-25)

Versi library vs fitur Bot API/Telegram yang mereka dukung. Verifikasi ke npm/PyPI registry langsung.

## Library Bot API (HTTP)

| Library | Versi terbaru | Rilis | Track Bot API | 10.1 Rich | 10.2 Blocks/Ephemeral | 10.3 Buttons/EphParams |
|---|---|---|---|---|---|---|
| **grammY** (TS) | 1.46.0 | 2026-08-26 | **10.3** (bundel @grammyjs/types 5.0.0 native) | ✅ | ✅ | ✅ |
| **@grammyjs/types** (TS, types only) | **5.0.0** | **2026-08-25** | **10.3 penuh** — EphemeralMessageParameters, RichBlockButtons, DisabledButton, MessageGenerationStopped, CommunityChatJoined semua ada | ✅ | ✅ | ✅ |
| **aiogram** (Py) | 3.31.0 | 2026-08-26 | **10.3** (wrapper first-class Rich & Ephemeral) | ✅ | ✅ | ✅ |
| **python-telegram-bot** (Py) | 22.8 | 2026-06-12 | **10.0** | ❌ | ❌ | ❌ |
| **node-telegram-bot-api** (TS) | 2.1.0 | — | ~10.1 (sendRichMessage ada di changelog repo) | ✅ | ⚠️ parsial | ❌ |
| **Telegraf** (TS) | 4.16.3 | — | ~9.x–10.0 (lambat mengikuti) | ❌ | ❌ | ❌ |

## Library MTProto (userbot/client) — Layer TL

> MTProto ≠ Bot API: fitur Rich Messages / Ephemeral Messages adalah domain Bot API HTTP.

| Library | Versi | Rilis | TL Layer |
|---|---|---|---|
| **wzgram** (Pyrogram fork + WarpCrypto) | 3.1.1 | **2026-09-03** | **229** (terbaru) |
| **kurigram** (Pyrogram fork) | 2.2.26 | **2026-09-12** | 228 |
| **pyrotgfork** (Pyrogram fork) | 2.2.24 | 2026-05-16 | ~225 |
| **Pyrogram** (upstream) | 2.0.106 | lama/stagnan | jauh tertinggal |

## Matriks fitur baru → siapa yang siap

| Fitur (versi) | grammY | aiogram | PTB | node-tg-api | Telegraf |
|---|---|---|---|---|---|
| Rich Messages sendRichMessage (10.1) | ✅ | ✅ | ❌ | ✅ | ❌ |
| InputRichMessage.blocks (10.2) | ✅ | ✅ | ❌ | ⚠️ | ❌ |
| Ephemeral messages (10.2) | ✅ | ✅ | ❌ | ⚠️ | ❌ |
| Communities (10.2) | ✅ | ✅ | ❌ | ⚠️ | ❌ |
| Guest mode (10.0) | ✅ | ⚠️ | ❌ | ⚠️ | ❌ |
| Rich buttons RichBlockButtons (10.3) | ✅ (1.46+) | ❌ | ❌ | ❌ | ❌ |
| EphemeralMessageParameters wrapper (10.3) | ✅ (1.46+) | ❌ | ❌ | ❌ | ❌ |
| DisabledButton (10.3) | ✅ (1.46+) | ❌ | ❌ | ❌ | ❌ |
| can_stop streaming drafts (10.3) | ✅ (1.46+) | ❌ | ❌ | ❌ | ❌ |

## Panduan praktis

- **Butuh 10.3 sekarang juga**: grammY 1.46+ — **sudah bundel @grammyjs/types 5.0.0 native** (rilis 26 Agu 2026). Rich buttons block lolos serializer tanpa workaround. Versi lama (1.45): override `@grammyjs/types@5.0.0` atau HTTP fetch langsung. Detail: skill telegram-rich-messages → Field-Tested Notes.
- **Produksi stabil di 10.2**: aiogram 3.30 / grammY 1.45 apa adanya.
- **Userbot layer terbaru**: wzgram 3.1.1 (Layer 229, rilis 3 Sep 2026).
- **Cek mandiri**: spec JSON harian <https://github.com/PaulSonOfLars/telegram-bot-api-spec>.

## Riwayat rilis singkat library (kapan terakhir update)

- grammY: aktif (rilis ±bulanan mengikuti Bot API)
- aiogram: aktif (3 rilis sejak Mei 2026)
- python-telegram-bot: melambat (terakhir Jun 2026, masih 10.0)
- kurigram/wzgram/pyrotgfork: keluarga Pyrogram fork aktif berlomba layer
