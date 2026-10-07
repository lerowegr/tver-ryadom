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

export const IMAGE_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type ImageContentType = (typeof IMAGE_CONTENT_TYPES)[number];

const EXT_BY_TYPE: Record<ImageContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Тип по магическим байтам, а не по `file.type` от клиента (P1/M3).
 * Возвращает null, если сигнатура не JPEG/PNG/WebP.
 */
export function detectImageType(bytes: Uint8Array): ImageContentType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

export interface CheckedImage {
  bytes: ArrayBuffer;
  contentType: ImageContentType;
  ext: string;
}

/**
 * Проверяет загруженный файл: размер и сигнатура. Content-Type для R2
 * берётся из сигнатуры, а не из заголовка клиента (P1/M3).
 */
export async function readCheckedImage(file: File, maxSize: number): Promise<CheckedImage> {
  if (file.size > maxSize) {
    throw new Error(`Файл больше ${Math.round(maxSize / 1024 / 1024)} МБ`);
  }
  const buffer = await file.arrayBuffer();
  const detected = detectImageType(new Uint8Array(buffer));
  if (!detected) throw new Error('Поддерживаются JPEG, PNG и WebP');
  if (file.type && (IMAGE_CONTENT_TYPES as readonly string[]).includes(file.type) && file.type !== detected) {
    throw new Error('Тип файла не совпадает с содержимым');
  }
  return { bytes: buffer, contentType: detected, ext: EXT_BY_TYPE[detected] };
}
