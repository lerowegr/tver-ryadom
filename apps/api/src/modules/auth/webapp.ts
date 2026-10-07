/**
 * Вход в мини-приложение Telegram.
 *
 * Telegram передаёт страницу параметр initData: строку с данными о человеке
 * и подписью. Подпись — единственное, что отличает настоящего посетителя от
 * подделанной строки, поэтому проверяем её сами и до неё ничему не верим.
 *
 * Схема из документации: ключом для подписи служит не сам токен бота, а
 * HMAC от него со словом «WebAppData». Перепутать порядок легко, и тогда
 * проверка молча отвергала бы всех подряд.
 */

export interface WebAppUser {
  id: string;
  firstName: string;
  lastName: string | null;
  username: string | null;
  photoUrl: string | null;
}

/** Строка старше 10 минут не принимается: подпись вечная, а сессия — нет (P1). */
const MAX_AGE_MS = 10 * 60 * 1000;

async function hmac(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Сравнение без ранних выходов: длина подписи известна, утечки времени ни к чему. */
function sameHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyInitData(
  initData: string,
  botToken: string,
  now: number = Date.now(),
): Promise<WebAppUser | null> {
  if (!initData || !botToken) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  // Проверяемая строка — пары «ключ=значение», отсортированные по ключу.
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = await hmac(new TextEncoder().encode('WebAppData'), botToken);
  const signature = toHex(await hmac(secretKey, dataCheckString));
  if (!sameHex(signature, hash)) return null;

  const authDate = Number(params.get('auth_date') ?? 0);
  if (!authDate || now - authDate * 1000 > MAX_AGE_MS) return null;

  try {
    const raw = JSON.parse(params.get('user') ?? 'null') as {
      id?: number;
      first_name?: string;
      last_name?: string;
      username?: string;
      photo_url?: string;
    } | null;
    if (!raw?.id) return null;
    return {
      id: String(raw.id),
      firstName: raw.first_name ?? 'Гость',
      lastName: raw.last_name ?? null,
      username: raw.username ?? null,
      photoUrl: raw.photo_url ?? null,
    };
  } catch {
    return null;
  }
}
