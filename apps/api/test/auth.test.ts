import { describe, expect, it } from 'vitest';
import { TEST_ENV, body, createTestApp, jsonInit, refreshCookieOf, registerUser, bearer } from './helpers';

describe('auth', () => {
  it('регистрирует пользователя и выдаёт токены', async () => {
    const { app } = await createTestApp();
    const res = await app.request(
      '/api/v1/auth/register',
      jsonInit({ name: 'Мария', email: 'Maria@Example.com', password: 'password123' }),
      TEST_ENV,
    );
    expect(res.status).toBe(201);
    const { data } = await body(res);
    expect(data.user.email).toBe('maria@example.com'); // email нормализуется к нижнему регистру
    expect(data.user.role).toBe('user');
    expect(data.accessToken).toBeTruthy();
    expect(refreshCookieOf(res)).toMatch(/^refresh_token=/);
  });

  it('не даёт зарегистрироваться на занятый email', async () => {
    const { app } = await createTestApp();
    await registerUser(app, { email: 'dup@example.com' });
    const res = await app.request(
      '/api/v1/auth/register',
      jsonInit({ name: 'Дубль', email: 'dup@example.com', password: 'password123' }),
      TEST_ENV,
    );
    expect(res.status).toBe(409);
  });

  it('возвращает 422 с деталями при невалидных данных', async () => {
    const { app } = await createTestApp();
    const res = await app.request(
      '/api/v1/auth/register',
      jsonInit({ name: 'А', email: 'не-почта', password: '123' }),
      TEST_ENV,
    );
    expect(res.status).toBe(422);
    const { error } = await body(res);
    expect(error.code).toBe('validation_error');
    expect(error.details.email).toBeTruthy();
    expect(error.details.password).toBeTruthy();
  });

  it('логин: неверный пароль → 401, верный → токены', async () => {
    const { app } = await createTestApp();
    await registerUser(app, { email: 'login@example.com', password: 'password123' });

    const bad = await app.request(
      '/api/v1/auth/login',
      jsonInit({ email: 'login@example.com', password: 'wrong-pass' }),
      TEST_ENV,
    );
    expect(bad.status).toBe(401);

    const good = await app.request(
      '/api/v1/auth/login',
      jsonInit({ email: 'login@example.com', password: 'password123' }),
      TEST_ENV,
    );
    expect(good.status).toBe(200);
    expect((await body(good)).data.accessToken).toBeTruthy();
  });

  it('/me требует токен и возвращает профиль', async () => {
    const { app } = await createTestApp();
    const anon = await app.request('/api/v1/auth/me', {}, TEST_ENV);
    expect(anon.status).toBe(401);

    const { accessToken, user } = await registerUser(app);
    const res = await app.request('/api/v1/auth/me', { headers: bearer(accessToken) }, TEST_ENV);
    expect(res.status).toBe(200);
    expect((await body(res)).data.id).toBe(user.id);
  });

  it('refresh ротирует токен: старый становится недействительным', async () => {
    const { app } = await createTestApp();
    const { refreshCookie } = await registerUser(app);

    const first = await app.request(
      '/api/v1/auth/refresh',
      { method: 'POST', headers: { Cookie: refreshCookie } },
      TEST_ENV,
    );
    expect(first.status).toBe(200);
    expect((await body(first)).data.accessToken).toBeTruthy();

    // Повторное использование старого refresh-токена должно быть отклонено.
    const replay = await app.request(
      '/api/v1/auth/refresh',
      { method: 'POST', headers: { Cookie: refreshCookie } },
      TEST_ENV,
    );
    expect(replay.status).toBe(401);

    // Reuse-детект (P1): повтор старого токена — признак кражи, поэтому
    // отзывается вся цепочка, включая токен из первого ответа.
    const rotated = refreshCookieOf(first);
    const second = await app.request(
      '/api/v1/auth/refresh',
      { method: 'POST', headers: { Cookie: rotated } },
      TEST_ENV,
    );
    expect(second.status).toBe(401);
  });

  it('logout отзывает сессию', async () => {
    const { app } = await createTestApp();
    const { refreshCookie } = await registerUser(app);

    const logout = await app.request(
      '/api/v1/auth/logout',
      { method: 'POST', headers: { Cookie: refreshCookie } },
      TEST_ENV,
    );
    expect(logout.status).toBe(200);

    const refresh = await app.request(
      '/api/v1/auth/refresh',
      { method: 'POST', headers: { Cookie: refreshCookie } },
      TEST_ENV,
    );
    expect(refresh.status).toBe(401);
  });

  it('обновляет профиль с нормализацией телефона', async () => {
    const { app } = await createTestApp();
    const { accessToken } = await registerUser(app);
    const res = await app.request(
      '/api/v1/auth/profile',
      {
        ...jsonInit({ phone: '8 900 123-45-67' }, bearer(accessToken)),
        method: 'PATCH',
      },
      TEST_ENV,
    );
    expect(res.status).toBe(200);
    expect((await body(res)).data.phone).toBe('+79001234567');
  });

  it('меняет пароль и отклоняет старый', async () => {
    const { app } = await createTestApp();
    const email = 'pass@example.com';
    const { accessToken } = await registerUser(app, { email, password: 'password123' });

    const change = await app.request(
      '/api/v1/auth/change-password',
      jsonInit({ currentPassword: 'password123', newPassword: 'newpassword456' }, bearer(accessToken)),
      TEST_ENV,
    );
    expect(change.status).toBe(200);

    const oldLogin = await app.request(
      '/api/v1/auth/login',
      jsonInit({ email, password: 'password123' }),
      TEST_ENV,
    );
    expect(oldLogin.status).toBe(401);

    const newLogin = await app.request(
      '/api/v1/auth/login',
      jsonInit({ email, password: 'newpassword456' }),
      TEST_ENV,
    );
    expect(newLogin.status).toBe(200);
  });
});
