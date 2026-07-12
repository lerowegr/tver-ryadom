'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { ApiRequestError, authFetch } from '@/lib/api';
import type { AdminImage } from '@/lib/types';
import { Card, Empty } from '@/components/ui';

export function TourImages({ tourId, images }: { tourId: string; images: AdminImage[] }) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-tour', tourId] });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
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
      {error ? (
        <p className="bg-terra-500/10 text-terra-700 mb-4 rounded-xl px-4 py-3 text-sm font-medium" role="alert">
          {error}
        </p>
      ) : null}
      {images.length === 0 ? (
        <Empty text="Фотографий пока нет. Первая загруженная станет обложкой карточки." />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((image) => (
            <figure key={image.id} className="group relative overflow-hidden rounded-xl">
              {/* Готовые R2-варианты, next/image не нужен */}
              <img
                src={image.variants.card ?? image.variants.original}
                alt={image.alt ?? ''}
                className="bg-cream-200 h-32 w-full object-cover"
              />
              <button
                onClick={() => {
                  if (window.confirm('Удалить фотографию?')) remove.mutate(image.id);
                }}
                className="bg-ink-900/70 absolute top-2 right-2 rounded-full px-2.5 py-1 text-xs font-bold text-white opacity-0 transition group-hover:opacity-100"
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
