import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../env';
import { ok } from '../../lib/respond';
import { validate } from '../../middleware/validate';
import { maxConfig, saveMaxSettings } from '../channels/max';
import { saveVkSettings, vkConfig } from '../channels/vk';
import { botStatus } from '../bot/setup';

/** Состояние всех каналов разом: Telegram, ВКонтакте и MAX. */
export const adminChannelRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const db = c.get('db');
    const [telegram, vk, max] = await Promise.all([
      botStatus(db, c.env),
      vkConfig(db, c.env),
      maxConfig(db, c.env),
    ]);
    return ok(c, { telegram, vk, max });
  })

  .put(
    '/vk',
    validate(
      'json',
      z.object({
        confirmation: z.string().trim().max(100).optional(),
        secret: z.string().trim().max(200).optional(),
      }),
    ),
    async (c) => {
      await saveVkSettings(c.get('db'), c.req.valid('json'));
      return ok(c, await vkConfig(c.get('db'), c.env));
    },
  )

  .put(
    '/max',
    validate(
      'json',
      z.object({
        apiBase: z.string().trim().max(300).optional(),
        sendMethod: z.string().trim().max(100).optional(),
        secret: z.string().trim().max(200).optional(),
      }),
    ),
    async (c) => {
      await saveMaxSettings(c.get('db'), c.req.valid('json'));
      return ok(c, await maxConfig(c.get('db'), c.env));
    },
  );
