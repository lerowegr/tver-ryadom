import { Hono } from 'hono';
import type { AppEnv } from '../../env';
import { requireAdmin } from '../../middleware/auth';
import { adminBookingRoutes } from './bookings';
import { adminImageRoutes } from './images';
import { adminRequestRoutes } from './requests';
import { adminReviewRoutes } from './reviews';
import { adminScheduleRoutes } from './schedules';
import { adminSettingsRoutes } from './settings';
import { adminStatsRoutes } from './stats';
import { adminTourRoutes } from './tours';
import { adminUserRoutes } from './users';

/** Все админ-маршруты закрыты guard'ом роли admin. */
export const adminRoutes = new Hono<AppEnv>()
  .use('*', requireAdmin)
  .route('/stats', adminStatsRoutes)
  .route('/tours', adminTourRoutes)
  .route('/schedules', adminScheduleRoutes)
  .route('/bookings', adminBookingRoutes)
  .route('/reviews', adminReviewRoutes)
  .route('/users', adminUserRoutes)
  .route('/contact-requests', adminRequestRoutes)
  .route('/settings', adminSettingsRoutes)
  .route('/', adminImageRoutes);
