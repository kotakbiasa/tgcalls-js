---
name: field-tested-blocks
description: What actually works in Rich Messages from live testing (2026-08-30). Corrects spec fields vs real API, shows the block types that truly render in blocks JSON, and the reliable HTML-mode equivalents.
---

# Rich Messages — Field-Tested Reality (2026-08-30)

Live-tested via `sendRichMessage` (bot FauzanVVIPBot, 93 payloads). **The spec (`api-objects.md`) describes the intended schema; the live API differs in important ways.** This is the source of truth for what actually renders.

> **TL;DR:** Use **HTML mode** for anything complex. Blocks JSON is far more limited than the spec claims, and several field names in the spec are wrong (the server rejects them).

## The big one — Blocks JSON field names are DIFFERENT

Media block types use a **same-named sub-object**, NOT a `media` field. The spec's `media: InputRichMessageMedia` is **wrong** — the server wants `{"type":"photo","photo":{"type":"photo","media":"..."}}`.

| Block type | Spec says | ✅ Live actually works |
|---|---|---|
| photo | `media: {...}` | `{"type":"photo","photo":{"type":"photo","media":"<url>"}}` |
| video | `media: {...}` | `{"type":"video","video":{"type":"video","media":"<url>"}}` |
| audio | `media: {...}` | `{"type":"audio","audio":{"type":"audio","media":"<url>"}}` |
| animation | `media: {...}` | `{"type":"animation","animation":{"type":"animation","media":"<url>"}}` |
| voiceNote | `media: {...}` | `{"type":"voice_note","voice_note":{"type":"voice_note","media":"<url>"}}` — **snake_case** (NOT `voiceNote`) |
| map | top-level `latitude`/`longitude` | `{"type":"map","location":{"latitude":..,"longitude":..,"zoom":..,"caption":".."}}` — needs a **`location` object** |
| collage | `media: [...]` | `{"type":"collage","blocks":[{"type":"photo","photo":{...}}]}` — uses **`blocks`**, not `media` |
| slideshow | `media: [...]` | `{"type":"slideshow","blocks":[{"type":"photo","photo":{...}}]}` — uses **`blocks`** |
| table | `header`/`rows` | `{"type":"table","cells":[[{"text":"A"},{"text":"B"}],...]}` — uses **`cells`** |

**Inline `text_mention`** — spec says `user_id`; live wants a **`user` object**:
```json
{"type":"paragraph","text":[{"type":"text_mention","text":"Ocan","user":{"id":1025855210}}]}
```

## Block types that DON'T work in blocks JSON (despite being in the spec)

These return `type "X" is unsupported` when used as a blocks-JSON `type`:

`sectionHeading`, `preformatted`, `blockQuotation`, `pullQuotation`, `mathematicalExpression`, `voiceNote` (camelCase), `thinking`, `custom_emoji` (as a standalone block).

**HTML-mode equivalents that DO work for all of them:**
- headings → `<h1>`–`<h6>`
- code block → `<pre><code class="language-...">`
- quote → `<blockquote>`, `<blockquote expandable>`
- math → `<tg-math>`, `<tg-math-block>`
- custom emoji → `<tg-emoji emoji-id="...">🔥</tg-emoji>`
- thinking → use streaming `sendRichMessageDraft` + RichBlockThinking (unverified) or plain text

## Block types that only work inside a multi-block message

`divider` and `anchor` return `RICH_MESSAGE_EMPTY` **when sent alone**, but render fine when combined with a `paragraph` or other content:

```json
"blocks":[
  {"type":"paragraph","text":"a"},
  {"type":"divider"},
  {"type":"anchor","name":"ref1"},
  {"type":"paragraph","text":"b"}
]
```

> Same for `list`/`details` — they returned `RICH_MESSAGE_EMPTY` alone in our test. Prefer `<ul>/<ol>` and `<details>` via HTML mode for reliability.

