import { describe, expect, it } from 'vitest';
import { TEST_ENV, bearer, body, createTestApp, jsonInit, registerUser } from './helpers';

describe('reviews', () => {
  it('гостевой отзыв требует имя и попадает на модерацию', async () => {
    const { app } = await createTestApp();

    const noName = await app.request(
      '/api/v1/reviews',
      jsonInit({ tourId: 'tour-obzornaya', rating: 5, text: 'Отличная экскурсия, рекомендую!' }),
      TEST_ENV,
    );
    expect(noName.status).toBe(422);

    const res = await app.request(
      '/api/v1/reviews',
      jsonInit({
        tourId: 'tour-obzornaya',
        rating: 5,
        text: 'Отличная экскурсия, рекомендую!',
        authorName: 'Гость',
      }),
      TEST_ENV,
    );
    expect(res.status).toBe(201);
    expect((await body(res)).data.status).toBe('pending');

    // До модерации отзыв не виден в публичном списке.
    const published = await app.request('/api/v1/tours/obzornaya-po-tveri/reviews', {}, TEST_ENV);
    expect((await body(published)).data.total).toBe(20);
  });

  it('авторизованный: имя из профиля, повторный отзыв запрещён', async () => {
    const { app } = await createTestApp();
    const { accessToken } = await registerUser(app, { name: 'Игорь' });

    const first = await app.request(
      '/api/v1/reviews',
      jsonInit(
        { tourId: 'tour-predmeste', rating: 4, text: 'Очень атмосферный маршрут по Затьмачью' },
        bearer(accessToken),
      ),
      TEST_ENV,
    );
    expect(first.status).toBe(201);

    const second = await app.request(
      '/api/v1/reviews',
      jsonInit(
        { tourId: 'tour-predmeste', rating: 5, text: 'Хочу дополнить свой предыдущий отзыв' },
        bearer(accessToken),
      ),
      TEST_ENV,
    );
    expect(second.status).toBe(409);
  });
});

describe('favorites', () => {
  it('работает только с авторизацией', async () => {
    const { app } = await createTestApp();
    const res = await app.request('/api/v1/favorites', {}, TEST_ENV);
    expect(res.status).toBe(401);
  });

  it('добавляет, показывает и удаляет избранное', async () => {
    const { app } = await createTestApp();
    const { accessToken } = await registerUser(app);

    const add = await app.request(
      '/api/v1/favorites/tour-savvatevo',
      { method: 'PUT', headers: bearer(accessToken) },
      TEST_ENV,
    );
    expect(add.status).toBe(201);

    // Повторное добавление идемпотентно.
    const addAgain = await app.request(
      '/api/v1/favorites/tour-savvatevo',
      { method: 'PUT', headers: bearer(accessToken) },
      TEST_ENV,
    );
    expect(addAgain.status).toBe(201);

    const list = await app.request('/api/v1/favorites', { headers: bearer(accessToken) }, TEST_ENV);
    const items = (await body(list)).data;
    expect(items).toHaveLength(1);
    expect(items[0].tour.slug).toBe('savvatevo-na-avto');
    expect(items[0].tour.badges.length).toBeGreaterThan(0);

    const remove = await app.request(
      '/api/v1/favorites/tour-savvatevo',
      { method: 'DELETE', headers: bearer(accessToken) },
      TEST_ENV,
    );
    expect(remove.status).toBe(200);

    const empty = await app.request('/api/v1/favorites', { headers: bearer(accessToken) }, TEST_ENV);
    expect((await body(empty)).data).toHaveLength(0);
  });

  it('404 при добавлении несуществующего тура', async () => {
    const { app } = await createTestApp();
    const { accessToken } = await registerUser(app);
    const res = await app.request(
      '/api/v1/favorites/tour-fake',
      { method: 'PUT', headers: bearer(accessToken) },
      TEST_ENV,
    );
    expect(res.status).toBe(404);
  });
});

describe('contact', () => {
  it('принимает заявку с телефоном', async () => {
    const { app } = await createTestApp();
    const res = await app.request(
      '/api/v1/contact',
      jsonInit({ name: 'Анна', phone: '8 900 555-66-77', message: 'Хочу заказать экскурсию для класса' }),
      TEST_ENV,
    );
    expect(res.status).toBe(201);
  });

  it('отклоняет заявку без контактов', async () => {
    const { app } = await createTestApp();
    const res = await app.request(
      '/api/v1/contact',
      jsonInit({ name: 'Аноним', message: 'Просто сообщение без контактов' }),
      TEST_ENV,
    );
    expect(res.status).toBe(422);
  });
});

describe('публичные данные', () => {
  it('свежие одобренные отзывы с названием экскурсии', async () => {
    const { app } = await createTestApp();
    const res = await app.request('/api/v1/reviews/latest', {}, TEST_ENV);
    expect(res.status).toBe(200);
    const { data } = await body(res);
    // Лента на главной показывает шесть последних.
    expect(data).toHaveLength(6);
    expect(data[0].tour.title).toBeTruthy();
    expect(data.every((r: { rating: number }) => r.rating >= 4)).toBe(true);
  });

  it('публичные настройки: контакты и компания', async () => {
    const { app } = await createTestApp();
    const res = await app.request('/api/v1/settings', {}, TEST_ENV);
    expect(res.status).toBe(200);
    const { data } = await body(res);
    expect(data['contacts.phone']).toBe('+79000000000');
    expect(data['company.name']).toBe('Тверь рядом');
  });
});

describe('инфраструктура', () => {
  it('healthcheck отвечает', async () => {
    const { app } = await createTestApp();
    const res = await app.request('/health', {}, TEST_ENV);
    expect(res.status).toBe(200);
  });

  it('неизвестный маршрут — 404 в едином формате', async () => {
    const { app } = await createTestApp();
    const res = await app.request('/api/v1/nope', {}, TEST_ENV);
    expect(res.status).toBe(404);
    expect((await body(res)).error.code).toBe('not_found');
  });
});
