import type { Db } from '@tver/db';
import { bookings, schedules, tours } from '@tver/db';
import { formatPrice, type BookingCreateInput, type BookingListFilterInput } from '@tver/shared';
import { and, count, eq, gt, inArray, or, sql, type SQL } from 'drizzle-orm';
import type { AuthUser } from '../../env';
import { affectedRows } from '../../lib/db-utils';
import { conflict, notFound, validationError } from '../../lib/errors';
import { notifyAdmins, notifyUser } from '../notifications/dispatch';
import { createNotification } from '../notifications/service';
import { formatMsk } from '../notifications/templates';

type BookingRow = typeof bookings.$inferSelect;

interface BookingRelations {
  tour?: { id: string; slug: string; title: string } | null;
  schedule?: { startsAt: Date } | null;
}

function toBookingView(row: BookingRow & BookingRelations) {
  return {
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
    cancelReason: row.cancelReason,
    createdAt: row.createdAt,
    tour: row.tour ?? null,
  };
}

export async function createBooking(
  db: Db,
  input: BookingCreateInput,
  user?: AuthUser,
  siteUrl?: string,
) {
  const tour = await db.query.tours.findFirst({
    where: and(eq(tours.id, input.tourId), eq(tours.status, 'published')),
  });
  if (!tour) throw notFound('Экскурсия не найдена');

  if (input.peopleCount < tour.groupMin) {
    throw validationError(`Минимальный размер группы — ${tour.groupMin}`);
  }
  if (tour.groupMax !== null && input.peopleCount > tour.groupMax) {
    throw validationError(`Максимальный размер группы — ${tour.groupMax}`);
  }

  let startsAt: Date | null = null;
  if (input.scheduleId) {
    const slot = await db.query.schedules.findFirst({
      where: and(eq(schedules.id, input.scheduleId), eq(schedules.tourId, tour.id)),
    });
    if (!slot || slot.status !== 'open') throw notFound('Слот расписания не найден или закрыт');
    if (slot.startsAt.getTime() <= Date.now()) throw validationError('Эта дата уже прошла');

    // Условный UPDATE защищает от овербукинга при одновременных заявках:
    // счётчик растёт только пока вмещается в capacity.
    const result = await db
      .update(schedules)
      .set({ bookedCount: sql`${schedules.bookedCount} + ${input.peopleCount}` })
      .where(
        and(
          eq(schedules.id, slot.id),
          eq(schedules.status, 'open'),
          sql`${schedules.bookedCount} + ${input.peopleCount} <= ${schedules.capacity}`,
        ),
      );
    if (affectedRows(result) === 0) {
      throw conflict('На выбранную дату недостаточно свободных мест');
    }
    startsAt = slot.startsAt;
  } else if (input.desiredDate) {
    if (input.desiredDate.getTime() <= Date.now()) {
      throw validationError('Желаемая дата уже прошла');
    }
    startsAt = input.desiredDate;
  }

  const totalPrice =
    tour.priceType === 'per_person' ? tour.price * input.peopleCount : tour.price;

  const id = crypto.randomUUID();
  await db.insert(bookings).values({
    id,
    userId: user?.id ?? null,
    tourId: tour.id,
    scheduleId: input.scheduleId ?? null,
    desiredDate: input.scheduleId ? null : (input.desiredDate ?? null),
    peopleCount: input.peopleCount,
    totalPrice,
    contactName: input.contactName,
    contactPhone: input.contactPhone,
    contactEmail: input.contactEmail ?? null,
    comment: input.comment ?? null,
    source: 'web',
  });

  const payload = {
    bookingId: id,
    tourTitle: tour.title,
    startsAt: startsAt ? formatMsk(startsAt) : undefined,
    peopleCount: input.peopleCount,
    totalPriceLabel: formatPrice(totalPrice),
    contactName: input.contactName,
    contactPhone: input.contactPhone,
    comment: input.comment,
    siteUrl,
  };
  // Клиенту — в ЛК и подключённые каналы; администраторам — в Telegram.
  if (user) await notifyUser(db, user.id, 'booking_created', payload);
  await notifyAdmins(db, 'admin_new_booking', payload);

  return {
    id,
    status: 'pending' as const,
    totalPrice,
    startsAt,
    tour: { id: tour.id, slug: tour.slug, title: tour.title },
  };
}

export async function listMyBookings(db: Db, userId: string, filter: BookingListFilterInput) {
  const conditions: SQL[] = [eq(bookings.userId, userId)];
  if (filter.status) conditions.push(eq(bookings.status, filter.status));
  if (filter.tourId) conditions.push(eq(bookings.tourId, filter.tourId));
  if (filter.upcoming !== undefined) {
    const now = new Date();
    const futureSlots = db
      .select({ id: schedules.id })
      .from(schedules)
      .where(gt(schedules.startsAt, now));
    const isUpcoming = or(
      gt(bookings.desiredDate, now),
      inArray(bookings.scheduleId, futureSlots),
    );
    if (isUpcoming) conditions.push(filter.upcoming ? isUpcoming : sql`NOT (${isUpcoming})`);
  }

  const where = and(...conditions);
  const [totalRow] = await db.select({ total: count() }).from(bookings).where(where);
  const rows = await db.query.bookings.findMany({
    where,
    with: {
      tour: { columns: { id: true, slug: true, title: true } },
      schedule: { columns: { startsAt: true } },
    },
    orderBy: (booking, { desc: sortDesc }) => [sortDesc(booking.createdAt)],
    limit: filter.limit,
    offset: (filter.page - 1) * filter.limit,
  });

  return { items: rows.map(toBookingView), total: totalRow?.total ?? 0 };
}

export async function cancelBooking(db: Db, userId: string, bookingId: string, reason?: string) {
  const booking = await db.query.bookings.findFirst({
    where: and(eq(bookings.id, bookingId), eq(bookings.userId, userId)),
    with: {
      schedule: { columns: { startsAt: true } },
      tour: { columns: { title: true } },
    },
  });
  if (!booking) throw notFound('Бронирование не найдено');
  if (booking.status !== 'pending' && booking.status !== 'confirmed') {
    throw conflict('Это бронирование уже нельзя отменить');
  }
  if (booking.schedule && booking.schedule.startsAt.getTime() <= Date.now()) {
    throw conflict('Экскурсия уже началась — отмена через сайт недоступна');
  }

  await db
    .update(bookings)
    .set({ status: 'cancelled', cancelReason: reason ?? null, updatedAt: new Date() })
    .where(eq(bookings.id, bookingId));

  if (booking.scheduleId) {
    await db
      .update(schedules)
      .set({ bookedCount: sql`max(0, ${schedules.bookedCount} - ${booking.peopleCount})` })
      .where(eq(schedules.id, booking.scheduleId));
  }

  await createNotification(db, userId, 'booking_cancelled', { bookingId });
  await notifyAdmins(db, 'admin_booking_cancelled', {
    bookingId,
    tourTitle: booking.tour?.title,
    startsAt: booking.schedule ? formatMsk(booking.schedule.startsAt) : undefined,
    peopleCount: booking.peopleCount,
    totalPriceLabel: formatPrice(booking.totalPrice),
    contactName: booking.contactName,
    contactPhone: booking.contactPhone,
    comment: reason,
  });
}
