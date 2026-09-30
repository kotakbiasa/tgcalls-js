---
name: performance
description: Complete reference documentation and practical guide.
---

# Performance & Scaling — Reference

Telegram-боты ограничены не CPU, а I/O и rate limits. Оптимизация = параллелизм + кэш + batch + connection pooling.

## 1. Database connection pool

```python
# app/db/engine.py
from sqlalchemy.ext.asyncio import create_async_engine

engine = create_async_engine(
    settings.database_url,
    pool_size=20,                  # одновременных соединений
    max_overflow=40,               # короткие всплески
    pool_pre_ping=True,            # auto-reconnect после idle disconnect
    pool_recycle=1800,             # пересоздавать соединения каждые 30 мин
)
```

**Правило размера pool:**
- `pool_size` ≥ количество concurrent webhook requests × 1.5
- Для 10k MAU с webhook: pool_size=20, max_overflow=40 — обычно достаточно
- Мониторить через `pool.status()` в Prometheus

## 2. N+1 queries — главный враг

❌ Плохо:
```python
subs = await repo.all_active_subscriptions()
for sub in subs:
    user = await user_repo.get(sub.user_id)   # N запросов!
    await bot.send_message(user.tg_id, "…")
```

✅ Хорошо — eager loading:
```python
from sqlalchemy.orm import selectinload

stmt = select(Subscription).options(
    selectinload(Subscription.user)
).where(Subscription.status == "active")
subs = (await session.execute(stmt)).scalars().all()
```

## 3. Batch operations

Массовая вставка:
```python
# ❌ 1000 индивидуальных insert
for u in users:
    session.add(u); await session.commit()

# ✅ один execute с bulk
await session.execute(insert(User), [u.dict() for u in users])
await session.commit()
```

Массовое обновление:
```python
await session.execute(
    update(Subscription)
    .where(Subscription.expires_at < now)
    .values(status="expired")
)
```

## 4. Async concurrency (параллельные I/O)

```python
# ❌ последовательно, каждая задача ждёт предыдущую
for user_id in users:
    await fetch_profile(user_id)

# ✅ параллельно (до 50 одновременно)
import asyncio
sem = asyncio.Semaphore(50)

async def _fetch(uid):
    async with sem:
        return await fetch_profile(uid)

results = await asyncio.gather(*[_fetch(u) for u in users])
```

## 5. Caching стратегии

### In-memory LRU для горячих данных
```python
from functools import lru_cache

@lru_cache(maxsize=1024)
def parse_prices() -> dict:
    # 1-time computation, in-process cache
    ...
```

### Redis для кросс-процессного
```python
async def get_user_tier(user_id: int) -> str:
    key = f"tier:{user_id}"
    cached = await redis.get(key)
    if cached:
        return cached.decode()
    tier = await _compute_tier(user_id)     # expensive
    await redis.set(key, tier, ex=300)      # 5 мин TTL
    return tier
```

### Инвалидация
- Write-through: обновляй cache одновременно с БД
- TTL: проще всего, но eventually consistent
- Pub/sub invalidation: Redis publish при изменении → subscribers чистят локальный cache

## 6. Telegram API batching

### file_id reuse
Никогда не upload-ить одно и то же фото дважды. При первом `send_photo` сохраните `message.photo[-1].file_id` → все последующие отправки это `file_id`, без загрузки.

```python
if not content.media_file_id:
    msg = await bot.send_photo(admin_chat, photo=FSInputFile(content.local_path))
    content.media_file_id = msg.photo[-1].file_id
    await repo.save(content)
else:
    await bot.send_photo(target, photo=content.media_file_id)
```

### Media groups вместо серии send_photo
```python
# ❌ 10 отдельных updates
for photo in photos[:10]:
    await bot.send_photo(chat_id, photo.file_id)

# ✅ один update
await bot.send_media_group(chat_id, media=[
    InputMediaPhoto(media=p.file_id) for p in photos[:10]
])
```

