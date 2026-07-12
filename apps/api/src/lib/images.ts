import type { Context } from 'hono';
import type { AppEnv } from '../env';

/** База публичных URL картинок: env-переменная или текущий хост API. */
export function imagesBaseOf(c: Context<AppEnv>): string {
  if (c.env.IMAGES_BASE_URL) return c.env.IMAGES_BASE_URL.replace(/\/$/, '');
  return new URL('/images', c.req.url).toString();
}

export interface StoredImage {
  r2Key: string;
  alt: string | null;
  variants: Record<string, string>;
}

/** Превращает R2-ключи вариантов в абсолютные URL для клиента. */
export function toImageUrls<T extends StoredImage>(image: T, base: string): T {
  const url = (key: string) => `${base}/${encodeURI(key)}`;
  const variants: Record<string, string> = {};
  for (const [name, key] of Object.entries(image.variants ?? {})) {
    variants[name] = url(key);
  }
  if (!variants.original) variants.original = url(image.r2Key);
  variants.thumb ??= variants.original;
  variants.card ??= variants.original;
  variants.hero ??= variants.original;
  return { ...image, variants };
}
