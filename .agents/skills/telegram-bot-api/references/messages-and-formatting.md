---
name: messages-and-formatting
description: Complete reference documentation and practical guide.
---

# Messages and Formatting

This reference guide details message sending, editing, and deleting capabilities, and explores HTML, MarkdownV2, and Rich Messages formats supported by the Telegram Bot API.

---

## 1. Message Management APIs

### A. sendMessage
Sends text messages.
*   `chat_id` (Integer/String): Unique identifier for the target chat or username of the target channel (in the format `@channelusername`).
*   `text` (String): Text of the message to be sent, 1-4096 characters after entities parsing.
*   `parse_mode` (String): Mode for parsing entities in the message text. Choose `HTML` or `MarkdownV2`.
*   `entities` (Array of MessageEntity): A JSON-serialized list of special entities that appear in message text, which can be specified instead of `parse_mode`.
*   `link_preview_options` (LinkPreviewOptions): Link preview generation options for the message.
*   `disable_notification` (Boolean): Sends the message silently.
*   `protect_content` (Boolean): Protects the contents of the sent message from forwarding and saving.
*   `reply_parameters` (ReplyParameters): Description of the message to be replied to.
*   `reply_markup` (InlineKeyboardMarkup/ReplyKeyboardMarkup/ReplyKeyboardRemove/ForceReply): Additional interface options.

### B. editMessageText
Edits text and game messages.
*   `chat_id` (Integer/String): Required if `message_id` is specified.
*   `message_id` (Integer): Required if `inline_message_id` is not specified.
*   `inline_message_id` (String): Required if `chat_id` and `message_id` are not specified.
*   `text` (String): New text of the message, 1-4096 characters.
*   `parse_mode` (String): Mode for parsing entities.
*   `reply_markup` (InlineKeyboardMarkup): A JSON-serialized object for an inline keyboard.

### C. deleteMessage
Deletes a message, including service messages, with the following limitations:
*   A message can only be deleted if it was sent less than 48 hours ago.
*   A dice message in a private chat can only be deleted if it was sent more than 24 hours ago.
*   Bots can delete outbound messages in private chats, groups, and supergroups.
*   Bots can delete inbound messages in groups and supergroups if they have the `can_delete_messages` administrator right.

---

## 2. HTML Formatting

To use HTML formatting, pass `"HTML"` in the `parse_mode` field.

### Supported Tags
*   `<b>bold</b>`, `<strong>bold</strong>`
*   `<i>italic</i>`, `<em>italic</em>`
*   `<u>underline</u>`, `<ins>underline</ins>`
*   `<s>strikethrough</s>`, `<strike>strikethrough</strike>`, `<del>strikethrough</del>`
*   `<span class="tg-spoiler">spoiler</span>`, `<tg-spoiler>spoiler</tg-spoiler>`
*   `<b>bold <i>italic bold <s>italic bold strikethrough</s> <u>italic bold underline</u></i> bold</b>` (Nested tags are supported)
*   `<a href="http://www.example.com/">inline URL</a>`
*   `<a href="tg://user?id=123456789">inline mention of a user</a>`
*   `<code>inline fixed-width code</code>`
*   `<pre>pre-formatted fixed-width code block</pre>`
*   `<pre><code class="language-python">pre-formatted fixed-width code block written in the Python programming language</code></pre>`
*   `<blockquote expandable>expandable block quotation</blockquote>`

### Escaping Rules
You must escape characters `<` (left angle bracket), `>` (right angle bracket), and `&` (ampersand) if they are to be interpreted as plain text:
*   `&` -> `&amp;`
*   `<` -> `&lt;`
*   `>` -> `&gt;`

---

## 3. MarkdownV2 Formatting

To use MarkdownV2 formatting, pass `"MarkdownV2"` in the `parse_mode` field.

