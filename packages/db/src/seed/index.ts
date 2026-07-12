import { DEFAULT_BADGES } from '@tver/shared';
import type { Db } from '../index';
import * as schema from '../schema';
import { seedReviews, seedSettings, seedTours } from './data';

/**
 * Наполняет базу демо-данными. Идемпотентен: повторный запуск ничего не дублирует.
 * Работает и с D1, и с локальным SQLite в тестах.
 */
export async function seedDatabase(db: Db, now: Date = new Date()): Promise<void> {
  await db
    .insert(schema.badges)
    .values(
      DEFAULT_BADGES.map((badge) => ({
        id: `badge-${badge.slug}`,
        slug: badge.slug,
        label: badge.label,
      })),
    )
    .onConflictDoNothing();

  // Пароль администратора задаётся отдельной командой при развёртывании (этап 7),
  // поэтому passwordHash здесь пустой и вход по этому аккаунту пока невозможен.
  await db
    .insert(schema.users)
    .values({
      id: 'user-admin',
      email: 'admin@tver-ryadom.ru',
      name: 'Администратор',
      role: 'admin',
    })
    .onConflictDoNothing();

  for (const tour of seedTours) {
    const tourReviews = seedReviews.filter((review) => review.tourId === tour.id);
    const ratingCount = tourReviews.length;
    const ratingAvg =
      ratingCount === 0
        ? 0
        : Math.round((tourReviews.reduce((sum, r) => sum + r.rating, 0) / ratingCount) * 10) / 10;

    await db
      .insert(schema.tours)
      .values({
        id: tour.id,
        slug: tour.slug,
        title: tour.title,
        subtitle: tour.subtitle,
        shortDescription: tour.shortDescription,
        fullDescription: tour.fullDescription,
        program: tour.program,
        price: tour.price,
        priceType: tour.priceType,
        durationMinutes: tour.durationMinutes,
        groupMin: tour.groupMin,
        groupMax: tour.groupMax,
        meetingPoint: tour.meetingPoint,
        meetingLat: tour.meetingLat,
        meetingLng: tour.meetingLng,
        included: tour.included,
        notIncluded: tour.notIncluded,
        recommendations: tour.recommendations,
        status: 'published',
        sortOrder: tour.sortOrder,
        ratingAvg,
        ratingCount,
      })
      .onConflictDoNothing();

    await db
      .insert(schema.tourBadges)
      .values(tour.badgeSlugs.map((slug) => ({ tourId: tour.id, badgeId: `badge-${slug}` })))
      .onConflictDoNothing();

    await db
      .insert(schema.routePoints)
      .values(
        tour.routePoints.map((point, index) => ({
          id: point.id,
          tourId: tour.id,
          title: point.title,
          description: point.description ?? null,
          lat: point.lat,
          lng: point.lng,
          sortOrder: index,
        })),
      )
      .onConflictDoNothing();

    await db
      .insert(schema.schedules)
      .values(
        upcomingSaturdays(now, 3).map((startsAt, index) => ({
          id: `sched-${tour.id}-${index}`,
          tourId: tour.id,
          startsAt,
          capacity: tour.groupMax ?? 10,
        })),
      )
      .onConflictDoNothing();
  }

  await db
    .insert(schema.reviews)
    .values(
      seedReviews.map((review) => ({
        id: review.id,
        tourId: review.tourId,
        authorName: review.authorName,
        rating: review.rating,
        text: review.text,
        status: 'approved' as const,
      })),
    )
    .onConflictDoNothing();

  await db
    .insert(schema.settings)
    .values(
      Object.entries(seedSettings).map(([key, value]) => ({
        key,
        value: JSON.stringify(value),
      })),
    )
    .onConflictDoNothing();
}

/** Ближайшие `count` суббот в 11:00 местного времени, начиная со следующей после `from`. */
function upcomingSaturdays(from: Date, count: number): Date[] {
  const result: Date[] = [];
  const cursor = new Date(from);
  cursor.setHours(11, 0, 0, 0);
  do {
    cursor.setDate(cursor.getDate() + 1);
  } while (cursor.getDay() !== 6);
  for (let i = 0; i < count; i += 1) {
    result.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 7);
  }
  return result;
}
