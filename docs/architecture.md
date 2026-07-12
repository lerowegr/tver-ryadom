# «Тверь рядом» — сайт экскурсий по Твери. Проектное решение (Этап 1)

## Контекст

Компания проводит экскурсии по Твери (референс: https://tour-tver.erg-gromov.workers.dev — 3 маршрута: обзорная по Твери, Савватьево на авто, предместье Твери). Нужен полноценный коммерческий сайт: каталог экскурсий, бронирование, личный кабинет, административная панель, Telegram-бот, уведомления. Дизайн — дорогой минимализм (Apple/Airbnb), тёплая песочно-кремовая гамма.

**Ключевое согласованное ограничение:** хостинг бесплатный — весь продакшен на бесплатном тарифе Cloudflare, деплой через git, платить только за домен. Поэтому серверная часть из брифа (NestJS/PostgreSQL/Redis/Docker) заменена на serverless-аналоги той же роли. Онлайн-оплата — заложена в схему, внедряется позже (ЮKassa). Админка — своя на Next.js.

Рабочая папка `C:\Users\Егор\Documents\Тверь рядом` пустая — проект с нуля.

---

## Стек технологий

| Роль | Выбор | Замена из брифа | Почему |
|---|---|---|---|
| Сайт + личный кабинет | **Next.js 15 (App Router), React 19, TypeScript** на Cloudflare Workers через **@opennextjs/cloudflare** | — (как в брифе) | SSR/SEO, единый стек, работает на бесплатных Workers |
| Админка | **Next.js** (отдельный Worker, `admin.домен`) + shadcn/ui + TanStack Table | React Admin | Полный контроль над календарём расписаний, загрузкой фото, дашбордом |
| Стили/анимации | **Tailwind CSS 4, Framer Motion (motion), GSAP + ScrollTrigger** | — | Как в брифе; всё клиентское, на лимиты Workers не влияет |
| Формы/валидация | **React Hook Form + Zod** (общие zod-схемы клиент↔сервер) | — | Одна схема валидации на фронте и в API |
| Данные на клиенте | **TanStack Query (React Query)** | — | Кэш, мутации, optimistic updates в ЛК и админке |
| API | **Hono** на Cloudflare Workers, модульная clean-architecture | NestJS | NestJS не запускается на Workers; Hono — типизированный, лёгкий, RPC-типы для клиента |
| БД | **Cloudflare D1 (SQLite)** + **Drizzle ORM** | PostgreSQL + Prisma | D1 бесплатна (5 ГБ, 5 млн чтений/день), нативна для Workers; Drizzle создан для edge, легче Prisma в бандле |
| Кэш/сессии/rate-limit | **Workers KV** + D1 | Redis | Бесплатный KV покрывает кэш и чёрные списки токенов |
| Очередь уведомлений | **Outbox-таблица в D1 + Cron Triggers** (бесплатны) | Redis + BullMQ | Cloudflare Queues требуют платный план; outbox+cron даёт ретраи и отложенные напоминания бесплатно |
| Фото | **Cloudflare R2** (10 ГБ, egress бесплатный); ресайз при загрузке через WASM (jSquash) → варианты thumb/card/hero в WebP | S3 | R2 — S3-совместимое API; Image Resizing у CF платный, поэтому варианты генерируем один раз при загрузке |
| Telegram-бот | **grammY** (webhook-режим в API-worker) | Telegraf | grammY официально поддерживает Workers |
| Email | **Resend** (free 100/день) через абстракцию `NotificationChannel` | — | Провайдер сменный (Brevo/Unisender) без правок бизнес-логики |
| Карты | **Яндекс.Карты JS API** (бесплатно до 25k загрузок/день) | Google Maps/Leaflet | Лучшие данные по Твери, роутинг точек маршрута |
| Аналитика | **Яндекс.Метрика** + свой дашборд в админке из данных D1 | — | Бесплатно, работает в РФ |
| Монорепозиторий | **pnpm workspaces + Turborepo** | — | Общие пакеты (схемы, БД, UI) между 4 приложениями |
| CI/CD | **GitHub Actions** (lint/typecheck/test) + **Cloudflare Workers Builds** (автодеплой из git) | — | «Загрузить через git» — пуш в main = деплой |
| Docker | Только опциональный compose для локальной разработки; в проде не нужен | Docker Compose в проде | Wrangler/Miniflare эмулирует D1/R2/KV локально без Docker |

**Отклонённые альтернативы:** Astro для сайта (легче, но слабее для интерактивного ЛК и админки; React-стек уже нужен); Supabase/Neon как Postgres (внешняя латентность из Workers, лимиты free-tier жёстче D1); Prisma на D1 (работает через adapter, но тяжелее в бандле — лимит Worker 3 МБ gzip на free-плане).

**Известные риски бесплатного тарифа:** 100k запросов/день на аккаунт (для локального турсайта — с большим запасом); лимит размера Worker 3 МБ gzip — держим серверные зависимости минимальными, при приближении к лимиту сайт переводится на статический экспорт с островами; KV — 1k записей/день (пишем в KV только при логине/логауте, rate-limit — через бесплатные WAF-правила Cloudflare).

---

## Архитектура

```
                        Cloudflare (бесплатный тариф)
 ┌──────────────────────────────────────────────────────────────────┐
 │  Worker: web (Next.js/OpenNext)      домен.ru                    │
 │  Worker: admin (Next.js/OpenNext)    admin.домен.ru              │
 │  Worker: api (Hono)                  api.домен.ru                │
 │    ├─ modules: auth, tours, bookings, reviews, favorites,        │
 │    │           notifications, admin, uploads, payments(заглушка) │
 │    ├─ /webhook/telegram  → grammY-бот                            │
 │    └─ Cron Triggers: outbox-рассылка (1 мин), напоминания (день) │
 │                                                                  │
 │  D1 (SQLite) ── Drizzle        R2 (фото)        KV (кэш/токены)  │
 └──────────────────────────────────────────────────────────────────┘
      ▲ git push → Workers Builds (автодеплой) + GitHub Actions (CI)
 Внешние: Telegram Bot API · Resend (email) · Яндекс.Карты/Метрика
 Позже: ЮKassa (webhook в api) · SMS (sms.ru) · Web Push (VAPID)
```

Слои внутри `api` (clean architecture, без фреймворк-магии):
`routes (Hono) → services (бизнес-логика) → repositories (Drizzle/D1) → integrations (telegram, email, r2)`. DTO и валидация — zod-схемы из `packages/shared`, общие с фронтом.

---

## Структура репозитория

```
тверь-рядом/
├─ apps/
│  ├─ web/        # Next.js — публичный сайт + личный кабинет
│  ├─ admin/      # Next.js — административная панель
│  └─ api/        # Hono — REST API + grammY-бот + cron-джобы
├─ packages/
│  ├─ db/         # Drizzle-схема, миграции, seed
│  ├─ shared/     # zod-схемы, типы API, константы, i18n-тексты статусов
│  └─ config/     # общие eslint/tsconfig/tailwind-пресеты
├─ .github/workflows/ci.yml
├─ turbo.json, pnpm-workspace.yaml
└─ docs/          # API-описание, инструкция запуска и деплоя
```

---

## Схема базы данных (D1/SQLite, Drizzle)

- **users** — id, email, phone, name, password_hash, role (`user|admin`), email_verified_at, telegram_chat_id, created_at
- **sessions** — id, user_id, refresh_token_hash, expires_at, user_agent, revoked_at
- **tours** — id, slug, title, subtitle, short_description, full_description, program (json: шаги), price, price_type (`per_person|per_group`), duration_minutes, group_min, group_max, meeting_point, meeting_lat/lng, included (json), not_included (json), recommendations, status (`draft|published|archived`), sort_order, rating_avg, rating_count
- **badges** + **tour_badges** — «Хит», «С детьми», «Историческая»… (m:n)
- **tour_images** — id, tour_id, r2_key, alt, sort_order, variants (json: url'ы thumb/card/hero)
- **route_points** — id, tour_id, title, description, lat, lng, sort_order
- **schedules** — id, tour_id, starts_at, capacity, booked_count, status
- **bookings** — id, user_id (nullable — гостевые заявки), tour_id, schedule_id, people_count, total_price, status (`pending|confirmed|cancelled|completed`), payment_status (`none|pending|paid|refunded` — задел под ЮKassa), contact_name/phone/email, comment, source (`web|telegram`), created_at
- **payments** — заложена: id, booking_id, provider, external_id, amount, status, payload (json)
- **reviews** — id, tour_id, user_id (nullable), author_name, rating 1–5, text, status (`pending|approved|rejected`)
- **favorites** — user_id + tour_id
- **notifications** — внутрисайтовые уведомления ЛК: id, user_id, type, payload, read_at
- **outbox** — очередь доставки: id, channel (`telegram|email|sms|push`), recipient, template, payload, status (`pending|sent|failed`), attempts, scheduled_at
- **contact_requests** — заявки формы обратной связи
- **gallery_images** — фотогалерея главной/«О компании»
- **settings** — key-value: телефоны, соцсети, тексты, реквизиты

Рейтинг тура пересчитывается триггером сервиса при одобрении отзыва. Индексы: tours.slug, bookings(user_id, status), schedules(tour_id, starts_at), outbox(status, scheduled_at).

---

## Авторизация

- **Email + пароль** (bcrypt-совместимый hash через WebCrypto/PBKDF2 — bcrypt в Workers недоступен), подтверждение email ссылкой.
- **JWT access (15 мин) + refresh (30 дней) с ротацией**; refresh — httpOnly Secure cookie, хэш в `sessions` (отзыв при logout/компрометации). Access проверяется middleware Hono.
- **Телефон** — поле профиля сразу; вход по SMS-коду — отложен (SMS платные), канал заложен в `NotificationChannel`.
- **OAuth** (Яндекс/VK ID) — заложен интерфейсом `OAuthProvider`, внедрение по необходимости.
- **Роли**: `user`, `admin`; админ-маршруты API — отдельный guard; админка дополнительно закрыта Cloudflare Access (бесплатно до 50 пользователей) как второй слой.
- Защита API: rate-limit (WAF-правила CF), CORS-whitelist, zod-валидация всех входов, единый обработчик ошибок с логированием (`console` → Workers Logs, бесплатно).

## Хранение изображений

Загрузка в админке → API-worker: валидация → ресайз WASM (jSquash) в 4 варианта (thumb 320 / card 640 / hero 1600 / original) в WebP → R2. Раздача через `img.домен.ru` (custom domain R2 + кэш CDN). В Next.js — свой image loader на готовые варианты (Image Optimization Vercel/CF Images не нужен).

## Интеграции и уведомления

Единый сервис `NotificationService`: событие (бронь создана/подтверждена/отменена, напоминание за 24 ч) → записи в `outbox` по подключённым каналам получателя → cron каждую минуту отправляет пачку с ретраями (3 попытки, экспоненциальная пауза).

- **Telegram-бот (grammY, webhook)**: привязка аккаунта по deep-link коду из ЛК; бронирование из бота (сценарий-диалог), подтверждения, напоминания, кнопка «связаться с администратором» (форвард в чат админа), уведомления админу о новых заявках.
- **Email (Resend)**: транзакционные письма, HTML-шаблоны в `packages/shared`.
- **WhatsApp**: ссылка `wa.me` на сайте сразу; API-канал (WABA платный) — заложен интерфейсом.
- **SMS, Web Push** — интерфейсы каналов готовы, внедрение по мере необходимости.

---

## Структура сайта (Этап 2 — кратко)

- **Главная**: hero-экран с фото Твери + CTA «Забронировать», о компании кратко, популярные экскурсии (3 карточки), преимущества, отзывы (карусель), фотогалерея, контакты. Scroll-reveal, parallax hero, glassmorphism-навбар.
- **/excursions**: каталог с фильтрами (тематика-бейджи, цена, длительность); карточка: фото-слайдер, название, описание, цена, длительность, группа, рейтинг, точки маршрута, бейджи.
- **/excursions/[slug]**: галерея, описание, программа-таймлайн, карта маршрута (Яндекс.Карты), расписание, что входит/не входит, рекомендации, место встречи, отзывы, sticky-форма бронирования.
- **/about**, **/contacts** (карта, форма, мессенджеры), **/account** (профиль, брони: будущие/история, избранное, уведомления, отмена/повтор брони), **/auth** (вход/регистрация/восстановление).
- SEO: SSR, метатеги, OpenGraph, JSON-LD (`TouristTrip`, `LocalBusiness`), sitemap, robots. Дизайн-токены: кремовый фон `#FAF6F0`, песочный `#D9C1A3`, тёплый коричневый `#8A6D4F`, акцент терракота; шрифты локально через next/font.

## Админка (admin.домен.ru)

Дашборд (заявки сегодня, выручка, график броней) → Экскурсии (CRUD, drag-n-drop фото, редактор программы и точек маршрута, бейджи, цены) → Расписание (календарь слотов) → Бронирования (список, фильтры, подтверждение/отмена → авто-уведомления клиенту) → Отзывы (модерация) → Пользователи → Заявки с форм → Рассылка уведомлений → Настройки (контакты, соцсети, галерея).

---

## Дорожная карта (реализация по этапам, каждый — с подтверждением)

1. **Каркас**: монорепозиторий, packages/config+shared+db, схема БД + миграции + seed (3 экскурсии референса), CI.
2. **API-ядро**: Hono-каркас, auth (JWT+refresh), модули tours/bookings/reviews/favorites, OpenAPI-описание в docs/.
3. **Сайт — публичная часть**: главная, каталог, страница экскурсии, о компании, контакты; дизайн-система, анимации, SEO.
4. **Бронирование + ЛК**: форма брони (гостевая и авторизованная), кабинет, избранное, уведомления в ЛК.
5. **Админка**: все разделы, загрузка фото в R2.
6. **Telegram-бот + email**: outbox, cron, grammY-сценарии, Resend-шаблоны.
7. **Деплой**: Cloudflare-провижининг (D1/R2/KV/Workers Builds), домен, инструкции запуска/деплоя в docs/, финальная проверка Lighthouse/доступности.

## Верификация

- Локально: `pnpm dev` (wrangler эмулирует D1/R2/KV), e2e-прогон сценария «каталог → бронь → подтверждение в админке → уведомление в outbox».
- Юнит-тесты сервисов API (vitest + miniflare), типовая проверка `turbo lint typecheck test` в CI.
- Бот — тестовый токен BotFather, webhook через `wrangler dev --remote` или cloudflared-туннель.
- Прод: Lighthouse ≥ 90 (perf/SEO/a11y), проверка форм и брони на реальном домене.