## Confirmed working (blocks JSON)

- `paragraph` ✅ (text accepts **plain string** — not nested `{"type":"plain",...}`)
- `table` with `cells` ✅
- `photo`, `video`, `audio`, `animation`, `voice_note` (with the same-named sub-object) ✅
- `collage`, `slideshow` with `blocks` ✅
- `map` with `location` object ✅
- `divider`, `anchor` (only inside mixed content) ✅

## Confirmed working (HTML mode) — ALL of these ✅

Headings, bold/italic/underline/strike, code, mark, sub/sup, spoiler, links, ul/ol (incl. checkbox `<input type=checkbox>`), table, details, blockquote (+ expandable), tg-spoiler, img, tg-collage, tg-slideshow, tg-button (url/callback), tg-map, tg-math, tg-math-block, footer, hr, pre+code, figure+figcaption, tg-emoji.

> ⚠️ `<tg-document>` — only works when an actual file/media is attached (`RICH_MESSAGE_DOCUMENT_NO_MEDIA_FOUND` with just a URL). Needs the document block via a real `file_id`/`attach://` upload.

## Confirmed working (Markdown mode) — ALL ✅

Headings, bold, italic, lists, tables (`| a | b |`), blockquotes, custom emoji `![🔥](tg://emoji?id=...)`.

## Inline RichText runs that work

`bold`, `italic`, `spoiler`, `code`, `custom_emoji`, `url`, `text_mention` (with `user:{id}`).

- `mathematicalExpression` inline → ❌ `Unsupported rich text type` (use `<tg-math>` HTML instead).
- **`plain` is NOT a valid run type** (2026-09-07 re-test: `{"type":"plain","text":"x"}` → `Unsupported rich text type`). Plain text goes into the array as a **bare string**: `["biasa ", {"type":"bold","text":"tebal"}]` ✅
- Markdown `**bold**` inside a blocks-mode `text` string is NOT parsed — it renders as literal asterisks. Bold in blocks = RichText run array.

## Limits (field-tested 2026-09-07, cross-checked vs official docs "Rich Message Limits")

Official docs section confirms: 32.768 UTF-8 chars total text, 500 blocks, 16 nesting levels, 50 media total, 20 table columns.

Field-tested additions/corrections (old spec numbers NOT enforced by server):
- Text total 32.768 (32768 ok / 32769 → `RICH_MESSAGE_TEXT_TOO_LONG`); **no per-paragraph 4096 limit** (32000-char single paragraph ✅)
- Blocks 500 (500 ok / 501 rejected)
- Media 50 **aggregate per message** (photo standalone + slideshow + collage combined) — 50 ok / 51 → `RICH_MESSAGE_MEDIA_TOO_MANY`; multi-slideshow splitting works (2×25 ✅, 3×17=51 ❌)
- Buttons per buttons-block: **8** (9 rejected) — blocks mode ONLY; inline HTML `<tg-button>` unlimited (50 ✅)
- `callback_data` 64 bytes (65 rejected, both modes)
- Button labels count toward the 32.768 text budget (8×4096 = 32768 ok, +1 rejected)
- Nesting via nested `details`: 15 ok / 16 rejected (docs "16 levels" counts differently; stay ≤ 14)
- NOT enforced: per-paragraph 4096, table row cap 50 (200 ✅), footer 200 chars (4096 ✅), collage 10 (50 ✅)
- `details` block field is **`blocks`** (array), not `content` — `content` string rejected

## Combining markdown/html + blocks (field-tested 2026-09-07)

Official docs: `InputRichMessage` — *"Exactly one of the fields html, markdown, or blocks must be used."*

Field-tested: sending `markdown` + `blocks` (or `html` + `blocks`) together **is accepted without error** — but undocumented; the response only echoes the `blocks` part. Treat as best-effort. If you need guaranteed behavior, use legacy `sendMessage` + `inline_keyboard`.

