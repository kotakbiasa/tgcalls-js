---
name: menus
description: Complete reference documentation and practical guide.
---

# Panduan dan Referensi Menu Interaktif (Menu) grammY

Dokumen referensi ini menyediakan petunjuk dan pola implementasi keyboard inline interaktif menggunakan plugin resmi `@grammyjs/menu` berdasarkan dokumentasi lokal `/home/ubuntu/DeltaUserJS/docs/grammy/plugins/menu.md`.

---

## 1. Instalasi & Setup Dasar

Plugin menu menawarkan sintaks deklaratif untuk merancang keyboard inline yang dapat merespon interaksi pengguna secara instan tanpa perlu mendaftarkan callback handler secara terpisah.

Instalasi plugin:
```bash
npm install @grammyjs/menu
```

### Implementasi Sederhana

```typescript
import { Bot } from "grammy";
import { Menu } from "@grammyjs/menu";

const bot = new Bot(process.env.BOT_TOKEN!);

// 1. Buat menu baru dengan ID unik
const mainMenu = new Menu("menu-minuman")
  .text("🍵 Teh", (ctx) => ctx.reply("Waktunya ngeteh!"))
  .row() // Pindah ke baris baru
  .text("☕ Kopi", (ctx) => ctx.reply("Pilihan kopi yang nikmat!"));

// 2. Registrasikan menu sebagai middleware ke bot
bot.use(mainMenu);

bot.command("start", async (ctx) => {
  // 3. Kirim pesan dengan menu sebagai reply_markup
  await ctx.reply("Silakan pilih minuman Anda:", { reply_markup: mainMenu });
});
```

---

## 2. Pembuatan Tombol Secara Dinamis (Dynamic Buttons)

Seringkali teks tombol atau jumlah tombol bergantung pada data eksternal, seperti database atau status session. Anda bisa menggunakan metode `.dynamic()` untuk membangun tombol secara real-time.

```typescript
import { Menu } from "@grammyjs/menu";
import { MyContext } from "./types";

interface Barang {
  id: string;
  nama: string;
}

// Simulasi pengambilan data dari database
async function dapatkanDaftarBarang(): Promise<Barang[]> {
  return [
    { id: "b1", nama: "Laptop" },
    { id: "b2", nama: "Smartphone" },
    { id: "b3", nama: "Headphone" },
  ];
}

const inventoryMenu = new Menu<MyContext>("inventory-list");

inventoryMenu.dynamic(async (ctx, range) => {
  const barangList = await dapatkanDaftarBarang();
  
  for (const barang of barangList) {
    range
      .text(barang.nama, async (ctx) => {
        await ctx.reply(`Anda memilih barang: ${barang.nama}`);
      })
      .row();
  }
});
```

---

## 3. Submenu & Navigasi Halaman

Anda bisa menghubungkan beberapa menu sebagai halaman bertingkat. Submenu secara otomatis menangani tombol kembali (`back`) dan tombol masuk halaman (`submenu`).

```typescript
import { Menu } from "@grammyjs/menu";

const mainMenu = new Menu("menu-utama");
const settingsMenu = new Menu("menu-pengaturan");
const advancedMenu = new Menu("menu-lanjutan");

// Hubungkan hierarki submenu
mainMenu.submenu("Pengaturan", "menu-pengaturan");
settingsMenu.submenu("Tingkat Lanjut", "menu-lanjutan");

// Tombol di dalam menu pengaturan
settingsMenu
  .text("Aktifkan Suara", (ctx) => ctx.reply("Suara diaktifkan!"))
  .row()
  .back("Kembali Ke Menu Utama"); // Kembali ke 'menu-utama' secara otomatis

// Tombol di dalam menu tingkat lanjut
advancedMenu
  .text("Reset Data", (ctx) => ctx.reply("Data berhasil di-reset!"))
  .row()
  .back("Kembali Ke Pengaturan"); // Kembali ke 'menu-pengaturan' secara otomatis

// Daftarkan submenu ke induknya
mainMenu.register(settingsMenu);
settingsMenu.register(advancedMenu);

// Cukup pasang menu utama (induk paling atas) ke bot
bot.use(mainMenu);
```

---

## 4. Manajemen Status (State Management) di Dalam Menu

Tombol menu dapat menampilkan label dinamis berdasarkan status yang disimpan (misal: tombol sakelar `[ON]` / `[OFF]`). Gunakan `ctx.menu.update()` untuk memperbarui tampilan menu di tempat secara instan tanpa mengirim pesan baru.

```typescript
import { Bot, session } from "grammy";
import { Menu } from "@grammyjs/menu";
import { MyContext } from "./types";

const bot = new Bot<MyContext>(process.env.BOT_TOKEN!);

bot.use(session({
  initial: () => ({
    notifikasiAktif: false,
  })
}));

const statusMenu = new Menu<MyContext>("status-menu")
  .text(
    // Tampilkan label dinamis berdasarkan state session
    (ctx) => ctx.session.notifikasiAktif ? "Notifikasi: 🔔 AKTIF" : "Notifikasi: 🔕 NONAKTIF",
    async (ctx) => {
      ctx.session.notifikasiAktif = !ctx.session.notifikasiAktif;
      // Perbarui tampilan keyboard inline di tempat
      await ctx.menu.update();
    }
  );

bot.use(statusMenu);
```

> [!TIP]
> Secara bawaan, `ctx.menu.update()` memproses pembaruan secara *lazy* (menunggu pemrosesan middleware selesai agar efisien). Jika Anda ingin memaksa pembaruan seketika, gunakan `await ctx.menu.update({ immediate: true })`.

---

## 5. Mengoptimalkan Performa Menu

1. **Hindari Query Database Berat di Dalam Label Tombol**:
   Jangan panggil query database berat secara langsung di dalam generator teks label tombol (seperti `(ctx) => getDatabaseValue()`). Renderlah teks menggunakan data yang sudah disimpan di `ctx.session` atau variabel cache cepat agar respons bot tidak melambat.
2. **Pola Penutupan Menu**:
   Gunakan `ctx.menu.close()` jika Anda ingin menghapus keyboard inline dari pesan obrolan secara bersih setelah pengguna memilih opsi terakhir.
