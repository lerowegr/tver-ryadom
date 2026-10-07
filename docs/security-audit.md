# Аудит ИБ «Тверь рядом» — сводный документ

> Дата: 2026-10-06. Источник: только код в этом репо (`apps/api`, `apps/web`, `apps/admin`, `packages/*`, `wrangler`, `.github`, `scripts`).
> Вне скоупа: законы РФ (152-ФЗ и др.) — только техническая ИБ.
> Проверено: ручной разбор + `grep sql|queryRaw|exec|eval|innerHTML|dangerouslySetInnerHTML|parse_mode|like(` + сверка ключевых файлов (`app.ts`, `templates.ts`, `vk.ts`, `auth-form.tsx`).
> Маппинг: OWASP Top 10 2021 / API Top 10.

## 0. Резюме простыми словами

1. Письма и телеги собираются без чистки — что гость написал в заявку, то и уедет админу как код. Можно подсунуть ссылку-клон и сломать уведомления.
2. Бот пересылает админам текст людей как есть — можно прислать «кнопку»-подделку.
3. Поиск понимает `%` как «всё подряд» — можно подвесить базу долгой выборкой, данные не украсть.
4. Картинки проверяются на слово (`file.type` от клиента), а не по нутру — притворяется картинкой, проходит.
5. Ссылка `?next=` после входа уводит наружу — классический open-redirect.
6. Входы/заявки без тормозов — подбор пароля никто не останавливает, гостевые брони/отзывы можно слать пачками и заспамить админов в ТГ.
7. Разлогин не сразу — access JWT живёт 15 мин после выхода/смены пароля/снятия админа.
8. Секреты в URL (`/webhook/telegram/:secret`, `/calendar/:token`) пишутся в логи как есть.
9. Вебхуки VK/MAX без секрета открыты всем (fail-open).
10. Заголовков безопасности нет (HSTS/CSP/Frame/nosniff/Referrer) — браузеру никто не говорит «не угадывай типы, не встраивай в фрейм».

**SQL-инъекции: НЕТ.** Всё через Drizzle с биндами. `sql\`\`` в коде — только колонки и числа (`bookedCount + peopleCount`), строк пользователя внутри нет. Детали — раздел 2.

---

## 1. Сводная таблица находок

