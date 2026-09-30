---
name: inline-mode
description: Complete reference documentation and practical guide.
---

# Inline Mode — Reference

Inline-режим: пользователь пишет `@botname query` в любом чате, бот возвращает список результатов для вставки. Use cases: поиск, каталог, шаринг контента, генерация ответов.

## Включение

В @BotFather: `/setinline` → placeholder (например, `поиск фильмов`).

## Handler

```python
# app/handlers/inline.py
from aiogram import Router
from aiogram.types import (
    InlineQuery,
    InlineQueryResultArticle,
    InputTextMessageContent,
)

from app.services.catalog_service import CatalogService

router = Router(name="inline")


@router.inline_query()
async def on_inline_query(query: InlineQuery, session) -> None:  # type: ignore[no-untyped-def]
    service = CatalogService(session)
    items = await service.search(query.query, limit=20)

    results = [
        InlineQueryResultArticle(
            id=str(item.id),
            title=item.title,
            description=item.description[:100],
            input_message_content=InputTextMessageContent(
                message_text=f"<b>{item.title}</b>\n{item.url}",
                parse_mode="HTML",
            ),
            thumbnail_url=item.thumb_url,
        )
        for item in items
    ]

    await query.answer(
        results=results,
        cache_time=300,
        is_personal=False,
        next_offset=str(query.offset + 20) if len(items) == 20 else "",
    )
```

## Constraints (official)

- Max **50 results** per response
- `cache_time`: seconds, public bots cache server-side
- `is_personal=True` если результаты зависят от пользователя (кэш per-user)
- `next_offset`: пагинация, max 64 bytes
- Query string: max 256 chars

## Result types

- `InlineQueryResultArticle` — текстовый результат (most common)
- `InlineQueryResultPhoto` / `Gif` / `Video` / `Audio` / `Voice` / `Document`
- `InlineQueryResultContact` / `Location` / `Venue`
- `InlineQueryResultGame`
- `InlineQueryResultCachedPhoto` и др. — если медиа уже загружено в Telegram (`file_id`)

## Chosen inline result (аналитика)

Включите `/setinlinefeedback` в @BotFather, затем:

```python
from aiogram.types import ChosenInlineResult

@router.chosen_inline_result()
async def on_chosen(chosen: ChosenInlineResult, analytics_service) -> None:
    await analytics_service.log_chosen(
        user_id=chosen.from_user.id,
        result_id=chosen.result_id,
        query=chosen.query,
    )
```

⚠️ Включение feedback отправляет каждый выбор → расход на БД. Считайте объём.

## Deep-link через inline (switch_pm)

Если результат требует дополнительных шагов в ЛС бота:

```python
await query.answer(
    results=[],
    switch_pm_text="Войдите в бот для поиска",
    switch_pm_parameter="auth_from_inline",
    cache_time=0,
)
```

Кнопка над результатами отправит пользователя в ЛС с `/start auth_from_inline`.

## Throttling для inline

Inline-запросы идут чаще, чем обычные сообщения (печатание в реалтайме). Throttling:

```python
# app/middlewares/inline_throttle.py
class InlineThrottleMiddleware(BaseMiddleware):
    async def __call__(self, handler, event, data):
        if not isinstance(event, InlineQuery):
            return await handler(event, data)
        key = f"inline:thr:{event.from_user.id}"
        if await redis.set(key, "1", ex=1, nx=True):
            return await handler(event, data)
        return None
```

## Security

- Не доверяйте `query.query` напрямую — экранируйте в SQL и HTML
- `from_user.id` доверяем (приходит от Telegram)
- Результаты персональны (`is_personal=True`), если показываете данные конкретного пользователя
- Не кладите секреты в `result_id` — оно логируется в `chosen_inline_result`

## Anti-patterns

- ❌ Тяжёлые запросы в БД без кэша — inline-query блокирует UI печатающего
- ❌ Результаты >4096 chars в `input_message_content` — Bot API отбросит
- ❌ `cache_time=0` для публичных ботов — бьёт по БД
- ❌ Отправка SQL-запроса без LIMIT 50
