# Kurigram — Referensi Handlers & Filters

> Dokumentasi ini di-generate dari source code Kurigram (branch `dev`).
> Repository: https://github.com/kurigram-org/kurigram

---

## Handlers

Handler digunakan untuk menangani update dari Telegram. Setiap handler menangani tipe update tertentu.

### Cara Penggunaan

```python
from pyrogram import Client, filters
from pyrogram.handlers import MessageHandler

app = Client("my_account")

# Cara 1: Menggunakan decorator
@app.on_message(filters.text)
async def handler(client, message):
    await message.reply("Halo!")

# Cara 2: Menggunakan add_handler
async def handler(client, message):
    await message.reply("Halo!")

app.add_handler(MessageHandler(handler, filters.text))
```

### Daftar Handler

| Handler | Decorator | Update Type | Deskripsi |
|---------|-----------|-------------|-----------|
| `MessageHandler` | `@app.on_message` | `Message` | Pesan masuk baru |
| `EditedMessageHandler` | `@app.on_edited_message` | `Message` | Pesan yang diedit |
| `DeletedMessagesHandler` | `@app.on_deleted_messages` | `List[Message]` | Pesan yang dihapus |
| `CallbackQueryHandler` | `@app.on_callback_query` | `CallbackQuery` | Callback dari inline keyboard |
| `InlineQueryHandler` | `@app.on_inline_query` | `InlineQuery` | Inline query masuk |
| `ChosenInlineResultHandler` | `@app.on_chosen_inline_result` | `ChosenInlineResult` | Hasil inline yang dipilih |
| `ChatMemberUpdatedHandler` | `@app.on_chat_member_updated` | `ChatMemberUpdated` | Update anggota chat |
| `ChatJoinRequestHandler` | `@app.on_chat_join_request` | `ChatJoinRequest` | Permintaan bergabung |
| `UserStatusHandler` | `@app.on_user_status` | `User` | Perubahan status online |
| `PollHandler` | `@app.on_poll` | `Poll` | Update polling |
| `StoryHandler` | `@app.on_story` | `Story` | ⚡ Story baru |
| `MessageReactionHandler` | `@app.on_message_reaction` | `MessageReactionUpdated` | ⚡ Reaksi pesan |
| `MessageReactionCountHandler` | `@app.on_message_reaction_count` | `MessageReactionCountUpdated` | ⚡ Jumlah reaksi |
| `ChatBoostHandler` | `@app.on_chat_boost` | `ChatBoostUpdated` | ⚡ Boost chat |
| `BusinessConnectionHandler` | `@app.on_business_connection` | `BusinessConnection` | ⚡ Koneksi bisnis |
| `BusinessMessageHandler` | `@app.on_business_message` | `Message` | ⚡ Pesan bisnis masuk |
| `EditedBusinessMessageHandler` | `@app.on_edited_business_message` | `Message` | ⚡ Pesan bisnis diedit |
| `DeletedBusinessMessagesHandler` | `@app.on_deleted_business_messages` | `List[Message]` | ⚡ Pesan bisnis dihapus |
| `GuestMessageHandler` | `@app.on_guest_message` | `Message` | ⚡ Pesan guest |
| `ManagedBotUpdatedHandler` | `@app.on_managed_bot` | `ManagedBotUpdated` | ⚡ Update managed bot |
| `PreCheckoutQueryHandler` | `@app.on_pre_checkout_query` | `PreCheckoutQuery` | ⚡ Pre-checkout query |
| `ShippingQueryHandler` | `@app.on_shipping_query` | `ShippingQuery` | ⚡ Shipping query |
| `PurchasedPaidMediaHandler` | `@app.on_purchased_paid_media` | `PurchasedPaidMedia` | ⚡ Media berbayar dibeli |
| `ErrorHandler` | `@app.on_error` | `Exception` | ⚡ Error handler |
| `RawUpdateHandler` | `@app.on_raw_update` | raw update | Update mentah (TL) |
| `ConnectHandler` | `@app.on_connect` | — | Client terhubung |
| `DisconnectHandler` | `@app.on_disconnect` | — | Client terputus |
| `StartHandler` | `@app.on_start` | — | Client dimulai |
| `StopHandler` | `@app.on_stop` | — | Client dihentikan |

### Decorator Signatures

