---
name: digest
description: Digest and channel-article patterns — flat layout, preview + collapsed full version, media as evidence, preflight gate.
---

# Digest & Channel Article Patterns (Bot API 10.2)

Send a digest, report, or newsletter as a single structured Telegram Rich Message — section headings, topic lists, collapsible long-tail, photo collage, map embed, and a footer — all in one document-grade message.

## Anatomy of a Digest

Recommended block sequence:

```
[heading h2]   — digest title + date range
[paragraph]    — 1–3 sentence lead: what happened, key number
[heading h3]   — topic 1
[list]         — 3–7 bullet items for topic 1
[heading h3]   — topic 2
[list]         — ...
[details]      — "All links / Full list" — long-tail, closed by default
[divider]      — visual separator before footer
[collage]      — photo report (optional)
[map]          — event location (optional)
[footer]       — date, source, issue number
```

## Layout Choice

### Flat Digest

Everything visible, `<details>` reserved for the long tail. Works for short digests — a handful of bullets a reader scans in the feed.

```html
<h2>AI Builders Weekly — Issue #24</h2>
<p>This week: <b>1,200 members</b>, 3 open-source tools shipped, 80+ reply thread.</p>

<h3>Top Discussions</h3>
<ul>
  <li><a href="...">LLM context limits</a> — 81 replies</li>
  <li><a href="...">Prompt caching deep dive</a> — 80% cost reduction</li>
  <li><a href="...">Tool use vs. RAG</a> — 6 code examples</li>
</ul>

<h3>Shipped This Week</h3>
<ul>
  <li><a href="...">promptkit v0.4</a> — parallel tool calls</li>
  <li><a href="...">evalframe</a> — lightweight eval harness</li>
</ul>

<details><summary>All links this week (9)</summary>
<ol>
  <li><a href="...">Thread 42</a></li>
  <li><a href="...">Thread 55</a></li>
</ol>
</details>

---
<footer>Issue #24 · 2026-07-28 · @mybot</footer>
```

### Preview + Collapsed Full Version

For long digests/articles. Make the cut yourself instead of letting Telegram truncate mid-sentence:

```
[heading h1]   — the claim, as a headline
[paragraph]    — 2-3 short paragraphs: the fact, your check, the consequence
[photo]        — cover image
[details]      — "Read the full version" — the ENTIRE article, closed by default
```

```html
<h1>Voice model ships with Russian audio-to-audio</h1>
<p>The vendor shipped <code>voice-think-fast-2.0</code> on July 29. First audio in 0.7s, $0.08/min.</p>
<p>We tested Russian audio-to-audio: the model heard the question and answered <b>323</b>.</p>
<img src="tg://photo?id=cover"/>
<details><summary>Read the full version</summary>
  <h2>What shipped</h2>
  ...
</details>
```

**Budget the preview**: ~500 visible characters total before `<details>`, no single paragraph over ~220 chars. Count visible characters, not markup.

Rules:
- **Media before `<details>` counts as part of the preview.** One cover image, no more.
- **Keep the `<details>` summary short** (~60 chars). The summary is what the feed reader sees.

## Block JSON Version (API 10.2)

Same digest using `blocks`:

```json
{
  "chat_id": "@mychannel",
  "rich_message": {
    "blocks": [
      {"type": "sectionHeading", "level": 2, "text": "AI Builders Weekly — Issue #24"},
      {"type": "paragraph", "text": "This week: 1,200 members, 3 tools shipped, 80+ reply thread."},
      {"type": "sectionHeading", "level": 3, "text": "Top Discussions"},
      {"type": "list", "items": [
        {"text": "LLM context limits — 81 replies"},
        {"text": "Prompt caching deep dive — 80% cost reduction"},
        {"text": "Tool use vs. RAG — 6 code examples"}
      ]},
      {"type": "details", "summary": "All links this week (9)", "content": "..."},
      {"type": "divider"},
      {"type": "footer", "text": "Issue #24 · 2026-07-28 · @mybot"}
    ]
  }
}
```

## Media as Evidence

Embed photos/screenshots as proof within the digest:

```html
<h3>Bug Report: API timeout</h3>
<p>The API timed out for 47 seconds during peak load.</p>
<img src="https://example.com/screenshot.png"/>
<details><summary>Full log</summary>
<pre>
2026-07-28 14:32:01 ERROR: request timed out (47s)
2026-07-28 14:32:48 INFO: retry succeeded
</pre>
</details>
```

### Block JSON with media binding:

```json
{
  "type": "photo",
  "media": {
    "type": "photo",
    "media": "https://example.com/screenshot.png",
    "caption": "API timeout graph"
  }
}
```

### Multipart upload (local file):

```bash
curl -s -X POST "https://api.telegram.org/bot$TOKEN/sendRichMessage" \
  -F "chat_id=@mychannel" \
  -F 'rich_message={"blocks":[{"type":"photo","media":{"type":"photo","media":"attach://evidence1","caption":"API timeout"}}]}' \
  -F "evidence1=@/path/to/screenshot.png"
```

## Preflight Gate

Before publishing, validate:

| Check | Rule |
|-------|------|
| Block count | ≤ 500 blocks (field-tested 500 ok / 501 gagal; bukan 100) |
| Paragraph length | ≤ 4096 chars each |
| Heading length | ≤ 200 chars each |
| Details summary | ≤ 200 chars |
| Details content | ≤ 4096 chars |
| Footer | ≤ 200 chars |
| Table rows | ≤ 50 |
| Table columns | ≤ 12 |
| Media per collage | ≤ 10 |
| Media per slideshow | ≤ 50 (field-tested 2026-09-07; 51+ → `RICH_MESSAGE_MEDIA_TOO_MANY`) |
| Preview chars (before `<details>`) | ~500 max |
| Details summary text | ~60 chars (feed-readable) |

## Example Payload

See `examples/community-digest.json` in the original serejaris/telegram-skills repo for a full `sendRichMessage` payload with HTML markup.