The **official** way to combine formatted text with media: `markdown`/`html` + `media` array with `InputRichMessageMedia` = `{"id": "foto1", "media": {"type": "photo", "media": "<file_id|url>"}}`, referenced in text as `tg://photo?id=foto1` (also `tg://video?id=`, `tg://document?id=`, `tg://audio?id=`). Trial-error: `media` as a bare string → `Field "media" must be of type Object`; missing `id` → `Can't find field "id"`.

## Field-Tested Findings (Live 2026-09-12)

### 1. Block Types: `sectionHeading` DITOLAK Server Live
- Mengirim `{"type": "sectionHeading", "level": 1, ...}` di blocks mode menghasilkan error:
  `Bad Request: can't parse InputRichBlock: type "sectionHeading" is unsupported`
- **Solusi**: Di blocks mode, gunakan `paragraph` biasa dengan formatting atau gunakan HTML mode `<h1>..<h6>`.

### 2. Multi-Row Block Buttons (Stacked `buttons` blocks)
- Di blocks mode, beberapa blok `{"type": "buttons", "buttons": [...]}` bisa ditumpuk berurutan:
  ```json
  [
    {"type": "buttons", "buttons": [{"text": "✅ Setuju", "style": "success", "callback_data": "tos_agree"}]},
    {"type": "buttons", "buttons": [{"text": "❌ Tolak", "style": "danger", "callback_data": "tos_decline"}]}
  ]
  ```
- **Hasil**: Menghasilkan tombol **blok penuh (full-width)** bertumpuk ke bawah, sangat rapi untuk action card!
- Valid styles: `primary`, `success`, `danger`, `link`.

### 3. Nested `table` di dalam `details`
- Blok `details` dengan `summary` (string) dan nested `table` (`is_compact: true`, `cells: [...]`) **100% diterima server & dirender sempurna** sebagai accordion tabel yang bisa di-expand/collapse!

### 4. Client Rendering: Teks Abu-abu / Muted Secondary Color
- Telegram **TIDAK** mendukung styling warna CSS custom (`<span style="color:gray">` atau `<dim>`).
- Teks warna abu-abu redup (*secondary muted color*, 100% sama dengan warna jam waktu chat) **HANYA AKTIF DI 2 TEMPAT**:
  1. `<figcaption>` yang menempel di bawah `<figure><img .../><figcaption>teks</figcaption></figure>`.
  2. `<footer>` yang diletakkan di **baris paling akhir (bottom)** chat bubble pesan.
- ⚠️ **Gotcha Client Android**: Jika `<footer>` atau `<tg-reference>` diselipkan di tengah-tengah pesan teks biasa (antar paragraf), client Telegram Android menurunkannya (*fallback*) menjadi **teks putih biasa** (tidak abu-abu).
- Untuk efek abu-abu tanpa gambar, `<footer>` wajib berada di paling bawah pesan.

### 5. Teks Kecil Menggantung: `<sub>` & `<sup>`
- `<sub>...</sub>` -> Subscript: teks kecil menggantung di bawah (cocok untuk indeks: `RAM<sub>used</sub>`, `Role<sub>(Owner)</sub>`).
- `<sup>...</sup>` -> Superscript: teks kecil menggantung di atas (cocok untuk badge versi: `DeltaUserJS<sup>v2.4</sup>`, `VIP<sup>★ AKTIF</sup>`, footnote `[1]<sup>[1]</sup>`).
- Keduanya valid di HTML mode dan dirender native oleh Telegram sebagai teks mini.

## Verdict / recommendation

1. **Default to HTML mode** — it renders everything cleanly, no field-name guessing.
2. Use **blocks JSON only** for: table, media (photo/video/audio/animation/voice_note), collage/slideshow, map — where you need precise control. Follow the corrected field names above.
3. **Treat `api-objects.md` as intent, not fact.** This file is the live truth.
