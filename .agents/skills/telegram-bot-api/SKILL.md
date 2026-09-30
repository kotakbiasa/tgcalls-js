---
name: telegram-bot-api
description: "Use for Telegram Bot API limits, effects, and files."
version: 1.2.0
metadata:
  {
    "openclaw":
      {
        "emoji": "📖",
      },
  }
---

# Telegram Bot API — Field-Tested Reference

Referensi Bot API hasil uji live (server lokal aiogram/telegram-bot-api di DownBot + server cloud). Angka & klaim dites langsung, bukan cuma dari docs.

## References

- [Updates & Webhooks](references/updates-and-webhooks.md)
- [Media & Files](references/media-and-files.md)
- [Version History](references/version-history.md)
- [Games & Mini Apps](references/games-and-mini-apps.md)
- [Message Effects](references/message-effects.md) — 6 effect_id terverifikasi; getAvailableEffects hanya ada di MTProto
- [Keyboards & Input](references/keyboards-and-input.md)
- [Advanced Features](references/advanced-features.md)
- [Package Support](references/package-support.md)
- [Payments & Stars](references/payments-and-stars.md)
- [Messages & Formatting](references/messages-and-formatting.md)
- [Chats & Moderation](references/chats-and-moderation.md)
- [Ephemeral & Communities](references/ephemeral-and-communities.md)

## Batas ukuran file (field-tested 2026-09-09)

| Ukuran | Part (512KB) | Hasil |
|---|---|---|
| 100MB / 1GB | 2048 | ✅ sendDocument & rich message document block |
| 1,93GB | 3950 | ✅ |
| 1,953GB (2.097.152.000 B) | 4000 | ✅ |
| 1,97GB | 4036 | ❌ FILE_PARTS_INVALID |
| 2GB pas | 4096 | ❌ |
| 2,1GB | ~4300 | ❌ |

Batas sebenarnya: **4000 part × 512KB ≈ 1,953 GB** — bukan 2GB. Angka "2GB" di docs adalah pembulatan. Klaim 4GB untuk klien MTProto premium (userbot), bukan Bot API.

Via URL (document block pakai http URL): bot api server yang fetch — batas part TETAP berlaku saat re-upload, URL tidak menghilangkan limit. Watch out UA-filtering di hosting sumber (kasus nyata: worker menolak non-browser UA → "failed to get HTTP URL content") dan host IPv6-only.

Kirim ulang file besar tercepat: pakai file_id (instan, tanpa upload ulang; tested 1GB OK). Butuh >2GB → pecah file atau jalur MTProto premium.

## Prinsip penting

- "Tidak ada di docs" ≠ "tidak bisa di Bot API" — probe method & parameter langsung sebelum menyimpulkan (kasus: efek pesan tersedia via message_effect_id meski getAvailableEffects tidak ada di Bot API)
- Daftar ID/limit dari komunitas sering typo — verifikasi live sebelum dipakai
- Rich message document block bisa pakai multipart attach://, URL, atau file_id — pilihan memengaruhi siapa yang melakukan fetch/upload