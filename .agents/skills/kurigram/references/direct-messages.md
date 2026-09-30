---
name: direct-messages
description: Complete reference documentation and practical guide.
---

# Referensi API Kurigram: Direct Messages & Suggested Posts (Fitur Eksklusif)

Dokumen ini menjelaskan metode eksklusif Kurigram untuk mengelola grup Direct Messages (DM), manajemen riwayat topik DM, serta sistem moderasi postingan yang disarankan (`suggested posts`) untuk channel.

---

## 1. Pengelolaan Grup Direct Messages (DM)

Metode ini memungkinkan pengelolaan fitur bisnis Telegram di mana pesan langsung diarahkan ke grup khusus atau dipilah ke dalam topik terpisah.

### `set_chat_direct_messages_group`
Menghubungkan atau menetapkan suatu grup sebagai wadah penerima direct messages bisnis atau akun.

* **Signature:**
  ```python
  async def set_chat_direct_messages_group(self, chat_id: int | str, group_chat_id: int | str) -> bool:
  ```
* **Parameter:**
  * `chat_id` (`int` | `str`): ID atau username chat utama / akun bisnis.
  * `group_chat_id` (`int` | `str`): ID grup tujuan untuk menampung pesan.
* **Contoh Kode:**
  ```python
  from kurigram import Client
  import asyncio

  app = Client("my_session")

  async def main():
      async with app:
          # Hubungkan akun bisnis ke grup koordinasi internal
          success = await app.set_chat_direct_messages_group(
              chat_id="my_business_account",
              group_chat_id=-100987654321
          )
          if success:
              print("Grup koordinasi DM berhasil dikonfigurasi.")

  if __name__ == "__main__":
      asyncio.run(main())
  ```

---

### `get_direct_messages_topics`
Mengambil daftar topik yang dibuat secara otomatis untuk setiap obrolan pengguna di dalam grup penampung DM tersebut.

* **Signature:**
  ```python
  async def get_direct_messages_topics(self, chat_id: int | str, limit: int = 100) -> list:
  ```
* **Contoh Kode:**
  ```python
  from kurigram import Client
  import asyncio

  app = Client("my_session")

  async def cetak_topik_dm(group_chat_id):
      async with app:
          topik_list = await app.get_direct_messages_topics(chat_id=group_chat_id, limit=20)
          for topik in topik_list:
              print(f"Topik ID: {topik.id}, Judul: {topik.title}")
  ```

---

### `delete_direct_messages_chat_topic_history`
Menghapus seluruh riwayat pesan/percakapan pada topik DM tertentu di dalam grup koordinasi tanpa mengganggu topik lain.

* **Signature:**
  ```python
  async def delete_direct_messages_chat_topic_history(self, chat_id: int | str, topic_id: int) -> bool:
  ```
* **Contoh Kode:**
  ```python
  from kurigram import Client
  import asyncio

  app = Client("my_session")

  async def bersihkan_topik(group_chat_id, topic_id):
      async with app:
          success = await app.delete_direct_messages_chat_topic_history(
              chat_id=group_chat_id,
              topic_id=topic_id
          )
          if success:
              print(f"Riwayat topik {topic_id} berhasil dihapus.")
  ```

---

## 2. Sistem Moderasi Postingan yang Disarankan (Suggested Posts)

Fitur Telegram Business dan Channel memungkinkan pengguna mengirimkan draf atau saran postingan ke channel admin. Kurigram menyediakan API eksklusif untuk menyetujui atau menolak usulan tersebut.

### `approve_suggested_post`
Menyetujui saran postingan agar langsung diterbitkan di channel terkait.

* **Signature:**
  ```python
  async def approve_suggested_post(self, channel_id: int | str, post_id: int) -> Message:
  ```
* **Parameter:**
  * `channel_id` (`int` | `str`): ID atau username channel target.
  * `post_id` (`int`): ID unik saran postingan yang diajukan.
* **Contoh Kode:**
  ```python
  from kurigram import Client
  import asyncio

  app = Client("my_session")

  async def setujui_saran(channel_id, post_id):
      async with app:
          # Posting saran ke channel secara publik
          pesan_terbit = await app.approve_suggested_post(channel_id=channel_id, post_id=post_id)
          print(f"Postingan disetujui dan diterbitkan di ID: {pesan_terbit.id}")
  ```

---

### `decline_suggested_post`
Menolak saran postingan, sehingga saran tersebut dihapus dari antrean moderasi.

* **Signature:**
  ```python
  async def decline_suggested_post(self, channel_id: int | str, post_id: int) -> bool:
  ```
* **Contoh Kode:**
  ```python
  from kurigram import Client
  import asyncio

  app = Client("my_session")

  async def tolak_saran(channel_id, post_id):
      async with app:
          success = await app.decline_suggested_post(channel_id=channel_id, post_id=post_id)
          if success:
              print(f"Postingan saran #{post_id} ditolak dan dihapus.")
  ```
