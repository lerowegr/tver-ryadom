import { describe, expect, it } from 'vitest';
import { TEST_ENV, body, createTestApp } from './helpers';

describe('tours', () => {
  it('каталог: 3 опубликованные экскурсии с карточками', async () => {
    const { app } = await createTestApp();
    const res = await app.request('/api/v1/tours', {}, TEST_ENV);
    expect(res.status).toBe(200);
    const { data } = await body(res);
    expect(data.total).toBe(3);
    expect(data.items).toHaveLength(3);

    const card = data.items.find((t: { slug: string }) => t.slug === 'obzornaya-po-tveri');
    expect(card.price).toBe(450000);
    expect(card.badges.map((b: { slug: string }) => b.slug)).toContain('hit');
    expect(card.ratingAvg).toBe(5);

    // Маршрут заранее показывает только поездка в Савватьево.
    const savvatevo = data.items.find((t: { slug: string }) => t.slug === 'savvatevo-na-avto');
    expect(savvatevo.routePoints).toContain('Знаменский храм, Савватьево');
  });

  it('фильтрует по бейджу', async () => {
    const { app } = await createTestApp();
    const res = await app.request('/api/v1/tours?badge=walking', {}, TEST_ENV);
    const { data } = await body(res);
    expect(data.total).toBe(2);
    const slugs = data.items.map((t: { slug: string }) => t.slug).sort();
    expect(slugs).toEqual(['obzornaya-po-tveri', 'predmeste-tveri']);
  });

  it('фильтрует по цене и сортирует по возрастанию', async () => {
    const { app } = await createTestApp();
    const res = await app.request('/api/v1/tours?priceMax=500000&sort=price_asc', {}, TEST_ENV);
    const { data } = await body(res);
    // 4500 ₽ проходят по фильтру, 6500 ₽ — нет.
    expect(data.total).toBe(2);
    expect(data.items.every((t: { price: number }) => t.price <= 500000)).toBe(true);
    expect(data.items[0].price).toBeLessThanOrEqual(data.items[1].price);
  });

  it('несколько бейджей через запятую: совпадение хотя бы по одному', async () => {
    const { app } = await createTestApp();
    const res = await app.request('/api/v1/tours?badge=by-car,historical', {}, TEST_ENV);
    const { data } = await body(res);
    // by-car — Савватьево, historical — Предместье.
    expect(data.total).toBe(2);
    const slugs = data.items.map((t: { slug: string }) => t.slug).sort();
    expect(slugs).toEqual(['predmeste-tveri', 'savvatevo-na-avto']);
  });

  it('сортировка по длительности по убыванию', async () => {
    const { app } = await createTestApp();
    const res = await app.request('/api/v1/tours?sort=duration_desc', {}, TEST_ENV);
    const { data } = await body(res);
    expect(data.items[0].slug).toBe('savvatevo-na-avto'); // 2,5 часа — самая длинная
  });

  it('страница экскурсии: описание, место встречи, расписание со свободными местами', async () => {
    const { app } = await createTestApp();
    const res = await app.request('/api/v1/tours/obzornaya-po-tveri', {}, TEST_ENV);
    expect(res.status).toBe(200);
    const { data } = await body(res);
    // У пешеходных прогулок программы и маршрута нет — так просила Елена.
    expect(data.program).toHaveLength(0);
    expect(data.routePoints).toHaveLength(0);
    expect(data.included.length).toBeGreaterThan(0);
    expect(data.meetingPoint).toContain('Детский музейный центр');
    expect(data.meetingLat).toBeCloseTo(56.8622);
    expect(data.schedules).toHaveLength(3);
    expect(data.schedules[0].freeSeats).toBe(5); // вместимость слота = groupMax
  });

  it('расписание сборных выходов собрано по всем экскурсиям', async () => {
    const { app } = await createTestApp();
    const res = await app.request('/api/v1/schedule', {}, TEST_ENV);
    expect(res.status).toBe(200);
    const { data } = await body(res);
    // По три субботы на каждую из трёх экскурсий.
    expect(data.items).toHaveLength(9);
    expect(data.items[0].tour.title).toBeTruthy();
    // Порядок — по возрастанию даты: раздел читают сверху вниз.
    const dates = data.items.map((item: { startsAt: string }) => item.startsAt);
    expect([...dates].sort()).toEqual(dates);
  });

  it('404 для несуществующего слага', async () => {
    const { app } = await createTestApp();
    const res = await app.request('/api/v1/tours/net-takoy', {}, TEST_ENV);
    expect(res.status).toBe(404);
  });

  it('отдаёт только одобренные отзывы', async () => {
    const { app } = await createTestApp();
    const res = await app.request('/api/v1/tours/obzornaya-po-tveri/reviews', {}, TEST_ENV);
    const { data } = await body(res);
    expect(data.total).toBe(2);
    expect(data.items[0].authorName).toBeTruthy();
  });

  it('список бейджей', async () => {
    const { app } = await createTestApp();
    const res = await app.request('/api/v1/badges', {}, TEST_ENV);
    const { data } = await body(res);
    expect(data.length).toBe(8);
  });
});
