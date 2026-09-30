---
name: api-objects
description: Complete reference for every Bot API 10.2 Rich Message object, field, and type.
---

# Telegram Rich Messages API Objects

Official source: Bot API 10.2 (July 14, 2026) — https://core.telegram.org/bots/api

## Coverage

This file covers every `h4` subsection under `#rich-messages` plus API 10.2 additions (outgoing block JSON, media bindings, streaming).

### Methods
- `sendRichMessage`
- `sendRichMessageDraft`
- `editMessageText` (with `rich_message` parameter)

### Root types
- `RichMessage` — received rich message (from `message.rich_message`)
- `InputRichMessage` — outgoing content container
- `InputRichMessageMedia` — media binding
- `InputRichBlock` — base block type
- `InputRichBlockListItem` — list item
- `InputRichMessageContent` — content for inline/guest mode

### RichText (inline text)
- `RichText` — base
- `RichTextBold`, `RichTextItalic`, `RichTextUnderline`, `RichTextStrikethrough`
- `RichTextSpoiler`, `RichTextMarked`, `RichTextCode`
- `RichTextSubscript`, `RichTextSuperscript`
- `RichTextDateTime`, `RichTextTextMention`
- `RichTextCustomEmoji`, `RichTextMathematicalExpression`
- `RichTextUrl`, `RichTextEmailAddress`, `RichTextPhoneNumber`, `RichTextBankCardNumber`
- `RichTextMention`, `RichTextHashtag`, `RichTextCashtag`, `RichTextBotCommand`
- `RichTextAnchor`, `RichTextAnchorLink`, `RichTextReference`, `RichTextReferenceLink`

### Blocks (RichBlock*)
- `RichBlockParagraph`, `RichBlockSectionHeading`, `RichBlockPreformatted`
- `RichBlockFooter`, `RichBlockDivider`, `RichBlockMathematicalExpression`
- `RichBlockAnchor`, `RichBlockList`
- `RichBlockBlockQuotation`, `RichBlockPullQuotation`
- `RichBlockCollage`, `RichBlockSlideshow`, `RichBlockTable`, `RichBlockDetails`
- `RichBlockMap`, `RichBlockAnimation`, `RichBlockAudio`
- `RichBlockPhoto`, `RichBlockVideo`, `RichBlockVoiceNote`
- `RichBlockThinking` (streaming)

---

## Methods

### sendRichMessage

Sends a rich message. Returns the sent `Message` on success.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `business_connection_id` | String | No | Business connection identifier |
| `chat_id` | Integer or String | **Yes** | Target chat or @username |
| `message_thread_id` | Integer | No | Forum thread ID |
| `direct_messages_topic_id` | Integer | No | Direct messages topic ID |
| `rich_message` | InputRichMessage | **Yes** | The rich message content |
| `disable_notification` | Boolean | No | Silent send |
| `protect_content` | Boolean | No | Prevent forwarding/saving |
| `allow_paid_broadcast` | Boolean | No | Allow paid broadcast (API 10.2) |
| `message_effect_id` | String | No | Message effect |
| `suggested_post_parameters` | SuggestedPostParameters | No | Suggested post params |
| `reply_parameters` | ReplyParameters | No | Reply settings |
| `reply_markup` | ReplyMarkup | No | Inline keyboard etc |

### sendRichMessageDraft

Creates a streaming draft message (animated, progressive output). Same parameters as `sendRichMessage`. The draft is finalized by a subsequent `sendRichMessage` call.

### editMessageText (with rich_message)

`editMessageText` accepts an optional `rich_message` parameter (InputRichMessage) to edit a message as a rich message.

---

## Root Types

### InputRichMessage

Outgoing rich message content. Exactly one of:

| Field | Type | Description |
|-------|------|-------------|
| `html` | String | Rich HTML content |
| `markdown` | String | Rich Markdown content |
| `blocks` | Array of InputRichBlock | Outgoing block JSON (API 10.2) |

Optional:
- `is_rtl` (Boolean) — right-to-left rendering
- `skip_entity_detection` (Boolean) — disable auto entity detection

**Precedence**: `blocks` > `markdown` > `html`

### InputRichMessageMedia

