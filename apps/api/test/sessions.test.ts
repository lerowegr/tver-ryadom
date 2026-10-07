import { sessions } from '@tver/db';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { TEST_ENV, bearer, body, createAdmin, createTestApp, refreshCookieOf, registerUser } from './helpers';

describe('P1: отзыв сессий действует сразу', () => {
  it('logout убивает и access-токен, а не только refresh', async () => {
    const { app } = await createTestApp();
    const { accessToken, refreshCookie } = await registerUser(app);
    const logout = await app.request('/api/v1/auth/logout', {
      method: 'POST',
      headers: { Cookie: refreshCookie },
    }, TEST_ENV);
    expect(logout.status).toBe(200);
    const me = await app.request('/api/v1/auth/me', { headers: bearer(accessToken) }, TEST_ENV);
    expect(me.status).toBe(401);
  });

  it('понижение через /:id/role отзывает refresh пониженного', async () => {
    const { app, db } = await createTestApp();
    const root = await createAdmin(app, db);
    const victim = await createAdmin(app, db);
    const res = await app.request(
      `/api/v1/admin/users/${victim.user.id}/role`,
      {
        method: 'PATCH',
        body: JSON.stringify({ role: 'user' }),
        headers: { 'Content-Type': 'application/json', ...bearer(root.accessToken) },
      },
      TEST_ENV,
    );
    expect(res.status).toBe(200);
    // Старый access пониженного больше не админ…
    const stats = await app.request('/api/v1/admin/stats', { headers: bearer(victim.accessToken) }, TEST_ENV);
    expect([401, 403]).toContain(stats.status);
    // …и его refresh мёртв.
    const refresh = await app.request(
      '/api/v1/auth/refresh',
      { method: 'POST', headers: { Cookie: victim.refreshCookie } },
      TEST_ENV,
    );
    expect(refresh.status).toBe(401);
  });

  it('reuse старого refresh отзывает всю цепочку', async () => {
    const { app } = await createTestApp();
    const { refreshCookie } = await registerUser(app);
    const first = await app.request('/api/v1/auth/refresh', { method: 'POST', headers: { Cookie: refreshCookie } }, TEST_ENV);
    expect(first.status).toBe(200);
    const secondCookie = refreshCookieOf(first);
    // Replay украденного старого токена — детект reuse.
    const replay = await app.request('/api/v1/auth/refresh', { method: 'POST', headers: { Cookie: refreshCookie } }, TEST_ENV);
    expect(replay.status).toBe(401);
    // Легитимный новый токен тоже мёртв — нужно входить заново.
    const after = await app.request('/api/v1/auth/refresh', { method: 'POST', headers: { Cookie: secondCookie } }, TEST_ENV);
    expect(after.status).toBe(401);
  });

  it('цепочка старше 90 дней требует полного входа', async () => {
    const { app, db } = await createTestApp();
    const { user, refreshCookie } = await registerUser(app);
    await db
      .update(sessions)
      .set({ createdAt: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000) })
      .where(eq(sessions.userId, user.id));
    const res = await app.request('/api/v1/auth/refresh', { method: 'POST', headers: { Cookie: refreshCookie } }, TEST_ENV);
    expect(res.status).toBe(401);
  });

  it('список и отзыв сессий работают, чужие отозвать нельзя', async () => {
    const { app } = await createTestApp();
    const a = await registerUser(app, { email: 'sess-a@test.ru' });
    const b = await registerUser(app, { email: 'sess-b@test.ru' });
    const list = await app.request('/api/v1/auth/sessions', { headers: bearer(a.accessToken) }, TEST_ENV);
    expect(list.status).toBe(200);
    const items = (await body(list)).data as { id: string }[];
    expect(items).toHaveLength(1);
    expect(items[0]).not.toHaveProperty('refreshTokenHash');
    // Чужую сессию по id из чужого списка — 404, а не отзыв.
    const bList = (await body(await app.request('/api/v1/auth/sessions', { headers: bearer(b.accessToken) }, TEST_ENV))).data as { id: string }[];
    const foreign = await app.request(`/api/v1/auth/sessions/${bList[0]!.id}`, { method: 'DELETE', headers: bearer(a.accessToken) }, TEST_ENV);
    expect(foreign.status).toBe(404);
    // Свою — можно, access сразу мёртв.
    const own = await app.request(`/api/v1/auth/sessions/${items[0]!.id}`, { method: 'DELETE', headers: bearer(a.accessToken) }, TEST_ENV);
    expect(own.status).toBe(200);
    const me = await app.request('/api/v1/auth/me', { headers: bearer(a.accessToken) }, TEST_ENV);
    expect(me.status).toBe(401);
  });
});

describe('P1: LIKE-поиск без wildcard-инъекции', () => {
  it('search=% не возвращает весь каталог', async () => {
    const { app } = await createTestApp();
    const res = await app.request('/api/v1/tours?search=%25', {}, TEST_ENV);
    expect(res.status).toBe(200);
    const data = (await body(res)).data;
    expect(data.total).toBe(0);
  });
});
