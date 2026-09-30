---
name: anti-patterns
description: Complete reference documentation and practical guide.
---

# Anti-Patterns — real production failures

20+ mistakes we've seen kill real Telegram bots. Every pattern listed here has been caught in production and fixed. When generating or reviewing code, check against this catalog.

Each entry:
- **Symptom** — what goes wrong from the operator's view
- **Cause** — underlying code pattern
- **Fix** — minimal correct version

---

## I/O & concurrency

### 1. Forgotten `await`
**Symptom.** Bot replies with `<coroutine object>` strings. Silent failures in logs. Tests pass because mocks don't validate.
**Cause.**
```python
async def buy_vip(user_id):
    order = await repo.create(...)
    payment_service.start(order.id)  # <-- missing await
```
**Fix.** Enable `ruff` rule `ASYNC` + `mypy --strict`. Both catch missing awaits at lint time.

### 2. Blocking I/O in async handler
**Symptom.** Under 50+ concurrent users, bot becomes unresponsive. Webhook times out.
**Cause.** `requests.post(...)`, `time.sleep(...)`, synchronous database driver, unbuffered file I/O.
**Fix.** `httpx.AsyncClient`, `asyncio.sleep`, `asyncpg` / `aiosqlite` drivers, `aiofiles`. Run `ruff` with `ASYNC100`–`ASYNC110`.

### 3. `session.commit()` inside a loop
**Symptom.** Insertion of 10k users takes 45 minutes instead of 3.
**Cause.**
```python
for u in users:
    session.add(User(...))
    await session.commit()   # <-- N round-trips
```
**Fix.** Single `execute(insert(User), [...])` OR commit after the loop. For bulk operations: `session.add_all(users); await session.commit()`.

### 4. N+1 queries in handlers
**Symptom.** Admin `/stats` takes 30 seconds for 10k users.
**Cause.**
```python
for sub in active_subs:
    user = await user_repo.get(sub.user_id)   # <-- N queries
    await bot.send_message(user.tg_id, text)
```
**Fix.** Eager-load via `selectinload(Subscription.user)` OR paginate IN batches of 100.

### 5. Broadcast without throttle
**Symptom.** Bot gets `TelegramRetryAfter(300)` mid-broadcast. Thousands of messages lost.
**Cause.** `asyncio.gather(*[bot.send_message(u) for u in all_users])` — fires 10k requests in < 1 sec.
**Fix.** `asyncio.Semaphore(25)` + `asyncio.sleep(1/25)` between sends. See `patterns.md #9 BroadcastService`.

---

## Database

### 6. f-string SQL injection
**Symptom.** Occasional admin gets dropped tables. Payment order mysteriously changes.
**Cause.**
```python
cursor.execute(f"SELECT * FROM users WHERE id = {user_id}")
```
**Fix.** Always parameterized:
```python
await session.execute(select(User).where(User.id == user_id))
# or raw with binds:
await session.execute(text("SELECT * FROM users WHERE id = :uid"), {"uid": user_id})
```

### 7. Missing migration after model change
**Symptom.** Staging deploy fails: `column does not exist`. Fresh database works.
**Cause.** Added a field to `models/user.py`, forgot `alembic revision --autogenerate`.
**Fix.** Pre-commit hook that diffs models vs last migration, fails CI if out of sync.

### 8. SQLite in production
**Symptom.** `database is locked` errors under concurrent writes. Webhook responses drop to 3/sec.
**Cause.** BotForge Lite mode was left in place for prod deploy.
**Fix.** Switch to Postgres. SQLite is only for local dev OR strictly <10 concurrent users.

### 9. Connection pool too small
**Symptom.** `QueuePool limit of size 5 overflow 10 reached, connection timed out`.
**Cause.** Default pool_size=5 under webhook mode with 50 concurrent updates.
**Fix.** For webhook prod: `pool_size=20, max_overflow=40, pool_pre_ping=True`. Add `pool_recycle=1800` to avoid stale connections after 30 min idle.

### 10. No Alembic baseline for existing schema
**Symptom.** CI can't run migrations on empty DB — first migration assumes tables exist.
**Cause.** Skill generated `__init__` migration AFTER manually creating schema.
**Fix.** Always generate baseline FIRST, apply to empty DB, then add columns in follow-up migrations.

---

## Payments

