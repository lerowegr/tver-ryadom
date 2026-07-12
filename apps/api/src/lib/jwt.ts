import type { UserRole } from '@tver/shared';
import { sign, verify } from 'hono/jwt';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export interface AccessTokenPayload {
  /** id пользователя */
  sub: string;
  role: UserRole;
  /** id сессии — для отзыва access-токенов вместе с сессией */
  sid: string;
  exp: number;
  [key: string]: unknown;
}

export async function signAccessToken(
  secret: string,
  user: { id: string; role: UserRole },
  sessionId: string,
): Promise<string> {
  const payload: AccessTokenPayload = {
    sub: user.id,
    role: user.role,
    sid: sessionId,
    exp: Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_SECONDS,
  };
  return sign(payload, secret);
}

export async function verifyAccessToken(
  secret: string,
  token: string,
): Promise<AccessTokenPayload | null> {
  try {
    const payload = await verify(token, secret, 'HS256');
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') return null;
    return payload as AccessTokenPayload;
  } catch {
    return null;
  }
}
