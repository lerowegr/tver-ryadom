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
| GET | `/auth/sessions` 🔒 | Активные сессии без хешей (для экрана «устройства») |
| DELETE | `/auth/sessions/:id` 🔒 | Отозвать свою сессию |
| POST | `/auth/password-reset/request` | `{ email }` — всегда 200 (без перебора email); письмо со ссылкой на час уходит email-каналом через outbox |
| POST | `/auth/password-reset/confirm` | `{ token, password }` — сброс + отзыв всех сессий + сразу вход |

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

## Администрирование (роль `admin`)

Все маршруты под `/admin/*` требуют Bearer-токен пользователя с ролью `admin`
(403 для остальных). Пароль администратора задаётся скриптом:
`pnpm --filter @tver/api admin:password [--remote]` (пароль спросит интерактивно, без эха).

| Метод | Путь | Описание |
|---|---|---|
| GET | `/admin/stats` | Дашборд: заявки за день, ожидающие, предстоящие, выручка, брони по дням, последние заявки |
| GET | `/admin/tours` | Все экскурсии (любой статус). Query: `search`, `status`, пагинация |
| GET/POST | `/admin/tours[/:id]` | Полная карточка / создание (`tourCreateSchema`: поля, программа, точки, бейджи) |
| PATCH/DELETE | `/admin/tours/:id` | Частичное обновление / архивация (409 при активных бронях) |
| POST | `/admin/tours/:id/images` | Загрузка фото (multipart `file`, ≤8 МБ, JPEG/PNG/WebP) в R2 |
| PATCH/DELETE | `/admin/images/:id` | alt/sortOrder / удаление из R2 и БД |
| POST/PATCH/DELETE | `/admin/schedules[/:id]` | Слоты расписания; уменьшение мест ниже занятых — 409; слот с бронями закрывается, а не удаляется |
| GET/PATCH | `/admin/bookings[/:id]` | Список с фильтрами / смена статуса (валидные переходы, уведомление клиенту, возврат мест при отмене) |
| GET/PATCH | `/admin/reviews[/:id]` | Модерация; одобрение пересчитывает рейтинг тура |
| GET | `/admin/users` | Пользователи с количеством броней, поиск |
| GET/PATCH | `/admin/contact-requests[/:id]` | Заявки с формы: новые/обработанные |
| GET/PUT | `/admin/settings` | Все настройки / upsert `{ entries: { ключ: значение } }` |

Картинки раздаются публично: `GET /images/<r2-ключ>` (immutable-кеш).

## Уведомления и Telegram-бот

События (создание/подтверждение/отмена брони, напоминание за сутки, заявка с
формы) создают запись в ЛК и задачи в **outbox**-таблице. Cron Trigger
(каждую минуту) доставляет пачку задач в Telegram и на email (Resend) с
3 ретраями и экспоненциальной паузой; после — статус `failed`.
Канал молча выключен, пока не заданы секреты.

**Бот** (grammY, вебхук `POST /webhook/telegram/<TELEGRAM_WEBHOOK_SECRET>`):

- `/start <код>` — привязка аккаунта по deep-link из ЛК (`GET /auth/telegram-link` 🔒,
  стейтлес HMAC-код на 15 минут);
- `/tours` — список экскурсий, `/mybookings` — предстоящие брони, `/help`;
- любой текст пересылается администраторам (админ = user с ролью admin и
  привязанным Telegram), автору уходит подтверждение.

Подключение бота (после деплоя, этап 7):

```bash
# секреты API-воркера
wrangler secret put TELEGRAM_BOT_TOKEN        # от @BotFather
wrangler secret put TELEGRAM_WEBHOOK_SECRET   # любая случайная строка
# vars: TELEGRAM_BOT_USERNAME, SITE_URL — в wrangler.jsonc
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://api.<домен>/webhook/telegram/<WEBHOOK_SECRET>"
```

Email: `wrangler secret put RESEND_API_KEY` + переменная `EMAIL_FROM`
(домен должен быть подтверждён в resend.com).

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
