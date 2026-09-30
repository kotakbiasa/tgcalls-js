---
name: api-methods-and-types
description: Complete reference documentation and practical guide.
---

# Referensi Komprehensif: API Methods, Types, dan Konfigurasi Kurigram

Dokumen ini menyediakan panduan referensi lengkap mengenai metode API, tipe data umum, konfigurasi klien, pola pemanggilan metode, dan cara melakukan pemanggilan MTProto mentah menggunakan framework Kurigram di Python.

---

## 1. Konfigurasi Klien (`Client`)

Kelas `Client` adalah gerbang utama untuk berinteraksi dengan API Telegram via Kurigram. Anda dapat menginisialisasinya dengan parameter berikut:

### Parameter `Client(...)`

| Parameter | Tipe Data | Deskripsi |
| :--- | :--- | :--- |
| `name` | `str` | Nama sesi (juga digunakan sebagai nama berkas database `.session` lokal). |
| `api_id` | `int` | ID API unik Anda yang diperoleh dari [my.telegram.org](https://my.telegram.org). |
| `api_hash` | `str` | Hash API unik Anda yang diperoleh dari [my.telegram.org](https://my.telegram.org). |
| `bot_token` | `str` (*opsional*) | Token bot yang diberikan oleh [@BotFather](https://t.me/BotFather) untuk masuk dalam mode Bot. |
| `session_string`| `str` (*opsional*) | String sesi berbasis Base64 untuk deployment tanpa berkas (serverless). |
| `workdir` | `str` (*opsional*) | Direktori kerja tempat berkas sesi disimpan (bawaan: direktori saat ini). |
| `plugins` | `dict` (*opsional*) | Konfigurasi pemuatan plugin otomatis (misal: `dict(root="handlers")`). |
| `parse_mode` | `str` (*opsional*) | Mode penguraian teks bawaan (`"markdown"`, `"html"`, atau `None`). |
| `sleep_threshold`| `int` (*opsional*) | Batas waktu tunggu maksimal (dalam detik) jika terkena `FloodWait` sebelum Kurigram otomatis melakukan tidur (`sleep`). Bawaan: `10`. |

```python
from kurigram import Client

app = Client(
    name="my_bot",
    api_id=12345,
    api_hash="abcdef0123456789",
    bot_token="123456:ABC-DEF",
    parse_mode="html",
    sleep_threshold=15
)
```

---

## 2. Pola Pemanggilan Metode (Method Invocation Patterns)

Kurigram menggunakan pemrograman asinkron berbasis Python `asyncio`. Panggilan API harus diawali dengan kata kunci `await` dan klien harus dalam keadaan terhubung (connected).

### A. Lifecycle Sesi (Context Manager vs Manual)
Klien harus dijalankan sebelum Anda dapat memanggil metodenya. Ada dua cara mengelola siklus hidup sesi:

1. **Context Manager (Sangat Direkomendasikan):**
   Metode ini secara otomatis menangani koneksi (`start`) dan pemutusan koneksi (`stop`) klien secara aman, bahkan jika terjadi kesalahan/pengecualian di tengah jalan.
   ```python
   async with app:
       await app.send_message("me", "Pesan dikirim menggunakan Context Manager")
   ```

2. **Start/Stop Manual:**
   Gunakan jika Anda ingin kontrol penuh atas siklus hidup koneksi atau ketika mengintegrasikan Kurigram dengan framework/loop asinkron eksternal.
   ```python
   await app.start()
   try:
       await app.send_message("me", "Pesan dikirim secara manual")
   finally:
       await app.stop()
   ```

### B. Bound Methods
Sebagian besar objek tipe data yang dikembalikan oleh Kurigram (seperti `Message`, `Chat`, `CallbackQuery`, dll.) adalah objek yang "terikat" (bound) ke klien yang membuatnya. Ini berarti objek tersebut memiliki metode bantuannya sendiri yang membungkus pemanggilan metode klien secara implisit untuk menyederhanakan kode.
* Contoh: Memanggil `await message.reply("Halo")` secara internal sama saja dengan memanggil `await app.send_message(chat_id=message.chat.id, text="Halo", reply_to_message_id=message.id)`.
* Metode terikat populer lainnya meliputi `message.delete()`, `message.edit_text()`, dan `callback_query.answer()`.

### C. Iterasi Menggunakan Async Generators
Metode yang mengembalikan daftar data berukuran besar (seperti `get_chat_history`, `get_dialogs`, `get_chat_members`) tidak mengembalikan `list` standar, melainkan generator asinkron (`AsyncGenerator`). Hal ini sangat menghemat memori karena data diambil secara bertahap dalam potongan (chunks) dari server Telegram.
* Anda harus melakukan perulangan menggunakan kata kunci `async for`:
  ```python
  async for message in app.get_chat_history("username_grup", limit=100):
      print(message.text)
  ```

### D. Concurrency (Eksekusi Paralel)
Untuk melakukan pemanggilan API dalam jumlah banyak secara efisien (misalnya mengirim pesan massal atau mengunduh media dari beberapa chat sekaligus), gunakan `asyncio.gather` untuk menjalankan tugas-tugas tersebut secara konkuren tanpa saling memblokir satu sama lain.
  ```python
  import asyncio

  async def process_task(chat_id, text):
      await app.send_message(chat_id, text)

  async def main():
      chats = [12345, 67890, 11223]
      tasks = [process_task(chat, "Halo!") for chat in chats]
      await asyncio.gather(*tasks)
  ```

---

## 3. Katalog Metode Utama

### A. Messages (Pesan)

#### `send_message`
Mengirim pesan teks ke suatu obrolan.
* **Signature:**
  ```python
  async def send_message(self, chat_id: int | str, text: str, parse_mode: str = None, entities: list = None, disable_web_page_preview: bool = None, disable_notification: bool = None, reply_to_message_id: int = None, reply_markup = None) -> Message:
  ```
* **Parameter:**
  * `chat_id` (`int` \| `str`): ID unik target obrolan atau username channel/supergroup.
  * `text` (`str`): Isi teks pesan yang dikirim.
  * `parse_mode` (`str`, *opsional*): Parser teks (`"html"`, `"markdown"`, atau `None`).
  * `entities` (`list`, *opsional*): Entitas teks kaya jika diformat manual.
  * `disable_web_page_preview` (`bool`, *opsional*): Menonaktifkan preview link.
  * `disable_notification` (`bool`, *opsional*): Mengirim pesan tanpa suara.
  * `reply_to_message_id` (`int`, *opsional*): ID pesan yang ingin dibalas.
  * `reply_markup` (*opsional*): Objek Keyboard Inline atau Reply.

#### `send_media_group`
Mengirim album yang berisi hingga 10 foto atau video secara berkelompok.
* **Signature:**
  ```python
  async def send_media_group(self, chat_id: int | str, media: list[InputMediaPhoto | InputMediaVideo], disable_notification: bool = None, reply_to_message_id: int = None) -> list[Message]:
  ```
* **Parameter:**
  * `media` (`list`): Daftar objek media (`InputMediaPhoto`, `InputMediaVideo`).

#### `send_message_draft`
Menyimpan draf pesan ke obrolan tertentu.
* **Signature:**
  ```python
  async def send_message_draft(self, chat_id: int | str, text: str, parse_mode: str = None) -> bool:
  ```

#### `send_rich_message`
Mengirim pesan kaya format menggunakan payload kustom Kurigram secara instan.
* **Signature:**
  ```python
  async def send_rich_message(self, chat_id: int | str, rich_payload: dict, reply_to_message_id: int = None) -> Message:
  ```

#### `edit_message_text`
Mengubah teks pesan yang sudah dikirim.
* **Signature:**
  ```python
  async def edit_message_text(self, chat_id: int | str, message_id: int, text: str, parse_mode: str = None, entities: list = None, disable_web_page_preview: bool = None, reply_markup = None) -> Message:
  ```

#### `delete_messages`
Menghapus pesan dari riwayat obrolan.
* **Signature:**
  ```python
  async def delete_messages(self, chat_id: int | str, message_ids: int | list[int], revoke: bool = True) -> bool:
  ```
* **Parameter:**
  * `message_ids` (`int` \| `list[int]`): Satu atau beberapa ID pesan yang akan dihapus.
  * `revoke` (`bool`, *opsional*): Jika `True`, hapus pesan untuk semua anggota obrolan.

#### `send_reaction`
Mengirimkan reaksi emoji ke suatu pesan.
* **Signature:**
  ```python
  async def send_reaction(self, chat_id: int | str, message_id: int, emoji: str | list[str] = None, big: bool = False) -> bool:
  ```

---

### B. Chats & Moderation (Obrolan & Moderasi)

#### `join_chat`
Bergabung ke obrolan publik atau pribadi (melalui link undangan).
* **Signature:**
  ```python
  async def join_chat(self, chat_id: int | str) -> Chat:
  ```

#### `leave_chat`
Keluar dari grup atau channel.
* **Signature:**
  ```python
  async def leave_chat(self, chat_id: int | str, revoke: bool = False) -> bool:
  ```

#### `ban_chat_member`
Mengeluarkan dan memblokir anggota dari grup atau supergroup.
* **Signature:**
  ```python
  async def ban_chat_member(self, chat_id: int | str, user_id: int | str, until_date: int = 0) -> bool:
  ```
* **Parameter:**
  * `until_date` (`int`): Waktu pemblokiran (Unix Epoch Time). Nilai `0` berarti blokir permanen.

#### `unban_chat_member`
Membatalkan pemblokiran anggota grup/supergroup.
* **Signature:**
  ```python
  async def unban_chat_member(self, chat_id: int | str, user_id: int | str) -> bool:
  ```

#### `restrict_chat_member`
Membatasi hak akses/tindakan anggota tertentu di dalam grup.
* **Signature:**
  ```python
  async def restrict_chat_member(self, chat_id: int | str, user_id: int | str, permissions: ChatPermissions, until_date: int = 0) -> bool:
  ```
* **Parameter:**
  * `permissions` (`ChatPermissions`): Hak-hak yang diizinkan/dilarang.

#### `promote_chat_member`
Mempromosikan anggota obrolan menjadi administrator baru.
* **Signature:**
  ```python
  async def promote_chat_member(self, chat_id: int | str, user_id: int | str, privileges: ChatPrivileges = None) -> bool:
  ```

#### `set_administrator_title`
Mengubah gelar kustom (custom title) untuk administrator grup supergroup.
* **Signature:**
  ```python
  async def set_administrator_title(self, chat_id: int | str, user_id: int | str, title: str) -> bool:
  ```

#### `create_chat_invite_link`
Membuat tautan undangan baru untuk obrolan.
* **Signature:**
  ```python
  async def create_chat_invite_link(self, chat_id: int | str, name: str = None, expire_date: int = 0, member_limit: int = 0, creates_join_request: bool = False) -> ChatInviteLink:
  ```
* **Parameter:**
  * `creates_join_request` (`bool`): Jika `True`, pengguna harus disetujui admin sebelum bergabung.

#### `approve_chat_join_request`
Menyetujui permintaan bergabung dari pengguna.
* **Signature:**
  ```python
  async def approve_chat_join_request(self, chat_id: int | str, user_id: int | str) -> bool:
  ```

---

### C. AI Assistance (Bantuan Kecerdasan Buatan)

#### `compose_text_with_ai`
Membuat teks berdasarkan petunjuk (`prompt`) menggunakan model AI terintegrasi.
* **Signature:**
  ```python
  async def compose_text_with_ai(self, prompt: str, system_instruction: str = None) -> str:
  ```

#### `summarize_message`
Membuat ringkasan dari pesan teks panjang.
* **Signature:**
  ```python
  async def summarize_message(self, chat_id: int | str, message_id: int) -> str:
  ```

#### `fix_text_with_ai`
Memperbaiki kesalahan tata bahasa (typo) dan mengatur gaya bahasa teks.
* **Signature:**
  ```python
  async def fix_text_with_ai(self, text: str, style: str = "professional") -> str:
  ```

---

### D. Checklists (Daftar Tugas Interaktif)

#### `send_checklist`
Mengirimkan daftar checklist interaktif baru ke dalam obrolan.
* **Signature:**
  ```python
  async def send_checklist(self, chat_id: int | str, title: str, tasks: list[str]) -> Message:
  ```

#### `edit_message_checklist`
Memperbarui checklist yang telah dikirimkan secara penuh.
* **Signature:**
  ```python
  async def edit_message_checklist(self, chat_id: int | str, message_id: int, title: str, tasks: list[str]) -> Message:
  ```

#### `mark_checklist_tasks_as_done`
Menandai beberapa tugas tertentu sebagai selesai (berdasarkan indeks).
* **Signature:**
  ```python
  async def mark_checklist_tasks_as_done(self, chat_id: int | str, message_id: int, task_indices: list[int]) -> Message:
  ```

---

### E. Suggested Posts & DM Groups (Grup DM & Postingan Usulan)

#### `approve_suggested_post`
Menyetujui kiriman saran postingan agar langsung diterbitkan di channel.
* **Signature:**
  ```python
  async def approve_suggested_post(self, channel_id: int | str, post_id: int) -> Message:
  ```

#### `decline_suggested_post`
Menolak saran postingan dan menghapusnya dari antrean.
* **Signature:**
  ```python
  async def decline_suggested_post(self, channel_id: int | str, post_id: int) -> bool:
  ```

#### `set_chat_direct_messages_group`
Menetapkan suatu grup supergroup sebagai grup penampung pesan bisnis langsung (DM).
* **Signature:**
  ```python
  async def set_chat_direct_messages_group(self, chat_id: int | str, group_chat_id: int | str) -> bool:
  ```

#### `get_direct_messages_topics`
Mendapatkan daftar topik DM dari grup koordinasi.
* **Signature:**
  ```python
  async def get_direct_messages_topics(self, chat_id: int | str, limit: int = 100) -> list:
  ```

---

### F. Telegram Stars & Gifts (Ekonomi Stars & Kado)

#### `get_stars_balance`
Mengambil jumlah saldo Telegram Stars milik akun pengguna atau bot.
* **Signature:**
  ```python
  async def get_stars_balance(self, user_id: int | str = "me") -> int:
  ```

#### `refund_star_payment`
Melakukan pengembalian dana (refund) transaksi Stars kepada pengguna.
* **Signature:**
  ```python
  async def refund_star_payment(self, charge_id: str, user_id: int | str) -> bool:
  ```

#### `send_gift`
Mengirim kado (gift) kepada pengguna lain menggunakan saldo Stars.
* **Signature:**
  ```python
  async def send_gift(self, user_id: int | str, gift_id: str, text: str = None, is_private: bool = False) -> bool:
  ```

#### `send_paid_media`
Mengirimkan media berbayar yang memerlukan pembayaran sejumlah Stars tertentu dari pemirsa untuk membukanya.
* **Signature:**
  ```python
  async def send_paid_media(self, chat_id: int | str, stars: int, media: list, caption: str = None, parse_mode: str = None) -> Message:
  ```

#### `buy_gift_upgrade`
Membeli peningkatan tingkat (upgrade) dari gift yang dimiliki agar lebih langka/unik.
* **Signature:**
  ```python
  async def buy_gift_upgrade(self, gift_id: str) -> bool:
  ```

#### `convert_gift_to_stars`
Mengonversi kado yang diterima menjadi saldo Telegram Stars.
* **Signature:**
  ```python
  async def convert_gift_to_stars(self, gift_id: str) -> bool:
  ```

---

### G. Folder Management (Pengelolaan Folder Obrolan)

#### `get_folders`
Mengambil seluruh daftar folder obrolan (Chat Folders) yang dikonfigurasi oleh pengguna.
* **Signature:**
  ```python
  async def get_folders(self) -> list:
  ```

#### `create_folder`
Membuat folder obrolan baru dengan aturan penyaringan tertentu.
* **Signature:**
  ```python
  async def create_folder(self, title: str, included_chats: list[int | str], excluded_chats: list[int | str] = None, exclude_muted: bool = False, exclude_read: bool = False, exclude_archived: bool = False) -> bool:
  ```

#### `delete_folder`
Menghapus folder obrolan berdasarkan ID uniknya.
* **Signature:**
  ```python
  async def delete_folder(self, folder_id: int) -> bool:
  ```

#### `edit_folder`
Mengubah konfigurasi dan keanggotaan obrolan di dalam folder tertentu.
* **Signature:**
  ```python
  async def edit_folder(self, folder_id: int, title: str = None, included_chats: list[int | str] = None, excluded_chats: list[int | str] = None, exclude_muted: bool = None, exclude_read: bool = None, exclude_archived: bool = None) -> bool:
  ```

---

### H. Stories (Kisah/Status)

#### `send_story`
Menerbitkan story baru ke akun pengguna atau channel.
* **Signature:**
  ```python
  async def send_story(self, chat_id: int | str, media: str, caption: str = None, privacy: str = "everyone", period: int = 86400) -> Story:
  ```
* **Parameter:**
  * `privacy` (`str`): Batasan pemirsa (`"everyone"`, `"contacts"`, `"close_friends"`, `"selected_users"`).
  * `period` (`int`): Durasi tayang story dalam detik (bawaan: `86400` atau 24 jam).

#### `get_stories`
Mengambil daftar story aktif dari suatu akun atau channel.
* **Signature:**
  ```python
  async def get_stories(self, chat_id: int | str, limit: int = 100) -> list:
  ```

#### `delete_stories`
Menghapus satu atau beberapa story yang diterbitkan.
* **Signature:**
  ```python
  async def delete_stories(self, chat_id: int | str, story_ids: int | list[int]) -> bool:
  ```

#### `pin_chat_stories`
Menyematkan story penting di bagian atas profil chat.
* **Signature:**
  ```python
  async def pin_chat_stories(self, chat_id: int | str, story_ids: list[int]) -> bool:
  ```

---

## 4. Tipe Data Umum (Common Types)

Kurigram merepresentasikan objek API Telegram menggunakan kelas-kelas berikut yang kaya akan metode utilitas:

### `Message`
Merepresentasikan sebuah pesan di Telegram.
* **Atribut Utama:**
  * `id` (`int`): ID pesan unik di obrolan tersebut.
  * `from_user` (`User`): Pengirim pesan (jika pengirim adalah pengguna).
  * `chat` (`Chat`): Obrolan tempat pesan dikirim.
  * `text` (`str`): Isi teks pesan.
  * `date` (`datetime`): Waktu pesan dikirim.
  * `reply_to_message` (`Message`): Pesan yang dibalas oleh pesan ini.
* **Metode Bantuan:**
  * `await message.reply_text("teks")`: Membalas pesan secara instan.
  * `await message.delete()`: Menghapus pesan ini.
  * `await message.edit_text("teks baru")`: Mengedit teks pesan ini.

### `User`
Merepresentasikan pengguna Telegram.
* **Atribut Utama:**
  * `id` (`int`): ID unik pengguna.
  * `first_name` (`str`): Nama depan pengguna.
  * `last_name` (`str`, *opsional*): Nama belakang pengguna.
  * `username` (`str`, *opsional*): Username pengguna.
  * `is_bot` (`bool`): `True` jika pengguna merupakan bot.

### `Chat`
Merepresentasikan obrolan di Telegram (grup, supergroup, channel, atau chat privat).
* **Atribut Utama:**
  * `id` (`int`): ID unik obrolan.
  * `type` (`ChatType`): Tipe obrolan (`"private"`, `"group"`, `"supergroup"`, atau `"channel"`).
  * `title` (`str`, *opsional*): Judul grup/channel.
  * `username` (`str`, *opsional*): Username grup/channel.

### `CallbackQuery`
Merepresentasikan respons klik tombol inline keyboard.
* **Atribut Utama:**
  * `id` (`str`): ID query unik.
  * `from_user` (`User`): Pengguna yang menekan tombol.
  * `message` (`Message`): Pesan yang memuat keyboard tersebut.
  * `data` (`str`): Payload data yang dikirim oleh tombol.
* **Metode Bantuan:**
  * `await callback_query.answer("alert", show_alert=True)`: Mengirimkan pop-up atau notifikasi respons balik ke klien.

### `InlineQuery`
Merepresentasikan query pencarian inline yang dimasukkan pengguna di bilah input obrolan.
* **Atribut Utama:**
  * `id` (`str`): ID query unik.
  * `from_user` (`User`): Pengguna yang memicu pencarian.
  * `query` (`str`): Teks kueri pencarian.
* **Metode Bantuan:**
  * `await inline_query.answer(results=[...])`: Mengirimkan hasil pencarian inline.

### `Update`
Objek dasar kontainer pembaruan data mentah langsung dari MTProto.

---

## 5. Pemanggilan Raw MTProto (`app.invoke()`)

Ketika suatu API Telegram atau parameter baru belum didukung oleh metode tingkat tinggi Kurigram, Anda dapat melakukan pemanggilan fungsi MTProto mentah menggunakan metode `.invoke()`.

Pemanggilan ini menggunakan skema tipe data raw dari modul `kurigram.raw.functions` dan `kurigram.raw.types`.

### Contoh Penggunaan: Mengambil Riwayat Pesan dengan `GetHistory`

```python
import asyncio
from kurigram import Client
from kurigram.raw import functions, types

app = Client("user_session")

async def main():
    async with app:
        # Mengambil input peer dari obrolan tujuan
        peer = await app.resolve_peer("username_grup")
        
        # Memanggil fungsi raw GetHistory
        response = await app.invoke(
            functions.messages.GetHistory(
                peer=peer,
                offset_id=0,
                offset_date=0,
                add_offset=0,
                limit=10,
                max_id=0,
                min_id=0,
                hash=0
            )
        )
        
        # Memproses respons mentah (messages.Messages)
        for msg in response.messages:
            if isinstance(msg, types.Message):
                print(f"Pesan ID: {msg.id} - Teks: {msg.message}")

if __name__ == "__main__":
    asyncio.run(main())
```
