import { idSchema, paginationSchema } from '@tver/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../env';
import { ok } from '../../lib/respond';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { listNotifications, markNotificationsRead } from './service';

const markReadSchema = z.object({
  /** Без ids помечаются прочитанными все уведомления. */
  ids: z.array(idSchema).max(100).optional(),
});

export const notificationRoutes = new Hono<AppEnv>()
  .use('*', requireAuth)

  .get('/', validate('query', paginationSchema), async (c) => {
    const user = c.get('user')!;
    const pagination = c.req.valid('query');
    const result = await listNotifications(c.get('db'), user.id, pagination);
    return ok(c, {
      items: result.items,
      total: result.total,
      unread: result.unread,
      page: pagination.page,
      limit: pagination.limit,
      pages: Math.max(1, Math.ceil(result.total / pagination.limit)),
    });
  })

  .post('/read', validate('json', markReadSchema), async (c) => {
    const user = c.get('user')!;
    await markNotificationsRead(c.get('db'), user.id, c.req.valid('json').ids);
    return ok(c, { read: true });
  });
