import type { Context, Next } from 'hono';

/**
 * Простой fixed-window rate-limit в памяти воркера (H4).
 *
 * Это первый слой: режет флуд на `login/register/contact/брони/вебхуки`
 * без внешних зависимостей. Память у каждого изолята своя, поэтому лимиты
 * приблизительные — точные счётчики даст следующий слой (KV + WAF-правила,
 * см. docs/security-audit.md раздел 4). Формат отказа — тот же конверт
 * ошибок API (`rate_limited` 429) + заголовок `Retry-After`.
 */

export interface RateLimitRule {
  /** Сколько запросов разрешено в окне. */
  limit: number;
  /** Длина окна в секундах. */
  windowSec: number;
  /** Префикс ключа, чтобы лимиты разных роутов не смешивались. */
  prefix: string;
  /**
   * Дополнительный различитель сверх IP (например, email из тела).
   * Должен быть дешёвым и не секретом.
   */
  keyOf?: (c: Context) => string;
}

/** IP клиента: на Cloudflare — `cf-connecting-ip`, иначе первый из цепочки. */
export function clientIp(c: Context): string {
  const cf = c.req.header('cf-connecting-ip')?.trim();
  if (cf) return cf;
  const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded) return forwarded;
  return 'unknown';
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Чистка тестов и защита от разрастания карты. */
export function __resetRateLimits(): void {
  buckets.clear();
}

function sweep(now: number): void {
  if (buckets.size < 1000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function rateLimit(rule: RateLimitRule) {
  const windowMs = rule.windowSec * 1000;
  return async function rateLimitMiddleware(c: Context, next: Next) {
    const now = Date.now();
    sweep(now);
    const extra = rule.keyOf?.(c) ?? '';
    const key = `rl:${rule.prefix}:${clientIp(c)}:${extra}`;
    const current = buckets.get(key);
    if (current && current.resetAt > now) {
      if (current.count >= rule.limit) {
        const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
        c.header('Retry-After', String(retryAfter));
        return c.json(
          {
            success: false,
            error: { code: 'rate_limited', message: 'Слишком много запросов. Попробуйте позже.' },
          } as const,
          429,
        );
      }
      current.count += 1;
    } else {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
    }
    await next();
  };
}

/** Готовые пресеты — лимиты из docs/security-audit.md раздел 4.2. */
export const rateLimits = {
  /** Подбор пароля: 10 попыток на IP за 15 минут. */
  login: { limit: 10, windowSec: 900, prefix: 'login' },
  /** Спам регистраций: 5 в час с IP. */
  register: { limit: 5, windowSec: 3600, prefix: 'register' },
  /** Гонки ротации: 30 в минуту с IP. */
  refresh: { limit: 30, windowSec: 60, prefix: 'refresh' },
  /** Перебор initData: 10 в минуту с IP. */
  telegramWebapp: { limit: 10, windowSec: 60, prefix: 'tgwebapp' },
  /** Спам формы связи (уходит админам в ТГ): 5 в час с IP. */
  contact: { limit: 5, windowSec: 3600, prefix: 'contact' },
  /** Набивка слотов гостевыми бронями: 20 в час с IP. */
  bookingCreate: { limit: 20, windowSec: 3600, prefix: 'booking' },
  /** Флуд модерации отзывами: 10 в час с IP. */
  reviewCreate: { limit: 10, windowSec: 3600, prefix: 'review' },
  /** Выжигание лимитов через вебхуки: 60 в минуту с IP. */
  webhookVk: { limit: 60, windowSec: 60, prefix: 'wvk' },
  webhookMax: { limit: 60, windowSec: 60, prefix: 'wmax' },
  /** Пакеты Telegram идут пачками: 120 в минуту с IP. */
  webhookTelegram: { limit: 120, windowSec: 60, prefix: 'wtg' },
  /** Тяжёлый запрос (диапазон год + месяц): 30 в минуту с IP. */
  calendarFeed: { limit: 30, windowSec: 60, prefix: 'cal' },
} satisfies Record<string, RateLimitRule>;
