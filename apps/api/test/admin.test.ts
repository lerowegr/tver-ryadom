import { schedules } from '@tver/db';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { TEST_ENV, bearer, body, createAdmin, createTestApp, jsonInit, registerUser } from './helpers';

describe('admin: доступ', () => {
  it('гость получает 401, обычный пользователь — 403', async () => {
    const { app } = await createTestApp();
    expect((await app.request('/api/v1/admin/stats', {}, TEST_ENV)).status).toBe(401);

    const user = await registerUser(app);
    const res = await app.request('/api/v1/admin/stats', { headers: bearer(user.accessToken) }, TEST_ENV);
    expect(res.status).toBe(403);
  });

  it('админ видит статистику дашборда', async () => {
    const { app, db } = await createTestApp();
    const admin = await createAdmin(app, db);
    const res = await app.request('/api/v1/admin/stats', { headers: bearer(admin.accessToken) }, TEST_ENV);
    expect(res.status).toBe(200);
    const { data } = await body(res);
    expect(data).toMatchObject({ pendingBookings: 0, pendingReviews: 0 });
    expect(Array.isArray(data.recentBookings)).toBe(true);
  });
});

describe('admin: экскурсии', () => {
  const newTour = {
    slug: 'nochnaya-tver',
    title: 'Ночная Тверь',
    shortDescription: 'Вечерняя прогулка по подсвеченным набережным Волги.',
    fullDescription: 'Смотрим, как город зажигает огни: мосты, дворец, набережные и их истории.',
    price: 150000,
    durationMinutes: 120,
    badgeSlugs: ['walking', 'author-route'],
    routePoints: [
      { title: 'Городской сад', lat: 56.8639, lng: 35.9009 },
      { title: 'Набережная', lat: 56.8637, lng: 35.9092 },
    ],
  };

  it('создание черновика, публикация, архивирование', async () => {
    const { app, db } = await createTestApp();
    const admin = await createAdmin(app, db);

    const created = await app.request(
      '/api/v1/admin/tours',
      jsonInit(newTour, bearer(admin.accessToken)),
      TEST_ENV,
    );
    expect(created.status).toBe(201);
    const tour = (await body(created)).data;
    expect(tour.status).toBe('draft');
    expect(tour.badges.map((b: { slug: string }) => b.slug).sort()).toEqual([
      'author-route',
      'walking',
    ]);
    expect(tour.routePoints).toHaveLength(2);

    // Черновик не виден в публичном каталоге.
    const publicList = await body(await app.request('/api/v1/tours', {}, TEST_ENV));
    expect(publicList.data.total).toBe(3);

    // Публикация.
    const published = await app.request(`/api/v1/admin/tours/${tour.id}`, {
      ...jsonInit({ status: 'published' }, bearer(admin.accessToken)),
      method: 'PATCH',
    }, TEST_ENV);
    expect(published.status).toBe(200);
    const afterPublish = await body(await app.request('/api/v1/tours', {}, TEST_ENV));
    expect(afterPublish.data.total).toBe(4);

    // Дубликат слага отклоняется.
    const dup = await app.request(
      '/api/v1/admin/tours',
      jsonInit(newTour, bearer(admin.accessToken)),
      TEST_ENV,
    );
    expect(dup.status).toBe(409);

    // Архивация убирает из каталога.
    const archived = await app.request(`/api/v1/admin/tours/${tour.id}`, {
      method: 'DELETE',
      headers: bearer(admin.accessToken),
    }, TEST_ENV);
    expect(archived.status).toBe(200);
    const afterArchive = await body(await app.request('/api/v1/tours', {}, TEST_ENV));
    expect(afterArchive.data.total).toBe(3);
  });

  it('архивация с активной бронью запрещена', async () => {
    const { app, db } = await createTestApp();
    const admin = await createAdmin(app, db);
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

    const res = await app.request('/api/v1/admin/tours/tour-obzornaya', {
      method: 'DELETE',
      headers: bearer(admin.accessToken),
    }, TEST_ENV);
    expect(res.status).toBe(409);
  });
});

