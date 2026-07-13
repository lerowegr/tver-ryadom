import type { Db } from '@tver/db';
import { bookings, schedules } from '@tver/db';
import { formatPrice } from '@tver/shared';
import { and, eq, gt, inArray, isNull, lte } from 'drizzle-orm';
import { notifyUser } from './dispatch';
import { formatMsk } from './templates';

/**
 * Напоминания за сутки: подтверждённые брони со слотом в ближайшие 24 часа.
 * reminder_sent_at защищает от повторной отправки между тиками cron.
 */
export async function enqueueReminders(db: Db, siteUrl?: string) {
  const now = new Date();
  const dayAhead = new Date(now.getTime() + 24 * 3600 * 1000);

  const windowSlots = db
    .select({ id: schedules.id })
    .from(schedules)
    .where(and(gt(schedules.startsAt, now), lte(schedules.startsAt, dayAhead)));

  const due = await db.query.bookings.findMany({
    where: and(
      eq(bookings.status, 'confirmed'),
      isNull(bookings.reminderSentAt),
      inArray(bookings.scheduleId, windowSlots),
    ),
    with: {
      tour: { columns: { title: true } },
      schedule: { columns: { startsAt: true } },
    },
    limit: 50,
  });

  for (const booking of due) {
    await db
      .update(bookings)
      .set({ reminderSentAt: new Date() })
      .where(eq(bookings.id, booking.id));

    if (booking.userId) {
      await notifyUser(db, booking.userId, 'booking_reminder', {
        bookingId: booking.id,
        tourTitle: booking.tour?.title,
        startsAt: booking.schedule ? formatMsk(booking.schedule.startsAt) : undefined,
        peopleCount: booking.peopleCount,
        totalPriceLabel: formatPrice(booking.totalPrice),
        siteUrl,
      });
    }
  }

  return { reminders: due.length };
}
