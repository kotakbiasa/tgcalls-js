---
name: filters
description: Complete reference documentation and practical guide.
---

# Pemfilteran Pesan & Penanganan Update Kurigram

Panduan referensi ini merinci arsitektur penanganan pembaruan (update dispatching) Kurigram, penggunaan grup handler, kontrol propagasi, filter bawaan, penggabungan operator logika (`&`, `|`, `~`), serta pembuatan filter kustom.

---

## 1. Pemrosesan Update & Registrasi Handler (Update Dispatching)

Di Kurigram, semua event dari Telegram (pesan baru, klik tombol callback, dll.) dikirim sebagai objek update ke sistem dispatcher. Anda dapat meregistrasikan fungsi untuk menangani update tersebut dengan dua cara:

### A. Menggunakan Decorator (Praktis)
Decorator bawaan dari instans `Client` secara otomatis mendaftarkan fungsi asinkron Anda ke dispatcher.
* `@Client.on_message()`: Dipicu ketika ada pesan baru masuk (teks, media, perintah, dll.).
* `@Client.on_callback_query()`: Dipicu ketika tombol inline keyboard diklik.
* `@Client.on_inline_query()`: Dipicu ketika kueri pencarian inline dilakukan.
* `@Client.on_raw_update()`: Mengambil raw update MTProto tingkat rendah langsung tanpa parsing awal.

```python
from kurigram import Client, filters

app = Client("my_bot")

@app.on_message(filters.text & filters.private)
async def private_text_handler(client, message):
    await message.reply_text("Ini adalah pesan teks pribadi!")
```

### B. Registrasi Manual (`add_handler`)
Berguna ketika Anda ingin meregistrasikan handler secara dinamis pada saat aplikasi berjalan.
```python
from kurigram.handlers import MessageHandler

async def my_callback(client, message):
    print("Menerima pesan:", message.text)

# Menambahkan handler secara manual
app.add_handler(MessageHandler(my_callback), group=0)
```

---

## 2. Handler Groups & Kontrol Propagasi

Secara default, dispatcher membagi handler ke dalam beberapa **kelompok (groups)**. Hal ini menentukan urutan penanganan dan bagaimana update merambat di antara handler.

### Urutan Eksekusi (Handler Groups)
* Klien memproses handler berdasarkan urutan grup numerik, mulai dari terkecil ke terbesar (misal: `group=0` diproses sebelum `group=1`).
* **Aturan Satu Handler per Grup:** Di dalam satu grup yang sama, hanya handler pertama yang cocok dengan filter yang akan dieksekusi. Begitu satu handler dalam suatu grup sukses terpicu, dispatcher menghentikan pencarian di grup tersebut dan langsung berlanjut ke grup berikutnya.
* Jika Anda ingin beberapa handler memproses update yang sama secara bersamaan atau berurutan, daftarkan handler-handler tersebut di **grup yang berbeda**.

### Kontrol Propagasi (`StopPropagation` & `ContinuePropagation`)
Anda dapat mengontrol perilaku aliran update secara manual dari dalam callback handler menggunakan pengecualian khusus yang diimpor dari `kurigram`:

* **`raise StopPropagation`:** Menghentikan perambatan update seketika itu juga. Handler di grup berikutnya tidak akan dipanggil untuk update yang bersangkutan.
* **`raise ContinuePropagation`:** Memaksa dispatcher untuk terus mengevaluasi handler lain di dalam **grup yang sama** atau grup berikutnya, meskipun handler saat ini sudah cocok dan sukses dieksekusi.

---

## 3. Katalog Filter Bawaan (Built-in Filters)

Filter digunakan untuk menyaring update yang masuk sebelum memicu handler. Semua filter bawaan terletak di bawah modul `kurigram.filters`:

| Filter | Deskripsi |
| :--- | :--- |
| `filters.text` | Mencocokkan pesan yang berisi teks biasa. |
| `filters.media` | Mencocokkan pesan yang berisi media apa pun (foto, video, dokumen, dll.). |
| `filters.photo` | Mencocokkan pesan yang berisi foto. |
| `filters.video` | Mencocokkan pesan yang berisi video. |
| `filters.audio` | Mencocokkan pesan yang berisi berkas audio (musik). |
| `filters.voice` | Mencocokkan pesan yang berisi rekaman suara (voice note). |
| `filters.document` | Mencocokkan pesan yang berisi berkas dokumen umum. |
| `filters.sticker` | Mencocokkan pesan yang berisi stiker. |
| `filters.animation` | Mencocokkan pesan yang berisi animasi (GIF). |
| `filters.contact` | Mencocokkan pesan yang berisi kontak kontak telepon. |
| `filters.location` | Mencocokkan pesan yang berisi data lokasi. |
| `filters.poll` | Mencocokkan pesan yang berisi jajak pendapat (poll). |
| `filters.private` | Mencocokkan pesan yang dikirim di obrolan pribadi (1-on-1). |
| `filters.group` | Mencocokkan pesan yang dikirim di grup atau supergroup. |
| `filters.channel` | Mencocokkan pesan yang dikirim di channel Telegram. |
| `filters.me` | Mencocokkan pesan yang dikirim oleh akun pengguna itu sendiri (self). |
| `filters.bot` | Mencocokkan pesan yang dikirim oleh akun bot Telegram lain. |
| `filters.incoming` | Mencocokkan pesan yang masuk (diterima). |
| `filters.outgoing` | Mencocokkan pesan yang keluar (dikirim oleh akun klien saat ini). |
| `filters.reply` | Mencocokkan pesan yang membalas pesan lain. |
| `filters.command(cmd)` | Mencocokkan perintah Telegram (misal: `filters.command("start")` mencocokkan `/start` atau `!start`). |
| `filters.regex(pola)` | Mencocokkan teks pesan yang cocok dengan pola regular expression tertentu. |
| `filters.chat(ids)` | Mencocokkan pesan dari satu atau beberapa ID obrolan/username tertentu. |
| `filters.user(ids)` | Mencocokkan pesan dari satu atau beberapa ID pengguna/username tertentu. |