describe('admin: расписание', () => {
  it('создание слота, ограничение вместимости, удаление', async () => {
    const { app, db } = await createTestApp();
    const admin = await createAdmin(app, db);
    const startsAt = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString();

    const created = await app.request(
      '/api/v1/admin/schedules',
      jsonInit({ tourId: 'tour-predmeste', startsAt, capacity: 8 }, bearer(admin.accessToken)),
      TEST_ENV,
    );
    expect(created.status).toBe(201);
    const slotId = (await body(created)).data.id;

    // Бронь на 3 места, затем попытка ужать capacity до 2 — конфликт.
    await app.request(
      '/api/v1/bookings',
      jsonInit({
        tourId: 'tour-predmeste',
        scheduleId: slotId,
        peopleCount: 3,
        contactName: 'Гость',
        contactPhone: '89001112233',
      }),
      TEST_ENV,
    );
    const shrink = await app.request(`/api/v1/admin/schedules/${slotId}`, {
      ...jsonInit({ capacity: 2 }, bearer(admin.accessToken)),
      method: 'PATCH',
    }, TEST_ENV);
    expect(shrink.status).toBe(409);

    // Слот с активной бронью не удаляется физически, а закрывается.
    const del = await app.request(`/api/v1/admin/schedules/${slotId}`, {
      method: 'DELETE',
      headers: bearer(admin.accessToken),
    }, TEST_ENV);
    expect((await body(del)).data.cancelled).toBe(true);
  });
});

describe('admin: бронирования', () => {
  it('подтверждение и отмена с уведомлением клиента и возвратом мест', async () => {
    const { app, db } = await createTestApp();
    const admin = await createAdmin(app, db);
    const client = await registerUser(app);
    const slot = await db.query.schedules.findFirst({ where: eq(schedules.tourId, 'tour-obzornaya') });

    const created = await app.request(
      '/api/v1/bookings',
      jsonInit(
        {
          tourId: 'tour-obzornaya',
          scheduleId: slot!.id,
          peopleCount: 4,
          contactName: 'Клиент',
          contactPhone: '89001112233',
        },
        bearer(client.accessToken),
      ),
      TEST_ENV,
    );
    const bookingId = (await body(created)).data.id;

    // Подтверждение.
    const confirm = await app.request(`/api/v1/admin/bookings/${bookingId}`, {
      ...jsonInit({ status: 'confirmed' }, bearer(admin.accessToken)),
      method: 'PATCH',
    }, TEST_ENV);
    expect(confirm.status).toBe(200);

    const notifications = await body(
      await app.request('/api/v1/notifications', { headers: bearer(client.accessToken) }, TEST_ENV),
    );
    const types = notifications.data.items.map((n: { type: string }) => n.type);
    expect(types).toContain('booking_confirmed');

    // Отмена возвращает места.
    await app.request(`/api/v1/admin/bookings/${bookingId}`, {
      ...jsonInit({ status: 'cancelled', adminComment: 'Гид заболел' }, bearer(admin.accessToken)),
      method: 'PATCH',
    }, TEST_ENV);
    const updatedSlot = await db.query.schedules.findFirst({ where: eq(schedules.id, slot!.id) });
    expect(updatedSlot?.bookedCount).toBe(0);

    // Из cancelled переходов нет.
    const reopen = await app.request(`/api/v1/admin/bookings/${bookingId}`, {
      ...jsonInit({ status: 'confirmed' }, bearer(admin.accessToken)),
      method: 'PATCH',
    }, TEST_ENV);
    expect(reopen.status).toBe(409);
  });
});

describe('admin: отзывы и рейтинг', () => {
  it('одобрение отзыва пересчитывает рейтинг тура', async () => {
    const { app, db } = await createTestApp();
    const admin = await createAdmin(app, db);

    await app.request(
      '/api/v1/reviews',
      jsonInit({
        tourId: 'tour-savvatevo',
        rating: 3,
        text: 'Хорошо, но дорога показалась длинной',
        authorName: 'Критик',
      }),
      TEST_ENV,
    );

    const pending = await body(
      await app.request('/api/v1/admin/reviews?status=pending', { headers: bearer(admin.accessToken) }, TEST_ENV),
    );
    expect(pending.data.total).toBe(1);
    const reviewId = pending.data.items[0].id;

    await app.request(`/api/v1/admin/reviews/${reviewId}`, {
      ...jsonInit({ status: 'approved' }, bearer(admin.accessToken)),
      method: 'PATCH',
    }, TEST_ENV);

    // В seed у Савватьево один отзыв 5; теперь (5+3)/2 = 4.
    const tour = await body(await app.request('/api/v1/tours/savvatevo-na-avto', {}, TEST_ENV));
    expect(tour.data.ratingCount).toBe(2);
    expect(tour.data.ratingAvg).toBe(4);
  });
});

