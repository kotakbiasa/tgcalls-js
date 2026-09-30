---
name: kurigram
version: 2.2.26
description: "Guidance for building Telegram bots and client applications in Python using Kurigram v2.2.26+ (actively maintained Pyrogram fork, Layer 228)."
metadata:
  {
    "openclaw":
      {
        "emoji": "⚡",
      },
  }
---

# Framework Telegram: Kurigram v2.2.26 (Panduan Tingkat Produksi)

**Versi:** 2.2.26 (12 Sep 2026) · **TL Layer:** 228 · **Python:** ≥3.9
**Repo Resmi:** [github.com/kurigram-org/kurigram](https://github.com/kurigram-org/kurigram) · **Docs Resmi:** [docs.kurigram.icu](https://docs.kurigram.icu)

Kurigram adalah framework klien MTProto asinkron modern untuk Python, yang merupakan fork terupdate dan terpelihara dari Pyrogram. Framework ini memungkinkan Anda berinteraksi dengan API Telegram baik sebagai pengguna (Userbot) maupun bot.

---

## Indeks Dokumen & Referensi Kurigram

Kurigram menyediakan API khusus yang tidak ditemukan pada pustaka MTProto standar lainnya. Silakan merujuk ke dokumen referensi berikut untuk detail parameter dan contoh kode lengkapnya:

### Fitur Eksklusif & Referensi Inti (`references/`)
1. **[ai-and-drafts.md](references/ai-and-drafts.md)**: Komposisi teks AI (`compose_text_with_ai`, `summarize_message`, `fix_text_with_ai`) dan mesin draf pesan (`send_message_draft`, `send_rich_message_draft`, `send_rich_message`).
2. **[checklists.md](references/checklists.md)**: Manajemen daftar tugas interaktif native (`send_checklist`, `edit_message_checklist`, `add_checklist_tasks`, `mark_checklist_tasks_as_done`).
3. **[direct-messages.md](references/direct-messages.md)**: Pengelolaan grup pesan langsung bisnis & usulan kiriman (`set_chat_direct_messages_group`, `get_direct_messages_topics`, `approve_suggested_post`).
4. **[api-methods-and-types.md](references/api-methods-and-types.md)**: Katalog komprehensif seluruh konfigurasi klien, metode API utama, tipe data umum, serta pemanggilan raw MTProto (`app.invoke()`).
5. **[filters.md](references/filters.md)**: Panduan filter built-in & custom filters (`filters.create`).
6. **[flood-wait.md](references/flood-wait.md)**: Mitigasi `FloodWait`, decorator retry otomatis, dan penanganan rate-limiting.
7. **[media.md](references/media.md)**: Upload/download chunking, tracking progress bar, dan media groups.
8. **[sessions.md](references/sessions.md)**: Session SQLite, string session export, dan deployment multi-sesi / serverless.

### Katalog Lengkap dari Source Code (`docs/`)
9. **[methods-reference.md](docs/methods-reference.md)**: Referensi lengkap 1000+ baris seluruh method Client beserta parameter dan tipe return.
10. **[types-reference.md](docs/types-reference.md)**: Daftar lengkap tipe data (classes/types) yang tersedia di Kurigram.
11. **[handlers-and-filters.md](docs/handlers-and-filters.md)**: Panduan penggunaan event handlers dan daftar filter bawaan di Kurigram.

### ⚡ Pembaruan Kurigram v2.2.26 (12 September 2026)
- **Bot API 10.2 & 10.3 Rich Messages Penuh**: Dukungan struktur Rich Messages lengkap (`InputRichBlockTable.is_compact`, `RichBlockTable.is_compact`, `RichBlockButtons`, `RichBlockDocument`).
- **Callback Query Edit**: `CallbackQuery.edit_message_text` kini mendukung parameter bound `rich_message`.
- **Dukungan `pathlib.Path`**: Semua parameter unggah berkas lokal kini menerima `PathType` (`str | pathlib.Path`).
- **Filter Commands**: Escape otomatis karakter spesial pada pencocokan nama perintah.
- **Transport Baru**: Transport `TCPIntermediatePadded` untuk stabilitas jaringan.


---

## 1. MTProto: Userbot vs. Mode Bot & Kredensial

MTProto memungkinkan aplikasi untuk berkomunikasi langsung dengan server Telegram menggunakan identitas pengguna atau token bot.

### Perbandingan Arsitektur
* **Userbot (Klien/Mode Pengguna)**: Bertindak atas nama akun pengguna nyata. Dapat melakukan tindakan apa pun yang bisa dilakukan pengguna, seperti bergabung dengan grup, memberikan suara dalam jajak pendapat, membaca riwayat obrolan, dan mengelola grup. Membutuhkan `api_id` dan `api_hash`.
* **Mode Bot**: Bertindak atas nama akun bot yang dibuat melalui [@BotFather](https://t.me/BotFather). Beroperasi di bawah batasan API bot (misalnya tidak dapat memulai obrolan pribadi dengan pengguna sembarang). Membutuhkan `api_id`, `api_hash`, and `bot_token`.

### Protokol Otentikasi dan Kredensial
1. **API ID & API Hash**: Harus diperoleh dari bagian pengembangan di [my.telegram.org](https://my.telegram.org). Ini adalah kunci statis yang mengidentifikasi klien aplikasi Anda.
2. **Bot Token**: String yang berisi kredensial untuk akun bot (misalnya, `123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ`).
3. **Session Files**: Kurigram membuat database SQLite lokal (misalnya, `my_account.session`) yang berisi kunci otentikasi, alamat server, dan status session.
4. **Session Strings**: Representasi terenkapsulasi berbasis base64 dari database session. Memungkinkan otentikasi tanpa file lokal pada lingkungan serverless.

```python
import asyncio
from kurigram import Client

# Inisialisasi Mode Userbot
user_app = Client(
    name="user_session",
    api_id=12345,
    api_hash="0123456789abcdef0123456789abcdef"
)

# Inisialisasi Mode Bot
bot_app = Client(
    name="bot_session",
    api_id=12345,
    api_hash="0123456789abcdef0123456789abcdef",
    bot_token="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
)
```

---

## 2. Decorator dan Event Handler

Kurigram menggunakan framework berbasis event di mana decorator menghubungkan fungsi asinkron dengan pembaruan (update) yang masuk.

* `@Client.on_message()`: Dipicu ketika ada pesan baru yang dikirim atau diterima di obrolan apa pun.
* `@Client.on_callback_query()`: Dipicu ketika tombol callback pada keyboard inline diklik.
* `@Client.on_raw_update()`: Dipicu untuk update MTProto tingkat rendah. Digunakan untuk penanganan kustom yang tidak diparsing oleh event handler standar.

### Penerapan Event Handler
```python
from kurigram import Client, filters
from kurigram.types import Message, CallbackQuery, Update

app = Client("my_account")

@app.on_message(filters.text & filters.private)
async def handle_private_message(client: Client, message: Message):
    await message.reply_text(f"Menerima pesan privat: {message.text}")

@app.on_callback_query()
async def handle_callbacks(client: Client, callback_query: CallbackQuery):
    await callback_query.answer("Tindakan dikonfirmasi!", show_alert=True)
    await callback_query.edit_message_text("Konten diperbarui via callback.")

@app.on_raw_update()
async def handle_raw(client: Client, update: Update, users: dict, chats: dict):
    # Memproses raw update tingkat rendah langsung dari MTProto
    print(f"Menerima raw update: {type(update).__name__}")
```

---

## 3. Sistem Filter Mendalam

Filter menentukan apakah suatu event handler harus memproses update yang masuk. Filter dapat digabungkan menggunakan operator logika bitwise.

### Operator Logika
* `&` (AND): Kedua filter harus bernilai `True`.
* `|` (OR): Minimal salah satu filter harus bernilai `True`.
* `~` (NOT): Membalikkan hasil evaluasi filter.

### Filter Bawaan
* `filters.me`: Cocok untuk pesan yang dikirim oleh akun Anda sendiri.
* `filters.bot`: Cocok untuk pesan yang dikirim oleh bot lain.
* `filters.group` / `filters.channel` / `filters.private`: Cocok untuk tipe obrolan tertentu.
* `filters.text`: Cocok untuk pesan yang mengandung teks.
* `filters.command("start")`: Cocok untuk teks yang diawali dengan `/start` atau `!start`.
* `filters.regex(r"^halo")`: Cocok untuk pesan yang memenuhi pola ekspresi reguler.

### Filter Kustom
Anda dapat membuat filter kustom yang kompleks menggunakan `filters.create`. Fungsi filter kustom harus menerima argumen `(filter_object, client, update)` dan mengembalikan boolean.

```python
from kurigram import Client, filters
from kurigram.types import Message

# Filter kustom: memeriksa apakah username pengirim berakhiran 'bot'
async def ends_with_bot_func(flt, client: Client, message: Message) -> bool:
    return bool(message.from_user and message.from_user.username and message.from_user.username.lower().endswith("bot"))

ends_with_bot = filters.create(ends_with_bot_func)

# Contoh penggunaan gabungan filter bawaan dan kustom
@Client.on_message(filters.group & ~filters.me & ends_with_bot)
async def handle_bot_in_group(client: Client, message: Message):
    await message.reply_text("Terdeteksi bot eksternal memposting di grup ini!")
```

---

## 4. Penanganan Media Tingkat Lanjut

Kurigram mendukung streaming, pengunduhan berbasis chunk, pelacakan progres, dan struktur media group.

### Pengunduhan Berbasis Chunk
Gunakan `client.download_media()` atau tulis langsung chunk streaming file untuk memproses berkas besar tanpa menghabiskan memori sistem.

### Pelacakan Progres Unggah & Unduh
Sediakan fungsi callback dengan signature `func(current, total)` untuk menampilkan progress bar atau memantau status transfer data.

### Mengirim Media Group
Kirim album (foto, video, audio) secara atomik menggunakan `send_media_group`.

```python
import sys
from kurigram import Client, filters
from kurigram.types import Message, InputMediaPhoto

app = Client("media_session")

# Callback pelacakan progres
async def progress(current, total):
    percent = (current / total) * 100
    sys.stdout.write(f"\rDitransfer: {current}/{total} bytes ({percent:.2f}%)")
    sys.stdout.flush()

@app.on_message(filters.document)
async def download_doc(client: Client, message: Message):
    # Mengunduh dengan callback progres
    file_path = await message.download(progress=progress)
    print(f"\nBerkas disimpan di: {file_path}")

@app.on_message(filters.command("album"))
async def send_album(client: Client, message: Message):
    # Mengirim media group terstruktur
    await client.send_media_group(
        chat_id=message.chat.id,
        media=[
            InputMediaPhoto("https://picsum.photos/800", caption="Foto 1"),
            InputMediaPhoto("https://picsum.photos/900", caption="Foto 2"),
        ]
    )
```

---

## 5. Pengeditan Pesan Dinamis, Parser, dan Kutipan

### Pengeditan Dinamis
Pengeditan pesan memungkinkan pembaruan teks secara real-time, sangat cocok untuk metrik progres, log dinamis, atau antarmuka game interaktif.

### Parser Teks (HTML & Markdown)
Kurigram mendukung pemformatan HTML dan Markdown. Gunakan parameter `parse_mode` untuk mengontrol parser secara eksplisit.

### Kutipan Balasan (Reply Quotes)
Membalas pesan tertentu dengan mengutip teks tertentu untuk mempertahankan konteks percakapan secara terarah.

```python
import asyncio
from kurigram import Client, filters
from kurigram.types import Message

app = Client("text_session")

@app.on_message(filters.command("edit_test"))
async def edit_test(client: Client, message: Message):
    # Mulai dengan format HTML
    sent_msg = await message.reply_text("<b>Menginisialisasi pembaruan...</b>", parse_mode="html")
    
    for i in range(1, 4):
        await asyncio.sleep(1)
        await sent_msg.edit_text(f"<i>Memperbarui langkah {i}/3...</i>", parse_mode="html")
        
    await sent_msg.edit_text(
        "**Proses selesai!** Detail dapat ditemukan [di sini](https://example.com).", 
        parse_mode="markdown"
    )

@app.on_message(filters.command("quote"))
async def reply_with_quote(client: Client, message: Message):
    # Membalas pesan dengan kutipan kustom
    await message.reply_text(
        text="Ini adalah balasan dengan mengutip Anda.",
        quote=True
    )
```

---

## 6. Ekspor Session String dan Deployment Serverless

Untuk deployment serverless (Docker, Heroku, AWS Lambda), penulisan database session ke filesystem lokal sering kali tidak dimungkinkan. Ekspor session string mengatasi keterbatasan ini.

### Mengekspor Session String
Jalankan skrip sementara secara lokal untuk menghasilkan string session:
```python
import asyncio
from kurigram import Client

async def main():
    async with Client("temp_session", api_id=12345, api_hash="hash") as app:
        session_str = await app.export_session_string()
        print("SESSION_STRING_ANDA:")
        print(session_str)

asyncio.run(main())
```

### Memuat Session String untuk Deployment
Ambil session string dari environment variable dan masukkan ke konstruktor `Client` menggunakan parameter `session_string`:
```python
import os
from kurigram import Client

SESSION_STRING = os.getenv("TELEGRAM_SESSION_STRING")
API_ID = int(os.getenv("TELEGRAM_API_ID", "0"))
API_HASH = os.getenv("TELEGRAM_API_HASH")

app = Client(
    name="production_bot",
    api_id=API_ID,
    api_hash=API_HASH,
    session_string=SESSION_STRING
)
```

---

## 7. FloodWait, Rate-Limit, dan Penanganan Error

Telegram memberlakukan batas laju (rate limits) yang ketat. Melebihi batasan ini akan memicu pengecualian `FloodWait`, yang menunjukkan jumlah detik akun harus ditangguhkan sementara.

### Hirarki RPCError
* `RPCError`: Pengecualian dasar untuk semua kesalahan API Telegram.
  * `Flood`: Kesalahan pembatasan laju.
    * `FloodWait`: Anda harus menunggu sebelum mengulangi operasi.
  * `BadRequest`: Permintaan API tidak valid (misal: chat tidak ditemukan).
  * `Unauthorized`: Session atau kredensial tidak valid.

### Wrapper Mitigasi Auto-Retry & FloodWait
Terapkan dekorator untuk melakukan sleep secara otomatis saat menghadapi `FloodWait`.

```python
import asyncio
import logging
from functools import wraps
from kurigram import Client
from kurigram.errors import FloodWait, RPCError

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def retry_on_flood(func):
    @wraps(func)
    async def wrapper(*args, **kwargs):
        while True:
            try:
                return await func(*args, **kwargs)
            except FloodWait as e:
                logger.warning(f"Terkena FloodWait. Tidur selama {e.value} detik.")
                await asyncio.sleep(e.value)
            except RPCError as e:
                logger.error(f"Telegram RPC error: {e}")
                raise e
    return wrapper

# Penerapan wrapper pada kelas bot produksi
class ProductionBot:
    def __init__(self, client: Client):
        self.client = client

    @retry_on_flood
    async def safe_send(self, chat_id: int, text: str):
        return await self.client.send_message(chat_id=chat_id, text=text)
```

### Penanganan Signal dan shutdown yang Aman
Tangani sinyal penghentian (`SIGINT`, `SIGTERM`) untuk menghentikan loop klien dengan bersih agar database tersimpan dan koneksi tertutup dengan baik.

```python
import asyncio
import signal
from kurigram import Client

app = Client("graceful_bot")

async def shutdown(sig, loop):
    print(f"Menerima sinyal {sig.name}, menghentikan klien...")
    await app.stop()
    tasks = [t for t in asyncio.all_tasks() if t is not asyncio.current_task()]
    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
    loop.stop()

async def main():
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, lambda s=sig: asyncio.create_task(shutdown(s, loop)))
        
    await app.start()
    print("Bot berjalan. Tekan Ctrl+C untuk keluar.")
    await asyncio.Event().wait()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except asyncio.CancelledError:
        pass
```
