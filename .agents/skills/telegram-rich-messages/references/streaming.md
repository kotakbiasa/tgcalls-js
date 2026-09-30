---
name: streaming
description: Streaming AI replies via sendRichMessageDraft — draft animation, thinking block, finalization.
---

# Streaming AI Replies (Bot API 10.2)

Stream AI-generated text into a Telegram private chat with native draft animation and a "thinking" indicator — the same UX as ChatGPT or Claude, directly inside the bot.

`sendRichMessageDraft` works only with a private integer `chat_id`. Bot API 10.2 permits direct `InputRichMessage.blocks`; the draft lifecycle is unchanged.

## Core Pattern — 4 Mandatory Steps

Skip step 3 and the draft disappears after ~30 seconds.

### Step 1 — Open draft with Thinking block

Send the first `sendRichMessageDraft` immediately after the LLM call starts.
`draft_id` is any non-zero integer you generate once per response; keep it for all updates.
`RichBlockThinking` signals the model is working.

```
POST /sendRichMessageDraft
{
  "chat_id": <integer>,
  "draft_id": 42,
  "rich_message": {
    "markdown": "<tg-thinking>Thinking…</tg-thinking>"
  }
}
```

> Rich HTML tags (like `<tg-thinking>`) are valid pass-through inside the `markdown` field.

> `RichBlockThinking` is **only** valid in `sendRichMessageDraft`. It is never stored in a `Message`.

### Step 2 — Update draft as tokens arrive

Call `sendRichMessageDraft` again with the **same `draft_id`** each time you have enough new text. The client animates the transition.

**Throttle**: send at most once every 1–2 seconds. The draft is ephemeral (~30 s window) — keep sending updates or move to step 3 before the window closes.

Drop the Thinking block from the first update that contains real content.

```python
# pseudocode — generic async LLM stream

draft_id = generate_nonzero_id()
accumulated = ""
last_sent = 0

send_draft(chat_id, draft_id, thinking_markdown())   # step 1

for chunk in llm.stream(prompt):
    accumulated += chunk.text
    now = time.monotonic()
    if now - last_sent >= 1.5:                        # throttle
        send_draft(chat_id, draft_id, accumulated)
        last_sent = now

finalize(chat_id, accumulated)                        # step 3 — mandatory
```

### Step 3 — Finalize with sendRichMessage (mandatory)

After the LLM stream ends, call `sendRichMessage`. This creates the **permanent** message. If you skip this, the draft vanishes.

```
POST /sendRichMessage
{
  "chat_id": <integer>,
  "rich_message": {
    "markdown": "<full generated text>"
  }
}
```

### Step 4 — Edits after finalization

Use `editMessageText` with the `rich_message` parameter to update the permanent message later (corrections, appended content, etc.).

```
POST /editMessageText
{
  "chat_id": <integer>,
  "message_id": <message_id from step 3>,
  "rich_message": {
    "markdown": "<updated text>"
  }
}
```

## Using Block JSON for Streaming (API 10.2)

Instead of markdown, you can use `blocks`:

```json
{
  "chat_id": 123456,
  "draft_id": 42,
  "rich_message": {
    "blocks": [
      {"type": "thinking", "text": "Analyzing your request…"}
    ]
  }
}
```

Then update with content blocks:

```json
{
  "chat_id": 123456,
  "draft_id": 42,
  "rich_message": {
    "blocks": [
      {"type": "sectionHeading", "level": 2, "text": "Result"},
      {"type": "paragraph", "text": "Here is the answer..."}
    ]
  }
}
```

## Constraints

| Constraint | Value |
|-----------|-------|
| Draft window | ~30 seconds between updates |
| Throttle | 1–2 seconds between draft updates |
| `sendRichMessageDraft` scope | Private chats only (integer `chat_id`) |
| `RichBlockThinking` | Draft only — never in final message |
| `draft_id` | Any non-zero integer, stable per response |
| Max thinking text | 4096 chars |
| Max paragraph text | 4096 chars |

## Error Handling

- **Draft expired**: if >30s between updates, start a new draft with a new `draft_id`.
- **Finalize failure**: retry `sendRichMessage` — it is idempotent within the chat.
- **Rate limits**: 429 → back off, reduce update frequency.
- **Thinking block in final message**: API returns error — remove it before `sendRichMessage`.

## Python Helper

```python
import json
import urllib.request

def send_draft(token, chat_id, draft_id, markdown):
    payload = {
        "chat_id": chat_id,
        "draft_id": draft_id,
        "rich_message": {"markdown": markdown}
    }
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/sendRichMessageDraft",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"}
    )
    return json.loads(urllib.request.urlopen(req).read())

def finalize(token, chat_id, markdown):
    payload = {
        "chat_id": chat_id,
        "rich_message": {"markdown": markdown}
    }
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/sendRichMessage",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"}
    )
    return json.loads(urllib.request.urlopen(req).read())
```
