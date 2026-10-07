import { settings } from '@tver/db';
import { describe, expect, it } from 'vitest';
import { TEST_ENV, bearer, body, createAdmin, createTestApp, jsonInit } from './helpers';

describe('P1: allowlist настроек', () => {
  it('произвольный ключ отклоняется 422', async () => {
    const { app, db } = await createTestApp();
    const admin = await createAdmin(app, db);
    const res = await app.request(
      '/api/v1/admin/settings',
      { ...jsonInit({ entries: { 'telegram.webhookSecret': 'hacked' } }, bearer(admin.accessToken)), method: 'PUT' },
      TEST_ENV,
    );
    expect(res.status).toBe(422);
  });

  it('битая ссылка в контактах отклоняется', async () => {
    const { app, db } = await createTestApp();
    const admin = await createAdmin(app, db);
    const res = await app.request(
      '/api/v1/admin/settings',
      {
        ...jsonInit({ entries: { 'contacts.telegram': 'javascript:alert(1)' } }, bearer(admin.accessToken)),
        method: 'PUT',
      },
      TEST_ENV,
    );
    expect(res.status).toBe(422);
  });

  it('битый about.team отклоняется, корректный сохраняется', async () => {
    const { app, db } = await createTestApp();
    const admin = await createAdmin(app, db);
    const bad = await app.request(
      '/api/v1/admin/settings',
      {
        ...jsonInit({ entries: { 'about.team': 'not json' } }, bearer(admin.accessToken)),
        method: 'PUT',
      },
      TEST_ENV,
    );
    expect(bad.status).toBe(422);
    const good = await app.request(
      '/api/v1/admin/settings',
      {
        ...jsonInit({ entries: { 'about.team': JSON.stringify([{ name: 'Елена' }]) } }, bearer(admin.accessToken)),
        method: 'PUT',
      },
      TEST_ENV,
    );
    expect(good.status).toBe(200);
  });

  it('GET не отдаёт секреты целиком', async () => {
    const { app, db } = await createTestApp();
    const admin = await createAdmin(app, db);
    await db.insert(settings).values({ key: 'vk.secret', value: JSON.stringify('topsecret') });
    const res = await app.request('/api/v1/admin/settings', { headers: bearer(admin.accessToken) }, TEST_ENV);
    expect(res.status).toBe(200);
    const data = (await body(res)).data as Record<string, unknown>;
    expect(data['vk.secret']).toEqual({ secretSet: true });
  });
});