### 11. Non-idempotent webhook handler
**Symptom.** User's subscription extended by 60 days after one payment. Refund requests.
**Cause.** Payment provider retries webhook on network blip, handler activates subscription twice.
**Fix.** `PaymentRepo.is_processed(external_id)` check at the start:
```python
if await payments.is_processed(event.external_id):
    return  # idempotent no-op
```

### 12. Payment amount as `float`
**Symptom.** Customer charged 999.9999999999 RUB. Auditor flags rounding errors.
**Cause.** `amount: float = 999.99`.
**Fix.** Always `decimal.Decimal` for money. `Mapped[Decimal] = mapped_column(Numeric(12, 2))`.

### 13. Grant access before payment `succeeded`
**Symptom.** Users with `status=pending` access VIP content. Actual charge never completes.
**Cause.**
```python
await subscriptions.activate(user_id, ...)  # <-- too early
await provider.charge(...)                   # <-- may fail
```
**Fix.** Grant ONLY inside `on_successful_payment` handler after status == "succeeded".

### 14. Logging card details or tokens
**Symptom.** Security audit fails PCI DSS. Enterprise deal blocked.
**Cause.**
```python
log.info("payment created", data=request_payload)  # <-- contains card/token
```
**Fix.** Sentry `before_send` filter + explicit scrubbing:
```python
SENSITIVE = {"card", "cvv", "token", "password", "jwt"}
def scrub(payload: dict) -> dict:
    return {k: "***" if k in SENSITIVE else v for k, v in payload.items()}
```

---

## Telegram API

### 15. Callback data over 64 bytes
**Symptom.** `BUTTON_DATA_INVALID` errors. User taps button, nothing happens.
**Cause.** `callback_data=f"buy_{user_id}_{product_id}_{timestamp}_{variant}"` — exceeds 64 bytes.
**Fix.** `CallbackData` factory (aiogram 3) with compact keys. Store long state in Redis, pass only a short ID in callback.

### 16. Message text over 4096 chars
**Symptom.** `MESSAGE_TOO_LONG` error. AI bot fails to send long GPT responses.
**Cause.** No length check before `bot.send_message`.
**Fix.** Split helper:
```python
def split_message(text: str, limit: int = 4096) -> list[str]:
    return [text[i:i+limit] for i in range(0, len(text), limit)]
```

### 17. MarkdownV2 with unescaped user input
**Symptom.** `Bad Request: can't parse entities`. Sporadic, depends on what users type.
**Cause.** `await msg.answer(f"Hello {user.name}!", parse_mode="MarkdownV2")` when `user.name` contains `_` or `.`.
**Fix.** Use HTML parse mode (fewer escape rules) OR run `md2_escape` on all user input.

### 18. Webhook without `secret_token` check
**Symptom.** Attacker sends forged updates, bot acts as if user did something.
**Cause.** Accepting all webhook requests without validating `X-Telegram-Bot-Api-Secret-Token` header.
**Fix.** aiogram 3 `SimpleRequestHandler(secret_token=settings.webhook_secret)` does the check automatically — just pass the token.

### 19. `pre_checkout_query` not answered
**Symptom.** User sees "payment failed" in Telegram Stars flow after tapping Pay.
**Cause.** Handler for `pre_checkout_query` missing OR exceptions silently swallowed.
**Fix.** Always handle:
```python
@router.pre_checkout_query()
async def on_pcq(q: PreCheckoutQuery) -> None:
    await q.answer(ok=True)   # must respond within 10 seconds
```

---

## State & lifecycle

### 20. FSM state in `MemoryStorage` in production
**Symptom.** Bot restart loses all users mid-flow. Customers furious at re-entering details.
**Cause.** aiogram default `MemoryStorage` is RAM-only.
**Fix.** `RedisStorage(Redis.from_url(settings.redis_url))` for all prod deployments.

### 21. Forgotten `shutdown` cleanup
**Symptom.** Warnings: `aiohttp client session was not closed`. Connection leaks.
**Cause.** `dp.shutdown.register(on_shutdown)` missing `await bot.session.close()` and `await redis.aclose()`.
**Fix.** Proper shutdown:
```python
async def on_shutdown(bot: Bot) -> None:
    await bot.session.close()
    await redis.aclose()
```

### 22. `asyncio.create_task(forever_loop)` in handler
**Symptom.** Background task dies silently at some point. Features degrade.
**Cause.** Spawning long-running tasks inside a handler; when handler finishes, Python may garbage-collect the task reference.
**Fix.** Use proper scheduler (APScheduler / arq). See `references/scheduler.md`.

