---
name: scheduler
description: Complete reference documentation and practical guide.
---

# Scheduled Tasks — Reference

Отложенные задачи: рассылки, проверка истечения подписок, напоминания, агрегации метрик.

## Выбор инструмента

| Инструмент | Когда |
|---|---|
| **APScheduler** (in-process) | <100 задач/сутки, single-instance бот |
| **arq** (Redis queue) | 100+ задач/сутки, надо retry/priority |
| **Celery Beat** | Уже есть Celery в проекте |
| **Cron + CLI-команда** | Простейшие ежедневные таски |
| **pg_cron** (в Postgres) | Только БД-операции без сети |

**Default BotForge:** `arq` для Pro/SaaS, APScheduler для Lite.

---

## 1. APScheduler (in-process)

```python
# app/scheduler/setup.py
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from app.scheduler.tasks import expire_subscriptions, send_reminders


def build_scheduler() -> AsyncIOScheduler:
    sch = AsyncIOScheduler(timezone="UTC")
    sch.add_job(expire_subscriptions, IntervalTrigger(minutes=15),
                id="expire_subs", replace_existing=True)
    sch.add_job(send_reminders, CronTrigger(hour=9, minute=0),
                id="morning_reminders", replace_existing=True)
    return sch
```

```python
# app/bot/lifespan.py
from app.scheduler.setup import build_scheduler

scheduler = None

async def on_startup(bot):
    global scheduler
    scheduler = build_scheduler()
    scheduler.start()

async def on_shutdown(bot):
    if scheduler:
        scheduler.shutdown(wait=False)
```

**Минусы:** задачи теряются при рестарте, не масштабируются между репликами.

---

## 2. arq (Redis queue, масштабируется)

```python
# app/workers/worker.py
from arq.connections import RedisSettings

from app.config.settings import settings
from app.workers.tasks import (
    expire_subscriptions,
    send_broadcast_chunk,
    send_reminder,
)


class WorkerSettings:
    functions = [expire_subscriptions, send_broadcast_chunk, send_reminder]
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    cron_jobs = [
        # arq.cron import CronJob
        # CronJob(coroutine=expire_subscriptions, minute=0, hour={0, 12}),
    ]
    max_tries = 3
    job_timeout = 60
```

```python
# app/workers/tasks.py
from datetime import UTC, datetime

async def expire_subscriptions(ctx) -> int:
    # ctx.session, ctx.bot — прокинуты через on_startup worker-а
    n = await ctx["subs_repo"].expire_before(datetime.now(UTC))
    return n

async def send_reminder(ctx, user_id: int, text: str) -> None:
    await ctx["bot"].send_message(user_id, text)
```

### Enqueue из handler
```python
# services/reminder_service.py
from arq.connections import ArqRedis

class ReminderService:
    def __init__(self, arq: ArqRedis) -> None:
        self._arq = arq

    async def schedule(self, user_id: int, text: str, at: datetime) -> None:
        await self._arq.enqueue_job("send_reminder", user_id, text,
                                    _defer_until=at)
```

### docker-compose
```yaml
worker:
  build: .
  command: arq app.workers.worker.WorkerSettings
  env_file: .env
  depends_on:
    - redis
    - postgres
```

---

## 3. Cron + CLI entry

Для простых периодических задач (раз в сутки):

```python
# app/cli/tasks.py
import asyncio
import click

@click.group()
def cli(): ...

@cli.command()
def expire_subs():
    asyncio.run(_expire_subs())

async def _expire_subs():
    async with session_factory() as session:
        await SubRepo(session).expire_before(datetime.now(UTC))

if __name__ == "__main__":
    cli()
```

Crontab:
```
0 */6 * * * docker compose exec bot python -m app.cli.tasks expire-subs
```

---

## 4. Типовые задачи бота

### Истечение подписок
Каждые 15 минут — пометить `status=expired` у `expires_at < now`. Отправить уведомление за 3 дня / 1 день до истечения.

### Отложенные рассылки
`scheduled_at` в `broadcasts`. Воркер опрашивает `find_ready(now)` и диспатчит `send_broadcast_chunk(broadcast_id, user_ids_batch)`.

### Агрегация метрик
Раз в час — `daily_stats(date, new_users, active, revenue)`. Упрощает админ-дашборд.

### Напоминания (time-based triggers)
Через `_defer_until=at` в arq или `DateTrigger(run_date=at)` в APScheduler.

### Retention emails / push
Нет активности N дней → триггер-сообщение. Защита от spam: одна попытка за 30 дней.

---

## 5. Idempotency

Все периодические задачи должны быть **idempotent**:

```python
async def expire_subscriptions(ctx):
    async with ctx["session"].begin():
        # UPDATE ... WHERE expires_at < now AND status='active'
        # дважды выполнится — второй раз no-op
```

Для «событийных» задач (уведомления, инвойсы) — advisory-locks или `SELECT ... FOR UPDATE SKIP LOCKED`:

```python
from sqlalchemy import text

async def dispatch_pending(session):
    rows = await session.execute(text(
        "SELECT id FROM broadcasts "
        "WHERE scheduled_at <= now() AND status='scheduled' "
        "FOR UPDATE SKIP LOCKED LIMIT 10"))
```

---

## 6. Observability для scheduler

- Логировать старт/финиш каждой задачи с `job_name`, `duration_ms`, `result`
- Prometheus: `scheduler_job_duration_seconds{name=...}`, `scheduler_job_errors_total{name=...}`
- Alert: job не выполнялась >2× ожидаемого интервала

---

## 7. Security checklist

- [ ] Задачи не принимают секретов параметрами (только через context)
- [ ] Логи не содержат payload с чувствительными данными
- [ ] Retry с dead-letter-очередью (не бесконечный цикл)
- [ ] Timeouts заданы у каждой задачи
- [ ] Graceful shutdown: worker дожидается текущих job до N секунд

---

## Anti-patterns

- ❌ `asyncio.create_task(forever_loop)` в handler — убьётся вместе с handler'ом
- ❌ Глобальная переменная `scheduler` без cleanup
- ❌ Запуск одного воркера в двух репликах без координации (дубликаты)
- ❌ Cron-скрипт, поднимающий всё приложение ради одной таски (медленно)
- ❌ Писать тасками то, что должно быть триггером БД (`ON UPDATE`)
