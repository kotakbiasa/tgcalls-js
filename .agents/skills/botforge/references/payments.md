---
name: payments
description: Complete reference documentation and practical guide.
---

# Payments — Unified Reference

Пять поддерживаемых провайдеров + единый интерфейс. Цель — менять провайдера одной строкой без переписывания бизнес-логики.

## Выбор провайдера

| Провайдер | Когда выбирать | Комиссия | Плюсы | Минусы |
|---|---|---|---|---|
| **Telegram Stars** | Digital goods, RU/мировой, простота | 0% внутри TG | Нулевая комиссия, встроенный checkout | Только digital, вывод через Fragment |
| **ЮKassa** | RU-аудитория, B2C | 2.8–3.5% | Карты/СБП/кошельки, РФ-фискализация | Только РФ |
| **CryptoBot** | Международная, анон, крипто | 1% | USDT/BTC/TON, без KYC | Не для всех ниш |
| **Stripe** | Global, карты/Apple Pay | 1.4–2.9% | Subscriptions, invoices, tax | Нет в РФ |
| **Tribute** | TG-каналы, подписки РФ | 5% | Простота для каналов | РФ-фокус |

## Единый интерфейс

```python
# app/integrations/payments/base.py
from abc import ABC, abstractmethod
from dataclasses import dataclass
from decimal import Decimal

@dataclass(frozen=True)
class InvoiceRequest:
    amount: Decimal
    currency: str              # "RUB", "USD", "XTR" (Stars), "USDT"
    description: str
    user_id: int
    order_id: str              # ваш внутренний id (idempotency)
    metadata: dict             # проваливается в webhook

@dataclass(frozen=True)
class InvoiceResult:
    provider: str              # "stars" | "yookassa" | "cryptobot" | "stripe"
    external_id: str
    pay_url: str | None        # None для Stars (payment через Telegram UI)
    raw: dict                  # исходный ответ провайдера

@dataclass(frozen=True)
class PaymentEvent:
    provider: str
    external_id: str
    order_id: str
    status: str                # "succeeded" | "pending" | "failed" | "refunded"
    amount: Decimal
    currency: str
    raw: dict

class PaymentProvider(ABC):
    name: str

    @abstractmethod
    async def create_invoice(self, req: InvoiceRequest) -> InvoiceResult: ...

    @abstractmethod
    async def verify_webhook(self, headers: dict, body: bytes) -> PaymentEvent: ...
```

## Telegram Stars (нативно в aiogram)

```python
# app/integrations/payments/stars.py
from decimal import Decimal
from aiogram import Bot
from aiogram.types import LabeledPrice
from .base import PaymentProvider, InvoiceRequest, InvoiceResult

class StarsProvider(PaymentProvider):
    name = "stars"

    def __init__(self, bot: Bot) -> None:
        self._bot = bot

    async def create_invoice(self, req: InvoiceRequest) -> InvoiceResult:
        # amount in Stars (XTR) is integer
        stars = int(req.amount)
        link = await self._bot.create_invoice_link(
            title=req.description[:32],
            description=req.description,
            payload=req.order_id,            # returned in SuccessfulPayment
            currency="XTR",
            prices=[LabeledPrice(label=req.description[:32], amount=stars)],
        )
        return InvoiceResult(
            provider=self.name, external_id=req.order_id,
            pay_url=link, raw={"link": link},
        )

    async def verify_webhook(self, headers, body):
        # Stars приходят как pre_checkout_query + successful_payment handlers,
        # а не через HTTP webhook. Используйте handlers ниже.
        raise NotImplementedError
```

**Stars handlers:**
```python
# app/handlers/payment.py
from aiogram import Router, F
from aiogram.types import PreCheckoutQuery, Message

router = Router(name="payment")

@router.pre_checkout_query()
async def on_pre_checkout(q: PreCheckoutQuery, payment_service) -> None:
    ok = await payment_service.can_accept(q.invoice_payload, q.total_amount)
    await q.answer(ok=ok, error_message=None if ok else "Заказ устарел")

@router.message(F.successful_payment)
async def on_payment(msg: Message, payment_service) -> None:
    sp = msg.successful_payment
    await payment_service.mark_succeeded(
        order_id=sp.invoice_payload,
        external_id=sp.telegram_payment_charge_id,
        amount=sp.total_amount,
        currency=sp.currency,
    )
    await msg.answer("Оплата прошла. Доступ открыт.")
```