## 7. Broadcast throttling (критично при 1000+ получателей)

```python
# правильный throughput
SEND_RATE = 25  # msg/sec (safe под лимитом 30)
sem = asyncio.Semaphore(SEND_RATE)
tick = asyncio.sleep(1 / SEND_RATE)

async def _send_one(uid):
    async with sem:
        try:
            await bot.send_message(uid, text)
        except TelegramRetryAfter as e:
            await asyncio.sleep(e.retry_after)
            await bot.send_message(uid, text)
        except TelegramForbiddenError:
            await mark_blocked(uid)
        finally:
            await tick

await asyncio.gather(*[_send_one(u) for u in user_ids])
```

Для **очень больших** рассылок (100k+) — очередь (arq / Celery) с множеством воркеров, каждый держит свой rate limit.

## 8. Webhook vs polling performance

| | Polling | Webhook |
|---|---|---|
| Latency | 1-5 сек | < 100ms |
| Нагрузка на бот | постоянные getUpdates | только при апдейте |
| Масштабирование | 1 инстанс | N инстансов за nginx |
| Сложность | минимум | сервер + TLS |

Для prod всегда webhook. Polling — только local dev.

## 9. Memory management

### Утечки через замыкания в хэндлерах
```python
# ❌ утечка: все handlers держат reference на big_dataset
big_dataset = load_10gb()

@router.message()
async def handler(msg):
    if msg.text in big_dataset: ...

# ✅ вынести в сервис с weakref или перезагружать
```

### Connection лимит PostgreSQL
Heroku free — 20 connections. AWS RDS t3.micro — 80-160. Если больше ботов → `pgbouncer` перед Postgres.

## 10. Horizontal scaling (несколько инстансов)

Для webhook — load balancer (nginx / Caddy) → N реплик бота. Каждая реплика stateless: сессия в Redis, данные в Postgres.

**Нюанс**: `long_polling` c одним BOT_TOKEN работает только с **одним** инстансом — второй получит 409 Conflict. Webhook лимита нет.

```yaml
# docker-compose.prod.yml
services:
  bot:
    image: botforge-app
    deploy:
      replicas: 3
  nginx:
    image: nginx
    # round-robin на bot:8080
```

## 11. Profiling & finding bottlenecks

### async-сложные места
```bash
pip install aiomonitor
```

### HTTP latency
```python
import httpx

async with httpx.AsyncClient(
    timeout=httpx.Timeout(10.0, connect=2.0),
    limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
) as client:
    ...
```

### SQL slow queries
```python
# pyproject.toml [tool.sqlalchemy]
echo = False  # не в prod; для debug — True

# в проде — pg_stat_statements:
# SELECT query, total_exec_time, calls FROM pg_stat_statements
#   ORDER BY total_exec_time DESC LIMIT 10;
```

## 12. Performance checklist

- [ ] Connection pool настроен (pool_size ≥ 20 для webhook prod)
- [ ] N+1 queries устранены (`selectinload` / `joinedload`)
- [ ] file_id закэшированы для повторяющихся медиа
- [ ] Broadcasts ≤ 25 msg/s
- [ ] `asyncio.Semaphore` на всех gather-ах external I/O
- [ ] `httpx` client переиспользуется, не создаётся на каждый запрос
- [ ] Таймауты на всех http-вызовах (максимум 10s)
- [ ] Prometheus метрики: handler latency p95, pool size, Redis hit rate
- [ ] Alert: handler latency > 2s, pool exhaustion
- [ ] `pgbouncer` при количестве реплик > 10

## Anti-patterns

- ❌ Синхронный вызов в async-хэндлере (`time.sleep`, `requests.get`)
- ❌ `session.commit()` в цикле вместо batch
- ❌ Открывать новый HTTP-client на каждый вызов
- ❌ Читать всю таблицу `users` в память вместо pagination
- ❌ Логировать PII в INFO-level при 10k msg/s (forward tax)
