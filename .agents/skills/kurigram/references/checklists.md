---
name: checklists
description: Complete reference documentation and practical guide.
---

# Referensi API Kurigram: Checklists (Fitur Eksklusif)

Dokumen ini menjelaskan fungsionalitas manajemen checklist bawaan (bukan keyboard inline manual) yang didukung secara eksklusif oleh Kurigram. Checklist ini sangat berguna untuk aplikasi manajemen tugas (to-do list), kolaborasi proyek, dan lembar kerja interaktif di dalam grup atau obrolan pribadi Telegram.

---

## 1. Mengirim Checklist Baru (`send_checklist`)

Fungsi ini digunakan untuk mengirimkan daftar tugas interaktif pertama kali ke obrolan target.

* **Signature:**
  ```python
  async def send_checklist(self, chat_id: int | str, title: str, tasks: list[str]) -> Message:
  ```
* **Parameter:**
  * `chat_id` (`int` | `str`): ID atau username dari obrolan target.
  * `title` (`str`): Judul dari checklist yang akan ditampilkan paling atas.
  * `tasks` (`list[str]`): Daftar string berisi tugas-tugas awal.
* **Contoh Kode:**
  ```python
  from kurigram import Client
  import asyncio

  app = Client("my_session")

  async def main():
      async with app:
          tugas = [
              "Review PR #12",
              "Update dokumentasi API",
              "Deploy ke server staging"
          ]
          pesan = await app.send_checklist(
              chat_id=-100123456789,
              title="📋 Tugas DevOps Hari Ini",
              tasks=tugas
          )
          print(f"Checklist berhasil dikirim dengan ID: {pesan.id}")

  if __name__ == "__main__":
      asyncio.run(main())
  ```

---

## 2. Mengubah Checklist (`edit_message_checklist`)

Mengubah seluruh struktur checklist yang sudah ada, termasuk judul dan daftar tugasnya secara keseluruhan.

* **Signature:**
  ```python
  async def edit_message_checklist(self, chat_id: int | str, message_id: int, title: str, tasks: list[str]) -> Message:
  ```
* **Parameter:**
  * `chat_id` (`int` | `str`): ID atau username obrolan target.
  * `message_id` (`int`): ID pesan checklist yang ingin diubah.
  * `title` (`str`): Judul checklist baru.
  * `tasks` (`list[str]`): Daftar string tugas yang baru (menggantikan yang lama).
* **Contoh Kode:**
  ```python
  from kurigram import Client
  import asyncio

  app = Client("my_session")

  async def update_checklist(chat_id, msg_id):
      async with app:
          tugas_baru = [
              "Review PR #12 (Done)",
              "Update dokumentasi API (In Progress)",
              "Deploy ke server staging",
              "Buat release notes"
          ]
          await app.edit_message_checklist(
              chat_id=chat_id,
              message_id=msg_id,
              title="📋 Status DevOps Terbaru",
              tasks=tugas_baru
          )
          print("Checklist berhasil diperbarui.")
  ```

---

## 3. Menambahkan Tugas Baru (`add_checklist_tasks`)

Fungsi pembantu untuk menambahkan satu atau beberapa tugas tambahan ke dalam checklist yang sudah terkirim tanpa menghapus tugas yang sudah ada.

* **Signature:**
  ```python
  async def add_checklist_tasks(self, chat_id: int | str, message_id: int, tasks: list[str]) -> Message:
  ```
* **Parameter:**
  * `tasks` (`list[str]`): Daftar tugas baru yang ingin ditambahkan di baris paling bawah.
* **Contoh Kode:**
  ```python
  from kurigram import Client
  import asyncio

  app = Client("my_session")

  async def tambah_tugas(chat_id, msg_id):
      async with app:
          await app.add_checklist_tasks(
              chat_id=chat_id,
              message_id=msg_id,
              tasks=["Backup database utama", "Meeting mingguan jam 14:00"]
          )
          print("Tugas tambahan berhasil dimasukkan.")
  ```

---

## 4. Menandai Tugas Selesai (`mark_checklist_tasks_as_done`)

Fungsi utilitas untuk menandai tugas tertentu berdasarkan indeks atau nama tugas agar dicoret atau diberi centang tanda selesai (`completed`).

* **Signature:**
  ```python
  async def mark_checklist_tasks_as_done(self, chat_id: int | str, message_id: int, task_indices: list[int]) -> Message:
  ```
* **Parameter:**
  * `task_indices` (`list[int]`): Daftar indeks tugas (0-indexed) yang ingin ditandai sebagai selesai.
* **Contoh Kode:**
  ```python
  from kurigram import Client
  import asyncio

  app = Client("my_session")

  async def selesaikan_tugas(chat_id, msg_id):
      async with app:
          # Tandai tugas pertama (indeks 0) dan ketiga (indeks 2) sebagai selesai
          await app.mark_checklist_tasks_as_done(
              chat_id=chat_id,
              message_id=msg_id,
              task_indices=[0, 2]
          )
          print("Tugas berhasil ditandai selesai.")
  ```