Media binding for blocks that contain media:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | String | **Yes** | `photo`, `video`, `animation`, `audio` |
| `media` | String | **Yes** | URL, `file_id`, or `attach://name` |
| `caption` | String | No | Media caption |
| `cover` | String | No | Poster image URL (for video/slideshow) |

### InputRichBlock

Base type for all outgoing blocks. Each block has a `type` field + type-specific fields.

### InputRichBlockListItem

| Field | Type | Description |
|-------|------|-------------|
| `text` | String | Item text (supports rich text) |
| `marker` | String | Custom marker (emoji, number) |

---

## Block Types (InputRichBlock*)

### InputRichBlockSectionHeading

| Field | Type | Description |
|-------|------|-------------|
| `level` | Integer | 1–6 |
| `text` | String | Heading text |

### InputRichBlockParagraph

| Field | Type | Description |
|-------|------|-------------|
| `text` | String | Paragraph text |

### InputRichBlockPreformatted

| Field | Type | Description |
|-------|------|-------------|
| `text` | String | Code block content |
| `language` | String | Language for syntax highlighting |

### InputRichBlockFooter

| Field | Type | Description |
|-------|------|-------------|
| `text` | String | Footer text (max 200 chars) |

### InputRichBlockDivider

No fields. Just a horizontal divider.

### InputRichBlockMathematicalExpression

| Field | Type | Description |
|-------|------|-------------|
| `expression` | String | LaTeX expression |
| `inline` | Boolean | Inline vs block math |

### InputRichBlockAnchor

| Field | Type | Description |
|-------|------|-------------|
| `name` | String | Anchor name for cross-references |

### InputRichBlockList

| Field | Type | Description |
|-------|------|-------------|
| `items` | Array of InputRichBlockListItem | List items |
| `ordered` | Boolean | Ordered (numbered) vs unordered |
| `ordered_type` | String | Numbering style: `1`, `a`, `A`, `i`, `I` |

### InputRichBlockBlockQuotation

| Field | Type | Description |
|-------|------|-------------|
| `text` | String | Quote text |
| `caption` | String | Quote caption/author |
| `expandable` | Boolean | Collapsible quote |

### InputRichBlockPullQuotation

| Field | Type | Description |
|-------|------|-------------|
| `text` | String | Pull quote text |
| `caption` | String | Attribution |

### InputRichBlockCollage

| Field | Type | Description |
|-------|------|-------------|
| `media` | Array of InputRichMessageMedia | Photos (max 10) |
| `caption` | String | Collage caption |

### InputRichBlockSlideshow

| Field | Type | Description |
|-------|------|-------------|
| `media` | Array of InputRichMessageMedia | Slides (max 10) |
| `caption` | String | Slideshow caption |

### InputRichBlockTable

| Field | Type | Description |
|-------|------|-------------|
| `header` | Array of String | Header row cells |
| `rows` | Array of Array of String | Data rows (max 50) |
| `column_span` | Array of Integer | Column spans |
| `caption` | String | Table caption |

### InputRichBlockDetails

| Field | Type | Description |
|-------|------|-------------|
| `summary` | String | Summary text (max 200 chars) |
| `content` | String | Collapsible content (max 4096 chars) |
| `expandable` | Boolean | Allow expansion (default true) |

### InputRichBlockMap

| Field | Type | Description |
|-------|------|-------------|
| `latitude` | Float | Map center latitude |
| `longitude` | Float | Map center longitude |
| `zoom` | Integer | Zoom level (default 15) |
| `caption` | String | Map caption |

### InputRichBlockAnimation

| Field | Type | Description |
|-------|------|-------------|
| `media` | InputRichMessageMedia | Animation file |
| `caption` | String | Caption |

### InputRichBlockAudio

| Field | Type | Description |
|-------|------|-------------|
| `media` | InputRichMessageMedia | Audio file |
| `caption` | String | Caption |

### InputRichBlockPhoto

| Field | Type | Description |
|-------|------|-------------|
| `media` | InputRichMessageMedia | Photo |
| `caption` | String | Caption |

### InputRichBlockVideo

