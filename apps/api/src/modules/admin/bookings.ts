import { bookings, schedules } from '@tver/db';
import {
  BOOKING_STATUSES,
  bookingAdminUpdateSchema,
  paginationSchema,
} from '@tver/shared';
import { formatPrice } from '@tver/shared';
import { and, count, eq, sql, type SQL } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../env';
import { conflict, notFound } from '../../lib/errors';
import { ok, paginated } from '../../lib/respond';
import { validate } from '../../middleware/validate';
import { changeBookingStatus } from './booking-status';
import { formatMsk } from '../notifications/templates';

const listFilterSchema = paginationSchema.extend({
  status: z.enum(BOOKING_STATUSES).optional(),
  tourId: z.string().optional(),
});

/** Разрешённые переходы статусов брони для администратора. */
const transitions: Record<string, string[]> = {
  pending: ['confirmed', 'cancelled', 'completed'],
  confirmed: ['cancelled', 'completed'],
  cancelled: [],
  completed: [],
};

export const adminBookingRoutes = new Hono<AppEnv>()
  .get('/', validate('query', listFilterSchema), async (c) => {
    const filter = c.req.valid('query');
    const db = c.get('db');
    const conditions: SQL[] = [];
    if (filter.status) conditions.push(eq(bookings.status, filter.status));
    if (filter.tourId) conditions.push(eq(bookings.tourId, filter.tourId));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalRow] = await db.select({ total: count() }).from(bookings).where(where);
    const rows = await db.query.bookings.findMany({
      where,
      with: {
        tour: { columns: { id: true, slug: true, title: true } },
        schedule: { columns: { startsAt: true } },
        user: { columns: { id: true, name: true, email: true } },
      },
      orderBy: (b, { desc }) => [desc(b.createdAt)],
      limit: filter.limit,
      offset: (filter.page - 1) * filter.limit,
    });

    const items = rows.map((row) => ({
      id: row.id,
      status: row.status,
      paymentStatus: row.paymentStatus,
      peopleCount: row.peopleCount,
      totalPrice: row.totalPrice,
      startsAt: row.schedule?.startsAt ?? row.desiredDate,
      contactName: row.contactName,
      contactPhone: row.contactPhone,
      contactEmail: row.contactEmail,
      comment: row.comment,
      adminComment: row.adminComment,
      cancelReason: row.cancelReason,
      source: row.source,
      createdAt: row.createdAt,
      tour: row.tour,
      user: row.user,
    }));
    return paginated(c, items, totalRow?.total ?? 0, filter.page, filter.limit);
  })

  .patch('/:id', validate('json', bookingAdminUpdateSchema), async (c) => {
    const input = c.req.valid('json');
    // Правила перехода, возврат мест и уведомления живут в службе:
    // ровно то же самое делает бот.
    const result = await changeBookingStatus(
      c.get('db'),
      c.req.param('id'),
      input.status,
      input.adminComment,
      c.env.SITE_URL,
    );
    return ok(c, { id: result.id, status: result.status });
  });
