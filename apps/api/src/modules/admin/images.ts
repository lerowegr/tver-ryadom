import { tourImages, tours } from '@tver/db';
import { count, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../env';
import { notFound, validationError } from '../../lib/errors';
import { imagesBaseOf, toImageUrls } from '../../lib/images';
import { ok } from '../../lib/respond';
import { validate } from '../../middleware/validate';

const MAX_SIZE = 8 * 1024 * 1024;

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const patchSchema = z.object({
  alt: z.string().trim().max(300).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const adminImageRoutes = new Hono<AppEnv>()
  /**
   * Загрузка фото экскурсии (multipart/form-data, поле file).
   * Сейчас в R2 сохраняется оригинал; генерация thumb/card/hero-вариантов
   * (WASM-ресайз) — отдельная оптимизация на этапе деплоя.
   */
  .post('/tours/:tourId/images', async (c) => {
    const tourId = c.req.param('tourId');
    const db = c.get('db');
    const tour = await db.query.tours.findFirst({
      where: eq(tours.id, tourId),
      columns: { id: true, title: true },
    });
    if (!tour) throw notFound('Экскурсия не найдена');

    const form = await c.req.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) throw validationError('Приложите файл изображения в поле file');
    const ext = EXT_BY_TYPE[file.type];
    if (!ext) throw validationError('Поддерживаются JPEG, PNG и WebP');
    if (file.size > MAX_SIZE) throw validationError('Файл больше 8 МБ');

    const key = `tours/${tourId}/${crypto.randomUUID()}.${ext}`;
    await c.env.IMAGES.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type },
    });

    const [orderRow] = await db
      .select({ total: count() })
      .from(tourImages)
      .where(eq(tourImages.tourId, tourId));

    const altRaw = form?.get('alt');
    const image = {
      id: crypto.randomUUID(),
      tourId,
      r2Key: key,
      alt: typeof altRaw === 'string' && altRaw.trim() ? altRaw.trim() : tour.title,
      sortOrder: orderRow?.total ?? 0,
      variants: { original: key, thumb: key, card: key, hero: key },
    };
    await db.insert(tourImages).values(image);

    return ok(c, { ...toImageUrls(image, imagesBaseOf(c)), id: image.id }, 201);
  })

  .patch('/images/:id', validate('json', patchSchema), async (c) => {
    const id = c.req.param('id');
    const input = c.req.valid('json');
    const db = c.get('db');
    const image = await db.query.tourImages.findFirst({ where: eq(tourImages.id, id) });
    if (!image) throw notFound('Изображение не найдено');

    await db
      .update(tourImages)
      .set({
        ...(input.alt !== undefined ? { alt: input.alt } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      })
      .where(eq(tourImages.id, id));
    return ok(c, { id });
  })

  .delete('/images/:id', async (c) => {
    const id = c.req.param('id');
    const db = c.get('db');
    const image = await db.query.tourImages.findFirst({ where: eq(tourImages.id, id) });
    if (!image) throw notFound('Изображение не найдено');

    const keys = new Set<string>([image.r2Key, ...Object.values(image.variants ?? {})]);
    for (const key of keys) {
      await c.env.IMAGES.delete(key);
    }
    await db.delete(tourImages).where(eq(tourImages.id, id));
    return ok(c, { deleted: true });
  });
