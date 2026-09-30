---
name: gdpr-compliance
description: Complete reference documentation and practical guide.
---

# GDPR & Data Privacy — Reference

Если бот обслуживает пользователей из EU/UK (а почти любой — да, Telegram глобален), нужно уважать GDPR. Плюс Telegram ToS требует прозрачности.

## 1. Legal basis

**Legitimate interest** для большинства features (отправка сообщений, FSM-сессия, хранение preferences). Для:
- **Analytics** → consent
- **Marketing broadcasts** → consent
- **Sharing данных третьим сторонам** → consent + explicit disclosure

## 2. Privacy Policy — обязательна

Минимум содержит:
1. Кто контроллер данных (ваше имя / юрлицо + контакт)
2. Какие данные собираются (`tg_id`, `username`, `lang`, история сообщений — если хранится)
3. Цели обработки
4. Срок хранения
5. Права пользователя (access / rectification / deletion / portability)
6. DPO контакт (если бизнес > 250 сотрудников)
7. Cookies / tracking — если Mini App

URL приватности → BotFather `/mybots` → Bot Settings → Privacy Policy.

Шаблон см. `docs/templates/PRIVACY_TEMPLATE.md` (TODO: добавить в проект).

## 3. Data minimization

Собирайте **только** необходимое:

✅ Собираем:
- `tg_id` — идентификатор (не раскрывается)
- `username` — для @mentions (можно null)
- `lang` — для i18n
- Подписки / платежи — для core-функциональности

❌ НЕ собираем без явной причины:
- Полные тексты всех сообщений (только если бот=support с ticket-ами)
- Location (если не запрошен явно)
- Phone (если не часть core flow)
- Контакты (contact_list export)

## 4. Data subject rights — реализация

### Right to access (GDPR art. 15)

Команда `/privacy_export`:
```python
@router.message(Command("privacy_export"))
async def cmd_export(msg, user, privacy_service):
    data = await privacy_service.export_all(user.id)
    # JSON-файл с всеми данными юзера
    await msg.answer_document(
        BufferedInputFile(json.dumps(data).encode(), filename="my_data.json"),
        caption="Все ваши данные. Отправить на email? /help",
    )
```

Сервис:
```python
class PrivacyService:
    async def export_all(self, user_id: int) -> dict:
        user = await self._users.get(user_id)
        subs = await self._subs.by_user(user_id)
        payments = await self._payments.by_user(user_id)
        messages = await self._msgs.by_user(user_id)   # если храните
        return {
            "user": asdict(user),
            "subscriptions": [asdict(s) for s in subs],
            "payments": [{"amount": str(p.amount), "currency": p.currency,
                         "created_at": p.created_at.isoformat()}
                        for p in payments],
            "messages": [asdict(m) for m in messages],
        }
```

### Right to deletion (art. 17, «right to be forgotten»)

Команда `/privacy_delete`:
```python
@router.message(Command("privacy_delete"))
async def cmd_delete(msg, user, privacy_service):
    await msg.answer(
        "Все ваши данные будут удалены через 7 дней (grace period). "
        "Отменить: /privacy_cancel_delete.\n"
        "Подтвердить: /privacy_confirm_delete",
    )
```

Grace period 7 дней → окончательное удаление через scheduled task.

```python
async def purge_user(self, user_id: int) -> None:
    # анонимизация вместо удаления если нужна история платежей для бухгалтерии
    async with self._session.begin():
        await self._session.execute(
            update(User)
            .where(User.id == user_id)
            .values(
                username=None,
                tg_id=0,              # placeholder, unique constraint может требовать
                lang=None,
                is_banned=True,
                anonymized_at=func.now(),
            )
        )
        await self._session.execute(delete(Message).where(Message.user_id == user_id))
        await self._session.execute(delete(UserSetting).where(UserSetting.user_id == user_id))
        # Payments — обычно НЕ удаляются (законодательная обязанность хранить 5-7 лет)
        # но анонимизируем metadata
        await self._session.execute(
            update(Payment)
            .where(Payment.user_id == user_id)
            .values(metadata=None)
        )
```

