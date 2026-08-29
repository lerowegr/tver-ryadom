/**
 * Подготовка размеров изображения в браузере.
 *
 * Ресайз делается здесь, а не в Workers: там он потребовал бы WASM-кодек и
 * упирался бы в лимит процессорного времени, тогда как у загружающего картинка
 * и так уже в памяти. На выходе WebP — он заметно легче JPEG при том же виде.
 */

export interface ImageVariants {
  hero: Blob;
  card: Blob;
  thumb: Blob;
}

/** Ширины по назначению: страница экскурсии, карточка каталога, превью в админке. */
const WIDTHS = { hero: 1600, card: 900, thumb: 400 } as const;
/** Крупному размеру качество выше: его разглядывают, мелкие только узнают. */
const QUALITY = { hero: 0.82, card: 0.78, thumb: 0.75 } as const;

function draw(source: ImageBitmap | HTMLCanvasElement, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Браузер не дал холст для обработки изображения');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

/**
 * Уменьшение в несколько шагов. За один шаг браузер сильно ужимает картинку
 * грубо: тонкие детали рассыпаются в «лесенку». Половинками — заметно чище.
 */
function downscale(bitmap: ImageBitmap, targetWidth: number): HTMLCanvasElement | ImageBitmap {
  if (bitmap.width <= targetWidth) return bitmap;

  let current: ImageBitmap | HTMLCanvasElement = bitmap;
  let width = bitmap.width;
  let height = bitmap.height;

  while (width / 2 > targetWidth) {
    width = Math.round(width / 2);
    height = Math.round(height / 2);
    current = draw(current, width, height);
  }

  const scale = targetWidth / width;
  return draw(current, targetWidth, Math.round(height * scale));
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Не удалось сжать изображение'))),
      'image/webp',
      quality,
    );
  });
}

export async function makeVariants(file: File): Promise<ImageVariants> {
  const bitmap = await createImageBitmap(file);
  try {
    const result = {} as Record<keyof typeof WIDTHS, Blob>;
    for (const [name, width] of Object.entries(WIDTHS) as [keyof typeof WIDTHS, number][]) {
      const scaled = downscale(bitmap, width);
      const canvas =
        scaled instanceof HTMLCanvasElement ? scaled : draw(scaled, scaled.width, scaled.height);
      const blob = await toBlob(canvas, QUALITY[name]);

      // Если исходник уже меньше целевой ширины, пережатие может дать файл
      // тяжелее оригинала — тогда оригинал и оставляем.
      result[name] =
        bitmap.width <= width && blob.size >= file.size ? file : blob;
    }
    return result as ImageVariants;
  } finally {
    bitmap.close();
  }
}

/** Человекочитаемый размер — показываем экономию после сжатия. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}
