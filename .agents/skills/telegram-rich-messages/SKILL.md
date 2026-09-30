---
name: telegram-rich-messages
description: "Use when the user asks to create, rewrite, preview, send, edit, or stream Telegram Bot API Rich Messages using rich markdown or rich HTML, including structured posts, channel promos, reports, expandable details, dividers, footers, tables, formulas, links, mentions, media blocks, photo collages, slideshows, maps, audio, video, animations, digests, streaming AI replies, and Bot API 10.3 sendRichMessage or sendRichMessageDraft payloads with outgoing block JSON, buttons, and media bindings (file_id, URL, multipart upload)."
version: 2.0.0
metadata:
  {
    "openclaw":
      {
        "emoji": "💎",
      },
  }
---

# Telegram Rich Messages

Create production-ready Telegram Bot API **10.3** Rich Messages. Prefer `sendRichMessage` with `rich_message.markdown` for rich markdown output; use `rich_message.html` only when Markdown cannot express the requested structure cleanly. Use `rich_message.blocks` for direct outgoing block JSON (API 10.2+).

## What's New in Bot API 10.3 (Aug 24, 2026)

- **Buttons inside rich messages**: `RichMessageButton`, `RichTextButton`, plus blocks `RichBlockButtons` / `InputRichBlockButtons` — attach actionable buttons to a rich post.
- **Expandable block quotations**: `RichBlockExpandableBlockQuotation` / `InputRichBlockExpandableBlockQuotation` — collapsed-by-default quote blocks the reader expands.
- **Document blocks**: `RichBlockDocument` / `InputRichBlockDocument` embed a file in the message body; general file uploads also accept links of the form `tg://document?id=`.
- **Compact tables**: new `is_compact` field on `RichBlockTable` / `InputRichBlockTable`.
- **Streaming**: `sendMessageDraft` / `sendRichMessageDraft` gained `can_stop` and `keep_on_stop`; users stopping generation produce a `MessageGenerationStopped` update (`Update.stopped_message_generation`).

## Field-Tested Notes (live API, 2026-08-24)

Verified against production Bot API using real payloads — differences from what the raw spec implies:

| Topic | Spec says | Live API actually |
|---|---|---|
| Rich block `text` fields | Nested `RichText` object, e.g. `{"type": "plain", "content": "..."}` | **Plain string works** (`"text": "Hello"`); nested `{"type":"plain",...}` is rejected with `Unsupported rich text type`. Use plain strings. |
| Buttons block | `RichBlockButtons` with array of `RichMessageButton` | Works; button `text` is a plain string too. `disabled: {}` (empty object) accepted. |
| Document block | `document: InputMediaDocument` | Must be a complete `InputMediaDocument`: `{"type": "document", "media": "<url|file_id|attach://>"}`. Omitting `type` → `Can't find field "type"`. |
| `expandable_blockquote` block | `RichBlockExpandableBlockQuotation` | Works as `{"type": "expandable_blockquote", "text": "..."}`. |
| Ephemeral legacy params | `receiver_user_id`/`callback_query_id` replaced by wrapper | Old bare params **still accepted** (deprecated). Prefer the `ephemeral_message_parameters` wrapper. |
| `replace_callback_query_message` | Shows ephemeral in place of original | Field recognized; requires a live `callback_query_id` (expired ID → `query is too old`). |
| `sendMessageDraft.random_id`/`draft_id` | — | `draft_id` must be an **integer** (non-zero); string IDs → `RANDOM_ID_INVALID`. |
| **Interactive tests (user-driven, 2026-08-25)** | | |
| grammY 1.46+ | Rich buttons block | ✅ Native support — types 5.0.0 sudah dibundel (rilis 26 Agu 2026). Tanpa override/override/workaround. |
| `replace_callback_query_message: true` | Ephemeral replaces original message in place | ✅ Works. ⚠️ In replace mode the response has **NO `ephemeral_message_id`** (unlike normal ephemeral sends which always return it) — you cannot edit/delete a replaced message afterward. |
| Rich button `callback_data` press | Callback query to bot | ✅ Produces a **standard `CallbackQuery`** — `data`, `from`, normal `message` present, no special rich-specific fields. Existing callback handlers work unchanged. |
| `sendMessageDraft` peer validity | Draft streaming target | ⚠️ `TEXTDRAFT_PEER_INVALID` when the target user hasn't interacted with the draft flow; earlier curl test to same user succeeded once — drafts appear tied to an active session/state. Re-test before relying on it. |
| Table block | `cells: Array of Array of RichBlockTableCell` | ✅ Works with **plain strings inside cells** — `{"type":"table", "is_compact":true, "cells":[[{"text":"A"},{"text":"B"}],...]}`. Wrong shape → `Can't find field "cells"`. |
| `editEphemeralMessageCaption.show_caption_above_media` | 10.3 param | ✅ Works (`ok:true`). |
| **Interactive tests (user-driven, 2026-09-12)** | | |
| `sectionHeading` block type | `{"type":"sectionHeading"}` | ❌ **Rejected by live server** (`type "sectionHeading" is unsupported`). Use `paragraph` or HTML `<h1>..<h6>`. |
| Stacked `buttons` blocks | Multiple `{"type":"buttons", ...}` blocks | ✅ **Works**. Stacks as full-width block buttons vertically. |
| Gray / muted text | Client rendering | ⚠️ **Only renders gray** in `<figcaption>` under photo, or `<footer>` at the VERY BOTTOM of chat bubble. Mid-message footers fallback to white. |
| `<sub>` & `<sup>` | Small text | ✅ **Works**. Renders mini subscript & superscript native text. |


