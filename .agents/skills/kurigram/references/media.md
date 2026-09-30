---
name: media
description: Complete reference documentation and practical guide.
---

# Operasi Media Kurigram: Streaming, Pembagian Chunk, & Pelacakan Progres

Panduan referensi ini membahas penanganan media di Kurigram, termasuk pengunggahan/pengunduhan berbasis chunk, implementasi progress bar kustom, streaming media, dan pengiriman media group.

---

## 1. Pengunggahan Media Berbasis Chunk

Mengunggah file besar atau buffer memori dalam bentuk chunk membantu mencegah penggunaan RAM yang tinggi.

```python
import os
from kurigram import Client

async def upload_large_file_in_chunks(client: Client, chat_id: int, file_path: str):
    file_size = os.path.getsize(file_path)
    
    # Fungsi callback progres
    async def progress(current, total):
        percentage = (current / total) * 100
        print(f"Mengunggah: {current}/{total} bytes ({percentage:.1f}%)", end="\r")

    # Mengirim dokumen dengan membaca berkas lokal secara berkala (chunk)
    await client.send_document(
        chat_id=chat_id,
        document=file_path,
        caption="Berikut adalah dokumen besar Anda",
        progress=progress
    )
```

---

## 2. Pengunduhan Media Berbasis Chunk (`download_media`)

Kurigram memungkinkan penulisan data unduhan langsung ke penyimpanan lokal atau ke buffer memori dengan callback pelacakan progres.

### Contoh `download_media` dengan Progress Bar Callback

```python
import io
import sys
from kurigram import Client
from kurigram.types import Message

# Fungsi callback progress bar sederhana
async def progress_callback(current, total):
    percent = (current / total) * 100
    sys.stdout.write(f"\rMengunduh: {current}/{total} bytes ({percent:.2f}%)")
    sys.stdout.flush()

async def download_media_example(client: Client, message: Message):
    # Memeriksa apakah pesan berisi dokumen atau foto
    if message.document or message.photo:
        # Mengunduh media dan memperbarui progres di terminal
        file_path = await client.download_media(
            message,
            progress=progress_callback
        )
        print(f"\nBerkas berhasil diunduh ke: {file_path}")
```

### Mengunduh ke Buffer Memori (BytesIO)

```python
import io
from kurigram import Client
from kurigram.types import Message

async def download_to_memory(client: Client, message: Message):
    if not message.photo:
        return
    
    buffer = io.BytesIO()
    
    await client.download_media(
        message.photo,
        file_name=buffer
    )
    
    buffer.seek(0)
    print(f"Ukuran data dalam memori: {len(buffer.getvalue())} bytes")
```

---

## 3. Progress Bar Kustom yang Menampilkan Kecepatan dan Estimasi

Visualisasi transfer data dengan pemformatan yang lebih kaya (kecepatan MB/s dan progress bar visual):

```python
import time
from kurigram import Client

async def progress_bar_callback(current, total, start_time, message_to_update):
    elapsed_time = time.time() - start_time
    if elapsed_time == 0:
        return
    
    speed = current / elapsed_time  # Bytes per detik
    percentage = (current / total) * 100
    
    # Progress Bar Visual
    bar_length = 20
    filled_length = int(bar_length * current // total)
    bar = "█" * filled_length + "░" * (bar_length - filled_length)
    
    progress_text = (
        f"**Progres Transfer:**\n"
        f"`[{bar}]` {percentage:.1f}%\n"
        f"Kecepatan: {speed / (1024 * 1024):.2f} MB/s\n"
        f"Ditransfer: {current / (1024 * 1024):.2f} MB dari {total / (1024 * 1024):.2f} MB"
    )
    
    # Perbarui pesan status setiap 5 detik agar tidak melanggar batas rate-limit Telegram
    if not hasattr(progress_bar_callback, "last_updated") or time.time() - progress_bar_callback.last_updated > 5:
        await message_to_update.edit_text(progress_text)
        progress_bar_callback.last_updated = time.time()
```

---

## 4. Streaming Media (`stream_media`)

Untuk file video/audio, daripada mengunduh seluruh file ke memori atau disk, Anda dapat mengalirkan data menggunakan generator chunk dengan `stream_media`.

```python
from kurigram import Client
from kurigram.types import Message

async def stream_media_example(client: Client, message: Message):
    media = message.video or message.document
    if not media:
        return
    
    # Alirkan media dalam bentuk chunk
    async for chunk in client.stream_media(media, limit=0):
        # Proses chunk biner (misalnya diteruskan ke pemroses video eksternal)
        process_chunk_data(chunk)

def process_chunk_data(chunk: bytes):
    # Simulasi pemrosesan
    pass
```

---

## 5. Mengirim Media Group (`send_media_group`)

Mengirim album berisi beberapa foto atau video sekaligus dalam satu pesan terkelompok.

```python
from kurigram import Client
from kurigram.types import InputMediaPhoto, InputMediaVideo

async def send_album_example(client: Client, chat_id: int):
    await client.send_media_group(
        chat_id=chat_id,
        media=[
            InputMediaPhoto("https://picsum.photos/800", caption="Foto Pemandangan 1"),
            InputMediaPhoto("https://picsum.photos/900", caption="Foto Pemandangan 2"),
            InputMediaVideo("lokal_video.mp4", caption="Video Dokumentasi")
        ]
    )
```
