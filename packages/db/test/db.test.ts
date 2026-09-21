import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { DEFAULT_BADGES } from '@tver/shared';
import * as schema from '../src/schema';
import { seedDatabase } from '../src/seed';
import { createTestDb } from '../src/testing';

describe('миграции и seed', () => {
  it('применяет миграции и наполняет базу демо-данными', async () => {
    const db = createTestDb();
    await seedDatabase(db);

    const tours = await db.select().from(schema.tours);
    expect(tours).toHaveLength(3);
    expect(tours.every((tour) => tour.status === 'published')).toBe(true);

    const badges = await db.select().from(schema.badges);
    expect(badges).toHaveLength(DEFAULT_BADGES.length);

    const reviews = await db.select().from(schema.reviews);
    expect(reviews).toHaveLength(21);
    expect(reviews.every((review) => review.status === 'approved')).toBe(true);
    // Отзывы перенесены с площадок вместе с их датами — сегодняшним числом
    // прошлогодний отзыв выглядел бы свежим.
    expect(reviews.every((review) => review.createdAt.getTime() < Date.now())).toBe(true);

    const schedules = await db.select().from(schema.schedules);
    expect(schedules).toHaveLength(9);
    expect(schedules.every((slot) => slot.startsAt.getTime() > Date.now())).toBe(true);

    const admin = await db.query.users.findFirst({
      where: eq(schema.users.role, 'admin'),
    });
    expect(admin?.email).toBe('admin@tver-ryadom.ru');
  });

  it('рейтинг тура согласован с одобренными отзывами', async () => {
    const db = createTestDb();
    await seedDatabase(db);

    const tour = await db.query.tours.findFirst({
      where: eq(schema.tours.slug, 'obzornaya-po-tveri'),
      with: { badges: { with: { badge: true } } },
    });

    expect(tour).toBeDefined();
    expect(tour?.ratingCount).toBe(20);
    expect(tour?.ratingAvg).toBe(5);
    expect(tour?.badges.map((tb) => tb.badge.slug)).toContain('hit');
  });

  it('программу и маршрут показывает только Савватьево', async () => {
    const db = createTestDb();
    await seedDatabase(db);

    // Елена попросила не расписывать программу пешеходных прогулок и не
    // показывать их маршрут заранее; поездка в Савватьево — исключение.
    const walking = await db.query.tours.findMany({
      where: eq(schema.tours.priceType, 'per_group'),
      with: { routePoints: true },
    });

    const bySlug = new Map(walking.map((tour) => [tour.slug, tour]));
    for (const slug of ['obzornaya-po-tveri', 'predmeste-tveri']) {
      expect(bySlug.get(slug)?.program).toHaveLength(0);
      expect(bySlug.get(slug)?.routePoints).toHaveLength(0);
    }

    const savvatevo = bySlug.get('savvatevo-na-avto');
    expect(savvatevo?.program).toHaveLength(5);
    expect(savvatevo?.routePoints.length).toBeGreaterThan(0);
    // Сумма пунктов программы должна сходиться с заявленной длительностью.
    const total = (savvatevo?.program ?? []).reduce((sum, step) => sum + (step.durationMinutes ?? 0), 0);
    expect(total).toBe(savvatevo?.durationMinutes);
  });

  it('seed идемпотентен', async () => {
    const db = createTestDb();
    await seedDatabase(db);
    await seedDatabase(db);

    const tours = await db.select().from(schema.tours);
    expect(tours).toHaveLength(3);
    const reviews = await db.select().from(schema.reviews);
    expect(reviews).toHaveLength(21);
  });

  it('каскадное удаление: вместе с туром уходят точки маршрута и расписание', async () => {
    const db = createTestDb();
    await seedDatabase(db);

    await db.delete(schema.tours).where(eq(schema.tours.id, 'tour-savvatevo'));

    const points = await db
      .select()
      .from(schema.routePoints)
      .where(eq(schema.routePoints.tourId, 'tour-savvatevo'));
    expect(points).toHaveLength(0);

    const slots = await db
      .select()
      .from(schema.schedules)
      .where(eq(schema.schedules.tourId, 'tour-savvatevo'));
    expect(slots).toHaveLength(0);
  });
});
