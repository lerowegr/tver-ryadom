import {
  changePasswordSchema,
  loginSchema,
  registerSchema,
  updateProfileSchema,
} from '@tver/shared';
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { AppEnv } from '../../env';
import { clearRefreshCookie, getRefreshCookie, setRefreshCookie } from '../../lib/cookies';
import { unauthorized } from '../../lib/errors';
import { ok } from '../../lib/respond';
import { createLinkCode } from '../../lib/tg-link';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import {
  changePassword,
  getMe,
  login,
  logoutByRefreshToken,
  refreshSession,
  register,
  updateProfile,
} from './service';

function requestMeta(c: Context<AppEnv>) {
  return {
    userAgent: c.req.header('user-agent'),
    ip: c.req.header('cf-connecting-ip'),
  };
}

export const authRoutes = new Hono<AppEnv>()
  .post('/register', validate('json', registerSchema), async (c) => {
    const result = await register(c.get('db'), c.env.JWT_SECRET, c.req.valid('json'), requestMeta(c));
    setRefreshCookie(c, result.refreshToken);
    return ok(c, { user: result.user, accessToken: result.accessToken }, 201);
  })

  .post('/login', validate('json', loginSchema), async (c) => {
    const result = await login(c.get('db'), c.env.JWT_SECRET, c.req.valid('json'), requestMeta(c));
    setRefreshCookie(c, result.refreshToken);
    return ok(c, { user: result.user, accessToken: result.accessToken });
  })

  .post('/refresh', async (c) => {
    const token = getRefreshCookie(c);
    if (!token) throw unauthorized('Нет refresh-токена');
    const result = await refreshSession(c.get('db'), c.env.JWT_SECRET, token);
    setRefreshCookie(c, result.refreshToken);
    return ok(c, { user: result.user, accessToken: result.accessToken });
  })

  .post('/logout', async (c) => {
    const token = getRefreshCookie(c);
    if (token) await logoutByRefreshToken(c.get('db'), token);
    clearRefreshCookie(c);
    return ok(c, { loggedOut: true });
  })

  .get('/me', requireAuth, async (c) => {
    const user = c.get('user')!;
    return ok(c, await getMe(c.get('db'), user.id));
  })

  .patch('/profile', requireAuth, validate('json', updateProfileSchema), async (c) => {
    const user = c.get('user')!;
    return ok(c, await updateProfile(c.get('db'), user.id, c.req.valid('json')));
  })

  .post('/change-password', requireAuth, validate('json', changePasswordSchema), async (c) => {
    const user = c.get('user')!;
    await changePassword(c.get('db'), user.id, user.sessionId, c.req.valid('json'));
    return ok(c, { changed: true });
  })

  /** Deep-link для привязки Telegram-аккаунта (код живёт 15 минут). */
  .get('/telegram-link', requireAuth, async (c) => {
    if (!c.env.TELEGRAM_BOT_USERNAME) return ok(c, { available: false as const });
    const user = c.get('user')!;
    const code = await createLinkCode(c.env.JWT_SECRET, user.id);
    return ok(c, {
      available: true as const,
      url: `https://t.me/${c.env.TELEGRAM_BOT_USERNAME}?start=${code}`,
    });
  });
