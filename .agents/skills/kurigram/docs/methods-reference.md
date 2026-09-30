# Kurigram — Referensi Method Lengkap

> Dokumentasi ini di-generate dari source code Kurigram (branch `dev`).
> Repository: https://github.com/kurigram-org/kurigram

---

## Client Constructor & Konfigurasi

```python
from pyrogram import Client

app = Client(
    name: str,                          # Nama session (wajib)
    api_id: int | str = None,           # API ID dari my.telegram.org
    api_hash: str = None,               # API Hash dari my.telegram.org
    app_version: str = "Pyrogram x.y.z",
    device_model: str = "Python x.y",
    system_version: str = "OS x.y",
    lang_pack: str = "",
    lang_code: str = "en",
    system_lang_code: str = "en",
    ipv6: bool = False,
    proxy: dict | str = None,           # dict(scheme="socks5", hostname="...", port=1234) atau URL
    test_mode: bool = False,
    bot_token: str = None,              # Token bot dari BotFather
    session_string: str = None,         # Session string (in-memory)
    in_memory: bool = None,
    phone_number: str = None,
    phone_code: str = None,
    password: str = None,
    workers: int = min(32, cpu_count+4),
    workdir: str | Path = PARENT_DIR,
    plugins: dict = None,               # dict(root="plugins")
    parse_mode: enums.ParseMode = enums.ParseMode.DEFAULT,
    no_updates: bool = None,
    skip_updates: bool = True,
    takeout: bool = None,
    sleep_threshold: int = 10,
    hide_password: bool = False,
    max_concurrent_transmissions: int = 1,
    max_message_cache_size: int = 1000,
    max_topic_cache_size: int = 1000,
    storage_engine: Storage = None,
    client_platform: enums.ClientPlatform = enums.ClientPlatform.OTHER,
    link_preview_options: LinkPreviewOptions = None,
    fetch_replies: bool = True,         # ⚡ Kurigram-specific
    fetch_topics: bool = True,          # ⚡ Kurigram-specific
    fetch_stories: bool = True,         # ⚡ Kurigram-specific
    fetch_stickers: bool = True,        # ⚡ Kurigram-specific
    init_connection_params: dict = None,
    connection_factory: Type[Connection] = Connection,
    protocol_factory: Type[TCP] = TCPAbridged,
    loop: asyncio.AbstractEventLoop = None,
)
```

---

## Messages (Pesan)

### Mengirim Pesan

| Method | Deskripsi |
|--------|-----------|
| `send_message` | Mengirim pesan teks |
| `send_photo` | Mengirim foto |
| `send_video` | Mengirim video |
| `send_audio` | Mengirim file audio |
| `send_document` | Mengirim dokumen |
| `send_animation` | Mengirim GIF/animasi |
| `send_sticker` | Mengirim stiker |
| `send_voice` | Mengirim pesan suara |
| `send_video_note` | Mengirim video note (bulat) |
| `send_location` | Mengirim lokasi |
| `send_venue` | Mengirim venue/tempat |
| `send_contact` | Mengirim kontak |
| `send_dice` | Mengirim emoji dadu |
| `send_poll` | Mengirim polling |
| `send_media_group` | Mengirim album media |
| `send_cached_media` | Mengirim media dari cache |
| `send_web_page` | Mengirim halaman web |
| `send_chat_action` | Mengirim aksi chat (typing, dll) |

#### `send_message`
```python
async def send_message(
    chat_id: int | str,
    text: str,
    parse_mode: enums.ParseMode = None,
    entities: List[types.MessageEntity] = None,
    disable_web_page_preview: bool = None,
    link_preview_options: types.LinkPreviewOptions = None,
    disable_notification: bool = None,
    protect_content: bool = None,
    allow_paid_broadcast: bool = None,
    reply_parameters: types.ReplyParameters = None,
    schedule_date: datetime = None,
    repeat_period: int = None,
    business_connection_id: str = None,
    paid_message_star_count: int = None,
    message_effect_id: int = None,
    reply_markup: InlineKeyboardMarkup | ReplyKeyboardMarkup | ReplyKeyboardRemove | ForceReply = None,
    # Deprecated params
    message_thread_id: int = None,
    reply_to_message_id: int = None,
    quote_text: str = None,
    quote_entities: List[types.MessageEntity] = None,
) -> types.Message
```

#### `send_photo`
```python
async def send_photo(
    chat_id: int | str,
    photo: str | BinaryIO,
    caption: str = "",
    parse_mode: enums.ParseMode = None,
    caption_entities: List[types.MessageEntity] = None,
    has_spoiler: bool = None,
    ttl_seconds: int = None,
    disable_notification: bool = None,
    protect_content: bool = None,
    allow_paid_broadcast: bool = None,
    reply_parameters: types.ReplyParameters = None,
    schedule_date: datetime = None,
    repeat_period: int = None,
    business_connection_id: str = None,
    paid_message_star_count: int = None,
    message_effect_id: int = None,
    reply_markup: ... = None,
    progress: Callable = None,
    progress_args: tuple = (),
    # Deprecated params
    message_thread_id: int = None,
    reply_to_message_id: int = None,
    quote_text: str = None,
    quote_entities: List[types.MessageEntity] = None,
    file_name: str = None,
) -> types.Message
```

#### `send_media_group`
```python
async def send_media_group(
    chat_id: int | str,
    media: List[InputMediaPhoto | InputMediaVideo | InputMediaAudio | InputMediaDocument],
    disable_notification: bool = None,
    protect_content: bool = None,
    allow_paid_broadcast: bool = None,
    reply_parameters: types.ReplyParameters = None,
    schedule_date: datetime = None,
    business_connection_id: str = None,
    paid_message_star_count: int = None,
    message_effect_id: int = None,
    # Deprecated
    message_thread_id: int = None,
    reply_to_message_id: int = None,
    quote_text: str = None,
    quote_entities: List[types.MessageEntity] = None,
) -> List[types.Message]
```

### ⚡ Method Khusus Kurigram — AI

#### `compose_text_with_ai`
```python
async def compose_text_with_ai(
    chat_id: int | str,
    text: str,
    reply_to_message_id: int = None,
) -> str
```
Menggunakan AI Telegram untuk menulis/compose teks.

#### `fix_text_with_ai`
```python
async def fix_text_with_ai(
    chat_id: int | str,
    text: str,
    reply_to_message_id: int = None,
) -> str
```
Menggunakan AI Telegram untuk memperbaiki teks (grammar, spelling).

