import { outbox } from '@tver/db';
import { describe, expect, it } from 'vitest';
import { TEST_ENV, bearer, body, createAdmin, createTestApp, registerUser } from './helpers';

async function seedFailed(db: Awaited<ReturnType<typeof createTestApp>>['db']) {
  const id = crypto.randomUUID();
  await db.insert(outbox).values({
    id,
    channel: 'email',
    recipient: 'user@test.ru',
    template: 'password_reset',
    payload: { resetUrl: 'https://site/auth/reset?token=pr_secret', siteUrl: 'https://site' },
    status: 'failed',
    attempts: 3,
    lastError: 'Resend недоступен',
    scheduledAt: new Date(),
  });
  return id;
}

describe('admin: dead letter очереди уведомлений', () => {
  it('гость и обычный пользователь не видят очередь', async () => {
    const { app } = await createTestApp();
    expect((await app.request('/api/v1/admin/outbox', {}, TEST_ENV)).status).toBe(401);
    const { accessToken } = await registerUser(app);
    expect(
      (await app.request('/api/v1/admin/outbox', { headers: bearer(accessToken) }, TEST_ENV)).status,
    ).toBe(403);
  });

  it('список failed без токенов в payload + повторная постановка', async () => {
    const { app, db } = await createTestApp();
    const admin = await createAdmin(app, db);
    const id = await seedFailed(db);

    const list = await app.request('/api/v1/admin/outbox', { headers: bearer(admin.accessToken) }, TEST_ENV);
    expect(list.status).toBe(200);
    const data = (await body(list)).data;
    expect(data.total).toBe(1);
    expect(data.items[0]).toMatchObject({ id, status: 'failed', attempts: 3 });
    // Токен сброса наружу не отдаём.
    expect(JSON.stringify(data.items[0])).not.toContain('pr_secret');

    const retry = await app.request(
      `/api/v1/admin/outbox/${id}/retry`,
      { method: 'POST', headers: bearer(admin.accessToken) },
      TEST_ENV,
    );
    expect(retry.status).toBe(200);

    // Задача снова pending — повторный retry уже 404.
    const again = await app.request(
      `/api/v1/admin/outbox/${id}/retry`,
      { method: 'POST', headers: bearer(admin.accessToken) },
      TEST_ENV,
    );
    expect(again.status).toBe(404);
    const pending = await app.request(
      '/api/v1/admin/outbox?status=pending',
      { headers: bearer(admin.accessToken) },
      TEST_ENV,
    );
    expect((await body(pending)).data.total).toBe(1);
  });
});