| Field | Type | Description |
|-------|------|-------------|
| `media` | InputRichMessageMedia | Video file |
| `caption` | String | Caption |

### InputRichBlockVoiceNote

| Field | Type | Description |
|-------|------|-------------|
| `media` | InputRichMessageMedia | Voice note |
| `caption` | String | Caption |

### InputRichBlockThinking

| Field | Type | Description |
|-------|------|-------------|
| `text` | String | Thinking/processing text (max 4096 chars) |

Used in `sendRichMessageDraft` for streaming AI replies.

---

## RichText Inline Types

All RichText types share a `text` or content field. They are used inside block `text` fields with rich formatting.

| Type | Extra Fields | Description |
|------|-------------|-------------|
| `RichTextBold` | — | Bold |
| `RichTextItalic` | — | Italic |
| `RichTextUnderline` | — | Underline |
| `RichTextStrikethrough` | — | Strikethrough |
| `RichTextSpoiler` | — | Spoiler |
| `RichTextMarked` | — | Highlighted/marked |
| `RichTextCode` | `language` | Inline code |
| `RichTextSubscript` | — | Subscript |
| `RichTextSuperscript` | — | Superscript |
| `RichTextDateTime` | `datetime` | Date/time |
| `RichTextTextMention` | `user_id` | Text mention |
| `RichTextCustomEmoji` | `emoji_id` | Custom emoji |
| `RichTextMathematicalExpression` | `expression` | Inline math |
| `RichTextUrl` | `url` | Hyperlink |
| `RichTextEmailAddress` | `email` | Email link |
| `RichTextPhoneNumber` | `phone` | Phone link |
| `RichTextBankCardNumber` | `card` | Bank card |
| `RichTextMention` | — | @username |
| `RichTextHashtag` | — | #hashtag |
| `RichTextCashtag` | — | $ticker |
| `RichTextBotCommand` | — | /command |
| `RichTextAnchor` | `name` | Anchor target |
| `RichTextAnchorLink` | `anchor_name` | Link to anchor |
| `RichTextReference` | `text`, `url` | Footnote reference |
| `RichTextReferenceLink` | `reference` | Link to reference |

---

## RichBlockCaption

| Field | Type | Description |
|-------|------|-------------|
| `text` | RichText | Caption text |
| `cite` | RichText | Citation/source |

## RichBlockTableCell

| Field | Type | Description |
|-------|------|-------------|
| `text` | RichText | Cell content |
| `colspan` | Integer | Column span |
| `rowspan` | Integer | Row span |
| `align` | String | `left`, `center`, `right` |

## RichBlockListItem

| Field | Type | Description |
|-------|------|-------------|
| `text` | RichText | Item content |
| `marker` | String | Bullet/number style |

---

## Numeric Limits (verified: official docs + field-tested 2026-09-07)

| Property | Limit |
|----------|-------|
| Max text TOTAL per message | **32768 UTF-8 chars** (docs; field-tested 32768 ok / 32769 gagal) — per-blok paragraph TIDAK ada limit 4096 (32000-char single paragraph ✅) |
| Max blocks per message | 500 (docs; field-tested 500 ok / 501 gagal) |
| Max media total per message | 50 (docs; field-tested) — agregat photo lepas + slideshow + collage |
| Max buttons per buttons-block | **8** (field-tested: 8 ok / 9 gagal) — **HANYA untuk blocks mode**; inline HTML `<tg-button>` bebas (50 inline ✅ dalam 1 pesan) |
| Max button label | TIDAK ada limit khusus — label dihitung ke total 32768 teks pesan (8×4096=32768 ✅, +1 ❌) |
| Max button callback_data | 64 bytes (sama dengan inline keyboard standar; 64 ok / 65 gagal) |
| Max button URL | tidak dibatasi khusus (tes 4KB+ ✅) |
| Jumlah blocks buttons per pesan | ikut batas 500 blocks (499 blok × 1 tombol ✅; total 496 tombol dalam 1 pesan ✅) |
| Max nesting depth | 16 levels (docs) — field-tested: details nested 15 ✅ / 16 ❌ (paragraph root + 15 details = depth 16 ditolak; aman pakai ≤ 14) |
| Max table columns | 20 (docs; field-tested 20 ok / 21 gagal) |
| Max table rows | TIDAK dibatasi 50 — field-tested 200 rows ✅ |
| Max footer text | TIDAK dibatasi 200 — field-tested 4096 ✅ |
| Max collage media | TIDAK dibatasi 10 — field-tested 50 ✅ (kena aggregate 50/pesan) |
| Max heading text | 200 chars (docs) |
| Max details summary | 200 chars (docs) |
| Max thinking text | 4096 chars (docs) |

