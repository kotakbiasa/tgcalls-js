---
name: telegram-premium-emoji
version: 2.0.0
description: >
  Menambahkan emoji kustom premium Telegram ke pesan bot dan menghasilkan kode bot
  yang siap dijalankan dengan ID emoji terverifikasi. Gunakan skill ini setiap kali
  pengguna membuat bot Telegram dan menyebutkan tentang emoji, gaya, atau pesan
  "indah" — bahkan jika mereka hanya mengatakan "buat tampilannya bagus". Skill ini
  juga terpicu untuk: pertanyaan custom_emoji_id, tag HTML tg-emoji, emoji animasi di
  channel, proyek aiogram / python-telegram-bot / telebot yang membutuhkan polesan visual,
  atau permintaan apa pun untuk memperindah postingan channel Telegram. Selalu panggil
  sebelum menulis kode bot Telegram yang melibatkan emoji, ikon, atau pemformatan pesan.
metadata:
  {
    "openclaw":
      {
        "emoji": "✨",
      },
  }
---

# Skill Emoji Premium Telegram

> [!TIP]
> 🎨 **[Buka Halaman Peninjau Animasi (Emoji Preview)](../../assets/emojis/preview.html)**  
> Gunakan halaman web peninjau ini untuk melihat animasi premium kustom secara visual sebelum memilih emoji untuk bot Anda.

Bantu pengguna memilih emoji premium yang tepat untuk bot mereka dan buat kode kerja lengkap yang dapat langsung mereka masukkan ke dalam proyek mereka.

## Langkah 1 — Pahami Bot

Jika pengguna belum menjelaskan bot mereka, tanyakan satu pertanyaan santai:

> "Bisa ceritakan tentang bot Anda: apa fungsinya dan gaya apa yang Anda butuhkan?  
> Contoh: «channel berita, serius» atau «alert kripto, dinamis»."

Jika mereka sudah menjelaskan botnya, lewati pertanyaan ini dan simpulkan dari konteks.

Perhatikan juga **pustaka (library)** apa yang mereka gunakan (aiogram 3, python-telegram-bot, telebot, dll) — sintaks HTML emoji identik di semua pustaka tersebut, tetapi panggilan `send_message` berbeda. Default ke aiogram 3 jika tidak ditentukan.

**Arketipe Bot → Kebutuhan Emoji:**
| Jenis | Emoji Utama untuk Disertakan |
|---|---|
| Berita / Media | breaking alert, fire, pin, mic, link, info, calendar |
| Kripto / Finansial | chart_up, chart_down, dollar/euro/ruble, percent, bell |
| Alat / Utilitas | settings, search, copy, link, info, bookmark, wrench |
| Hiburan | fire, star, like, heart, live-stream |
| Admin / Moderasi | ban, cross, checkmark, key, lock |
| Sosial / Komunitas | people, heart, like, hashtag, announcement |
| Spesifik Aplikasi | ikon dari platform yang dicakup oleh bot (Bagian 2 atau 3) |

## Langkah 2 — Pilih Emoji

Baca `references/emoji-catalog/` (26 sections, 2.691+ unique IDs) lalu pilih **5–12 emoji** — atau cari cepat via `references/emoji-master.json` (1.691 emoji terstruktur dari 9 pack, field-tested 2026-09-01; termasuk RestrictedEmoji 997 animated).

- Paket News Animasi (Bagian 1) untuk konten dinamis dan tindakan UI
- Ikon aplikasi statis (Bagian 2) hanya jika bot secara khusus mencakup aplikasi tersebut
- Ikon aplikasi animasi (Bagian 3) untuk GitHub, Discord, Twitch, live stream, stars
- Ikon B&W minimalis (Bagian 4) untuk UI utilitas yang bersih

Selalu sertakan setidaknya satu emoji utilitas (info, link, checkmark) bersama pilihan spesifik tema — ini muncul di hampir setiap pesan bot.

Untuk setiap emoji yang dipilih, catat:
- `key` — label singkat menggunakan format snake_case yang digunakan dalam kode
- `emoji_id` — string numerik persis dari katalog
- `fallback` — karakter emoji unicode yang relevan (bukan huruf atau kata!)

## Langkah 3 — Buat Kode

Hasilkan file Python lengkap yang siap dijalankan dengan komponen-komponen berikut:

### 3a. Impor dan Kompatibilitas

Selalu mulai dengan:
```python
from __future__ import annotations
```
Satu baris ini membuat semua anotasi tipe kompatibel dengan Python 3.9+, menghindari kesalahan runtime dari `list[str] | None` dan sintaks union serupa.

### 3b. Dict EMOJI + Helpers

