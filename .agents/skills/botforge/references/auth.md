---
name: auth
description: Complete reference documentation and practical guide.
---

# Authentication & Authorization — Reference

Три уровня auth в Telegram-ботах:

1. **Telegram identity** — по `tg_id` из апдейта (доверенное, приходит от Telegram)
2. **Mini App initData** — HMAC-проверка подписи (см. `miniapp.md`)
3. **Внешние системы** — OAuth/JWT/API keys к вашему backend/SaaS

## 1. Telegram identity (bot side)

`tg_id` приходит в каждом апдейте и подписан Telegram-ом. Доверяем напрямую.

**User upsert + caching:**
```python
# app/middlewares/auth.py
from aiogram import BaseMiddleware
from app.repositories.user_repo import UserRepo

class AuthMiddleware(BaseMiddleware):
    async def __call__(self, handler, event, data):
        session = data["session"]
        tg_user = getattr(event, "from_user", None)
        if tg_user is None:
            return await handler(event, data)
        repo = UserRepo(session)
        user = await repo.get_or_create(
            tg_id=tg_user.id,
            username=tg_user.username,
            lang=tg_user.language_code,
        )
        data["user"] = user
        return await handler(event, data)
```

## 2. Roles & permissions

**Model:**
```python
# app/models/user.py
from enum import StrEnum
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base, TimestampMixin

class Role(StrEnum):
    user = "user"
    vip = "vip"
    moderator = "moderator"
    admin = "admin"

class User(Base, TimestampMixin):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    tg_id: Mapped[int] = mapped_column(unique=True, index=True)
    username: Mapped[str | None]
    lang: Mapped[str | None]
    role: Mapped[Role] = mapped_column(default=Role.user)
    is_banned: Mapped[bool] = mapped_column(default=False)
```

**Role-based filter:**
```python
# app/filters/role.py
from aiogram.filters import BaseFilter
from aiogram.types import TelegramObject
from app.models.user import Role, User

class RoleFilter(BaseFilter):
    def __init__(self, *roles: Role) -> None:
        self._roles = set(roles)

    async def __call__(self, event: TelegramObject, user: User | None = None) -> bool:
        return user is not None and user.role in self._roles

# usage
from app.filters.role import RoleFilter
from app.models.user import Role

@router.message(Command("stats"), RoleFilter(Role.admin, Role.moderator))
async def show_stats(msg: Message, ...): ...
```

## 3. Channel-based gating

Пользователь должен быть подписан на N каналов, чтобы получить доступ.

См. `ChannelCheckService` в `patterns.md #6`. Подключается middleware или фильтром:

```python
# app/filters/subscription.py
from aiogram.filters import BaseFilter
from aiogram.types import TelegramObject
from app.services.channel_check_service import ChannelCheckService

class SubscribedFilter(BaseFilter):
    async def __call__(self, event: TelegramObject,
                       channel_check: ChannelCheckService) -> bool:
        uid = getattr(event.from_user, "id", None)
        return uid is not None and await channel_check.is_subscribed(uid)
```

## 4. Ban / shadow-ban

- `users.is_banned` — BanMiddleware раньше AuthMiddleware отбрасывает апдейт.
- Shadow-ban: пользователь получает «успех», но действие не происходит. Используется против спамеров.

```python
# app/middlewares/ban.py
from aiogram import BaseMiddleware

class BanMiddleware(BaseMiddleware):
    async def __call__(self, handler, event, data):
        user = data.get("user")
        if user and user.is_banned:
            return
        return await handler(event, data)
```

## 5. External auth (Mini App → SaaS backend)

Когда Mini App должен авторизоваться в вашем SaaS:

1. User открывает Mini App → фронт шлёт `initData` на `/api/auth/telegram`.
2. Бэкенд проверяет подпись, upsert-ит user, выдаёт **JWT**.
3. Все последующие запросы — `Authorization: Bearer <jwt>`.
4. JWT содержит `sub`, `tg_id`, `role`, `exp`.

См. `miniapp.md` разделы «initData validation» и «JWT issue/verify».

## 6. OAuth bridging (Telegram → Google/Github/etc.)

Паттерн «OAuth через deep-link»:

1. Bot отправляет кнопку «Войти через Google» с URL на ваш backend `/oauth/start?state=<tg_id_signed>`.
2. Backend делает OAuth с Google, callback получает `code` + `state`.
3. По `state` связывает Google-аккаунт с `tg_id`.
4. Backend шлёт в бот `sendMessage(tg_id, "Успешно связано")` через вашу внутреннюю API.

```python
# app/integrations/oauth_bridge.py
import hmac, hashlib, time, base64

def sign_state(tg_id: int, secret: str, ttl: int = 600) -> str:
    payload = f"{tg_id}:{int(time.time()) + ttl}".encode()
    sig = hmac.new(secret.encode(), payload, hashlib.sha256).digest()[:8]
    return base64.urlsafe_b64encode(payload + b"." + sig).decode().rstrip("=")

def verify_state(state: str, secret: str) -> int:
    raw = base64.urlsafe_b64decode(state + "==")
    payload, sig = raw.rsplit(b".", 1)
    expected = hmac.new(secret.encode(), payload, hashlib.sha256).digest()[:8]
    if not hmac.compare_digest(sig, expected):
        raise ValueError("bad state")
    tg_id_s, exp_s = payload.decode().split(":")
    if int(exp_s) < time.time():
        raise ValueError("expired")
    return int(tg_id_s)
```

## 7. API keys (bot ↔ backend)

Если бот и backend — разные сервисы:
- Long-lived API key в `.env` (`INTERNAL_API_KEY`).
- Bot отправляет `X-Internal-Key: <key>` на внутренние эндпоинты.
- Backend middleware сравнивает через `hmac.compare_digest`.
- Keys ротируются по расписанию (хотя бы раз в квартал).

## Auth security checklist

- [ ] `tg_id` всегда берётся из update, не из message text
- [ ] Mini App initData проверяется HMAC на сервере
- [ ] JWT TTL ≤ 12 ч, refresh есть отдельно
- [ ] Admin-команды за `RoleFilter(Role.admin)`
- [ ] Ban-check ДО бизнес-логики
- [ ] Rate limit на auth endpoints
- [ ] Audit log всех role changes
- [ ] No password handling — Telegram авторизация, не свой логин/пароль
