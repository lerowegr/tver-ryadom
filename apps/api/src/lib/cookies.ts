import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { AppEnv } from '../env';

export const REFRESH_COOKIE = 'refresh_token';
const REFRESH_COOKIE_PATH = '/api/v1/auth';
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

export function setRefreshCookie(c: Context<AppEnv>, token: string) {
  const crossSite = c.env.COOKIE_SAMESITE?.toLowerCase() === 'none';
  setCookie(c, REFRESH_COOKIE, token, {
    httpOnly: true,
    // SameSite=None обязан идти с Secure.
    secure: crossSite || c.env.ENVIRONMENT !== 'development',
    sameSite: crossSite ? 'None' : 'Lax',
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_TTL_SECONDS,
  });
}

export function getRefreshCookie(c: Context<AppEnv>): string | undefined {
  return getCookie(c, REFRESH_COOKIE);
}

export function clearRefreshCookie(c: Context<AppEnv>) {
  deleteCookie(c, REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
}
