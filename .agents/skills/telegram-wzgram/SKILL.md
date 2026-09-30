---
name: telegram-wzgram
version: 3.1.1
description: "wzgram: Pyrogram fork with WarpCrypto + latest features. Use when building userbots/bots with MTProto, needing newest Telegram layer, rich messages/ephemeral via Python, or comparing against kurigram."
metadata:
  {
    "openclaw":
      {
        "emoji": "🧬",
      },
  }
---

# wzgram — Modern Pyrogram Fork (MTProto Client)

**Repo:** https://github.com/rjriajul/wzgram  
**Docs:** https://wzgram.com  
**Version:** 3.1.1 (2026-09-03) — **TL Layer 229**  
**License:** LGPL-3.0-or-later  
**Python:** ≥3.10  

> ⚡ **Release Cadence**: Sangat aktif mengejar layer Telegram terbaru (v3.0.36 = Layer 229 & Bot API 10.3; v3.1.0 audit 85 bugfix & 12.602 passing tests; v3.1.1 opt-in rate limiter & memory bounds). Cek PyPI sebelum mengasumsikan batas fitur.

---

## What is it

A maintained **drop-in replacement for Pyrogram** — bisa diimpor via `import wzgram` (sejak v3.0.36) maupun kompatibel penuh dengan kode lama `from pyrogram import ...`. Menambahkan dukungan **fitur Telegram paling mutakhir** yang sering tertunda di upstream:

- **Gifts** (Telegram Gifts)
- **Stories**
- **Topics** (Forum groups)
- **Business Accounts**
- **Giveaways**
- **Premium features**
- **Rich Messages + Rich buttons (10.1–10.3)** — native MTProto path
- **Ephemeral Messages** — dengan method eksplisit `send_ephemeral_message`
- **MessageGenerationStopped handler** — update streaming-stop 10.3
- **Persistent Storage Engines** — `MongoStorage` (v3.0.35+) dan `SQLiteStorage`
- **Opt-in Client-side Rate Limiter** (v3.1.1+) — zero-overhead secara default, aktif via `rate_limits={}`

Built on **WarpCrypto** — high-performance cryptography in Rust (`warpcrypto≥2.0.7`).

---

## Install

```bash
pip install wzgram              # standard
pip install wzgram[fast]        # +uvloop on Linux/macOS
```

---

## Quick Start (same as Pyrogram)

```python
from pyrogram import Client, filters

app = Client("my_account")

@app.on_message(filters.private)
async def hello(client, message):
    await message.reply("Hello from wzgram!")

app.run()
```

---

## Eksklusif vs kurigram 2.2.26 (55 methods lebih banyak)

Audit langsung dari wheel kedua package (Agustus–September 2026):