**Field-tested koreksi penting (2026-09-07):** angka-angka lama di bawah ini berasal dari spec awal yang ternyata TIDAK ditegakkan server. Yang beneran dijaga: 32768 total text, 500 blocks, 50 media total, 8 tombol/blok, 20 kolom, nesting ~15. `details` blocks-mode: field-nya **`blocks`** (array), bukan `content`.

| Max math expression | 1000 chars |
| Max map caption | 200 chars |

## InputRichMessage — mode fields (verified vs official docs 2026-09-07)

Docs resmi (`core.telegram.org/bots/api`, section Rich Messages): **"Exactly one of the fields `html`, `markdown`, or `blocks` must be used."**

Field-tested: mengirim `markdown` + `blocks` (atau `html` + `blocks`) bersamaan **diterima server tanpa error** — tapi undocumented, dan respons `rich_message` hanya echo bagian `blocks`. Anggap best-effort.

### InputRichMessage — field lengkap (docs resmi)

| Field | Type | Description |
|---|---|---|
| `html` | String | Konten HTML (lihat Rich HTML style) |
| `markdown` | String | Konten Markdown (Rich Markdown style, GFM-compatible) |
| `blocks` | Array of InputRichBlock | Outgoing block JSON |
| `media` | Array of InputRichMessageMedia | Media untuk markdown/html via `tg://photo?id=` dll |
| `is_rtl` | Boolean | Right-to-left |
| `skip_entity_detection` | Boolean | Matikan auto entity detection |

### InputRichMessageMedia — format benar (field-tested)

```json
{"id": "foto1", "media": {"type": "photo", "media": "<file_id | url>"}}
```

- `id` = string bebas, direfer dari markdown/html via `tg://photo?id=foto1` (juga `tg://video?id=`, `tg://document?id=`, `tg://audio?id=`)
- `media` = **object** `{type, media}` — BUKAN string langsung (trial-error: `media` string → `Field "media" must be of type Object`; tanpa `id` → `Can't find field "id"`)
- `file_id` dari upload biasa (mis. sendPhoto) valid dipakai

## Rich Block Buttons (blocks mode) — format benar (field-tested 2026-09-07)

```json
{"type": "buttons", "buttons": [
  {"text": "URL", "url": "https://t.me"},
  {"text": "Primary", "style": "primary", "url": "https://t.me"},
  {"text": "Callback", "callback_data": "data:64bytes-max"},
  {"text": "Copy", "copy_text": {"text": "teks yang dicopy"}},
  {"text": "Disabled", "disabled": {}}
]}
```

- `copy_text` **wajib object** `{text}` — string langsung → `Field "copy_text" must be of type Object`
- `disabled` = **field** `disabled: {}` — BUKAN `style`
- `style` valid: `primary`, `success`, `danger`, `link` (style `disabled` → `Invalid button style specified`)
- Maks **8 tombol per blok** (9+ ditolak); jumlah blok buttons bebas (iku limit 500 blocks)

## Media Notes

- Telegram fetches HTTP/HTTPS URLs for `media` field.
- `file_id` references previously uploaded files.
- `attach://name` enables multipart upload (POST as multipart/form-data with the file part named `name`).
- `cover` specifies a poster image for video/slideshow blocks.

## Auto Entity Detection

By default, Telegram auto-detects URLs, email, usernames, hashtags, cashtags, bot commands, phone numbers, and bank cards in text content. Pass `skip_entity_detection: true` to disable.

## Client Support

Rich Messages are rendered in:
- Telegram Desktop (latest)
- Telegram iOS (latest)
- Telegram Android (latest)
- Telegram Web (latest)

Legacy clients show a plaintext fallback.