describe('admin: пользователи, заявки, настройки', () => {
  it('список пользователей с количеством броней', async () => {
    const { app, db } = await createTestApp();
    const admin = await createAdmin(app, db);
    await registerUser(app, { email: 'client@test.ru' });

    const res = await body(
      await app.request('/api/v1/admin/users?search=client', { headers: bearer(admin.accessToken) }, TEST_ENV),
    );
    expect(res.data.total).toBe(1);
    expect(res.data.items[0].bookingsCount).toBe(0);
  });

  it('заявка с формы помечается обработанной', async () => {
    const { app, db } = await createTestApp();
    const admin = await createAdmin(app, db);
    await app.request(
      '/api/v1/contact',
      jsonInit({ name: 'Анна', phone: '89005556677', message: 'Хочу корпоративную экскурсию' }),
      TEST_ENV,
    );

    const list = await body(
      await app.request('/api/v1/admin/contact-requests?status=new', { headers: bearer(admin.accessToken) }, TEST_ENV),
    );
    expect(list.data.total).toBe(1);
    const id = list.data.items[0].id;

    await app.request(`/api/v1/admin/contact-requests/${id}`, {
      ...jsonInit({ status: 'processed' }, bearer(admin.accessToken)),
      method: 'PATCH',
    }, TEST_ENV);

    const after = await body(
      await app.request('/api/v1/admin/contact-requests?status=new', { headers: bearer(admin.accessToken) }, TEST_ENV),
    );
    expect(after.data.total).toBe(0);
  });

  it('настройки сохраняются и видны публично', async () => {
    const { app, db } = await createTestApp();
    const admin = await createAdmin(app, db);

    const put = await app.request('/api/v1/admin/settings', {
      ...jsonInit({ entries: { 'contacts.phone': '+79115552233' } }, bearer(admin.accessToken)),
      method: 'PUT',
    }, TEST_ENV);
    expect(put.status).toBe(200);

    const pub = await body(await app.request('/api/v1/settings', {}, TEST_ENV));
    expect(pub.data['contacts.phone']).toBe('+79115552233');
  });
});

describe('admin: фотографии', () => {
  it('загрузка в R2, раздача и удаление', async () => {
    const { app, db } = await createTestApp();
    const admin = await createAdmin(app, db);

    const form = new FormData();
    form.append('file', new File([new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 1, 2, 3])], 'photo.jpg', { type: 'image/jpeg' }));
    form.append('alt', 'Вид на Волгу');

    const uploaded = await app.request('/api/v1/admin/tours/tour-obzornaya/images', {
      method: 'POST',
      body: form,
      headers: bearer(admin.accessToken),
    }, TEST_ENV);
    expect(uploaded.status).toBe(201);
    const image = (await body(uploaded)).data;
    expect(image.variants.original).toMatch(/^http:\/\/api\.test\/images\/tours\/tour-obzornaya\//);

    // Публичная страница тура получает URL картинки.
    const tour = await body(await app.request('/api/v1/tours/obzornaya-po-tveri', {}, TEST_ENV));
    expect(tour.data.images).toHaveLength(1);
    expect(tour.data.images[0].alt).toBe('Вид на Волгу');

    // Раздача из R2.
    const key = image.variants.original.replace('http://api.test/images/', '');
    const served = await app.request(`/images/${key}`, {}, TEST_ENV);
    expect(served.status).toBe(200);
    expect(served.headers.get('Content-Type')).toBe('image/jpeg');

    // Отклоняем не-изображения.
    const badForm = new FormData();
    badForm.append('file', new File(['text'], 'notes.txt', { type: 'text/plain' }));
    const bad = await app.request('/api/v1/admin/tours/tour-obzornaya/images', {
      method: 'POST',
      body: badForm,
      headers: bearer(admin.accessToken),
    }, TEST_ENV);
    expect(bad.status).toBe(422);

    // Удаление.
    const del = await app.request(`/api/v1/admin/images/${image.id}`, {
      method: 'DELETE',
      headers: bearer(admin.accessToken),
    }, TEST_ENV);
    expect(del.status).toBe(200);
    const servedAfter = await app.request(`/images/${key}`, {}, TEST_ENV);
    expect(servedAfter.status).toBe(404);
  });
});
