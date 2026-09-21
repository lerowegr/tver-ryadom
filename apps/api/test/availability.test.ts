import { availabilityBlocks } from '@tver/db';
import { describe, expect, it } from 'vitest';
import { isBlocked, toMskWallClock } from '../src/modules/availability/service';
import { TEST_ENV, body, createTestApp, jsonInit } from './helpers';

/**
 * Занятость экскурсовода.
 *
 * Главная опасность здесь — часовой пояс: воркер считает в UTC, а «закрыть
 * третье ноября» означает сутки в Твери. Поэтому ниже проверяются именно
 * края суток, а не середина, где ошибка в три часа ничего бы не сломала.
 */

/** Момент по московскому времени в виде обычной метки. */
function msk(iso: string): Date {
  return new Date(`${iso}+03:00`);
}

describe('занятость экскурсовода', () => {
  it('переводит момент в московские дату и время', () => {
    // 21:30 UTC — это уже следующие сутки в Твери.
    expect(toMskWallClock(new Date('2026-11-03T21:30:00.000Z'))).toEqual({
      date: '2026-11-04',
      time: '00:30',
    });
  });

  it('закрытый день закрыт до последнего вечернего часа', async () => {
    const { db } = await createTestApp();
    await db.insert(availabilityBlocks).values({
      id: crypto.randomUUID(),
      date: '2026-11-03',
      startTime: null,
      endTime: null,
      note: 'отпуск',
    });

    expect(await isBlocked(db, msk('2026-11-03T09:00'), 120)).toBe(true);
    expect(await isBlocked(db, msk('2026-11-03T20:00'), 120)).toBe(true);
    // Соседние сутки свободны: закрытие не растекается за край дня.
    expect(await isBlocked(db, msk('2026-11-02T20:00'), 120)).toBe(false);
    expect(await isBlocked(db, msk('2026-11-04T09:00'), 120)).toBe(false);
  });

  it('экскурсия, наезжающая на занятый час, тоже не проходит', async () => {
    const { db } = await createTestApp();
    await db.insert(availabilityBlocks).values({
      id: crypto.randomUUID(),
      date: '2026-11-05',
      startTime: '15:00',
      endTime: '17:00',
      note: 'экскурсия со Спутника',
    });

    // Начало свободно, но двухчасовая прогулка дотягивается до 15:00.
    expect(await isBlocked(db, msk('2026-11-05T14:00'), 120)).toBe(true);
    // А часовая — заканчивается ровно к началу занятого и проходит.
    expect(await isBlocked(db, msk('2026-11-05T14:00'), 60)).toBe(false);
    expect(await isBlocked(db, msk('2026-11-05T17:00'), 120)).toBe(false);
  });

  it('заявка на закрытое время отклоняется', async () => {
    const { app, db } = await createTestApp();
    const date = new Date(Date.now() + 14 * 86_400_000);
    const day = toMskWallClock(date).date;
    await db.insert(availabilityBlocks).values({
      id: crypto.randomUUID(),
      date: day,
      startTime: null,
      endTime: null,
      note: null,
    });

    const res = await app.request(
      '/api/v1/bookings',
      jsonInit({
        tourId: 'tour-obzornaya',
        desiredDate: `${day}T12:00:00+03:00`,
        peopleCount: 2,
        contactName: 'Гость',
        contactPhone: '8 900 111-22-33',
      }),
      TEST_ENV,
    );
    expect(res.status).toBe(409);

    // Свободный соседний день принимается — отказ не стал глухим.
    const free = toMskWallClock(new Date(date.getTime() + 86_400_000)).date;
    const okRes = await app.request(
      '/api/v1/bookings',
      jsonInit({
        tourId: 'tour-obzornaya',
        desiredDate: `${free}T12:00:00+03:00`,
        peopleCount: 2,
        contactName: 'Гость',
        contactPhone: '8 900 111-22-33',
      }),
      TEST_ENV,
    );
    expect(okRes.status).toBe(201);
  });

  it('публичная выдача не раскрывает заметки', async () => {
    const { app, db } = await createTestApp();
    await db.insert(availabilityBlocks).values({
      id: crypto.randomUUID(),
      date: '2026-12-01',
      startTime: null,
      endTime: null,
      note: 'личное',
    });

    const res = await app.request(
      '/api/v1/availability?from=2026-12-01&to=2026-12-31',
      undefined,
      TEST_ENV,
    );
    expect(res.status).toBe(200);
    const { data } = await body(res);
    expect(data.blocks).toEqual([{ date: '2026-12-01', startTime: null, endTime: null }]);
  });
});
