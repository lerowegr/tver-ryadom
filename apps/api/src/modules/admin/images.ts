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
   * Загрузка фото экскурсии (multipart/form-data).
   *
   * Размеры готовит браузер и присылает их полями hero/card/thumb: в Workers
   * ресайз потребовал бы WASM-кодек и упёрся бы в лимит процессорного времени,
   * а у загружающего изображение и так уже в памяти. Поле file остаётся для
   * совместимости — если вариантов нет, оригинал кладётся во все размеры.
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
    if (!form) throw validationError('Ожидается multipart/form-data');

    const folder = `tours/${tourId}`;
    const variants: Record<string, string> = {};

    /** Кладёт файл в R2 и возвращает ключ. */
    const store = async (file: File, name: string): Promise<string> => {
      const ext = EXT_BY_TYPE[file.type];
      if (!ext) throw validationError('Поддерживаются JPEG, PNG и WebP');
      if (file.size > MAX_SIZE) throw validationError('Файл больше 8 МБ');
      const key = `${folder}/${crypto.randomUUID()}-${name}.${ext}`;
      await c.env.IMAGES.put(key, await file.arrayBuffer(), {
        httpMetadata: { contentType: file.type },
      });
      return key;
    };

    for (const name of ['hero', 'card', 'thumb'] as const) {
      const part = form.get(name);
      if (part instanceof File && part.size > 0) variants[name] = await store(part, name);
    }

    const original = form.get('file');
    if (original instanceof File && original.size > 0) {
      variants.original = await store(original, 'original');
    }

    // Основной ключ — самый крупный доступный размер.
    const primary = variants.hero ?? variants.original ?? variants.card ?? variants.thumb;
    if (!primary) throw validationError('Приложите изображение');
    variants.original ??= primary;
    variants.hero ??= primary;
    variants.card ??= variants.hero;
    variants.thumb ??= variants.card;

    const [orderRow] = await db
      .select({ total: count() })
      .from(tourImages)
      .where(eq(tourImages.tourId, tourId));

    const altRaw = form.get('alt');
    const image = {
      id: crypto.randomUUID(),
      tourId,
      r2Key: primary,
      alt: typeof altRaw === 'string' && altRaw.trim() ? altRaw.trim() : tour.title,
      sortOrder: orderRow?.total ?? 0,
      variants,
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