---

## Mini Apps

### 23. Trusting `initDataUnsafe` on client
**Symptom.** Anyone can forge user_id and see any user's data.
**Cause.** `fetch("/api/me", { headers: { userId: window.Telegram.WebApp.initDataUnsafe.user.id }})`.
**Fix.** Send raw `initData` to server, validate HMAC, return JWT. Never trust `initDataUnsafe` for auth.

### 24. CORS `"*"` on Mini App backend
**Symptom.** Any website can call your API with user's JWT.
**Cause.** `cors_origins=["*"]` in FastAPI config.
**Fix.** Whitelist only Mini App origin: `cors_origins=[settings.webapp_url]`.

### 25. JWT without TTL
**Symptom.** Stolen token valid forever. User complains about strangers in account.
**Cause.** `jwt.encode({"sub": user_id})` without `exp` claim.
**Fix.** `exp = now + 12 hours`, refresh flow for longer sessions.

---

## Observability & deploy

### 26. `print()` instead of logger
**Symptom.** In Kubernetes / Docker logs, can't filter by level. Log aggregator charges for noise.
**Cause.** Developer habit from REPL.
**Fix.** `log = structlog.get_logger()`. `ruff` rule `T201` bans `print`.

### 27. Dockerfile runs as root
**Symptom.** Security scan flags container. Enterprise customer blocks deploy.
**Cause.** No `USER` instruction in Dockerfile — default is root.
**Fix.** Multi-stage with non-root user:
```
RUN groupadd -r app && useradd -r -g app app
USER app
```

### 28. No healthcheck
**Symptom.** Docker/Fly/Railway don't know when bot is stuck. Restarts never happen.
**Cause.** Missing `HEALTHCHECK` instruction or `/healthz` endpoint.
**Fix.** `docker-compose.yml` with `healthcheck:` block. aiohttp `GET /healthz` returning 200.

---

## Security

### 29. Token in git history
**Symptom.** Telegram revokes token. Bot stops working. Hours to recover.
**Cause.** Developer committed `.env` once, removed it, pushed — but git remembers.
**Fix.** Run `git filter-repo` to purge history. Rotate token via @BotFather. Add `.env` to `.gitignore` FIRST, always.

### 30. No rate limit on auth endpoint
**Symptom.** Brute-force attacks on `/auth/telegram` rack up OpenAI bills.
**Cause.** No throttling middleware on auth.
**Fix.** Redis-backed rate limit: `10 requests / minute per IP`.

---

## Testing

### 31. Mocked tests that pass but prod fails
**Symptom.** 95% test coverage but every deploy breaks something.
**Cause.** Over-mocked unit tests that don't exercise real DB / real HTTP.
**Fix.** Integration tests with `testcontainers-postgres`. Real HTTP via `respx` (validates URL / payload shape).

### 32. No idempotency test for payment webhook
**Symptom.** Duplicate-webhook bug ships to prod.
**Cause.** Tests check "successful_payment → subscription active". Don't test "successful_payment called twice → subscription still valid once".
**Fix.** See `examples/01-vip-media-bot/tests/unit/test_payment_service.py::test_duplicate_webhook_is_idempotent`.

---

## UX Navigation

### 33. Dead inline button
**Symptom.** User taps a visible button and nothing useful happens; Telegram spinner hangs or an error is logged.
**Cause.** Keyboard exposes `callback_data`, but no handler is registered; handler forgot `call.answer()`; or feature was left as a hidden TODO.
**Fix.** Every button must map to a handler, URL, or web_app target. Add a route test that enumerates keyboard callbacks and verifies handler coverage.

### 34. No way back from nested flow
**Symptom.** User lands on a payment/profile/admin/FSM screen and must type `/start` to recover.
**Cause.** Screen has only a primary action; FSM has no cancel transition; reply keyboard remains after the flow.
**Fix.** Add `Back`, `Main menu`, or `Cancel` to every non-root screen. Clear FSM state and remove/resize reply keyboards when leaving the flow.

---

## How to use this list

When generating code: mentally check the list against each file you write.
When reviewing code (`/botforge-review`): run through the catalog, flag matches with `[major]` or `[blocker]`.
When a new pattern bites you in prod: add it here with a PR. This catalog grows with community experience.
