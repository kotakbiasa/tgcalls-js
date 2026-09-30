---
name: flood-wait
description: Complete reference documentation and practical guide.
---

# Penanganan Batas Laju & RPC Error Kurigram

Panduan referensi ini menjelaskan klasifikasi pengecualian API Telegram (RPC Errors), cara menangani pembatasan laju API (`FloodWait`), menerapkan dekorator retry otomatis, menangkap pembaruan mentah dengan `on_raw_update`, dan pemetaan status error MTProto.

---

## 1. Klasifikasi dan Hierarki RPC Error

Semua kesalahan yang dikembalikan oleh API Telegram (MTProto) dipetakan ke dalam bentuk kelas exception di dalam modul `kurigram.errors`. Semua exception ini mewarisi kelas dasar `RPCError`.

### Klasifikasi Berdasarkan Status Kode HTTP
Pengecualian dikelompokkan menurut kode status numerik mirip HTTP yang menunjukkan jenis masalahnya:

* **`BadRequest` (400):** Terjadi jika ada parameter yang salah, format tidak valid, atau entitas target tidak ditemukan (misal: ID obrolan salah, pesan kosong, dll.).
* **`Unauthorized` (401):** Terjadi jika sesi otentikasi klien belum terdaftar, telah kedaluwarsa, atau dihapus secara manual dari perangkat lain.
* **`Forbidden` (403):** Terjadi jika bot/klien tidak memiliki izin untuk melakukan tindakan tersebut (misal: mencoba memposting di grup di mana bot sudah di-ban atau belum menjadi admin).
* **`NotFound` (404):** Terjadi jika entitas atau file yang diminta tidak ditemukan di server Telegram.
* **`NotAcceptable` (406):** Jarang terjadi, menandakan permintaan tidak dapat diterima oleh server.
* **`Flood` (420):** Kesalahan batas laju (rate limiting). Subkelas utamanya adalah `FloodWait` yang menandakan bahwa Anda harus menunggu beberapa saat sebelum mengirim permintaan kembali.
* **`InternalServerError` (500):** Kesalahan internal pada server Telegram. Biasanya diselesaikan secara otomatis dengan mencoba kembali permintaan setelah beberapa detik.

---

## 2. Memahami API Rate Limiting (FloodWait)

Telegram memberlakukan batas laju (rate limit) yang ketat untuk mencegah spam dan penyalahgunaan infrastruktur API.
* **Properti `value` atau `x`:** Ketika terjadi pengecualian `FloodWait`, objek exception menyediakan properti `value` (atau `x` pada beberapa versi) yang berisi jumlah detik (integer) yang wajib Anda lewati sebelum mengulangi permintaan.
* **Sleep Threshold:** Pada inisialisasi `Client`, Anda dapat mengatur `sleep_threshold`. Jika waktu tunggu `FloodWait` di bawah ambang batas ini, Kurigram akan otomatis tidur (`sleep`) dan mengirim ulang permintaan tanpa melemparkan exception ke kode Anda.

---

## 3. Penanganan Eksepsi FloodWait secara Konkrit

Contoh ini menunjukkan cara menangkap pengecualian `FloodWait` secara manual di sekitar panggilan API individual.

```python
import asyncio
from kurigram import Client
from kurigram.errors import FloodWait

async def safe_send_message(client: Client, chat_id: int, text: str):
    while True:
        try:
            return await client.send_message(chat_id, text)
        except FloodWait as e:
            print(f"Terkena Rate Limit. Menunggu selama {e.value} detik sebelum mencoba lagi...")
            await asyncio.sleep(e.value)
```

---

## 4. Dekorator Percobaan Ulang Otomatis (Retry Decorators)

Daripada membungkus setiap panggilan API dengan blok `try-except` yang bersenang-senang, Anda dapat membuat dekorator utilitas untuk mendeteksi `FloodWait` dan mengulangi fungsi tersebut secara otomatis.

```python
import asyncio
from functools import wraps
from kurigram.errors import FloodWait

def auto_retry_flood():
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            while True:
                try:
                    return await func(*args, **kwargs)
                except FloodWait as e:
                    print(f"[Auto-Retry] Menangkap FloodWait sebesar {e.value} detik di fungsi {func.__name__}. Menunggu...")
                    await asyncio.sleep(e.value)
        return wrapper
    return decorator

# Contoh Penggunaan:
class BotHelper:
    def __init__(self, client):
        self.client = client

    @auto_retry_flood()
    async def post_announcement(self, chat_id: int, text: str):
        return await self.client.send_message(chat_id, text)
```

---

## 5. Pemetaan RPC Error Mentah

Saat berinteraksi dengan fungsi MTProto RPC mentah melalui `client.invoke()`, error yang terjadi akan sesuai dengan spesifikasi RPC API Telegram.

```python
from kurigram import Client
from kurigram.raw import functions
from kurigram.errors import BadRequest, Flood, Unauthorized, InternalServerError

async def invoke_raw_rpc(client: Client, channel_username: str):
    try:
        # Mencari peer berdasarkan username
        peer = await client.resolve_peer(channel_username)
        print(f"ID Peer Terpecahkan: {peer.user_id if hasattr(peer, 'user_id') else 'ID Grup/Channel'}")
    except BadRequest as e:
        print(f"Permintaan Salah (BadRequest): Pencarian entitas gagal. Detail: {e}")
    except Unauthorized as e:
        print(f"Sesi tidak sah atau kedaluwarsa (Unauthorized): {e}")
    except Flood as e:
        print(f"Kesalahan pembatasan laju (Flood): Silakan tunggu. Detail: {e}")
    except InternalServerError as e:
        print(f"Kesalahan Internal Server Telegram (InternalServerError): {e}")
```

---

## 6. Menangkap Pembaruan Mentah (`on_raw_update`)

Ketika menangani kejadian tingkat rendah atau menganalisis data MTProto langsung dari Telegram, Anda dapat menggunakan handler `@Client.on_raw_update`. Ini sangat membantu ketika melacak update yang tidak diparsing secara default oleh Kurigram atau untuk keperluan debugging tingkat lanjut.

```python
from kurigram import Client
from kurigram.types import Update

app = Client("my_account")

@app.on_raw_update()
async def handle_raw_updates(client: Client, update: Update, users: dict, chats: dict):
    # Berguna untuk debugging tipe update MTProto mentah dari Telegram
    print(f"Tipe raw update: {type(update).__name__}")
    print(f"Payload raw update: {update}")

app.run()
```
