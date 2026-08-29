'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { ApiRequestError, authFetch } from '@/lib/api';
import { formatBytes, makeVariants } from '@/lib/image';
import type { AdminImage } from '@/lib/types';
import { Card, Empty } from '@/components/ui';

export function TourImages({ tourId, images }: { tourId: string; images: AdminImage[] }) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-tour', tourId] });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      // Размеры готовим здесь: сервер их только раскладывает по хранилищу.
      const variants = await makeVariants(file);
      const form = new FormData();
      form.append('hero', variants.hero, 'hero.webp');
      form.append('card', variants.card, 'card.webp');
      form.append('thumb', variants.thumb, 'thumb.webp');

      const total = variants.hero.size + variants.card.size + variants.thumb.size;
      setSaved(
        `${file.name}: ${formatBytes(file.size)} → ${formatBytes(total)} на три размера`,
      );

      return authFetch(`/admin/tours/${tourId}/images`, { method: 'POST', body: form });
    },
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (err) =>
      setError(err instanceof ApiRequestError ? err.message : 'Не удалось загрузить файл'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => authFetch(`/admin/images/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  return (
    <Card
      title="Фотографии"
      action={
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(e) => {
              for (const file of Array.from(e.target.files ?? [])) upload.mutate(file);
              e.target.value = '';
            }}
          />
          <button onClick={() => fileRef.current?.click()} disabled={upload.isPending} className="btn-secondary">
            {upload.isPending ? 'Загружаем…' : '+ Загрузить фото'}
          </button>
        </>
      }
    >
      {saved && !error ? (
        <p className="text-muted mb-4 text-xs" role="status">
          {saved}
        </p>
      ) : null}
      {error ? (
        <p className="border-danger text-danger mb-4 border-l-2 py-2 pl-4 text-sm" role="alert">
          {error}
        </p>
      ) : null}
      {images.length === 0 ? (
        <Empty text="Фотографий пока нет. Первая загруженная станет обложкой карточки." />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((image) => (
            <figure key={image.id} className="group relative overflow-hidden">
              {/* Готовые R2-варианты, next/image не нужен */}
              <img
                src={image.variants.card ?? image.variants.original}
                alt={image.alt ?? ''}
                className="bg-surface-soft h-32 w-full object-cover"
              />
              <button
                onClick={() => {
                  if (window.confirm('Удалить фотографию?')) remove.mutate(image.id);
                }}
                className="bg-ink/80 absolute top-2 right-2 px-2.5 py-1 text-xs font-medium text-bg opacity-0 transition group-hover:opacity-100"
              >
                Удалить
              </button>
            </figure>
          ))}
        </div>
      )}
    </Card>
  );
}
