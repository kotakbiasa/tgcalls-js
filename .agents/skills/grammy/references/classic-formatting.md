> **⚠️ SCOPE NOTE (2026-08-25):** Dokumen ini mencakup *classic formatting* grammY —
> HTML parse mode, `@grammyjs/format`, ASCII tables, inline keyboards, dan streaming via
> throttled `editMessageText`. Ini fitur **pra-Bot API 10.1**.
>
> Untuk fitur Rich Messages modern (`sendRichMessage`, blocks JSON, rich buttons berwarna,
> expandable blockquote, ephemeral messages, streaming draft 10.3), lihat skill
> **`telegram-rich-messages`** dan **`telegram-bot-api`** → references/ephemeral-and-communities.md.
> Catatan: rich buttons BELUM bisa dikirim via grammy 1.45 serializer (field stripped) —
> gunakan HTTP fetch langsung sampai @grammyjs/types 5.0 dibundel.

---

# grammY Rich Formatting, Tables, Keyboards & Streaming Reference

> **Verified Version:** grammY `v1.45.1` (with grammY 2.0 Roadmap)  
> **Source:** `https://grammy.dev/guide/basics`, `https://grammy.dev/plugins/keyboard`, `https://grammy.dev/plugins/parse-mode`, `https://grammy.dev/plugins/format`

---

