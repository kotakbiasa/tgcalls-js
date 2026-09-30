---
name: ai-and-drafts
description: Complete reference documentation and practical guide.
---

# Referensi API Kurigram: AI & Drafts (Fitur Eksklusif)

Dokumen ini menjelaskan fungsi-fungsi eksklusif Kurigram untuk integrasi AI dan mesin draf pesan (`draft engines`). Seluruh fitur ini diimplementasikan langsung pada kelas `Client` Kurigram untuk memudahkan interaksi dengan konten teks secara pintar dan penanganan draf pesan yang kaya fitur.

---

## 1. Integrasi Fitur AI

Kurigram menyediakan metode bawaan yang terintegrasi dengan kecerdasan buatan untuk membantu pembuatan, ringkasan, dan perbaikan teks pesan.

### `compose_text_with_ai`
Digunakan untuk menghasilkan teks baru menggunakan AI berdasarkan petunjuk (prompt) yang diberikan.

* **Signature:**
  ```python
  async def compose_text_with_ai(self, prompt: str, system_instruction: str = None) -> str:
  ```
* **Parameter:**
  * `prompt` (`str`): Petunjuk utama yang diberikan ke AI.
  * `system_instruction` (`str`, *opsional*): Instruksi sistem/konteks peran untuk mengarahkan gaya respons AI.
* **Contoh Kode:**
  ```python
  from kurigram import Client
  import asyncio

  app = Client("my_session")

  async def main():
      async with app:
          prompt = "Tuliskan pesan selamat datang singkat untuk grup komunitas programming."
          sys_instruction = "Gunakan nada bicara yang ramah, profesional, dan gunakan emoji."
          
          hasil = await app.compose_text_with_ai(prompt=prompt, system_instruction=sys_instruction)
          print("Hasil AI:", hasil)

  if __name__ == "__main__":
      asyncio.run(main())
  ```

---

### `summarize_message`
Berguna untuk membuat ringkasan singkat dari pesan tertentu di dalam obrolan.

* **Signature:**
  ```python
  async def summarize_message(self, chat_id: int | str, message_id: int) -> str:
  ```
* **Parameter:**
  * `chat_id` (`int` | `str`): ID atau username dari obrolan target.
  * `message_id` (`int`): ID dari pesan panjang yang ingin diringkas.
* **Contoh Kode:**
  ```python
  from kurigram import Client
  import asyncio

  app = Client("my_session")

  async def ringkas_pesan(chat_id, msg_id):
      async with app:
          ringkasan = await app.summarize_message(chat_id=chat_id, message_id=msg_id)
          print(f"Ringkasan Pesan #{msg_id}:", ringkasan)
  ```

---

### `fix_text_with_ai`
Fungsi untuk memperbaiki kesalahan tata bahasa, penulisan (typo), maupun penyesuaian gaya bahasa pada teks yang diberikan menggunakan AI.

* **Signature:**
  ```python
  async def fix_text_with_ai(self, text: str, style: str = "professional") -> str:
  ```
* **Parameter:**
  * `text` (`str`): Teks mentah atau salah yang ingin diperbaiki.
  * `style` (`str`): Gaya bahasa target (contoh: `"professional"`, `"casual"`, `"friendly"`, `"formal"`).
* **Contoh Kode:**
  ```python
  from kurigram import Client
  import asyncio

  app = Client("my_session")

  async def perbaiki_tulisan():
      async with app:
          teks_salah = "halo gan, tolong bntuin sy bkin sskrip python bwt telebot dnk pliss"
          teks_bersih = await app.fix_text_with_ai(text=teks_salah, style="professional")
          print("Teks Terkoreksi:", teks_bersih)
  ```

---

## 2. Draft Engines (Mesin Draf Pesan & Rich Messages)

Kurigram memperkenalkan pengelolaan draf tingkat lanjut yang memungkinkan pengiriman draf teks biasa maupun draf dengan format teks kaya (rich formatting) secara asinkron.

### `send_message_draft`
Menyimpan atau mengirimkan draf pesan teks standar ke suatu obrolan.