#### `summarize_message`
```python
async def summarize_message(
    chat_id: int | str,
    message_id: int,
) -> str
```
Merangkum pesan menggunakan AI Telegram.

### ⚡ Method Khusus Kurigram — Drafts & Rich Messages

#### `send_message_draft`
```python
async def send_message_draft(
    chat_id: int | str,
    text: str,
    parse_mode: enums.ParseMode = None,
    entities: List[types.MessageEntity] = None,
    disable_web_page_preview: bool = None,
    link_preview_options: types.LinkPreviewOptions = None,
    invert_media: bool = None,
    disable_notification: bool = None,
    reply_parameters: types.ReplyParameters = None,
    schedule_date: datetime = None,
    repeat_period: int = None,
    # Deprecated
    message_thread_id: int = None,
    reply_to_message_id: int = None,
    quote_text: str = None,
    quote_entities: List[types.MessageEntity] = None,
) -> types.Message
```
Mengirim pesan dari draft.

#### `send_rich_message_draft`
```python
async def send_rich_message_draft(
    chat_id: int | str,
    draft_id: int,
    rich_message: types.InputRichMessage,
    message_thread_id: int = None,
    can_stop: bool = None,
    keep_on_stop: bool = None,
) -> bool
```
Streaming draf pesan kaya ke pengguna (Bot API 10.1–10.3) saat proses komputasi berlangsung.

#### `send_rich_message`
```python
async def send_rich_message(
    chat_id: int | str,
    rich_message: types.InputRichMessage,
    disable_notification: bool = None,
    message_thread_id: int = None,
    direct_messages_topic_id: int = None,
    ephemeral_message_parameters: types.EphemeralMessageParameters = None,
    effect_id: int = None,
    reply_parameters: types.ReplyParameters = None,
    protect_content: bool = None,
    allow_paid_broadcast: bool = None,
    suggested_post_parameters: types.SuggestedPostParameters = None,
    reply_markup: types.InlineKeyboardMarkup | types.ReplyKeyboardMarkup = None,
) -> types.Message | None
```
Mengirim rich message (pesan dengan format kaya, blok native, atau pesan ephemeral).

### ⚡ Method Khusus Kurigram — Checklist

#### `send_checklist`
```python
async def send_checklist(
    chat_id: int | str,
    checklist: types.InputChecklist,
    disable_notification: bool = None,
    protect_content: bool = None,
    allow_paid_broadcast: bool = None,
    reply_parameters: types.ReplyParameters = None,
    schedule_date: datetime = None,
    repeat_period: int = None,
    business_connection_id: str = None,
    paid_message_star_count: int = None,
    reply_markup: ... = None,
) -> types.Message
```
Mengirim checklist (daftar tugas).

#### `edit_message_checklist`
```python
async def edit_message_checklist(
    chat_id: int | str,
    message_id: int,
    checklist: types.InputChecklist,
    business_connection_id: str = None,
    reply_markup: types.InlineKeyboardMarkup = None,
) -> types.Message
```
Mengedit checklist pada pesan.

#### `add_checklist_tasks`
```python
async def add_checklist_tasks(
    chat_id: int | str,
    message_id: int,
    tasks: List[types.InputChecklistTask],
) -> int
```
Menambah tugas ke checklist yang sudah ada.

#### `mark_checklist_tasks_as_done`
```python
async def mark_checklist_tasks_as_done(
    chat_id: int | str,
    message_id: int,
    task_ids: List[int],
) -> bool
```
Menandai tugas checklist sebagai selesai.

### ⚡ Method Khusus Kurigram — Suggested Posts

#### `approve_suggested_post`
```python
async def approve_suggested_post(
    chat_id: int | str,
    message_id: int,
    schedule_date: datetime = None,
) -> types.Message
```
Menyetujui post yang disarankan.

#### `decline_suggested_post`
```python
async def decline_suggested_post(
    chat_id: int | str,
    message_id: int,
) -> bool
```
Menolak post yang disarankan.

### ⚡ Method Khusus Kurigram — Direct Messages

#### `get_direct_messages_chat_topic_history`
```python
async def get_direct_messages_chat_topic_history(
    chat_id: int | str,
    topic_id: int,
    limit: int = 0,
    offset: int = 0,
    offset_id: int = 0,
    offset_date: datetime = None,
    min_id: int = 0,
    max_id: int = 0,
) -> AsyncGenerator[types.Message, None]
```
Mendapatkan riwayat pesan dari topik direct messages.

#### `delete_direct_messages_chat_topic_history`
```python
async def delete_direct_messages_chat_topic_history(
    chat_id: int | str,
    topic_id: int,
) -> bool
```
Menghapus riwayat pesan dari topik direct messages.

#### `set_direct_messages_chat_topic_is_marked_as_unread`
```python
async def set_direct_messages_chat_topic_is_marked_as_unread(
    chat_id: int | str,
    topic_id: int,
    is_marked_as_unread: bool,
) -> bool
```
Menandai topik direct messages sebagai belum dibaca.

### ⚡ Method Khusus Kurigram — Paid & Reactions

#### `send_paid_media`
```python
async def send_paid_media(
    chat_id: int | str,
    star_count: int,
    media: List[InputMediaPhoto | InputMediaVideo],
    caption: str = "",
    parse_mode: enums.ParseMode = None,
    caption_entities: List[types.MessageEntity] = None,
    show_caption_above_media: bool = None,
    disable_notification: bool = None,
    protect_content: bool = None,
    allow_paid_broadcast: bool = None,
    reply_parameters: types.ReplyParameters = None,
    schedule_date: datetime = None,
    business_connection_id: str = None,
    payload: str = None,
    reply_markup: ... = None,
) -> types.Message
```
Mengirim media berbayar (Telegram Stars).

#### `send_paid_reaction`
```python
async def send_paid_reaction(
    chat_id: int | str,
    message_id: int,
    count: int = 1,
    is_private: bool = None,
) -> bool
```
Mengirim reaksi berbayar.

#### `send_reaction`
```python
async def send_reaction(
    chat_id: int | str,
    message_id: int,
    emoji: str | int = None,
    big: bool = False,
) -> bool
```
Mengirim reaksi pada pesan.

### ⚡ Method Khusus Kurigram — Terjemahan

#### `translate_message_text`
```python
async def translate_message_text(
    chat_id: int | str,
    message_id: int,
    to_language_code: str,
) -> types.FormattedText
```
Menerjemahkan teks pesan.

#### `translate_text`
```python
async def translate_text(
    text: str | types.FormattedText,
    to_language_code: str,
    parse_mode: enums.ParseMode = None,
    entities: List[types.MessageEntity] = None,
) -> types.FormattedText
```
Menerjemahkan teks arbitrer.

