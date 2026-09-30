---
name: miniapp
description: Complete reference documentation and practical guide.
---

# Telegram Mini Apps (Web Apps) — Reference

Telegram Mini App = web-приложение внутри Telegram, запускается по кнопке `web_app`. Требует подписи initData для безопасной авторизации пользователя.

## Когда использовать Mini App

- UX сложнее простой FSM (каталог, корзина, редактор профиля, dashboard)
- Нужна форма с валидацией в реальном времени
- Требуется визуализация (графики, таблицы)
- Payment flow (особенно Telegram Stars через Mini App)
- Админка с множеством полей

## Архитектурное дополнение

Mini App — отдельный фронтенд-слой. Bot и Mini App делят бэкенд через HTTP API.

```
<project>/
├── app/                          # Telegram bot (aiogram 3)
│   └── integrations/
│       └── webapp_auth.py        # initData validation
├── api/                          # FastAPI backend for Mini App
│   ├── main.py
│   ├── deps.py                   # depends: db session, current user
│   ├── routers/
│   │   ├── auth.py               # POST /auth/telegram (validates initData)
│   │   ├── catalog.py
│   │   ├── orders.py
│   │   └── payments.py
│   └── security.py               # JWT issue/verify
├── webapp/                       # Frontend (React/Vue/Svelte/vanilla)
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── main.tsx
│       ├── sdk.ts                # wrapper over @twa-dev/sdk
│       ├── api.ts                # fetch wrapper, auto-attach initData
│       └── pages/
└── docker-compose.yml            # bot + api + frontend(nginx) + postgres + redis
```

## initData validation (server-side)

**Bot side — проверка подписи initData:**
```python
# app/integrations/webapp_auth.py
import hmac, hashlib, json, time
from urllib.parse import parse_qsl

from app.config.settings import settings

class InvalidInitData(Exception): ...

def parse_and_verify_init_data(init_data: str, max_age: int = 3600) -> dict:
    pairs = dict(parse_qsl(init_data, keep_blank_values=True))
    received_hash = pairs.pop("hash", "")
    if not received_hash:
        raise InvalidInitData("missing hash")

    data_check_string = "\n".join(
        f"{k}={v}" for k, v in sorted(pairs.items())
    )
    secret_key = hmac.new(
        key=b"WebAppData",
        msg=settings.bot_token.encode(),
        digestmod=hashlib.sha256,
    ).digest()
    calc_hash = hmac.new(secret_key, data_check_string.encode(),
                        hashlib.sha256).hexdigest()

    if not hmac.compare_digest(calc_hash, received_hash):
        raise InvalidInitData("bad signature")

    auth_date = int(pairs.get("auth_date", "0"))
    if time.time() - auth_date > max_age:
        raise InvalidInitData("expired")

    return {
        **pairs,
        "user": json.loads(pairs["user"]) if "user" in pairs else None,
    }
```

## FastAPI auth endpoint

```python
# api/routers/auth.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.integrations.webapp_auth import parse_and_verify_init_data, InvalidInitData
from api.security import issue_jwt
from app.services.user_service import UserService

router = APIRouter(prefix="/auth", tags=["auth"])

class TgAuthRequest(BaseModel):
    init_data: str

@router.post("/telegram")
async def telegram_auth(body: TgAuthRequest, user_service: UserService):
    try:
        data = parse_and_verify_init_data(body.init_data)
    except InvalidInitData as e:
        raise HTTPException(401, str(e))

    tg_user = data["user"]
    user = await user_service.ensure_user_from_webapp(tg_user)
    token = issue_jwt(sub=str(user.id), claims={"tg_id": tg_user["id"]})
    return {"access_token": token, "token_type": "bearer"}
```

## JWT issue/verify

```python
# api/security.py
import time
from datetime import timedelta

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config.settings import settings

_ALG = "HS256"
_TTL = timedelta(hours=12)

def issue_jwt(sub: str, claims: dict | None = None) -> str:
    now = int(time.time())
    payload = {"sub": sub, "iat": now, "exp": now + int(_TTL.total_seconds()),
               **(claims or {})}
    return jwt.encode(payload, settings.jwt_secret, algorithm=_ALG)

_bearer = HTTPBearer(auto_error=True)

async def current_user_id(cred: HTTPAuthorizationCredentials = Depends(_bearer)) -> int:
    try:
        payload = jwt.decode(cred.credentials, settings.jwt_secret, algorithms=[_ALG])
    except jwt.PyJWTError:
        raise HTTPException(401, "invalid token")
    return int(payload["sub"])
```

## Frontend SDK wrapper

```typescript
// webapp/src/sdk.ts
import WebApp from "@twa-dev/sdk";

export const tg = WebApp;
export const initData = WebApp.initData;          // raw string
export const tgUser = WebApp.initDataUnsafe.user; // do NOT trust — verify on backend

tg.ready();
tg.expand();
tg.setHeaderColor("bg_color");

export function hapticLight() { tg.HapticFeedback.impactOccurred("light"); }
```

```typescript
// webapp/src/api.ts
import { initData } from "./sdk";

let accessToken: string | null = null;

export async function login(): Promise<void> {
  const r = await fetch("/api/auth/telegram", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ init_data: initData }),
  });
  if (!r.ok) throw new Error("auth failed");
  accessToken = (await r.json()).access_token;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!accessToken) await login();
  const r = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
  });
  if (r.status === 401) { accessToken = null; return api(path, init); }
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
```

## Bot side — launching Mini App

```python
# app/keyboards/inline/miniapp.py
from aiogram.types import InlineKeyboardButton as B, InlineKeyboardMarkup as K, WebAppInfo
from app.config.settings import settings

def open_miniapp_kb(path: str = "/") -> K:
    url = f"{settings.webapp_url}{path}"
    return K(inline_keyboard=[
        [B(text="Открыть приложение", web_app=WebAppInfo(url=url))],
    ])
```

## CORS & hosting

- Mini App URL должен быть HTTPS.
- CORS на FastAPI ограничен `settings.webapp_url`.
- Статика фронта — nginx или Cloudflare Pages.
- В docker-compose: сервис `webapp` (nginx + собранные ассеты).

## Security checklist for Mini Apps

- [ ] initData проверяется на сервере (НЕ доверять `initDataUnsafe`)
- [ ] auth_date не старше 1 часа
- [ ] JWT с TTL ≤ 12 ч
- [ ] HTTPS everywhere
- [ ] CORS whitelist только webapp origin
- [ ] CSP headers на фронте
- [ ] Payment confirmations приходят через Telegram, не через фронт
