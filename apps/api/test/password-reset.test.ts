import { outbox } from '@tver/db';
import { describe, expect, it } from 'vitest';
import { createPasswordResetToken } from '../src/lib/password-reset';
import { TEST_ENV, bearer, body, createTestApp, jsonInit, registerUser } from './helpers';

describe('восстановление пароля', () => {
  it('заявка всегда 200, письмо — только существующему email', async () => {
    const { app } = await createTestApp();
    await registerUser(app, { email: 'reset-me@test.ru' });

    const known = await app.request(
      '/api/v1/auth/password-reset/request',
      jsonInit({ email: 'reset-me@test.ru' }),
      TEST_ENV,
    );
    expect(known.status).toBe(200);

    const unknown = await app.request(
      '/api/v1/auth/password-reset/request',
      jsonInit({ email: 'nobody-here@test.ru' }),
      TEST_ENV,
    );
    // Тот же ответ — перебор email по ответу невозможен.
    expect(unknown.status).toBe(200);
    expect(await unknown.json()).toEqual(await known.json());
  });

  it('письмо кладётся в outbox email-каналом с ссылкой', async () => {
    const { app, db } = await createTestApp();
    await registerUser(app, { email: 'letter@test.ru' });
    await app.request('/api/v1/auth/password-reset/request', jsonInit({ email: 'letter@test.ru' }), TEST_ENV);
    const rows = await db.select().from(outbox);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ channel: 'email', recipient: 'letter@test.ru', template: 'password_reset' });
    expect(String((rows[0]!.payload as { resetUrl?: string }).resetUrl)).toContain('/auth/reset?token=pr_');
  });

  it('подтверждение меняет пароль, гасит сессии и входит сразу', async () => {
    const { app } = await createTestApp();
    const { user, accessToken } = await registerUser(app, { email: 'change-me@test.ru', password: 'password123' });
    void user;
    const token = await createPasswordResetToken('test-secret', user.id);
    const res = await app.request(
      '/api/v1/auth/password-reset/confirm',
      jsonInit({ token, password: 'brand-new-pass-1' }),
      TEST_ENV,
    );
    expect(res.status).toBe(200);
    expect((await body(res)).data.accessToken).toBeTruthy();

    // Старый access мёртв (все сессии отозваны), старый пароль — тоже.
    const me = await app.request('/api/v1/auth/me', { headers: bearer(accessToken) }, TEST_ENV);
    expect(me.status).toBe(401);
    const oldLogin = await app.request(
      '/api/v1/auth/login',
      jsonInit({ email: 'change-me@test.ru', password: 'password123' }),
      TEST_ENV,
    );
    expect(oldLogin.status).toBe(401);
    const newLogin = await app.request(
      '/api/v1/auth/login',
      jsonInit({ email: 'change-me@test.ru', password: 'brand-new-pass-1' }),
      TEST_ENV,
    );
    expect(newLogin.status).toBe(200);
  });

  it('битый и чужой токены отклоняются', async () => {
    const { app } = await createTestApp();
    const bad = await app.request(
      '/api/v1/auth/password-reset/confirm',
      jsonInit({ token: 'pr_broken', password: 'brand-new-pass-1' }),
      TEST_ENV,
    );
    expect(bad.status).toBe(422);
    // Код привязки Telegram — не токен сброса (разные HMAC-домены).
    const foreign = await app.request(
      '/api/v1/auth/password-reset/confirm',
      jsonInit({ token: 'someid_abcdef_0123456789abcdef', password: 'brand-new-pass-1' }),
      TEST_ENV,
    );
    expect(foreign.status).toBe(422);
  });
});