### Formatting Rules
*   `*bold text*`
*   `_italic text_`
*   `__underline__`
*   `~strikethrough~`
*   `||spoiler||`
*   `[inline URL](http://www.example.com/)`
*   `[inline mention of a user](tg://user?id=123456789)`
*   ``inline fixed-width code``
*   ` ```pre-formatted fixed-width code block``` `
*   ` ```python pre-formatted fixed-width code block written in Python``` `
*   `>blockquote`
*   `**expandable blockquote` (Start each line with `>` and end the last line with `**` or use `**>` prefix depending on implementation)

### Escaping Rules
In MarkdownV2, any character with code between 1 and 126 inclusive can be escaped with a preceding backslash `\`. However, the following characters **must** be escaped with a backslash if they are part of regular text:
`_`, `*`, `[`, `]`, `(`, `)`, `~`, `` ` ``, `>`, `#`, `+`, `-`, `=`, `|`, `{`, `}`, `.`, `!`

---

## 4. Rich Messages Payloads

Telegram Bot API 10.1 introduced Rich Messages via `sendRichMessage` and `sendRichMessageDraft`. Bot API 10.2 (July 14, 2026) adds outgoing block JSON (`InputRichMessage.blocks`), explicit media bindings (`InputRichMessageMedia`), and multipart upload support.

For the complete block reference and every API object, see the `telegram-rich-messages` skill.

### Structure of `InputRichMessage`

Choose exactly one of:
- `markdown` (String): Rich Markdown content (GitHub-Flavored + Telegram extensions).
- `html` (String): Rich HTML with Telegram-specific tags.
- `blocks` (Array of InputRichBlock): Direct outgoing block JSON (API 10.2).

Optional:
- `is_rtl` (Boolean): Right-to-left rendering.
- `skip_entity_detection` (Boolean): Disable auto entity detection.

**Precedence**: `blocks` > `markdown` > `html`

### Media Bindings (API 10.2)

Each media element uses `InputMediaBinding`:
- `type`: `photo`, `video`, `animation`, `audio`
- `media`: HTTP/HTTPS URL, `file_id`, or `attach://name` (multipart upload)
- `caption` (optional): Media caption
- `cover` (optional): Poster image for video/slideshow

### Block Types (API 10.2)

| type | Purpose |
|------|---------|
| `sectionHeading` | h1–h6 heading |
| `paragraph` | Body text |
| `preformatted` | Code block with language |
| `footer` | Footer attribution |
| `divider` | Visual separator |
| `mathematicalExpression` | LaTeX (inline or block) |
| `anchor` | Anchor target |
| `list` | Ordered/unordered list |
| `blockQuotation` | Block quote (expandable option) |
| `pullQuotation` | Pull quote |
| `collage` | Photo grid (max 10) |
| `slideshow` | Slide deck (max 10) |
| `table` | Table (max 50 rows, 12 cols) |
| `details` | Collapsible section |
| `map` | Embedded map |
| `photo` | Photo |
| `video` | Video |
| `animation` | GIF/animation |
| `audio` | Audio |
| `voiceNote` | Voice note |
| `thinking` | Streaming thinking block (draft only) |

#### A. RichMessageBlockTable (Tables)
Renders structured tabular data in the message.
```json
{
  "type": "table",
  "header": [
    { "text": "Product", "align": "left" },
    { "text": "Price", "align": "right" }
  ],
  "rows": [
    [
      { "text": "Item A" },
      { "text": "$10.00" }
    ],
    [
      { "text": "Item B" },
      { "text": "$15.00" }
    ]
  ]
}
```

#### B. RichMessageBlockDetails (Expandable Details)
A collapsible section containing expandable summary text and inner details content.
```json
{
  "type": "details",
  "title": "Technical Details",
  "content": "This is the hidden content that expands when a user clicks the title header.",
  "is_open": false
}
```

#### C. RichMessageBlockFormula (Math Formulas)
Renders LaTeX math syntax beautifully inside the message.
```json
{
  "type": "formula",
  "latex": "\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}"
}
```
