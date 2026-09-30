---
name: analytics
description: Complete reference documentation and practical guide.
---

# Analytics — Product Analytics Reference

Понимание, что делают пользователи — критично для роста. Telegram-боты сложнее веба: нет стандартного trackера. BotForge рекомендует PostHog / Mixpanel / Amplitude.

## 1. Выбор инструмента

| | PostHog | Mixpanel | Amplitude | Свой Postgres |
|---|---|---|---|---|
| Self-hosted | ✅ | ❌ | ❌ | ✅ |
| Бесплатный tier | 1M events/mo | 20M | 10M | бесконечный |
| SQL-access | ✅ | доп. | доп. | нативный |
| Funnels / cohorts | ✅ | ✅ | ✅ | manually |
| Session replay | ✅ (для Mini App) | ✅ | ❌ | — |
| GDPR-friendly | EU-hosted | частично | частично | полностью |

**Default BotForge:** PostHog (self-hosted EU-регион) для ботов с EU-audience; Postgres-events для максимального контроля.

## 2. Architecture

```
handlers → services → AnalyticsService.track(event) → IntegrationQueue (Redis)
                                                      ↓ worker
                                                   PostHog / Mixpanel API
```

Async fire-and-forget — трекинг не должен блокировать UX.

## 3. Events taxonomy (стандартный набор)

```
user.signup                     # first /start
user.activated                  # выполнил core action (подписка на канал, покупка)
session.start                   # первое сообщение за 30+ мин
command.executed                { command: str, args: str }
button.clicked                  { callback_data: str }
vip.viewed                      # открыл VIP-экран
vip.purchase_initiated
vip.purchase_completed          { amount, currency, provider }
vip.purchase_failed             { reason }
subscription.renewed
subscription.cancelled
subscription.expired
broadcast.received              { broadcast_id, segment }
broadcast.clicked               { broadcast_id, link_id }
error.occurred                  { handler, error_class }
```

Naming: `object.action` в past tense / snake_case.

## 4. Implementation — AnalyticsService

```python
# app/integrations/analytics_client.py
from abc import ABC, abstractmethod
from dataclasses import dataclass

@dataclass(frozen=True)
class Event:
    user_id: int
    name: str
    properties: dict
    timestamp: float | None = None

class AnalyticsClient(ABC):
    @abstractmethod
    async def track(self, event: Event) -> None: ...
    @abstractmethod
    async def identify(self, user_id: int, traits: dict) -> None: ...


class PostHogClient(AnalyticsClient):
    def __init__(self, api_key: str, host: str = "https://eu.posthog.com") -> None:
        self._client = httpx.AsyncClient(timeout=5, base_url=host)
        self._key = api_key

    async def track(self, event: Event) -> None:
        await self._client.post("/capture/", json={
            "api_key": self._key,
            "event": event.name,
            "distinct_id": str(event.user_id),
            "properties": event.properties,
            "timestamp": event.timestamp,
        })

    async def identify(self, user_id: int, traits: dict) -> None:
        await self._client.post("/capture/", json={
            "api_key": self._key,
            "event": "$identify",
            "distinct_id": str(user_id),
            "$set": traits,
        })
```

## 5. Non-blocking tracking

Вариант А — fire-and-forget:
```python
# app/services/analytics_service.py
import asyncio

class AnalyticsService:
    def __init__(self, client: AnalyticsClient) -> None:
        self._client = client

    def track_async(self, event: Event) -> None:
        asyncio.create_task(self._track_safe(event))

    async def _track_safe(self, event: Event) -> None:
        try:
            await self._client.track(event)
        except Exception as e:
            log.warning("analytics.failed", event=event.name, error=str(e))
```

Вариант Б — buffered через Redis queue (для high-traffic):
```python
async def track_async(self, event: Event) -> None:
    await self._redis.xadd("analytics:events", {"data": json.dumps(asdict(event))})
# worker consumes stream in batches of 100
```

## 6. Key funnels для бота

### Activation funnel
```
/start → главное меню открыл → VIP экран → buy-click → successful_payment
```

Коэффициенты переходов — показатель UX. Если 80% отваливаются на VIP-экране → либо цена высокая, либо preview плохо объясняет ценность.

### Retention
- D1 (вернулся на следующий день)
- D7 (через неделю)
- D30 (через месяц)

Для подписочных ботов D30 = ключевая метрика. Cohort-анализ по каналам привлечения.

### Monetization
- ARPU (average revenue per user)
- Conversion (paid / total)
- LTV (lifetime value)
- Churn rate

## 7. UTM tracking через deep-links

```python
# генерация utm-ссылки
from app.utils.deeplink import pack_ref

link = f"https://t.me/your_bot?start={pack_ref({'utm_source': 'tg_channel', 'utm_campaign': 'spring2026'})}"

# handler
@router.message(CommandStart(deep_link=True))
async def cmd_start_ref(msg, command):
    utm = unpack_ref(command.args)
    await analytics.track(Event(
        user_id=msg.from_user.id,
        name="user.signup",
        properties={"utm_source": utm.get("utm_source"), ...},
    ))
```

## 8. A/B testing

Feature flags:
```python
# app/services/feature_flags.py
class FeatureFlags:
    def variant(self, user_id: int, flag: str, variants: list[str]) -> str:
        h = hashlib.md5(f"{flag}:{user_id}".encode()).digest()
        idx = int.from_bytes(h[:4]) % len(variants)
        return variants[idx]

# в handler
variant = flags.variant(user.id, "onboarding_v2", ["original", "new"])
await analytics.track(Event(user_id=user.id, name="experiment.viewed",
                            properties={"experiment": "onboarding_v2",
                                        "variant": variant}))
if variant == "new":
    await msg.answer(NEW_ONBOARDING_TEXT)
else:
    await msg.answer(ORIGINAL_TEXT)
```

Посмотрите conversion по variant в PostHog experiments.

## 9. Dashboards

Обязательные для мониторинга (в PostHog / Grafana):

1. **DAU / MAU / WAU**
2. **Activation rate** (D0 → D1)
3. **Retention by cohort** (weekly cohorts)
4. **Top commands** (что используется больше всего)
5. **Error rate** (error.occurred / total events)
6. **Revenue daily** (payment.completed с amount)
7. **Funnel: /start → activation → first_payment**

## 10. Privacy

- НЕ трекать content сообщений (только event + structural properties)
- Анонимизация: не отправлять `username` в analytics, только `user_id` hash
- Respect `/privacy_delete`: при удалении user-а → delete события в analytics (PostHog API `DELETE /api/projects/:pid/persons/:pid/`)
- Cookie banner в Mini App при использовании PostHog

## 11. Analytics checklist

- [ ] AnalyticsClient с async track & identify
- [ ] Fire-and-forget wrapper, не блокирует UX
- [ ] Events taxonomy задокументирована в `docs/ANALYTICS.md`
- [ ] UTM-параметры pack/unpack через signed deep-links
- [ ] A/B framework с user-based bucketing
- [ ] Privacy: не трекаем content, только structure
- [ ] Rate limit: не > 100 events/user/hour (защита от event storm)
- [ ] Dashboards: DAU, retention, funnel, revenue

## Anti-patterns

- ❌ Блокирующий `await analytics.track()` в handler — замедляет UX
- ❌ Трекать каждую клавиатуру (event explosion)
- ❌ Полные тексты в `properties` (privacy leak)
- ❌ Один analytics flag в `.env` без опциональности — dev запустит и засчитает mock-events
- ❌ Трекать через `os.getenv("ANALYTICS_KEY")` в коде — всегда через settings