* **Signature:**
  ```python
  async def send_message_draft(self, chat_id: int | str, text: str, parse_mode: str = None) -> bool:
  ```
* **Contoh Kode:**
  ```python
  from kurigram import Client
  import asyncio

  app = Client("my_session")

  async def simpan_draf(chat_id):
      async with app:
          success = await app.send_message_draft(
              chat_id=chat_id,
              text="Ini adalah draf pesan yang akan dikirim nanti.",
              parse_mode="markdown"
          )
          if success:
              print("Draf pesan berhasil disimpan/dikirim.")
  ```

---

### `send_rich_message_draft`
Metode untuk streaming draf pesan dengan rich formatting (Rich Messages Bot API 10.1–10.3) secara asinkron ke obrolan pengguna sementara bot sedang menghasilkan respons.

* **Signature:**
  ```python
  async def send_rich_message_draft(
      self,
      chat_id: int | str,
      draft_id: int,
      rich_message: types.InputRichMessage,
      message_thread_id: int = None,
      can_stop: bool = None,
      keep_on_stop: bool = None,
  ) -> bool:
  ```
* **Contoh Kode (Streaming AI Reply dengan stop controls):**
  ```python
  import asyncio
  from kurigram import Client, types

  app = Client("my_session")

  async def stream_ai_draft(chat_id):
      async with app:
          draft_id = app.rnd_id()
          text = "Halo! Ini adalah respons streaming <b>AI Kurigram</b> dengan formatting kaya."
          words = text.split()

          for i in range(len(words)):
              partial_html = " ".join(words[:i+1])
              await app.send_rich_message_draft(
                  chat_id=chat_id,
                  draft_id=draft_id,
                  rich_message=types.InputRichMessage(html=partial_html),
                  can_stop=True,
                  keep_on_stop=False
              )
              await asyncio.sleep(0.3)

          # Kirim finalisasi pesan kaya
          await app.send_rich_message(
              chat_id=chat_id,
              rich_message=types.InputRichMessage(html=text)
          )
  ```

---

### `send_rich_message`
Mengirimkan pesan dengan pemformatan kaya secara langsung (bukan sebagai draf) menggunakan struktur data `types.InputRichMessage` (mendukung `html`, `markdown`, atau struktur blok `blocks`).

* **Signature:**
  ```python
  async def send_rich_message(
      self,
      chat_id: int | str,
      rich_message: types.InputRichMessage,
      disable_notification: bool = None,
      message_thread_id: int = None,
      ephemeral_message_parameters: types.EphemeralMessageParameters = None,
      effect_id: int = None,
      reply_parameters: types.ReplyParameters = None,
      protect_content: bool = None,
      reply_markup: types.InlineKeyboardMarkup = None,
  ) -> types.Message:
  ```
* **Contoh Kode:**
  ```python
  from kurigram import Client, types

  app = Client("my_session")

  async def kirim_pesan_kaya(chat_id):
      async with app:
          # Mode HTML
          await app.send_rich_message(
              chat_id=chat_id,
              rich_message=types.InputRichMessage(
                  html="🎉 <b>Selamat Datang!</b> Kunjungi <a href='https://kurigram.icu'>Kurigram</a> untuk dokumentasi."
              ),
              reply_markup=types.InlineKeyboardMarkup([
                  [types.InlineKeyboardButton("Buka Docs", url="https://docs.kurigram.icu")]
              ])
          )

          # Mode Blocks (Bot API 10.3)
          await app.send_rich_message(
              chat_id=chat_id,
              rich_message=types.InputRichMessage(
                  blocks=[
                      types.InputRichBlockParagraph(text=types.RichText(text="Dashboard Status")),
                      types.InputRichBlockTable(
                          is_compact=True,
                          cells=[
                              [types.RichBlockTableCell(text="Server"), types.RichBlockTableCell(text="Online")],
                              [types.RichBlockTableCell(text="Layer"), types.RichBlockTableCell(text="228")]
                          ]
                      )
                  ]
              )
          )
  ```
