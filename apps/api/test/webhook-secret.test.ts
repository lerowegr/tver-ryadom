import { settings } from '@tver/db';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { TEST_ENV, createTestApp, jsonInit } from './helpers';

describe('H3: вебхуки VK/MAX закрыты без секрета (fail-closed)', () => {
  it('VK без настроенного секрета отвечает 403 даже на confirmation', async () => {
    const { app } = await createTestApp();
    const res = await app.request('/webhook/vk', jsonInit({ type: 'confirmation' }), TEST_ENV);
    expect(res.status).toBe(403);
  });

  it('VK с неверным секретом отвечает 403 так же, как без секрета', async () => {
    const { app, db } = await createTestApp();
    await db
      .insert(settings)
      .values({ key: 'vk.secret', value: JSON.stringify('s3cr3t') })
      .onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify('s3cr3t') } });
    const wrong = await app.request(
      '/webhook/vk',
      jsonInit({ type: 'confirmation', secret: 'wrong' }),
      TEST_ENV,
    );
    expect(wrong.status).toBe(403);
    expect(await wrong.text()).toBe(await (await app.request('/webhook/vk', jsonInit({}), TEST_ENV)).text());
    // Чистим за собой (каждый тест и так на своей БД)
    await db.delete(settings).where(eq(settings.key, 'vk.secret'));
  });

  it('VK с верным секретом отдаёт строку подтверждения', async () => {
    const { app, db } = await createTestApp();
    await db
      .insert(settings)
      .values([
        { key: 'vk.secret', value: JSON.stringify('s3cr3t') },
        { key: 'vk.confirmation', value: JSON.stringify('CONFIRM-123') },
      ])
      .onConflictDoNothing();
    const res = await app.request(
      '/webhook/vk',
      jsonInit({ type: 'confirmation', secret: 's3cr3t' }),
      TEST_ENV,
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('CONFIRM-123');
  });

  it('MAX без настроенного секрета отвечает 403', async () => {
    const { app } = await createTestApp();
    const res = await app.request(
      '/webhook/max',
      jsonInit({ message: { chat: { id: 1 }, from: { id: 2 }, text: 'hi' } }),
      TEST_ENV,
    );
    expect(res.status).toBe(403);
  });

  it('MAX с верным секретом не 403', async () => {
    const { app, db } = await createTestApp();
    await db
      .insert(settings)
      .values({ key: 'max.secret', value: JSON.stringify('m4x') })
      .onConflictDoNothing();
    const res = await app.request(
      '/webhook/max',
      jsonInit({ secret: 'm4x', message: { chat: { id: 1 }, from: { id: 2 }, text: 'hi' } }),
      TEST_ENV,
    );
    // Без токена MAX обработчик отвечает ok (нечего отправлять) — главное, не 403
    expect(res.status).not.toBe(403);
  });
});
