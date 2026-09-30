---
name: grammy
version: 1.46.0
description: "Guidance for building Telegram bots in TypeScript/JavaScript using grammY framework v1.46.0+ (Indonesian Edition)."
metadata:
  {
    "openclaw":
      {
        "emoji": "🎼",
      },
  }
---

# Panduan Tingkat Produksi Framework grammY (v1.46.0+)

grammY adalah framework TypeScript-first berkinerja tinggi untuk membangun bot Telegram. Panduan ini menjelaskan pola arsitektur produksi, desain middleware, manajemen state tingkat lanjut, fitur **Telegram Bot API 10.3** (Rich Messages, Reactions, Ephemeral Messages, Communities, Native Rich Buttons via `@grammyjs/types@5.0.0`), dan strategi deployment menggunakan dokumentasi resmi lokal dalam Bahasa Indonesia.

---

## Indeks Referensi

Untuk panduan mendalam tentang topik-topik tertentu dari dokumentasi resmi, bacalah file referensi berikut di folder `references/`:

- [API](references/api.md)
- [Classic Formatting](references/classic-formatting.md) — HTML parse mode, @grammyjs/format, ASCII tables, throttled edit streaming (pra-Rich-Messages; untuk fitur 10.x lihat skill `telegram-rich-messages`)
- [Context](references/context.md)
- [Conversations](references/conversations.md)
- [Deployment](references/deployment.md)
- [Errors & Error Handling](references/errors.md)
- [Filter Queries](references/filter-queries.md)
- [Menus](references/menus.md)
- [Middleware](references/middleware.md)
- [Scaling](references/scaling.md)
- [Sessions](references/sessions.md)

