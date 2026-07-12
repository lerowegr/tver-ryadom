# Тверь рядом

Сайт компании, проводящей экскурсии по Твери: каталог экскурсий, онлайн-бронирование,
личный кабинет, административная панель и Telegram-бот. Работает целиком на бесплатном
тарифе Cloudflare (Workers + D1 + R2 + KV), деплой — через git.

Проектное решение и дорожная карта: [docs/architecture.md](docs/architecture.md).

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

Описание эндпоинтов: [docs/api.md](docs/api.md). Запуск сайта и админки появится на этапах 3–5.

## Деньги и даты

- Все суммы хранятся в **копейках** (`formatPrice` из `@tver/shared` форматирует для вывода).
- Все даты в БД — unix-время (секунды), Drizzle отдаёт их как `Date`.
