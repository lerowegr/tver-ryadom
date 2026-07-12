import type { ProgramStep } from '@tver/shared';
import { PRICE_TYPES, SCHEDULE_STATUSES, TOUR_STATUSES } from '@tver/shared';
import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { createdAt, id, updatedAt } from './helpers';

export const tours = sqliteTable(
  'tours',
  {
    id: id(),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    subtitle: text('subtitle'),
    shortDescription: text('short_description').notNull(),
    fullDescription: text('full_description').notNull(),
    program: text('program', { mode: 'json' })
      .$type<ProgramStep[]>()
      .notNull()
      .default(sql`'[]'`),
    /** Копейки. */
    price: integer('price').notNull(),
    priceType: text('price_type', { enum: PRICE_TYPES }).notNull().default('per_person'),
    durationMinutes: integer('duration_minutes').notNull(),
    groupMin: integer('group_min').notNull().default(1),
    groupMax: integer('group_max'),
    meetingPoint: text('meeting_point'),
    meetingLat: real('meeting_lat'),
    meetingLng: real('meeting_lng'),
    included: text('included', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    notIncluded: text('not_included', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    recommendations: text('recommendations'),
    status: text('status', { enum: TOUR_STATUSES }).notNull().default('draft'),
    sortOrder: integer('sort_order').notNull().default(0),
    /** Денормализованный рейтинг; пересчитывается сервисом при модерации отзывов. */
    ratingAvg: real('rating_avg').notNull().default(0),
    ratingCount: integer('rating_count').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('tours_slug_idx').on(t.slug), index('tours_status_idx').on(t.status)],
);

export const badges = sqliteTable(
  'badges',
  {
    id: id(),
    slug: text('slug').notNull(),
    label: text('label').notNull(),
  },
  (t) => [uniqueIndex('badges_slug_idx').on(t.slug)],
);

export const tourBadges = sqliteTable(
  'tour_badges',
  {
    tourId: text('tour_id')
      .notNull()
      .references(() => tours.id, { onDelete: 'cascade' }),
    badgeId: text('badge_id')
      .notNull()
      .references(() => badges.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.tourId, t.badgeId] })],
);

export const tourImages = sqliteTable(
  'tour_images',
  {
    id: id(),
    tourId: text('tour_id')
      .notNull()
      .references(() => tours.id, { onDelete: 'cascade' }),
    r2Key: text('r2_key').notNull(),
    alt: text('alt'),
    sortOrder: integer('sort_order').notNull().default(0),
    /** Ключи готовых вариантов в R2: { thumb, card, hero, original }. */
    variants: text('variants', { mode: 'json' })
      .$type<Record<string, string>>()
      .notNull()
      .default(sql`'{}'`),
    createdAt: createdAt(),
  },
  (t) => [index('tour_images_tour_idx').on(t.tourId)],
);

export const routePoints = sqliteTable(
  'route_points',
  {
    id: id(),
    tourId: text('tour_id')
      .notNull()
      .references(() => tours.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    lat: real('lat').notNull(),
    lng: real('lng').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('route_points_tour_idx').on(t.tourId)],
);

export const schedules = sqliteTable(
  'schedules',
  {
    id: id(),
    tourId: text('tour_id')
      .notNull()
      .references(() => tours.id, { onDelete: 'cascade' }),
    startsAt: integer('starts_at', { mode: 'timestamp' }).notNull(),
    capacity: integer('capacity').notNull(),
    /** Денормализованный счётчик занятых мест; обновляется сервисом бронирования. */
    bookedCount: integer('booked_count').notNull().default(0),
    status: text('status', { enum: SCHEDULE_STATUSES }).notNull().default('open'),
    createdAt: createdAt(),
  },
  (t) => [index('schedules_tour_starts_idx').on(t.tourId, t.startsAt)],
);
