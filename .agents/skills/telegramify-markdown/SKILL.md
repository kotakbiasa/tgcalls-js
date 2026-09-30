---
name: telegramify-markdown
description: "Use when converting Markdown (LLM output, GitHub READMEs, docs) to Telegram Bot API MessageEntity tuples — no parse_mode, no escaping headaches. Covers convert(), telegramify() async pipeline, auto-split long messages, Mermaid diagram rendering, LaTeX→Unicode, code block file extraction."
version: 1.2.0
metadata:
  {
    "openclaw":
      {
        "emoji": "📝",
      },
  }
---

# telegramify-markdown

Python library that parses Markdown and produces `(text, list[MessageEntity])` pairs ready for `sendMessage(entities=...)`. Built on **pyromark** (Rust pulldown-cmark) — correct UTF-16 offsets, zero escaping bugs.

**Install:** `pip install telegramify-markdown` (Python ≥3.10, MIT)

---

## Quick Start

```python
from telegramify_markdown import convert, telegramify

# Simple: Markdown → (text, entities)
text, entities = convert("**Bold** `code` [link](https://t.me)")
await bot.send_message(chat_id, text, entities=entities)

# Full pipeline: async, auto-split >4096, Mermaid→image, code blocks→files
await telegramify(bot, chat_id, markdown_text)
```

---

## Core Functions

| Function | Signature | Use When |
|----------|-----------|----------|
| `convert` | `convert(md: str) -> tuple[str, list[MessageEntity]]` | Single message, you control sending |
| `telegramify` | `telegramify(bot, chat_id, md, **kwargs) -> list[Message]` | Fire-and-forget: splits, renders, sends |
| `split_entities` | `split_entities(text, entities, limit=4096) -> list[tuple[str, list]]` | Manual chunking of `convert()` output |
| `entities_to_markdownv2` | `entities_to_markdownv2(text, entities) -> str` | Reverse: entities → legacy MarkdownV2 string |

---

## Supported Markdown Features

| Feature | Rendering |
|---------|-----------|
| `**bold**`, `*italic*`, `~~strike~~`, `==mark==`, `> quote` | `MessageEntityBold`, `Italic`, `Strikethrough`, `Underline`, `Blockquote` |
| `` `code` ``, ``` ```fence``` `` | `Code`, `Pre` (language preserved) |
| `[text](url)`, `@username`, `#hashtag` | `TextLink`, `Mention`, `Hashtag` |
| `$$latex$$` | LaTeX → Unicode (via `latex2unicode`) |
| `>! spoiler !<` | `Spoiler` entity |
| `> **Details**\ncontent` | Expandable `Blockquote` (Telegram 10.2+) |
| Mermaid ```mermaid ...``` | Rendered to PNG via `mermaid-cli`, sent as photo |
| Tables (GFM) | Linearized to text + entities (Telegram has no native table) |
| Headings `#` `##` | Bold + newline (no native heading entity) |

---

## telegramify() Options

```python
await telegramify(
    bot, chat_id, markdown,
    # Message splitting
    max_message_length=4096,      # Telegram limit
    split_on="\n\n",              # Prefer paragraph boundaries
    # Code blocks
    extract_code_blocks=True,     # Send fenced blocks as document files
    code_block_extension_map={    # Default: py→py, js→js, ts→ts, rs→rs, ...
        "python": "py", "javascript": "js", "typescript": "ts",
    },
    # Mermaid diagrams
    render_mermaid=True,          # Requires @mermaid-cli installed
    mermaid_theme="dark",         # "default", "dark", "forest", "neutral"
    mermaid_scale=2,              # Image DPI multiplier
    # LaTeX
    latex_to_unicode=True,
    # Custom entity handlers
    custom_entities=None,         # Dict[pattern, EntityType] for regex→entity
)
```

---

## Common Patterns

### Send LLM reply with formatting
```python
from telegramify_markdown import telegramify

llm_output = """
## Analysis
**Key finding:** `revenue` up 12%.

```python
df.groupby('month').sum()
```

> **Note:** Data truncated at 100 rows.
"""

await telegramify(bot, chat_id, llm_output)
```

### Convert then manually send (e.g., with reply_markup)
```python
text, entities = convert(markdown)
await bot.send_message(
    chat_id, text, entities=entities,
    reply_markup=InlineKeyboardMarkup(...),
    disable_web_page_preview=True,
)
```

### Batch convert for album / media group
```python
chunks = split_entities(*convert(long_md), limit=1024)
for i, (t, e) in enumerate(chunks):
    await bot.send_message(chat_id, t, entities=e)
```

---

## Edge Cases & Gotchas

| Issue | Fix |
|-------|-----|
| Entities offset wrong | Library uses UTF-16 code units (Telegram spec) — do NOT re-encode text |
| Message >4096 after convert | Use `split_entities()` or `telegramify()` which auto-splits |
| Mermaid not rendering | Install `@mermaid-cli` (`npm i -g @mermaid-cli`) and ensure `mmdc` in PATH |
| Custom emoji not working | Use `<tg-emoji emoji-id="...">` in HTML mode; Markdown has no custom emoji syntax |
| Nested entities (bold+italic) | Supported — pyromark emits correct nested ranges |

---

## Integration with DeltaUserJS / DownBot

```python
# In your message handler
from telegramify_markdown import telegramify

@bot.on_message(filters.command("md"))
async def md_handler(client, message):
    md_text = message.text.split(maxsplit=1)[1]
    await telegramify(client, message.chat.id, md_text)
```

---

## References

- **Repo:** https://github.com/sudoskys/telegramify-markdown
- **PyPI:** https://pypi.org/project/telegramify-markdown/
- **Full docs:** `llms-full.txt` in repo (LLM-friendly reference)
- **Changelog:** Releases page (v1.2.0 Jun 2026)