### Edit Pesan

| Method | Signature |
|--------|-----------|
| `edit_message_text` | `(chat_id, message_id, text, ...)` → `Message` |
| `edit_message_caption` | `(chat_id, message_id, caption, ...)` → `Message` |
| `edit_message_media` | `(chat_id, message_id, media, ...)` → `Message` |
| `edit_message_reply_markup` | `(chat_id, message_id, reply_markup)` → `Message` |
| `edit_inline_text` | `(inline_message_id, text, ...)` → `bool` |
| `edit_inline_caption` | `(inline_message_id, caption, ...)` → `bool` |
| `edit_inline_media` | `(inline_message_id, media, ...)` → `bool` |
| `edit_inline_reply_markup` | `(inline_message_id, reply_markup)` → `bool` |

### Operasi Pesan Lainnya

| Method | Deskripsi | Return |
|--------|-----------|--------|
| `delete_messages(chat_id, message_ids, revoke)` | Menghapus pesan | `int` |
| `forward_messages(chat_id, from_chat_id, message_ids, ...)` | Meneruskan pesan | `Message \| List[Message]` |
| `forward_media_group(chat_id, from_chat_id, message_id)` | Meneruskan album media | `List[Message]` |
| `copy_message(chat_id, from_chat_id, message_id, ...)` | Menyalin pesan | `Message` |
| `copy_media_group(chat_id, from_chat_id, message_id, ...)` | Menyalin album media | `List[Message]` |
| `delete_chat_history(chat_id, max_id, revoke)` | Menghapus riwayat chat | `int` |
| `read_chat_history(chat_id, max_id)` | Menandai chat sebagai dibaca | `bool` |
| `read_mentions(chat_id)` | Menandai mentions sebagai dibaca | `bool` |
| `read_reactions(chat_id)` | Menandai reaksi sebagai dibaca | `bool` |
| `start_bot(chat_id, param)` | Memulai bot | `Message` |
| `view_messages(chat_id, message_ids)` | Melihat pesan (untuk view counter) | `bool` |
| `send_screenshot_notification(chat_id)` | Mengirim notifikasi screenshot | `Message` |

### Pencarian & Riwayat

| Method | Deskripsi | Return |
|--------|-----------|--------|
| `get_messages(chat_id, message_ids)` | Mendapatkan pesan berdasarkan ID | `Message \| List[Message]` |
| `get_media_group(chat_id, message_id)` | Mendapatkan album media | `List[Message]` |
| `get_chat_history(chat_id, limit, offset, ...)` | Mendapatkan riwayat chat | `AsyncGenerator[Message]` |
| `get_chat_history_count(chat_id)` | Menghitung jumlah pesan | `int` |
| `get_scheduled_messages(chat_id)` | Mendapatkan pesan terjadwal | `List[Message]` |
| `search_messages(chat_id, query, ...)` | Mencari pesan | `AsyncGenerator[Message]` |
| `search_messages_count(chat_id, query, ...)` | Menghitung hasil pencarian | `int` |
| `search_global(query, ...)` | Pencarian global | `AsyncGenerator[Message]` |
| `search_global_count(query, ...)` | Menghitung hasil pencarian global | `int` |
| `search_posts(hashtag, ...)` | Mencari post/hashtag | `AsyncGenerator[Message]` |
| `search_posts_count(hashtag, ...)` | Menghitung hasil pencarian post | `int` |
| `get_discussion_message(chat_id, message_id)` | Mendapatkan pesan diskusi | `Message` |
| `get_discussion_replies(chat_id, message_id, ...)` | Mendapatkan balasan diskusi | `AsyncGenerator[Message]` |
| `get_discussion_replies_count(chat_id, message_id)` | Menghitung balasan diskusi | `int` |

### Polling

| Method | Deskripsi | Return |
|--------|-----------|--------|
| `send_poll(chat_id, question, options, ...)` | Mengirim polling | `Message` |
| `vote_poll(chat_id, message_id, options)` | Memilih dalam polling | `Poll` |
| `retract_vote(chat_id, message_id)` | Menarik suara polling | `Poll` |
| `stop_poll(chat_id, message_id, ...)` | Menghentikan polling | `Poll` |
| `add_poll_option(chat_id, message_id, option)` | ⚡ Menambah opsi polling | `bool` |
| `delete_poll_option(chat_id, message_id, option)` | ⚡ Menghapus opsi polling | `bool` |

### Media & Download

| Method | Deskripsi | Return |
|--------|-----------|--------|
| `download_media(message, file_name, ...)` | Mengunduh media | `str \| BinaryIO` |
| `stream_media(message, limit, offset)` | Streaming media | `AsyncGenerator[bytes]` |
| `add_to_gifs(message)` | Menambahkan ke koleksi GIF | `bool` |
| `get_custom_emoji_stickers(custom_emoji_ids)` | Mendapatkan stiker emoji kustom | `List[Sticker]` |
| `get_stickers(short_name)` | Mendapatkan stiker dari set | `List[Sticker]` |
| `get_available_effects()` | ⚡ Mendapatkan efek pesan | `List[AvailableEffect]` |

### Web App & Lainnya

| Method | Deskripsi | Return |
|--------|-----------|--------|
| `get_web_app_url(bot_id, url, ...)` | Mendapatkan URL web app | `str` |
| `get_web_app_link_url(bot_id, short_name, ...)` | Mendapatkan URL link web app | `str` |
| `get_main_web_app(bot_id, ...)` | ⚡ Mendapatkan main web app | `...` |
| `open_web_app(bot_id, url, ...)` | ⚡ Membuka web app | `...` |
| `get_user_personal_chat_messages(user_id, ...)` | ⚡ Mendapatkan pesan personal chat | `AsyncGenerator[Message]` |

---

## Chats (Obrolan)

### Manajemen Chat

| Method | Deskripsi | Return |
|--------|-----------|--------|
| `get_chat(chat_id)` | Mendapatkan info chat | `Chat` |
| `get_dialogs(limit, ...)` | Mendapatkan daftar dialog | `AsyncGenerator[Dialog]` |
| `get_dialogs_count(...)` | Menghitung jumlah dialog | `int` |
| `join_chat(chat_id)` | Bergabung ke chat | `Chat` |
| `leave_chat(chat_id, delete)` | Meninggalkan chat | `bool` |
| `archive_chats(chat_ids)` | Mengarsipkan chat | `bool` |
| `unarchive_chats(chat_ids)` | Membatalkan arsip chat | `bool` |
| `mark_chat_unread(chat_id)` | Menandai chat belum dibaca | `bool` |
| `delete_chat_history(chat_id, ...)` | Menghapus riwayat chat | `int` |
| `delete_user_history(chat_id, user_id)` | Menghapus pesan user tertentu | `bool` |

