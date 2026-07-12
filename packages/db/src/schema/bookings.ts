import { BOOKING_SOURCES, BOOKING_STATUSES, PAYMENT_STATUSES } from '@tver/shared';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { users } from './auth';
import { createdAt, id, updatedAt } from './helpers';
import { schedules, tours } from './tours';

export const bookings = sqliteTable(
  'bookings',
  {
    id: id(),
    /** Nullable: гостевые заявки без аккаунта. */
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    tourId: text('tour_id')
      .notNull()
      .references(() => tours.id, { onDelete: 'restrict' }),
    scheduleId: text('schedule_id').references(() => schedules.id, { onDelete: 'set null' }),
    /** Желаемая дата для заявок без слота расписания. */
    desiredDate: integer('desired_date', { mode: 'timestamp' }),
    peopleCount: integer('people_count').notNull(),
    /** Копейки; фиксируется на момент брони. */
    totalPrice: integer('total_price').notNull(),
    status: text('status', { enum: BOOKING_STATUSES }).notNull().default('pending'),
    paymentStatus: text('payment_status', { enum: PAYMENT_STATUSES }).notNull().default('none'),
    contactName: text('contact_name').notNull(),
    contactPhone: text('contact_phone').notNull(),
    contactEmail: text('contact_email'),
    comment: text('comment'),
    adminComment: text('admin_comment'),
    cancelReason: text('cancel_reason'),
    source: text('source', { enum: BOOKING_SOURCES }).notNull().default('web'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('bookings_user_status_idx').on(t.userId, t.status),
    index('bookings_tour_status_idx').on(t.tourId, t.status),
    index('bookings_schedule_idx').on(t.scheduleId),
  ],
);

/** Задел под онлайн-оплату (ЮKassa): таблица готова, интеграция подключается позже. */
export const payments = sqliteTable(
  'payments',
  {
    id: id(),
    bookingId: text('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    externalId: text('external_id'),
    /** Копейки. */
    amount: integer('amount').notNull(),
    status: text('status').notNull(),
    payload: text('payload', { mode: 'json' }).$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('payments_booking_idx').on(t.bookingId)],
);
