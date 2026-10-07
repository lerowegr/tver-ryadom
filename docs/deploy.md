# Деплой и эксплуатация

Весь продакшен работает на **бесплатном тарифе Cloudflare**; платный ресурс — только домен (по желанию).

## Продакшен

| Что | URL / имя |
|---|---|
| Сайт | https://tver-web.tver-ryadom.workers.dev |
| Админка | https://tver-admin.tver-ryadom.workers.dev |
| API | https://tver-api.tver-ryadom.workers.dev |
| База | D1 `tver-ryadom` (id `806a6e75-8ce1-4129-a0e7-a0dd67c65af8`) |
| Фото | R2 `tver-images` |
| Репозиторий | https://github.com/lerowegr/tver-ryadom (private) |

Администратор: `admin@tver-ryadom.ru`; пароль задаётся командой
`pnpm --filter @tver/api admin:password --remote` (пароль спросит интерактивно, без эха)
(текущий — в локальном файле `admin-password.local.txt`, в git не попадает).

## Автодеплой

**`git push` в `main` = продакшен-деплой.** GitHub Actions
([.github/workflows/deploy.yml](../.github/workflows/deploy.yml)):
линт → типы → тесты → деплой API → миграции D1 → сборка и деплой сайта и админки.

Требуется секрет репозитория `CLOUDFLARE_API_TOKEN` с правами
**Workers Scripts: Edit** и **D1: Edit** (создаётся на
dash.cloudflare.com/profile/api-tokens).

> **Windows:** сборка Next.js→Workers (OpenNext) на Windows производит нерабочий
> бандл, поэтому сайт и админка деплоятся только через CI (Linux).
> API можно деплоить и локально: `pnpm --filter @tver/api deploy`.

## Схема продакшена

```
Пользователь ──> tver-web (Next.js) ──service binding──> tver-api (Hono)
Администратор ─> tver-admin (Next.js) ──fetch из браузера──^     │
                                              D1 ── R2 ── Cron ──┘
```

Браузер ходит в API напрямую (CORS-whitelist); серверный рендеринг сайта — через
service binding `API` (fetch между воркерами по `*.workers.dev` запрещён, ошибка 1042).

## Переменные и секреты API-воркера

| Имя | Где | Значение |
|---|---|---|
| `JWT_SECRET` | secret | задан при деплое (`wrangler secret put JWT_SECRET`) |
| `ENVIRONMENT` | vars | `production` (локально `.dev.vars` → `development`) |
| `CORS_ORIGINS` | vars | адреса сайта и админки |
| `IMAGES_BASE_URL` | vars | `https://tver-api…/images` |
| `SITE_URL` | vars | адрес сайта (ссылки в письмах/боте) |
| `COOKIE_SAMESITE` | vars | `none` для workers.dev; на своём домене — `lax` |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `RESEND_API_KEY` | secret | пока не заданы — каналы выключены; подключение: [api.md](api.md#уведомления-и-telegram-бот) |
| `TELEGRAM_BOT_USERNAME`, `EMAIL_FROM` | vars | вместе с соответствующими секретами |

Публичные URL для сайта/админки инлайнятся при сборке из
`apps/web/.env.production` и `apps/admin/.env.production`.

## Изменение схемы БД

1. Правка `packages/db/src/schema/*` → `pnpm db:generate` (создаст SQL-миграцию).
2. Локально: `pnpm --filter @tver/api db:migrate:local`.
3. `git push` — CI применит миграцию к проду автоматически.

## Первичное развёртывание с нуля (если понадобится повторить)

```bash
pnpm --filter @tver/api exec wrangler login
pnpm --filter @tver/api exec wrangler d1 create tver-ryadom     # id → wrangler.jsonc
pnpm --filter @tver/api exec wrangler r2 bucket create tver-images   # R2 включить в дашборде
pnpm --filter @tver/api deploy
<случайная строка> | pnpm --filter @tver/api exec wrangler secret put JWT_SECRET
pnpm --filter @tver/api exec wrangler d1 migrations apply DB --remote
# демо-данные: временно ENVIRONMENT=development, затем вернуть
pnpm --filter @tver/api exec wrangler deploy --var ENVIRONMENT:development
curl -X POST https://tver-api.<поддомен>.workers.dev/dev/seed
pnpm --filter @tver/api deploy
pnpm --filter @tver/api admin:password --remote
```

## Подключение своего домена (когда купите)

1. Добавить домен в Cloudflare (Websites → Add site, бесплатный план) и
   перевести DNS на выданные NS-серверы.
2. Каждому воркеру — Custom Domain: `tver-web` → `домен.ru`,
   `tver-api` → `api.домен.ru`, `tver-admin` → `admin.домен.ru`
   (Workers → воркер → Settings → Domains & Routes).
3. Обновить значения: `CORS_ORIGINS`, `SITE_URL`, `IMAGES_BASE_URL`,
   `COOKIE_SAMESITE=lax` в `apps/api/wrangler.jsonc`; URL в
   `apps/{web,admin}/.env.production` и `apps/web/wrangler.jsonc` (`API_URL`);
   `site.url` в `apps/web/src/config/site.ts`. Затем `git push`.

## Известные ограничения демо-режима (workers.dev)

- Поддомены `*.workers.dev` — разные сайты, поэтому refresh-кука ставится с
  `SameSite=None`. Safari с включённой защитой ITP может не сохранять её —
  вход работает в Chrome/Edge/Firefox. На своём домене ограничение исчезает.
- Фото-варианты thumb/card/hero пока ссылаются на оригинал (WASM-ресайз —
  запланированная оптимизация).
- Бесплатные лимиты: 100k запросов/день, D1 5 ГБ, R2 10 ГБ — для локального
  экскурсионного сервиса это большой запас.
