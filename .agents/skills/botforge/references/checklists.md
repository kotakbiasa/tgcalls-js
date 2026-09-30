---
name: checklists
description: Complete reference documentation and practical guide.
---

# Checklists

## Self-Review Checklist (run after every generation)

- [ ] No secrets in code (`grep -i "token\|secret\|key\|password"`)
- [ ] Every handler ≤ 20 lines, no business logic
- [ ] All SQL/ORM only in `repositories/`
- [ ] DB session comes via middleware, not import
- [ ] All I/O is async
- [ ] All external API calls have timeout + retry
- [ ] Logs are structlog/JSON, not print
- [ ] Type hints on every public function
- [ ] `.env.example` contains every variable from settings
- [ ] `Dockerfile` is multi-stage and uses non-root user
- [ ] `docker-compose.yml` has healthchecks
- [ ] Alembic baseline migration generated
- [ ] `README.md` has: what / stack / run / env / deploy / architecture
- [ ] `ruff` and `mypy --strict` would pass
- [ ] UX navigation checked: no dead buttons, back/home/cancel paths exist, callbacks are acknowledged, keyboards are scannable

## Deploy Checklist

- [ ] `.env` on the server, not in repo
- [ ] `BOT_TOKEN` freshly rotated
- [ ] Webhook URL is HTTPS with secret set
- [ ] DB backup configured (pg_dump cron / hoster snapshots)
- [ ] Sentry or equivalent connected
- [ ] Healthcheck endpoint responds
- [ ] Rate limits tested (1 msg/s per user + broadcast 25 msg/s)
- [ ] Rollback procedure documented in RUNBOOK

## Security Checklist

- [ ] Admin commands protected by `AdminFilter`
- [ ] Webhook `secret_token` enabled
- [ ] `CallbackData` factories used everywhere
- [ ] Payment webhooks idempotent by `ext_id`
- [ ] SQL only parameterized (ORM), no f-strings in queries
- [ ] User input for broadcasts sanitized (parse_mode controlled)
- [ ] Throttling middleware active
- [ ] No logging of sensitive data (tokens, card numbers, emails)