### Buat & Hapus

| Method | Deskripsi | Return |
|--------|-----------|--------|
| `create_group(title, users)` | Membuat grup baru | `Chat` |
| `create_supergroup(title, ...)` | Membuat supergroup | `Chat` |
| `create_channel(title, ...)` | Membuat channel | `Chat` |
| `delete_channel(chat_id)` | Menghapus channel | `bool` |
| `delete_supergroup(chat_id)` | Menghapus supergroup | `bool` |

### Pengaturan Chat

| Method | Deskripsi | Return |
|--------|-----------|--------|
| `set_chat_title(chat_id, title)` | Mengatur judul chat | `Message` |
| `set_chat_description(chat_id, description)` | Mengatur deskripsi | `bool` |
| `set_chat_photo(chat_id, photo=, video=)` | Mengatur foto chat | `Message` |
| `delete_chat_photo(chat_id)` | Menghapus foto chat | `bool` |
| `set_chat_username(chat_id, username)` | Mengatur username | `bool` |
| `set_chat_permissions(chat_id, permissions)` | Mengatur izin chat | `Chat` |
| `set_chat_ttl(chat_id, ttl_seconds)` | Mengatur TTL pesan | `Message` |
| `set_chat_protected_content(chat_id, enabled)` | Mengatur konten dilindungi | `Message \| bool` |
| `set_chat_discussion_group(chat_id=, discussion_chat_id=)` | Mengatur grup diskusi | `bool` |
| `set_send_as_chat(chat_id, send_as_chat_id)` | Mengatur "kirim sebagai" | `bool` |
| `set_slow_mode(chat_id, seconds)` | Mengatur slow mode | `bool` |
| `update_chat_notifications(chat_id, ...)` | Memperbarui notifikasi | `bool` |
| `update_color(chat_id, color, background_emoji_id)` | ⚡ Memperbarui warna chat | `bool` |
| `get_chat_settings(chat_id)` | ⚡ Mendapatkan pengaturan chat | `ChatSettings` |
| `get_chat_online_count(chat_id)` | Mendapatkan jumlah online | `int` |
| `get_similar_channels(chat_id)` | ⚡ Mendapatkan channel mirip | `List[Chat]` |
| `get_suitable_discussion_chats()` | Mendapatkan chat diskusi | `...` |
| `get_top_chats()` | ⚡ Mendapatkan top chats | `...` |
| `get_send_as_chats(chat_id)` | Mendapatkan opsi "kirim sebagai" | `...` |
| `get_personal_channels()` | ⚡ Mendapatkan personal channels | `...` |

### ⚡ Direct Messages (Kurigram)

#### `set_chat_direct_messages_group`
```python
async def set_chat_direct_messages_group(
    chat_id: int | str,
    paid_message_star_count: int = 0,
    is_enabled: bool = None,
) -> bool
```
Mengatur grup direct messages untuk channel.

#### `get_direct_messages_topics`
```python
async def get_direct_messages_topics(
    chat_id: int | str,
    limit: int = 0,
    offset_id: int = 0,
    offset_date: datetime = None,
) -> AsyncGenerator[types.DirectMessagesTopic, None]
```
Mendapatkan daftar topik direct messages.

#### `get_direct_messages_topics_by_id`
```python
async def get_direct_messages_topics_by_id(
    chat_id: int | str,
    topic_ids: int | Iterable[int],
) -> DirectMessagesTopic | List[DirectMessagesTopic]
```
Mendapatkan topik direct messages berdasarkan ID.

### Anggota Chat

| Method | Deskripsi | Return |
|--------|-----------|--------|
| `get_chat_member(chat_id, user_id)` | Mendapatkan info anggota | `ChatMember` |
| `get_chat_members(chat_id, query, limit, ...)` | Mendapatkan daftar anggota | `AsyncGenerator[ChatMember]` |
| `get_chat_members_count(chat_id)` | Menghitung anggota | `int` |
| `add_chat_members(chat_id, user_ids, ...)` | Menambah anggota | `bool` |
| `ban_chat_member(chat_id, user_id, until_date)` | Memblokir anggota | `ChatMember` |
| `unban_chat_member(chat_id, user_id)` | Membuka blokir anggota | `bool` |
| `restrict_chat_member(chat_id, user_id, permissions, ...)` | Membatasi anggota | `ChatMember` |
| `promote_chat_member(chat_id, user_id, privileges)` | Mempromosikan anggota | `bool` |
| `set_administrator_title(chat_id, user_id, title)` | Mengatur judul admin | `bool` |
| `set_chat_member_tag(chat_id, user_id, tag)` | ⚡ Mengatur tag anggota | `bool` |
| `transfer_chat_ownership(chat_id, user_id, password)` | Transfer kepemilikan | `bool` |

### Forum Topics

| Method | Deskripsi | Return |
|--------|-----------|--------|
| `create_forum_topic(chat_id, title, ...)` | Membuat topik forum | `ForumTopic` |
| `edit_forum_topic(chat_id, topic_id, title, ...)` | Mengedit topik forum | `bool` |
| `close_forum_topic(chat_id, topic_id)` | Menutup topik forum | `bool` |
| `delete_forum_topic(chat_id, topic_id)` | Menghapus topik forum | `bool` |
| `get_forum_topics(chat_id, ...)` | Mendapatkan topik forum | `AsyncGenerator[ForumTopic]` |
| `get_forum_topics_by_id(chat_id, topic_ids)` | Mendapatkan topik by ID | `ForumTopic \| List` |
| `pin_forum_topic(chat_id, topic_id)` | Pin topik forum | `bool` |
| `unpin_forum_topic(chat_id, topic_id)` | Unpin topik forum | `bool` |
| `toggle_forum_topics(chat_id, is_forum, has_forum_tabs)` | Toggle mode forum | `bool` |

### Pin Pesan

| Method | Deskripsi | Return |
|--------|-----------|--------|
| `pin_chat_message(chat_id, message_id, ...)` | Pin pesan | `bool` |
| `unpin_chat_message(chat_id, message_id)` | Unpin pesan | `bool` |
| `unpin_all_chat_messages(chat_id)` | Unpin semua pesan | `bool` |

### Reaksi

