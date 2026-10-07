import type { Db } from '@tver/db';
import { badges, bookings, routePoints, tourBadges, tours } from '@tver/db';
import {
  paginationSchema,
  tourCreateSchema,
  tourUpdateSchema,
  TOUR_STATUSES,
  type TourCreateInput,
  type TourUpdateInput,
} from '@tver/shared';
import { and, count, eq, inArray, ne, or, type SQL } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../env';
import { conflict, notFound } from '../../lib/errors';
import { likeContains } from '../../lib/db-utils';
import { imagesBaseOf, toImageUrls } from '../../lib/images';
import { ok, paginated } from '../../lib/respond';
import { validate } from '../../middleware/validate';

const listFilterSchema = paginationSchema.extend({
  search: z.string().trim().max(200).optional(),
  status: z.enum(TOUR_STATUSES).optional(),
});

async function assertSlugFree(db: Db, slug: string, exceptId?: string) {
  const clauses = [eq(tours.slug, slug)];
  if (exceptId) clauses.push(ne(tours.id, exceptId));
  const existing = await db.query.tours.findFirst({
    where: and(...clauses),
    columns: { id: true },
  });
  if (existing) throw conflict('Экскурсия с таким слагом уже существует');
}

async function replaceBadges(db: Db, tourId: string, badgeSlugs: string[]) {
  await db.delete(tourBadges).where(eq(tourBadges.tourId, tourId));
  if (badgeSlugs.length === 0) return;
  const found = await db.query.badges.findMany({
    where: inArray(badges.slug, badgeSlugs),
    columns: { id: true },
  });
  if (found.length > 0) {
    await db
      .insert(tourBadges)
      .values(found.map((badge) => ({ tourId, badgeId: badge.id })))
      .onConflictDoNothing();
  }
}

async function replaceRoutePoints(
  db: Db,
  tourId: string,
  points: TourCreateInput['routePoints'],
) {
  await db.delete(routePoints).where(eq(routePoints.tourId, tourId));
  if (points.length === 0) return;
  await db.insert(routePoints).values(
    points.map((point, index) => ({
      id: crypto.randomUUID(),
      tourId,
      title: point.title,
      description: point.description ?? null,
      lat: point.lat,
      lng: point.lng,
      sortOrder: index,
    })),
  );
}

function tourColumnsFrom(input: TourUpdateInput) {
  const patch: Record<string, unknown> = {};
  const fields = [
    'slug',
    'title',
    'subtitle',
    'shortDescription',
    'fullDescription',
    'program',
    'price',
    'priceType',
    'durationMinutes',
    'groupMin',
    'groupMax',
    'meetingPoint',
    'meetingLat',
    'meetingLng',
    'included',
    'notIncluded',
    'recommendations',
    'status',
    'sortOrder',
  ] as const;
  for (const field of fields) {
    if (input[field] !== undefined) patch[field] = input[field];
  }
  return patch;
}

export async function getAdminTour(db: Db, id: string, imagesBase: string) {
  const tour = await db.query.tours.findFirst({
    where: eq(tours.id, id),
    with: {
      images: { orderBy: (image, { asc }) => [asc(image.sortOrder)] },
      badges: { with: { badge: { columns: { slug: true, label: true } } } },
      routePoints: { orderBy: (point, { asc }) => [asc(point.sortOrder)] },
      schedules: { orderBy: (slot, { desc }) => [desc(slot.startsAt)] },
    },
  });
  if (!tour) throw notFound('Экскурсия не найдена');
  return {
    ...tour,
    badges: tour.badges.map((tb) => tb.badge),
    images: tour.images.map((image) => ({
      ...toImageUrls(image, imagesBase),
    })),
  };
}