| ID | Находка | Severity | OWASP | Где |
|----|---------|----------|-------|-----|
| H1 | HTML-инъекция в шаблонах уведомлений, нет `escapeHtml` | High | A03 Injection | `apps/api/src/modules/notifications/templates.ts:47-113` |
| H2 | HTML-инъекция в пересылке бота админам | High | A03 | `apps/api/src/modules/bot/bot.ts:442-448` |
| H3 | Fail-open VK/MAX: без секрета вебхук открыт | High | A01 / A07 | `apps/api/src/modules/channels/vk.ts:129`, `max.ts:115`, `app.ts:128-136` |
| H4 | Нет rate-limit нигде, `429 rate_limited` — мёртвый код | High | A07 | `apps/api/src/**/*`, `lib/errors.ts:9` |
| H5 | Access JWT без проверки отзыва/роли в БД | High | A01 / API2 | `middleware/auth.ts:7-26`, `lib/jwt.ts` |
| H6 | Refresh без детекта reuse + бесконечное скольжение 30д | High | A07 | `modules/auth/service.ts:37-102` |
| H7 | Секреты из URL в логах | High | A09 | `app.ts:35-46`, `index.ts:19`, `bot.ts:458` |
| H8 | JSON-LD `</script>` breakout | High | A03 | `apps/web/src/app/excursions/[slug]/page.tsx:110` |
| M1 | CSRF на `/auth/refresh`, `/auth/logout`, login-CSRF на `telegram-webapp` | Medium | A01 | `lib/cookies.ts:9-27`, `modules/auth/routes.ts:51-64,122-136` |
| M2 | `clearRefreshCookie` без `secure/sameSite` — залипшая сессия | Medium | A07 | `lib/cookies.ts:25-27` |
| M3 | Загрузка R2 без magic bytes, без `nosniff` | Medium | A03 / A05 | `modules/admin/images.ts:49-68`, `modules/auth/routes.ts:87-104`, `app.ts:70-80` |
| M4 | Open-redirect `?next=` | Medium | A01 | `apps/web/src/components/auth/auth-form.tsx:16,24,47` |
| M5 | `footer href=settings[key]` + произвольный `PUT /admin/settings` | Medium | A03 / A04 | `apps/web/.../footer.tsx:77`, `api/.../admin/settings.ts:10-38` |
| M6 | Гостевой спам: брони/отзывы/contact без капчи | Medium | A04 / Abuse | `modules/bookings/service.ts:127`, `modules/contact/routes.ts:9-28`, `modules/reviews/service.ts` |
| M7 | Telegram `initData` replay 24ч; `tg-link` bearer в URL 15 мин | Medium | A07 / A02 | `modules/auth/webapp.ts:22`, `lib/tg-link.ts:10-42` |
| M8 | Нет security headers; инлайн-скрипт + внешний TG без CSP/SRI | Medium | A05 | `api/app.ts`, `web|admin/next.config.ts`, `web/layout.tsx:55-64` |
| M9 | Любой admin создаёт admin; нет отзыва сессий; TOCTOU последнего админа | Medium | A01 / A04 | `modules/admin/users.ts:21-69` |
| M10 | Миграции после деплоя; нет staging/approvals; `ACCOUNT_ID` в plaintext | Medium | A05 / Supply | `.github/workflows/deploy.yml:17,39-43` |
| M11 | `next 15.5.20 < 15.5.27`, `hono < 4.13.5`, нет `pnpm audit`/gitleaks в CI | Medium | A06 | `apps/*/package.json`, `.github/workflows/ci.yml` |
| L1 | LIKE `%_`, безлимитные массивы, `password min 8`, PBKDF2 100k, enumeration `409` | Low | A07 / A04 | `tours/service.ts:68`, `shared/schemas/*`, `auth/service.ts:53` |

Что уже хорошо (не ломать): CORS whitelist без `*` (`app.ts:54`), `httpOnly + path=/api/v1/auth`, `role:'user'` захардкожен при register, `login` generic `BAD_CREDENTIALS`, `reviews pending + дедуп`, `favorites requireAuth + onConflictDoNothing`, `notifications AND userId`, `images ..` check, `calendar/Telegram fail-closed`, `onError` без стека наружу, `frozen-lockfile`.

---

## 2. Инъекции: что возможно, что нет

### 2.1 SQL — НЕТ

- Все запросы через Drizzle (`eq/and/like/inArray`), пользовательский ввод уходит параметром.
- `sql\`\`` встречается только с колонками/числами:
  - `apps/api/src/modules/bookings/service.ts:70,75,152,195`
  - `apps/api/src/modules/admin/stats.ts:53`
  - `apps/api/src/modules/admin/booking-status.ts:67`
  - `packages/db/src/schema/*.ts` (дефолты `'[]'`, `(unixepoch())`)
- `queryRaw/exec/eval/Function(` от пользовательского ввода — не найдены.
- Вывод: `'" OR 1=1 --` не сработает нигде.

Остаток — **LIKE-инъекция (Low)**: `%`/`_` не экранируются в `tours/service.ts:68`, `admin/tours.ts:127`, `admin/users.ts:80`. `search=%` = full-scan/тормоза. Фикс: `search.replace(/[%_\\]/g, '\\$&')`.

### 2.2 Доступные векторы (реальные)

