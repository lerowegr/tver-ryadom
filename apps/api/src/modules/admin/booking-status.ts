import { bookings, schedules, type Db } from '@tver/db';
import { formatPrice, type BookingStatus } from '@tver/shared';
import { eq, sql } from 'drizzle-orm';
import { conflict, notFound } from '../../lib/errors';
import { notifyUser } from '../notifications/dispatch';
import { formatMsk } from '../notifications/templates';

/**
 * Смена статуса брони администратором.
 *
 * Вынесено из маршрута, потому что то же самое делает бот: держать две
 * копии правил перехода, возврата мест и уведомлений — верный способ их
 * рассинхронизировать.
 */

/** Разрешённые переходы статусов брони. */
const TRANSITIONS: Record<string, BookingStatus[]> = {
  pending: ['confirmed', 'cancelled', 'completed'],
  confirmed: ['cancelled', 'completed'],
  cancelled: [],
  completed: [],
};

export async function changeBookingStatus(
  db: Db,
  id: string,
  status: BookingStatus,
  adminComment: string | undefined,
  siteUrl: string | undefined,
): Promise<{ id: string; status: BookingStatus; tourTitle: string | null }> {
  const booking = await db.query.bookings.findFirst({
    where: eq(bookings.id, id),
    with: {
      tour: { columns: { title: true } },
      schedule: { columns: { startsAt: true } },
    },
  });
  if (!booking) throw notFound('Бронирование не найдено');

  if (booking.status === status) {
    if (adminComment !== undefined) {
      await db
        .update(bookings)
        .set({ adminComment, updatedAt: new Date() })
        .where(eq(bookings.id, id));
    }
    return { id, status, tourTitle: booking.tour?.title ?? null };
  }

  if (!TRANSITIONS[booking.status]?.includes(status)) {
    throw conflict(`Нельзя перевести бронь из «${booking.status}» в «${status}»`);
  }

  await db
    .update(bookings)
    .set({
      status,
      adminComment: adminComment ?? booking.adminComment,
      updatedAt: new Date(),
    })
    .where(eq(bookings.id, id));

  // Отмена возвращает места в слот расписания.
  if (status === 'cancelled' && booking.scheduleId) {
    await db
      .update(schedules)
      .set({ bookedCount: sql`max(0, ${schedules.bookedCount} - ${booking.peopleCount})` })
      .where(eq(schedules.id, booking.scheduleId));
  }

  if (booking.userId) {
    // ЛК + мессенджеры + email — доставку внешних каналов выполнит cron.
    await notifyUser(db, booking.userId, `booking_${status}`, {
      bookingId: booking.id,
      tourTitle: booking.tour?.title,
      startsAt: booking.schedule
        ? formatMsk(booking.schedule.startsAt)
        : booking.desiredDate
          ? formatMsk(booking.desiredDate)
          : undefined,
      peopleCount: booking.peopleCount,
      totalPriceLabel: formatPrice(booking.totalPrice),
      comment: adminComment,
      siteUrl,
    });
  }

  return { id, status, tourTitle: booking.tour?.title ?? null };
}