export const adminTourRoutes = new Hono<AppEnv>()
  .get('/', validate('query', listFilterSchema), async (c) => {
    const filter = c.req.valid('query');
    const db = c.get('db');
    const conditions: SQL[] = [];
    if (filter.status) conditions.push(eq(tours.status, filter.status));
    if (filter.search) {
      const search = or(
        likeContains(tours.title, filter.search),
        likeContains(tours.slug, filter.search),
      );
      if (search) conditions.push(search);
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalRow] = await db.select({ total: count() }).from(tours).where(where);
    const rows = await db.query.tours.findMany({
      where,
      orderBy: (t, { asc }) => [asc(t.sortOrder), asc(t.title)],
      limit: filter.limit,
      offset: (filter.page - 1) * filter.limit,
      columns: {
        id: true,
        slug: true,
        title: true,
        status: true,
        price: true,
        priceType: true,
        durationMinutes: true,
        ratingAvg: true,
        ratingCount: true,
        sortOrder: true,
      },
    });
    return paginated(c, rows, totalRow?.total ?? 0, filter.page, filter.limit);
  })

  .get('/:id', async (c) => {
    return ok(c, await getAdminTour(c.get('db'), c.req.param('id'), imagesBaseOf(c)));
  })

  .post('/', validate('json', tourCreateSchema), async (c) => {
    const input = c.req.valid('json');
    const db = c.get('db');
    await assertSlugFree(db, input.slug);

    const id = crypto.randomUUID();
    await db.insert(tours).values({
      id,
      slug: input.slug,
      title: input.title,
      subtitle: input.subtitle ?? null,
      shortDescription: input.shortDescription,
      fullDescription: input.fullDescription,
      program: input.program,
      price: input.price,
      priceType: input.priceType,
      durationMinutes: input.durationMinutes,
      groupMin: input.groupMin,
      groupMax: input.groupMax ?? null,
      meetingPoint: input.meetingPoint ?? null,
      meetingLat: input.meetingLat ?? null,
      meetingLng: input.meetingLng ?? null,
      included: input.included,
      notIncluded: input.notIncluded,
      recommendations: input.recommendations ?? null,
      status: input.status,
      sortOrder: input.sortOrder,
    });
    await replaceBadges(db, id, input.badgeSlugs);
    await replaceRoutePoints(db, id, input.routePoints);

    return ok(c, await getAdminTour(db, id, imagesBaseOf(c)), 201);
  })

  .patch('/:id', validate('json', tourUpdateSchema), async (c) => {
    const id = c.req.param('id');
    const input = c.req.valid('json');
    const db = c.get('db');

    const existing = await db.query.tours.findFirst({ where: eq(tours.id, id), columns: { id: true } });
    if (!existing) throw notFound('Экскурсия не найдена');
    if (input.slug) await assertSlugFree(db, input.slug, id);

    const patch = tourColumnsFrom(input);
    if (Object.keys(patch).length > 0) {
      await db
        .update(tours)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(tours.id, id));
    }
    if (input.badgeSlugs !== undefined) await replaceBadges(db, id, input.badgeSlugs);
    if (input.routePoints !== undefined) await replaceRoutePoints(db, id, input.routePoints);

    return ok(c, await getAdminTour(db, id, imagesBaseOf(c)));
  })

  // Архивация вместо удаления: история броней должна сохраняться.
  .delete('/:id', async (c) => {
    const id = c.req.param('id');
    const db = c.get('db');
    const existing = await db.query.tours.findFirst({ where: eq(tours.id, id), columns: { id: true } });
    if (!existing) throw notFound('Экскурсия не найдена');

    const [activeBookings] = await db
      .select({ total: count() })
      .from(bookings)
      .where(and(eq(bookings.tourId, id), inArray(bookings.status, ['pending', 'confirmed'])));
    if ((activeBookings?.total ?? 0) > 0) {
      throw conflict('У экскурсии есть активные брони — сначала обработайте их');
    }

    await db.update(tours).set({ status: 'archived', updatedAt: new Date() }).where(eq(tours.id, id));
    return ok(c, { archived: true });
  });
