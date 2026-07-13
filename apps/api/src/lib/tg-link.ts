/**
 * Стейтлес-коды привязки Telegram: userId и срок действия подписаны HMAC,
 * поэтому ничего не нужно хранить. Код передаётся в /start deep-link.
 *
 * Формат: <userId>_<expBase36>_<sigHex16>. Telegram разрешает в start-параметре
 * только [A-Za-z0-9_-] и максимум 64 символа: userId — UUID (hex и дефисы),
 * подпись — hex, поэтому «_» встречается ровно дважды как разделитель.
 */

const TTL_MS = 15 * 60 * 1000;
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

export async function createLinkCode(secret: string, userId: string): Promise<string> {
  if (userId.includes('_')) throw new Error('userId не должен содержать «_»');
  const exp = Date.now() + TTL_MS;
  const sig = await hmacHex(secret, `${userId}.${exp}`);
  return `${userId}_${exp.toString(36)}_${sig}`;
}

export async function verifyLinkCode(secret: string, code: string): Promise<string | null> {
  const parts = code.split('_');
  if (parts.length !== 3) return null;
  const [userId, expRaw, sig] = parts as [string, string, string];
  const exp = parseInt(expRaw, 36);
  if (!userId || !Number.isFinite(exp) || exp < Date.now()) return null;
  const expected = await hmacHex(secret, `${userId}.${exp}`);
  return expected === sig ? userId : null;
}
