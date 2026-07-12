import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../env';
import { forbidden, unauthorized } from '../lib/errors';
import { verifyAccessToken } from '../lib/jwt';

/** Разбирает Bearer-токен, если он есть; ошибок не бросает (гостевой доступ разрешён). */
export const authenticate = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header('Authorization');
  if (header?.startsWith('Bearer ')) {
    const payload = await verifyAccessToken(c.env.JWT_SECRET, header.slice('Bearer '.length));
    if (payload) {
      c.set('user', { id: payload.sub, role: payload.role, sessionId: payload.sid });
    }
  }
  await next();
});

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get('user')) throw unauthorized();
  await next();
});

export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.get('user');
  if (!user) throw unauthorized();
  if (user.role !== 'admin') throw forbidden();
  await next();
});
