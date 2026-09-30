---
name: sessions
description: Complete reference documentation and practical guide.
---

# Panduan dan Referensi Session grammY

Dokumen referensi ini menyediakan penjelasan mendalam dan implementasi tingkat produksi untuk pengelolaan session di grammY berdasarkan dokumentasi lokal `/home/ubuntu/DeltaUserJS/docs/grammy/plugins/session.md`. Session memungkinkan bot menyimpan data status (state) pengguna atau obrolan secara persisten di sepanjang update yang masuk.

---

## 1. Arsitektur Utama & Tipe Data (Types)

Di dalam grammY, session diimplementasikan sebagai middleware. Ketika suatu update diproses:
1. Sebelum middleware dijalankan, data session untuk obrolan/pengguna dimuat dari database dan disimpan di `ctx.session`.
2. Di dalam handler, kita bebas membaca dan memodifikasi `ctx.session`.
3. Setelah handler selesai, middleware memastikan data session yang dimodifikasi ditulis kembali ke database.

### Mendeklarasikan Tipe Context Kustom
Untuk dukungan TypeScript yang aman, tentukan struktur data session Anda dan perluas interface `Context` grammY dengan `SessionFlavor`.

```typescript
import { Context, SessionFlavor } from "grammy";

// Bentuk struktur data session kita
export interface SessionData {
  hitungKucing: number;
  ukuranPizza?: "small" | "medium" | "large";
  isAwaitingInput: boolean;
  terakhirAktif: number;
}

// Tambahkan flavor session ke tipe context kustom
export type MyContext = Context & SessionFlavor<SessionData>;

// Fungsi untuk membuat data session awal (initial) untuk obrolan baru
export function createInitialSessionData(): SessionData {
  return {
    hitungKucing: 0,
    isAwaitingInput: false,
    terakhirAktif: Date.now(),
  };
}
```

---

## 2. Storage Adapter (Penyimpanan Eksternal)

### A. Penyimpanan RAM / Memory (Bawaan)
Sangat cocok untuk proses pengembangan dan pengujian lokal. **Sangat tidak disarankan untuk produksi** karena data akan hilang setiap kali proses bot dimulai ulang.

```typescript
import { Bot, session } from "grammy";
import { MyContext, createInitialSessionData } from "./types";

const bot = new Bot<MyContext>(process.env.BOT_TOKEN!);

// Pasang middleware session dengan opsi nilai awal
bot.use(
  session({
    initial: createInitialSessionData,
  })
);

bot.command("start", (ctx) => {
  ctx.session.hitungKucing++;
  ctx.reply(`Tingkat UwU kamu berada di level ${ctx.session.hitungKucing}!`);
});
```

> [!WARNING]
> Pastikan fungsi `initial` mengembalikan objek baru. Jangan membagikan referensi objek yang sama untuk mencegah kebocoran data antar obrolan berbeda.
> ```typescript
> // SALAH
> const dataAwal = { hitungKucing: 0 };
> bot.use(session({ initial: () => dataAwal }));
> 
> // BENAR
> bot.use(session({ initial: () => ({ hitungKucing: 0 }) }));
> ```

### B. Redis Storage Adapter
Redis direkomendasikan untuk bot skala produksi dengan konkurensi tinggi, mendukung Time-To-Live (TTL), dan memungkinkan penskalaan bot secara horizontal.

```typescript
import { Bot, session } from "grammy";
import Redis from "ioredis";
import { RedisAdapter } from "@grammyjs/storage-redis";
import { MyContext, createInitialSessionData } from "./types";

const bot = new Bot<MyContext>(process.env.BOT_TOKEN!);
const redisClient = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

const storage = new RedisAdapter({
  instance: redisClient,
  ttl: 60 * 60 * 24 * 7, // Kadaluwarsa dalam 7 hari (dalam detik)
});

bot.use(
  session({
    initial: createInitialSessionData,
    storage,
  })
);
```

### C. MongoDB Storage Adapter
MongoDB sangat berguna jika data session perlu dianalisis atau diakses secara eksternal melalui query database biasa.

```typescript
import { Bot, session } from "grammy";
import { MongoClient } from "mongodb";
import { MongoDBAdapter } from "@grammyjs/storage-mongodb";
import { MyContext, createInitialSessionData } from "./types";

async function bootstrap() {
  const client = new MongoClient(process.env.MONGO_URI || "mongodb://localhost:27017");
  await client.connect();

  const db = client.db("telegram-bot");
  const collection = db.collection<any>("sessions");

  const bot = new Bot<MyContext>(process.env.BOT_TOKEN!);
  const storage = new MongoDBAdapter({ collection });

  bot.use(
    session({
      initial: createInitialSessionData,
      storage,
    })
  );

  bot.start();
}
bootstrap().catch(console.error);
```