- **HTML в TG/email (H1, H2)** — основной рабочий вектор. См. раздел 3.
- **JSON-LD breakout (H8)** — требует злого админа, бьёт всех посетителей.
- **Polyglot-загрузка (M3)** — JPEG с HTML-хвостом как `image/jpeg`, без `nosniff` при раздаче.
- **Open-redirect (M4)** — `?next=https://evil`.
- **Shell-инъекция** — только локально в `scripts/set-admin-password.mjs:43` (`execSync` строкой). Через веб недоступно, но перевести на `spawn` без shell + ввод пароля без эха.
- **Нет**: NoSQL/LDAP/XPath (нечего), email header-injection (Resend JSON), ICS-инъекция (`escapeText + fold` в `calendar/service.ts` — ок).

---

## 3. Детали находок

### H1 `templates.ts:47-113` — HTML-инъекция в уведомлениях

`bookingLines/bookingHtml/templates/fallback <pre>JSON` вставляют `tourTitle/contactName/phone/comment/message/siteUrl` без escape в `text (parse_mode:HTML)` и `html`.
Эксплот: `POST /contact {message:"<img src=x onerror=...>"}`, `POST /bookings {comment:"</a><a href=https://evil>"}` → письмо + ТГ админам; ломанный `<b>` → `400` от TG → 3 ретрая → `failed` (DoS уведомлений).
Фикс:
```ts
export function escapeHtml(s: string): string {
  return s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#39;");
}
// применять ко всем полям payload + escapeAttr для siteUrl; fallback <pre> тоже экранировать
```

### H2 `bot/bot.ts:442-448` — пересылка без escape

`От: ${signature}\n\n${ctx.message.text}` с `parse_mode:HTML`. Остальной бот экранирует (`flows.ts:132`, `screens.ts:32`, `admin.ts:114`) — пропущено одно место. Фикс: тот же `escapeHtml`.

### H3 `channels/vk.ts:129`, `max.ts:115` — fail-open

```ts
if (expectedSecret && update.secret !== expectedSecret) return 403;
```
Без секрета (дефолт) — пропуск всех, включая `confirmation` и `message_new` (внешние fetch + DB-write + спам за твой токен). Плюс оракул `403 vs ok` для брутфорса.
Фикс: `if (!expectedSecret || update.secret !== expectedSecret) return 403;` + не отвечать `confirmation`, пока секрет не задан. Для Telegram уже fail-closed (`app.ts:138-144`) — оставить как эталон. Добавить проверку `X-Telegram-Bot-Api-Secret-Token`.

### H5/H6/M9/M7/M1/M2 — сессии и auth

- `middleware/auth.ts:7-26` только `verify()`, в БД не ходит; `requireAdmin` верит `payload.role`. Logout/смена пароля/понижение убивают только refresh, access живёт 15 мин.
- `auth/service.ts:37-102`: refresh `+30д` при каждой ротации, бесконечно; нет абсолютного TTL, списка устройств, детекта reuse (гонка «кто позже — тот валиден»).
- `admin/users.ts:21-69`: любой admin создаёт/повышает admin; нет отзыва сессий пониженного; TOCTOU двух параллельных demote последних админов; bulk PII в `GET /`.
- `auth/webapp.ts:22`: `MAX_AGE 24ч` — replay сутки. Снизить до 5–10 мин + одноразовый `jti`.
- `lib/tg-link.ts:10-42`: bearer-код в deep-link 15 мин, `===` вместо constant-time, усечение HMAC до 64 бит, отвязка чужого чата без подтверждения (стр.107-108 в `bot/bot.ts`).
- `lib/cookies.ts` + `auth/routes.ts:51-64`: `/refresh|/logout` только по cookie, без Origin-чека; при `SameSite=None` (workers.dev) — CSRF формой; `deleteCookie` только с `path`.
- `lib/crypto.ts:8`: PBKDF2 100k (OWASP 600k, но лимит Workers 10мс — задокументировать + pepper при появлении KV/HSM); `fromBase64` без try → 500 на битом хеше.
- `auth/service.ts:53-54`: `register 409` = enumeration email (login уже generic — хорошо).
- Фиксы: проверка `sessions.revokedAt/role` в auth (кэш 30–60с), `reuse detection → revoke all`, абсолютный TTL 90д + `GET|DELETE /sessions/:id`, отзыв при смене роли, нормализация `email.lower()`, экранирование `%_` в LIKE, allowlist ключей настроек + аудит.