## Table of Contents
- [1. Message Formatting in Telegram & grammY](#1-message-formatting-in-telegram--grammy)
- [2. HTML Parse Mode (`parse_mode: "HTML"`)](#2-html-parse-mode-parse_mode-html)
  - [Supported HTML Tags](#supported-html-tags)
  - [Safe HTML Escaping Utility](#safe-html-escaping-utility)
  - [Link Preview Control (`link_preview_options`)](#link-preview-control-link_preview_options)
- [3. Type-Safe Formatting Plugins](#3-type-safe-formatting-plugins)
  - [`@grammyjs/format` (JSX-like Builder)](#grammyjsformat-jsx-like-builder)
  - [`@grammyjs/parse-mode` (Hydrated Reply Shortcuts)](#grammyjsparse-mode-hydrated-reply-shortcuts)
- [4. Rendering Markdown Tables & Dashboards in Telegram](#4-rendering-markdown-tables--dashboards-in-telegram)
  - [A. Monospace ASCII `<pre>` Code Block (Recommended)](#a-monospace-ascii-pre-code-block-recommended)
  - [B. Clean Key-Value Card Layout](#b-clean-key-value-card-layout)
- [5. Inline Keyboards (`InlineKeyboard`) & Callback Lifecycle](#5-inline-keyboards-inlinekeyboard--callback-lifecycle)
  - [Button Types & Grid Layout](#button-types--grid-layout)
  - [Dismissing Loading Spinners with `answerCallbackQuery`](#dismissing-loading-spinners-with-answercallbackquery)
- [6. Live Streaming & Ephemeral Progress (The Real Way)](#6-live-streaming--ephemeral-progress-the-real-way)
  - [Chat Action Typing Indicator](#chat-action-typing-indicator)
  - [AI / LLM Token Streaming via Throttled `editMessageText`](#ai--llm-token-streaming-via-throttled-editmessagetext)
- [7. Production Implementation Recipes](#7-production-implementation-recipes)
  - [Recipe A: Interactive Infrastructure Dashboard Card](#recipe-a-interactive-infrastructure-dashboard-card)
  - [Recipe B: AI Streaming Response Handler](#recipe-b-ai-streaming-response-handler)
  - [Recipe C: Dynamic Formatted Message with Custom Keyboard](#recipe-c-dynamic-formatted-message-with-custom-keyboard)

---

## 1. Message Formatting in Telegram & grammY

Telegram Bot API relies on `sendMessage` (exposed via `ctx.reply()` in 1.x and `ctx.send()` in 2.0). All visual richness—including bold headers, monospace code snippets, expandable quotes, spoilers, and custom emojis—is controlled via parse modes (`parse_mode`) or message entities.

### Comparison of Formatting Options

| Strategy | Advantages | Caveats | Best Use Case |
| :--- | :--- | :--- | :--- |
| **`parse_mode: "HTML"`** | Clean, intuitive, highly reliable | Requires escaping `<`, `>`, `&` in dynamic text | **Default recommendation for 95% of bots** |
| **`@grammyjs/format`** | 100% type-safe, zero manual escaping | Extra dependency | Dynamic templating and complex structured texts |
| **`@grammyjs/parse-mode`** | Adds `ctx.replyWithHTML`, `ctx.replyWithMarkdown` | Plugin setup required | Convenience shortcuts |
| **`parse_mode: "MarkdownV2"`** | Standard markdown syntax | Fragile; requires escaping 18 special characters | Static templates only |

---

## 2. HTML Parse Mode (`parse_mode: "HTML"`)

HTML is the official gold standard for stable Telegram bots.

### Supported HTML Tags

| Tag | Purpose | Example |
| :--- | :--- | :--- |
| `<b>`, `<strong>` | Bold header or emphasized text | `<b>System Status</b>` |
| `<i>`, `<em>` | Italicized subtitle or caption | `<i>Updated 2 mins ago</i>` |
| `<u>`, `<ins>` | Underlined text | `<u>Attention</u>` |
| `<s>`, `<strike>`, `<del>` | Strikethrough text | `<s>Original: $100</s>` |
| `<tg-spoiler>` | Concealed spoiler content | `<tg-spoiler>Secret OTP: 1234</tg-spoiler>` |
| `<a href="...">` | Embedded inline hyperlink | `<a href="https://grammy.dev">grammY Docs</a>` |
| `<code>` | Monospace inline snippet | `<code>npm install grammy</code>` |
| `<pre>` | Multi-line code block | `<pre><code class="language-typescript">const x = 1;</code></pre>` |
| `<blockquote>` | Quoted message block | `<blockquote>Quoted note</blockquote>` |
| `<blockquote expandable>` | Collapsible / expandable blockquote | `<blockquote expandable>Long changelog...</blockquote>` |
| `<tg-emoji emoji-id="...">` | Custom animated Telegram emoji | `<tg-emoji emoji-id="5368324170671202286">👍</tg-emoji>` |

### Safe HTML Escaping Utility

When interpolating dynamic user input or database results into HTML templates, always escape special characters:

```typescript
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Usage:
const safeUser = escapeHtml(ctx.from?.first_name ?? "User");
await ctx.reply(`Hello, <b>${safeUser}</b>!`, { parse_mode: "HTML" });
```

### Link Preview Control (`link_preview_options`)

```typescript
await ctx.reply(`Check our guide: <a href="https://grammy.dev">grammY Docs</a>`, {
  parse_mode: "HTML",
  link_preview_options: {
    is_disabled: false,        // false = show preview; true = disable completely
    prefer_small_media: true,  // Display compact thumbnail banner
    show_above_text: false,    // Preview below text
  },
});
```

---

## 3. Type-Safe Formatting Plugins

### `@grammyjs/format` (JSX-like Builder)

`@grammyjs/format` eliminates escaping errors completely by constructing `entities` programmatically:

```typescript
import { fmt, bold, italic, code, link, spoiler } from "@grammyjs/format";

bot.command("info", async (ctx) => {
  const text = fmt`
${bold("User Profile")}
• Name: ${ctx.from?.first_name}
• ID: ${code(ctx.from?.id.toString())}
• Status: ${italic("Active")}
• Secret: ${spoiler("VIP-2026")}

Read more at ${link("Official Guide", "https://grammy.dev")}`;

  await ctx.reply(text);
});
```

### `@grammyjs/parse-mode` (Hydrated Reply Shortcuts)

Adds convenient methods like `ctx.replyWithHTML` to `Context`:

```typescript
import { hydrateReply, parseMode } from "@grammyjs/parse-mode";
import type { ParseModeFlavor } from "@grammyjs/parse-mode";

type MyContext = ParseModeFlavor<Context>;
const bot = new Bot<MyContext>("BOT_TOKEN");

// 1. Install transformer to set default parse mode
bot.api.config.use(parseMode("HTML"));

// 2. Install context hydration
bot.use(hydrateReply);

bot.command("start", async (ctx) => {
  // Directly sends with HTML parse mode
  await ctx.replyWithHTML("<b>Welcome</b> to our bot!");
});
```

---

## 4. Rendering Markdown Tables & Dashboards in Telegram

Because Telegram Bot API does not render GUI markdown tables natively, production bots use two proven layout techniques:

### A. Monospace ASCII `<pre>` Code Block (Recommended)

Render neatly aligned tables inside `<pre>` blocks:

```typescript
export function formatMonospaceTable(headers: string[], rows: string[][]): string {
  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length))
  );

  const formatRow = (row: string[]) =>
    row.map((cell, i) => (cell ?? "").padEnd(colWidths[i])).join(" │ ");

  const separator = colWidths.map((w) => "─".repeat(w)).join("─┼─");

  return [
    "<pre>",
    formatRow(headers),
    separator,
    ...rows.map(formatRow),
    "</pre>",
  ].join("\n");
}

// Example Output:
// Component │ Status │ Latency
// ──────────┼────────┼────────
// Gateway   │ 🟢 Up  │ 12ms
// Database  │ 🟢 Up  │ 2ms
```

### B. Clean Key-Value Card Layout

For mobile readability, format cards with bold headers and emoji bullets:

```typescript
const dashboardCard = [
  "<b>📊 Infrastructure Metrics</b>",
  "",
  "<b>⚙️ Runtime</b>",
  "• Node: <code>v22.12.0</code>",
  "• Mode: <code>Polling / Runner</code>",
  "• Uptime: <code>14h 22m</code>",
  "",
  "<b>💾 Memory & Storage</b>",
  "• Heap: <code>42.1 MB / 512 MB</code>",
  "• Redis: 🟢 <code>Connected</code>",
  "",
  "<b>Status:</b> 🟢 <i>All services operational</i>",
].join("\n");

await ctx.reply(dashboardCard, { parse_mode: "HTML" });
```

---

## 5. Inline Keyboards (`InlineKeyboard`) & Callback Lifecycle

### Button Types & Grid Layout

```typescript
import { InlineKeyboard } from "grammy";

const keyboard = new InlineKeyboard()
  // URL Button
  .url("📖 Docs", "https://grammy.dev")
  // Callback Button
  .text("🔄 Refresh", "stats:refresh")
  .row() // New row
  // Mini App Button
  .webApp("🚀 Open App", "https://app.example.com")
  // Copy to Clipboard Button
  .copyText("📋 Copy Code", "INVITE-2026-X");
```

### Dismissing Loading Spinners with `answerCallbackQuery`

> [!IMPORTANT]
> Always call `await ctx.answerCallbackQuery()` inside callback query handlers to dismiss the Telegram client loading indicator and prevent timeout errors.

```typescript
bot.callbackQuery("stats:refresh", async (ctx) => {
  // 1. Immediately acknowledge callback query
  await ctx.answerCallbackQuery({
    text: "Refreshing metrics...",
    show_alert: false, // false = toast banner; true = modal popup
  });

  // 2. Edit existing message in-place
  await ctx.editMessageText(getUpdatedDashboardHtml(), {
    parse_mode: "HTML",
    reply_markup: createDashboardKeyboard(),
  });
});
```

---

## 6. Live Streaming & Ephemeral Progress (The Real Way)

To provide real-time feedback during long-running tasks or AI token generation in Telegram:

### Chat Action Typing Indicator
```typescript
// Tells the user the bot is typing (lasts 5 seconds or until message is sent)
await ctx.replyWithChatAction("typing");
```

### AI / LLM Token Streaming via Throttled `editMessageText`

Telegram rate-limits rapid message editing (~1 edit per second per chat). Throttle editing updates to **800ms–1500ms**:

```typescript
bot.command("ask", async (ctx) => {
  const prompt = ctx.match;
  if (!prompt) return ctx.reply("Please provide a prompt.");

  await ctx.replyWithChatAction("typing");
  
  // 1. Send placeholder message
  const msg = await ctx.reply("<i>Synthesizing answer...</i>", { parse_mode: "HTML" });

  let buffer = "";
  let lastEditTime = 0;
  const EDIT_INTERVAL_MS = 1000;

  try {
    for await (const chunk of fakeAiStream(prompt)) {
      buffer += chunk;
      const now = Date.now();

      // 2. Throttled in-place message edit
      if (now - lastEditTime > EDIT_INTERVAL_MS) {
        lastEditTime = now;
        await ctx.api.editMessageText(ctx.chat.id, msg.message_id, buffer, {
          parse_mode: "HTML",
        }).catch(() => {}); // Catch flood/same content errors safely
      }
    }

    // 3. Final edit with complete response
    await ctx.api.editMessageText(ctx.chat.id, msg.message_id, buffer, {
      parse_mode: "HTML",
    });
  } catch (err) {
    console.error("Stream error:", err);
  }
});
```

---

## 7. Production Implementation Recipes

### Recipe A: Interactive Infrastructure Dashboard Card

```typescript
import { Composer, Context, InlineKeyboard } from "grammy";

export type MyContext = Context;
export const dashboardFeature = new Composer<MyContext>();

function renderDashboard(): string {
  const timestamp = new Date().toISOString().replace("T", " ").substring(0, 19);
  const memory = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);

  return [
    "<b>🖥️ Server Infrastructure Dashboard</b>",
    "",
    "<b>⚡ Health & Performance</b>",
    "• Gateway: 🟢 <code>Operational (8ms)</code>",
    "• Database: 🟢 <code>Connected (2ms)</code>",
    `• Heap Usage: <code>${memory} MB</code>`,
    "",
    `<b>Last Updated:</b> <code>${timestamp} UTC</code>`,
  ].join("\n");
}

function dashboardKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🔄 Refresh", "dash:refresh")
    .url("📈 Grafana", "https://grafana.internal");
}

dashboardFeature.command("status", async (ctx) => {
  await ctx.reply(renderDashboard(), {
    parse_mode: "HTML",
    reply_markup: dashboardKeyboard(),
  });
});

dashboardFeature.callbackQuery("dash:refresh", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Dashboard updated!" });
  
  await ctx.editMessageText(renderDashboard(), {
    parse_mode: "HTML",
    reply_markup: dashboardKeyboard(),
  }).catch(() => {});
});
```

