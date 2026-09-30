---
name: scaling
description: Complete reference documentation and practical guide.
---

# Panduan Penskalaan, Webhook, dan Konkurensi grammY

Dokumen referensi ini merinci arsitektur deployment produksi untuk bot grammY berskala besar dan berkinerja tinggi, mengacu pada dokumentasi lokal `/home/ubuntu/DeltaUserJS/docs/grammy/plugins/runner.md`. Panduan ini mencakup konfigurasi webhook, orkestrasi pemrosesan konkuren menggunakan `@grammyjs/runner`, serta penanganan pemutusan bot secara aman (graceful shutdown).

---

## 1. Konfigurasi Webhook untuk Produksi

Dalam skenario produksi dengan lalu lintas tinggi, penggunaan webhook jauh lebih efisien dibandingkan long polling bawaan. Webhook mengurangi latensi jaringan, menghemat beban CPU server, dan memungkinkan bot ditaruh di lingkungan serverless atau klaster container (seperti Docker, Kubernetes, atau Google Cloud Run).

### A. Integrasi Webhook Express (TypeScript)
```typescript
import express from "express";
import { Bot, webhookCallback } from "grammy";

const bot = new Bot(process.env.BOT_TOKEN!);

bot.command("start", (ctx) => ctx.reply("Webhook Express berjalan sukses!"));

const app = express();
app.use(express.json());

// Menyembunyikan token bot di dalam URL webhook adalah praktik keamanan terbaik
app.post(`/webhook/${process.env.BOT_TOKEN}`, webhookCallback(bot, "express"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Bot mendengarkan di port ${PORT}`);
});
```

### B. Integrasi Webhook Fastify (TypeScript)
Fastify memiliki kinerja pemrosesan JSON yang jauh lebih tinggi dan overhead yang minimal dibandingkan Express.
```typescript
import Fastify from "fastify";
import { Bot, webhookCallback } from "grammy";

const bot = new Bot(process.env.BOT_TOKEN!);
bot.on("message", (ctx) => ctx.reply("Pesan Anda diterima!"));

const fastify = Fastify({ logger: true });

fastify.post(`/webhook/${process.env.BOT_TOKEN}`, webhookCallback(bot, "fastify"));

const start = async () => {
  try {
    const PORT = parseInt(process.env.PORT || "3000", 10);
    await fastify.listen({ port: PORT, host: "0.0.0.0" });
    console.log("Server webhook Fastify siap digunakan.");
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
start();
```

---

## 2. Manajemen Konkuresi dengan `@grammyjs/runner`

Mekanisme polling standar (`bot.start()`) memproses update secara berurutan. Untuk memproses ratusan hingga ribuan pesan secara bersamaan, kita harus menggunakan `@grammyjs/runner`.

Instalasi plugin:
```bash
npm install @grammyjs/runner
```

### Implementasi Dasar Runner

```typescript
import { Bot } from "grammy";
import { run } from "@grammyjs/runner";

const bot = new Bot(process.env.BOT_TOKEN!);

bot.on("message", async (ctx) => {
  // Simulasi pemrosesan I/O berat
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await ctx.reply("Permintaan selesai diproses!");
});

// Jalankan runner dengan opsi konfigurasi
const runner = run(bot, {
  runner: {
    maxConcurrency: 500, // Maksimal 500 update diproses secara bersamaan
    allowedUpdates: ["message", "callback_query"],
  },
  sink: {
    upstream: {
      limit: 100, // Mengambil maksimal 100 update per polling
    }
  }
});
```

---

## 3. Pemrosesan Sekuensial per Obrolan (sequentialize)

Saat memproses pesan secara konkuren, update dari obrolan yang sama bisa saling mendahului, menyebabkan ketidakcocokan data status (race condition) pada plugin session.

Untuk menjamin agar update dari **chat yang sama** tetap diproses secara berurutan (sekuensial), gunakan middleware `sequentialize` sebelum memasang middleware session.

```typescript
import { Bot } from "grammy";
import { run, sequentialize } from "@grammyjs/runner";

const bot = new Bot(process.env.BOT_TOKEN!);

// Tentukan key sekuensial berdasarkan id obrolan
const dapatkanKeyObrolan = (ctx: any) => ctx.chat?.id.toString();
bot.use(sequentialize(dapatkanKeyObrolan));

// Pasang session dan handler setelah sequentialize
```

---

## 4. Penanganan Pemutusan Secara Aman (Graceful Shutdown)

Ketika melakukan redeployment server, proses bot tidak boleh dihentikan secara paksa di tengah jalan. Hal ini dapat merusak transaksi database atau mengakibatkan Telegram mengirim ulang update yang sama karena respons belum dikirim.

Anda harus menangkap sinyal sistem `SIGINT` dan `SIGTERM` untuk menghentikan runner secara aman.

```typescript
import { Bot } from "grammy";
import { run } from "@grammyjs/runner";

const bot = new Bot(process.env.BOT_TOKEN!);
const runner = run(bot);

async function hentikanBotSecaraAman() {
  console.log("Memulai penutupan bot secara aman...");
  
  if (runner.isRunning()) {
    // Hentikan penarikan update baru dari Telegram
    await runner.stop();
    console.log("Runner dihentikan. Tidak ada update baru yang ditarik.");
  }
  
  // Tutup koneksi database di sini (misal: Redis, Postgres, MongoDB)
  console.log("Koneksi eksternal berhasil ditutup.");
  process.exit(0);
}

// Tangkap sinyal pemutusan dari OS
process.on("SIGINT", hentikanBotSecaraAman);
process.on("SIGTERM", hentikanBotSecaraAman);
```

---

## 5. Pendistribusian dengan Worker Threads (Multithreading)

Jika bot Anda memiliki lalu lintas sangat tinggi (>50 juta update per hari atau >500 update per detik), pemrosesan dalam satu thread JavaScript utama tidak akan mencukupi. grammY runner mendukung pengiriman pekerjaan ke pekerja terpisah (`BotWorker`) memanfaatkan `Worker Threads` pada Node.js atau `Web Workers` pada Deno.

### File Utama (`bot.ts`)
```typescript
import { Bot } from "grammy";
import { distribute, run } from "@grammyjs/runner";

const bot = new Bot(process.env.BOT_TOKEN!);

// Distribusikan update ke file worker.ts
bot.use(distribute(__dirname + "/worker"));

run(bot);
```

### File Pekerja (`worker.ts`)
```typescript
import { BotWorker } from "@grammyjs/runner";

// Inisialisasi BotWorker
const bot = new BotWorker(process.env.BOT_TOKEN!);

bot.on("message", (ctx) => ctx.reply("Ditangani oleh Worker Thread!"));
```
