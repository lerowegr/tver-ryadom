'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Paginated, ReviewStatus } from '@tver/shared';
import { useState } from 'react';
import { authFetch } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { AdminReview } from '@/lib/types';
import { Card, Empty, Loading, QueryError, ReviewStatusPill } from '@/components/ui';

const tabs: { key: ReviewStatus | ''; label: string }[] = [
  { key: 'pending', label: 'На модерации' },
  { key: 'approved', label: 'Одобренные' },
  { key: 'rejected', label: 'Отклонённые' },
  { key: '', label: 'Все' },
];

export default function ReviewsPage() {
  const [status, setStatus] = useState<ReviewStatus | ''>('pending');
  const queryClient = useQueryClient();

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
      <h1 className="text-ink-900 text-2xl font-bold">Отзывы</h1>

      <div className="bg-cream-200 inline-flex rounded-full p-1" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={status === t.key}
            onClick={() => setStatus(t.key)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              status === t.key ? 'shadow-card text-ink-900 bg-white' : 'text-bark-600'
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
                  <p className="text-ink-900 font-bold">
                    {review.authorName}
                    <span className="text-terra-600 ml-3">{'★'.repeat(review.rating)}</span>
                    <span className="text-sand-300">{'★'.repeat(5 - review.rating)}</span>
                  </p>
                  <p className="text-bark-600 mt-0.5 text-xs">
                    {review.tour.title} · {formatDateTime(review.createdAt)}
                  </p>
                </div>
                <ReviewStatusPill status={review.status} />
              </div>
              <p className="text-bark-800 mt-3 text-sm leading-relaxed">{review.text}</p>
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