### Slideshow & Collage (Field-Tested 2026-08-27)

**Format JSON yang benar:**

```json
{
  "type": "slideshow",
  "blocks": [
    {
      "type": "photo",
      "photo": {
        "type": "photo",
        "media": "https://example.com/photo.jpg"
      }
    }
  ]
}
```

⚠️ **PENTING:** `photo` harus object dengan field `type: "photo"` dan `media`, bukan string langsung.

**Perbedaan:**
- `slideshow` → carousel (swipe kiri/kanan)
- `collage` → grid (kotak berjajar)

**Limit media (field-tested 2026-09-07):** limit **50 media per PESAN** (bukan per slideshow) — dihitung agregat semua blok media (photo lepas + semua slideshow/collage digabung). 50 ✅ / 51+ → `RICH_MESSAGE_MEDIA_TOO_MANY`. Jadi bisa: 1 slideshow 50, atau 2 slideshow × 25, atau 3 slideshow (17+17+16), dsb. `collage` masih ≤ 10 per spec lama (belum diuji ulang).

**Layout bacaan komik (field-tested 2026-09-08):** buat comic/manga reader, `slideshow` carousel TIDAK cocok (server fetch semua gambar dulu → 46 slide ≈ 47s, dan carousel bukan pola baca komik). Pakai **photo block standalone per halaman** (`{"type":"photo","photo":{"type":"photo","media":url}}` ditumpuk berurutan) → layout vertikal menurun, **terkirim ~1s untuk 46 halaman** (vs 47s slideshow), karena server tidak men-fetch ulang semua gambar sebelum membalas. Limit 50 media per pesan tetap berlaku untuk kedua layout.

**Markdown di dalam blocks `text` dirender MENTAH (field-tested 2026-09-08):** `**bold**` / `*italic*` di `{"type":"paragraph","text":"**x**"}` TIDAK diparse — tampil literal dengan bintangnya. Formatting di blocks mode cuma via runs array (`[{"type":"bold","text":"x"}]`). Untuk kartu info (heading, list, bold, spoiler, tombol inline) → pakai **HTML mode** (`rich_message.html`): semua terender ✅ termasuk `<img>`, `<ul>/<li>`, `<blockquote expandable>`, `<tg-button>`.

**Sumber gambar wajib cek anti-hotlink dulu:** tes `curl -s -o /dev/null -w "%{http_code}"` TANPA UA/Referer (kondisi persis saat Telegram fetch). Komiku (komiku.org): **tidak ada** hotlink protection — 200 langsung. Situs dengan hotlink protection → bot harus download gambar dulu lalu upload `attach://` multipart.

**429 flood control saat kirim berturut-turut (field-tested 2026-09-08):** dua `sendRichMessage` berurutan (kartu cover + chapter) bisa kena `429 Too Many Requests: retry after 8`. Handler bot WAJIB parse `retry after (\d+)` dari description, sleep N+1 detik, retry (maks ~3x) — JANGAN langsung laporkan gagal ke user. Implementasi contoh: `/root/comicbot/src/rich.ts#sendRich`. Pola scraping→kirim lengkap ada di skill `media-site-scraping`.

**Limit teks (field-tested 2026-09-07):** total teks gabungan semua blok maks **32.768 karakter** (= 2^15, **8× limit sendMessage** 4096). 32.768 ✅ / 32.769+ → `RICH_MESSAGE_TEXT_TOO_LONG`. ⚠️ Tidak ada limit 4.096 per paragraph — single paragraph 32.000 char ✅ (angka 4.096-per-blok di spec lama tidak ditegakkan server). Label tombol & teks footer juga dihitung ke budget 32.768 ini.

## Rich Buttons — limits (field-tested 2026-09-07)

| Aspek | Limit |
|---|---|
| Tombol per blok `buttons` | **8** (9+ ditolak) — **hanya blocks mode** |
| Tombol inline HTML/markdown (`<tg-button>`) | **Bebas** — 50 inline ✅ dalam 1 pesan; bisa nyempil di tengah kalimat |
| Jumlah blok buttons | ikut limit 500 blocks/pesan (496 tombol via 62 blok × 8 ✅) |
| `callback_data` | **64 bytes** (65 → ditolak, sama seperti inline keyboard standar) |
| Label tombol | tanpa limit khusus, tapi dihitung ke budget teks 32.768 |
| URL tombol | bebas (4KB+ ✅) |
| Style blocks mode | `primary`, `success`, `danger`, `link`; disabled = field `disabled: {}` (BUKAN style) |
| `copy_text` (blocks) | wajib object: `{"copy_text": {"text": "..."}}` — string langsung ditolak |

