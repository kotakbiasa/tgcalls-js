---
name: faq
description: Complete reference documentation and practical guide.
---

# FAQ — Troubleshooting

## Почему skill не активируется в Claude Code?

1. Убедитесь, что скопировали **всю папку** `.claude/skills/botforge/`, не только `SKILL.md`.
2. Путь: `~/.claude/skills/botforge/SKILL.md` (global) или `<project>/.claude/skills/botforge/SKILL.md` (per-project).
3. Проверьте YAML frontmatter в `SKILL.md` — первая строка должна быть `---`, поля `name` и `description` обязательны.
4. Triggering: попросите «используй skill botforge и создай бота для…» или установите плагин через `/plugin install`.

## Cursor игнорирует правила

- `.cursorrules` deprecated — используйте `.cursor/rules/botforge.mdc`.
- В MDC проверьте `alwaysApply: true` или конкретные `globs`.
- После первого изменения — перезапустите Cursor.

## Claude не следует структуре, пишет монолит

- Проверьте, что текущий режим указан явно: `BotForge: Pro` первой строкой.
- Попросите сначала **ADR и tree**, потом файлы: «дай сначала дерево проекта».
- Если пропускает self-review — явно попросите: «прогони self-review checklist».

## В output пропали секции (ADR / tree / self-review)

Причина — LLM решил «оптимизировать». Напомните: «skill требует все 6 stages, не пропускай».

## `TelegramBadRequest: message is too long`

Message text limit — 4096 UTF-16 code units. Разбейте на несколько сообщений или вынесите длинный текст в Mini App / файл.

## `TelegramRetryAfter` на каждом сообщении

Скорее всего нарушен rate limit. Проверьте:
- Broadcast throttle = 25 msg/s (не 30!)
- Per-user — 1 msg/sec
- Group — 20 msg/min

BotForge `BroadcastService` это обрабатывает, но если пишете руками — используйте `asyncio.Semaphore(25)`.

## `TelegramForbiddenError` — что делать?

Пользователь заблокировал бота. Пометьте `is_blocked=True` и **не ретрайте**. Это штатная ситуация, не ошибка.

## Webhook не получает updates

1. `curl -s "https://api.telegram.org/bot$TOKEN/getWebhookInfo" | jq` — что в `last_error_date` и `last_error_message`?
2. HTTPS обязателен. Let's Encrypt / Caddy / Cloudflare Tunnel.
3. Порт: 443, 80, 88 или 8443.
4. `secret_token` должен совпадать на стороне бота и в настройках.
5. Firewall не блокирует Telegram IP (149.154.160.0/20, 91.108.4.0/22)?

## Payments не приходят (Telegram Stars)

- `provider_token=""` — пустая строка, не пропускайте.
- `currency="XTR"`, amount — **целое число** Stars.
- `payload` возвращается в `successful_payment.invoice_payload` — используйте как `order_id`.
- `pre_checkout_query` нужно **всегда отвечать** `answer(ok=True)` в течение 10 секунд, иначе платёж не пройдёт.

## Alembic: `Target database is not up to date`

```bash
# pre-deploy:
docker compose exec bot alembic current
docker compose exec bot alembic upgrade head
```

Если миграция сломана — откат:
```bash
docker compose exec bot alembic downgrade -1
```

## Как разнести dev / staging / prod?

**Три разных бота** через BotFather. НЕ один bot с несколькими деплоями — оба polling/webhook будут перехватывать апдейты друг у друга.

```
.env.dev        BOT_TOKEN=<dev-bot>
.env.staging    BOT_TOKEN=<staging-bot>
.env.prod       BOT_TOKEN=<prod-bot>
```

## Mini App: initData валидный, но `auth_date` протух

TTL по умолчанию в BotForge — 3600 секунд. Если пользователь оставил Mini App открытой дольше — перезапустите Mini App: `tg.close()` + `tg.openLink(url)`. Фронт сам сделает re-login.

## Mini App: CORS errors в браузере

- CORS middleware должен разрешать только `https://<webapp-host>`, не `*`.
- Dev: `ngrok http 5173` → добавьте ngrok-URL в CORS origins и в BotFather Mini App URL.

## i18n не переключается

- Проверьте, что `.mo` файлы скомпилированы (`pybabel compile`).
- Docker: `.mo` файлы должны попасть в образ. Dockerfile:
  ```
  COPY --chown=app:app app/locales ./app/locales
  RUN pybabel compile -d app/locales -D bot
  ```

## `ruff` / `mypy --strict` красные

- Запустите локально: `ruff check app && mypy app`
- Для `Any` возвращаемых aiogram-типов может понадобиться `# type: ignore[no-untyped-def]` на handler — это приемлемо.
- Если `mypy` не видит stub-ы `redis.asyncio`: `pip install types-redis`.

## PostgreSQL пул исчерпан

`engine = create_async_engine(url, pool_size=20, max_overflow=40, pool_pre_ping=True)`. Увеличьте `pool_size` + убедитесь, что middleware закрывает сессии (мы используем `async with` — должно быть ок).

## Redis теряет FSM-данные

- Проверьте, что используется `RedisStorage`, а не `MemoryStorage`.
- `RedisStorage` сохраняет TTL по умолчанию бесконечно — может расти. Периодически очищать через scheduler.

## Как задеплоить с Fly.io на free tier?

```bash
fly launch --no-deploy
fly postgres create --initial-cluster-size 1 --vm-size shared-cpu-1x --volume-size 1
fly redis create --plan free
fly secrets set BOT_TOKEN=... ADMIN_IDS='[...]'
fly deploy
```

Предупреждение: free tier засыпает, webhook будет получать ошибки. Для prod — paid plan.

## Как убедиться, что output от AI действительно следует skill?

Быстрый чек-лист на output:
- Есть ли секции `### ADR`, `### Дерево проекта`, `### Self-review`?
- `handlers/` содержит SQL или `session.execute`? → blocker, должно быть в repo.
- Есть ли `import requests`? → blocker.
- Секреты в коде? → `grep -i "token\s*=" app/`.
- `Dockerfile` multi-stage? `USER app` (не root)?
