import { NOTIFICATION_CHANNELS, OUTBOX_STATUSES } from '@tver/shared';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { users } from './auth';
import { createdAt, id } from './helpers';

/** Внутрисайтовые уведомления личного кабинета. */
export const notifications = sqliteTable(
  'notifications',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    payload: text('payload', { mode: 'json' }).$type<Record<string, unknown>>(),
    readAt: integer('read_at', { mode: 'timestamp' }),
    createdAt: createdAt(),
  },
  (t) => [index('notifications_user_read_idx').on(t.userId, t.readAt)],
);

/**
 * Очередь доставки во внешние каналы (замена Redis+BullMQ на бесплатном тарифе):
 * записи создаются сервисом уведомлений, Cron Trigger раз в минуту отправляет
 * пачку pending-задач с ретраями.
 */
export const outbox = sqliteTable(
  'outbox',
  {
    id: id(),
    channel: text('channel', { enum: NOTIFICATION_CHANNELS }).notNull(),
    /** chat_id для Telegram, адрес для email и т.д. */
    recipient: text('recipient').notNull(),
    template: text('template').notNull(),
    payload: text('payload', { mode: 'json' }).$type<Record<string, unknown>>(),
    status: text('status', { enum: OUTBOX_STATUSES }).notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    scheduledAt: integer('scheduled_at', { mode: 'timestamp' }).notNull(),
    sentAt: integer('sent_at', { mode: 'timestamp' }),
    createdAt: createdAt(),
  },
  (t) => [index('outbox_status_scheduled_idx').on(t.status, t.scheduledAt)],
);
