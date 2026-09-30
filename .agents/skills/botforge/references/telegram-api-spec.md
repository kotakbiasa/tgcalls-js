---
name: telegram-api-spec
description: Complete reference documentation and practical guide.
---

# Telegram Bot API — Official Specification

Based on Bot API **10.0** (May 8, 2026) and aiogram 3.x (Python 3.10+, recommended 3.12+).

Sources: https://core.telegram.org/bots/api | https://core.telegram.org/bots/api-changelog | https://core.telegram.org/bots/faq | https://core.telegram.org/bots/webapps | https://core.telegram.org/bots/payments-stars

---

## 0. Bot API 10.2 delta (must not be missed)

BotForge treats new Bot API surfaces as opt-in until aiogram exposes typed wrappers. If a requested feature uses a fresh API, verify local library support first; otherwise isolate raw HTTP calls in `integrations/telegram_client.py` with tests.

New in **10.0** (May 2026):
- **Guest mode**: `Update.guest_message`, `Message.guest_query_id`, `SentGuestMessage`, and `answerGuestQuery`. Use this only for bots that support guest queries; guest replies are not normal chat messages.
- **Chat management**: `can_react_to_messages`, `getChatAdministrators(return_bots=...)`, `deleteAllMessageReactions`, `deleteMessageReaction`, and limited visibility into messages from other bots in groups.
- **Poll media**: media on polls, poll explanations, and poll options; `sendPoll` can now take `media`, `explanation_media`, `members_only`, and `country_codes`; poll options are **1..12**.
- **Live photos**: `LivePhoto`, `InputMediaLivePhoto`, `sendLivePhoto`, paid live photos, and live photos in media groups.
- **Managed bot access**: `BotAccessSettings`, `getManagedBotAccessSettings`, `setManagedBotAccessSettings`.

New in **10.1** (June 2026):
- **Rich Messages**: `sendRichMessage`, `sendRichMessageDraft`, `InputRichMessage`, `RichText*`/`RichBlock*` types, `rich_message` on `Message` and `editMessageText`, `Update.subscription`.

New in **10.2** (July 2026):
- **Outgoing block JSON**: `InputRichMessage.blocks` for direct block construction.
- **Media bindings**: `InputRichMessageMedia` with `file_id`, URL, and `attach://` multipart upload.
- **Streaming**: `RichBlockThinking` for AI streaming drafts.
- **Mini App domain enforcement**: Mini App methods restricted to origin domain (auto-enforced since July 20, 2026).

Generation rule: when using these features, add them to `allowed_updates`, include fallback behavior for older aiogram versions, and cite the exact Bot API method/type in ADR.

## 1. Rate limits (the single most important operational constraint)

| Scope | Limit | Source |
|---|---|---|
| **Per-user (private chat)** | **1 msg/sec** | `bots/faq` |
| **Per-group** | **20 msg/min** | `bots/faq` |
| **Broadcast to different users** | **~30 msg/sec** | `bots/faq` |
| **Paid broadcast (BotFather upgrade)** | up to **1000 msg/sec**, 0.1 ⭐ per msg above free tier | `bots/faq` |

**Implications for BotForge:**
- `BroadcastService` throttles to **25 msg/s** (safety buffer under 30).
- Per-user throttling middleware defaults to **1/sec**.
- Large broadcasts → spread over **8–12 hours** OR enable paid broadcast.
- On `TelegramRetryAfter`: sleep exactly `e.retry_after` seconds, then retry once.

---

## 2. Webhook setup (official constraints)

```python
await bot.set_webhook(
    url="https://example.com/tg/webhook",
    secret_token="A-Za-z0-9_-{1,256}",        # max 256 chars, ascii-letters/digits/_/-
    max_connections=40,                        # 1..100, default 40
    allowed_updates=["message", "callback_query", "pre_checkout_query",
                     "successful_payment"],     # add guest_message/managed_bot only if used
    drop_pending_updates=True,                 # true on fresh deploy
    ip_address=None,                           # optional DNS bypass
)
```

- **Protocol**: HTTPS required
- **Ports allowed**: 443, 80, 88, 8443
- **Secret token header**: `X-Telegram-Bot-Api-Secret-Token` — validate server-side before processing
- **After deploy**: call `getWebhookInfo` to verify; expected `last_error_date = null`

