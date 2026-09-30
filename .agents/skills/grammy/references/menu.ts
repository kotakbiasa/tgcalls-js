// menu.ts
// Contoh penggunaan @grammyjs/menu untuk keyboard inline interaktif.

import { Bot, Context } from "grammy";
import { Menu } from "@grammyjs/menu";

// 1. Inisialisasi Bot
const bot = new Bot<Context>("<BOT_TOKEN>");

// 2. Buat Menu
const mainMenu = new Menu("main-menu")
  .text("Pesan Pizza", (ctx) => ctx.reply("Silakan pilih ukuran pizza."))
  .row()
  .text("Lihat Pesanan", (ctx) => ctx.reply("Pesanan terakhir: -"))
  .row()
  .text("Bantuan", (ctx) => ctx.reply("Hubungi @support untuk bantuan."));

// 3. Daftarkan Menu
bot.use(mainMenu);

// 4. Command untuk menampilkan menu
bot.command("menu", (ctx) => {
  ctx.reply("Silakan pilih menu:", { reply_markup: mainMenu });
});

// 5. Start Bot
bot.start();

// Catatan: Ganti <BOT_TOKEN> dengan token bot Telegram Anda.
