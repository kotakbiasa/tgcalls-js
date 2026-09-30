# Ephemeral Messages & Communities (Bot API 10.2+, reworked in 10.3)

Added in **Bot API 10.2 (July 14, 2026)**; ephemeral parameters were **reworked in Bot API 10.3 (August 24, 2026)**.

Signatures below track the official changelog — verified 2026-08-24 against
<https://core.telegram.org/bots/api-changelog>.

---

## Part 1 — Ephemeral Messages

A message delivered into a group/supergroup but **visible only to one specific user**.
Useful for per-user replies that would otherwise spam the chat: command output, error
notices, callback confirmations, moderation warnings.

### There is no `sendEphemeralMessage`

This is the single most common misconception. Ephemeral messages are sent with the
**ordinary `send*` methods** by passing an `ephemeral_message_parameters` object
(**Bot API 10.3** — replaces the 10.2-era per-method `receiver_user_id` and
`callback_query_id` parameters, which were removed):

| Field of `EphemeralMessageParameters` | Type | Notes |
|---|---|---|
| `receiver_user_id` | `number` | User who will receive the message. **Groups and supergroups only.** |
| `callback_query_id` | `string` (optional) | Identifier of the callback query that triggered this message, if any. |
| `replace_callback_query_message` *(10.3)* | `bool` (optional) | Show the ephemeral message **in place of the original message** instead of as a new one. |

Available on `sendMessage`, `sendPhoto`, `sendVideo`, `sendAudio`, `sendDocument`,
`sendRichMessage`, and the other `send*` methods.

```python
# Bot API 10.3 — reply visible only to the user who pressed the button
await bot.send_message(
    chat_id=group_id,
    text="Only you can see this.",
    ephemeral_message_parameters={
        "receiver_user_id": user_id,
        "callback_query_id": callback_query.id,
    },
)
```

> ⚠️ **Migration from 10.2**: code passing bare `receiver_user_id=` /
> `callback_query_id=` kwargs to `send*` methods must be updated to wrap them inside
> `ephemeral_message_parameters={...}`.
>
> ✅ **Field-tested (2026-08-24, live API)**: the server still **accepts** the old bare
> `receiver_user_id=` style (deprecated, backward-compat — not yet a hard break). New code
> should use the wrapper object anyway.

The returned `Message` carries:

| Field | Type | Meaning |
|---|---|---|
| `receiver_user` | `User` | The user the ephemeral message was addressed to |
| `ephemeral_message_id` | `number` | Identifier **scoped to this chat**, used for later edit/delete |

> ⚠️ `ephemeral_message_id` is **not** a `message_id` and the two are not interchangeable.
> Telegram **reuses** the identifier after the message is deleted or expires — never persist
> it as a long-term key.

### Editing and deleting

These take `(chat_id, receiver_user_id, ephemeral_message_id)` and return `True`
— **not** a `Message` object, so you cannot read back the edited content.

```
editEphemeralMessageText(chat_id, receiver_user_id, ephemeral_message_id,
                         text?, parse_mode?, entities?, rich_message?,      # rich_message new in 10.3
                         link_preview_options?, reply_markup?)  -> true

editEphemeralMessageMedia(chat_id, receiver_user_id, ephemeral_message_id, media, ...)        -> true   # new file uploads supported since 10.3
editEphemeralMessageCaption(chat_id, receiver_user_id, ephemeral_message_id,
                            caption?, show_caption_above_media?, ...) -> true                 # show_caption_above_media new in 10.3
editEphemeralMessageReplyMarkup(chat_id, receiver_user_id, ephemeral_message_id, reply_markup?) -> true
deleteEphemeralMessage(chat_id, receiver_user_id, ephemeral_message_id)                       -> true
```

`text` is limited to **1–4096 characters** after entity parsing. `reply_markup` accepts
`InlineKeyboardMarkup` only — no reply keyboards, no `ForceReply`.

### Delivery is best-effort

Straight from the official docs: *"it is not guaranteed that the user will receive the
message, especially if they are offline"*, and the same applies to edit events.

Consequences for your bot:

- **Never** make an ephemeral message the only carrier of state the user must act on.
- A successful `editEphemeralMessage*` call returning `true` means Telegram accepted the
  edit — **not** that the user saw it.
- Do not build multi-step flows (wizards, FSM) on ephemeral messages. Use a real message
  or a callback answer.

### Replying to an ephemeral message

Via `ReplyParameters.ephemeral_message_id`, with hard constraints:

- A reply to an ephemeral message **must itself be ephemeral**.
- The reply window is **15 seconds** from when the message was sent.
- `ReplyParameters.chat_id` (cross-chat reply) is **not supported** for ephemeral messages.
- Either `message_id` or `ephemeral_message_id` is required — not both.

### Ephemeral vs. the alternatives

| Need | Use |
|---|---|
| Toast/alert on a button press | `answerCallbackQuery` (`show_alert`) |
| Short-lived per-user notice in a group | **ephemeral message** |
| Persistent private content | `sendMessage` to the user's private chat |
| Streaming preview of generated content | `sendRichMessageDraft` (~30 s, private chats) |

---

## Part 2 — Communities

A **community** groups related chats (supergroups and channels) under a shared topic.

### Types

```typescript
// Represents a community (a group of chats).
interface Community {
  id: number;    // Unique identifier for this community
  name: string;  // Name of the community
}

// Service message: a chat was added to a community.
interface CommunityChatAdded {
  community: Community;  // The new community to which the chat belongs
}

// Service message: a chat was removed from a community.
// Currently holds no information.
interface CommunityChatRemoved {}
```

### Handling the service messages

`CommunityChatAdded` and `CommunityChatRemoved` arrive as service messages on `Message`.
Note the asymmetry: **`CommunityChatRemoved` is an empty object** — it does not tell you
which community the chat left. If you need that, record the community from
`CommunityChatAdded` and look it up on removal.

**Bot API 10.3** adds a third event: `CommunityChatJoined` (field
`community_chat_joined` on `Message`) — fired when a **user joins** a chat that belongs to
a community, distinct from the chat itself being added/removed from the community.

```python
async def on_community_chat_added(message):
    c = message.community_chat_added.community
    await store.set_community(message.chat.id, c.id, c.name)

async def on_community_chat_removed(message):
    # No community info in the payload — resolve from your own store.
    previous = await store.pop_community(message.chat.id)
    log.info("chat %s left community %s", message.chat.id, previous)
```

### Guardrails

- Treat `Community.name` as untrusted user input — escape it before putting it in HTML or
  Markdown output.
- `Community.id` is not a `chat_id`; you cannot send messages to a community.
- A chat can be moved between communities, so re-read on every `CommunityChatAdded` rather
  than assuming the first value is permanent.

---

## Related

- [Messages and Formatting](messages-and-formatting.md) — `sendMessage`, `editMessageText`, Rich Messages
- [Chats and Moderation](chats-and-moderation.md) — supergroup and channel administration
- [Rich Messages skill](../../telegram-rich-messages/SKILL.md) — `sendRichMessage` payload shapes
- Official changelog: <https://core.telegram.org/bots/api-changelog>
