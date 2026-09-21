import type { Db } from '@tver/db';
import { badges, reviews, tourBadges, tours } from '@tver/db';
import type { Pagination, TourFilterInput, TourSort } from '@tver/shared';
import { and, asc, count, desc, eq, gte, inArray, like, lte, or, type SQL } from 'drizzle-orm';
import { notFound } from '../../lib/errors';
import { toImageUrls } from '../../lib/images';

type TourRow = typeof tours.$inferSelect;

interface CardRelations {
  images?: { r2Key: string; alt: string | null; variants: Record<string, string> }[];
  badges?: { badge: { slug: string; label: string } }[];
  routePoints?: { title: string }[];
}

/** Карточка для каталога, избранного и подборок. */
export function toTourCard(row: TourRow & CardRelations, imagesBase: string) {
  const image = row.images?.[0];
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    shortDescription: row.shortDescription,
    price: row.price,
    priceType: row.priceType,
    durationMinutes: row.durationMinutes,
    groupMin: row.groupMin,
    groupMax: row.groupMax,
    ratingAvg: row.ratingAvg,
    ratingCount: row.ratingCount,
    image: image ? toImageUrls(image, imagesBase) : null,
    badges: row.badges?.map((tb) => tb.badge) ?? [],
    routePoints: row.routePoints?.map((point) => point.title) ?? [],
  };
}

export type TourCard = ReturnType<typeof toTourCard>;

function orderFor(sort: TourSort) {
  switch (sort) {
    case 'price_asc':
      return [asc(tours.price)];
    case 'price_desc':
      return [desc(tours.price)];
    case 'duration_asc':
      return [asc(tours.durationMinutes)];
    case 'duration_desc':
      return [desc(tours.durationMinutes)];
    case 'rating_asc':
      return [asc(tours.ratingAvg), asc(tours.ratingCount)];
    case 'rating_desc':
      return [desc(tours.ratingAvg), desc(tours.ratingCount)];
    case 'popular':
      return [asc(tours.sortOrder), desc(tours.ratingCount)];
  }
}

export async function listTours(db: Db, filter: TourFilterInput, imagesBase: string) {
  const conditions: SQL[] = [eq(tours.status, 'published')];

  if (filter.priceMin !== undefined) conditions.push(gte(tours.price, filter.priceMin));
  if (filter.priceMax !== undefined) conditions.push(lte(tours.price, filter.priceMax));
  if (filter.durationMax !== undefined)
    conditions.push(lte(tours.durationMinutes, filter.durationMax));
  if (filter.search) {
    const pattern = `%${filter.search}%`;
    const search = or(like(tours.title, pattern), like(tours.shortDescription, pattern));
    if (search) conditions.push(search);
  }
  if (filter.badge) {
    // Несколько бейджей через запятую: тур подходит, если совпал хотя бы один.
    const slugs = filter.badge
      .split(',')
      .map((slug) => slug.trim())
      .filter(Boolean);
    const tagged = await db
      .select({ tourId: tourBadges.tourId })
      .from(tourBadges)
      .innerJoin(badges, eq(tourBadges.badgeId, badges.id))
      .where(inArray(badges.slug, slugs));
    if (tagged.length === 0) return { items: [], total: 0 };
    conditions.push(
      inArray(
        tours.id,
        tagged.map((row) => row.tourId),
      ),
    );
  }

  const where = and(...conditions);
  const [totalRow] = await db.select({ total: count() }).from(tours).where(where);
  const rows = await db.query.tours.findMany({
    where,
    with: {
      images: { orderBy: (image, { asc: sortAsc }) => [sortAsc(image.sortOrder)], limit: 1 },
      badges: { with: { badge: { columns: { slug: true, label: true } } } },
      routePoints: {
        orderBy: (point, { asc: sortAsc }) => [sortAsc(point.sortOrder)],
        columns: { title: true },
      },
    },
    orderBy: orderFor(filter.sort),
    limit: filter.limit,
    offset: (filter.page - 1) * filter.limit,
  });

  return { items: rows.map((row) => toTourCard(row, imagesBase)), total: totalRow?.total ?? 0 };
}

