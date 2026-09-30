---
name: anti-spam
description: Complete reference documentation and practical guide.
---

# Anti-Spam & Moderation — Reference

Telegram — главная площадка для спама (Bot Farm-ы, скам-боты, реферальные схемы). Без активной защиты публичный бот захлебнётся.

## 1. Слои защиты

1. **Rate limits** — базовый throttling на уровне middleware
2. **Captcha на входе** — отсеивает ботов-автоматов
3. **Content filters** — regex/heuristic на сообщения
4. **Behavioral scoring** — репутация юзера по поведению
5. **Manual moderation** — когда автомат ошибся

## 2. Captcha на вступление в группу

```python
# app/services/captcha_service.py
import asyncio
import random
from aiogram import Bot
from aiogram.types import ChatMemberUpdated, InlineKeyboardButton, InlineKeyboardMarkup

CAPTCHA_TIMEOUT = 60  # секунд

class CaptchaService:
    def __init__(self, bot: Bot, redis) -> None:
        self._bot, self._redis = bot, redis

    async def challenge(self, event: ChatMemberUpdated) -> None:
        user = event.new_chat_member.user
        chat_id = event.chat.id

        # ограничить нового юзера
        await self._bot.restrict_chat_member(
            chat_id, user.id,
            permissions=types.ChatPermissions(can_send_messages=False),
        )

        # сохранить challenge в Redis
        correct = random.randint(1, 4)
        await self._redis.set(f"captcha:{chat_id}:{user.id}", correct, ex=CAPTCHA_TIMEOUT)

        kb = InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text=str(i), callback_data=f"captcha:{i}")
            for i in range(1, 5)
        ]])
        msg = await self._bot.send_message(
            chat_id,
            f"{user.first_name}, нажми {correct}, чтобы писать в чат. У тебя минута.",
            reply_markup=kb,
        )
        # по истечении — kick
        asyncio.create_task(self._timeout_kick(chat_id, user.id, msg.message_id))

    async def verify(self, call) -> bool:
        chat_id = call.message.chat.id
        user_id = call.from_user.id
        answer = int(call.data.split(":")[1])
        expected = await self._redis.get(f"captcha:{chat_id}:{user_id}")
        if not expected or int(expected) != answer:
            return False
        await self._bot.restrict_chat_member(
            chat_id, user_id,
            permissions=types.ChatPermissions(
                can_send_messages=True,
                can_send_media_messages=True,
                can_send_other_messages=True,
            ),
        )
        await self._redis.delete(f"captcha:{chat_id}:{user_id}")
        return True

    async def _timeout_kick(self, chat_id, user_id, msg_id):
        await asyncio.sleep(CAPTCHA_TIMEOUT + 5)
        if await self._redis.exists(f"captcha:{chat_id}:{user_id}"):
            await self._bot.ban_chat_member(chat_id, user_id,
                                            revoke_messages=False)
            await self._bot.unban_chat_member(chat_id, user_id)  # kick, not ban
```

## 3. Content filters

### Link/URL detection
```python
import re

URL_RE = re.compile(r'https?://\S+|t\.me/\S+')

def has_external_link(text: str) -> bool:
    return bool(URL_RE.search(text or ""))

def has_only_allowed_links(text: str, whitelist: set[str]) -> bool:
    urls = URL_RE.findall(text or "")
    return all(any(wl in u for wl in whitelist) for u in urls)
```

### Forwarded from channels (частый спам-вектор)
```python
@router.message(F.forward_from_chat.type == "channel")
async def on_forward(msg: Message):
    if not user.is_trusted:
        await msg.delete()
        return
```

### CAPS detection
```python
def caps_ratio(text: str) -> float:
    if not text: return 0.0
    letters = [c for c in text if c.isalpha()]
    if len(letters) < 10: return 0.0
    return sum(1 for c in letters if c.isupper()) / len(letters)

# пороги
if caps_ratio(text) > 0.8 and len(text) > 20:
    # вероятно SHOUTING SPAM
```

### Emoji flood
```python
import emoji

def emoji_count(text: str) -> int:
    return emoji.emoji_count(text or "")

if emoji_count(text) > 10:  # подозрительно
```

