// conversations.ts
// Contoh penggunaan @grammyjs/conversations untuk alur percakapan multi-langkah.

import { Bot, Context, session, SessionFlavor } from "grammy";
import { conversations, createConversation } from "@grammyjs/conversations";

// 1. Definisi Session dan Context
interface SessionData {
  pizzaSize?: string;
  pizzaToppings?: string[];
}

type MyContext = Context & SessionFlavor<SessionData>;

// 2. Inisialisasi Bot
const bot = new Bot<MyContext>("<BOT_TOKEN>");

// 3. Middleware Session
bot.use(session({ initial: (): SessionData => ({}) }));

// 4. Alur Percakapan: Pesan Pizza
async function pizzaOrderConversation(conversation: any, ctx: MyContext) {
  // Langkah 1: Pilih ukuran
  await ctx.reply("Silakan pilih ukuran pizza: Small, Medium, atau Large");
  const sizeCtx = await conversation.waitFor("message:text");
  const size = sizeCtx.message.text;
  
  if (!["small", "medium", "large"].includes(size.toLowerCase())) {
    await ctx.reply("Ukuran tidak valid. Pesanan dibatalkan.");
    return;
  }
  
  conversation.session.pizzaSize = size;
  
  // Langkah 2: Pilih topping
  await ctx.reply("Pilih topping (pisahkan dengan koma):");
  const toppingsCtx = await conversation.waitFor("message:text");
  const toppings = toppingsCtx.message.text.split(",").map((t: string) => t.trim());
  
  conversation.session.pizzaToppings = toppings;
  
  // Konfirmasi
  await ctx.reply(
    `Pesanan Anda:
    - Ukuran: ${size}
    - Topping: ${toppings.join(", ")}
    Terima kasih!`
  );
}

// 5. Daftarkan Conversation
bot.use(conversations());
bot.use(createConversation(pizzaOrderConversation));

// 6. Command untuk memulai percakapan
bot.command("order", async (ctx) => {
  await ctx.conversation.enter("pizzaOrderConversation");
});

// 7. Start Bot
bot.start();

// Catatan: Ganti <BOT_TOKEN> dengan token bot Telegram Anda.