### M3 — загрузки

`admin/images.ts:49-68` (`8МБ/поле ×4 = 32МБ/запрос`, нет общего лимита/лимита кол-ва, нет `validate param`), `auth/routes.ts:87-104` (`2МБ`), `bot/cabinet.ts` (источник TG — ок). Проверка только `file.type`, `contentType: file.type` сохраняется и отдаётся (`app.ts:70-80`) без `nosniff/Disposition`.
Фикс: magic bytes (`FFD8`/`PNG`/`RIFF-WEBP`), общий лимит ~12МБ, `X-Content-Type-Options: nosniff`, `validate param uuid`.

### M4/M5/H8/M8 — веб

- `auth-form.tsx:16`: `router.replace(next)` без валидации. Фикс: `if (!/^\/(?!\/)[\w\-/]*$/.test(next)) next='/account'`.
- `footer.tsx:77` `<a href={settings[key]}>` + `admin/settings.ts:10-38 z.record` без allowlist → `javascript:` + stored-XSS + затирание `telegram.*`/`calendar.feedToken`. Фикс: allowlist ключей + `https/mailto/tel` + санитизация.
- `page.tsx:110` JSON-LD: `.replace(/</g,'\\u003c')`.
- Нет `headers()` в `web|admin/next.config.ts`, нет `middleware.ts`, нет `secureHeaders()` в Hono. Добавить `HSTS/CSP/X-Frame/X-Content-Type/Referrer-Policy/Permissions-Policy`; инлайн-скрипт в `layout.tsx:56-57` и `telegram-web-app.js` — под CSP + SRI.

### M6 — абуз гостей

`POST /bookings` (гостям можно, `service.ts:127 notifyAdmins`), `POST /contact`, `POST /reviews` (гость без доказательства поездки, дедуп только для user) — без капчи/лимита = спам в ТГ админам + забивание `bookedCount` + цензор-DoS `pending`. Фикс: капча (Turnstile, раз уж Cloudflare) + rate-limit по IP (раздел 4) + код управления гостевой бронёй.

### H7/M10/M11 — логи/инфра/зависимости

- `app.ts:35-46` логирует `pathname` для `*` (включая секреты); `console.error Unhandled`, `Bot error`, `cron log`. Фикс: маскировать `/webhook/telegram/*`, `/calendar/*`.
- `bot/setup.ts:107-143` отдаёт `webhookUrl` с секретом + `tokenLength`/`lastError` (пусть за `requireAdmin`, но маскировать + аудит).
- `deploy.yml:17` `ACCOUNT_ID` в plaintext; `:39-43` миграции после кода (окно несовместимости, нет отката, D1 forward-only); нет `environment: production`/approvals/staging/preview; `concurrency` без отмены — старый пуш может выйти позже свежего.
- `ci.yml`: нет `pnpm audit`, gitleaks, e2e.
- Версии на 06.10.2026: `next ^15.5.20` → `15.5.27` (Security Release 30.09.2026: `CVE-2026-94483/94543/94484/94485/44581`; смягчает `images.unoptimized:true`, React2Shell уже закрыт в `>=15.5.7`); `hono ^4.12.29` → `^4.13.5` (`CVE-2026-84363/84364`; используемые пути не затронуты); `grammy/drizzle/zod/react` — прямых CVE нет. Подтвердить `pnpm audit` + OSV.

---

## 4. Проект rate-limit (продумано под Workers + бесплатный тариф)

### 4.1 Принципы