---

## 4. Penggabungan Filter Menggunakan Operator Logika

Filter dapat digabungkan menggunakan operator logika bitwise Python berikut:
* `&` (DAN/AND): Kedua filter harus terpenuhi (True).
* `|` (ATAU/OR): Setidaknya salah satu filter harus terpenuhi (True).
* `~` (TIDAK/NOT): Membalikkan kondisi evaluasi filter.

### Contoh Resmi Penggabungan Filter

```python
from kurigram import Client, filters
from kurigram.types import Message

app = Client("my_account")

# Memfilter hanya pesan teks privat dan bukan dari diri sendiri (~filters.me)
@app.on_message(filters.text & filters.private & ~filters.me)
async def echo(client: Client, message: Message):
    await message.reply(message.text)

# Pesan yang merupakan foto atau video, tetapi BUKAN dari channel
media_filter = (filters.photo | filters.video) & ~filters.channel

# Pesan di obrolan pribadi berupa teks, atau pesan di grup berupa perintah (commands)
complex_filter = (filters.private & filters.text) | (filters.group & filters.command)
```

---

## 5. Filter Ekspresi Reguler (Regex)

Filter regex memindai teks pesan atau caption terhadap pola tertentu.

```python
import re
from kurigram import Client, filters

app = Client("my_bot")

# Cocok dengan teks yang mengandung 'hello' atau 'hi' (case-insensitive)
greeting_filter = filters.regex(r"(?i)^(hello|hi)\b")

@app.on_message(greeting_filter)
async def greeting_handler(client, message):
    await message.reply_text("Halo di sana!")

# Mengekstrak grup kecocokan Regex (objek match disimpan di message.matches)
number_filter = filters.regex(r"^/add (\d+) (\d+)$")

@app.on_message(filters.group & number_filter)
async def add_handler(client, message):
    num1 = int(message.matches[0].group(1))
    num2 = int(message.matches[0].group(2))
    await message.reply_text(f"Jumlah: {num1 + num2}")
```

---

## 6. Filter Kustom (`filters.create`)

Jika filter bawaan tidak mencukupi, Anda dapat membuat fungsi filter kustom sendiri menggunakan bantuan `filters.create`.

### Contoh Resmi Membuat Filter Kustom

Helper `filters.create` menerima fungsi yang menerima dua parameter utama `(filter_obj, client, update)` (atau tiga untuk pesan/update) dan mengembalikan nilai boolean (`True` untuk memicu handler, `False` untuk mengabaikan).

```python
from kurigram import Client, filters
from kurigram.types import Message

app = Client("my_account")

# 1. Filter kustom untuk memeriksa apakah pengirim adalah admin di grup saat ini
async def is_admin_filter(flt, client: Client, message: Message) -> bool:
    if not message.chat or not message.from_user:
        return False
    if message.chat.type in ["private", "bot"]:
        return True
    
    member = await client.get_chat_member(message.chat.id, message.from_user.id)
    return member.status in ["administrator", "owner"]

# Daftarkan filter kustom
is_chat_admin = filters.create(is_admin_filter)

# Gunakan filter kustom pada handler
@app.on_message(filters.group & filters.command("ban") & is_chat_admin)
async def ban_handler(client, message):
    await message.reply_text("Anda memiliki otorisasi untuk melakukan ban!")
```

### Filter Kustom Berparameter

Anda juga dapat mengirimkan argumen ke filter kustom dengan menggunakan closure fungsi:

```python
def minimum_length(min_len: int):
    async def func(flt, client, message: Message):
        return message.text and len(message.text) >= flt.min_len
    
    return filters.create(func, min_len=min_len)

# Hanya terpicu pada pesan teks dengan panjang minimal 20 karakter
@app.on_message(filters.text & minimum_length(20))
async def long_message_handler(client, message):
    await message.reply_text("Itu adalah pesan yang cukup panjang.")
```