## ЮKassa

```python
# app/integrations/payments/yookassa.py
import uuid
import httpx
from decimal import Decimal
from tenacity import retry, stop_after_attempt, wait_exponential
from .base import PaymentProvider, InvoiceRequest, InvoiceResult, PaymentEvent

class YookassaProvider(PaymentProvider):
    name = "yookassa"
    _base = "https://api.yookassa.ru/v3"

    def __init__(self, shop_id: str, secret_key: str, return_url: str) -> None:
        self._auth = (shop_id, secret_key)
        self._return = return_url
        self._client = httpx.AsyncClient(timeout=10)

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=5))
    async def create_invoice(self, req: InvoiceRequest) -> InvoiceResult:
        r = await self._client.post(
            f"{self._base}/payments",
            auth=self._auth,
            headers={"Idempotence-Key": req.order_id},
            json={
                "amount": {"value": f"{req.amount:.2f}", "currency": req.currency},
                "confirmation": {"type": "redirect", "return_url": self._return},
                "capture": True,
                "description": req.description,
                "metadata": {"order_id": req.order_id, **req.metadata},
            },
        )
        r.raise_for_status()
        data = r.json()
        return InvoiceResult(
            provider=self.name,
            external_id=data["id"],
            pay_url=data["confirmation"]["confirmation_url"],
            raw=data,
        )

    async def verify_webhook(self, headers, body):
        # ЮKassa: проверка по IP whitelist + optional HMAC
        import json
        data = json.loads(body)
        obj = data["object"]
        status_map = {"succeeded": "succeeded", "canceled": "failed",
                     "waiting_for_capture": "pending", "pending": "pending"}
        return PaymentEvent(
            provider=self.name,
            external_id=obj["id"],
            order_id=obj["metadata"]["order_id"],
            status=status_map.get(obj["status"], "pending"),
            amount=Decimal(obj["amount"]["value"]),
            currency=obj["amount"]["currency"],
            raw=data,
        )
```

## CryptoBot

```python
# app/integrations/payments/cryptobot.py
import httpx, hmac, hashlib, json
from decimal import Decimal
from .base import PaymentProvider, InvoiceRequest, InvoiceResult, PaymentEvent

class CryptoBotProvider(PaymentProvider):
    name = "cryptobot"
    _base = "https://pay.crypt.bot/api"

    def __init__(self, token: str) -> None:
        self._token = token
        self._client = httpx.AsyncClient(
            timeout=10, headers={"Crypto-Pay-API-Token": token})

    async def create_invoice(self, req: InvoiceRequest) -> InvoiceResult:
        r = await self._client.post(f"{self._base}/createInvoice", json={
            "currency_type": "crypto",
            "asset": req.currency,                 # "USDT", "TON", "BTC"
            "amount": str(req.amount),
            "description": req.description,
            "payload": req.order_id,
            "allow_comments": False,
        })
        r.raise_for_status()
        data = r.json()["result"]
        return InvoiceResult(
            provider=self.name,
            external_id=str(data["invoice_id"]),
            pay_url=data["pay_url"],
            raw=data,
        )

    async def verify_webhook(self, headers, body):
        sig = headers.get("crypto-pay-api-signature", "")
        secret = hashlib.sha256(self._token.encode()).digest()
        calc = hmac.new(secret, body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, calc):
            raise ValueError("bad signature")
        data = json.loads(body)
        payload = data["payload"]
        return PaymentEvent(
            provider=self.name,
            external_id=str(payload["invoice_id"]),
            order_id=payload["payload"],
            status="succeeded" if data["update_type"] == "invoice_paid" else "pending",
            amount=Decimal(payload["amount"]),
            currency=payload["asset"],
            raw=data,
        )
```

## Stripe

