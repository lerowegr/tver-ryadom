import { createDb, type Db } from '@tver/db';
import { seedDatabase } from '@tver/db/seed';
import { webhookCallback } from 'grammy';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppEnv } from './env';
import { AppError, notFound } from './lib/errors';
import { ok } from './lib/respond';
import { authenticate } from './middleware/auth';
import { adminRoutes } from './modules/admin/routes';
import { authRoutes } from './modules/auth/routes';
import { getBot } from './modules/bot/bot';
import { bookingRoutes } from './modules/bookings/routes';
import { contactRoutes } from './modules/contact/routes';
import { favoriteRoutes } from './modules/favorites/routes';
import { notificationRoutes } from './modules/notifications/routes';
import { reviewRoutes } from './modules/reviews/routes';
import { settingsRoutes } from './modules/settings/routes';
import { badgeRoutes, tourRoutes } from './modules/tours/routes';

export interface BuildAppOptions {
  /** Подмена БД в тестах; в проде берётся из биндинга D1. */
  db?: Db;
}

export function buildApp(options: BuildAppOptions = {}) {
  const app = new Hono<AppEnv>();

  // Структурированный лог запросов (Workers Logs).
  app.use('*', async (c, next) => {
    const started = Date.now();
    await next();
    console.log(
      JSON.stringify({
        method: c.req.method,
        path: new URL(c.req.url).pathname,
        status: c.res.status,
        ms: Date.now() - started,
      }),
    );
  });

  app.use('*', async (c, next) => {
    const origins = (c.env.CORS_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
    const middleware = cors({
      origin: (origin) => (origins.includes(origin) ? origin : undefined),
      credentials: true,
    });
    return middleware(c, next);
  });

  app.use('*', async (c, next) => {
    c.set('db', options.db ?? createDb(c.env.DB));
    await next();
  });

  app.use('*', authenticate);

  app.get('/health', (c) => ok(c, { status: 'ok' }));

  // Публичная раздача фотографий из R2 с иммутабельным кешированием на CDN.
  app.get('/images/*', async (c) => {
    const key = decodeURIComponent(c.req.path.replace(/^\/images\//, ''));
    if (!key || key.includes('..')) throw notFound();
    const object = await c.env.IMAGES.get(key);
    if (!object) throw notFound('Изображение не найдено');
    return c.body(object.body as unknown as ReadableStream, 200, {
      'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
      ETag: object.httpEtag,
    });
  });

  // Наполнение локальной базы демо-данными; в проде маршрут отвечает 404.
  app.post('/dev/seed', async (c) => {
    if (c.env.ENVIRONMENT !== 'development') throw notFound();
    await seedDatabase(c.get('db'));
    return ok(c, { seeded: true });
  });

  // Вебхук Telegram-бота; секрет в пути отсекает посторонние запросы.
  app.post('/webhook/telegram/:secret', async (c) => {
    if (
      !c.env.TELEGRAM_BOT_TOKEN ||
      !c.env.TELEGRAM_WEBHOOK_SECRET ||
      c.req.param('secret') !== c.env.TELEGRAM_WEBHOOK_SECRET
    ) {
      throw notFound();
    }
    const bot = getBot(c.env, c.get('db'));
    return webhookCallback(bot, 'hono')(c);
  });

  const api = new Hono<AppEnv>()
    .route('/auth', authRoutes)
    .route('/tours', tourRoutes)
    .route('/badges', badgeRoutes)
    .route('/bookings', bookingRoutes)
    .route('/reviews', reviewRoutes)
    .route('/favorites', favoriteRoutes)
    .route('/notifications', notificationRoutes)
    .route('/contact', contactRoutes)
    .route('/settings', settingsRoutes)
    .route('/admin', adminRoutes);

  app.route('/api/v1', api);

  app.notFound((c) =>
    c.json(
      { success: false, error: { code: 'not_found', message: 'Маршрут не найден' } } as const,
      404,
    ),
  );

  app.onError((err, c) => {
    if (err instanceof AppError) {
      return c.json(
        {
          success: false,
          error: {
            code: err.code,
            message: err.message,
            ...(err.details ? { details: err.details } : {}),
          },
        } as const,
        err.status,
      );
    }
    console.error('Unhandled error:', err);
    return c.json(
      {
        success: false,
        error: { code: 'internal_error', message: 'Внутренняя ошибка сервера' },
      } as const,
      500,
    );
  });

  return app;
}
