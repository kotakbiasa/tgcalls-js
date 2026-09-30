---
name: pyrotgfork
version: 2.2.24
description: "Use when working with PyroTGFork / Pyrogram MTProto in Python: client setup, sessions, handlers, filters, media, raw MTProto, advanced client settings, speedups, storage, plugins, and troubleshooting. Triggers on requests like \"pakai pyrotgfork\", \"userbot\", \"MTProto\", \"ambil pesan dari akun\", \"inline handler dengan Pyrogram\", \"scrape/export chat history\", \"build Telegram client in Python\"."
metadata:
  {
    "openclaw":
      {
        "emoji": "🔥",
      },
  }
---

# PyroTGFork — Telegram MTProto Client Skill

**Version:** 2.2.24 · **Layer:** 225 · **Python:** 3.9+ · **License:** LGPL-3.0

> **Note:** PyroTGFork is an MTProto client — Bot API version compatibility is less relevant, but as of 2026 it tracks the latest MTProto layer.

Use this skill whenever the user works with **PyroTGFork** instead of Bot API frameworks. This covers user-account clients, MTProto automation, inline bots, and advanced Pyrogram usage. For verification, consult `references/llms.txt` before claiming specific API behavior.

## When to use this skill

- Creating or maintaining a Telegram client/session automation with `pyrotgfork`
- Reading/sending messages, media, reactions, stories, or admin actions via MTProto
- Implementing inline bots, callback handling, or raw update handling
- Debugging client issues: flood waits, sessions, storage, disconnects
- Using Smart Plugins, sync wrappers, schedulers, serialization, or proxies
- Comparing MTProto vs Bot API for a given task

## Index of references

- [Full documentation text](references/llms.txt)
- [Client & Sessions](references/client-and-sessions.md)
- [Handlers & Filters](references/handlers-and-filters.md)
- [Media & Files](references/media-and-files.md)
- [Raw MTProto](references/raw-mtproto.md)
- [Plugins, Scheduling, Sync](references/plugins-scheduling-sync.md)
- [Troubleshooting](references/troubleshooting.md)

## Core usage

### Client template

```python
from pyrogram import Client, filters

app = Client("my_account")

@app.on_message(filters.private)
async def hello(client, message):
    await message.reply("Hello from Pyrogram!")

app.run()
```

### Project structure awareness

Main package areas:
- `client.py` — main Client class
- `methods/` — API methods by domain: auth, messages, chats, contacts, users, password, stories, topics, stickers, bots, business, advanced, utilities, phone
- `types/` — Telegram API types
- `filters.py` — update/message filters
- `handlers/` — handler classes
- `dispatcher.py` — update dispatching
- `session/` — session management and internals
- `connection/` — network/transport layer
- `storage/` — session storage backends, including SQLite
- `crypto/`, `raw/`, `enums/`, `errors/`, `parser/`, `utils.py`

## Operational rules

### Session and auth
- Store secrets outside source code: use `.env` or secure config, never hardcode `api_id`, `api_hash`, or bot tokens in committed files.
- For user accounts: require explicit user action for login/code/password; do not automate credential entry silently.
- For bots: `sign_in_bot()` with bot token is supported.
- Export/import session strings only when user explicitly asks; treat them like passwords.

### Updates and handlers
- Prefer handlers/dispatcher over polling raw updates unless the task needs raw MTProto behavior.
- Keep handlers small; extract business logic into services when complexity grows.
- Use bound methods on Telegram objects when available (`Message.reply()`, `InlineQuery.answer()`, `CallbackQuery.answer()`).

### Media and files
- For large uploads/downloads, use streaming/chunked flows when possible; do not load everything into memory.
- Check limits and behavior before assuming Bot API-style limits apply; MTProto has different rules.

### Flood waits and reliability
- Respect Telegram flood waits and backoff; do not blind-retry.
- Use structured logging for production flows: include chat/user context without logging secrets.
- Handle disconnects and reconnects explicitly when running long-lived clients.

### Raw MTProto
- Use raw methods/types only when high-level methods are insufficient.
- Do not invent raw TL constructors; validate against the schema or official docs first.
- When unsure about a method or type, consult `references/llms.txt` or official docs rather than guessing.

### Plugins, scheduling, sync usage
- Smart Plugins, sync wrappers, and schedulers are available; use them to reduce boilerplate, not to hide unsafe global state.
- Scheduling should be cancelable and observable.

## Hard bans

- **Do not** log or expose `api_id`, `api_hash`, `session_string`, or bot tokens.
- **Do not** claim MTProto behavior from memory alone; verify via docs or `references/llms.txt`.
- **Do not** write userbot code that is clearly abusive: mass joins, mass DMs, scraping private data without consent, or bypassing Telegram terms maliciously.
- **Do not** mix this skill’s MTProto patterns with Bot API-only assumptions without calling out the difference.

## Communication

- Use the user's language; keep code identifiers in English.
- If behavior depends on layer/build version, state it explicitly.
- When output fails, diagnose rule/hallucination/schema mismatch first, then patch minimally.
