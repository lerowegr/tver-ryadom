import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { AppEnv } from '../env';

export const REFRESH_COOKIE = 'refresh_token';
const REFRESH_COOKIE_PATH = '/api/v1/auth';
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

function cookieAttrs(c: Context<AppEnv>) {
  const crossSite = c.env.COOKIE_SAMESITE?.toLowerCase() === 'none';
  return {
    httpOnly: true,
    // SameSite=None обязан идти с Secure.
    secure: crossSite || c.env.ENVIRONMENT !== 'development',
    sameSite: (crossSite ? 'None' : 'Lax') as 'None' | 'Lax',
    path: REFRESH_COOKIE_PATH,
  };
}

export function setRefreshCookie(c: Context<AppEnv>, token: string) {
  setCookie(c, REFRESH_COOKIE, token, { ...cookieAttrs(c), maxAge: REFRESH_TTL_SECONDS });
}

export function getRefreshCookie(c: Context<AppEnv>): string | undefined {
  return getCookie(c, REFRESH_COOKIE);
}

export function clearRefreshCookie(c: Context<AppEnv>) {
  // Удаление обязано повторять attrs установки (M1/M2): иначе браузер
  // с SameSite=None; Secure куку не сотрёт и сессия «залипнет».
  deleteCookie(c, REFRESH_COOKIE, cookieAttrs(c));
}

/**
 * Защита cookie-only POST от CSRF (M1): если браузер прислал Origin/Referer,
 * он обязан быть из CORS-whitelist. Запросы без обоих заголовков (curl,
 * мобильные клиенты, same-origin GET-навигации сюда не ходят) пропускаем.
 */
export function isTrustedOrigin(c: Context<AppEnv>): boolean {
  const origin = c.req.header('origin');
  const referer = c.req.header('referer');
  if (!origin && !referer) return true;
  const allowed = (c.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const candidate = origin ?? new URL(referer!).origin;
  return allowed.includes(candidate);
}