```python
import html as _html
import os

# Format: "key": ("emoji_id", "unicode_fallback")
# ID dari <nama paket> — https://t.me/addemoji/<nama_paket>
EMOJI: dict[str, tuple[str, str]] = {
    "breaking": ("5456140674028019486", "🚨"),
    "fire":     ("5424972470023104089", "🔥"),
    # ... entri pilihan Anda
}

def e(key: str) -> str:
    """Mengembalikan tag <tg-emoji>, atau fallback unicode jika key tidak dikenal."""
    if key not in EMOJI:
        return key
    eid, fb = EMOJI[key]
    return f'<tg-emoji emoji-id="{eid}">{fb}</tg-emoji>'

def safe(text: str) -> str:
    """Melakukan HTML-escape pada teks input pengguna sebelum dimasukkan ke dalam pesan."""
    return _html.escape(str(text), quote=False)
```

**Token dan ID channel harus diambil dari variabel lingkungan (environment variables)**, tidak boleh ditulis langsung (hardcoded):
```python
BOT_TOKEN = os.getenv("BOT_TOKEN", "")
CHANNEL_ID = os.getenv("CHANNEL_ID", "@channel_anda")
```

### 3c. Fungsi Message Builder

Tulis 1–3 builder yang disesuaikan dengan jenis bot. Masing-masing harus:
- Menyusun pesan dengan panggilan `e("key")` yang disematkan secara alami dalam f-string
- Membungkus setiap nilai dinamis (input pengguna, data API, judul, nama) dengan `safe()`
- Mengatur `parse_mode="HTML"` (atau `ParseMode.HTML` untuk aiogram)
- Menggunakan `LinkPreviewOptions(is_disabled=True/False)` (bukan `disable_web_page_preview`)

### 3d. Skeleton Bot Minimal

Sebuah fungsi `main()` singkat yang dapat dijalankan untuk menunjukkan cara kerja builder — cukup bagi pengguna untuk menempelkan token mereka dan menjalankannya.

**Untuk aiogram 3**, gunakan `DefaultBotProperties(parse_mode=ParseMode.HTML)` pada Bot sehingga Anda tidak perlu mengatur parse_mode pada setiap panggilan kirim.

**Untuk python-telegram-bot**, teruskan `parse_mode=ParseMode.HTML` pada setiap panggilan `send_message` / `send_photo`.

**Untuk telebot**, teruskan `parse_mode="HTML"` ke `bot.send_message(...)`.

## Langkah 4 — Lembar Periksa Persyaratan (Requirements Checklist)

Setelah blok kode, tambahkan ini sebagai blok komentar Python:

```
# Persyaratan agar emoji premium dapat ditampilkan:
# ✅ Pemilik bot harus memiliki akun Telegram Premium aktif
# ✅ Bot telah ditambahkan ke channel dengan hak «Posting Pesan» (can_post_messages=True)
# ✅ parse_mode="HTML" di setiap panggilan send_message
# ✅ Di dalam tag <tg-emoji> — harus merupakan karakter unicode-эмодзи, bukan huruf/teks
```

## Aturan Baku — Jangan Pernah Dilanggar

**Fallback harus berupa karakter emoji unicode.** Karakter di antara `<tg-emoji>` dan `</tg-emoji>` ditampilkan kepada pengguna yang tidak memiliki Premium. Karakter huruf atau kata di sana akan menyebabkan kesalahan `Bad Request: can't parse entities` dari Telegram.

❌ `<tg-emoji emoji-id="123">api</tg-emoji>` — menggunakan kata, akan error  
✅ `<tg-emoji emoji-id="123">🔥</tg-emoji>` — menggunakan emoji unicode, benar

**Selalu gunakan safe() pada konten dinamis.** Nama repositori yang mengandung `<`, judul berita dengan `&`, atau nama pengguna dengan `>` akan merusak HTML secara tidak sengaja jika tidak di-escape. Fungsi `safe()` mencegah hal ini terjadi.

**Jangan pernah menggunakan MarkdownV2 untuk pesan yang padat emoji.** Tag `<tg-emoji>` hanya didukung di HTML. MarkdownV2 memiliki sintaks yang berbeda (`![🔥](tg://emoji?id=...)`) yang memerlukan proses escape untuk puluhan karakter lain — tidak sebanding dengan usahanya.

**Gunakan hanya ID dari katalog.** Tanpa katalog, Claude dapat berhalusinasi membuat ID yang tampak masuk akal tetapi salah, yang akan ditolak oleh Telegram dengan error `MessageEntityCustomEmojiInvalid`.

## Referensi

- `references/emoji-catalog/` — 26 section: news animasi, ikon app, AI, game, finance, status, premium, + 8 pack hasil live-fetch MTProto (Application Emoji, Social, Logos, Gaming, Streaming, Tech Companies, App Icon, Restricted/Animated Emoji 997).
- `references/emoji-master.json` — 1.691 emoji dari 9 pack dengan custom_emoji_id lengkap (machine-readable, field-tested via MTProto 2026-09-01).
  Baca keempat bagian sebelum memilih emoji.
