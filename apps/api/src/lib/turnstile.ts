import type { Context } from 'hono';
import type { AppEnv } from '../env';
import { validationError } from './errors';
import { clientIp } from './rate-limit';

/**
 * Каркас проверки Cloudflare Turnstile для гостевых точек (M6).
 *
 * Пока секрет `TURNSTILE_SECRET` не задан — проверка пропускается (dev,
 * тесты, прод до подключения виджета). Как только секрет появляется,
 * гостевые `register/contact/bookings/reviews` требуют валидный `cfToken`
 * из тела запроса. Авторизованным пользователям капча не нужна: их
 * держит rate-limit + отзыв сессий.
 * Фронт-виджет (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`) — следующий шаг.
 */

export interface TurnstileResult {
  ok: boolean;
  /** Проверка пропущена: секрет не настроен. */
  skipped: boolean;
}

export async function verifyTurnstile(
  secret: string | undefined,
  token: string | undefined,
  ip?: string,
): Promise<TurnstileResult> {
  if (!secret) return { ok: true, skipped: true };
  if (!token) return { ok: false, skipped: false };
  let response: Response;
  try {
    response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) }),
    });
  } catch {
    return { ok: false, skipped: false };
  }
  if (!response.ok) return { ok: false, skipped: false };
  const data = (await response.json().catch(() => null)) as { success?: boolean } | null;
  return { ok: data?.success === true, skipped: false };
}

/**
 * Проверяет капчу для гостя. Бросает 422, если секрет настроен, а токена
 * нет или он не прошёл. Молча пропускает авторизованных и ненастроенный режим.
 */
export async function requireCaptchaForGuest(
  c: Context<AppEnv>,
  token: string | undefined,
): Promise<void> {
  if (c.get('user')) return;
  const secret = c.env.TURNSTILE_SECRET;
  if (!secret) return;
  const result = await verifyTurnstile(secret, token, clientIp(c));
  if (!result.ok) throw validationError('Проверка капчи не пройдена. Обновите страницу и попробуйте снова.');
}
