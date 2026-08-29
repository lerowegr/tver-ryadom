'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Сторона готового квадрата, который уходит на сервер. */
const OUTPUT = 512;
/** Сторона рамки кадрирования на экране. */
const FRAME = 288;
const MAX_ZOOM = 3;

interface Loaded {
  el: HTMLImageElement;
  width: number;
  height: number;
  /** Масштаб, при котором картинка ровно закрывает рамку. */
  cover: number;
}

/**
 * Кадрирование аватара.
 *
 * Картинка выкладывается обычным позиционированием, без CSS-трансформаций:
 * те же четыре числа (сдвиг и размер) потом передаются в canvas один в один,
 * поэтому результат совпадает с тем, что человек видел в рамке.
 */
export function AvatarEditor({
  onSave,
  onCancel,
  busy,
}: {
  onSave: (blob: Blob) => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const [image, setImage] = useState<Loaded | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [error, setError] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    return () => {
      if (image) URL.revokeObjectURL(image.el.src);
    };
  }, [image]);

  const pick = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Нужен файл изображения');
      return;
    }
    const el = new Image();
    el.onload = () => {
      setError(null);
      setImage({
        el,
        width: el.naturalWidth,
        height: el.naturalHeight,
        cover: Math.max(FRAME / el.naturalWidth, FRAME / el.naturalHeight),
      });
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    };
    el.onerror = () => setError('Не удалось открыть изображение');
    el.src = URL.createObjectURL(file);
  };

  /** Не даём утащить картинку так, чтобы в рамке появилась пустота. */
  const clamp = useCallback(
    (next: { x: number; y: number }, scale: number) => {
      if (!image) return next;
      const w = image.width * scale;
      const h = image.height * scale;
      const limitX = Math.max(0, (w - FRAME) / 2);
      const limitY = Math.max(0, (h - FRAME) / 2);
      return {
        x: Math.min(limitX, Math.max(-limitX, next.x)),
        y: Math.min(limitY, Math.max(-limitY, next.y)),
      };
    },
    [image],
  );

  const scale = image ? image.cover * zoom : 1;

  useEffect(() => {
    setOffset((prev) => clamp(prev, scale));
  }, [scale, clamp]);

  const onPointerDown = (event: React.PointerEvent) => {
    if (!image) return;
    (event.target as Element).setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!drag.current) return;
    const next = {
      x: drag.current.ox + (event.clientX - drag.current.x),
      y: drag.current.oy + (event.clientY - drag.current.y),
    };
    setOffset(clamp(next, scale));
  };

  const endDrag = () => {
    drag.current = null;
  };

  const save = () => {
    if (!image) return;
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setError('Браузер не дал холст для обрезки');
      return;
    }

    const ratio = OUTPUT / FRAME;
    const w = image.width * scale;
    const h = image.height * scale;
    const left = FRAME / 2 + offset.x - w / 2;
    const top = FRAME / 2 + offset.y - h / 2;

    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image.el, left * ratio, top * ratio, w * ratio, h * ratio);
    canvas.toBlob(
      (blob) => (blob ? onSave(blob) : setError('Не удалось сохранить обрезку')),
      'image/webp',
      0.85,
    );
  };

  const w = image ? image.width * scale : 0;
  const h = image ? image.height * scale : 0;

  return (
    <div className="border-line border p-6">
      <p className="kicker-plain text-faint mb-5">Фото профиля</p>

      {!image ? (
        <label className="border-line hover:border-ink flex h-40 cursor-pointer items-center justify-center border border-dashed transition-colors duration-500">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => pick(e.target.files?.[0])}
          />
          <span className="text-muted text-sm">Выбрать изображение</span>
        </label>
      ) : (
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          <div>
            <div
              className="bg-surface-soft relative touch-none overflow-hidden select-none"
              style={{ width: FRAME, height: FRAME, cursor: drag.current ? 'grabbing' : 'grab' }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <img
                src={image.el.src}
                alt=""
                draggable={false}
                className="absolute max-w-none"
                style={{
                  width: w,
                  height: h,
                  left: FRAME / 2 + offset.x - w / 2,
                  top: FRAME / 2 + offset.y - h / 2,
                }}
              />

              {/* Сетка третей — помогает выровнять кадр по лицу */}
              <div className="pointer-events-none absolute inset-0" aria-hidden>
                <span className="absolute top-0 bottom-0 left-1/3 w-px bg-white/45" />
                <span className="absolute top-0 bottom-0 left-2/3 w-px bg-white/45" />
                <span className="absolute top-1/3 right-0 left-0 h-px bg-white/45" />
                <span className="absolute top-2/3 right-0 left-0 h-px bg-white/45" />
                <span className="absolute inset-0 border border-white/60" />
              </div>
            </div>

            <label className="mt-5 block">
              <span className="kicker-plain text-faint mb-2 block">Масштаб</span>
              <input
                type="range"
                min={1}
                max={MAX_ZOOM}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="accent-ink w-full"
              />
            </label>
          </div>

          <div className="flex-1 space-y-4">
            <p className="text-muted text-sm leading-relaxed">
              Перетащите фото внутри рамки и подберите масштаб. Линии — трети кадра: по ним удобно
              выровнять лицо. Сохранится квадрат {OUTPUT}×{OUTPUT}.
            </p>
            {error ? <p className="field-error">{error}</p> : null}
            <div className="flex flex-wrap gap-4">
              <button
                type="button"
                onClick={save}
                disabled={busy}
                className="bg-ink text-bg hover:bg-ink-soft cursor-pointer px-8 py-4 text-[0.6875rem] font-medium tracking-[0.18em] uppercase transition-colors duration-500 disabled:opacity-40"
              >
                {busy ? 'Сохраняем…' : 'Сохранить фото'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setImage(null);
                  onCancel();
                }}
                className="link-underline text-muted hover:text-ink cursor-pointer text-[0.6875rem] font-medium tracking-[0.18em] uppercase"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {!image && error ? <p className="field-error mt-3">{error}</p> : null}
    </div>
  );
}
