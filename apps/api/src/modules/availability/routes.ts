import { availabilityRangeSchema } from '@tver/shared';
import { Hono } from 'hono';
import type { AppEnv } from '../../env';
import { ok } from '../../lib/respond';
import { validate } from '../../middleware/validate';
import { listBlocks } from './service';

/**
 * Занятость для формы бронирования.
 *
 * Отдаём только даты и часы: пометки вроде «отпуск» или «экскурсия со
 * Спутника» — это заметки для себя, и гостям их видеть незачем.
 */
export const availabilityRoutes = new Hono<AppEnv>().get(
  '/',
  validate('query', availabilityRangeSchema),
  async (c) => {
    const { from, to } = c.req.valid('query');
    const blocks = await listBlocks(c.get('db'), from, to);
    return ok(c, {
      blocks: blocks.map((block) => ({
        date: block.date,
        startTime: block.startTime,
        endTime: block.endTime,
      })),
    });
  },
);
