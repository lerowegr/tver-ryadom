# API «Тверь рядом»

Базовый URL: `https://api.<домен>/api/v1` (локально — `http://127.0.0.1:8787/api/v1`).

Все ответы — в едином конверте:

```jsonc
// успех
{ "success": true, "data": { /* ... */ } }
// ошибка
{ "success": false, "error": { "code": "validation_error", "message": "…", "details": { "email": "Некорректный email" } } }
```

Коды ошибок: `validation_error` (422), `unauthorized` (401), `forbidden` (403), `not_found` (404), `conflict` (409), `rate_limited` (429), `internal_error` (500).

Деньги — всегда в **копейках**. Даты — ISO 8601. Списки возвращаются как `{ items, total, page, limit, pages }`.

## Авторизация

Access-токен (JWT, 15 минут) передаётся в `Authorization: Bearer <token>`.
Refresh-токен (30 дней, ротация при каждом использовании) живёт в httpOnly-куке
`refresh_token` c путём `/api/v1/auth`; фронтенд делает запросы с `credentials: "include"`.

| Метод | Путь | Описание |
|---|---|---|
| POST | `/auth/register` | `{ name, email, password, phone? }` → `{ user, accessToken }` + кука. 409, если email занят |
| POST | `/auth/login` | `{ email, password }` → `{ user, accessToken }` + кука |
| POST | `/auth/refresh` | По куке; ротирует refresh, возвращает `{ user, accessToken }` |
| POST | `/auth/logout` | Отзывает сессию, чистит куку |
| GET | `/auth/me` 🔒 | Профиль текущего пользователя |
| PATCH | `/auth/profile` 🔒 | `{ name?, phone? }`; телефон нормализуется к `+7XXXXXXXXXX` |
| POST | `/auth/change-password` 🔒 | `{ currentPassword, newPassword }`; отзывает остальные сессии |

🔒 — требуется Bearer-токен.

## Экскурсии (публичные)

| Метод | Путь | Описание |
|---|---|---|
| GET | `/tours` | Каталог. Query: `page`, `limit` (≤50), `badge` (слаг), `priceMin/priceMax` (копейки), `durationMax` (минуты), `search`, `sort` (`popular` \| `price_asc` \| `price_desc` \| `duration` \| `rating`) |
| GET | `/tours/:slug` | Полная карточка: описание, программа, точки маршрута с координатами, место встречи, что входит/не входит, рекомендации, фото, ближайшие слоты расписания с `freeSeats` |
| GET | `/tours/:slug/reviews` | Одобренные отзывы (пагинация) |
| GET | `/badges` | Все тематические бейджи |

## Бронирования

| Метод | Путь | Описание |
|---|---|---|
| POST | `/bookings` | Гостям и авторизованным. `{ tourId, scheduleId | desiredDate, peopleCount, contactName, contactPhone, contactEmail?, comment? }`. Цена считается на сервере; при нехватке мест — 409 (атомарная проверка вместимости) |
| GET | `/bookings/my` 🔒 | Свои брони. Query: `status`, `upcoming=true|false`, пагинация |
| POST | `/bookings/:id/cancel` 🔒 | `{ reason? }`. Только свои `pending/confirmed` до начала экскурсии; места возвращаются в слот |

Статусы брони: `pending → confirmed → completed`, `cancelled`. Подтверждение — за администратором (этап 5), уведомления — этап 6. `payment_status` заложен под ЮKassa.

## Отзывы, избранное, уведомления, контакты

| Метод | Путь | Описание |
|---|---|---|
| POST | `/reviews` | `{ tourId, rating 1–5, text, authorName? }`. Гостю нужен `authorName`, авторизованному имя берётся из профиля (повторный отзыв — 409). Публикуется после модерации |
| GET | `/favorites` 🔒 | Карточки избранных экскурсий |
| PUT | `/favorites/:tourId` 🔒 | Добавить (идемпотентно) |
| DELETE | `/favorites/:tourId` 🔒 | Убрать |
| GET | `/notifications` 🔒 | Уведомления ЛК + счётчик `unread` |
| POST | `/notifications/read` 🔒 | `{ ids? }` — пометить прочитанными (без ids — все) |
| POST | `/contact` | Заявка с формы: `{ name, phone?/email?, message }` (нужен хотя бы один контакт) |

## Служебные

- `GET /health` — проверка живости (вне префикса `/api/v1`).
- `POST /dev/seed` — демо-данные; работает только при `ENVIRONMENT=development`, в проде отвечает 404.

## Локальный запуск API

```bash
cd apps/api
cp .dev.vars.example .dev.vars       # задать JWT_SECRET
pnpm db:migrate:local                # применить миграции к локальной D1
pnpm dev                             # wrangler dev на :8787
curl -X POST http://127.0.0.1:8787/dev/seed
```
