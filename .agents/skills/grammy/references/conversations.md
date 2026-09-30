---
name: conversations
description: Complete reference documentation and practical guide.
---

# Panduan dan Referensi Percakapan (Conversations) grammY

Dokumen referensi ini menyediakan petunjuk dan pola implementasi alur obrolan interaktif linier menggunakan plugin resmi `@grammyjs/conversations` berdasarkan dokumentasi lokal `/home/ubuntu/DeltaUserJS/docs/grammy/plugins/conversations.md`.

---

## 1. Instalasi & Setup Dasar

Plugin percakapan menggunakan fungsi pembungkus asinkron khusus untuk menulis dialog interaktif (seperti proses pendaftaran, survei, atau transaksi belanja) secara berurutan layaknya kode sekuensial biasa.

Instalasi plugin:
```bash
npm install @grammyjs/conversations
```

### Konfigurasi TypeScript & Context
Anda harus meregistrasikan `ConversationFlavor` ke dalam Context dan menentukan helper tipe data percakapan Anda.

```typescript
import { Context, session, SessionFlavor } from "grammy";
import {
  Conversation,
  ConversationFlavor,
  conversations,
  createConversation,
} from "@grammyjs/conversations";

// 1. Tentukan tipe Context kustom yang digabungkan dengan ConversationFlavor
export type MyContext = Context & SessionFlavor<{}> & ConversationFlavor;

// 2. Tentukan pembantu tipe data percakapan kustom
export type MyConversation = Conversation<MyContext>;
```

---

## 2. Alur Percakapan Dasar (Mulai Cepat)

Di bawah ini adalah contoh percakapan sederhana di mana bot menanyakan nama, umur, dan meminta konfirmasi profil pengguna.

```typescript
import { Bot, session } from "grammy";
import { MyContext, MyConversation } from "./types";
import { conversations, createConversation } from "@grammyjs/conversations";

const bot = new Bot<MyContext>(process.env.BOT_TOKEN!);

// Pasang middleware session bawaan (wajib untuk melacak percakapan)
bot.use(session({ initial: () => ({}) }));
bot.use(conversations());

/**
 * Logika fungsi percakapan onboarding
 */
async function onboarding(conversation: MyConversation, ctx: MyContext) {
  await ctx.reply("Halo! Mari buat profil Anda. Siapa nama Anda?");
  
  // Menunggu input teks dari user
  const nameCtx = await conversation.waitFor("message:text");
  const nama = nameCtx.message.text;

  await ctx.reply(`Senang bertemu dengan Anda, ${nama}! Berapa usia Anda?`);

  let usia: number | null = null;
  while (usia === null) {
    const ageCtx = await conversation.waitFor("message:text");
    const angka = parseInt(ageCtx.message.text, 10);
    if (!isNaN(angka) && angka > 0 && angka < 120) {
      usia = angka;
    } else {
      await ctx.reply("Format usia tidak valid. Silakan masukkan angka saja:");
    }
  }

  await ctx.reply(`Data tersimpan: ${nama}, usia ${usia} tahun. Apakah sudah benar? (ya/tidak)`);
  const confirmCtx = await conversation.waitFor("message:text");
  const konfirmasi = confirmCtx.message.text.toLowerCase();

  if (konfirmasi === "ya" || konfirmasi === "y") {
    await ctx.reply("Profil Anda berhasil disimpan!");
  } else {
    await ctx.reply("Pendaftaran dibatalkan. Ulangi kembali dengan perintah /profile.");
  }
}

// Daftarkan percakapan ke bot
bot.use(createConversation(onboarding));

// Command untuk memulai percakapan
bot.command("profile", async (ctx) => {
  await ctx.conversation.enter("onboarding");
});
```

---

## 3. Cara Kerja Percakapan: Mekanisme Replay

Fungsi percakapan tidak dieksekusi seperti fungsi normal biasa. 