```python
# app/integrations/payments/stripe.py
import stripe
from decimal import Decimal
from .base import PaymentProvider, InvoiceRequest, InvoiceResult, PaymentEvent

class StripeProvider(PaymentProvider):
    name = "stripe"

    def __init__(self, secret_key: str, webhook_secret: str, success_url: str,
                 cancel_url: str) -> None:
        stripe.api_key = secret_key
        self._webhook_secret = webhook_secret
        self._success, self._cancel = success_url, cancel_url

    async def create_invoice(self, req: InvoiceRequest) -> InvoiceResult:
        session = await stripe.checkout.Session.create_async(
            mode="payment",
            line_items=[{
                "price_data": {
                    "currency": req.currency.lower(),
                    "unit_amount": int(req.amount * 100),
                    "product_data": {"name": req.description},
                },
                "quantity": 1,
            }],
            success_url=self._success, cancel_url=self._cancel,
            client_reference_id=req.order_id,
            metadata={"order_id": req.order_id, **req.metadata},
            idempotency_key=req.order_id,
        )
        return InvoiceResult(
            provider=self.name, external_id=session.id,
            pay_url=session.url, raw=session.to_dict(),
        )

    async def verify_webhook(self, headers, body):
        sig = headers.get("stripe-signature", "")
        event = stripe.Webhook.construct_event(body, sig, self._webhook_secret)
        obj = event["data"]["object"]
        status = "succeeded" if event["type"] == "checkout.session.completed" else "pending"
        return PaymentEvent(
            provider=self.name,
            external_id=obj["id"],
            order_id=obj["client_reference_id"],
            status=status,
            amount=Decimal(obj["amount_total"]) / 100,
            currency=obj["currency"].upper(),
            raw=event,
        )
```

## PaymentService (провайдер-агностик бизнес-слой)

```python
# app/services/payment_service.py
from decimal import Decimal
from uuid import uuid4
from app.integrations.payments.base import PaymentProvider, InvoiceRequest
from app.repositories.payment_repo import PaymentRepo

class PaymentService:
    def __init__(self, provider: PaymentProvider, payments: PaymentRepo) -> None:
        self._p = provider
        self._repo = payments

    async def create_order(self, user_id: int, amount: Decimal, currency: str,
                           description: str, metadata: dict) -> str:
        order_id = uuid4().hex
        await self._repo.create(order_id=order_id, user_id=user_id,
                                provider=self._p.name, amount=amount,
                                currency=currency, status="pending",
                                metadata=metadata)
        result = await self._p.create_invoice(InvoiceRequest(
            amount=amount, currency=currency, description=description,
            user_id=user_id, order_id=order_id, metadata=metadata,
        ))
        await self._repo.set_external_id(order_id, result.external_id)
        return result.pay_url or order_id

    async def handle_webhook(self, headers: dict, body: bytes) -> None:
        event = await self._p.verify_webhook(headers, body)
        # idempotency: если уже обработали — молча выходим
        if await self._repo.is_processed(event.external_id):
            return
        await self._repo.mark(event.order_id, event.status, event.external_id)
        if event.status == "succeeded":
            await self._grant_access(event.order_id)

    async def _grant_access(self, order_id: str) -> None: ...
```

## Webhook endpoint (FastAPI / aiohttp)

```python
# api/routers/payments.py
from fastapi import APIRouter, Request, HTTPException

router = APIRouter(prefix="/webhooks", tags=["payments"])

@router.post("/{provider}")
async def on_payment_webhook(provider: str, request: Request, payment_service):
    body = await request.body()
    try:
        await payment_service.handle_webhook(dict(request.headers), body)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"ok": True}
```

## Subscription engine (для SaaS mode)

```python
# app/services/subscription_service.py
from datetime import datetime, timedelta, UTC

class SubscriptionService:
    async def activate(self, user_id: int, plan: str, days: int) -> None:
        now = datetime.now(UTC)
        sub = await self._repo.active_for(user_id)
        starts_at = sub.expires_at if sub and sub.expires_at > now else now
        expires_at = starts_at + timedelta(days=days)
        await self._repo.upsert(user_id=user_id, plan=plan,
                                status="active", expires_at=expires_at)

    async def expire_due(self) -> int:
        """Called by scheduled task; returns count of expired."""
        return await self._repo.expire_before(datetime.now(UTC))
```

## Payments security checklist

- [ ] Каждый webhook проверяет подпись (HMAC/Stripe-Signature/IP-whitelist)
- [ ] Idempotency по `external_id` — двойная обработка невозможна
- [ ] `order_id` хранится в вашей БД до создания инвойса
- [ ] Суммы в БД — `Decimal`, не `float`
- [ ] Refunds обрабатываются через тот же `handle_webhook`
- [ ] Grant access ТОЛЬКО после `succeeded` от провайдера
- [ ] Логи содержат `order_id`, но НЕ card/token данные
- [ ] Таймауты на все запросы (10s) + retry с экспоненциальным backoff
- [ ] Миграция провайдера через замену DI — бизнес-слой не меняется
