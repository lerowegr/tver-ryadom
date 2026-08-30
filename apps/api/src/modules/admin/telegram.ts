import { Hono } from 'hono';
import type { AppEnv } from '../../env';
import { validationError } from '../../lib/errors';
import { ok } from '../../lib/respond';
import { botStatus, configureBot, disableBot } from '../bot/setup';

/** Подключение и состояние Telegram-бота. Токен наружу не отдаётся никогда. */
export const adminTelegramRoutes = new Hono<AppEnv>()
  .get('/', async (c) => ok(c, await botStatus(c.get('db'), c.env)))

  .post('/setup', async (c) => {
    try {
      const origin = new URL(c.req.url).origin;
      return ok(c, await configureBot(c.get('db'), c.env, origin));
    } catch (error) {
      throw validationError(error instanceof Error ? error.message : 'Не удалось подключить бота');
    }
  })

  .post('/disable', async (c) => {
    try {
      return ok(c, await disableBot(c.get('db'), c.env));
    } catch (error) {
      throw validationError(error instanceof Error ? error.message : 'Не удалось отключить бота');
    }
  });