| Method | Deskripsi | Return |
|--------|-----------|--------|
| `delete_all_message_reactions(chat_id, message_id)` | ⚡ Menghapus semua reaksi | `bool` |
| `delete_message_reaction(chat_id, message_id, user_id, ...)` | ⚡ Menghapus reaksi | `bool` |

### Folder

| Method | Deskripsi | Return |
|--------|-----------|--------|
| `create_folder(title, ...)` | Membuat folder | `Folder` |
| `edit_folder(folder_id, ...)` | Mengedit folder | `Folder` |
| `delete_folder(folder_id)` | Menghapus folder | `bool` |
| `get_folders()` | Mendapatkan daftar folder | `List[Folder]` |
| `reorder_folders(folder_ids)` | Mengurutkan ulang folder | `bool` |
| `toggle_folder_tags(are_tags_enabled)` | ⚡ Toggle tag folder | `bool` |
| `join_folder(invite_link)` | ⚡ Bergabung ke folder bersama | `...` |
| `leave_folder(folder_id, ...)` | ⚡ Meninggalkan folder bersama | `...` |
| `create_folder_invite_link(folder_id, ...)` | ⚡ Membuat link undangan folder | `...` |
| `delete_folder_invite_link(folder_id, invite_link)` | ⚡ Menghapus link folder | `...` |
| `get_folder_invite_links(folder_id)` | ⚡ Mendapatkan link folder | `...` |
| `get_chats_for_folder_invite_link(folder_id)` | ⚡ Mendapatkan chat untuk link folder | `...` |

### Lainnya

| Method | Deskripsi | Return |
|--------|-----------|--------|
| `set_main_profile_tab(chat_id, main_profile_tab)` | ⚡ Mengatur tab profil utama | `bool` |
| `set_upgraded_gift_colors(upgraded_gift_colors_id)` | ⚡ Mengatur warna gift upgrade | `bool` |
| `toggle_join_to_send(chat_id, enabled)` | ⚡ Toggle join-to-send | `bool` |
| `process_chat_has_protected_content_disable_request(chat_id, ...)` | ⚡ Proses permintaan disable protected content | `bool` |
| `get_chat_event_log(chat_id, ...)` | Mendapatkan log event chat | `AsyncGenerator[ChatEvent]` |

---

## Users (Pengguna)

| Method | Deskripsi | Return |
|--------|-----------|--------|
| `get_me()` | Mendapatkan info akun sendiri | `User` |
| `get_users(user_ids)` | Mendapatkan info pengguna | `User \| List[User]` |
| `get_common_chats(user_id)` | Mendapatkan chat bersama | `List[Chat]` |
| `get_chat_photos(chat_id, limit)` | Mendapatkan foto profil | `AsyncGenerator[Photo]` |
| `get_chat_photos_count(chat_id)` | Menghitung foto profil | `int` |
| `get_chat_audios(chat_id, limit)` | ⚡ Mendapatkan audio profil | `AsyncGenerator[Audio]` |
| `get_chat_audios_count(chat_id)` | ⚡ Menghitung audio profil | `int` |
| `set_profile_photo(photo, is_public)` | Mengatur foto profil | `bool` |
| `delete_profile_photos(photo_ids)` | Menghapus foto profil | `bool` |
| `set_username(username)` | Mengatur username | `bool` |
| `check_username(chat_id, username)` | Memeriksa ketersediaan username | `bool` |
| `update_profile(first_name, last_name, bio)` | Memperbarui profil | `bool` |
| `update_status(offline)` | Memperbarui status online | `bool` |
| `update_birthday(day, month, year)` | ⚡ Memperbarui tanggal lahir | `bool` |
| `block_user(user_id)` | Memblokir pengguna | `bool` |
| `unblock_user(user_id)` | Membuka blokir | `bool` |
| `set_emoji_status(chat_id, emoji_status)` | ⚡ Mengatur emoji status | `bool` |
| `get_default_emoji_statuses()` | ⚡ Mendapatkan emoji status default | `List[EmojiStatus]` |
| `set_personal_channel(chat_id)` | ⚡ Mengatur personal channel | `bool` |

---

## Stories (Cerita)

| Method | Deskripsi | Return |
|--------|-----------|--------|
| `can_post_stories(chat_id)` | Memeriksa izin posting story | `int` |
| `send_story(chat_id, media, ...)` | Mengirim story baru | `Story` |
| `copy_story(chat_id, from_chat_id, story_id, ...)` | Menyalin story | `Story` |
| `delete_stories(chat_id, story_ids)` | Menghapus story | `List[int]` |
| `edit_story_caption(chat_id, story_id, caption, ...)` | Mengedit caption story | `Story` |
| `edit_story_media(chat_id, story_id, media, ...)` | Mengedit media story | `Story` |
| `edit_story_privacy(chat_id, story_id, privacy, ...)` | Mengedit privasi story | `Story` |
| `forward_story(chat_id, from_chat_id, story_id)` | Meneruskan story | `Message` |
| `get_all_stories(next, ...)` | Mendapatkan semua story | `...` |
| `get_archived_stories(chat_id, ...)` | Mendapatkan story arsip | `...` |
| `get_chat_stories(chat_id, ...)` | Mendapatkan story dari chat | `AsyncGenerator[Story]` |
| `get_pinned_stories(chat_id, ...)` | Mendapatkan story yang di-pin | `AsyncGenerator[Story]` |
| `get_stories(chat_id, story_ids)` | Mendapatkan story tertentu | `Story \| List[Story]` |
| `get_story_views(chat_id, story_id, ...)` | Mendapatkan views story | `AsyncGenerator[StoryView]` |
| `hide_chat_stories(chat_id)` | Menyembunyikan story chat | `bool` |
| `show_chat_stories(chat_id)` | Menampilkan story chat | `bool` |
| `pin_chat_stories(chat_id, story_ids)` | Pin story | `bool` |
| `unpin_chat_stories(chat_id, story_ids)` | Unpin story | `bool` |
| `read_chat_stories(chat_id, max_id)` | Menandai story sebagai dibaca | `bool` |
| `view_stories(chat_id, story_ids)` | Melihat story | `bool` |
| `enable_stealth_mode()` | Mengaktifkan mode stealth | `...` |

#### `send_story`
```python
async def send_story(
    chat_id: int | str,
    media: str | BinaryIO,
    caption: str = None,
    parse_mode: enums.ParseMode = None,
    caption_entities: List[types.MessageEntity] = None,
    period: int = None,
    privacy: enums.StoriesPrivacyRules = None,
    allowed_users: List[int | str] = None,
    disallowed_users: List[int | str] = None,
    protect_content: bool = None,
    pinned: bool = None,
    forward_from_chat_id: int | str = None,
    forward_from_story_id: int = None,
    media_areas: List[types.MediaArea] = None,
    duration: int = 0,
    width: int = 0,
    height: int = 0,
    thumb: str | BinaryIO = None,
    supports_streaming: bool = True,
    file_name: str = None,
    progress: Callable = None,
    progress_args: tuple = (),
) -> types.Story
```

