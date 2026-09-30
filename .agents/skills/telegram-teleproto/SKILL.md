---
name: telegram-teleproto
version: 1.0.0
description: "teleproto: TS MTProto client (GramJS fork) for Node.js. Use when building Telegram userbots/bots in TypeScript with MTProto — raw API access, sessions, flood-wait handling, Layer 229 features."
metadata:
  {
    "openclaw":
      {
        "emoji": "⚡",
      },
  }
---

# teleproto — TypeScript MTProto Client (Node.js)

**Repo:** https://github.com/sanyok12345/teleproto  
**Docs:** https://docs.teleproto.dev/  
**NPM:** https://www.npmjs.com/package/teleproto  
**Latest:** v1.229.0 (layer-based versioning: `MAJOR.LAYER.PATCH`)  
**License:** MIT  
**Runtime:** Node.js ≥18 (pure JS, no native build, no `node-gyp`)

---

## What is it

A **TypeScript MTProto client** — forked from GramJS (2025), now independently developed. Implements Telegram's binary MTProto protocol (same as official apps), giving **full account access** beyond Bot API:

- **Userbots** — drive a real user account
- **Full history access** — read/edit/delete any message
- **Private channels/groups** — join, manage, monitor
- **Raw TL surface** — every Telegram schema method callable via `client.api.*`
- **No webhook server** — persistent MTProto socket, updates push to you
- **TypeScript native** — full autocomplete on every method, event, TL object

---

## Install

```bash
npm install teleproto
# or
pnpm add teleproto
# or
yarn add teleproto
```

---

## Quick Start

```typescript
import { TelegramClient } from "teleproto";
import { StringSession } from "teleproto/sessions";
import { createInterface } from "node:readline/promises";

const apiId = Number(process.env.TG_API_ID);
const apiHash = process.env.TG_API_HASH!;
const session = new StringSession(process.env.TG_SESSION || "");

const client = new TelegramClient(session, apiId, apiHash, {
  connectionRetries: 5,
});

await client.start({
  phoneNumber: () => rl.question("Phone: "),
  password:    () => rl.question("2FA password: "),
  phoneCode:   () => rl.question("Code: "),
  onError: console.error,
});

console.log(await client.getMe());
console.log("Session string:", client.session.save());
```

---

## Core Concepts

| Component | Purpose |
|-----------|---------|
| `TelegramClient` | Top-level handle — high-level methods + raw `invoke` |
| `StringSession` / `StoreSession` / `MemorySession` | Auth-key persistence (portable, disk, ephemeral) |
| `events` (builders) | `NewMessage`, `EditedMessage`, `CallbackQuery`, `Album`, `Raw` |
| `client.api.*` | Typed facade for every TL method (IDE autocomplete) |
| `client.invoke(new Api.*)` | Raw TL when high-level API isn't enough |
| `teleproto/errors` | Typed RPC errors: `FloodWaitError`, `SessionRevokedError`, etc. |

---

## Event Handling

```typescript
import { NewMessage } from "teleproto/events";

client.addEventHandler(
  (event) => console.log(event.message.message),
  new NewMessage({}), // filter: chats, fromUsers, pattern, etc.
);
```

---

## Raw TL Example

```typescript
import { Api } from "teleproto";

// Typed facade
const dialogs = await client.api.messages.getDialogs({ limit: 10 });
const full = await client.api.users.getFullUser({ id: "me" });

// Manual construction
const config = await client.invoke(new Api.help.GetConfig());
```

---

## Versioning

`MAJOR.LAYER.PATCH` — e.g. `1.228.5` = Major 1, Telegram **Layer 228**, Patch 5

- `^1.225.0` — accept new layers + patches (recommended)
- `~1.225.0` — pin to layer 225 only
- Exact pin: `1.225.1`

---

## When to Use

- Need **MTProto in TypeScript/Node.js** (not Python)
- Want **GramJS alternative** with active independent development
- Building **userbots, multi-account automation, file transfer**
- Need **raw TL access** with full TypeScript types
- Serverless/Alpine/ARM — pure JS, no native deps

---

## Related Skills

- `telegram-wzgram` — Python Pyrogram fork (WarpCrypto)
- `telegram-kurigram` — Python Pyrogram fork (AI drafts, checklists)
- `telegram-bot-api` — Bot API (HTTP) reference
- `telegram-grammy` — TypeScript Bot API framework

---

## Useful Links

- **Docs:** https://docs.teleproto.dev/
- **API Ref:** https://ref.teleproto.dev/
- **GitHub:** https://github.com/sanyok12345/teleproto
- **NPM:** https://www.npmjs.com/package/teleproto
- **Telegram Chat:** linked from docs