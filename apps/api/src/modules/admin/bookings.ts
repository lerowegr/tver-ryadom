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
import { notifyUser } from '../notifications/dispatch';
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
    const id = c.req.param('id');
    const input = c.req.valid('json');
    const db = c.get('db');

    const booking = await db.query.bookings.findFirst({
      where: eq(bookings.id, id),
      with: {
        tour: { columns: { title: true } },
        schedule: { columns: { startsAt: true } },
      },
    });
    if (!booking) throw notFound('Бронирование не найдено');

    if (booking.status !== input.status) {
      if (!transitions[booking.status]?.includes(input.status)) {
        throw conflict(`Нельзя перевести бронь из «${booking.status}» в «${input.status}»`);
      }

      await db
        .update(bookings)
        .set({
          status: input.status,
          adminComment: input.adminComment ?? booking.adminComment,
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, id));

      // Отмена возвращает места в слот расписания.
      if (input.status === 'cancelled' && booking.scheduleId) {
        await db
          .update(schedules)
          .set({ bookedCount: sql`max(0, ${schedules.bookedCount} - ${booking.peopleCount})` })
          .where(eq(schedules.id, booking.scheduleId));
      }

      if (booking.userId) {
        // ЛК + Telegram + email — доставку внешних каналов выполнит cron.
        await notifyUser(db, booking.userId, `booking_${input.status}`, {
          bookingId: booking.id,
          tourTitle: booking.tour?.title,
          startsAt: booking.schedule
            ? formatMsk(booking.schedule.startsAt)
            : booking.desiredDate
              ? formatMsk(booking.desiredDate)
              : undefined,
          peopleCount: booking.peopleCount,
          totalPriceLabel: formatPrice(booking.totalPrice),
          comment: input.adminComment,
          siteUrl: c.env.SITE_URL,
        });
      }
    } else if (input.adminComment !== undefined) {
      await db
        .update(bookings)
        .set({ adminComment: input.adminComment, updatedAt: new Date() })
        .where(eq(bookings.id, id));
    }

    return ok(c, { id, status: input.status });
  });