---

## Business (Bisnis)

| Method | Deskripsi | Return |
|--------|-----------|--------|
| `get_business_connection(connection_id)` | Mendapatkan koneksi bisnis | `BusinessConnection` |
| `delete_business_messages(connection_id, message_ids)` | Menghapus pesan bisnis | `bool` |
| `get_business_account_gifts(...)` | ⚡ Mendapatkan hadiah akun bisnis | `...` |
| `get_business_account_star_balance(...)` | ⚡ Mendapatkan saldo bintang bisnis | `float` |
| `transfer_business_account_stars(...)` | ⚡ Transfer bintang akun bisnis | `bool` |

---

## Payments & Gifts (Pembayaran & Hadiah)

### Gift Methods

| Method | Deskripsi | Return |
|--------|-----------|--------|
| `get_available_gifts()` | Mendapatkan semua gift yang tersedia | `List[Gift]` |
| `send_gift(chat_id, gift_id, text, ...)` | Mengirim gift ke user/channel | `Message` |
| `hide_gift(chat_id, message_id)` | Menyembunyikan gift | `bool` |
| `show_gift(chat_id, message_id)` | Menampilkan gift | `bool` |
| `convert_gift_to_stars(owned_gift_id)` | Konversi gift ke Telegram Stars | `bool` |
| `upgrade_gift(owned_gift_id, ...)` | Upgrade gift ke unique gift | `Message` |
| `transfer_gift(owned_gift_id, new_owner_chat_id, ...)` | Transfer unique gift | `Message` |
| `get_chat_gifts(chat_id, ...)` | Mendapatkan gift dari chat | `AsyncGenerator` |
| `get_chat_gifts_count(chat_id)` | Menghitung gift dari chat | `int` |
| `set_pinned_gifts(owned_gift_ids)` | ⚡ Mengatur gift yang di-pin | `bool` |
| `suggest_birthday(chat_id)` | ⚡ Menyarankan ulang tahun | `...` |

### Gift Upgrade & Collection

| Method | Deskripsi | Return |
|--------|-----------|--------|
| `buy_gift_upgrade(owned_gift_id, ...)` | ⚡ Membeli upgrade gift | `...` |
| `get_gift_upgrade_preview(gift_id)` | ⚡ Preview upgrade gift | `GiftUpgradePreview` |
| `get_gift_upgrade_variants(gift_id, ...)` | ⚡ Varian upgrade gift | `GiftUpgradeVariants` |
| `get_upgraded_gift(slug)` | ⚡ Mendapatkan unique gift | `...` |
| `get_upgraded_gift_value_info(slug)` | ⚡ Info nilai unique gift | `UpgradedGiftValueInfo` |
| `drop_gift_original_details(owned_gift_id)` | ⚡ Menghapus detail asli gift | `bool` |
| `create_gift_collection(name, ...)` | ⚡ Membuat koleksi gift | `GiftCollection` |
| `delete_gift_collection(collection_id)` | ⚡ Menghapus koleksi gift | `bool` |
| `set_gift_collection_name(collection_id, name)` | ⚡ Mengatur nama koleksi | `bool` |
| `add_collection_gifts(collection_id, gift_ids)` | ⚡ Menambah gift ke koleksi | `bool` |
| `remove_collection_gifts(collection_id, gift_ids)` | ⚡ Menghapus gift dari koleksi | `bool` |
| `reorder_collection_gifts(collection_id, gift_ids)` | ⚡ Mengurutkan gift dalam koleksi | `bool` |
| `reorder_gift_collections(collection_ids)` | ⚡ Mengurutkan koleksi | `bool` |
| `get_gift_collections(...)` | ⚡ Mendapatkan daftar koleksi | `...` |
| `get_gifts_for_crafting(...)` | ⚡ Mendapatkan gift untuk crafting | `...` |
| `craft_gift(...)` | ⚡ Membuat gift baru (crafting) | `CraftGiftResult` |

### Gift Resale & Auction

| Method | Deskripsi | Return |
|--------|-----------|--------|
| `set_gift_resale_price(owned_gift_id, price)` | ⚡ Mengatur harga jual ulang | `bool` |
| `search_gifts_for_resale(...)` | ⚡ Mencari gift untuk dijual kembali | `...` |
| `send_resold_gift(owned_gift_id, new_owner_chat_id, ...)` | ⚡ Mengirim gift yang dijual kembali | `Message` |
| `send_gift_purchase_offer(...)` | ⚡ Mengirim tawaran pembelian gift | `...` |
| `process_gift_purchase_offer(...)` | ⚡ Memproses tawaran pembelian | `...` |
| `get_gift_auction_state(gift_id)` | ⚡ Mendapatkan status lelang gift | `AuctionState` |
| `place_gift_auction_bid(...)` | ⚡ Menempatkan tawaran lelang | `...` |
| `increase_gift_auction_bid(...)` | ⚡ Meningkatkan tawaran lelang | `...` |

### Stars & Payments

| Method | Deskripsi | Return |
|--------|-----------|--------|
| `get_stars_balance(chat_id)` | Mendapatkan saldo Telegram Stars | `float` |
| `get_ton_balance(chat_id)` | ⚡ Mendapatkan saldo TON | `float` |
| `get_payment_form(chat_id, message_id)` | Mendapatkan form pembayaran | `PaymentForm` |
| `send_payment_form(chat_id, message_id, ...)` | Mengirim form pembayaran | `PaymentResult` |
| `edit_star_subscription(...)` | ⚡ Mengedit langganan Stars | `bool` |
| `reuse_star_subscription(...)` | ⚡ Menggunakan kembali langganan | `bool` |
| `check_gift_code(slug)` | Memeriksa kode hadiah | `CheckedGiftCode` |
| `apply_gift_code(slug)` | Menerapkan kode hadiah | `bool` |
| `gift_premium_with_stars(user_id, ...)` | ⚡ Memberi premium dengan Stars | `...` |

#### `send_gift`
```python
async def send_gift(
    chat_id: int | str,
    gift_id: int,
    text: str = None,
    parse_mode: enums.ParseMode = None,
    entities: List[types.MessageEntity] = None,
    is_private: bool = None,
    pay_for_upgrade: bool = None,
) -> Message | None
```