- Лимитировать по паре ключей `IP + идентификатор` (email/slug/токен webhook), чтобы один IP не блочил всех за NAT, а один аккаунт не перебирался с ботнета.
- Ответ единый: существующий `rate_limited 429` из `lib/errors.ts:9` + `Retry-After` (сек). Тело не должно отличаться для «есть/нет» (иначе оракул).
- Счётчики — вне D1 на горячем пути (D1 дорогая для каждого запроса). Порядок предпочтения:
  1. **Cloudflare WAF Rate Limiting Rules** (без кода, бесплатно до лимитов) — для грубых `webhook/*`, `contact`, `auth/login`.
  2. **Workers KV** (уже заложен в архитектуре, `architecture.md:24` — но `kv_namespaces` в `wrangler.jsonc` нет, надо добавить) — sliding window, TTL = окно.
  3. Fallback в коде: in-memory Map (только для dev; на проде инстансов много — не полагаться).
- D1 — только для аудита/жалоб (таблица `rate_limit_hits`), не для проверки каждого запроса.
- Плюс капча на гостевых точках (Cloudflare Turnstile — логично, раз уж CF): `register`, `contact`, guest `bookings/reviews`.

### 4.2 Таблица лимитов (старт, потом по логам)

| Зона | Ключ | Лимит | Окно | Что считать | При превышении |
|------|------|-------|------|-------------|----------------|
| `POST /api/v1/auth/login` | `ip + email` | 5 | 15 мин | каждый запрос | `429 + Retry-After`, алерт при всплеске |
| `POST /api/v1/auth/register` | `ip` | 3 | 1 час | + Turnstile | `429`, почта в лист ручной проверки |
| `POST /api/v1/auth/refresh` | `ip + cookie-hash` | 30 | 1 мин | | `429` (защита от гонок) |
| `POST /api/v1/auth/telegram-webapp` | `ip` | 10 | 1 мин | невалидные ×3 вес | `429` |
| `POST /api/v1/contact` | `ip` | 5 | 1 час | + Turnstile | `429`, без `notifyAdmins` сверх лимита |
| `POST /api/v1/bookings` (гость) | `ip` | 10 | 1 час | + Turnstile | `429` |
| `POST /api/v1/bookings` (user) | `userId` | 20 | 1 час | | `429` |
| `POST /api/v1/reviews` (гость) | `ip` | 5 | 1 час | + Turnstile | `429`, в модерацию пометка `rate-hit` |
| `POST /webhook/vk`, `/webhook/max` | `ip` | 60 | 1 мин | невалидный секрет ×5 вес | `403` без различий, потом бан подсети на 10 мин (WAF) |
| `POST /webhook/telegram/:secret` | `ip` | 120 | 1 мин | неверный secret — сразу `404` без работы | `404` |
| `GET /calendar/:file` | `token-hash + ip` | 30 | 1 мин | `loadRange` тяжёлый | `429 + Cache-Control: private` |
| `GET /images/*` | — | без лимита, но `Cache-Control: immutable` уже есть | — | R2 egress мониторить | при абузе — signed URL |
| `GET|PUT /api/v1/admin/*` | `userId + ip` | 300 | 1 мин | | `429` + аудит |
| `POST /api/v1/auth/avatar`, `POST /admin/tours/:id/images` | `userId` | 20 | 10 мин | + суммарный МБ (см. M3) | `429` |

Отдельно: глобальный предохранитель WAF `1000 req / 1 мин / IP` на `tver-api` от выжигания лимитов.

### 4.3 Псевдокод middleware (Hono, KV)