Ketika `conversation.waitFor()` pertama kali dipanggil:
1. Eksekusi fungsi ditangguhkan (diinterupsi) pada baris tersebut.
2. Keadaan (state) saat itu disimpan ke database session.
3. Saat update baru datang dari pengguna, fungsi percakapan akan dijalankan kembali **mulai dari awal** (disebut *replay*).
4. Selama fase *replay*, pemanggilan API sebelumnya dilewati dengan cepat tanpa dieksekusi ulang, hingga mencapai titik penangguhan terakhir di mana ia menerima data baru dan melanjutkan eksekusi normal.

Oleh karena itu, hindari menaruh efek samping (side-effects) langsung di dalam fungsi percakapan tanpa membungkusnya di dalam `conversation.external()`.

---

## 4. Cara Keluar dari Percakapan & Pembatalan

Jika pengguna di tengah jalan ingin membatalkan percakapan atau menjalankan perintah lain, obrolan bisa macet jika tidak ditangani.

### Pola A: Penanganan Perintah Keluar Global
Anda bisa menggunakan perintah global `/cancel` untuk keluar dari percakapan apa pun secara langsung:

```typescript
bot.command("cancel", async (ctx) => {
  await ctx.conversation.exit();
  await ctx.reply("Percakapan berhasil dibatalkan!");
});
```

### Pola B: Pengecekan Perintah Manual di Dalam Alur
Anda juga bisa mengecek input di setiap tahap secara manual:

```typescript
async function tanyaHobi(conversation: MyConversation, ctx: MyContext) {
  await ctx.reply("Apa hobi Anda? (Kirim /cancel untuk batal)");
  const hobiCtx = await conversation.wait();

  if (hobiCtx.message?.text === "/cancel") {
    await ctx.reply("Pencarian dibatalkan.");
    return; // Keluar dari fungsi untuk mengakhiri percakapan
  }

  const hobi = hobiCtx.message?.text;
  await ctx.reply(`Hobi Anda adalah ${hobi}!`);
}
```

---

## 5. Pemanggilan Sub-Percakapan (Nesting Conversations)

Anda dapat memecah percakapan yang kompleks menjadi bagian-bagian kecil yang dapat digunakan kembali dengan memanggil fungsi sub-percakapan menggunakan `conversation.run()`.

```typescript
async function tanyakanPersetujuan(conversation: MyConversation, ctx: MyContext): Promise<boolean> {
  await ctx.reply("Apakah Anda yakin dengan pilihan Anda? (ya/tidak)");
  const responseCtx = await conversation.waitFor("message:text");
  const text = responseCtx.message.text.toLowerCase();
  return text === "ya" || text === "y";
}

async function transaksi(conversation: MyConversation, ctx: MyContext) {
  await ctx.reply("Memulai proses pembayaran...");
  
  // Panggil sub-percakapan menggunakan conversation.run
  const disetujui = await conversation.run(tanyakanPersetujuan);

  if (disetujui) {
    await ctx.reply("Pembayaran berhasil diproses!");
  } else {
    await ctx.reply("Transaksi dibatalkan.");
  }
}
```

---

## 6. Proteksi Konkuresi & Re-entrancy

Secara bawaan, jika pengguna mengirim banyak pesan dengan sangat cepat, grammY akan memproses semuanya secara konkuren. Hal ini dapat merusak urutan pengeksekusian percakapan.

Untuk mengatasinya, pastikan Anda mengecek apakah pengguna sudah berada di dalam percakapan aktif sebelum mengizinkan mereka masuk kembali ke percakapan baru:

```typescript
bot.command("daftar", async (ctx) => {
  const activeConversations = await ctx.conversation.active();
  
  if (Object.keys(activeConversations).length > 0) {
    await ctx.reply("Anda sedang berada dalam sesi percakapan aktif. Silakan selesaikan atau kirim perintah /cancel terlebih dahulu.");
    return;
  }

  await ctx.conversation.enter("onboarding");
});
```