---

## Premium (Boost)

| Method | Deskripsi | Return |
|--------|-----------|--------|
| `apply_boost(chat_id)` | Menerapkan boost ke chat | `...` |
| `get_boosts_status(chat_id)` | Mendapatkan status boost | `BoostsStatus` |
| `get_boosts(chat_id, ...)` | Mendapatkan daftar boost | `AsyncGenerator[ChatBoost]` |

---

## Bots

### Callback & Query

| Method | Deskripsi | Return |
|--------|-----------|--------|
| `answer_callback_query(callback_query_id, text, ...)` | Menjawab callback query | `bool` |
| `answer_inline_query(inline_query_id, results, ...)` | Menjawab inline query | `bool` |
| `answer_web_app_query(web_app_query_id, result)` | Menjawab web app query | `SentWebAppMessage` |
| `answer_pre_checkout_query(pre_checkout_query_id, ...)` | Menjawab pre-checkout | `bool` |
| `answer_shipping_query(shipping_query_id, ...)` | Menjawab shipping query | `bool` |
| `answer_chat_join_request_query(chat_id, user_id, ...)` | Menjawab join request | `bool` |
| `answer_guest_query(...)` | ⚡ Menjawab guest query | `SentGuestMessage` |
| `request_callback_answer(chat_id, message_id, ...)` | Request callback answer | `...` |
| `get_inline_bot_results(bot_id, query, ...)` | Mendapatkan hasil inline bot | `...` |
| `send_inline_bot_result(chat_id, query_id, result_id, ...)` | Mengirim hasil inline bot | `Message` |

### Bot Management

| Method | Deskripsi | Return |
|--------|-----------|--------|
| `set_bot_commands(commands, ...)` | Mengatur perintah bot | `bool` |
| `get_bot_commands(...)` | Mendapatkan perintah bot | `List[BotCommand]` |
| `delete_bot_commands(...)` | Menghapus perintah bot | `bool` |
| `set_bot_default_privileges(privileges, for_channels)` | Mengatur hak default bot | `bool` |
| `get_bot_default_privileges(for_channels)` | Mendapatkan hak default | `ChatAdministratorRights` |
| `set_bot_name(name, language_code, for_my_bot)` | Mengatur nama bot | `str` |
| `get_bot_name(language_code, for_my_bot)` | Mendapatkan nama bot | `str` |
| `set_bot_info_description(description, ...)` | Mengatur deskripsi bot | `bool` |
| `get_bot_info_description(...)` | Mendapatkan deskripsi bot | `str` |
| `set_bot_info_short_description(short_description, ...)` | Mengatur deskripsi pendek | `bool` |
| `get_bot_info_short_description(...)` | Mendapatkan deskripsi pendek | `str` |
| `set_chat_menu_button(chat_id, menu_button)` | Mengatur tombol menu | `bool` |
| `get_chat_menu_button(chat_id)` | Mendapatkan tombol menu | `MenuButton` |

### ⚡ Managed Bots (Kurigram)

| Method | Deskripsi | Return |
|--------|-----------|--------|
| `check_bot_username(username)` | ⚡ Memeriksa username bot | `bool` |
| `create_bot(username, ...)` | ⚡ Membuat bot baru | `...` |
| `get_owned_bots()` | ⚡ Mendapatkan daftar bot yang dimiliki | `...` |
| `get_managed_bot_token(bot_id)` | ⚡ Mendapatkan token managed bot | `str` |
| `replace_managed_bot_token(bot_id)` | ⚡ Mengganti token managed bot | `str` |
| `get_managed_bot_access_settings(user_id)` | ⚡ Mendapatkan pengaturan akses | `BotAccessSettings` |
| `set_managed_bot_access_settings(user_id, is_access_restricted, added_user_ids)` | ⚡ Mengatur pengaturan akses | `bool` |

### Payments (Bot)

| Method | Deskripsi | Return |
|--------|-----------|--------|
| `send_invoice(chat_id, title, description, payload, ...)` | Mengirim invoice | `Message` |
| `create_invoice_link(title, description, payload, ...)` | Membuat link invoice | `str` |
| `refund_star_payment(user_id, telegram_payment_charge_id)` | Mengembalikan pembayaran Stars | `bool` |
| `edit_user_star_subscription(user_id, telegram_payment_charge_id, is_canceled)` | ⚡ Mengedit langganan Stars user | `bool` |
| `send_game(chat_id, game_short_name, ...)` | Mengirim game | `Message` |
| `set_game_score(user_id, score, ...)` | Mengatur skor game | `Message \| bool` |
| `get_game_high_scores(user_id, chat_id, message_id)` | Mendapatkan skor tinggi | `List[GameHighScore]` |
| `send_chat_join_request_web_app(...)` | ⚡ Kirim join request web app | `...` |

---

## Account (Akun)

| Method | Deskripsi | Return |
|--------|-----------|--------|
| `get_account_ttl()` | Mendapatkan TTL akun | `int` |
| `set_account_ttl(days)` | Mengatur TTL akun | `bool` |
| `get_global_privacy_settings()` | Mendapatkan pengaturan privasi global | `GlobalPrivacySettings` |
| `set_global_privacy_settings(...)` | Mengatur pengaturan privasi global | `GlobalPrivacySettings` |
| `get_privacy(key)` | Mendapatkan aturan privasi | `...` |
| `set_privacy(key, rules)` | Mengatur aturan privasi | `...` |
| `set_inactive_session_ttl(inactive_session_ttl_days)` | ⚡ Mengatur TTL sesi tidak aktif | `bool` |
| `add_profile_audio(audio, ...)` | ⚡ Menambah audio profil | `...` |
| `remove_profile_audio(file_id)` | ⚡ Menghapus audio profil | `...` |
| `set_profile_audio_position(file_id, after_file_id)` | ⚡ Mengatur posisi audio profil | `...` |

#### `set_global_privacy_settings`
```python
async def set_global_privacy_settings(
    archive_and_mute_new_chats: bool = None,
    keep_unmuted_chats_archived: bool = None,
    keep_chats_from_folders_archived: bool = None,
    show_read_date: bool = None,
    allow_new_chats_from_unknown_users: bool = None,
    incoming_paid_message_star_count: int = None,  # ⚡
    show_gift_button: bool = None,                  # ⚡
    accepted_gift_types: types.AcceptedGiftTypes = None,  # ⚡
) -> types.GlobalPrivacySettings
```

---

## Contacts (Kontak)