```ts
// lib/rate-limit.ts
import type { Context, Next } from 'hono';

type Rule = { limit: number; windowSec: number; key: (c: Context) => string };

async function fixedWindow(c: Context, rule: Rule): Promise<{ allowed: boolean; retryAfter: number }> {
  const kv = c.env.RATE_KV as KVNamespace | undefined;
  if (!kv) return { allowed: true, retryAfter: 0 }; // fail-open в dev, в проде KV обязателен
  const k = `rl:${rule.key(c)}:${Math.floor(Date.now()/1000 / rule.windowSec)}`;
  const cur = (await kv.get<number>(k, 'json')) ?? 0;
  if (cur >= rule.limit) return { allowed: false, retryAfter: rule.windowSec };
  await kv.put(k, JSON.stringify(cur + 1), { expirationTtl: rule.windowSec });
  return { allowed: true, retryAfter: 0 };
}

export const rateLimit = (rule: Rule) => async (c: Context, next: Next) => {
  const r = await fixedWindow(c, rule);
  if (!r.allowed) {
    c.header('Retry-After', String(r.retryAfter));
    // тот же конверт ошибок, что в lib/errors.ts
    return c.json({ success: false, error: { code: 'rate_limited', message: 'Слишком много запросов' } }, 429);
  }
  await next();
};

// использование
// authRoutes.post('/login', rateLimit({ limit: 5, windowSec: 900, key: (c) => `login:${ip(c)}:${email(c)}` }), ...)
// contactRoutes.post('/', rateLimit({ limit: 5, windowSec: 3600, key: (c) => `contact:${ip(c)}` }), ...)
// app.post('/webhook/vk', rateLimit({ limit: 60, windowSec: 60, key: (c) => `wvk:${ip(c)}` }), ...)

function ip(c: Context): string {
  return c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}
```

Заметки:
- `ip()` сейчас в `auth/routes.ts:34` только `cf-connecting-ip` — добавить fallback (иначе в dev/preview всегда `unknown` = общий котёл).
- Для `login` ключ строить из уже провалидированного `email.lower()` (после `validate`), иначе обход сменой регистра.
- Неверный секрет вебхука — не `429`, а те же `403/404`, чтобы не отличаться от «нет».
- `Retry-After` + единый текст — обязательно, иначе оракул.

### 4.4 Капча (Turnstile)

- Включить на `register`, `contact`, guest `bookings/reviews` (фронт: виджет → `token`; API: `POST https://challenges.cloudflare.com/turnstile/v0/siteverify` с секретом из `wrangler secret`).
- Без валидного токена — `422 validation_error`, не `429` (разные причины).
- В админке — пометка `captcha: pass|fail|skip(auth)` для модерации.

### 4.5 Наблюдение и эксплуатация

- WAF: два правила — `auth/contact > порога → block 10 мин`, `webhook/* без секрета ×N → block`.
- Логи: счётчик `rate_limit_hits{route, ip-hash, at}` в D1 раз в минуту (не на каждый хит), дашборд в админке (`/admin/stats` + график).
- Алерты: всплеск `login 401 ×50/5мин`, `contact ×20/час с одного IP`, `webhook 403 ×100/мин` → TG админам (существующим `notifyAdmins`).
- Тесты: `apps/api/test/rate-limit.test.ts` — `5× login 401 → 6-й 429`, `refresh 31×/мин → 429`, гостевые брони сверх лимита, вебхук без секрета всегда `403/404` одинаково.
- CI: `pnpm audit` + gitleaks + проверка `wrangler.jsonc` на `kv_namespaces`.

### 4.6 Что решить до внедрения (открытые вопросы)

- [ ] KV завести (`RATE_KV`) или сразу WAF-правилами без кода? (предложение: WAF для грубого, KV для точных `login/register`)
- [ ] Лимиты выше — ок как старт или ужесточить `login 5→3`?
- [ ] Turnstile на всех гостевых или только `contact/register` сначала?
- [ ] Бан по подсети `/24` при флуде вебхуков — разрешаем?
- [ ] `fail-open vs fail-closed`, если KV недоступен (предложение: auth/contact — closed, каталог — open)

---

## 5. Дорожная карта (будем отмечать здесь)