```python
# Paling umum — dengan filter dan group
@app.on_message(filters=None, group=0)
@app.on_edited_message(filters=None, group=0)
@app.on_deleted_messages(filters=None, group=0)
@app.on_callback_query(filters=None, group=0)
@app.on_inline_query(filters=None, group=0)
@app.on_chosen_inline_result(filters=None, group=0)
@app.on_chat_member_updated(filters=None, group=0)
@app.on_chat_join_request(filters=None, group=0)
@app.on_user_status(filters=None, group=0)
@app.on_poll(filters=None, group=0)
@app.on_story(filters=None, group=0)
@app.on_message_reaction(filters=None, group=0)
@app.on_message_reaction_count(filters=None, group=0)
@app.on_chat_boost(filters=None, group=0)
@app.on_business_connection(filters=None, group=0)
@app.on_business_message(filters=None, group=0)
@app.on_edited_business_message(filters=None, group=0)
@app.on_deleted_business_messages(filters=None, group=0)
@app.on_guest_message(filters=None, group=0)
@app.on_managed_bot(filters=None, group=0)
@app.on_pre_checkout_query(filters=None, group=0)
@app.on_shipping_query(filters=None, group=0)
@app.on_purchased_paid_media(filters=None, group=0)
@app.on_raw_update(filters=None, group=0)

# Error handler — dengan exceptions filter
@app.on_error(exceptions=None, filters=None, group=0)

# Lifecycle — tanpa parameter
@app.on_connect()
@app.on_disconnect()
@app.on_start()
@app.on_stop()
```

---

## Filters

Filter digunakan untuk menyaring update yang ingin ditangani. Tersedia melalui `from pyrogram import filters`.

### Operator Filter

```python
# Kombinasi AND
filters.text & filters.private

# Kombinasi OR
filters.photo | filters.video

# Negasi (NOT)
~filters.bot

# Kombinasi kompleks
(filters.text | filters.caption) & filters.private & ~filters.bot
```

### Filter Bawaan

#### Tipe Pesan

| Filter | Deskripsi |
|--------|-----------|
| `filters.all` | Semua pesan |
| `filters.text` | Pesan teks (non-media) |
| `filters.caption` | Pesan dengan caption |
| `filters.reply` | Pesan yang merupakan balasan |
| `filters.forwarded` | Pesan yang diteruskan |
| `filters.service` | Pesan layanan |
| `filters.media` | Pesan media (foto, video, audio, dll) |
| `filters.scheduled` | Pesan terjadwal |
| `filters.from_scheduled` | Pesan dari jadwal |
| `filters.self_destruction` | Pesan self-destructing |

#### Tipe Media

| Filter | Deskripsi |
|--------|-----------|
| `filters.photo` | Foto |
| `filters.video` | Video |
| `filters.audio` | Audio |
| `filters.document` | Dokumen |
| `filters.animation` | Animasi/GIF |
| `filters.sticker` | Stiker |
| `filters.voice` | Pesan suara |
| `filters.video_note` | Video note |
| `filters.contact` | Kontak |
| `filters.location` | Lokasi |
| `filters.live_location` | Lokasi langsung |
| `filters.venue` | Venue/tempat |
| `filters.web_page` | Halaman web |
| `filters.poll` | Polling |
| `filters.dice` | Dadu |
| `filters.game` | Game |
| `filters.media_group` | Grup media (album) |
| `filters.media_spoiler` | Media dengan spoiler |
| `filters.story` | ⚡ Story |

#### Tipe Chat

| Filter | Deskripsi |
|--------|-----------|
| `filters.private` | Chat privat |
| `filters.group` | Grup (group + supergroup) |
| `filters.channel` | Channel |
| `filters.direct` | ⚡ Direct messages |
| `filters.forum` | ⚡ Forum (supergroup dengan forum) |

#### Pengirim & Penerima

| Filter | Deskripsi |
|--------|-----------|
| `filters.me` | Pesan dari akun sendiri |
| `filters.bot` | Pesan dari bot |
| `filters.sender_chat` | Pesan dari chat sebagai pengirim |
| `filters.incoming` | Pesan masuk |
| `filters.outgoing` | Pesan keluar |
| `filters.mentioned` | Pesan yang menyebut Anda |
| `filters.via_bot` | Pesan via inline bot |
| `filters.admin` | Pesan dari admin |
| `filters.linked_channel` | ⚡ Pesan dari linked channel |

#### Event Chat

| Filter | Deskripsi |
|--------|-----------|
| `filters.new_chat_members` | Anggota baru bergabung |
| `filters.left_chat_member` | Anggota meninggalkan chat |
| `filters.new_chat_title` | Judul chat berubah |
| `filters.new_chat_photo` | Foto chat berubah |
| `filters.delete_chat_photo` | Foto chat dihapus |
| `filters.group_chat_created` | Grup dibuat |
| `filters.supergroup_chat_created` | Supergroup dibuat |
| `filters.channel_chat_created` | Channel dibuat |
| `filters.migrate_to_chat_id` | Migrasi ke chat ID baru |
| `filters.migrate_from_chat_id` | Migrasi dari chat ID lama |
| `filters.pinned_message` | Pesan di-pin |
| `filters.game_high_score` | Skor tinggi game |
| `filters.video_chat_started` | ⚡ Video chat dimulai |
| `filters.video_chat_ended` | ⚡ Video chat berakhir |
| `filters.video_chat_members_invited` | ⚡ Anggota diundang ke video chat |
| `filters.successful_payment` | ⚡ Pembayaran berhasil |

