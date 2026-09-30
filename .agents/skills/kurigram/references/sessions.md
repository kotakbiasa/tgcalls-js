---
name: sessions
description: Complete reference documentation and practical guide.
---

# Manajemen Sesi & Otentikasi Kurigram

Panduan referensi ini merinci manajemen sesi, otentikasi, pembuatan string session, konfigurasi multi-perangkat, siklus hidup kredensial, dan detail opsi konfigurasi kelas `Client` di Kurigram.

---

## 1. Ikhtisar Sesi & Metode Otentikasi (Authorization)

Kurigram menyimpan data sesi (kunci otentikasi, alamat IP server, port, detail pengguna) di dalam database lokal atau sebagai string di memori. Terdapat dua jenis mode otentikasi utama yang didukung:

1. **Mode Userbot (Akun Pengguna):** Bertindak atas nama akun pengguna Telegram riil. Membutuhkan `api_id` dan `api_hash`.
2. **Mode Bot:** Bertindak sebagai bot Telegram yang dibuat melalui @BotFather. Membutuhkan `api_id`, `api_hash`, dan `bot_token`.

### Alur Otentikasi (Authorization Flow)

* **Otentikasi Interaktif (Terminal):**
  Jika Anda menjalankan skrip di terminal secara interaktif tanpa menyertakan `bot_token`, Kurigram secara otomatis meminta detail berikut:
  1. **Nomor Telepon:** Masukkan nomor telepon dalam format internasional (misal: `+628123456789`).
  2. **Kode Verifikasi:** Masukkan kode yang dikirim oleh Telegram (baik via aplikasi Telegram atau SMS).
  3. **Kata Sandi 2FA:** Jika Verifikasi Dua Langkah diaktifkan pada akun tersebut, masukkan kata sandi Anda.

* **Otentikasi Programatis (Non-Interaktif/Manual):**
  Jika Anda membangun bot yang menangani otentikasi pengguna secara dinamis (seperti web dashboard atau bot perantara), Anda dapat memanggil API otentikasi secara manual:
  1. **Kirim Kode Verifikasi:** Panggil `await client.send_code(phone_number)` yang akan mengembalikan objek `SentCode` (mengandung properti `phone_code_hash`).
  2. **Masuk (Sign In):** Panggil `await client.sign_in(phone_number, phone_code_hash, phone_code)`.
  3. **Tangani 2FA:** Jika akun memiliki 2FA aktif, `sign_in` akan memicu pengecualian `SessionPasswordNeeded`. Tangkap eksepsi ini lalu panggil `await client.check_password(password)` dengan kata sandi 2FA yang benar.

---

## 2. Parameter Konfigurasi `Client`

Saat menginisialisasi instans kelas `Client`, Anda dapat memberikan opsi berikut untuk mengonfigurasi perilakunya:

