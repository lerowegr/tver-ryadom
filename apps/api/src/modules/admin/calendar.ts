import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../env';
import { ok } from '../../lib/respond';
import { validate } from '../../middleware/validate';
import { ensureFeedToken, loadRange, rotateFeedToken } from '../calendar/service';

/** Больше года за раз не отдаём: это уже не календарь, а выгрузка. */
const MAX_DAYS = 400;

const rangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Дата в формате ГГГГ-ММ-ДД'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Дата в формате ГГГГ-ММ-ДД'),
});

export const adminCalendarRoutes = new Hono<AppEnv>()
  .get('/', validate('query', rangeSchema), async (c) => {
    const { from, to } = c.req.valid('query');
    // Границы берём по местному времени сервера ровно как есть: сутки «до»
    // включаем целиком, иначе вечерние слоты последнего дня выпадали бы.
    const start = new Date(`${from}T00:00:00.000Z`);
    const end = new Date(`${to}T23:59:59.999Z`);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return ok(c, { entries: [] });
    }
    const days = (end.getTime() - start.getTime()) / 86_400_000;
    if (days > MAX_DAYS) return ok(c, { entries: [] });

    const entries = await loadRange(c.get('db'), start, end);
    return ok(c, { entries });
  })

  .get('/feed', async (c) => {
    const token = await ensureFeedToken(c.get('db'));
    return ok(c, { token, url: feedUrl(c.req.url, token) });
  })

  .post('/feed/rotate', async (c) => {
    const token = await rotateFeedToken(c.get('db'));
    return ok(c, { token, url: feedUrl(c.req.url, token) });
  });

/** Публичный адрес ленты на том же домене, где живёт API. */
function feedUrl(requestUrl: string, token: string): string {
  return `${new URL(requestUrl).origin}/calendar/${token}.ics`;
}