---

## 3. File size limits

| Operation | Limit |
|---|---|
| **Upload via Bot API (cloud)** | 50 MB (documents), 10 MB (photos), 20 MB (some media) |
| **Download via Bot API (cloud)** | 20 MB per `getFile` |
| **Local Bot API server upload** | up to **2000 MB** |
| **Local Bot API server download** | **No size limit** |

**BotForge rule:** если требуется загрузка файлов > 20 МБ — обязательно local Bot API server в архитектуре (`bot-api-server` сервис в compose).

---

## 4. Deep linking (t.me URL schema)

| URL | Contents sent to bot |
|---|---|
| `t.me/<bot>?start=<payload>` | `/start <payload>` (private chat) |
| `t.me/<bot>?startgroup=<payload>` | `/start@<bot> <payload>` (group select) |
| `t.me/<bot>?startapp=<payload>` | Opens Mini App with `start_param=<payload>` |

**Payload constraints:**
- Max **64 characters**
- Allowed: `A-Z`, `a-z`, `0-9`, `_`, `-`
- For arbitrary data → base64url encode

**BotForge pattern — signed referral links:**
```python
# app/utils/deeplink.py
import base64, hmac, hashlib, time

def pack_ref(user_id: int, secret: str, ttl: int = 86400) -> str:
    exp = int(time.time()) + ttl
    body = f"{user_id}.{exp}".encode()
    sig = hmac.new(secret.encode(), body, hashlib.sha256).digest()[:6]
    raw = body + b"." + sig
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")

def unpack_ref(token: str, secret: str) -> int:
    raw = base64.urlsafe_b64decode(token + "==")
    body, sig = raw.rsplit(b".", 1)
    if not hmac.compare_digest(sig,
        hmac.new(secret.encode(), body, hashlib.sha256).digest()[:6]):
        raise ValueError("bad ref sig")
    user_id, exp = body.decode().split(".")
    if int(exp) < time.time(): raise ValueError("ref expired")
    return int(user_id)
```

---

## 5. `setMyCommands` + BotCommandScope

Scopes (official):
- `BotCommandScopeDefault` — fallback
- `BotCommandScopeAllPrivateChats`
- `BotCommandScopeAllGroupChats`
- `BotCommandScopeAllChatAdministrators`
- `BotCommandScopeChat(chat_id)`
- `BotCommandScopeChatAdministrators(chat_id)`
- `BotCommandScopeChatMember(chat_id, user_id)` — per-user menu

**Command constraints:**
- Command: 1..32 chars, `a-z`, `0-9`, `_`
- Description: 1..256 chars
- Max 100 commands per scope

**BotForge pattern — different menus for admins vs users:**
```python
# app/bot/lifespan.py
from aiogram.types import BotCommand, BotCommandScopeDefault, BotCommandScopeChat

async def on_startup(bot: Bot, settings: Settings) -> None:
    await bot.set_my_commands([
        BotCommand(command="start", description="Запуск"),
        BotCommand(command="help", description="Помощь"),
        BotCommand(command="vip", description="VIP-доступ"),
    ], scope=BotCommandScopeDefault())

    admin_cmds = [
        BotCommand(command="stats", description="Статистика"),
        BotCommand(command="broadcast", description="Рассылка"),
        BotCommand(command="ban", description="Забанить пользователя"),
    ]
    for admin_id in settings.admin_ids:
        await bot.set_my_commands(admin_cmds, scope=BotCommandScopeChat(chat_id=admin_id))
```

---

## 6. MarkdownV2 — characters that MUST be escaped

В MarkdownV2 экранируются `\` перед:

```
_  *  [  ]  (  )  ~  `  >  #  +  -  =  |  {  }  .  !
```