| Method | Deskripsi | Return |
|--------|-----------|--------|
| `add_contact(user_id, first_name, last_name, phone_number, share_phone_number, note)` | Menambah kontak | `...` |
| `delete_contacts(user_ids)` | Menghapus kontak | `User \| List[User]` |
| `get_contacts()` | Mendapatkan daftar kontak | `List[User]` |
| `get_contacts_count()` | Menghitung jumlah kontak | `int` |
| `get_blocked_message_senders(block_list, offset, limit)` | ⚡ Mendapatkan pengirim diblokir | `AsyncGenerator[Chat]` |
| `import_contacts(contacts)` | Mengimpor kontak | `...` |
| `search_contacts(query, limit)` | Mencari kontak | `FoundContacts` |
| `set_contact_note(user_id, note)` | ⚡ Mengatur catatan kontak | `...` |

---

## Invite Links (Link Undangan)

| Method | Deskripsi | Return |
|--------|-----------|--------|
| `create_chat_invite_link(chat_id, name, expire_date, member_limit, creates_join_request)` | Membuat link undangan | `ChatInviteLink` |
| `edit_chat_invite_link(chat_id, invite_link, ...)` | Mengedit link undangan | `ChatInviteLink` |
| `revoke_chat_invite_link(chat_id, invite_link)` | Mencabut link undangan | `ChatInviteLink` |
| `delete_chat_invite_link(chat_id, invite_link)` | Menghapus link undangan | `bool` |
| `export_chat_invite_link(chat_id)` | Mengekspor link undangan | `ChatInviteLink` |
| `get_chat_invite_link(chat_id, invite_link)` | Mendapatkan info link | `ChatInviteLink` |
| `get_chat_invite_link_joiners(chat_id, invite_link, limit)` | Mendapatkan yang bergabung via link | `AsyncGenerator[ChatJoiner]` |
| `get_chat_invite_link_joiners_count(chat_id, invite_link)` | Menghitung yang bergabung | `int` |
| `get_chat_admin_invite_links(chat_id, admin_id, revoked, limit)` | Mendapatkan link admin | `AsyncGenerator[ChatInviteLink]` |
| `get_chat_admin_invite_links_count(chat_id, admin_id, revoked)` | Menghitung link admin | `int` |
| `get_chat_admins_with_invite_links(chat_id)` | Mendapatkan admin dengan link | `...` |
| `delete_chat_admin_invite_links(chat_id, admin_id)` | Menghapus link admin | `bool` |
| `approve_chat_join_request(chat_id, user_id)` | Menyetujui permintaan bergabung | `bool` |
| `decline_chat_join_request(chat_id, user_id)` | Menolak permintaan bergabung | `bool` |
| `approve_all_chat_join_requests(chat_id, invite_link)` | Menyetujui semua permintaan | `bool` |
| `decline_all_chat_join_requests(chat_id, invite_link)` | Menolak semua permintaan | `bool` |
| `get_chat_join_requests(chat_id, limit, query)` | Mendapatkan permintaan bergabung | `AsyncGenerator[ChatJoiner]` |

---

## Phone (Telepon)

| Method | Deskripsi | Return |
|--------|-----------|--------|
| `get_call_members(chat_id, limit)` | ⚡ Mendapatkan peserta panggilan | `AsyncGenerator[GroupCallMember]` |

---

## Auth (Autentikasi)

| Method | Deskripsi | Return |
|--------|-----------|--------|
| `send_phone_number_code(phone_number, settings, type, ...)` | Mengirim kode verifikasi | `SentCode` |
| `resend_phone_number_code(phone_number, phone_code_hash)` | Kirim ulang kode | `SentCode` |
| `sign_in(phone_number, phone_code_hash, phone_code)` | Login dengan kode | `User \| TermsOfService \| bool` |
| `sign_in_bot(bot_token)` | Login sebagai bot | `User` |
| `sign_up(phone_number, phone_code_hash, first_name, last_name)` | Mendaftar akun baru | `User` |
| `check_password(password)` | Memeriksa password 2FA | `User` |
| `recover_password(recovery_code)` | Memulihkan password | `User` |
| `send_recovery_code()` | Mengirim kode pemulihan | `str` |
| `accept_terms_of_service(terms_of_service_id)` | Menerima ToS | `bool` |
| `change_phone_number(phone_number, phone_code_hash, phone_code)` | Mengubah nomor telepon | `User` |
| `get_active_sessions()` | Mendapatkan sesi aktif | `ActiveSessions` |
| `get_password_hint()` | Mendapatkan hint password | `str` |
| `log_out()` | Logout | `None` |
| `reset_session(id)` | Mereset sesi tertentu | `bool` |
| `reset_sessions()` | Mereset semua sesi | `bool` |
| `connect()` | Terhubung ke Telegram | `bool` |
| `disconnect()` | Terputus dari Telegram | `None` |
| `initialize()` | Inisialisasi client | `None` |
| `terminate(clear_handlers)` | Terminasi client | `None` |

---

## Password (Kata Sandi)

| Method | Deskripsi | Return |
|--------|-----------|--------|
| `enable_cloud_password(password, hint, email)` | Mengaktifkan password cloud | `bool` |
| `change_cloud_password(current_password, new_password, new_hint)` | Mengubah password cloud | `bool` |
| `remove_cloud_password(password)` | Menghapus password cloud | `bool` |

---

## Advanced (Lanjutan)

| Method | Deskripsi | Return |
|--------|-----------|--------|
| `invoke(query, retries, timeout, ...)` | Menjalankan raw TL function | `ReturnType` |
| `resolve_peer(peer_id)` | Menyelesaikan peer | `InputPeer` |
| `save_file(path, ...)` | Menyimpan file ke Telegram | `InputFile` |
| `recover_gaps()` | ⚡ Memulihkan gap updates | `Tuple[int, int]` |

---

## Utilities (Utilitas)

| Method | Deskripsi | Return |
|--------|-----------|--------|
| `start(use_qr, except_ids)` | Memulai client | `Client` |
| `stop(block, clear_handlers)` | Menghentikan client | `Client` |
| `restart(block, clear_handlers)` | Memulai ulang client | `Client` |
| `run(use_qr, except_ids)` | Menjalankan client (blocking) | `None` |
| `add_handler(handler, group)` | Menambah handler | `Tuple[Handler, int]` |
| `remove_handler(handler, group)` | Menghapus handler | `None` |
| `export_session_string()` | Mengekspor session string | `str` |
| `stop_transmission()` | Menghentikan transmisi | `None` |

---

> **Catatan:** Method yang ditandai dengan ⚡ adalah fitur unik Kurigram yang tidak tersedia di Pyrogram standar.
