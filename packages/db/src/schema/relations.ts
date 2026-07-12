import { relations } from 'drizzle-orm';
import { sessions, users } from './auth';
import { bookings, payments } from './bookings';
import { favorites, reviews } from './content';
import { notifications } from './notifications';
import { badges, routePoints, schedules, tourBadges, tourImages, tours } from './tours';

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  bookings: many(bookings),
  reviews: many(reviews),
  favorites: many(favorites),
  notifications: many(notifications),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const toursRelations = relations(tours, ({ many }) => ({
  images: many(tourImages),
  routePoints: many(routePoints),
  schedules: many(schedules),
  badges: many(tourBadges),
  reviews: many(reviews),
  bookings: many(bookings),
}));

export const badgesRelations = relations(badges, ({ many }) => ({
  tours: many(tourBadges),
}));

export const tourBadgesRelations = relations(tourBadges, ({ one }) => ({
  tour: one(tours, { fields: [tourBadges.tourId], references: [tours.id] }),
  badge: one(badges, { fields: [tourBadges.badgeId], references: [badges.id] }),
}));

export const tourImagesRelations = relations(tourImages, ({ one }) => ({
  tour: one(tours, { fields: [tourImages.tourId], references: [tours.id] }),
}));

export const routePointsRelations = relations(routePoints, ({ one }) => ({
  tour: one(tours, { fields: [routePoints.tourId], references: [tours.id] }),
}));

export const schedulesRelations = relations(schedules, ({ one, many }) => ({
  tour: one(tours, { fields: [schedules.tourId], references: [tours.id] }),
  bookings: many(bookings),
}));

export const bookingsRelations = relations(bookings, ({ one, many }) => ({
  user: one(users, { fields: [bookings.userId], references: [users.id] }),
  tour: one(tours, { fields: [bookings.tourId], references: [tours.id] }),
  schedule: one(schedules, { fields: [bookings.scheduleId], references: [schedules.id] }),
  payments: many(payments),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  booking: one(bookings, { fields: [payments.bookingId], references: [bookings.id] }),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  tour: one(tours, { fields: [reviews.tourId], references: [tours.id] }),
  user: one(users, { fields: [reviews.userId], references: [users.id] }),
}));

export const favoritesRelations = relations(favorites, ({ one }) => ({
  user: one(users, { fields: [favorites.userId], references: [users.id] }),
  tour: one(tours, { fields: [favorites.tourId], references: [tours.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));