> 💡 **Dokumentasi Resmi Online**: [grammY Official Guide](https://grammy.dev/guide/) & [API Reference](https://grammy.dev/ref/)
>
> ℹ️ File di `references/` adalah **cermin verbatim** dari docs grammy.dev. Tautan internal di
> dalamnya (`./context`, `/ref/core/...`, `../plugins/...`) merujuk ke struktur situs grammy.dev,
> bukan ke file lokal — jadi tautan tersebut **tidak akan resolve secara lokal**. Itu disengaja
> agar isinya tetap setia pada sumber aslinya; untuk menelusuri tautan, buka
> `https://grammy.dev/<path>`.

---

## 1. Arsitektur & Alur Middleware (Middleware Pipeline)

Pada intinya, grammY dibangun di atas mesin middleware yang sangat dioptimalkan yang menyerupai Koa.js. 

### Komponen Utama
- **Kelas `Bot`**: Koordinator utama. Kelas ini mewarisi kelas `Composer` dan membungkus klien mentah Telegram Bot API (`bot.api`).
- **`Composer`**: Mesin perutean (routing) dan penyaringan (filtering). Memungkinkan pembuatan pohon middleware berdasarkan filter update (seperti `bot.on("message:text")`, `bot.command()`).
- **Middleware Runner**: Pipa alur kendali yang dieksekusi secara berurutan melalui handler yang terdaftar.

```mermaid
graph TD
    Update[Telegram Update] --> Bot[Bot / Composer]
    Bot --> MW1[Middleware 1]
    MW1 -->|next()| MW2[Middleware 2: Pengecekan Filter]
    MW2 -->|Cocok| Handler[Handler Utama]
    MW2 -->|Tidak Cocok / next()| MW3[Middleware 3]
    Handler -->|Mengembalikan / next()| MW1_Up[Middleware 1 Upstream]
```

### Mekanisme NextFunction (`next`)
Setiap middleware menerima objek `ctx` (Context) dan fungsi `next`.
- Memanggil `await next()` meneruskan eksekusi ke middleware berikutnya di hilir (downstream).
- Eksekusi mengalir ke bawah sepanjang rantai, dan setelah middleware hilir selesai, eksekusi akan kembali naik ke atas (upstream) dalam urutan terbalik (bubbling).
- Untuk menghentikan atau memutus rantai eksekusi, cukup jangan panggil `next()`.

```typescript
// Contoh Urutan Eksekusi Middleware
bot.use(async (ctx, next) => {
  const start = Date.now();
  // 1. Downstream: Meneruskan kontrol ke middleware berikutnya
  await next(); 
  // 4. Upstream: Berjalan setelah handler di bawahnya selesai
  const duration = Date.now() - start;
  console.log(`Update ${ctx.update.update_id} diproses dalam ${duration}ms`);
});

bot.command("start", async (ctx) => {
  // 2. Logika handler downstream
  await ctx.reply("Halo!");
  // 3. Rantai selesai (tidak memanggil next() di sini untuk mencegah eksekusi handler generik)
});
```

---

## 2. Fitur Telegram Bot API 10.3 di grammY (v1.46.0+)

grammY **v1.46.0** menyertakan **`@grammyjs/types@5.0.0`** secara native, yang mengikuti **Bot API 10.3 (24 Agustus 2026)** — jadi seluruh permukaan 10.3 sudah ter-type secara penuh tanpa perlu workaround cast tipe manual. Metode yang belum punya pembungkus tingkat tinggi diakses langsung lewat `ctx.api.raw.<method>({ ... })`.

> Padanan versi: grammY 1.44.0 → types 3.28.0 (Bot API 10.1) · grammY 1.45.1 → types 4.0.0 (Bot API 10.2) · **grammY 1.46.0 → types 5.0.0 (Bot API 10.3)**.

### A. Rich Messages (`sendRichMessage` & `rich_message`)

Tag rich HTML yang didukung mencakup `<h1>`–`<h6>`, `<p>`, `<table>`, `<details>`/`<summary>`,
`<footer>`, `<figure>`/`<figcaption>`, `<blockquote>`, `<aside>`, `<tg-spoiler>`, `<tg-math>`
(inline) dan `<tg-math-block>` (blok), `<tg-collage>`, `<tg-slideshow>`, `<tg-map>`, `<tg-time>`,
`<tg-emoji>`, serta `<hr/>` sebagai divider.

```typescript
// Mengirim pesan dengan format Rich Message HTML
await ctx.api.raw.sendRichMessage({
  chat_id: ctx.chat.id,
  rich_message: {
    html: "<h1>Judul</h1><p>Ini adalah <b>Rich Message</b>.</p><hr/><p>Fitur Bot API 10.3</p>",
  },
  // Catatan: sendRichMessage TIDAK menerima link_preview_options.
  // Gunakan skip_entity_detection di dalam rich_message bila perlu.
});

// Memperbarui pesan secara live (Edit Message dengan Rich Payload)
await ctx.api.raw.editMessageText({
  chat_id: ctx.chat.id,
  message_id: messageId,
  // JANGAN kirim text: "" — field text bersifat opsional dan cukup diabaikan
  // ketika rich_message diberikan (salah satu dari keduanya wajib ada).
  rich_message: {
    html: "<b>Update Live Streaming...</b>\n\nIsi jawaban ter-render rapi.",
  },
});
```

**Parameter `sendRichMessage` yang valid** (per `@grammyjs/types@5.0.0`):
`business_connection_id`, `chat_id`, `message_thread_id`, `direct_messages_topic_id`,
`rich_message`, `disable_notification`, `protect_content`, `allow_paid_broadcast`,
`message_effect_id`, `suggested_post_parameters`, `reply_parameters`, `reply_markup`,
dan `ephemeral_message_parameters` (10.3).

Isi `rich_message` (`InputRichMessage`) menerima:
- `html` / `markdown`: string pemformatan teks kaya.
- `blocks`: array blok terstruktur (`InputRichBlock*`), termasuk `buttons` (`InputRichBlockButtons` untuk action card full-width), `table` (dengan `is_compact: true`), `expandable_block_quotation` (quote lipat), dan `document`.
- `media`: array binding media (`InputRichMessageMedia`).
- `is_rtl` & `skip_entity_detection`.

### B. Ephemeral Messages (Bot API 10.2 / 10.3 Wrapper)

Pesan di grup/supergrup yang **hanya terlihat oleh satu pengguna**. Di Bot API 10.3, parameter `receiver_user_id` dan `callback_query_id` telah dibungkus secara resmi ke dalam `ephemeral_message_parameters`:

```typescript
// Balasan ephemeral di grup (hanya terlihat oleh pengirim / penekan tombol)
await ctx.api.raw.sendMessage({
  chat_id: ctx.chat.id,
  text: "Hanya kamu yang bisa melihat pesan ini.",
  ephemeral_message_parameters: {
    receiver_user_id: ctx.from.id,
    callback_query_id: ctx.callbackQuery?.id,
    replace_callback_query_message: false,
  },
});
```

### C. Keyboard & UI Updates Bot API 10.3 di grammY

1. **Disabled Button (`InlineKeyboardButton.disabled` / `DisabledButton`)**:
   Menonaktifkan tombol secara visual tanpa merusak tata letak baris keyboard:
   ```typescript
   import { InlineKeyboard } from "grammy";

   const keyboard = new InlineKeyboard()
     .text("Tombol Aktif", "btn_active")
     .row()
     .text("Sedang Diproses...", "noop", { disabled: true });
   ```

2. **Stream Cancellation (`can_stop` & `keep_on_stop`)**:
   Saat streaming draf jawaban AI via `sendRichMessageDraft`, tambahkan `can_stop: true` untuk memunculkan tombol stop generation bagi pengguna:
   ```typescript
   await ctx.api.raw.sendRichMessageDraft({
     chat_id: ctx.chat.id,
     draft_id: draftId,
     rich_message: { html: partialText },
     can_stop: true,
     keep_on_stop: false,
   });

   // Menangani event stop dari pengguna
   bot.on("message_generation_stopped", async (ctx) => {
     console.log("Pengguna menghentikan streaming draf.");
   });
   ```

---

## 3. Context Kustom Tingkat Lanjut & Tipe Data (Custom Context Types)

Dalam bot skala produksi, Anda akan menggunakan banyak plugin yang memperluas objek konteks (`ctx`). Anda harus menentukan tipe konteks kustom terpadu menggunakan tipe persimpangan (intersection types).

```typescript
import { Context, SessionFlavor } from "grammy";
import { ConversationFlavor, Conversation } from "@grammyjs/conversations";
import { MenuFlavor } from "@grammyjs/menu";

// Tentukan Struktur Data Session
export interface SessionData {
  pizzaSelection?: string;
  orderStep: number;
}

// Gabungkan Semua Flavor ke dalam Context Kustom
export type MyContext = Context & 
  SessionFlavor<SessionData> & 
  ConversationFlavor & 
  MenuFlavor;

// Helper Tipe Data Percakapan Kustom
export type MyConversation = Conversation<MyContext>;
```

---

## 4. Sistem Session & Storage Backends

Session menyimpan state pengguna/chat di sepanjang update menggunakan key unik (biasanya `chat.id` atau `from.id`).

### Strategi Penyimpanan
- **In-Memory**: Sangat baik untuk pengembangan/pengujian; data hilang ketika bot dimulai ulang.
- **Redis**: Ideal untuk penskalaan horizontal dan penyimpanan latensi rendah.
- **MongoDB**: Sangat baik untuk penyimpanan data berbasis dokumen yang persisten.

```typescript
import { Bot, session } from "grammy";
import { MyContext, SessionData } from "./types";
import { RedisAdapter } from "@grammyjs/storage-redis";
import IORedis from "ioredis";
import { MongoDBAdapter, ISession } from "@grammyjs/storage-mongodb";
import { MongoClient } from "mongodb";

const bot = new Bot<MyContext>("TOKEN_BOT");

// 1. Setup Session In-Memory
const memorySession = session({
  initial: (): SessionData => ({ orderStep: 0 }),
});

// 2. Setup Session Redis (Direkomendasikan untuk Produksi)
const redisInstance = new IORedis("redis://localhost:6379");
const redisSession = session({
  initial: (): SessionData => ({ orderStep: 0 }),
  storage: new RedisAdapter({ connection: redisInstance }),
});

// 3. Setup Session MongoDB
const client = new MongoClient("mongodb://localhost:27017");
const db = client.db("telegram-bot");
const mongodbSession = session({
  initial: (): SessionData => ({ orderStep: 0 }),
  storage: new MongoDBAdapter({ collection: db.collection<ISession>("sessions") }),
});

// Pasang middleware session sebelum mendefinisikan rute/handler
bot.use(redisSession);
```

---

## 5. Plugin Conversations (Alur Percakapan Aktif)

Plugin `@grammyjs/conversations` memungkinkan Anda menulis alur kontrol asinkron linier menggunakan sintaks standar `async/await`.

```typescript
import { conversations, createConversation } from "@grammyjs/conversations";
import { MyContext, MyConversation } from "./types";

// Definisikan Alur Percakapan
async function pizzaOrderConversation(conversation: MyConversation, ctx: MyContext) {
  await ctx.reply("Ukuran pizza apa yang Anda inginkan? (Small, Medium, Large)");
  
  // Tunggu pesan teks berikutnya dari pengguna
  const sizeCtx = await conversation.waitFor("message:text");
  const size = sizeCtx.message.text;
  
  // Pengecekan validasi input
  if (!["small", "medium", "large"].includes(size.toLowerCase())) {
    await ctx.reply("Ukuran tidak valid. Pemesanan dibatalkan.");
    return;
  }
  
  conversation.session.pizzaSelection = size;
  await ctx.reply(`Anda memilih ${size}. Silakan bagikan nomor telepon Anda:`, {
    reply_markup: {
      keyboard: [[{ text: "Bagikan Kontak", request_contact: true }]],
      one_time_keyboard: true,
      resize_keyboard: true
    }
  });

  // Menangani input kontak
  const contactCtx = await conversation.waitFor("message:contact");
  const phoneNumber = contactCtx.message.contact.phone_number;
  
  await ctx.reply(`Pesanan dikonfirmasi untuk ukuran: ${size}. Kontak: ${phoneNumber}`);
}

// Konfigurasi
bot.use(conversations());
bot.use(createConversation(pizzaOrderConversation));

// Rute untuk masuk ke dalam percakapan
bot.command("order", async (ctx) => {
  await ctx.conversation.enter("pizzaOrderConversation");
});
```

---

## 6. Plugin Menu (Keyboard Inline Interaktif)

Plugin `@grammyjs/menu` mempermudah pembuatan keyboard inline dinamis dengan perutean otomatis, navigasi halaman, dan pembaruan secara real-time.

```typescript
import { Menu } from "@grammyjs/menu";
import { MyContext } from "./types";

// Definisikan Submenu terlebih dahulu agar bisa direferensikan oleh menu utama
const settingsMenu = new Menu<MyContext>("settings-menu")
  .text("Ubah Notifikasi", (ctx) => ctx.reply("Pengaturan notifikasi diubah!"))
  .back("Kembali");

// Definisikan Menu Utama
const mainMenu = new Menu<MyContext>("main-menu")
  .text(
    (ctx) => `Counter: ${ctx.session.orderStep}`, 
    (ctx) => {
      ctx.session.orderStep++;
      ctx.menu.update(); // Perbarui tampilan menu secara dinamis
    }
  )
  .row()
  .submenu("Pengaturan", "settings-menu")
  .url("Dokumentasi", "https://grammy.dev");

// Daftarkan submenu ke dalam menu utama
mainMenu.register(settingsMenu);

bot.use(mainMenu);

bot.command("menu", async (ctx) => {
  await ctx.reply("Navigasi Utama:", { reply_markup: mainMenu });
});
```

---

## 7. Plugin Runner (Pemrosesan Konkuren Berkinerja Tinggi)

Mekanisme polling bawaan (`bot.start()`) bersifat single-threaded dan memproses update secara berurutan. Untuk skala produksi, gunakan `@grammyjs/runner` untuk menangani update secara konkuren dengan pembatasan laju (rate limiting) dan pemrosesan yang aman.

```typescript
import { run, sequentialize } from "@grammyjs/runner";
import { MyContext } from "./types";

const bot = new Bot<MyContext>("TOKEN");

// Batasi eksekusi agar update dari chat yang SAMA diproses secara berurutan
const getSessionKey = (ctx: MyContext) => ctx.chat?.id.toString();
bot.use(sequentialize(getSessionKey));

// Setup middleware & handler lainnya di sini...

// Mulai runner
const runner = run(bot, {
  runner: {
    maxConcurrency: 500, // Memproses hingga 500 update secara bersamaan
    allowedUpdates: ["message", "callback_query"],
  },
});

// Penanganan Graceful Shutdown
const stopRunner = async () => {
  if (runner.isRunning()) {
    console.log("Menghentikan runner...");
    await runner.stop();
    console.log("Runner dihentikan. Keluar dari proses.");
    process.exit(0);
  }
};

process.on("SIGINT", stopRunner);
process.on("SIGTERM", stopRunner);
```

---

## 8. Pola Deployment Produksi

### Pola A: Long-Polling dengan Runner
Direkomendasikan untuk server khusus atau container (Docker, Kubernetes).
- Skalabilitas tinggi melalui `@grammyjs/runner`.
- Pengujian dan debugging mudah tanpa memerlukan sertifikat SSL publik.

### Pola B: Webhook dengan Web Framework (Express / Fastify / Deno)
Ideal untuk arsitektur serverless (AWS Lambda, Vercel, Cloudflare Workers).

#### Integrasi Webhook Express
```typescript
import express from "express";
import { webhookCallback } from "grammy";

const app = express();
app.use(express.json());

app.post("/webhook", webhookCallback(bot, "express"));

app.listen(3000, () => {
  console.log("Bot webhook server berjalan pada port 3000");
});
```

---

## 9. Kesalahan Umum, Konflik Tipe data, & Penanganan Error

### Penanganan Error (`bot.catch`)
Selalu daftarkan handler error global. Tanpa ini, kesalahan runtime selama pemrosesan update dapat menghentikan proses Node.js Anda.

```typescript
bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error saat menangani update ${ctx.update.update_id}:`);
  const e = err.error;
  
  if (e instanceof GrammyError) {
    console.error("Error dalam request:", e.description);
  } else if (e instanceof HttpError) {
    console.error("Gagal menghubungi Telegram:", e);
  } else {
    console.error("Error tidak dikenal:", e);
  }
});
```

### Jebakan Kritis (Pitfalls)
1. **Urutan Middleware**: `bot.use(session())` HARUS didaftarkan sebelum `conversations()` atau handler lain yang membaca/menulis session data.
2. **Lupa `await next()`**: Melewatkan `await next()` pada middleware logger atau analitik akan memutus rantai dan menghentikan pemrosesan update selanjutnya.
3. **Resolusi Key Session**: Saat menggunakan `sequentialize`, pastikan fungsi key mengembalikan nilai yang konsisten dengan key session Anda.
4. **Kehilangan Tipe pada Context**: Jangan gunakan `Context` bawaan jika Anda menggunakan session/conversations, melainkan gunakan tipe context kustom Anda (`MyContext`).

---

## Baca Selanjutnya

- [Telegram Bot API — indeks utama](../telegram-bot-api/SKILL.md)
- [Keyboards & Interactive Input](../telegram-bot-api/references/keyboards-and-input.md)
- [Messages & Formatting](../telegram-bot-api/references/messages-and-formatting.md)
- [Rich Messages (Bot API 10.1+)](../telegram-rich-messages/SKILL.md)
