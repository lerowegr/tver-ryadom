import { sessions, users, type Db } from '@tver/db';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { createMiddleware } from 'hono/factory';
import type { AppEnv, AuthUser } from '../env';
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

/**
 * Живой пользователь по сессии (P1): сессия не отозвана и не истекла,
 * роль — свежая из БД. Закрывает окно «logout/demote не действуют 15 мин».
 * Возвращает null для протухших/отозванных/удалённых.
 */
export async function resolveLiveUser(
  db: Db,
  userId: string,
  sessionId: string,
): Promise<AuthUser | null> {
  const session = await db.query.sessions.findFirst({
    where: and(
      eq(sessions.id, sessionId),
      eq(sessions.userId, userId),
      isNull(sessions.revokedAt),
      gt(sessions.expiresAt, new Date()),
    ),
    columns: { id: true },
  });
  if (!session) return null;
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, role: true },
  });
  if (!user) return null;
  return { id: user.id, role: user.role, sessionId: session.id };
}

/** Для гостевых роутов с опциональным токеном: мёртвая сессия = гость. */
export async function resolveOptionalUser(
  db: Db,
  claimed: AuthUser | undefined,
): Promise<AuthUser | undefined> {
  if (!claimed) return undefined;
  return (await resolveLiveUser(db, claimed.id, claimed.sessionId)) ?? undefined;
}

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const claimed = c.get('user');
  if (!claimed) throw unauthorized();
  const live = await resolveLiveUser(c.get('db'), claimed.id, claimed.sessionId);
  if (!live) throw unauthorized('Сессия истекла, войдите заново');
  c.set('user', live);
  await next();
});

export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  const claimed = c.get('user');
  if (!claimed) throw unauthorized();
  const live = await resolveLiveUser(c.get('db'), claimed.id, claimed.sessionId);
  if (!live) throw unauthorized('Сессия истекла, войдите заново');
  if (live.role !== 'admin') throw forbidden();
  c.set('user', live);
  await next();
});
