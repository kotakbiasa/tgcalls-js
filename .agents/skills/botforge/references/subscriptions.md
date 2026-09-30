---
name: subscriptions
description: Complete reference documentation and practical guide.
---

# Recurring Subscriptions — Reference

Recurring biling для бота. Покрывает: Telegram Stars Subscriptions, Stripe, ЮKassa recurring.

## 1. Telegram Stars Subscriptions

Bot API поддерживает recurring через `createInvoiceLink(subscription_period=...)`. Цена списывается каждые N дней из баланса Stars пользователя.

```python
# app/integrations/payments/stars_subscription.py
from aiogram import Bot
from aiogram.types import LabeledPrice


async def create_stars_subscription(
    bot: Bot,
    title: str,
    description: str,
    price_stars: int,
    period_days: int,         # 30 для месяца; другие значения проверяйте по Bot API
    payload: str,
) -> str:
    return await bot.create_invoice_link(
        title=title[:32],
        description=description[:255],
        payload=payload,                  # ваш subscription_id
        currency="XTR",
        prices=[LabeledPrice(label=title[:32], amount=price_stars)],
        subscription_period=period_days * 86400,  # в секундах
        provider_token="",
    )
```

### Handling recurring payments

Каждая periodic charge приходит как `successful_payment` с тем же `invoice_payload`. Проверяйте idempotency по `telegram_payment_charge_id` (уникальный для каждой charge):

```python
@router.message(F.successful_payment)
async def on_sp(msg, session):
    sp = msg.successful_payment
    if await PaymentRepo(session).is_processed(sp.telegram_payment_charge_id):
        return
    # продлеваем подписку на period_days
```

### Cancel

Пользователь сам отменяет в Telegram UI. Вы получите `successful_payment` только когда он оплачивает. Если за 24ч после due date `successful_payment` не пришёл → считаем `canceled`.

## 2. Stripe Subscriptions

```python
# app/integrations/payments/stripe_subscription.py
import stripe

async def create_stripe_subscription(
    customer_id: str,
    price_id: str,            # preconfigured Price object in Stripe
    trial_days: int = 0,
) -> stripe.Subscription:
    return await stripe.Subscription.create_async(
        customer=customer_id,
        items=[{"price": price_id}],
        trial_period_days=trial_days or None,
        payment_behavior="default_incomplete",
        expand=["latest_invoice.payment_intent"],
    )
```

Webhook events для подписок:
- `customer.subscription.created`
- `customer.subscription.updated` — план, trial end
- `customer.subscription.deleted` — отмена
- `invoice.paid` — успешная periodic charge
- `invoice.payment_failed` — проблема с картой

## 3. ЮKassa auto-payments (recurring)

ЮKassa: после первой оплаты с `save_payment_method: true` вы получаете `payment_method_id`. Далее — списания через API:

```python
async def charge_recurring(user_payment_method_id: str, amount: Decimal) -> dict:
    r = await client.post(
        "https://api.yookassa.ru/v3/payments",
        auth=(shop_id, secret),
        headers={"Idempotence-Key": f"sub-{subscription_id}-{cycle_n}"},
        json={
            "amount": {"value": f"{amount:.2f}", "currency": "RUB"},
            "payment_method_id": user_payment_method_id,
            "capture": True,
            "description": "Auto-charge subscription",
        },
    )
    return r.json()
```

Scheduler-job раз в сутки находит due-подписки и запускает charge.

## 4. Data model

```python
# app/models/subscription.py
class Subscription(Base, TimestampMixin):
    __tablename__ = "subscriptions"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    plan: Mapped[str]
    status: Mapped[str]                   # trialing / active / past_due / canceled / expired
    provider: Mapped[str]                 # stars / stripe / yookassa
    provider_subscription_id: Mapped[str | None] = mapped_column(unique=True)

    current_period_start: Mapped[datetime]
    current_period_end: Mapped[datetime] = mapped_column(index=True)
    cancel_at_period_end: Mapped[bool] = mapped_column(default=False)
    trial_end: Mapped[datetime | None]

    # для proration / upgrade-downgrade:
    price_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    price_currency: Mapped[str]
```

## 5. State machine

```
(create)
   → trialing  → [trial expired] → active
               ↓ [card fail]      → past_due → [still fail] → canceled
   → active    → [renewed]        → active
               → [user cancels]   → canceled (end of period)
               → [card fail]      → past_due → [resolved] → active
                                             → [timeout]  → canceled
```

Переходы — в `SubscriptionService.handle_event(event)`. Каждый переход = строка в `audit_events`.

## 6. Proration (upgrade/downgrade posередине периода)

Формула:
```
credit = (unused_days / total_days) * current_price
new_charge = new_price - credit
```

Stripe делает proration автоматически при `Subscription.modify(..., proration_behavior="create_prorations")`. Для ЮKassa/Stars — ручной расчёт + scheduler для списания/зачисления.

## 7. Trials

- `trial_days` в настройках плана
- `trial_end = now + timedelta(days=trial_days)`
- `status = "trialing"`
- При `trial_end` наступает → первая charge. Если успешна → `active`, иначе → `past_due` → `canceled`.
- Лимит один trial на пользователя: проверка `user.has_had_trial_for(plan)` перед выдачей.

## 8. Failed payments retry

Dunning — последовательность попыток списания при `payment_failed`:

| Попытка | Задержка |
|---|---|
| 1 | immediately |
| 2 | +3 days |
| 3 | +5 days |
| final | +7 days → `canceled` |

Между попытками — отправить пользователю уведомление: «Обновите карту по ссылке ...».

## 9. Webhooks (обязательны)

Каждый провайдер шлёт webhook-и на изменения. Обработчик — **idempotent по `external_event_id`**:

```python
async def handle_event(self, provider: str, event_id: str, event_type: str, data: dict):
    if await self._events_repo.seen(provider, event_id):
        return
    await self._events_repo.mark_seen(provider, event_id, event_type)
    # route to handler ...
```

## 10. Security & compliance

- [ ] Webhook signature verified (Stripe-Signature, HMAC)
- [ ] `payment_method_id` никогда не логируется
- [ ] Card data **не проходит через ваш сервер** — только через widget провайдера
- [ ] PCI DSS: вы вне scope, если используете hosted checkout
- [ ] GDPR: при удалении пользователя — анонимизировать `customer_id`, не удалять payment history
- [ ] Refunds: идут через того же провайдера (`refundStarPayment` / `Refund.create` / ЮKassa refunds API)

## 11. UX рекомендации

- Показывайте в `/profile` следующую дату списания
- За 3 дня до renewal — напоминание
- После неудачной charge — сразу сообщение с кнопкой «Обновить карту»
- После `canceled` — grace period 7 дней для восстановления

## Anti-patterns

- ❌ Хранить дату `expires_at` без provider state — рассинхронизация
- ❌ Полагаться на local cron для charge (если webhook приходит позже — дубль)
- ❌ Удалять пользователя при cancel — только помечать `is_canceled`
- ❌ Использовать `current_period_end` для grant access без проверки `status`
