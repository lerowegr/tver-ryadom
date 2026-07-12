import type { Db } from '@tver/db';
import { sessions, users } from '@tver/db';
import type { ChangePasswordInput, LoginInput, RegisterInput, UpdateProfileInput } from '@tver/shared';
import { and, eq, gt, isNull, ne } from 'drizzle-orm';
import { hashPassword, randomToken, sha256Hex, verifyPassword } from '../../lib/crypto';
import { conflict, notFound, unauthorized, validationError } from '../../lib/errors';
import { signAccessToken } from '../../lib/jwt';

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const BAD_CREDENTIALS = 'Неверный email или пароль';

export interface SessionMeta {
  userAgent?: string;
  ip?: string;
}

type UserRow = typeof users.$inferSelect;

export function toPublicUser(user: UserRow) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    emailVerified: user.emailVerifiedAt !== null,
    telegramLinked: user.telegramChatId !== null,
    createdAt: user.createdAt,
  };
}

export type PublicUser = ReturnType<typeof toPublicUser>;

async function issueSession(db: Db, secret: string, user: UserRow, meta: SessionMeta) {
  const sessionId = crypto.randomUUID();
  const refreshToken = randomToken();
  await db.insert(sessions).values({
    id: sessionId,
    userId: user.id,
    refreshTokenHash: await sha256Hex(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    userAgent: meta.userAgent ?? null,
    ip: meta.ip ?? null,
  });
  const accessToken = await signAccessToken(secret, user, sessionId);
  return { user: toPublicUser(user), accessToken, refreshToken };
}

export async function register(db: Db, secret: string, input: RegisterInput, meta: SessionMeta) {
  const existing = await db.query.users.findFirst({ where: eq(users.email, input.email) });
  if (existing) throw conflict('Пользователь с таким email уже зарегистрирован');

  const id = crypto.randomUUID();
  await db.insert(users).values({
    id,
    email: input.email,
    phone: input.phone ?? null,
    name: input.name,
    passwordHash: await hashPassword(input.password),
    role: 'user',
  });
  const user = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!user) throw new Error('Не удалось создать пользователя');
  return issueSession(db, secret, user, meta);
}

export async function login(db: Db, secret: string, input: LoginInput, meta: SessionMeta) {
  const user = await db.query.users.findFirst({ where: eq(users.email, input.email) });
  if (!user?.passwordHash) throw unauthorized(BAD_CREDENTIALS);
  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) throw unauthorized(BAD_CREDENTIALS);
  return issueSession(db, secret, user, meta);
}

export async function refreshSession(db: Db, secret: string, refreshToken: string) {
  const tokenHash = await sha256Hex(refreshToken);
  const session = await db.query.sessions.findFirst({
    where: and(
      eq(sessions.refreshTokenHash, tokenHash),
      isNull(sessions.revokedAt),
      gt(sessions.expiresAt, new Date()),
    ),
    with: { user: true },
  });
  if (!session) throw unauthorized('Сессия истекла, войдите заново');

  // Ротация: старый refresh-токен перестаёт действовать сразу.
  const nextToken = randomToken();
  await db
    .update(sessions)
    .set({
      refreshTokenHash: await sha256Hex(nextToken),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    })
    .where(eq(sessions.id, session.id));

  const accessToken = await signAccessToken(secret, session.user, session.id);
  return { user: toPublicUser(session.user), accessToken, refreshToken: nextToken };
}

/** Отзывает сессию по refresh-токену (работает и с истёкшим access-токеном). */
export async function logoutByRefreshToken(db: Db, refreshToken: string) {
  const tokenHash = await sha256Hex(refreshToken);
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.refreshTokenHash, tokenHash), isNull(sessions.revokedAt)));
}

export async function getMe(db: Db, userId: string): Promise<PublicUser> {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw notFound('Пользователь не найден');
  return toPublicUser(user);
}

export async function updateProfile(db: Db, userId: string, input: UpdateProfileInput) {
  const patch: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.phone !== undefined) patch.phone = input.phone;
  await db.update(users).set(patch).where(eq(users.id, userId));
  return getMe(db, userId);
}

export async function changePassword(
  db: Db,
  userId: string,
  sessionId: string,
  input: ChangePasswordInput,
) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw notFound('Пользователь не найден');
  if (!user.passwordHash) throw validationError('Для этого аккаунта пароль не задан');

  const valid = await verifyPassword(input.currentPassword, user.passwordHash);
  if (!valid) throw unauthorized('Неверный текущий пароль');

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(input.newPassword), updatedAt: new Date() })
    .where(eq(users.id, userId));

  // Остальные сессии отзываются: смена пароля должна «выбивать» чужие устройства.
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), ne(sessions.id, sessionId), isNull(sessions.revokedAt)));
}
