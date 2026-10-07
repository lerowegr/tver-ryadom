/**
 * Стейтлес-токены восстановления пароля (сброс, не смена).
 *
 * Формат: `pr_<userId>_<expBase36>_<sigHex16>`, подпись HMAC отдельно от
 * tg-link (`password-reset.`-префикс сообщения), поэтому коды привязки
 * Telegram здесь не примутся и наоборот — даже на одном JWT_SECRET.
 * Хранить в БД нечего: срок и подпись проверяются криптографически.
 * TTL 60 минут — письмо может идти с задержкой через ретраи outbox.
 */

const TTL_MS = 60 * 60 * 1000;
const SIG_LENGTH = 16;

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, SIG_LENGTH);
}

export async function createPasswordResetToken(secret: string, userId: string): Promise<string> {
  if (userId.includes('_')) throw new Error('userId не должен содержать «_»');
  const exp = Date.now() + TTL_MS;
  const sig = await hmacHex(secret, `password-reset.${userId}.${exp}`);
  return `pr_${userId}_${exp.toString(36)}_${sig}`;
}

export async function verifyPasswordResetToken(
  secret: string,
  token: string,
): Promise<string | null> {
  if (!token.startsWith('pr_')) return null;
  const parts = token.slice(3).split('_');
  if (parts.length !== 3) return null;
  const [userId, expRaw, sig] = parts as [string, string, string];
  const exp = parseInt(expRaw, 36);
  if (!userId || !Number.isFinite(exp) || exp < Date.now()) return null;
  const expected = await hmacHex(secret, `password-reset.${userId}.${exp}`);
  return sameLengthEqual(expected, sig) ? userId : null;
}

/** Сравнение без ранних выходов: длина подписи известна заранее. */
function sameLengthEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
