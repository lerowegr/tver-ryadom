import { contactRequests } from '@tver/db';
import { contactRequestSchema } from '@tver/shared';
import { Hono } from 'hono';
import type { AppEnv } from '../../env';
import { ok } from '../../lib/respond';
import { validate } from '../../middleware/validate';
import { notifyAdmins } from '../notifications/dispatch';

export const contactRoutes = new Hono<AppEnv>().post(
  '/',
  validate('json', contactRequestSchema),
  async (c) => {
    const input = c.req.valid('json');
    const id = crypto.randomUUID();
    await c.get('db').insert(contactRequests).values({
      id,
      name: input.name,
      phone: input.phone ?? null,
      email: input.email ?? null,
      message: input.message,
    });
    await notifyAdmins(c.get('db'), 'admin_new_request', {
      contactName: input.name,
      contactPhone: input.phone,
      message: input.message,
    });
    return ok(c, { id, received: true }, 201);
  },
);
