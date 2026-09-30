---
name: observability
description: Complete reference documentation and practical guide.
---

# Observability — Logging, Metrics, Tracing, Alerts

Production-бот без observability = слепой. Три слоя: **логи**, **метрики**, **алерты**. Trace — опционально.

---

## 1. Structured logging (structlog)

**Почему structlog:** JSON-output, bind-context, совместимость со stdlib. Подхватывается Grafana Loki, Datadog, CloudWatch без трансформаций.

### Setup
```python
# app/config/logging.py
import logging
import structlog
from app.config.settings import settings

def configure_logging() -> None:
    logging.basicConfig(
        format="%(message)s",
        level=settings.log_level,
    )
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            logging.getLevelName(settings.log_level)),
    )
```

### Request-id middleware
```python
# app/middlewares/logging.py
import uuid
import structlog
from aiogram import BaseMiddleware

log = structlog.get_logger()

class LoggingMiddleware(BaseMiddleware):
    async def __call__(self, handler, event, data):
        rid = uuid.uuid4().hex[:12]
        user = getattr(event, "from_user", None)
        structlog.contextvars.bind_contextvars(
            request_id=rid,
            user_id=user.id if user else None,
            update_type=event.__class__.__name__,
        )
        try:
            log.info("update.received")
            result = await handler(event, data)
            log.info("update.handled")
            return result
        except Exception:
            log.exception("update.failed")
            raise
        finally:
            structlog.contextvars.clear_contextvars()
```

### Rules
- Никаких f-strings в сообщениях — ключи + values
- Никогда не логируй `bot_token`, card numbers, email полностью, initData hash
- Уровни: `DEBUG` (local), `INFO` (staging), `WARNING`+ (prod) — через `LOG_LEVEL` env

---

## 2. Sentry (error tracking)

```python
# app/config/logging.py (дополнение)
import sentry_sdk
from sentry_sdk.integrations.logging import LoggingIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

def configure_sentry() -> None:
    if not settings.sentry_dsn:
        return
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.env,
        release=settings.release_tag,
        traces_sample_rate=0.1,
        send_default_pii=False,
        integrations=[
            LoggingIntegration(level=logging.INFO, event_level=logging.ERROR),
            SqlalchemyIntegration(),
        ],
        before_send=_scrub_sensitive,
    )

def _scrub_sensitive(event, hint):
    # remove bot_token, api_key patterns from extra
    for k in ("bot_token", "api_key", "jwt", "password"):
        event.get("extra", {}).pop(k, None)
    return event
```

---

## 3. Metrics (Prometheus)

```python
# app/bot/metrics.py
from prometheus_client import Counter, Histogram, Gauge

UPDATES = Counter("bot_updates_total", "Updates received", ["type"])
HANDLER_SECONDS = Histogram("bot_handler_seconds", "Handler duration", ["handler"])
TG_API_ERRORS = Counter("tg_api_errors_total", "Telegram API errors", ["code"])
BROADCAST_PROGRESS = Gauge("broadcast_progress", "Broadcast progress", ["job_id"])
PAYMENT_EVENTS = Counter("payment_events_total", "Payments", ["provider", "status"])
```

Expose `/metrics` endpoint через отдельный aiohttp-server на порту, не публичном наружу.

### Default grafana panels
- Updates per second (by type)
- p50/p95/p99 handler latency
- Error rate (by exception class)
- Payment success rate (by provider)
- Broadcast throughput (msg/s)
- Bot memory / CPU (cAdvisor)
- Postgres connections / query latency (postgres_exporter)
- Redis ops/s (redis_exporter)

---

## 4. Alerts

| Alert | Threshold | Action |
|---|---|---|
| Error rate > 5% за 5 мин | warn | Slack |
| Error rate > 20% за 2 мин | critical | PagerDuty |
| `TelegramUnauthorizedError` любой | critical | токен отозван — ротировать |
| `getWebhookInfo.last_error_date` != null | warn | проверить webhook |
| Payment success rate < 90% | warn | проверить webhook провайдера |
| DB connection pool exhausted | critical | scale up или fix leak |
| Redis down | critical | FSM и throttling недоступны |
| Broadcast stuck >10 мин | warn | проверить worker |

---

## 5. Tracing (OpenTelemetry, опционально)

Для SaaS с Mini App полезно трассировать `frontend → api → bot-handler`. Минимальный setup:

```python
# api/main.py
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor

FastAPIInstrumentor.instrument_app(app)
SQLAlchemyInstrumentor().instrument(engine=engine)
HTTPXClientInstrumentor().instrument()
```

OTLP exporter → Jaeger / Tempo / Datadog.

---

## 6. Audit log (business events, отдельно от технических)

```python
# app/models/audit.py
class AuditEvent(Base, TimestampMixin):
    __tablename__ = "audit_events"
    id: Mapped[int] = mapped_column(primary_key=True)
    actor_id: Mapped[int | None] = mapped_column(index=True)
    action: Mapped[str] = mapped_column(index=True)
    target_type: Mapped[str | None]
    target_id: Mapped[str | None]
    payload: Mapped[dict] = mapped_column(JSONB, default=dict)
```

Пишем при: role change, ban, broadcast send, payment refund, settings update. Храним минимум 1 год.

---

## 7. Health & readiness

```python
# bot/health.py
from aiohttp import web

async def health(request):
    return web.json_response({"status": "ok"})

async def ready(request):
    try:
        async with session_factory() as s:
            await s.execute(text("SELECT 1"))
        await redis.ping()
    except Exception as e:
        return web.json_response({"status": "down", "error": str(e)}, status=503)
    return web.json_response({"status": "ready"})
```

Docker/Fly/Railway → `GET /healthz` каждые 30 сек.

---

## 8. Log retention

- Dev: stdout → terminal
- Staging: 7 дней в Loki / CloudWatch
- Prod: 30 дней warm + 1 год cold (S3/Glacier)
- Audit events: ≥1 год в БД + backup

---

## 9. Observability checklist

- [ ] structlog JSON-output настроен
- [ ] request_id bindовится в middleware
- [ ] Sentry подключён (если не локально)
- [ ] Чувствительные данные фильтруются before_send
- [ ] `/metrics` endpoint закрыт от публичного доступа
- [ ] Healthcheck отвечает
- [ ] Alerting правила созданы (минимум error rate + webhook last_error)
- [ ] Audit log пишется для всех admin-действий
- [ ] Log retention соответствует requirements (GDPR!)