| Parameter | Tipe Data | Deskripsi |
| :--- | :--- | :--- |
| `name` | `str` | Nama sesi (sekaligus digunakan sebagai nama berkas database `.session` lokal). Jika diisi `":memory:"`, sesi hanya disimpan di memori (RAM). |
| `api_id` | `int` | ID API unik yang diperoleh dari bagian pengembangan di [my.telegram.org](https://my.telegram.org). |
| `api_hash` | `str` | Hash API unik yang diperoleh dari [my.telegram.org](https://my.telegram.org). |
| `bot_token` | `str` (*opsional*) | Token bot unik dari [@BotFather](https://t.me/BotFather) untuk masuk dalam Mode Bot. |
| `session_string`| `str` (*opsional*) | String sesi berbasis Base64 untuk deployment tanpa berkas sesi fisik (serverless). |
| `in_memory` | `bool` (*opsional*) | Jika set ke `True`, sesi disimpan sepenuhnya di memori RAM dan tidak ditulis ke disk. Bawaan: `False`. |
| `workdir` | `str` (*opsional*) | Direktori kerja tempat berkas `.session` disimpan. Bawaan: direktori kerja saat ini. |
| `plugins` | `dict` (*opsional*) | Konfigurasi pemuatan plugin otomatis (misalnya `dict(root="handlers")`). |
| `parse_mode` | `str` (*opsional*) | Mode penguraian teks bawaan untuk pesan (`"markdown"`, `"html"`, atau `None`). |
| `sleep_threshold`| `int` (*opsional*) | Batas waktu tunggu maksimal (dalam detik) jika terkena `FloodWait` sebelum Kurigram otomatis melakukan `sleep`. Bawaan: `10`. |
| `workers` | `int` (*opsional*) | Jumlah thread/worker yang dialokasikan untuk memproses update masuk secara paralel. Bawaan: `10`. |
| `proxy` | `dict` (*opsional*) | Parameter proxy untuk koneksi, berisi skema (`socks5`, `socks4`, `http`), hostname, port, username, dan password. |
| `test_mode` | `bool` (*opsional*) | Jika set ke `True`, klien akan terhubung ke server uji coba (test DC) Telegram. Bawaan: `False`. |
| `no_updates` | `bool` (*opsional*) | Jika set ke `True`, klien tidak akan mendengarkan atau mengambil pembaruan (updates) dari Telegram. Bawaan: `False`. |
| `device_model` | `str` (*opsional*) | Nama model perangkat yang muncul di daftar sesi aktif Telegram. |
| `system_version`| `str` (*opsional*) | Versi sistem operasi yang muncul di daftar sesi aktif Telegram. |
| `app_version` | `str` (*opsional*) | Versi aplikasi klien yang dikirimkan ke Telegram. |
| `lang_code` | `str` (*opsional*) | Kode bahasa aplikasi klien (misal: `"id"` atau `"en"`). Bawaan: `"en"`. |

---

## 3. In-Memory String Sessions

String session mengenkode semua detail otentikasi yang diperlukan ke dalam satu string berbasis base64. Sangat cocok untuk platform serverless (Heroku, Cloudflare Workers, AWS Lambda, Docker) di mana penyimpanan lokal yang persisten tidak tersedia.

### Mengekspor String Sesi

Untuk menghasilkan string sesi, jalankan klien dalam skrip interaktif untuk melakukan otentikasi sekali.

```python
import asyncio
from kurigram import Client

async def generate_session():
    # Gunakan nama ":memory:" untuk membuat penyimpanan di memori
    async with Client(":memory:", api_id=12345, api_hash="your_api_hash") as app:
        session_str = await app.export_session_string()
        print("String Sesi Anda:")
        print(session_str)

if __name__ == "__main__":
    asyncio.run(generate_session())
```

### Memuat Klien dengan String Sesi

Setelah mengekspor string sesi, masukkan string tersebut ke konstruktor `Client` menggunakan parameter `session_string`:

```python
import asyncio
from kurigram import Client

SESSION_STRING = "1AZW..."  # Isi dengan string sesi yang telah diekspor

async def main():
    async with Client("my_bot", session_string=SESSION_STRING) as app:
        me = await app.get_me()
        print(f"Masuk sebagai {me.first_name} (@{me.username})")

if __name__ == "__main__":
    asyncio.run(main())
```

---

## 4. Contoh Kode Resmi: Hello World & Get Dialogs

### Hello World (Memulai/Menghentikan Sesi)

Contoh ini menunjukkan pembuatan klien userbot sederhana untuk mengirim pesan ke obrolan "me" (pesan tersimpan Anda sendiri).

#### Menggunakan Context Manager (Otomatis Start/Stop)
```python
from kurigram import Client
import asyncio

async def main():
    async with Client("my_account", api_id=12345, api_hash="your_api_hash") as app:
        await app.send_message("me", "Hello, World!")

if __name__ == "__main__":
    asyncio.run(main())
```

#### Menggunakan Metode Start/Stop Manual
```python
from kurigram import Client
import asyncio

async def main():
    app = Client("my_account", api_id=12345, api_hash="your_api_hash")
    await app.start()
    try:
        await app.send_message("me", "Hello, World!")
    finally:
        await app.stop()

if __name__ == "__main__":
    asyncio.run(main())
```

### Mengambil Daftar Dialog (Get Dialogs)

Mengambil seluruh daftar obrolan aktif (dialog) yang sedang berlangsung pada akun tersebut secara asinkron.

```python
from kurigram import Client
import asyncio

async def main():
    async with Client("my_account") as app:
        # Melakukan iterasi dialog pengguna
        async for dialog in app.get_dialogs():
            chat = dialog.chat
            print(f"Chat: {chat.title or chat.first_name} | Tipe: {chat.type} | ID: {chat.id}")

if __name__ == "__main__":
    asyncio.run(main())
```

---

## 5. Manajemen Multi-Perangkat

Telegram memungkinkan beberapa sesi bersamaan (perangkat) aktif untuk satu akun yang sama.

### Informasi dan Penamaan Perangkat

Untuk membedakan sesi Kurigram Anda di daftar sesi aktif Telegram (Pengaturan > Perangkat), konfigurasikan metadata perangkat berikut:

```python
app = Client(
    "my_session",
    api_id=12345,
    api_hash="your_api_hash",
    device_model="Kurigram Server Engine v1.0",
    system_version="Linux 6.1.0",
    app_version="2.0.0"
)
```

### Mengakhiri Sesi Lain Secara Programatis

Anda dapat melihat atau mengakhiri sesi aktif lainnya menggunakan fungsi RPC mentah:

```python
from kurigram import Client
from kurigram.raw import functions

async def revoke_other_sessions(app: Client):
    # Mengakhiri semua sesi aktif lainnya kecuali sesi yang sedang berjalan saat ini
    await app.invoke(functions.auth.ResetAuthorizations())
    print("Semua sesi lain telah diakhiri.")
```

---

## 6. Siklus Hidup Kredensial & Event Siklus Hidup

Menangani hook siklus hidup saat koneksi terhubung atau terputus untuk memastikan pembersihan sumber daya.

```python
import asyncio
from kurigram import Client

app = Client("my_bot")

@app.on_connected()
async def on_connect(client: Client):
    print("Terhubung ke Telegram.")

@app.on_disconnected()
async def on_disconnect(client: Client):
    print("Terputus dari Telegram.")

async def run_client():
    await app.start()
    try:
        while True:
            await asyncio.sleep(3600)
    finally:
        await app.stop()

if __name__ == "__main__":
    asyncio.run(run_client())
```
