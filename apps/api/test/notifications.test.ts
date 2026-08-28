import { bookings, outbox, schedules, users } from '@tver/db';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createLinkCode, verifyLinkCode } from '../src/lib/tg-link';
import { notifyUser } from '../src/modules/notifications/dispatch';
import { processOutbox, type OutboxSenders } from '../src/modules/notifications/outbox';
import { enqueueReminders } from '../src/modules/notifications/reminders';
import { renderTemplate } from '../src/modules/notifications/templates';
import { TEST_ENV, bearer, body, createAdmin, createTestApp, jsonInit, registerUser } from './helpers';

function fakeSenders(overrides: Partial<OutboxSenders> = {}): OutboxSenders & {
  telegramSent: { recipient: string; text: string }[];
  emailSent: { recipient: string; subject: string }[];
} {
  const telegramSent: { recipient: string; text: string }[] = [];
  const emailSent: { recipient: string; subject: string }[] = [];
  return {
    telegramSent,
    emailSent,
    telegram: async (recipient, text) => {
      telegramSent.push({ recipient, text });
    },
    email: async (recipient, subject) => {
      emailSent.push({ recipient, subject });
    },
    ...overrides,
  };
}

describe('уведомления: outbox', () => {
  it('notifyUser пишет в ЛК и ставит задачи по подключённым каналам', async () => {
    const { app, db } = await createTestApp();
    const { user } = await registerUser(app, { email: 'notify@test.ru' });
    await db.update(users).set({ telegramChatId: '111222' }).where(eq(users.id, user.id));

    await notifyUser(db, user.id, 'booking_confirmed', { tourTitle: 'Тестовая', siteUrl: 'https://site' });

    const rows = await db.select().from(outbox);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.channel).sort()).toEqual(['email', 'telegram']);
    expect(rows.every((r) => r.status === 'pending')).toBe(true);
  });

  it('processOutbox доставляет пачку и помечает sent', async () => {
    const { app, db } = await createTestApp();
    const { user } = await registerUser(app, { email: 'deliver@test.ru' });
    await db.update(users).set({ telegramChatId: '333' }).where(eq(users.id, user.id));
    await notifyUser(db, user.id, 'booking_confirmed', { tourTitle: 'Обзорная' });

    const senders = fakeSenders();
    const result = await processOutbox(db, TEST_ENV, senders);

    expect(result).toMatchObject({ picked: 2, sent: 2, failed: 0 });
    expect(senders.telegramSent[0]?.recipient).toBe('333');
    expect(senders.telegramSent[0]?.text).toContain('подтверждено');
    expect(senders.emailSent[0]?.recipient).toBe('deliver@test.ru');

    const rows = await db.select().from(outbox);
    expect(rows.every((r) => r.status === 'sent' && r.sentAt !== null)).toBe(true);
  });

  it('ошибки канала ретраятся с паузой, после 3 попыток — failed', async () => {
    const { app, db } = await createTestApp();
    const { user } = await registerUser(app);
    await db.update(users).set({ telegramChatId: '444', email: null }).where(eq(users.id, user.id));
    await notifyUser(db, user.id, 'booking_confirmed', {});

    const failing = fakeSenders({
      telegram: async () => {
        throw new Error('Telegram недоступен');
      },
    });

    // Попытка 1: остаётся pending с отложенным scheduledAt.
    await processOutbox(db, TEST_ENV, failing);
    let [row] = await db.select().from(outbox);
    expect(row?.status).toBe('pending');
    expect(row?.attempts).toBe(1);
    expect(row!.scheduledAt.getTime()).toBeGreaterThan(Date.now());

    // Возвращаем в очередь вручную и добиваем до лимита.
    for (const attempt of [2, 3]) {
      await db.update(outbox).set({ scheduledAt: new Date(Date.now() - 1000) });
      await processOutbox(db, TEST_ENV, failing);
      [row] = await db.select().from(outbox);
      expect(row?.attempts).toBe(attempt);
    }
    expect(row?.status).toBe('failed');
    expect(row?.lastError).toContain('Telegram недоступен');
  });
});