---

## 3. Strategi Session Key Kustom

Secara bawaan, grammY mengisolasi data session per obrolan (`ctx.chat?.id`). Anda bisa mengubah perilaku ini menggunakan fungsi kustom `getSessionKey` di opsi konfigurasi session.

```typescript
import { Context, session } from "grammy";

// 1. Simpan data per chat (bawaan)
const chatSession = session({
  initial: () => ({}),
  getSessionKey: (ctx: Context) => ctx.chat?.id?.toString(),
});

// 2. Simpan data per user (lintas obrolan/grup untuk user yang sama)
const userSession = session({
  initial: () => ({}),
  getSessionKey: (ctx: Context) => ctx.from?.id?.toString(),
});

// 3. Simpan data kombinasi per user dan chat
const userInChatSession = session({
  initial: () => ({}),
  getSessionKey: (ctx: Context) => {
    return ctx.from === undefined || ctx.chat === undefined
      ? undefined
      : `${ctx.from.id}/${ctx.chat.id}`;
  },
});
```

---

## 4. Multi-Sessions (Pemisahan Tanggung Jawab)

Memuat objek session yang sangat besar di setiap update dapat membebani database. Dengan Multi-Sessions, Anda bisa membagi data session ke dalam beberapa penyimpanan dengan siklus hidup atau kunci isolasi berbeda.

```typescript
import { Bot, session, SessionFlavor } from "grammy";

interface SettingsData {
  language: string;
}

interface OrderData {
  items: string[];
}

type CombinedContext = Context & 
  SessionFlavor<SettingsData, "settingsSession"> & 
  SessionFlavor<OrderData, "orderSession">;

const bot = new Bot<CombinedContext>(process.env.BOT_TOKEN!);

bot.use(
  session({
    type: "multi",
    settingsSession: {
      initial: () => ({ language: "id" }),
      // Bisa menggunakan storage permanen (misal MongoDB/Redis)
    },
    orderSession: {
      initial: () => ({ items: [] }),
      // Bisa menggunakan storage berumur pendek (RAM / Redis TTL rendah)
    }
  })
);
```

---

## 5. Lazy Sessions (Optimisasi Performa)

Lazy sessions menunda operasi pembacaan dan penulisan database. Jika suatu update yang masuk tidak diproses oleh handler yang mengakses `ctx.session`, maka operasi database sama sekali tidak dilakukan.

Di dalam lazy session, `ctx.session` dibungkus dalam bentuk Promise, sehingga Anda perlu menggunakan kata kunci `await` saat mengaksesnya.

```typescript
import { Bot, lazySession, LazySessionFlavor } from "grammy";

type LazyContext = Context & LazySessionFlavor<{ hitung: number }>;
const bot = new Bot<LazyContext>(process.env.BOT_TOKEN!);

// Gunakan lazySession alih-alih session biasa
bot.use(
  lazySession({
    initial: () => ({ hitung: 0 }),
  })
);

bot.command("status", async (ctx) => {
  // `ctx.session` merupakan Promise, gunakan await untuk membacanya
  const session = await ctx.session;
  await ctx.reply(`Total hitung: ${session.hitung}`);
});

bot.on("message", async (ctx) => {
  // Melakukan operasi tulis juga membutuhkan await
  const session = await ctx.session;
  session.hitung++;
});
```

---

## 6. Peningkatan Storage (enhanceStorage)

Anda dapat memperluas kemampuan storage adapter menggunakan fungsi `enhanceStorage` untuk menambahkan fitur kedaluwarsa waktu (timeout) dan migrasi data schema session.

```typescript
import { session, enhanceStorage } from "grammy";
import { freeStorage } from "@grammyjs/storage-free";

bot.use(
  session({
    storage: enhanceStorage({
      storage: freeStorage(bot.token),
      
      // A. Opsi Timeout (millisecondsToLive)
      // Menghapus data session secara otomatis jika tidak diakses selama 30 menit
      millisecondsToLive: 30 * 60 * 1000, 
      
      // B. Opsi Migrasi (migrations)
      // Berguna jika ada pembaruan struktur data session tanpa merusak data lama
      migrations: {
        1: (oldSession: any) => {
          // Migrasi versi 1 ke versi baru
          return {
            petNames: oldSession.petNames || [],
            petBirthdays: [],
          };
        }
      }
    })
  })
);
```
