---
name: patterns
description: Complete reference documentation and practical guide.
---

# Reusable Patterns Library

Twelve patterns that cover 80% of bot-building tasks. Copy, adapt, compose.

## 1. Settings (pydantic-settings)
```python
# app/config/settings.py
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    bot_token: str
    admin_ids: list[int]
    required_channels: list[int] = []
    database_url: str
    redis_url: str = "redis://redis:6379/0"

    webhook_url: str | None = None
    webhook_secret: str | None = None
    webhook_path: str = "/tg/webhook"

    yookassa_shop_id: str | None = None
    yookassa_secret_key: str | None = None
    openai_api_key: str | None = None

    log_level: str = "INFO"

settings = Settings()
```

## 2. DB engine
```python
# app/db/engine.py
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from app.config.settings import settings

engine = create_async_engine(settings.database_url, pool_pre_ping=True)
session_factory = async_sessionmaker(engine, expire_on_commit=False)
```

## 3. DB Session Middleware (DI)
```python
# app/middlewares/db_session.py
from aiogram import BaseMiddleware
from app.db.engine import session_factory

class DbSessionMiddleware(BaseMiddleware):
    async def __call__(self, handler, event, data):
        async with session_factory() as session:
            data["session"] = session
            return await handler(event, data)
```

## 4. Repository Base
```python
# app/repositories/base.py
from sqlalchemy.ext.asyncio import AsyncSession

class BaseRepo:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
```

## 5. User Service
```python
# app/services/user_service.py
from aiogram.types import User as TgUser
from app.repositories.user_repo import UserRepo

class UserService:
    def __init__(self, user_repo: UserRepo) -> None:
        self._users = user_repo

    async def ensure_user(self, tg_user: TgUser) -> None:
        await self._users.upsert(
            tg_id=tg_user.id,
            username=tg_user.username,
            lang=tg_user.language_code,
        )
```

## 6. Channel Subscription Check (Redis-cached)
```python
# app/services/channel_check_service.py
from aiogram import Bot
from redis.asyncio import Redis

class ChannelCheckService:
    def __init__(self, bot: Bot, redis: Redis, channels: list[int]) -> None:
        self._bot, self._redis, self._channels = bot, redis, channels

    async def is_subscribed(self, user_id: int) -> bool:
        key = f"subcheck:{user_id}"
        if (cached := await self._redis.get(key)) is not None:
            return cached == b"1"
        for chat_id in self._channels:
            m = await self._bot.get_chat_member(chat_id, user_id)
            if m.status in {"left", "kicked"}:
                await self._redis.set(key, "0", ex=600)
                return False
        await self._redis.set(key, "1", ex=600)
        return True
```

## 7. Throttling Middleware
```python
# app/middlewares/throttling.py
from aiogram import BaseMiddleware
from redis.asyncio import Redis

class ThrottlingMiddleware(BaseMiddleware):
    def __init__(self, redis: Redis, rate: float = 1.0) -> None:
        self._redis, self._rate = redis, rate

    async def __call__(self, handler, event, data):
        uid = getattr(event.from_user, "id", None)
        if uid is None:
            return await handler(event, data)
        key = f"thr:{uid}"
        if await self._redis.set(key, "1", ex=int(self._rate), nx=True):
            return await handler(event, data)
```

## 8. Admin Filter
```python
# app/filters/admin.py
from aiogram.filters import BaseFilter
from aiogram.types import TelegramObject
from app.config.settings import settings

class AdminFilter(BaseFilter):
    async def __call__(self, event: TelegramObject) -> bool:
        uid = getattr(event.from_user, "id", None)
        return uid in settings.admin_ids
```

## 9. Broadcast Service (rate-limited + error-tolerant)
```python
# app/services/broadcast_service.py
import asyncio
from aiogram import Bot
from aiogram.exceptions import TelegramRetryAfter, TelegramForbiddenError

class BroadcastService:
    def __init__(self, bot: Bot, rps: int = 25) -> None:
        self._bot, self._sem = bot, asyncio.Semaphore(rps)

    async def send_to(self, user_ids: list[int], text: str) -> dict[str, int]:
        ok = blocked = failed = 0
        async def _one(uid: int) -> None:
            nonlocal ok, blocked, failed
            async with self._sem:
                try:
                    await self._bot.send_message(uid, text)
                    ok += 1
                except TelegramRetryAfter as e:
                    await asyncio.sleep(e.retry_after)
                    await self._bot.send_message(uid, text); ok += 1
                except TelegramForbiddenError:
                    blocked += 1
                except Exception:
                    failed += 1
                await asyncio.sleep(1 / 25)
        await asyncio.gather(*[_one(u) for u in user_ids])
        return {"ok": ok, "blocked": blocked, "failed": failed}
```

## 10. FSM State Group
```python
# app/states/onboarding.py
from aiogram.fsm.state import State, StatesGroup

class Onboarding(StatesGroup):
    waiting_name = State()
    waiting_email = State()
    confirm = State()
```

## 11. Navigation-focused Inline Keyboard Factory

Every button must lead somewhere: handler, URL, or Mini App. Nested screens keep
`Back`/`Main menu`, callbacks use compact `CallbackData`, and labels are readable
without relying on emoji.

```python
# app/keyboards/inline/main_menu.py
from aiogram.filters.callback_data import CallbackData
from aiogram.types import InlineKeyboardButton as B, InlineKeyboardMarkup as K

class MenuCb(CallbackData, prefix="menu"):
    screen: str

def main_menu_kb() -> K:
    return K(inline_keyboard=[
        [B(text="Каталог", callback_data=MenuCb(screen="catalog").pack())],
        [B(text="VIP", callback_data=MenuCb(screen="vip").pack()),
         B(text="Профиль", callback_data=MenuCb(screen="profile").pack())],
    ])

def back_home_kb(back_to: str = "main") -> K:
    return K(inline_keyboard=[
        [B(text="Назад", callback_data=MenuCb(screen=back_to).pack())],
        [B(text="Главное меню", callback_data=MenuCb(screen="main").pack())],
    ])
```

## 12. Errors Handler
```python
# app/handlers/errors.py
import logging, uuid
from aiogram import Router
from aiogram.types import ErrorEvent

router = Router(name="errors")
log = logging.getLogger(__name__)

@router.errors()
async def on_error(event: ErrorEvent) -> bool:
    rid = uuid.uuid4().hex[:8]
    log.exception("update failed", extra={"request_id": rid})
    upd = event.update
    target = upd.message or (upd.callback_query.message if upd.callback_query else None)
    if target:
        await target.answer(f"Что-то пошло не так. Код: {rid}")
    return True
```
