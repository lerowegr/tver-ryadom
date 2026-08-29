'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Paginated, ReviewStatus } from '@tver/shared';
import { useState } from 'react';
import { authFetch } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { AdminReview, AdminTourListItem } from '@/lib/types';
import { Card, Empty, Loading, QueryError, ReviewStatusPill } from '@/components/ui';

const tabs: { key: ReviewStatus | ''; label: string }[] = [
  { key: 'pending', label: 'На модерации' },
  { key: 'approved', label: 'Одобренные' },
  { key: 'rejected', label: 'Отклонённые' },
  { key: '', label: 'Все' },
];

export default function ReviewsPage() {
  const [status, setStatus] = useState<ReviewStatus | ''>('pending');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Список экскурсий нужен для выбора в форме добавления.
  const tours = useQuery({
    queryKey: ['admin-tours', 'for-review'],
    queryFn: () => authFetch<Paginated<AdminTourListItem>>('/admin/tours?limit=50'),
    enabled: adding,
  });

  const addReview = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      authFetch('/admin/reviews', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      setAdding(false);
      setAddError(null);
      queryClient.invalidateQueries({ queryKey: ['admin-reviews'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
    onError: (err) => setAddError(err instanceof Error ? err.message : 'Не удалось сохранить отзыв'),
  });

  const onAdd = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    addReview.mutate({
      tourId: String(form.get('tourId') ?? ''),
      authorName: String(form.get('authorName') ?? '').trim(),
      rating: Number(form.get('rating') ?? 5),
      text: String(form.get('text') ?? '').trim(),
      status: 'approved',
    });
  };

  const reviews = useQuery({
    queryKey: ['admin-reviews', status],
    queryFn: () =>
      authFetch<Paginated<AdminReview>>(`/admin/reviews?limit=50${status ? `&status=${status}` : ''}`),
  });

  const moderate = useMutation({
    mutationFn: ({ id, next }: { id: string; next: ReviewStatus }) =>
      authFetch(`/admin/reviews/${id}`, { method: 'PATCH', body: JSON.stringify({ status: next }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-reviews'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-ink text-[1.75rem] leading-tight">Отзывы</h1>
        <button onClick={() => setAdding((v) => !v)} className="btn-secondary">
          {adding ? 'Отмена' : '+ Добавить отзыв'}
        </button>
      </div>

      {adding ? (
        <Card title="Новый отзыв">
          <p className="text-muted mb-5 text-sm leading-relaxed">
            Для отзывов, которые пришли в мессенджере или по телефону. Публикуется сразу — модерация
            собственной записи не нужна.
          </p>
          <form onSubmit={onAdd} className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block">
                <span className="kicker-plain mb-2 block">Экскурсия</span>
                <select name="tourId" required className="input" disabled={tours.isLoading}>
                  {tours.data?.items.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="kicker-plain mb-2 block">Оценка</span>
                <select name="rating" defaultValue="5" className="input">
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block">
              <span className="kicker-plain mb-2 block">Имя автора</span>
              <input name="authorName" required minLength={2} className="input" placeholder="Мария" />
            </label>
            <label className="block">
              <span className="kicker-plain mb-2 block">Текст отзыва</span>
              <textarea name="text" required minLength={10} rows={4} className="input" />
            </label>
            {addError ? (
              <p className="border-danger text-danger border-l-2 py-2 pl-4 text-sm" role="alert">
                {addError}
              </p>
            ) : null}
            <button type="submit" disabled={addReview.isPending} className="btn-primary">
              {addReview.isPending ? 'Сохраняем…' : 'Опубликовать отзыв'}
            </button>
          </form>
        </Card>
      ) : null}

      <div className="bg-surface-soft inline-flex p-1" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={status === t.key}
            onClick={() => setStatus(t.key)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              status === t.key ? 'text-ink bg-white' : 'text-muted'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {reviews.isLoading ? (
        <Loading />
      ) : reviews.isError ? (
        <QueryError error={reviews.error} retry={() => reviews.refetch()} />
      ) : (reviews.data?.items.length ?? 0) === 0 ? (
        <Card>
          <Empty text="Отзывов нет" />
        </Card>
      ) : (
        <div className="space-y-4">
          {reviews.data?.items.map((review) => (
            <Card key={review.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-ink font-medium">
                    {review.authorName}
                    <span className="text-ink ml-3">{'★'.repeat(review.rating)}</span>
                    <span className="text-line-strong">{'★'.repeat(5 - review.rating)}</span>
                  </p>
                  <p className="text-muted mt-0.5 text-xs">
                    {review.tour.title} · {formatDateTime(review.createdAt)}
                  </p>
                </div>
                <ReviewStatusPill status={review.status} />
              </div>
              <p className="text-ink-soft mt-3 text-sm leading-relaxed">{review.text}</p>
              <div className="mt-4 flex gap-2">
                {review.status !== 'approved' ? (
                  <button
                    onClick={() => moderate.mutate({ id: review.id, next: 'approved' })}
                    disabled={moderate.isPending}
                    className="btn-primary !px-4 !py-2 text-xs"
                  >
                    Одобрить
                  </button>
                ) : null}
                {review.status !== 'rejected' ? (
                  <button
                    onClick={() => moderate.mutate({ id: review.id, next: 'rejected' })}
                    disabled={moderate.isPending}
                    className="btn-danger !px-4 !py-2 text-xs"
                  >
                    Отклонить
                  </button>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
