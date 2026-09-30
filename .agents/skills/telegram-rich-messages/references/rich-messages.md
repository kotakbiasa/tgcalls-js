---
name: rich-messages
description: Complete reference documentation and practical guide for Bot API 10.2.
---

# Telegram Rich Messages Reference

Source snapshot: official Telegram Bot API docs checked on 2026-07-14 (Bot API 10.2).

For every object and method subsection under `#rich-messages`, see `api-objects.md`.

Official links:
- https://core.telegram.org/bots/api#rich-message-formatting-options
- https://core.telegram.org/bots/api#rich-markdown-style
- https://core.telegram.org/bots/api#rich-html-style
- https://core.telegram.org/bots/api#sendrichmessage
- https://core.telegram.org/bots/api#sendrichmessagedraft
- https://core.telegram.org/bots/api#richblockdivider
- https://core.telegram.org/bots/features#rich-messages

## API Objects

`InputRichMessage` describes content to send. Choose exactly one of `html`, `markdown`, or `blocks`:

- `html`: rich message content in Rich HTML.
- `markdown`: rich message content in Rich Markdown.
- `blocks`: array of `InputRichBlock*` objects for direct outgoing block JSON (API 10.2).
- `is_rtl`: pass true for right-to-left rendering.
- `skip_entity_detection`: pass true to disable automatic detection of URLs, email, usernames, hashtags, cashtags, bot commands, phone numbers, and bank cards.

## Content input fields

`InputRichMessage` has exactly one of these fields (API 10.2):

| Field | When to use |
|-------|-------------|
| `html` | Rich HTML with Telegram-specific tags |
| `markdown` | GitHub-Flavored Markdown + Telegram extensions |
| `blocks` | Direct `InputRichBlock*` JSON array (API 10.2) |

**Precedence**: if multiple fields are provided, `blocks` > `markdown` > `html`.

## sendRichMessage

`sendRichMessage` requires:
- `chat_id`
- `rich_message`

Optional common fields include:
- `business_connection_id`
- `message_thread_id`
- `direct_messages_topic_id`
- `disable_notification`
- `protect_content`
- `allow_paid_broadcast`
- `message_effect_id`
- `suggested_post_parameters`
- `reply_parameters`
- `reply_markup`

`sendRichMessageDraft` has the same signature, but creates a draft (animated, streaming) message instead of a final one.

## Rich Markdown Syntax

GitHub-Flavored Markdown with Telegram extensions:

| Syntax | Renders as |
|--------|------------|
| `# H1` — `###### H6` | Section headings |
| `**bold**` | Bold text |
| `*italic*` | Italic text |
| `~~strike~~` | Strikethrough |
| `==marked==` | Highlighted text |
| `` `code` `` | Inline code |
| ```` ``` ```` | Code block |
| `> quote` | Block quote |
| `> details: Summary` | Collapsible details |
| `---` | Divider |
| `| ... | ... |` | Table |
| `$$...$$` | Block math |
| `$...$` | Inline math |
| `[text](url)` | Link |
| `![alt](url)` | Image (media binding) |
| `footnote[^1]` | Footnote |

## Rich HTML Tags

| Tag | Purpose |
|-----|---------|
| `<b>` `<i>` `<u>` `<s>` | Bold, italic, underline, strikethrough |
| `<tg-spoiler>` | Spoiler |
| `<code>` `<pre>` | Code |
| `<a href="...">` | Link |
| `<tg-emoji emoji-id="...">` | Custom emoji |
| `<blockquote>` | Block quote |
| `<blockquote expandable>` | Collapsible block |
| `<table>` `<tr>` `<td>` `<th>` | Table |
| `<img src="...">` | Image (media binding) |
| `<section>` | Section group |

## Outgoing Block JSON (API 10.2)

Pass `rich_message.blocks` for precise layout control. Each block is an `InputRichBlock*` object:

### Block types

| type | Object | Fields |
|------|--------|--------|
| `sectionHeading` | `InputRichBlockSectionHeading` | `level` (1–6), `text` |
| `paragraph` | `InputRichBlockParagraph` | `text` |
| `table` | `InputRichBlockTable` | `header` (array), `rows` (array of arrays), `column_span` |
| `details` | `InputRichBlockDetails` | `summary`, `content` |
| `collage` | `InputRichBlockCollage` | `media` (array of `InputMediaBinding`) |
| `slideshow` | `InputRichBlockSlideshow` | `media` (array of `InputMediaBinding`) |
| `map` | `InputRichBlockMap` | `latitude`, `longitude`, `zoom`, `caption` |
| `mathematicalExpression` | `InputRichBlockMathematicalExpression` | `expression`, `inline` |
| `thinking` | `InputRichBlockThinking` | `text` (streaming thinking indicator) |
| `divider` | `InputRichBlockDivider` | (no fields) |
| `footer` | `InputRichBlockFooter` | `text` |

## Media Bindings (API 10.2)

Each media element in a block uses `InputMediaBinding`:

```json
{
  "type": "photo",
  "media": "https://example.com/image.jpg",
  "caption": "Optional caption",
  "cover": "https://example.com/thumb.jpg"
}
```

### Media types

| type | Description |
|------|-------------|
| `photo` | Image |
| `video` | Video file |
| `animation` | GIF/animation |
| `audio` | Audio file |

### `media` field values

| Value | Description |
|-------|-------------|
| `https://...` | Remote URL (Telegram fetches) |
| `file_id` | Previously uploaded file |
| `attach://name` | Multipart upload (POST with multipart/form-data) |

