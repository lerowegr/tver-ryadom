import { bookings, users } from '@tver/db';
import { USER_ROLES, paginationSchema } from '@tver/shared';
import { and, count, desc, eq, ne, or, type SQL } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../env';
import { hashPassword } from '../../lib/crypto';
import { likeContains } from '../../lib/db-utils';
import { conflict, notFound } from '../../lib/errors';
import { ok, paginated } from '../../lib/respond';
import { validate } from '../../middleware/validate';
import { revokeAllSessions } from '../auth/service';

const listFilterSchema = paginationSchema.extend({
  search: z.string().trim().max(200).optional(),
});

/** Заведение сотрудника с доступом в панель. */
const userCreateSchema = z.object({
  email: z.string().trim().email('Некорректный email').max(200),
  name: z.string().trim().min(2).max(100),
  password: z.string().min(10, 'Пароль должен быть не короче 10 символов').max(200),
  role: z.enum(USER_ROLES).default('admin'),
});

const roleUpdateSchema = z.object({ role: z.enum(USER_ROLES) });

export const adminUserRoutes = new Hono<AppEnv>()
  .post('/', validate('json', userCreateSchema), async (c) => {
    const input = c.req.valid('json');
    const db = c.get('db');

    const existing = await db.query.users.findFirst({
      where: eq(users.email, input.email),
      columns: { id: true },
    });
    if (existing) throw conflict('Пользователь с таким email уже есть');

    const id = crypto.randomUUID();
    await db.insert(users).values({
      id,
      email: input.email,
      name: input.name,
      passwordHash: await hashPassword(input.password),
      role: input.role,
    });
    return ok(c, { id, email: input.email, role: input.role }, 201);
  })

  .patch('/:id/role', validate('json', roleUpdateSchema), async (c) => {
    const id = c.req.param('id');
    const { role } = c.req.valid('json');
    const db = c.get('db');

    const target = await db.query.users.findFirst({ where: eq(users.id, id), columns: { id: true } });
    if (!target) throw notFound('Пользователь не найден');

    // Нельзя снять с себя права: иначе можно закрыть себе доступ в панель.
    if (role !== 'admin' && c.get('user')?.id === id) {
      throw conflict('Нельзя снять права администратора с самого себя');
    }
    // И нельзя убрать последнего администратора.
    if (role !== 'admin') {
      const [rest] = await db
        .select({ total: count() })
        .from(users)
        .where(and(eq(users.role, 'admin'), ne(users.id, id)));
      if ((rest?.total ?? 0) === 0) throw conflict('Это последний администратор');
    }

    await db.update(users).set({ role }).where(eq(users.id, id));
    // Новая роль вступает сразу: refresh-цепочки гасим, а access умрёт сам —
    // requireAuth/requireAdmin сверяют сессию и роль с БД на каждый запрос.
    await revokeAllSessions(db, id);
    return ok(c, { id, role });
  })

  .get('/', validate('query', listFilterSchema), async (c) => {
    const filter = c.req.valid('query');
    const db = c.get('db');

    let where: SQL | undefined;
    if (filter.search) {
      where = or(
        likeContains(users.name, filter.search),
        likeContains(users.email, filter.search),
        likeContains(users.phone, filter.search),
      );
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
  });