### Right to rectification (art. 16)

Бот должен позволять редактировать профиль. UI: `/profile` → inline-кнопки → FSM редактирования.

### Right to portability (art. 20)

Export в machine-readable формате (JSON, CSV). Уже покрывается `/privacy_export` выше.

## 5. Retention policy

```python
# docs/DATA_RETENTION.md (template)
- Messages: 90 days
- FSM state: 30 days idle
- Audit log: 365 days
- Payment records: 7 years (legal obligation in most jurisdictions)
- Anonymized payment records: indefinitely
- Backups: 30 days, then purged
```

Scheduled task:
```python
async def retention_cleanup(ctx):
    cutoff = datetime.now(UTC) - timedelta(days=90)
    await ctx["session"].execute(
        delete(Message).where(Message.created_at < cutoff)
    )
```

## 6. Третьи стороны (sub-processors)

Перечисляются в Privacy Policy:
- **Telegram** — основная платформа
- **OpenAI / Anthropic** — если бот шлёт тексты в LLM
- **ЮKassa / Stripe** — при оплате
- **Sentry** — error tracking (может содержать PII)
- **Google Cloud / AWS / DigitalOcean** — хостинг

Для **каждого** — DPA (Data Processing Agreement).

## 7. Cross-border transfers

Если данные идут в США (OpenAI, Stripe) — требуется:
- Adequacy decision (UK-US Data Bridge, EU-US Data Privacy Framework)
- Либо SCC (Standard Contractual Clauses) в договоре с vendor-ом

Большинство enterprise-версий OpenAI / Anthropic / AWS подписывают SCC по-умолчанию.

## 8. Consent для Mini Apps

Mini App = веб-сайт, применяются обычные web-rules:
- Cookie banner, если не essential-cookies only
- Analytics (GA4, Mixpanel) — только после consent
- LocalStorage/sessionStorage — без consent, если только essential

## 9. Children protection

Telegram ToS — 13+. Для бота с аудиторией детей — COPPA (US) или аналог:
- Explicit parental consent
- Не собираем PII
- Нет behavioral ads

Большинство ботов просто не нацеливаются на <13 и в ToS пишут «для лиц 13+».

## 10. Breach notification

При утечке — в течение **72 часов** уведомить supervisor authority (в России — Роскомнадзор; в EU — data protection authority страны).

План:
1. Обнаружение → immediate escalation
2. Оценка impact (сколько юзеров, какие данные)
3. Containment (rotate tokens, close hole)
4. Notification: regulator + affected users
5. Post-mortem + update процедур

## 11. Audit log (для compliance)

Все admin-действия над пользовательскими данными → в `audit_events`:
```
actor_id, action (user.export|user.delete|role.grant|…), target_id,
payload (sanitized), created_at
```

Retention: ≥ 1 год (в некоторых юрисдикциях — 5+ лет).

## 12. GDPR checklist

- [ ] Privacy Policy URL установлен в BotFather
- [ ] Terms of Service URL (если принимаете платежи)
- [ ] Data minimization в моделях: не собираем лишнего
- [ ] `/privacy_export` команда реализована
- [ ] `/privacy_delete` команда с grace period
- [ ] Retention-cleanup scheduled task активен
- [ ] Логи не содержат full message text / phone / email в INFO
- [ ] Sentry `before_send` фильтрует PII
- [ ] DPA подписаны с sub-processors
- [ ] Breach response план задокументирован
- [ ] Backup также cleanup-ят retention-expired данные

## Anti-patterns

- ❌ Игнорировать GDPR «у нас же русские юзеры» — если хоть один из EU, применяется
- ❌ «Мягкое удаление» с `is_deleted=True`, но данные не стёрты — это NOT deletion
- ❌ Хранить `message.text` всех юзеров «для аналитики» — массовое нарушение
- ❌ Phone numbers в plaintext без шифрования at-rest
- ❌ Давать admin-панели доступ к данным без audit log
