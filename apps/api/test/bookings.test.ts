import { schedules, tours } from '@tver/db';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { TEST_ENV, bearer, body, createTestApp, jsonInit, registerUser } from './helpers';

async function firstScheduleOf(db: Awaited<ReturnType<typeof createTestApp>>['db'], tourId: string) {
  const slot = await db.query.schedules.findFirst({
    where: eq(schedules.tourId, tourId),
    orderBy: (s, { asc }) => [asc(s.startsAt)],
  });
  if (!slot) throw new Error('В seed нет расписания');
  return slot;
}

describe('bookings', () => {
  it('гостевое бронирование на слот: цена за человека, место занято', async () => {
    const { app, db } = await createTestApp();
    const slot = await firstScheduleOf(db, 'tour-obzornaya');
    // Все экскурсии в контенте продаются за группу, поэтому режим «за человека»
    // задаём прямо в тесте: так проверка не ломается при смене текстов и цен.
    await db
      .update(tours)
      .set({ priceType: 'per_person', price: 120000 })
      .where(eq(tours.id, 'tour-obzornaya'));

    const res = await app.request(
      '/api/v1/bookings',
      jsonInit({
        tourId: 'tour-obzornaya',
        scheduleId: slot.id,
        peopleCount: 2,
        contactName: 'Гость',
        contactPhone: '8 900 111-22-33',
      }),
      TEST_ENV,
    );
    expect(res.status).toBe(201);
    const { data } = await body(res);
    expect(data.status).toBe('pending');
    expect(data.totalPrice).toBe(240000); // 2 × 1200 ₽

    const updated = await db.query.schedules.findFirst({ where: eq(schedules.id, slot.id) });
    expect(updated?.bookedCount).toBe(2);
  });

  it('овербукинг невозможен: при нехватке мест — 409', async () => {
    const { app, db } = await createTestApp();
    const slot = await firstScheduleOf(db, 'tour-obzornaya'); // вместимость 5

    const first = await app.request(
      '/api/v1/bookings',
      jsonInit({
        tourId: 'tour-obzornaya',
        scheduleId: slot.id,
        peopleCount: 4,
        contactName: 'Большая группа',
        contactPhone: '89001112233',
      }),
      TEST_ENV,
    );
    expect(first.status).toBe(201);

    const second = await app.request(
      '/api/v1/bookings',
      jsonInit({
        tourId: 'tour-obzornaya',
        scheduleId: slot.id,
        peopleCount: 2,
        contactName: 'Опоздавшие',
        contactPhone: '89004445566',
      }),
      TEST_ENV,
    );
    expect(second.status).toBe(409);

    const updated = await db.query.schedules.findFirst({ where: eq(schedules.id, slot.id) });
    expect(updated?.bookedCount).toBe(4);
  });

  it('заявка на желаемую дату: цена за группу, лимит размера группы', async () => {
    const { app } = await createTestApp();
    const future = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

    const tooMany = await app.request(
      '/api/v1/bookings',
      jsonInit({
        tourId: 'tour-savvatevo',
        desiredDate: future,
        peopleCount: 5, // groupMax = 4
        contactName: 'Компания',
        contactPhone: '89001112233',
      }),
      TEST_ENV,
    );
    expect(tooMany.status).toBe(422);

    const res = await app.request(
      '/api/v1/bookings',
      jsonInit({
        tourId: 'tour-savvatevo',
        desiredDate: future,
        peopleCount: 3,
        contactName: 'Семья',
        contactPhone: '89001112233',
      }),
      TEST_ENV,
    );
    expect(res.status).toBe(201);
    expect((await body(res)).data.totalPrice).toBe(650000); // 6500 ₽ за группу
  });

  it('прошедшая желаемая дата отклоняется', async () => {
    const { app } = await createTestApp();
    const res = await app.request(
      '/api/v1/bookings',
      jsonInit({
        tourId: 'tour-predmeste',
        desiredDate: '2020-01-01T11:00:00.000Z',
        peopleCount: 2,
        contactName: 'Из прошлого',
        contactPhone: '89001112233',
      }),
      TEST_ENV,
    );
    expect(res.status).toBe(422);
  });

  it('бронь без слота и даты отклоняется валидацией', async () => {
    const { app } = await createTestApp();
    const res = await app.request(
      '/api/v1/bookings',
      jsonInit({
        tourId: 'tour-predmeste',
        peopleCount: 2,
        contactName: 'Без даты',
        contactPhone: '89001112233',
      }),
      TEST_ENV,
    );
    expect(res.status).toBe(422);
  });

  it('авторизованный сценарий: бронь → список → отмена с возвратом мест', async () => {
    const { app, db } = await createTestApp();
    const { accessToken } = await registerUser(app);
    const slot = await firstScheduleOf(db, 'tour-predmeste');

    const created = await app.request(
      '/api/v1/bookings',
      jsonInit(
        {
          tourId: 'tour-predmeste',
          scheduleId: slot.id,
          peopleCount: 3,
          contactName: 'Авторизованный',
          contactPhone: '89007778899',
        },
        bearer(accessToken),
      ),
      TEST_ENV,
    );
    expect(created.status).toBe(201);
    const bookingId = (await body(created)).data.id;

    const list = await app.request(
      '/api/v1/bookings/my?upcoming=true',
      { headers: bearer(accessToken) },
      TEST_ENV,
    );
    expect(list.status).toBe(200);
    const listData = (await body(list)).data;
    expect(listData.total).toBe(1);
    expect(listData.items[0].tour.slug).toBe('predmeste-tveri');
    expect(listData.items[0].startsAt).toBeTruthy();

    // Уведомление о создании брони появилось в личном кабинете.
    const notifications = await app.request(
      '/api/v1/notifications',
      { headers: bearer(accessToken) },
      TEST_ENV,
    );
    expect((await body(notifications)).data.unread).toBeGreaterThan(0);

    const cancel = await app.request(
      `/api/v1/bookings/${bookingId}/cancel`,
      jsonInit({ reason: 'Изменились планы' }, bearer(accessToken)),
      TEST_ENV,
    );
    expect(cancel.status).toBe(200);

    const updatedSlot = await db.query.schedules.findFirst({ where: eq(schedules.id, slot.id) });
    expect(updatedSlot?.bookedCount).toBe(0);

    const again = await app.request(
      `/api/v1/bookings/${bookingId}/cancel`,
      jsonInit({}, bearer(accessToken)),
      TEST_ENV,
    );
    expect(again.status).toBe(409);
  });

  it('нельзя отменить чужую бронь', async () => {
    const { app, db } = await createTestApp();
    const owner = await registerUser(app);
    const stranger = await registerUser(app);
    const slot = await firstScheduleOf(db, 'tour-obzornaya');

    const created = await app.request(
      '/api/v1/bookings',
      jsonInit(
        {
          tourId: 'tour-obzornaya',
          scheduleId: slot.id,
          peopleCount: 1,
          contactName: 'Владелец',
          contactPhone: '89001112233',
        },
        bearer(owner.accessToken),
      ),
      TEST_ENV,
    );
    const bookingId = (await body(created)).data.id;

    const res = await app.request(
      `/api/v1/bookings/${bookingId}/cancel`,
      jsonInit({}, bearer(stranger.accessToken)),
      TEST_ENV,
    );
    expect(res.status).toBe(404);
  });
});
