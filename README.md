# Тверь рядом

Сайт компании, проводящей экскурсии по Твери: каталог экскурсий, онлайн-бронирование,
личный кабинет, административная панель и Telegram-бот. Работает целиком на бесплатном
тарифе Cloudflare (Workers + D1 + R2), деплой — `git push` в `main`.

**Продакшен:**
[сайт](https://tver-web.tver-ryadom.workers.dev) ·
[админка](https://tver-admin.tver-ryadom.workers.dev) ·
[API](https://tver-api.tver-ryadom.workers.dev/health)

Документация: [архитектура](docs/architecture.md) · [API](docs/api.md) · [деплой и эксплуатация](docs/deploy.md).

## Структура

| Путь | Назначение |
|---|---|
| `apps/web` | Публичный сайт и личный кабинет (Next.js) |
| `apps/admin` | Административная панель (Next.js) |
| `apps/api` | REST API, Telegram-бот, cron-джобы (Hono на Workers) |
| `packages/shared` | Общие zod-схемы, типы API, доменные константы |
| `packages/db` | Drizzle-схема D1, миграции, seed-данные |
| `packages/config` | Общие пресеты tsconfig |

## Быстрый старт

```bash
pnpm install          # зависимости (Node ≥ 20, pnpm ≥ 9)
pnpm test             # тесты (миграции + seed на локальном SQLite)
pnpm typecheck        # проверка типов
pnpm lint             # линтер
pnpm db:generate      # регенерация миграций после правок схемы
```

Запуск API локально (эмуляция D1 через wrangler):

```bash
cd apps/api
cp .dev.vars.example .dev.vars                  # задать JWT_SECRET
pnpm db:migrate:local && pnpm dev               # http://127.0.0.1:8787
curl -X POST http://127.0.0.1:8787/dev/seed     # демо-данные
```

Запуск сайта и админки (в отдельных терминалах, при работающем API):

```bash
cd apps/web && cp .env.example .env.local && pnpm dev     # сайт http://localhost:3000
cd apps/admin && cp .env.example .env.local && pnpm dev   # админка http://localhost:3001
```

Пароль администратора (email `admin@tver-ryadom.ru`):

```bash
pnpm --filter @tver/api admin:password        # локальная база, пароль спросит без эха
```

Описание эндпоинтов: [docs/api.md](docs/api.md).

> **Windows:** `pnpm --filter @tver/web build:worker` (сборка под Cloudflare Workers)
> требует включённого режима разработчика (создание symlink). Продакшен-сборка
> выполняется в Cloudflare Workers Builds на Linux, локально она не нужна.

## Деньги и даты

- Все суммы хранятся в **копейках** (`formatPrice` из `@tver/shared` форматирует для вывода).
- Все даты в БД — unix-время (секунды), Drizzle отдаёт их как `Date`.
