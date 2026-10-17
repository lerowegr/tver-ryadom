import { bookings, contactRequests, outbox, reviews, schedules } from '@tver/db';
import { count, eq, gt, gte, inArray, sql, sum } from 'drizzle-orm';
import { Hono } from 'hono';
import type { AppEnv } from '../../env';
import { ok } from '../../lib/respond';

export const adminStatsRoutes = new Hono<AppEnv>().get('/', async (c) => {
  const db = c.get('db');
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);

  const [today] = await db
    .select({ total: count() })
    .from(bookings)
    .where(gte(bookings.createdAt, dayStart));

  const [pending] = await db
    .select({ total: count() })
    .from(bookings)
    .where(eq(bookings.status, 'pending'));

  const futureSlots = db.select({ id: schedules.id }).from(schedules).where(gt(schedules.startsAt, now));
  const [upcoming] = await db
    .select({ total: count() })
    .from(bookings)
    .where(inArray(bookings.scheduleId, futureSlots));

  const [revenue] = await db
    .select({ total: sum(bookings.totalPrice) })
    .from(bookings)
    .where(inArray(bookings.status, ['confirmed', 'completed']));

  const [pendingReviews] = await db
    .select({ total: count() })
    .from(reviews)
    .where(eq(reviews.status, 'pending'));

  const [newRequests] = await db
    .select({ total: count() })
    .from(contactRequests)
    .where(eq(contactRequests.status, 'new'));

  // Упавшие доставки — бейдж в меню админки, чтобы dead letter не копился незамеченным.
  const [failedNotifications] = await db
    .select({ total: count() })
    .from(outbox)
    .where(eq(outbox.status, 'failed'));

  // Брони по дням за неделю — для мини-графика на дашборде.
  const byDay = await db
    .select({
      day: sql<string>`strftime('%Y-%m-%d', ${bookings.createdAt}, 'unixepoch')`,
      total: count(),
    })
    .from(bookings)
    .where(gte(bookings.createdAt, weekAgo))
    .groupBy(sql`strftime('%Y-%m-%d', ${bookings.createdAt}, 'unixepoch')`);

  const recent = await db.query.bookings.findMany({
    with: {
      tour: { columns: { title: true, slug: true } },
      schedule: { columns: { startsAt: true } },
    },
    orderBy: (b, { desc }) => [desc(b.createdAt)],
    limit: 6,
  });

  return ok(c, {
    bookingsToday: today?.total ?? 0,
    pendingBookings: pending?.total ?? 0,
    upcomingBookings: upcoming?.total ?? 0,
    revenue: Number(revenue?.total ?? 0),
    pendingReviews: pendingReviews?.total ?? 0,
    newRequests: newRequests?.total ?? 0,
    failedNotifications: failedNotifications?.total ?? 0,
    bookingsByDay: byDay,
    recentBookings: recent.map((row) => ({
      id: row.id,
      status: row.status,
      contactName: row.contactName,
      peopleCount: row.peopleCount,
      totalPrice: row.totalPrice,
      createdAt: row.createdAt,
      startsAt: row.schedule?.startsAt ?? row.desiredDate,
      tour: row.tour,
    })),
  });
});