## 4. Behavioral scoring

```python
# app/models/user.py
class User(Base, TimestampMixin):
    ...
    trust_score: Mapped[int] = mapped_column(default=0)  # -100..+100
    warnings: Mapped[int] = mapped_column(default=0)
    total_messages: Mapped[int] = mapped_column(default=0)
```

**Сигналы:**
- +1 за каждое сообщение без нарушений
- +5 после 7 дней присутствия без warnings
- +10 если пользователь давно в Telegram (account_age > 1 год, проверить через `getChat`)
- -20 за warning
- -50 за forward с канала подозрительного
- -100 за попытку спам-ссылки

```python
async def should_restrict(user: User, message: Message) -> bool:
    if user.is_banned:
        return True
    if user.trust_score < -50:
        return True
    if user.total_messages < 3 and has_external_link(message.text):
        return True    # новичок + ссылка
    return False
```

## 5. Warn system

```
warn 1 → предупреждение + мут 10 минут
warn 2 → мут 1 час
warn 3 → мут 24 часа
warn 4 → kick
warn 5 → permanent ban
```

Сброс warnings: через 30 дней без нарушений.

## 6. Shadow-ban (спамеру не видно, что он забанен)

```python
# app/middlewares/ban.py
class BanMiddleware(BaseMiddleware):
    async def __call__(self, handler, event, data):
        user = data.get("user")
        if user and user.is_banned:
            # вернуть "успех" без реального выполнения
            if isinstance(event, Message):
                # не удаляем, не отвечаем — просто игнор
                return None
        return await handler(event, data)
```

Спамер видит что пишет, не понимает, что его никто не читает. Работает против ботов-мошенников.

## 7. Известные сигнатуры спам-ботов

```python
SPAM_PATTERNS = [
    r'(?i)crypt[oа].*pump',
    r'(?i)airdrop',
    r'(?i)заработ\w+ \d+\s*[$€₽]',
    r'(?i)invest.*guaranteed',
    r'(?i)\b(nft|web3|defi).*earn',
    r'(?i)pm me|dm me',
    r'(?i)моя партнерская',
]
SPAM_RE = re.compile("|".join(SPAM_PATTERNS))
```

Обновляйте паттерны регулярно — спам эволюционирует.

## 8. Reverse-telegram-id lookup (OSINT сигналы)

- Новый аккаунт (<30 дней) + сразу ссылки = высокий риск.
- Username `user_xxxxxxx` (рандомный) — автогенерированный.
- Отсутствие профильной фотки = подозрение.
- `@SpamBotInfo` (public bot) даёт статус юзера «is this user spam?».

## 9. ChatGPT-made spam

Новый тип — «человеческий» спам, генерированный LLM. Признаки:
- Длинные, граматически правильные сообщения
- Неестественно вежливые формулировки
- «Hi! I found this bot very interesting and wanted to share…»

Защита: требовать капчу на каждое сообщение с URL от новичков; репутационный score.

## 10. Anti-spam checklist

- [ ] Captcha на вступление в группу (с timeout → kick)
- [ ] Rate limit 1 msg/sec per user (ThrottlingMiddleware)
- [ ] URL-filter для новичков (`total_messages < 3` → no links)
- [ ] Forward-from-channel moderation
- [ ] Shadow-ban для кнопочного флуда
- [ ] Trust score с положительными и отрицательными сигналами
- [ ] Warn system с эскалацией
- [ ] Admin-команды `/warn @user`, `/mute @user 1h`, `/ban @user`
- [ ] Audit log всех moderation-действий
- [ ] Обновление spam-pattern базы раз в месяц

## Anti-patterns

- ❌ Бан на первом URL от любого юзера — выкосит нормальных
- ❌ Кик через `ban_chat_member` без последующего `unban` — юзер не сможет вернуться
- ❌ Captcha с вопросом «сколько будет 2+2» — ChatGPT-спамеры решают мгновенно
- ❌ Молчаливый silent delete без лога — админ не понимает, что происходит
- ❌ Whitelist из username — Telegram username меняется в любой момент