Внутри кода (` `` `) и pre-блоков (` ``` `) экранируются только `` ` `` и `\`.

**BotForge utility:**
```python
# app/utils/markdown.py
_ESCAPE = r"_*[]()~`>#+-=|{}.!"

def md2_escape(text: str) -> str:
    return "".join(f"\\{c}" if c in _ESCAPE else c for c in text)
```

**Правило:** пользовательский ввод, вставляемый в MarkdownV2 текст, всегда прогоняем через `md2_escape`. HTML-режим безопаснее — используйте его по умолчанию.

---

## 7. Error codes (наблюдаемые на практике)

| Код | Когда | aiogram exception | Действие |
|---|---|---|---|
| **400** Bad Request | невалидные параметры, текст слишком длинный | `TelegramBadRequest` | fix + no retry |
| **401** Unauthorized | токен отозван | `TelegramUnauthorizedError` | alert, ротировать токен |
| **403** Forbidden | пользователь заблокировал бота / кикнул из группы | `TelegramForbiddenError` | пометить `blocked=true`, не ретраить |
| **404** Not Found | невалидный метод / чат не существует | `TelegramNotFound` | fix + no retry |
| **409** Conflict | конфликт webhook/polling | `TelegramConflictError` | удалить webhook или остановить polling |
| **429** Too Many Requests | rate limit | `TelegramRetryAfter` | `asyncio.sleep(e.retry_after)` + retry |
| **500–599** | серверная ошибка Telegram | `TelegramServerError` | tenacity retry с backoff |

**BotForge errors handler** покрывает все эти кейсы — см. `patterns.md #12`.

---

## 8. Lengths (важные лимиты)

| Сущность | Лимит |
|---|---|
| Message text | 4096 UTF-16 code units |
| Caption | 1024 UTF-16 code units |
| Callback data | **64 bytes** (используем `CallbackData`-фабрики, не сырые строки) |
| `answerCallbackQuery.text` | 200 chars |
| Inline keyboard buttons | до 100 (разумный практический лимит ~8×8) |
| Reply keyboard buttons | до 300 (практика — ≤12) |
| Poll question | 300 chars |
| Poll option | 100 chars, 1..12 options |
| `setMyDescription` | 512 chars |
| `setMyShortDescription` | 120 chars |
| Invoice `title` | 1..32 chars |
| Invoice `description` | 1..255 chars |
| Invoice `payload` | 1..128 bytes (hidden from user) |

**BotForge rule:** при генерации длинных сообщений — разбиваем по 4000 chars с уважением к границам слов, остаток в следующем сообщении.

---

## 9. Telegram Stars (XTR) — официальная спека

- Currency code: **`XTR`**
- `provider_token` — **пустая строка** (для Stars не нужен платёжный провайдер)
- Методы: `createInvoiceLink`, `sendInvoice`, `refundStarPayment`
- Только **digital goods**; физтовары — через традиционные провайдеры
- Handlers: `pre_checkout_query` → `answer(ok=True)` → `successful_payment`
- `telegram_payment_charge_id` используется для рефандов через `refundStarPayment`

**Subscription-like recurring для Stars:** официальная Telegram Stars Subscription API (bot может создавать периодические инвойсы через `createInvoiceLink` с параметром `subscription_period` — см. Bot API 10.x). Для SaaS-бота храним `subscription_expires_at` и шлём инвойс-ссылку за N дней до истечения.

---

## 10. Mini Apps — official initData validation

**Secret key derivation:**
```
secret_key = HMAC_SHA256(key="WebAppData", msg=bot_token)
```

**Data-check-string:**
- Все поля, кроме `hash`, отсортированы по ключу
- Формат: `key=value`, разделитель — `\n`

**Validation:**
```
calc_hash = hex(HMAC_SHA256(key=secret_key, msg=data_check_string))
valid = hmac.compare_digest(calc_hash, received_hash)
```

**Важно:** также проверяйте `auth_date` — рекомендуется отвергать initData старше 1 часа.

**initData поля:**
- `query_id` (для `answerWebAppQuery`)
- `user` (JSON WebAppUser)
- `receiver`, `chat`, `chat_type`, `chat_instance`
- `start_param` (из `t.me/<bot>?startapp=...`)
- `can_send_after`, `auth_date`, `hash`, `signature` (Ed25519 для third-party)

**Theme params (CSS vars автоматически проставляются):**
`--tg-theme-bg-color`, `--tg-theme-text-color`, `--tg-theme-hint-color`, `--tg-theme-link-color`, `--tg-theme-button-color`, `--tg-theme-button-text-color`, `--tg-theme-secondary-bg-color`, `--tg-theme-header-bg-color`, `--tg-theme-accent-text-color`, `--tg-theme-section-bg-color`, `--tg-theme-destructive-text-color` — используйте их напрямую в CSS.

**Events (через `Telegram.WebApp.onEvent`):**
`themeChanged`, `viewportChanged`, `mainButtonClicked`, `backButtonClicked`, `settingsButtonClicked`, `popupClosed`, `invoiceClosed`, `qrTextReceived`, `scanQrPopupClosed`, `clipboardTextReceived`, `writeAccessRequested`, `contactRequested`, `biometricManagerUpdated`.

**CloudStorage (bot-scoped per-user):**
- 1024 пар max
- Key: 1..128 chars `[A-Za-z0-9_-]`
- Value: 0..4096 chars
- API: `setItem`, `getItem(s)`, `removeItem(s)`, `getKeys`

**Popup constraints:**
- `title`: 0..64 chars
- `message`: 1..256 chars
- `buttons`: 1..3, каждая: `id` 0..64, `type`: `default|ok|close|cancel|destructive`, `text` 0..64

---

## 11. allowed_updates — минимизируем трафик

По умолчанию webhook/polling получают НЕ все типы обновлений. Указывайте явно:

```python
allowed_updates = [
    "message",
    "edited_message",
    "callback_query",
    "pre_checkout_query",
    "successful_payment",
    "my_chat_member",          # изменения админ-статуса бота
    "chat_member",             # события вступления/выхода (требует privacy off)
    "chat_join_request",       # для invite link approvals
    "inline_query",            # только если используете inline-режим
    "guest_message",           # только для Guest Mode / answerGuestQuery
    "managed_bot",             # только если управляете managed bots
]
```

**Важно:** `chat_member` требует выключенной privacy в BotFather (`/setprivacy` → `DISABLE`).

---

## 12. Privacy mode & group behavior

По умолчанию бот в группах видит только команды и reply к себе. Чтобы видеть все сообщения — `/setprivacy` → `DISABLE` у BotFather.

**BotForge pattern:** документируйте в README, выключен ли privacy mode, и почему. Это влияет на tests и ожидания от группового бота.

---

## 13. Bot lifecycle hooks (aiogram 3)

```python
# app/bot/lifespan.py
from aiogram import Bot, Dispatcher

async def on_startup(bot: Bot, settings: Settings) -> None:
    await bot.set_my_commands(...)
    await bot.set_my_description(settings.bot_description)
    await bot.set_my_short_description(settings.bot_short_description)
    if settings.webhook_url:
        await bot.set_webhook(
            url=f"{settings.webhook_url}{settings.webhook_path}",
            secret_token=settings.webhook_secret,
            allowed_updates=ALLOWED_UPDATES,
            drop_pending_updates=True,
        )

async def on_shutdown(bot: Bot) -> None:
    await bot.delete_webhook(drop_pending_updates=False)  # не теряем апдейты
    await bot.session.close()

# регистрация
dp.startup.register(on_startup)
dp.shutdown.register(on_shutdown)
```

---

## 14. What to verify before production

- [ ] BotFather: `/setprivacy`, `/setjoingroups`, `/setinline` настроены под задачу
- [ ] `setMyCommands` для default scope + admin scope
- [ ] `setMyDescription` + `setMyShortDescription` + `setUserpic`
- [ ] `allowed_updates` минимальный
- [ ] Webhook `secret_token` задан и проверяется
- [ ] `getWebhookInfo.last_error_date == null`
- [ ] Rate limits: 25 msg/s broadcast, 1/sec per user
- [ ] `TelegramRetryAfter`, `TelegramForbiddenError`, `TelegramBadRequest` — отдельная обработка
- [ ] MarkdownV2: весь user input экранируется (или используем HTML)
- [ ] Deep link payloads: подписаны HMAC, TTL проверяется
- [ ] Mini App `initData`: HMAC + `auth_date` < 3600s
- [ ] Stars: `provider_token=""`, `currency="XTR"`, `refundStarPayment` поддержан