| Domain | Methods eksklusif wzgram |
|--------|--------------------------|
| **ephemeral/** | `send_ephemeral_message`, `as_ephemeral`, `edit_ephemeral_message_text/media/caption/reply_markup`, `delete_ephemeral_message`, `get/delete_welcome_messages` |
| **rich** | `send_rich_message`, `send_rich_message_draft`, enum `RichButtonStyle` (PRIMARY/DANGER/SUCCESS), type `RichMessageButton` |
| **business/** | `create/get/delete_business_chat_link`, `update_business_intro/away_message/greeting_message/location/work_hours`, `get_connected_bots` |
| **bots/** | `get_admined_bots`, `get_bot_info`, `allow/can_bot_send_message` |
| **handlers** | `message_generation_stopped_handler` (update STOP streaming 10.3), `guest_message_handler`, `managed_bot_updated_handler`, `story_handler` |
| **chats/** | `toggle_anti_spam`, `toggle_forum`, `toggle_slow_mode`, `toggle_signatures`, `get_nearby_chats`, dll |
| **messages/** | `send_checklist`, `edit_message_checklist`, `mark_checklist_tasks_as_done`, `approve/decline_suggested_post`, `edit_fact_check`, `summarize_text`, poll stats/results |
| **listeners/** | `wait_for_message`, `wait_for_callback_query`, `ask`, `register_next_step_handler` (conversation helper) |

kurigram tetap unggul di: AI drafts, beberapa fitur direct-messages. Pilih sesuai kebutuhan.

---

## Fitur & Penyesuaian Penting di wzgram 3.1.0 / 3.1.1

1. **Client-side Rate Limiter Opt-in (v3.1.1+)**:
   Secara default bernilai `None` (mengikuti perilaku Pyrogram hulu menunggu `FloodWait` dari server). Untuk mengaktifkan token bucket bawaan tanpa overhead tak terduga:
   ```python
   # Aktifkan default token bucket limiter:
   app = Client("my_bot", bot_token="...", rate_limits={})
   ```
2. **Persistent Storage Engine (`MongoStorage` v3.0.35+)**:
   Menyimpan session dan peer cache di MongoDB sehingga login tetap utuh saat redeploy container:
   ```python
   from pyrogram.storage import MongoStorage
   storage = MongoStorage("my_session", connection_string="mongodb://localhost:27017")
   app = Client("my_bot", storage=storage)
   ```
3. **Breaking Changes di 3.1.0**:
   - `PaymentForm.photo` diganti menjadi `PaymentForm.photo_url` (berupa string URL, bukan objek `WebDocument`).
   - `delete_scheduled_messages` kini mengembalikan `bool` (bukan `None`).
   - `Invoice` kini menyediakan atribut `photo_url`.
   - `get_users`, `update_birthday`, `translate_text`, `get_chat_menu_button` melempar `ValueError` pada input tidak valid.

---

## Contoh Fitur Baru (native MTProto)

```python
# Import bisa memakai pyrogram atau wzgram langsung (v3.0.36+)
from wzgram import Client, filters
from wzgram.enums import RichButtonStyle, ButtonStyle
from wzgram.handlers import MessageGenerationStoppedHandler

app = Client("my_bot", bot_token="...", rate_limits={})

# Rich message + tombol berwarna (Bot API 10.3 style, via MTProto)
#
# ⚠️ PENTING — ada DUA enum style berbeda, jangan tertukar:
#   - InlineKeyboardButton / KeyboardButton  → butuh `ButtonStyle` (from pyrogram.enums import ButtonStyle)
#   - RichMessageButton (dalam blocks rich)  → butuh `RichButtonStyle`
# Memakai RichButtonStyle pada InlineKeyboardButton biasa TIDAK bekerja.
@app.on_message(filters.command("rich"))
async def rich(client, message):
    from pyrogram.types import InlineKeyboardButton, InlineKeyboardMarkup
    await client.send_message(
        message.chat.id,
        "Laporan siap diunduh.",
        reply_markup=InlineKeyboardMarkup([[
            InlineKeyboardButton("Unduh", style=ButtonStyle.SUCCESS, url="https://example.com")
        ]]),
    )

# Ephemeral — method eksplisit (lebih bersih dari Bot API yang pakai parameter wrapper)
@app.on_message(filters.command("rahasia"))
async def rahasia(client, message):
    await client.send_ephemeral_message(
        message.chat.id,
        receiver_id=message.from_user.id,
        text="Hanya kamu yang lihat.",
    )

# Update STOP streaming (10.3) — handler native
@app.on_message_generation_stopped()
async def gen_stopped(client, update):
    # update.draft_id, update.chat — batalkan generasi
    ...

# Rich buttons NATIVE di dalam blocks rich message (live-tested ✅)
from pyrogram.types import (
    InputRichMessage, InputRichBlockParagraph,
    InputRichBlockButtons, RichMessageButton, CopyTextButton,
)
from pyrogram.enums import BlockAlignment

@app.on_message(filters.command("richbuttons"))
async def richbuttons(client, message):
    msg = InputRichMessage(blocks=[
        InputRichBlockParagraph("Tombol di dalam rich message:"),
        InputRichBlockButtons(buttons=[
            RichMessageButton(text="🟢 Buka", style=RichButtonStyle.SUCCESS, url="https://example.com"),
            RichMessageButton(text="🔴 Aksi", style=RichButtonStyle.DANGER, callback_data="do_thing"),
            RichMessageButton(text="📋 Copy", style=RichButtonStyle.PRIMARY,
                              copy_text=CopyTextButton(text="teks tersalin")),
        ], align=BlockAlignment.CENTER),
    ])
    await client.send_rich_message(message.chat.id, rich_text=msg)
```

> ⚠️ `copy_text` butuh type `CopyTextButton(text=...)`, bukan dict.

> ⚠️ **Catatan live-test**: ✅ **SUDAH DITES LIVE via bot MTProto (2026-08-25, @AyundaraBot, Layer 229)**:
> - `send_ephemeral_message(chat, receiver_id=..., text=...)` → **ok**
> - `edit_ephemeral_message_text(chat, receiver_id, msg_id, text)` → **ok**
> - `send_rich_message` markdown native → **ok**
> - Tombol `InlineKeyboardButton(style=ButtonStyle.SUCCESS/DANGER/PRIMARY)` di pesan biasa → **ok** (⚠️ pakai enum `ButtonStyle`, BUKAN `RichButtonStyle` — dua enum berbeda; `RichButtonStyle` hanya untuk type `RichMessageButton` di dalam blocks rich)
> - `MessageGenerationStoppedHandler` importable ✅
> - `get_welcome_messages`/`delete_welcome_messages` → ❌ `BOT_METHOD_INVALID` — **user-only method**, bukan untuk bot.

---

## Project Structure

```
pyrogram/
├── client.py              # Main Client class
├── connection/            # MTProto connection logic
├── crypto/                # Crypto helpers (uses WarpCrypto)
├── dispatcher.py          # Update dispatcher
├── enums/                 # All Telegram enums (+ RichButtonStyle)
├── errors/                # Exception hierarchy
├── handlers/              # + message_generation_stopped, guest_message, story, business_*
├── methods/               # Organized by domain:
│   ├── account/           # Account settings
│   ├── advanced/          # Advanced features
│   ├── auth/              # Authorization
│   ├── bots/              # Bot-specific methods
│   ├── business/          # Business Accounts
│   ├── chats/             # Chat management
│   ├── ephemeral/         # Ephemeral messages (eksclusif)
│   ├── listeners/         # wait_for_message, ask (conversation)
│   ├── messages/          # + send_rich_message, send_checklist
│   ├── payments/          # Payments/Stars/Gifts
│   ├── stories/           # Stories
│   └── utilities/         # idle, compose
├── raw/                   # Generated TL layer (Layer 229)
└── types/                 # + RichMessageButton, MessageGenerationStopped
```

---

## Key Differences from Upstream Pyrogram

| Feature | Pyrogram | wzgram |
|---------|----------|--------|
| **Crypto** | Python (pyrogram-crypto) | **Rust (WarpCrypto ≥2.0.7)** — faster |
| **Gifts** | ❌ | ✅ |
| **Stories** | ❌ | ✅ |
| **Topics** | Partial | ✅ Full |
| **Business Accounts** | ❌ | ✅ |
| **Ephemeral (explicit methods)** | ❌ | ✅ |
| **Rich Messages native** | ❌ | ✅ |
| **Rate Limiter** | Manual | Built-in (`RateLimiter`, opt-in di 3.1.1+ via `rate_limits={}`) |
| **Storage Engines** | SQLite | **SQLite + MongoStorage** (MongoDB session & cache) |
| **Import Namespace** | `pyrogram` only | `pyrogram` **dan** `wzgram` (v3.0.36+) |
| **QR Login** | ❌ | ✅ (`qrlogin.py`) |
| **API Layer** | Older | **229** (Agustus 2026) |

> ⚠️ **MTProto vs Bot API**: Layer 229 = skema TL MTProto terbaru. Fitur Rich/Ephemeral di
> wzgram adalah jalur **MTProto native** (method eksplisit) — berbeda implementasi dari
> Bot API HTTP (`sendRichMessage` + `ephemeral_message_parameters`), meski konsepnya sama.
> Perbandingan dukungan Bot API library lain: lihat skill `telegram-bot-api` → references/package-support.md.

---

## Development

```bash
git clone https://github.com/rjriajul/wzgram.git
cd wzgram
uv sync --frozen --extra dev    # install deps
uv run poe api                  # regenerate TL types from Telegram
uv run poe test                 # run test suite (unit + e2e + benchmarks)
uv run poe build                # build wheel/sdist
```

---

## When to Use

- Need **MTProto** (userbot / custom client) — not just Bot API
- Want **latest Telegram features** without waiting for upstream
- Migrating existing Pyrogram codebase — **zero import changes** (atau pakai `import wzgram`)
- Performance matters — **WarpCrypto** is significantly faster
- Need **persistent session across container restarts** (`MongoStorage`)
- Need **QR login** for easier user authentication
- Butuh fitur 10.x di Python dengan API paling lengkap (55 method di atas kurigram)

---

## Related Skills

- [kurigram](../kurigram/SKILL.md) — Pyrogram fork aktif lainnya (AI drafts, checklists, direct messages)
- [telegram-bot-api](../telegram-bot-api/SKILL.md) — Bot API (HTTP) reference, bukan MTProto
- [telegram-rich-messages](../telegram-rich-messages/SKILL.md) — Pemformatan Rich Messages & Blocks
- [botforge](../botforge/SKILL.md) — production-grade bot engineering patterns

---

## Useful Links

- **Docs:** https://wzgram.com (atau mirror https://rjriajul.github.io/wzgram)
- **Issues:** https://github.com/rjriajul/wzgram/issues
- **PyPI:** https://pypi.org/project/wzgram/
- **WarpCrypto:** https://github.com/rjriajul/WarpCrypto