export async function getTourBySlug(db: Db, slug: string, imagesBase: string) {
  const tour = await db.query.tours.findFirst({
    where: and(eq(tours.slug, slug), eq(tours.status, 'published')),
    with: {
      images: { orderBy: (image, { asc: sortAsc }) => [sortAsc(image.sortOrder)] },
      badges: { with: { badge: { columns: { slug: true, label: true } } } },
      routePoints: { orderBy: (point, { asc: sortAsc }) => [sortAsc(point.sortOrder)] },
      schedules: {
        where: (slot, { and: cond, eq: equals, gt: greater }) =>
          cond(equals(slot.status, 'open'), greater(slot.startsAt, new Date())),
        orderBy: (slot, { asc: sortAsc }) => [sortAsc(slot.startsAt)],
      },
    },
  });
  if (!tour) throw notFound('Экскурсия не найдена');

  return {
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
    ratingAvg: tour.ratingAvg,
    ratingCount: tour.ratingCount,
    images: tour.images.map((image) =>
      toImageUrls({ r2Key: image.r2Key, alt: image.alt, variants: image.variants }, imagesBase),
    ),
    badges: tour.badges.map((tb) => tb.badge),
    routePoints: tour.routePoints.map((point) => ({
      title: point.title,
      description: point.description,
      lat: point.lat,
      lng: point.lng,
    })),
    schedules: tour.schedules.map((slot) => ({
      id: slot.id,
      startsAt: slot.startsAt,
      capacity: slot.capacity,
      freeSeats: Math.max(0, slot.capacity - slot.bookedCount),
    })),
  };
}

/**
 * Ближайшие сборные выходы по всем экскурсиям — для раздела «Расписание».
 *
 * Слоты и так есть у каждой экскурсии, но гость попадает на них, только если
 * уже открыл нужную страницу. Здесь они собраны в один список: человек видит
 * месяц целиком и выбирает дату, а не экскурсию.
 */
export async function listUpcomingSchedules(db: Db, imagesBase: string, limit = 60) {
  const rows = await db.query.schedules.findMany({
    where: (slot, { and: cond, eq: equals, gt: greater }) =>
      cond(equals(slot.status, 'open'), greater(slot.startsAt, new Date())),
    orderBy: (slot, { asc: sortAsc }) => [sortAsc(slot.startsAt)],
    limit,
    with: {
      tour: {
        with: {
          images: { orderBy: (image, { asc: sortAsc }) => [sortAsc(image.sortOrder)], limit: 1 },
          badges: { with: { badge: { columns: { slug: true, label: true } } } },
        },
      },
    },
  });

  // Черновик экскурсии в расписании показывать нельзя: страницы у неё нет,
  // и кнопка «Забронировать» вела бы в никуда.
  return rows
    .filter((slot) => slot.tour?.status === 'published')
    .map((slot) => ({
      id: slot.id,
      startsAt: slot.startsAt,
      capacity: slot.capacity,
      freeSeats: Math.max(0, slot.capacity - slot.bookedCount),
      tour: toTourCard(slot.tour, imagesBase),
    }));
}

export async function listTourReviews(db: Db, slug: string, pagination: Pagination) {
  const tour = await db.query.tours.findFirst({
    where: and(eq(tours.slug, slug), eq(tours.status, 'published')),
    columns: { id: true },
  });
  if (!tour) throw notFound('Экскурсия не найдена');

  const where = and(eq(reviews.tourId, tour.id), eq(reviews.status, 'approved'));
  const [totalRow] = await db.select({ total: count() }).from(reviews).where(where);
  const rows = await db.query.reviews.findMany({
    where,
    orderBy: (review, { desc: sortDesc }) => [sortDesc(review.createdAt)],
    limit: pagination.limit,
    offset: (pagination.page - 1) * pagination.limit,
    columns: { id: true, authorName: true, rating: true, text: true, createdAt: true },
  });

  return { items: rows, total: totalRow?.total ?? 0 };
}

export async function listBadges(db: Db) {
  return db.query.badges.findMany({
    orderBy: (badge, { asc: sortAsc }) => [sortAsc(badge.label)],
    columns: { slug: true, label: true },
  });
}
