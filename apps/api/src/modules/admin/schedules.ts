import { bookings, schedules, tours } from '@tver/db';
import { scheduleCreateSchema, scheduleUpdateSchema } from '@tver/shared';
import { and, count, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import type { AppEnv } from '../../env';
import { conflict, notFound, validationError } from '../../lib/errors';
import { ok } from '../../lib/respond';
import { validate } from '../../middleware/validate';

export const adminScheduleRoutes = new Hono<AppEnv>()
  .post('/', validate('json', scheduleCreateSchema), async (c) => {
    const input = c.req.valid('json');
    const db = c.get('db');
    const tour = await db.query.tours.findFirst({
      where: eq(tours.id, input.tourId),
      columns: { id: true },
    });
    if (!tour) throw notFound('Экскурсия не найдена');
    if (input.startsAt.getTime() <= Date.now()) {
      throw validationError('Дата слота должна быть в будущем');
    }

    const id = crypto.randomUUID();
    await db.insert(schedules).values({
      id,
      tourId: input.tourId,
      startsAt: input.startsAt,
      capacity: input.capacity,
    });
    return ok(c, { id }, 201);
  })

  .patch('/:id', validate('json', scheduleUpdateSchema), async (c) => {
    const id = c.req.param('id');
    const input = c.req.valid('json');
    const db = c.get('db');

    const slot = await db.query.schedules.findFirst({ where: eq(schedules.id, id) });
    if (!slot) throw notFound('Слот расписания не найден');
    if (input.capacity !== undefined && input.capacity < slot.bookedCount) {
      throw conflict(`Нельзя уменьшить вместимость ниже занятых мест (${slot.bookedCount})`);
    }

    await db
      .update(schedules)
      .set({
        ...(input.startsAt !== undefined ? { startsAt: input.startsAt } : {}),
        ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      })
      .where(eq(schedules.id, id));
    return ok(c, { id });
  })

  .delete('/:id', async (c) => {
    const id = c.req.param('id');
    const db = c.get('db');
    const slot = await db.query.schedules.findFirst({ where: eq(schedules.id, id) });
    if (!slot) throw notFound('Слот расписания не найден');

    const [active] = await db
      .select({ total: count() })
      .from(bookings)
      .where(and(eq(bookings.scheduleId, id), inArray(bookings.status, ['pending', 'confirmed'])));

    if ((active?.total ?? 0) > 0) {
      // На слот есть живые брони — только закрытие, физически не удаляем.
      await db.update(schedules).set({ status: 'cancelled' }).where(eq(schedules.id, id));
      return ok(c, { id, cancelled: true });
    }

    await db.delete(schedules).where(eq(schedules.id, id));
    return ok(c, { id, deleted: true });
  });
