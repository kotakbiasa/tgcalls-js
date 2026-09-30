---
name: botfather-setup
description: Complete reference documentation and practical guide.
---

# BotFather Setup — Operational Checklist

Настройка бота в BotFather — шаги, которые **не** делаются кодом. BotForge всегда выдаёт этот checklist вместе со сгенерированным проектом.

---

## 1. Создание бота

```
/newbot
<display name>
<username>_bot       # end with _bot
```

Сохраните **BOT_TOKEN** → `.env` → `BOT_TOKEN=...`. Никогда не коммитьте.

## 2. Базовые настройки (обязательные)

### `/setdescription`
0–512 символов. Видно на странице бота в Telegram.
```
BotForge-powered Telegram bot.
Купить доступ / Материалы / Поддержка — в меню.
```

### `/setabouttext`
0–120 символов. Короткое описание (shown in search and share cards).
```
VIP-доступ к материалам канала @cinema
```

### `/setuserpic`
Профильная картинка. Рекомендуем 640×640 PNG без прозрачности.

### `/setcommands`
Список команд для Telegram-меню. Синхронизируйте с `setMyCommands` в коде — **приоритет у кода**, BotFather используется как fallback.

```
start - Запуск бота
help - Справка
vip - VIP-доступ
profile - Мой профиль
support - Связаться с поддержкой
```

## 3. Поведенческие настройки

### `/setprivacy`
- **ENABLED** (default) — бот в группах видит только команды и reply к себе. Подходит для support-ботов и ботов-ассистентов.
- **DISABLED** — бот видит все сообщения. Нужно для анти-спам-ботов, модераторов, полного контроля групп.

### `/setjoingroups`
- **DISABLED** — бот НЕ может быть добавлен в группы. Для персональных ботов и Mini App-витрин.
- **ENABLED** — можно добавлять в группы.

### `/setinline`
- Включает inline-режим (`@botname query`). Указать placeholder текст.
- Для ботов-поисковиков, витрин, шаринга контента.

### `/setinlinefeedback`
- `Enabled` — получаем `chosen_inline_result` updates. Полезно для аналитики.

## 4. Mini App setup

### `/newapp` (в разговоре с BotFather)
- Выбрать бота
- Название (shown на кнопке запуска)
- Короткое описание
- Фото (640×360)
- GIF-демо (опционально)
- Web App URL (HTTPS!)
- Short name — используется в `t.me/<bot>/<short_name>` и `t.me/<bot>?startapp=...`

### `/setmenubutton`
- `Default` — кнопка `Menu` открывает Mini App в левом нижнем углу input area
- `Custom` — текст кнопки + URL

## 5. Platform commands

### `/setterms`
Ссылка на Terms of Service.

### `/setprivacy` (document)
Ссылка на Privacy Policy.

**Обязательно при:** сборе персональных данных, приёме платежей, работе с EU/UK пользователями.

## 6. Payments setup

### `/mybots` → Payments
Подключение провайдеров (ЮKassa, Stripe, CloudPayments и др.). Получаете **PROVIDER_TOKEN** → `.env`.

**Для Telegram Stars** подключение провайдера НЕ требуется. Достаточно одного BOT_TOKEN.

### Paid Broadcasts
`/mybots` → <bot> → Bot Settings → Paid Broadcasts. Доступно при 100k+ Stars balance или 100k+ MAU. Разблокирует до 1000 msg/s.

## 7. Owner & admin management

### `/mybots` → <bot> → Bot Owner
Один владелец, управляется через BotFather.

### `/mybots` → <bot> → Administrators
Добавить co-admins (видят stats, могут менять токен).

## 8. Token rotation

`/mybots` → <bot> → API Token → **Revoke Current Token**
Выдаёт новый. Старый перестаёт работать немедленно.

**Политика BotForge:** ротация каждые 90 дней или при любом подозрении на утечку. После ротации:
1. Обновить `BOT_TOKEN` в `.env` на сервере
2. Перезапустить контейнер
3. Проверить `getWebhookInfo` и `getMe`
4. Убедиться, что бот отвечает (отправить `/start`)

## 9. Analytics

### `/mybots` → <bot> → Bot Settings → Statistics
- Подключается при 500+ MAU
- Показывает users, posts, interactions по датам
- Экспорт недоступен — для собственной аналитики используйте свою БД + `audit_events`

## 10. Shared checklist (per-environment)

| Env | BOT_TOKEN | WEBHOOK_URL | secret_token |
|---|---|---|---|
| local | `@bot_dev_12345` | ngrok URL или polling | случайный |
| staging | `@bot_staging_12345` | staging.example.com | отдельный |
| prod | `@bot_12345` | example.com | отдельный, ротируемый |

**Три разных бота (не один с несколькими деплоями)** — иначе dev-обновления перехватывают prod-апдейты и наоборот.

## 11. Pre-launch checklist

- [ ] `/setdescription` заполнен
- [ ] `/setabouttext` заполнен
- [ ] `/setuserpic` загружен
- [ ] Privacy policy URL установлен (если собираете данные)
- [ ] Terms URL установлен (если принимаете платежи)
- [ ] `/setprivacy` + `/setjoingroups` сконфигурированы под задачу
- [ ] `setMyCommands` синхронизирован с кодом
- [ ] Mini App зарегистрирован (если используется)
- [ ] Payment providers подключены (если не только Stars)
- [ ] Отдельные боты для dev/staging/prod
- [ ] BOT_TOKEN в password manager, ротация запланирована