### Multipart upload example

```bash
curl -s -X POST "https://api.telegram.org/bot$TOKEN/sendRichMessage" \
  -F "chat_id=@mychannel" \
  -F 'rich_message={"blocks":[{"type":"collage","media":[{"type":"photo","media":"attach://photo1"}]}]}' \
  -F "photo1=@/path/to/photo.jpg"
```

### `cover` field

For slideshow/video blocks, `cover` specifies a poster image:
```json
{
  "type": "video",
  "media": "https://example.com/video.mp4",
  "cover": "https://example.com/poster.jpg"
}
```

## Streaming via sendRichMessageDraft (API 10.2)

1. **Draft**: call `sendRichMessageDraft` with `RichBlockThinking` block → animated draft message appears in chat.
2. **Finalize**: call `sendRichMessage` (same chat, no draft flag) → replaces draft with final message.

See `references/streaming.md` for full pattern.

## Digest Patterns (API 10.2)

- **Flat layout**: all sections visible in one message.
- **Preview + collapsed**: short preview text, expandable `<details>` with full content.
- **Media as evidence**: photos/screenshots embedded as proof.
- **Preflight gate**: validate block count, size limits before publishing.

See `references/digest.md` for full patterns.

## Limits

**Verified 2026-09-07** — cross-checked against official docs "Rich Message Limits" section + live field-tests. Old spec numbers that the server does NOT enforce are marked accordingly.

| Limit | Value |
|-------|-------|
| Max TOTAL text per rich message | **32768 chars** (docs + field-tested: 32768 ok / 32769 → `RICH_MESSAGE_TEXT_TOO_LONG`) |
| Max blocks per message | 500 (docs; field-tested 500 ok / 501 rejected) — includes nested blocks |
| Max media total per message | 50 (docs "50 media attachments in total"; aggregate across photo + slideshow + collage; 50 ok / 51 → `RICH_MESSAGE_MEDIA_TOO_MANY`) |
| Max buttons per buttons-block | **8** (field-tested: 8 ok / 9 rejected) — blocks mode ONLY; inline `<tg-button>` in HTML/markdown is unlimited (50 inline ✅) |
| Button callback_data | 64 bytes (65 rejected, both modes) |
| Button labels | no dedicated cap; count toward the 32768 total text budget |
| Max nesting | 16 levels (docs); field-tested nested details 15 ok / 16 rejected — stay ≤ 14 |
| Max table columns | 20 (docs; field-tested 20 ok / 21 rejected) |
| Max table rows | NOT enforced (spec said 50; 200 rows ✅) |
| Max footer text | NOT enforced (spec said 200; 4096 ✅) |
| Max collage media | NOT enforced (spec said 10; 50 ✅ — still bound by the 50/pesan aggregate) |
| Max paragraph text | NOT enforced (spec said 4096; single 32000-char paragraph ✅) |
| Max heading text | 200 chars (docs) |
| Max details summary | 200 chars (docs) |
| Max thinking text | 4096 chars (docs) |

**`InputRichMessage` mode fields** — official docs: *"Exactly one of the fields html, markdown, or blocks must be used."* Combining `markdown`/`html` + `blocks` works in practice (accepted, no error) but is undocumented; the response echoes only the `blocks` part. The **official** combined-text+media path is the `media` array: `{"id": "foto1", "media": {"type": "photo", "media": "<file_id|url>"}}` referenced via `tg://photo?id=foto1` in markdown/html.
