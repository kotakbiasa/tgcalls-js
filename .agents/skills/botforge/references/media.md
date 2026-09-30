---
name: media
description: Complete reference documentation and practical guide.
---

# Media — Photos, Videos, Media Groups, Voice, Stickers

Работа с медиа в aiogram 3: загрузка, отправка, `file_id` reuse, альбомы.

## 1. Типы медиа (Bot API)

| Тип | Метод | Макс. размер | Обработчик |
|---|---|---|---|
| Photo | `send_photo` | 10 MB | `F.photo` |
| Video | `send_video` | 50 MB / 2 GB local | `F.video` |
| Animation (GIF/MP4) | `send_animation` | 50 MB | `F.animation` |
| Audio (MP3) | `send_audio` | 50 MB | `F.audio` |
| Voice (OGG Opus) | `send_voice` | 50 MB | `F.voice` |
| Video note (круглое) | `send_video_note` | 50 MB | `F.video_note` |
| Document | `send_document` | 50 MB / 2 GB local | `F.document` |
| Sticker | `send_sticker` | — | `F.sticker` |
| Media group (album) | `send_media_group` | до 10 items | `F.media_group_id` |
| Live Photo (Bot API 10.0+) | `sendLivePhoto` / aiogram wrapper if available | verify current Bot API limits | `F.live_photo` if available |

Лимиты Cloud Bot API: upload 50 MB, download 20 MB. Для больших — Local Bot API server (2 GB).

## 2. File reuse через `file_id`

```python
# Первая отправка — загрузка
from aiogram.types import FSInputFile

msg = await bot.send_photo(chat_id, photo=FSInputFile("banner.jpg"))
file_id = msg.photo[-1].file_id     # берём самое большое разрешение

# Далее — передавать file_id, Telegram сам берёт из CDN
await bot.send_photo(other_chat, photo=file_id)
```

**Стратегия:** при первой загрузке сохраняем `file_id` в БД (`content_items.media_file_id`). Последующие отправки — моментальные.

`file_id` живёт вечно, пока существует исходное сообщение И бот не поменял токен. При ротации BOT_TOKEN `file_id` становятся невалидными → перезагрузка.

## 3. Media groups (albums)

```python
from aiogram.types import InputMediaPhoto, InputMediaVideo

await bot.send_media_group(chat_id, media=[
    InputMediaPhoto(media=file_id_1, caption="Caption only on first"),
    InputMediaPhoto(media=file_id_2),
    InputMediaVideo(media=file_id_3),
])
```

Constraints:
- 2..10 items
- Все photo+video в одной группе ИЛИ все audio ИЛИ все document — не миксуются
- Caption — только на первом элементе (или на каждом, но видится только один)
- Bot API 10.0+ adds live photos in media groups. Bot API 10.2 adds Rich Message media bindings (`InputRichMessageMedia` with `file_id`, URL, and `attach://` multipart upload). Before generating aiogram typed code, verify the installed aiogram version exposes `LivePhoto`/`InputMediaLivePhoto`; otherwise isolate raw Bot API calls in an integration helper with tests.

## 4. Handling incoming media groups

Media group приходит как N отдельных message update-ов с одним `media_group_id`. BotForge pattern — буферизация:

```python
# app/middlewares/album.py
import asyncio
from aiogram import BaseMiddleware

class AlbumMiddleware(BaseMiddleware):
    def __init__(self, delay: float = 0.3) -> None:
        self._delay = delay
        self._buffer: dict[str, list] = {}

    async def __call__(self, handler, event, data):
        mgi = getattr(event, "media_group_id", None)
        if mgi is None:
            return await handler(event, data)

        buf = self._buffer.setdefault(mgi, [])
        buf.append(event)
        if len(buf) > 1:
            return  # ждём первый и всё соберёт

        await asyncio.sleep(self._delay)
        collected = self._buffer.pop(mgi, [])
        data["album"] = collected
        return await handler(event, data)
```

## 5. Handling media uploads from users

```python
from aiogram import F, Router
from aiogram.types import Message, PhotoSize

router = Router()

@router.message(F.photo)
async def on_photo(message: Message):
    photo: PhotoSize = message.photo[-1]
    # Скачать для обработки (OCR, модерация)
    file = await message.bot.get_file(photo.file_id)
    await message.bot.download_file(file.file_path, f"/tmp/{photo.file_unique_id}.jpg")
```

**Для > 20 MB** — Local Bot API server:
```yaml
# docker-compose.yml
bot-api-server:
  image: aiogram/telegram-bot-api:latest
  environment:
    TELEGRAM_API_ID: ${TELEGRAM_API_ID}
    TELEGRAM_API_HASH: ${TELEGRAM_API_HASH}
  ports:
    - "8081:8081"
```

```python
# app/__main__.py
from aiogram.client.session.aiohttp import AiohttpSession
from aiogram.client.telegram import TelegramAPIServer

session = AiohttpSession(api=TelegramAPIServer.from_base("http://bot-api-server:8081"))
bot = Bot(token=settings.bot_token, session=session)
```

## 6. Validation user uploads

```python
ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp"}
MAX_FILE_SIZE = 5 * 1024 * 1024

@router.message(F.document)
async def on_document(message: Message):
    doc = message.document
    if doc.file_size > MAX_FILE_SIZE:
        await message.reply("Файл слишком большой")
        return
    if doc.mime_type not in ALLOWED_MIME:
        await message.reply("Тип файла не поддерживается")
        return
    ...
```

## 7. Captions

- Max **1024 UTF-16 code units**
- Supports `parse_mode` (HTML / MarkdownV2)
- `caption_entities` — массив `MessageEntity` если программно размечаете

Для длинных постов — caption + продолжение в следующем сообщении.

## 8. Stickers и sticker sets

```python
# Отправка
await bot.send_sticker(chat_id, sticker=sticker_file_id)

# Создать собственный набор
await bot.create_new_sticker_set(
    user_id=owner_id,
    name=f"pack_{bot.username}",       # должен заканчиваться на _<bot_username>
    title="My Pack",
    stickers=[InputSticker(sticker=FSInputFile("sticker.png"),
                           emoji_list=["🚀"])],
    sticker_format="static",           # or "animated" / "video"
)
```

## 9. Voice/Video notes (ASR integration)

```python
@router.message(F.voice)
async def on_voice(message: Message, asr_service):
    file = await message.bot.get_file(message.voice.file_id)
    audio_path = f"/tmp/{message.voice.file_unique_id}.ogg"
    await message.bot.download_file(file.file_path, audio_path)

    text = await asr_service.transcribe(audio_path)   # Whisper API
    await message.reply(f"Распознано: {text}")
```

## 10. Performance tips

- Всегда используйте `file_id` для повторных отправок
- Для каталогов — предзагрузите `file_id` через админ-upload раз, храните в БД
- Media groups быстрее, чем N отдельных `send_photo`
- `FSInputFile` → буферизуется в памяти; для больших файлов `BufferedInputFile` или `URLInputFile`

## 11. Security

- [ ] Validate mime/size user uploads
- [ ] Scan на malware (ClamAV) для публичных ботов, принимающих документы
- [ ] Не выдавайте `file_path` напрямую пользователям — это даёт доступ к файлу на серверах Telegram без авторизации
- [ ] Для user-uploaded media, сохраняемой на ваш сервер — отдельный volume с ограничением размера
- [ ] Для Local Bot API: ограничьте доступ к `/var/lib/telegram-bot-api/` — там хранятся все медиа
