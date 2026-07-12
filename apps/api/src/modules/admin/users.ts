import { bookings, users } from '@tver/db';
import { paginationSchema } from '@tver/shared';
import { count, desc, eq, like, or, type SQL } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../env';
import { paginated } from '../../lib/respond';
import { validate } from '../../middleware/validate';

const listFilterSchema = paginationSchema.extend({
  search: z.string().trim().max(200).optional(),
});

export const adminUserRoutes = new Hono<AppEnv>().get(
  '/',
  validate('query', listFilterSchema),
  async (c) => {
    const filter = c.req.valid('query');
    const db = c.get('db');

    let where: SQL | undefined;
    if (filter.search) {
      const pattern = `%${filter.search}%`;
      where = or(like(users.name, pattern), like(users.email, pattern), like(users.phone, pattern));
    }

    const [totalRow] = await db.select({ total: count() }).from(users).where(where);
    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        role: users.role,
        emailVerifiedAt: users.emailVerifiedAt,
        telegramChatId: users.telegramChatId,
        createdAt: users.createdAt,
        bookingsCount: count(bookings.id),
      })
      .from(users)
      .leftJoin(bookings, eq(bookings.userId, users.id))
      .where(where)
      .groupBy(users.id)
      .orderBy(desc(users.createdAt))
      .limit(filter.limit)
      .offset((filter.page - 1) * filter.limit);

    return paginated(c, rows, totalRow?.total ?? 0, filter.page, filter.limit);
  },
);
