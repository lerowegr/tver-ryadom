import { CONTACT_REQUEST_STATUSES, REVIEW_STATUSES } from '@tver/shared';
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { users } from './auth';
import { createdAt, id, updatedAt } from './helpers';
import { tours } from './tours';

export const reviews = sqliteTable(
  'reviews',
  {
    id: id(),
    tourId: text('tour_id')
      .notNull()
      .references(() => tours.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    authorName: text('author_name').notNull(),
    rating: integer('rating').notNull(),
    text: text('text').notNull(),
    status: text('status', { enum: REVIEW_STATUSES }).notNull().default('pending'),
    createdAt: createdAt(),
  },
  (t) => [index('reviews_tour_status_idx').on(t.tourId, t.status)],
);

export const favorites = sqliteTable(
  'favorites',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tourId: text('tour_id')
      .notNull()
      .references(() => tours.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.tourId] })],
);

export const galleryImages = sqliteTable('gallery_images', {
  id: id(),
  r2Key: text('r2_key').notNull(),
  alt: text('alt'),
  sortOrder: integer('sort_order').notNull().default(0),
  variants: text('variants', { mode: 'json' }).$type<Record<string, string>>(),
  createdAt: createdAt(),
});

export const contactRequests = sqliteTable('contact_requests', {
  id: id(),
  name: text('name').notNull(),
  phone: text('phone'),
  email: text('email'),
  message: text('message').notNull(),
  status: text('status', { enum: CONTACT_REQUEST_STATUSES }).notNull().default('new'),
  createdAt: createdAt(),
});

/** Key-value настройки сайта: контакты, соцсети, тексты. Значение — JSON-строка. */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: updatedAt(),
});
