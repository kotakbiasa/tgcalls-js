---
name: examples
description: Complete reference documentation and practical guide.
---

# Generation Examples

Three end-to-end cases demonstrating how BotForge handles a real brief.

## Example 1 — VIP media bot (кино-канал)

**User:** «Бот для Telegram-канала о кино: gated-контент по подписке на канал + VIP за 299 ₽/мес, админка, рассылки.»

**BotForge response:**

### ADR
- Stack: aiogram 3 + PostgreSQL 16 + SQLAlchemy 2 + Redis + Docker. aiogram 3 — async, routers, FSM, middleware; соответствует профилю нагрузки. Redis — FSM storage + throttling + кэш `getChatMember` (TTL 10 мин).
- Payments: Telegram Stars primary (0% комиссии внутри TG) + ЮKassa fallback.
- Data model:
  - `users(id, tg_id, username, lang, role, created_at)`
  - `subscriptions(id, user_id, plan, status, started_at, expires_at)`
  - `payments(id, user_id, provider, amount, currency, status, ext_id)`
  - `content_items(id, slug, type, payload, tier)` — tier: free | channel | vip
  - `broadcasts(id, text, media, segment, scheduled_at, status)`
- Deployment: Docker Compose на VPS, webhook за nginx.
- Risks: массовая рассылка → 429 от Telegram → очередь с rate limiter (25 msg/s).
- Extension points: рефералка, A/B рассылок, i18n.

### Tree
See `architecture.md`.

### Key files
- `services/channel_check_service.py` — cached subscription check
- `services/subscription_service.py` — grant/revoke VIP, check expiry
- `services/payment_service.py` — create invoice, handle webhook idempotently
- `handlers/subscription.py` — VIP flow, gated content delivery
- `handlers/admin/broadcast.py` — FSM for composing + sending broadcasts

### Self-review
- [x] Секреты в .env
- [x] Handlers тонкие
- [x] Retry на ЮKassa
- [x] Idempotency по `ext_id` платежа
- [x] Alembic + Docker + Makefile
- [x] RUNBOOK для застрявшей рассылки

---

## Example 2 — AI assistant with tiered plans

**User:** «Бот-ассистент на OpenAI с 3 тарифами (Free / Pro / Ultra), лимиты токенов, история диалогов в Postgres.»

**ADR highlights:**
- OpenAI через `integrations/openai_client.py` (httpx + tenacity, streaming).
- История в `messages(user_id, role, content, tokens, created_at)`.
- Счётчики лимитов в Redis, окно — календарный месяц.
- Переполнение лимита → upsell-экран с inline-кнопкой оплаты.
- v1.3 pack: RAG на pgvector.

**Ключевые паттерны:**
- Стриминг ответа через `edit_message_text` (батчинг по 200 токенов).
- Graceful degradation при 429 от OpenAI: retry → fallback сообщение.
- Context window trimming: последние N сообщений + system prompt.

---

## Example 3 — Lead-gen bot for online school

**User:** «Лидген-бот: FSM-сбор заявки → Google Sheets → уведомление админу.»

**ADR:**
- SQLite допустим (Lite), но рекомендован Postgres для истории лидов.
- `integrations/sheets_client.py` через `gspread-asyncio`.
- Уведомление админу — `Bot.send_message(ADMIN_CHAT_ID, ...)`.
- FSM: `Lead.name → phone → goal → confirm`.
- Валидация phone через regex.
- При `confirm` — транзакция: insert в `leads` + append в Sheets + admin-notify.
- При частичном сбое — outbox pattern: записать в `outbox_events`, воркер дотолкает.

**Extension points:** UTM-метки из deep-link, A/B приветственных сообщений, интеграция с AmoCRM.
