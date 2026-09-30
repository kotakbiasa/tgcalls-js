# Message Effects (message_effect_id)

Field-tested 2026-09-09 via local Bot API server (aiogram/telegram-bot-api) and cross-checked against docs/changelog.

## Cara kerja

Bot API mendukung **message effects** (animasi muncul saat pesan terkirim) melalui parameter `message_effect_id` pada method-method pengiriman pesan:

- `sendMessage`, `sendPhoto`, `sendVideo`, `sendAnimation`, `sendAudio`, `sendDocument`, `sendSticker`, `forwardMessage`, `copyMessage` (param `message_effect_id`), `sendPaidMedia`, `sendVideoNote`, `sendVoice`
- Field `effect_id` juga ada di class `Message` (efek pesan masuk terbaca di update)

**TIDAK ADA method `getAvailableEffects` di Bot API** (404 di server lokal maupun cloud). Daftar effect ID harus diketahui dari sumber lain — jangan mencari method itu.

## Effect IDs terverifikasi (semua OK 2026-09-09)

| Efek | message_effect_id |
|---|---|
| 👍 Thumbs Up | `5107584321108051014` |
| 👎 Thumbs Down | `5104858069142078462` |
| ❤️ Heart | `5159385139981059251` |
| 🔥 Fire | `5104841245755180586` |
| 🎉 Party Popper | `5046509860389126442` |
| 💩 Pile of Poo | `5046589136895476101` |

Error kalau salah ID: `Bad Request: EFFECT_ID_INVALID`.

## Contoh

```json
{
  "chat_id": 1025855210,
  "text": "Pesan dengan efek fire 🔥",
  "message_effect_id": "5104841245755180586"
}
```

## Batasan

- Efek hanya muncul di **private chat & grup biasa** — tidak berlaku di channel, forum topics, dan sebagian context tertentu (Telegram yang menentukan; kalau context-nya tidak mendukung, pesan tetap terkirim tanpa efek ATAU ditolak tergantung kasus — cek respons server)
- Effect ID adalah int64 string. Tidak bisa ditebak — harus dari daftar valid (di atas) atau dari `messages.getAvailableEffects` di **MTProto** (method itu hanya ada di userbot API, bukan Bot API)
- Efek premium tertentu (mis. beberapa efek berbayar) mungkin hanya tampil bagi pengirim premium; daftar di atas adalah efek gratis yang di-test via bot

## Cek cepat yang jangan dilakukan

- Jangan cari `getAvailableEffects` di Bot API — tidak ada (field-tested: 404 di lokal & cloud server)
- Daftar ID yang beredar di komunitas sering ada typo 1 digit (mis. `5046509860389126444` valid, `5046509860389126444`+typo → EFFECT_ID_INVALID). Selalu verifikasi live sebelum pakai.
