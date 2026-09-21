import { availabilityBlockCreateSchema, availabilityRangeSchema, mskDateSchema } from '@tver/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../env';
import { ok } from '../../lib/respond';
import { validate } from '../../middleware/validate';
import { addBlocks, listBlocks, openDay, removeBlock } from '../availability/service';

/** Закрытие дней и часов: отпуск, отъезд, экскурсии, проданные на других площадках. */
export const adminAvailabilityRoutes = new Hono<AppEnv>()
  .get('/', validate('query', availabilityRangeSchema), async (c) => {
    const { from, to } = c.req.valid('query');
    return ok(c, { blocks: await listBlocks(c.get('db'), from, to) });
  })

  .post('/', validate('json', availabilityBlockCreateSchema), async (c) => {
    const blocks = await addBlocks(c.get('db'), c.req.valid('json'));
    return ok(c, { blocks }, 201);
  })

  .delete('/day/:date', async (c) => {
    const date = mskDateSchema.parse(c.req.param('date'));
    await openDay(c.get('db'), date);
    return ok(c, { ok: true });
  })

  .delete('/:id', validate('param', z.object({ id: z.string().min(1) })), async (c) => {
    await removeBlock(c.get('db'), c.req.valid('param').id);
    return ok(c, { ok: true });
  });
