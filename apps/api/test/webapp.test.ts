import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyInitData } from '../src/modules/auth/webapp';

/**
 * Подпись initData считается независимо — средствами node:crypto, а не тем
 * же кодом, что проверяется. Иначе тест повторил бы ошибку реализации и
 * ничего бы не поймал.
 */
function signInitData(token: string, fields: Record<string, string>): string {
  const dataCheckString = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join('\n');

  // Ключ — HMAC от токена со словом WebAppData, а не сам токен.
  const secretKey = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const params = new URLSearchParams(fields);
  params.set('hash', hash);
  return params.toString();
}

const TOKEN = '123456:AAF-fake-token-for-tests';

function fields(authDateSeconds: number) {
  return {
    auth_date: String(authDateSeconds),
    query_id: 'AAH-test',
    user: JSON.stringify({ id: 987654321, first_name: 'Елена', last_name: 'Громова' }),
  };
}

describe('вход в мини-приложение Telegram', () => {
  const now = Date.UTC(2026, 7, 30, 12, 0, 0);
  const fresh = Math.floor(now / 1000) - 60;

  it('принимает правильно подписанные данные', async () => {
    const initData = signInitData(TOKEN, fields(fresh));
    const user = await verifyInitData(initData, TOKEN, now);
    expect(user).toEqual({
      id: '987654321',
      firstName: 'Елена',
      lastName: 'Громова',
      username: null,
      photoUrl: null,
    });
  });

  it('отвергает подделанные данные', async () => {
    const initData = signInitData(TOKEN, fields(fresh));
    // Меняем идентификатор, не пересчитывая подпись — так выглядит подмена.
    const tampered = initData.replace('987654321', '111111111');
    expect(await verifyInitData(tampered, TOKEN, now)).toBeNull();
  });

  it('отвергает подпись чужим токеном', async () => {
    const initData = signInitData('999:OTHER', fields(fresh));
    expect(await verifyInitData(initData, TOKEN, now)).toBeNull();
  });

  it('отвергает просроченные данные', async () => {
    const old = Math.floor(now / 1000) - 48 * 60 * 60;
    const initData = signInitData(TOKEN, fields(old));
    expect(await verifyInitData(initData, TOKEN, now)).toBeNull();
  });

  it('отвергает строку без подписи', async () => {
    expect(await verifyInitData('user=%7B%7D&auth_date=1', TOKEN, now)).toBeNull();
  });
});