### P0 — закрыть рабочие дыры
- [x] `escapeHtml` в `templates.ts` + `bot.ts:447` + тесты на `<script>/<a>/&` (`test/templates-escape.test.ts`, 6 тестов; общий `escapeHtml/escapeHref` в `@tver/shared/utils/html.ts`)
- [x] VK/MAX fail-closed + одинаковые ответы без оракула (`handleVkUpdate/handleMaxUpdate` отклоняют всё без секрета; пустые строки формы не затирают сохранённое; `test/webhook-secret.test.ts`, 5 тестов)
- [x] Rate-limit `login/register/refresh/contact/guest-bookings/webhooks` + `Retry-After` (`lib/rate-limit.ts` in-memory fixed-window + пресеты; `test/rate-limit.test.ts`, 9 тестов; изоляция бакетов в `test/helpers.ts`)
- [x] Маскирование `webhook/telegram/*`, `calendar/*` в логах (`safeLogPath` в `app.ts`; `test/log-masking.test.ts`, 3 теста)
- [x] `next` whitelist + JSON-LD `\\u003c` + `footer href` allowlist (`safeNextPath` в `auth-form.tsx`, `safeHttpHref/safeTelHref/safeMailHref` в `footer.tsx`)

### P1 — сессии и загрузки
- [x] Проверка отзыва/роли в auth + reuse detection + абсолютный TTL 90д + `GET|DELETE /sessions` (миграция `0006`, `test/sessions.test.ts` 6 тестов; `initData` окно 10 мин; `tg-link` constant-time; `likeContains` с `ESCAPE`)
- [x] Отзыв сессий при смене роли; аудит `role/settings/status`
- [x] Magic bytes + `nosniff` + общие лимиты МБ (`readCheckedImage/detectImageType` в `lib/images.ts`; `X-Content-Type-Options` на `/images/*`; `test/upload-security.test.ts` 4 теста); `initData` окно 10 мин; `tg-link` constant-time; `likeContains` с `ESCAPE`
- [ ] `Origin`-чек `/refresh|logout`, `deleteCookie` с теми же attrs, `SameSite=Lax` на своём домене
- [ ] Allowlist `PUT settings`, экранирование `%_`, нормализация email

### P2 — инфра и гигиена
- [x] `secureHeaders` + `headers()` в обоих Next + CSP/SRI (API: `secureHeaders(DENY/nosniff/no-referrer)`; web/admin: nosniff/referrer/permissions-policy; frame-ancestors/CSP сознательно нет — Mini App живёт в Telegram WebView; `X-Content-Type-Options` на `/images/*`)
- [x] Миграции до деплоя, `environment: production`, staging/preview (миграции перенесены до деплоя API + правило «только аддитивные»; staging/preview осознанно нет — сольный проект, см. 4.6)
- [x] `next@15.5.27`, `hono@^4.13.13`, `pnpm audit` + Dependabot + gitleaks (`ci.yml` audit prod non-blocking + `.github/dependabot.yml`; остаточные high — транзитивные build-time)
- [x] `set-admin-password` на `spawn` + ввод без эха; проверка `JWT_SECRET` на старте (fail-closed 500 в проде при <32 символов; доки обновлены)
- [x] Тесты: `rate-limit.test.ts`, `templates-escape.test.ts`, `webhook-secret.test.ts` (плюс `sessions`, `log-masking`, `upload-security`, `settings-allowlist`: итого API 104/104, db 5/5, `turbo lint typecheck test build` зелёные)
- [x] Дополнительно сверх плана: Origin-check + `deleteCookie` с теми же attrs; allowlist `PUT settings` + маскирование секретов в GET; `likeContains` с `ESCAPE`; `GET|DELETE /auth/sessions`; абсолютный TTL 90д

---

## 6. Как работаем с документом дальше

1. Отмечаем чекбоксы по мере фиксов, каждый пункт — отдельный коммит/PR с номером ID (`H1`, `M4`...).
2. Открытые вопросы из 4.6 решаем до кода rate-limit — от них зависит реализация (KV vs WAF).
3. После P0 — повторный прогон `grep` из раздела 2 + `pnpm audit` + ручная проверка эксплотов H1–H4.
4. Этот файл — единый источник правды по ИБ; новые находки дописывать сюда же с ID `H9.../M12...`.