#### Keyboard

| Filter | Deskripsi |
|--------|-----------|
| `filters.reply_keyboard` | Pesan memiliki reply keyboard |
| `filters.inline_keyboard` | Pesan memiliki inline keyboard |

#### ⚡ Kurigram-specific Filters

| Filter | Deskripsi |
|--------|-----------|
| `filters.business` | ⚡ Pesan bisnis |
| `filters.giveaway` | ⚡ Giveaway |
| `filters.giveaway_winners` | ⚡ Pemenang giveaway |
| `filters.gift_code` | ⚡ Kode hadiah |
| `filters.gift` | ⚡ Gift/hadiah |
| `filters.users_shared` | ⚡ Users dibagikan |
| `filters.chat_shared` | ⚡ Chat dibagikan |
| `filters.quote` | ⚡ Pesan memiliki kutipan |
| `filters.paid_message` | ⚡ Pesan berbayar |
| `filters.gift_offer` | ⚡ Tawaran gift |
| `filters.gift_offer_accepted` | ⚡ Tawaran gift diterima |
| `filters.gift_offer_rejected` | ⚡ Tawaran gift ditolak |

### Filter Dinamis

#### `filters.command`

```python
filters.command(
    commands: str | List[str],
    prefixes: str | List[str] = "/",
    case_sensitive: bool = False,
)
```

Menyaring perintah bot.

```python
# Satu perintah
@app.on_message(filters.command("start"))

# Beberapa perintah
@app.on_message(filters.command(["start", "help"]))

# Custom prefix
@app.on_message(filters.command("start", prefixes=["!", "/"]))

# Case sensitive
@app.on_message(filters.command("Start", case_sensitive=True))
```

#### `filters.regex`

```python
filters.regex(
    pattern: str | Pattern,
    flags: int = 0,
)
```

Menyaring teks menggunakan regex.

```python
@app.on_message(filters.regex(r"^hello", re.IGNORECASE))
```

#### `filters.user`

```python
filters.user(users: int | str | List[int | str])
```

Menyaring berdasarkan user ID atau username.

```python
@app.on_message(filters.user(123456789))
@app.on_message(filters.user("username"))
@app.on_message(filters.user([123, 456, "username"]))

# Bisa diperbarui secara dinamis
f = filters.user()
f.add(123456789)
f.remove(123456789)
```

#### `filters.chat`

```python
filters.chat(chats: int | str | List[int | str])
```

Menyaring berdasarkan chat ID atau username.

```python
@app.on_message(filters.chat(-1001234567890))
@app.on_message(filters.chat("channel_username"))
@app.on_message(filters.chat([-100123, -100456]))

# Bisa diperbarui secara dinamis
f = filters.chat()
f.add(-1001234567890)
```

#### `filters.topic`

```python
filters.topic(topics: int | List[int])
```

Menyaring berdasarkan topic ID (forum).

```python
@app.on_message(filters.topic(123))
```

### Membuat Filter Kustom

```python
from pyrogram import filters

# Filter fungsi
@filters.create
async def my_filter(_, __, message):
    return message.text and "hello" in message.text.lower()

@app.on_message(my_filter)
async def handler(client, message):
    await message.reply("Halo juga!")

# Filter dengan nama
my_filter = filters.create(
    lambda _, __, m: m.text and len(m.text) > 100,
    name="LongTextFilter"
)

# Kombinasi
@app.on_message(filters.private & my_filter)
async def handler(client, message):
    pass
```

---

## Contoh Lengkap

### Bot Echo Sederhana

```python
from pyrogram import Client, filters

app = Client("my_bot", bot_token="TOKEN")

@app.on_message(filters.private & filters.text)
async def echo(client, message):
    await message.reply(message.text)

app.run()
```

### Handler Reaksi

```python
@app.on_message_reaction()
async def reaction_handler(client, reaction):
    print(f"Reaksi dari {reaction.user.first_name}: {reaction.new_reaction}")
```

### Handler Bisnis

```python
@app.on_business_message(filters.text)
async def business_handler(client, message):
    await message.reply("Terima kasih atas pesan Anda!")

@app.on_business_connection()
async def connection_handler(client, connection):
    print(f"Koneksi bisnis baru: {connection.id}")
```

### Handler Pre-Checkout

```python
@app.on_pre_checkout_query()
async def pre_checkout(client, query):
    await query.answer(ok=True)
```

### Multiple Groups

```python
# Group 0 berjalan pertama
@app.on_message(filters.text, group=0)
async def logging(client, message):
    print(f"Log: {message.text}")

# Group 1 berjalan setelahnya
@app.on_message(filters.command("start"), group=1)
async def start(client, message):
    await message.reply("Selamat datang!")
```

---

> **Catatan:** Handler dan filter yang ditandai dengan ⚡ adalah fitur unik Kurigram yang tidak tersedia di Pyrogram standar.