## Details block (blocks mode)

Field-nya **`blocks`** (array of blocks), BUKAN `content` — `{"type":"details","summary":"S","blocks":[{"type":"paragraph","text":"inner"}]}` ✅. Nesting details dalam details: kedalaman 15 ✅ / 16 ❌ (aman ≤ 14).

**Contoh lengkap:**

```json
{
  "rich_message": {
    "blocks": [
      {
        "type": "slideshow",
        "blocks": [
          {"type": "photo", "photo": {"type": "photo", "media": "url1.jpg"}},
          {"type": "photo", "photo": {"type": "photo", "media": "url2.jpg"}},
          {"type": "photo", "photo": {"type": "photo", "media": "url3.jpg"}}
        ]
      },
      {
        "type": "paragraph",
        "text": "**Slideshow** dengan 3 foto"
      }
    ]
  }
}
```

| `editEphemeralMessageText.rich_message` (10.3) | Edit ephemeral into a rich message | ✅ Works with `{"markdown": "..."}`. |
| `editEphemeralMessageMedia` new file upload (10.3 claim) | Upload new files | ❌ **Fails in production** — always `Bad Request: MESSAGE_EMPTY` (object form, plain URL form, and multipart `attach://` upload, even instantly after send). Treat as broken server-side for now; re-test per API update. |
| Inline keyboard `disabled` + `style` (10.3) | `DisabledButton`, colored buttons | ✅ Works on ordinary `InlineKeyboardMarkup`. |
| `force_reply` field on keyboard markups (10.3) | New field | ✅ Works on both `InlineKeyboardMarkup` and `ReplyKeyboardMarkup`. |
| `KeyboardButton.style` (reply keyboard colors) | success/danger/primary | ✅ Accepted by server. |
| `sendChecklist` (10.x) | Checklists | ⚠️ Payload format verified (needs integer task `id`s) but returns **`PREMIUM_ACCOUNT_REQUIRED`** — checklist messages need the bot/user to have Premium; not a payload error. |
| Legacy sends regression (poll/dice/location/contact) | — | ✅ All still work unchanged. |

**Rule of thumb:** when the spec shows a nested `RichText`/typed object for a text field, try a plain string first — the server's parser is more permissive than the type tree suggests.

## First Decision

- **Text-only rich post**: write rich markdown directly.
- **Media, collage, slideshow, map, footer, divider, details, table, formula**: use rich markdown plus supported HTML tags where needed.
- **Direct block JSON (precise control)**: use `rich_message.blocks` with `InputRichBlock*` objects (API 10.2).
- **Media upload (file_id, URL, multipart)**: use `InputMediaBinding` with `type`, `media`, and optional `cover` (API 10.2).
- **Streaming AI reply**: use `sendRichMessageDraft` with `RichBlockThinking` (see `references/streaming.md`).
- **Digest / newsletter / channel article**: use digest layout patterns (see `references/digest.md`).
- **User asks to send/edit/stream**: use `scripts/send_rich_message.py`.
- **User needs exact API fields or a Telegram error appears**: read `references/api-objects.md`, then `references/rich-messages.md` for syntax.

## Workflow

1. Identify the target: announcement, promo, report, instruction, checklist, gallery, collapsible story, digest, or AI response.
2. Choose blocks before wording: heading, intro paragraph, media/collage/slideshow, list/table, quote/details, footer.
3. Write rich markdown, not MarkdownV2. Do not escape MarkdownV2 characters unless the user explicitly asks for legacy `sendMessage`.
4. Keep media as separate blocks. Use HTTP/HTTPS URLs, `file_id`, or multipart upload.
5. Add a footer only if requested or clearly useful for attribution.
6. For sending, require a bot token and chat ID, but never print the token. Prefer stdin or environment variables.
7. After sending or editing, report only `ok`, `message_id`, and `chat_id`.

## Rich Markdown Patterns

Use GitHub-flavored Markdown where possible:

````markdown
# Heading