describe('уведомления: события', () => {
  it('бронирование ставит Telegram-задачу администратору', async () => {
    const { app, db } = await createTestApp();
    const admin = await createAdmin(app, db);
    await db.update(users).set({ telegramChatId: 'admin-chat' }).where(eq(users.id, admin.user.id));

    const slot = await db.query.schedules.findFirst({ where: eq(schedules.tourId, 'tour-obzornaya') });
    await app.request(
      '/api/v1/bookings',
      jsonInit({
        tourId: 'tour-obzornaya',
        scheduleId: slot!.id,
        peopleCount: 2,
        contactName: 'Гость',
        contactPhone: '89001112233',
      }),
      TEST_ENV,
    );

    const rows = await db
      .select()
      .from(outbox)
      .where(and(eq(outbox.channel, 'telegram'), eq(outbox.recipient, 'admin-chat')));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.template).toBe('admin_new_booking');

    const rendered = renderTemplate(rows[0]!.template, rows[0]!.payload ?? {});
    expect(rendered.text).toContain('Живые истории');
    // Intl вставляет неразрывные пробелы между разрядами — нормализуем.
    expect(rendered.text.replace(new RegExp('[' + String.fromCharCode(160, 8239) + ']', 'g'), ' ')).toContain('4 500'); // 4500 ₽ за группу
  });

  it('подтверждение брони админом уходит клиенту в telegram и email', async () => {
    const { app, db } = await createTestApp();
    const admin = await createAdmin(app, db);
    const client = await registerUser(app, { email: 'client-tg@test.ru' });
    await db.update(users).set({ telegramChatId: 'client-chat' }).where(eq(users.id, client.user.id));

    const slot = await db.query.schedules.findFirst({ where: eq(schedules.tourId, 'tour-predmeste') });
    const created = await app.request(
      '/api/v1/bookings',
      jsonInit(
        {
          tourId: 'tour-predmeste',
          scheduleId: slot!.id,
          peopleCount: 2,
          contactName: 'Клиент',
          contactPhone: '89001112233',
        },
        bearer(client.accessToken),
      ),
      TEST_ENV,
    );
    const bookingId = (await body(created)).data.id;

    await app.request(`/api/v1/admin/bookings/${bookingId}`, {
      ...jsonInit({ status: 'confirmed' }, bearer(admin.accessToken)),
      method: 'PATCH',
    }, TEST_ENV);

    const rows = await db
      .select()
      .from(outbox)
      .where(eq(outbox.template, 'booking_confirmed'));
    const channels = rows.map((r) => r.channel).sort();
    expect(channels).toEqual(['email', 'telegram']);
  });
});

describe('уведомления: напоминания', () => {
  it('за сутки до экскурсии создаётся напоминание, без дублей', async () => {
    const { app, db } = await createTestApp();
    const client = await registerUser(app, { email: 'remind@test.ru' });

    // Слот через 10 часов + подтверждённая бронь.
    const slotId = crypto.randomUUID();
    await db.insert(schedules).values({
      id: slotId,
      tourId: 'tour-obzornaya',
      startsAt: new Date(Date.now() + 10 * 3600 * 1000),
      capacity: 10,
      bookedCount: 2,
    });
    const bookingId = crypto.randomUUID();
    await db.insert(bookings).values({
      id: bookingId,
      userId: client.user.id,
      tourId: 'tour-obzornaya',
      scheduleId: slotId,
      peopleCount: 2,
      totalPrice: 240000,
      status: 'confirmed',
      contactName: 'Клиент',
      contactPhone: '+79001112233',
    });

    const first = await enqueueReminders(db, 'https://site');
    expect(first.reminders).toBe(1);

    const rows = await db.select().from(outbox).where(eq(outbox.template, 'booking_reminder'));
    expect(rows).toHaveLength(1); // только email-канал (telegram не привязан)

    // Повторный запуск ничего не добавляет.
    const second = await enqueueReminders(db, 'https://site');
    expect(second.reminders).toBe(0);
  });
});

describe('привязка Telegram', () => {
  it('код привязки создаётся и верифицируется, чужой секрет отклоняется', async () => {
    const code = await createLinkCode('secret-a', 'user-123');
    expect(await verifyLinkCode('secret-a', code)).toBe('user-123');
    expect(await verifyLinkCode('secret-b', code)).toBeNull();
    expect(await verifyLinkCode('secret-a', 'мусор')).toBeNull();
  });

  it('эндпоинт выдаёт deep-link при настроенном боте', async () => {
    const { app } = await createTestApp();
    const { accessToken } = await registerUser(app);

    const without = await app.request('/api/v1/auth/telegram-link', { headers: bearer(accessToken) }, TEST_ENV);
    expect((await body(without)).data.available).toBe(false);

    const envWithBot = { ...TEST_ENV, TELEGRAM_BOT_USERNAME: 'tver_ryadom_bot' };
    const res = await app.request('/api/v1/auth/telegram-link', { headers: bearer(accessToken) }, envWithBot);
    const { data } = await body(res);
    expect(data.available).toBe(true);
    expect(data.url).toMatch(/^https:\/\/t\.me\/tver_ryadom_bot\?start=/);
  });
});
