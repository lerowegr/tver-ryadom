import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { describe, expect, it } from 'vitest';
import { DEFAULT_BADGES } from '@tver/shared';
import type { Db } from '../src/index';
import * as schema from '../src/schema';
import { seedDatabase } from '../src/seed';

const migrationsDir = fileURLToPath(new URL('../migrations', import.meta.url));

function createTestDb(): Db {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    sqlite.exec(readFileSync(join(migrationsDir, file), 'utf8'));
  }
  // Тестовый драйвер better-sqlite3 совместим с D1-типом Db по API запросов.
  return drizzle(sqlite, { schema }) as unknown as Db;
}

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
    expect(reviews).toHaveLength(5);
    expect(reviews.every((review) => review.status === 'approved')).toBe(true);

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
      with: {
        routePoints: true,
        badges: { with: { badge: true } },
      },
    });

    expect(tour).toBeDefined();
    expect(tour?.ratingCount).toBe(2);
    expect(tour?.ratingAvg).toBe(5);
    expect(tour?.routePoints).toHaveLength(6);
    expect(tour?.badges.map((tb) => tb.badge.slug)).toContain('hit');
    expect(tour?.program.length).toBeGreaterThan(0);
  });

  it('seed идемпотентен', async () => {
    const db = createTestDb();
    await seedDatabase(db);
    await seedDatabase(db);

    const tours = await db.select().from(schema.tours);
    expect(tours).toHaveLength(3);
    const reviews = await db.select().from(schema.reviews);
    expect(reviews).toHaveLength(5);
  });

  it('каскадное удаление: вместе с туром уходят точки маршрута и расписание', async () => {
    const db = createTestDb();
    await seedDatabase(db);

    await db.delete(schema.tours).where(eq(schema.tours.id, 'tour-predmeste'));

    const points = await db
      .select()
      .from(schema.routePoints)
      .where(eq(schema.routePoints.tourId, 'tour-predmeste'));
    expect(points).toHaveLength(0);

    const slots = await db
      .select()
      .from(schema.schedules)
      .where(eq(schema.schedules.tourId, 'tour-predmeste'));
    expect(slots).toHaveLength(0);
  });
});