Intro with **bold**, *italic*, ~~strike~~, ==marked==, `code`, and [links](https://example.com).

## Section

Regular paragraph text.

### Collapsible Section

> Details block content — supports nested formatting.

| Column A | Column B |
|---|---|
| Cell 1 | Cell 2 |
| Cell 3 | Cell 4 |

$$E = mc^2$$

---

Footer text with attribution.
````

## Rich HTML Tags (when Markdown is insufficient)

| Tag | Purpose |
|-----|---------|
| `<b>`, `<i>`, `<u>`, `<s>` | Bold, italic, underline, strikethrough |
| `<tg-spoiler>` | Spoiler text |
| `<code>`, `<pre>` | Inline/block code |
| `<a href="...">` | Link |
| `<tg-emoji emoji-id="...">` | Custom emoji |
| `<blockquote expandable>` | Collapsible block |
| `<table>`, `<tr>`, `<td>`, `<th>` | Table |
| `<img>` | Image (via media binding) |

### Full Rich HTML Example

Send via `rich_message.html` — a complete structured post using every major tag:

```html
<h2>Laporan Mingguan</h2>
<p>Halo <b>semua</b>! Berikut ringkasan <i>pekan ini</i>.</p>

<p>Rahasia: <tg-spoiler>target Q3 tercapai 120%</tg-spoiler></p>

<blockquote expandable>Data mentah lengkap: baris 1... baris 2... baris 3...
(semua 200 baris tersembunyi di balik tap "expand").</blockquote>

<table>
  <tr><th>Metric</th><th>Nilai</th></tr>
  <tr><td>Revenue</td><td>+12%</td></tr>
  <tr><td>Churn</td><td>-3%</td></tr>
</table>

<pre><code class="language-python">revenue = df["total"].sum()</code></pre>

<p>Dibuat dengan <tg-emoji emoji-id="5368324170671202286">🔥</tg-emoji> oleh bot.</p>
```

```bash
curl -s -X POST "https://api.telegram.org/bot$BOT_TOKEN/sendRichMessage" \
  -H "Content-Type: application/json" \
  -d '{"chat_id": "@mychannel", "rich_message": {"html": "<h2>...</h2><p>...</p>"}}'
```

Tag notes:
- `<tg-emoji>` membutuhkan premium custom emoji ID valid (lihat skill `telegram-premium-emoji`).
- `<blockquote expandable>` = padanan block `expandable_blockquote` di blocks JSON.
- HTML dipakai hanya untuk struktur yang markdown tidak bisa ungkapkan (spoiler, custom emoji); sisanya tetap markdown.

## Outgoing Block JSON (API 10.2)

For precise control, pass `rich_message.blocks` as an array of `InputRichBlock*` objects.

⚠️ **Field-tested format (2026-08-24)**: `text` fields accept **plain strings** — nested `{"type": "plain", "content": ...}` objects are rejected by the live parser. The example below uses the verified working format:

```json
{
  "chat_id": "@mychannel",
  "rich_message": {
    "blocks": [
      {"type": "paragraph", "text": "**Daily Report** — ringkasan harian."},
      {"type": "expandable_blockquote", "text": "Data mentah tersembunyi di sini..."},
      {"type": "buttons", "align": "center", "buttons": [
        {"text": "🌐 Buka dashboard", "style": "primary", "url": "https://example.com"},
        {"text": "🔄 Refresh", "callback_data": "refresh:daily"}
      ]},
      {"type": "document", "document": {"type": "document", "media": "attach://report"}},
      {"type": "divider"},
      {"type": "footer", "text": "Sent by @mybot"}
    ]
  }
}
```

Verified block types (live API): `paragraph`, `expandable_blockquote`, `buttons`, `document`, `divider`, `footer`. Media blocks (`collage`, `slideshow`) dan `table` mengikuti pola sama; tabel punya `is_compact` (10.3). Jika sebuah blok ditolak `Unsupported rich text type`, ganti field teksnya ke plain string.

### Block types

| Type | Object | Purpose |
|------|--------|---------|
| `sectionHeading` | `InputRichBlockSectionHeading` | h1–h6 heading |
| `paragraph` | `InputRichBlockParagraph` | Body text |
| `table` | `InputRichBlockTable` | Table with header rows |
| `details` | `InputRichBlockDetails` | Collapsible section |
| `collage` | `InputRichBlockCollage` | Photo grid |
| `slideshow` | `InputRichBlockSlideshow` | Slide deck |
| `map` | `InputRichBlockMap` | Embedded map |
| `mathematicalExpression` | `InputRichBlockMathematicalExpression` | Block math |
| `thinking` | `InputRichBlockThinking` | Streaming AI thinking block |
| `divider` | `InputRichBlockDivider` | Visual separator |
| `footer` | `InputRichBlockFooter` | Footer attribution |

## Media Bindings (API 10.2)

Each media element in a block uses `InputMediaBinding`:

```json
{
  "type": "photo",
  "media": "https://example.com/image.jpg",
  "caption": "Optional caption"
}
```

| `media` value | Description |
|---------------|-------------|
| HTTP/HTTPS URL | Remote URL (Telegram fetches it) |
| `file_id` | Previously uploaded file reference |
| `attach://<name>` | Multipart upload (POST with multipart/form-data) |

### Multipart upload

```bash
curl -s -X POST "https://api.telegram.org/bot$TOKEN/sendRichMessage" \
  -F "chat_id=@mychannel" \
  -F 'rich_message={"blocks":[{"type":"collage","media":[{"type":"photo","media":"attach://photo1"}]}]}' \
  -F "photo1=@/path/to/photo.jpg"
```

## Streaming AI Replies (API 10.2)

Use `sendRichMessageDraft` for progressive output (see `references/streaming.md`):

1. **Draft**: `sendRichMessageDraft` with `RichBlockThinking` → animated draft message.
2. **Finalize**: `sendRichMessage` (without draft flag) replaces draft with final message.

## Digest Patterns (API 10.2)

See `references/digest.md` for:
- Flat digest layout (single message, all sections visible).
- Preview + collapsed full version (short preview, expandable details with full content).
- Media as evidence (photos/screenshots embedded as proof).
- Preflight gate (validate before publishing).





## Inline Keyboard Limits (field-tested 2026-09-08, binary search)

Batas tombol inline keyboard Telegram **jauh lebih besar dari anggapan umum**: **3200 tombol (400 baris × 8) diterima `sendMessage` ✅** (binary search dari 101 → 3200 semua OK; tes 6400 cuma timeout klien karena payload ~ratusan KB, bukan ditolak server). Tidak ada error "too many buttons" sampai 3200. Praktis: grid chapter manga 180 episode pun muat 1 halaman. Catatan UX: edit markup besar via `editMessageReplyMarkup` tetap cepat; jangan kirim >500 baris keyboard di grup aktif (render client lambat).

## 3 Formatting Modes (Field-Tested 2026-08-29)

Rich Messages support **3 modes** yang bisa dipakai (pilih salah satu):

### 1. HTML Mode (PALING MUDAH & LENGKAP)

```json
{
  "rich_message": {
    "html": "<h2>Judul</h2>\n<p>Teks <b>bold</b></p>"
  }
}
```

**Kelebihan:** Semua tags support (headings, lists, tables, media, buttons, math, maps)
**Status:** ✅ Semua tags jalan

### 2. MarkdownV2 Mode

```json
{
  "rich_message": {
    "markdown": "*Bold* _italic_ `code`\n# Heading\n- List item"
  }
}
```

**Kelebihan:** Syntax GitHub Flavored Markdown
**Status:** ✅ Jalan (perlu escape karakter khusus: `_`, `.`, `-`, `!`, dll dengan `\`)

**Tags yang support:**
- Text: `*bold*`, `_italic_`, `` `code` ``, `__underline__`, `~~strikethrough~~`, `||spoiler||`
- Links: `[text](url)`
- Headings: `# H1` sampai `###### H6`
- Lists: `- item` (unordered), `1. item` (ordered)
- Quote: `> block quote`
- HTML tags juga bisa dipakai: `<tg-slideshow>`, `<tg-button>`, `<table>`, dll.

### 3. Blocks Mode (JSON)

```json
{
  "rich_message": {
    "blocks": [
      {"type": "paragraph", "text": "Teks"},
      {"type": "buttons", "buttons": [{"text": "Btn", "callback_data": "x"}]}
    ]
  }
}
```

**Kelebihan:** Kontrol penuh struktur
**Status:** ✅ 15/24 block types jalan (lihat Block Types Reference)

> ⚠️ **CATATAN (2026-08-30):** Daftar di bawah sudah ketinggalan — diverifikasi ulang via 93 tes live, hasilnya beda dari yang dikira. **Baca `references/field-tested-blocks.md` — itu sumber kebenaran terbaru.** Ringkasannya: blocks JSON jauh lebih terbatas dari spec; banyak field name di `api-objects.md` salah (media pakai sub-object senama, map butuh `location`, table butuh `cells`, text_mention butuh `user`). Sebagian besar blok yang gagal di blocks JSON **tetap jalan via HTML mode.**

### Perbandingan

| Fitur | HTML | MarkdownV2 | Blocks |
|---|---|---|---|
| Text formatting | ✅ Lengkap | ✅ Lengkap | ⚠️ Terbatas |
| Headings | ✅ H1-H6 | ✅ # - ###### | ❌ Tidak ada |
| Lists | ✅ ul/ol | ✅ - / 1. | ❌ Tidak ada |
| Tables | ✅ `<table>` | ✅ `<table>` | ✅ type:table |
| Media | ✅ img/video/audio | ✅ tg-slideshow/collage | ✅ type:photo/video |
| Buttons | ✅ `<tg-button>` | ✅ `<tg-button>` | ✅ type:buttons |
| Math | ✅ `<tg-math>` | ✅ `<tg-math>` | ❌ Tidak ada |
| Maps | ✅ `<tg-map>` | ✅ `<tg-map>` | ✅ type:map |
| Escape characters | ❌ Tidak perlu | ⚠️ Perlu `\` | ❌ Tidak perlu |

### Rekomendasi

1. **Gunakan HTML mode** untuk sebagian besar kasus (paling lengkap & mudah)
2. **Gunakan MarkdownV2** jika sudah familiar dengan Markdown
3. **Gunakan Blocks mode** hanya untuk struktur kompleks yang butuh kontrol penuh


## Custom Emoji di Rich Messages (Field-Tested 2026-08-30)

Custom emoji premium masuk ke rich message di **3 mode**. Diverifikasi langsung via `sendRichMessage` (bot FauzanVVIPBot). Detail & katalog ID lengkap ada di skill `telegram-rich-custom-emoji` (dan `telegram-premium-emoji`).

### HTML mode (RECOMMENDED)
```json
{
  "chat_id": 123456789,
  "rich_message": {
    "html": "<p>Status: <tg-emoji emoji-id=\"5424972470023104089\">🔥</tg-emoji> AKTIF</p>"
  }
}
```

### MarkdownV2
```markdown
![🔥](tg://emoji?id=5424972470023104089)
```

### Blocks JSON (nested run — BUKAN standalone block)
```json
{
  "rich_message": {
    "blocks": [{"type": "paragraph", "text": ["Satu ", {"type": "custom_emoji", "custom_emoji_id": "5424972470023104089", "alternative_text": "🔥"}, " dua"]}]}
  }
}
```
Field yang benar: **`custom_emoji_id`** + **`alternative_text`**. ⚠️ `{"type":"custom_emoji"}` sebagai block berdiri sendiri → **GAGAL** (`can't parse InputRichBlock: type "custom_emoji" is unsupported`).

### Aturan emas — fallback
- Konten di dalam `<tg-emoji>` **wajib karakter emoji unicode** (kata/kode → `RICH_MESSAGE_EMOJI_INVALID`).
- Server memakai `alternative_text` bawaan emoji_id-nya sendiri, **bukan** karakter yang lo ketik.
- Cuma pakai ID dari katalog → ID karangan ditolak (`MessageEntityCustomEmojiInvalid`).

## HTML Tags Reference (Field-Tested 2026-08-29)

**Cara pakai:** Kirim Rich Message dengan field `html` (bukan `blocks`):

```json
{
  "chat_id": 123456789,
  "rich_message": {
    "html": "<h2>Judul</h2>\n<p>Teks dengan <b>bold</b></p>"
  }
}
```

### Text Formatting

| HTML Tag | Hasil | Status |
|---|---|---|
| `<b>text</b>` / `<strong>text</strong>` | **Bold** | ✅ |
| `<i>text</i>` / `<em>text</em>` | *Italic* | ✅ |
| `<u>text</u>` / `<ins>text</ins>` | <u>Underline</u> | ✅ |
| `<s>text</s>` / `<strike>text</strike>` / `<del>text</del>` | ~~Strikethrough~~ | ✅ |
| `<code>text</code>` | `Inline code` | ✅ |
| `<mark>text</mark>` | <mark>Marked</mark> | ✅ |
| `<sub>text</sub>` | Subscript | ✅ |
| `<sup>text</sup>` | Superscript | ✅ |
| `<tg-spoiler>text</tg-spoiler>` | Spoiler (blur) | ✅ |

### Links

| HTML Tag | Hasil | Status |
|---|---|---|
| `<a href="url">text</a>` | Inline URL | ✅ |
| `<a href="mailto:email">text</a>` | Email link | ✅ |
| `<a href="tel:phone">text</a>` | Phone link | ✅ |
| `<a href="tg://user?id=123">text</a>` | User mention | ✅ |
| `<a href="#anchor">text</a>` | In-document link | ✅ |
| `<a name="anchor"></a>` | Anchor target | ✅ |

### Headings

| HTML Tag | Hasil | Status |
|---|---|---|
| `<h1>text</h1>` | Heading 1 (terbesar) | ✅ |
| `<h2>text</h2>` | Heading 2 | ✅ |
| `<h3>text</h3>` | Heading 3 | ✅ |
| `<h4>text</h4>` | Heading 4 | ✅ |
| `<h5>text</h5>` | Heading 5 | ✅ |
| `<h6>text</h6>` | Heading 6 (terkecil) | ✅ |

### Lists

| HTML Tag | Hasil | Status |
|---|---|---|
| `<ul><li>item</li></ul>` | Unordered list | ✅ |
| `<ol><li>item</li></ol>` | Ordered list | ✅ |
| `<ol start="3">` | Ordered list start from 3 | ✅ |
| `<li value="7" type="a">` | Custom number/letter | ✅ |
| `<li><input type="checkbox" checked>` | Checked checkbox | ✅ |
| `<li><input type="checkbox">` | Unchecked checkbox | ✅ |

### Quotations

| HTML Tag | Hasil | Status |
|---|---|---|
| `<blockquote>text</blockquote>` | Block quotation | ✅ |
| `<blockquote expandable>text</blockquote>` | Expandable blockquote | ✅ |
| `<aside>text<cite>Author</cite></aside>` | Pull quotation | ✅ |
| `<cite>Author</cite>` | Citation | ✅ |

### Media

| HTML Tag | Hasil | Status |
|---|---|---|
| `<img src="url"/>` | Photo | ✅ |
| `<video src="url"></video>` | Video | ✅ |
| `<audio src="url"></audio>` | Audio | ✅ |
| `<tg-document src="url"></tg-document>` | Document | ✅ |
| `<figure><img src="url"/><figcaption>caption</figcaption></figure>` | Photo with caption | ✅ |
| `<figure><video src="url"></video><figcaption>caption</figcaption></figure>` | Video with caption | ✅ |

### Multi-Media Layout

| HTML Tag | Hasil | Status |
|---|---|---|
| `<tg-collage>...</tg-collage>` | Photo grid (kotak berjajar) | ✅ |
| `<tg-slideshow>...</tg-slideshow>` | Carousel (swipe kiri/kanan) | ✅ |

**Contoh Collage:**
```html
<tg-collage>
  <img src="https://example.com/photo1.jpg"/>
  <img src="https://example.com/photo2.jpg"/>
  <figcaption>Collage caption</figcaption>
</tg-collage>
```

**Contoh Slideshow:**
```html
<tg-slideshow>
  <img src="https://example.com/slide1.jpg"/>
  <img src="https://example.com/slide2.jpg"/>
  <figcaption>Slideshow caption</figcaption>
</tg-slideshow>
```

### Table

| HTML Tag | Hasil | Status |
|---|---|---|
| `<table>...</table>` | Table | ✅ |
| `<table bordered>` | Table with borders | ✅ |
| `<table striped>` | Striped rows | ✅ |
| `<table compact>` | Compact layout | ✅ |
| `<caption>text</caption>` | Table caption | ✅ |
| `<th>header</th>` | Header cell | ✅ |
| `<td>value</td>` | Data cell | ✅ |
| `<td colspan="2">` | Merged columns | ✅ |
| `<td align="center">` | Alignment | ✅ |

### Interactive

| HTML Tag | Hasil | Status |
|---|---|---|
| `<details><summary>title</summary>content</details>` | Collapsible section | ✅ |
| `<details open>` | Expanded by default | ✅ |
| `<tg-button type="callback_data" data="id">text</tg-button>` | Callback button | ✅ |
| `<tg-button type="url" url="url">text</tg-button>` | URL button | ✅ |
| `<tg-button type="web_app" url="url">text</tg-button>` | Mini App button | ✅ |
| `<tg-button type="copy_text" text="text">label</tg-button>` | Copy text button | ✅ |
| `<tg-button type="disabled">text</tg-button>` | Disabled button | ✅ |
| `<tg-button style="success">` | Green button | ✅ |
| `<tg-button style="danger">` | Red button | ✅ |
| `<tg-button style="primary">` | Blue button | ✅ |
| `<tg-button style="link">` | Gray link button | ✅ |

### Special

| HTML Tag | Hasil | Status |
|---|---|---|
| `<tg-map lat="41.9" long="12.5" zoom="14"/>` | Embedded map | ✅ |
| `<tg-math>x^2</tg-math>` | Inline math | ✅ |
| `<tg-math-block>E = mc^2</tg-math-block>` | Block math | ✅ |
| `<tg-time unix="1647531900" format="wDT"></tg-time>` | Formatted time | ✅ |
| `<tg-emoji emoji-id="123">🔥</tg-emoji>` | Custom emoji (fallback wajib emoji unicode) | ✅ |
| `<tg-reference name="note">text</tg-reference>` | Footnote reference | ✅ |
| `<hr/>` | Horizontal divider | ✅ |
| `<footer>text</footer>` | Footer attribution | ✅ |
| `<br>` | Line break | ✅ |
| `<p>paragraph</p>` | Paragraph | ✅ |
| `<pre>code block</pre>` | Pre-formatted code | ✅ |
| `<pre><code class="language-python">code</code></pre>` | Syntax highlighted code | ✅ |

### HTML Entities yang Support

| Entity | Hasil |
|---|---|
| `&lt;` | `<` |
| `&gt;` | `>` |
| `&amp;` | `&` |
| `&quot;` | `"` |
| `&apos;` | `'` |
| `&nbsp;` | Non-breaking space |
| `&hellip;` | … (ellipsis) |
| `&mdash;` | — (em dash) |
| `&ndash;` | – (en dash) |
| `&lsquo;` | ' (left single quote) |
| `&rsquo;` | ' (right single quote) |
| `&ldquo;` | " (left double quote) |
| `&rdquo;` | " (right double quote) |

### Auto-Detect (tanpa tag)

| Pattern | Hasil |
|---|---|
| `#hashtag` | Hashtag link |
| `$USD` | Cashtag |
| `+123****8901` | Phone number |
| `4242 4242 4242 4242` | Card number |
| `https://t.me` | URL link |
| `t.me` | URL link |
| `a@t.me` | Email |
| `/command` | Bot command |
| `@username` | Mention |


## Kombinasi markdown/html + blocks (field-tested 2026-09-07)

⚠️ **Docs resmi:** `InputRichMessage` — *"Exactly one of the fields html, markdown, or blocks must be used."* Gabungan markdown/html + blocks **diterima server tanpa error** (field-tested berulang) tapi itu **undocumented** — respons cuma echo bagian `blocks`. Pakai dengan sadar; kalau butuh garansi resmi, pakai `sendMessage` biasa + `inline_keyboard`.

`rich_message` bisa berisi **`markdown` ATAU `html` BERSAMA `blocks` sekaligus** — semua ✅ diterima server:

```json
{"chat_id": 123, "rich_message": {
  "markdown": "## Judul\n\nKonten **rich** dengan tombol inline <tg-button type=\"url\" url=\"https://t.me\">Label</tg-button>",
  "blocks": [
    {"type": "buttons", "buttons": [{"text": "Tombol", "url": "https://t.me"}]},
    {"type": "footer", "text": "footer"}
  ]
}}
```

- Pola terbaik: **markdown/html = konten teks** (heading, list, formatting bebas), **blocks = struktur** (buttons, slideshow, footer, divider)
- Tombol inline (`<tg-button>`) bisa juga di dalam markdown/html — bebas jumlah
- Respons API cuma echo bagian `blocks`; urutan render markdown vs blocks terlihat di client

## Inline RichText runs di blocks (field-tested 2026-09-07)

`text` di blocks mode menerima 3 bentuk:

```json
{"type": "paragraph", "text": "plain string"}                                    // ✅ paling simple
{"type": "paragraph", "text": ["string biasa", {"type": "bold", "text": "tebal"}, " lanjut"]}  // ✅ runs array
{"type": "paragraph", "text": [{"type": "plain", "text": "x"}]}                  // ❌ "Unsupported rich text type"
```

- Run yang jalan: `{"type": "bold"|"italic"|"code"|"spoiler", "text": "..."}` + `custom_emoji` + `url` + `text_mention` (dengan `user:{id}`)
- **`plain` BUKAN tipe run yang valid** — string biasa ditulis langsung sebagai string di array
- Heading juga sama: `{"type": "heading", "text": [{"type": "bold", "text": "Judul"}]}` ✅

## Media field (markdown/html + media, RESMI via docs)

Gabungan **resmi**: `markdown`/`html` + field `media` (Array of `InputRichMessageMedia`). Field-nya **`id`** (string bebas untuk direfer di teks) + **`media`** (object `{type, media}`):

```json
{"chat_id": 123, "rich_message": {
  "markdown": "Teks\n\n![caption](tg://photo?id=foto1)\n\nTeks bawah",
  "media": [{"id": "foto1", "media": {"type": "photo", "media": "<file_id atau url>"}}]
}}
```

- Field-name benar: `id` + `media` (object) — BUKAN `media` string langsung (field-tested trial-error 4x)
- Refer di markdown/html pakai `tg://photo?id=<id>` (juga `tg://video?id=`, `tg://document?id=`, `tg://audio?id=`)
- `file_id` hasil upload (mis. via sendPhoto) bisa dipake sebagai `media`

## Sending

Use `scripts/send_rich_message.py` — supports:
- `sendRichMessage` (final message)
- `sendRichMessageDraft` (streaming draft)
- Multipart upload for local files
- Markdown → rich message conversion
- All block types and media bindings

```bash
python3 scripts/send_rich_message.py send \
  --token "$BOT_TOKEN" \
  --chat-id "@mychannel" \
  --markdown-file report.md

python3 scripts/send_rich_message.py draft \
  --token "$BOT_TOKEN" \
  --chat-id "@mychannel" \
  --markdown-file report.md

python3 scripts/send_rich_message.py send \
  --token "$BOT_TOKEN" \
  --chat-id "@mychannel" \
  --blocks-json blocks.json \
  --upload photo.jpg
```

## 4-Layer Fallback Strategy

When converting plain content to rich, follow the 4-layer strategy:

1. **Layer 1**: Rich markdown (headings, bold, lists, tables).
2. **Layer 2**: Rich HTML (spoilers, custom emoji, expandable blocks).
3. **Layer 3**: Block JSON (complex layouts, media bindings).
4. **Layer 4**: Plain `sendMessage` with `parse_mode: HTML` (fallback if rich unsupported).

## References

| File | Content |
|------|---------|
| `references/rich-messages.md` | Syntax reference, markdown & HTML patterns, API 10.2 |
| `references/field-tested-blocks.md` | ✅ Field-tested reality (2026-08-30): what actually works, corrected field names, HTML equivalents |
| `references/api-objects.md` | Spec/API object reference (⚠️ intent, NOT live truth — see field-tested-blocks.md) |
| `references/streaming.md` | Streaming AI replies: draft, thinking, finalize |
| `references/digest.md` | Digest patterns: flat, preview+collapsed, media evidence |
| `scripts/send_rich_message.py` | Ready-to-use sending script (send, draft, upload) |
| `agents/openai.yaml` | OpenAI agent config |

Related live skills: `telegram-rich-custom-emoji` (custom emoji di rich msgs: HTML/Markdown/blocks + ID terverifikasi) dan `telegram-premium-emoji` (katalog emoji premium & kode bot `sendMessage`).
