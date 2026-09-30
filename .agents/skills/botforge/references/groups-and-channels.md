---
name: groups-and-channels
description: Complete reference documentation and practical guide.
---

# Groups, Channels, Forum Topics — Reference

Работа бота в группах и каналах. Крайне нюансированная область: privacy mode, admin rights, forum topics, chat join requests.

## 1. Bot в группе vs в канале

| | Group / Supergroup | Channel |
|---|---|---|
| Добавление | как участник | только как админ |
| Получает сообщения | если privacy off ИЛИ reply/command | только `channel_post` updates |
| Отвечать обычными сообщениями | да | нет (только через `send_message`) |
| Ограничения | 20 msg/min (rate limit) | публикация через `send_message(chat_id=...)` |
| Kick users | если админ | N/A |

## 2. Privacy mode

BotFather `/setprivacy`:
- **ENABLED** (default) — бот видит только команды (`/cmd`), reply к своим сообщениям, упоминания `@botname`
- **DISABLED** — бот видит ВСЕ сообщения в группе

BotForge rule: документируйте режим в ADR и README. Изменение режима применяется только в **новых** группах; старые — нужно бота перевключить.

## 3. Admin rights matrix

Нужные права для бота (устанавливаются в настройках группы админом):

| Feature | Нужные права |
|---|---|
| Удалять сообщения | `can_delete_messages` |
| Банить | `can_restrict_members` |
| Пинить сообщения | `can_pin_messages` |
| Постинг в канал | `can_post_messages` (для channel) |
| Управление topics | `can_manage_topics` (для forum) |
| Добавлять админов | `can_promote_members` |
| Видеть chat_member events | privacy OFF + admin |

Проверка:
```python
me = await bot.get_chat_member(chat_id, bot.id)
if not me.can_delete_messages:
    await message.reply("Дайте мне право удалять сообщения")
    return
```

## 4. Events специфичные для групп/каналов

```python
# aiogram 3
allowed_updates = [
    "message",
    "edited_message",
    "channel_post",            # посты в канале
    "edited_channel_post",
    "my_chat_member",          # бот добавлен/удалён/повышен
    "chat_member",              # любой пользователь вступил/вышел (нужен privacy OFF)
    "chat_join_request",       # запрос на вступление (invite link с approval)
]
```

**`my_chat_member`** — критичный хук: слушайте, чтобы знать, когда бота добавили/удалили из чата.

```python
from aiogram.types import ChatMemberUpdated

@router.my_chat_member()
async def on_my_status(event: ChatMemberUpdated):
    if event.new_chat_member.status == "member":
        # бота добавили как обычного пользователя
        await event.bot.send_message(event.chat.id,
            "Спасибо! Сделайте меня админом для полного функционала.")
    elif event.new_chat_member.status == "kicked":
        # бота кикнули — пометить chat в БД как inactive
        ...
```

## 5. Chat join requests

Invite link с `creates_join_request=True` требует апрувал. Полезно для VIP-каналов:

```python
from aiogram.types import ChatJoinRequest

@router.chat_join_request()
async def on_join_request(req: ChatJoinRequest, subscription_service):
    if await subscription_service.is_vip(req.from_user.id):
        await req.approve()
    else:
        await req.decline()
```

Создание invite link:
```python
link = await bot.create_chat_invite_link(
    chat_id=channel_id,
    name="VIP access",
    creates_join_request=True,
    expire_date=int((datetime.now() + timedelta(days=7)).timestamp()),
    member_limit=None,
)
```

## 6. Posting в канал от имени бота

```python
await bot.send_message(channel_id, "Новый пост", parse_mode="HTML")
await bot.send_photo(channel_id, photo=FSInputFile("banner.jpg"))
await bot.send_media_group(channel_id, media=[
    InputMediaPhoto(media=file_id_1),
    InputMediaPhoto(media=file_id_2, caption="Group caption"),
])
```

Rate limit: по сути 30 msg/s (не групповой лимит). Для serial posts — достаточно.

**Inline buttons в канальных постах:** работают. Callback-и приходят нормально; проверяйте `chat.type == "channel"`.

## 7. Forum topics (Bot API 6.3+)

Forum-supergroup имеет темы. Методы:

```python
topic = await bot.create_forum_topic(
    chat_id=group_id,
    name="Новая тема",
    icon_color=7322096,           # по палитре Telegram
    icon_custom_emoji_id=None,
)

await bot.send_message(
    chat_id=group_id,
    text="Сообщение в теме",
    message_thread_id=topic.message_thread_id,
)

await bot.edit_forum_topic(group_id, topic.message_thread_id, name="Новое имя")
await bot.close_forum_topic(group_id, topic.message_thread_id)
await bot.reopen_forum_topic(group_id, topic.message_thread_id)
await bot.delete_forum_topic(group_id, topic.message_thread_id)
```

Updates: `forum_topic_created`, `forum_topic_edited`, `forum_topic_closed`, `forum_topic_reopened`.

Handler:
```python
@router.message(F.forum_topic_created)
async def on_topic_created(message: Message):
    ...
```

## 8. Moderation паттерны

### Anti-spam

```python
# app/services/moderation_service.py
class ModerationService:
    async def should_delete(self, message: Message) -> bool:
        if self._is_forwarded_from_channel(message):
            return True
        if self._contains_links(message.text or "") and not self._whitelist(message.from_user.id):
            return True
        if self._caps_ratio(message.text or "") > 0.8 and len(message.text or "") > 20:
            return True
        return False
```

### Warn / kick flow

```
warn 1 → warn 2 → warn 3 → mute 1h → mute 24h → kick
```

Храним `warnings(user_id, chat_id, count, last_warn_at)`.

### Captcha при входе

```python
@router.chat_member()
async def on_join(event: ChatMemberUpdated):
    if event.new_chat_member.status == "member":
        await bot.restrict_chat_member(
            event.chat.id, event.new_chat_member.user.id,
            permissions=ChatPermissions(can_send_messages=False),
        )
        # отправить inline-кнопку «Я не бот»
```

## 9. Hub-and-spoke: один бот для N групп

- Храним `chats(id, tg_chat_id, title, type, is_active)`
- При каждом `my_chat_member` обновляем `is_active`
- Admin command `/broadcast_to_chats` — рассылка во все активные чаты (с 20 msg/min на каждую группу)

## 10. Security

- [ ] Проверка `chat.type` перед обработкой (handler для private может сломаться в group)
- [ ] `from_user.id` в группах — можно доверять (подписан Telegram)
- [ ] Admin-команды в группах: проверка через `get_chat_member` status
- [ ] Rate limit на join-request-handling — защита от спама
- [ ] Не делайте mass-mentions: Telegram может заблокировать бота

## Anti-patterns

- ❌ Один и тот же handler для private и group без проверки `chat.type`
- ❌ `privacy=DISABLED` «на всякий случай» — получите в 50× больше апдейтов
- ❌ Sending photo через URL каждый раз вместо `file_id` — медленнее + rate-limit
- ❌ Hardcoded channel IDs в коде — в БД
- ❌ Игнорировать `my_chat_member` — бот «умер» в чате, вы не знаете
