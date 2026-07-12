'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { TOUR_STATUSES, TOUR_STATUS_LABELS, formatDuration, type Paginated, type TourStatus } from '@tver/shared';
import { useState } from 'react';
import { authFetch } from '@/lib/api';
import { formatPrice } from '@/lib/format';
import type { AdminTourListItem } from '@/lib/types';
import { Card, Empty, Loading, Table, TourStatusPill } from '@/components/ui';

export default function ToursPage() {
  const [status, setStatus] = useState<TourStatus | ''>('');

  const tours = useQuery({
    queryKey: ['admin-tours', status],
    queryFn: () =>
      authFetch<Paginated<AdminTourListItem>>(`/admin/tours?limit=50${status ? `&status=${status}` : ''}`),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-ink-900 text-2xl font-bold">Экскурсии</h1>
        <div className="flex items-center gap-3">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as TourStatus | '')}
            className="input w-auto"
            aria-label="Фильтр по статусу"
          >
            <option value="">Все статусы</option>
            {TOUR_STATUSES.map((s) => (
              <option key={s} value={s}>
                {TOUR_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <Link href="/tours/new" className="btn-primary">
            + Новая экскурсия
          </Link>
        </div>
      </div>

      <Card>
        {tours.isLoading ? (
          <Loading />
        ) : (tours.data?.items.length ?? 0) === 0 ? (
          <Empty text="Экскурсий нет — создайте первую" />
        ) : (
          <Table head={['Название', 'Слаг', 'Цена', 'Длительность', 'Рейтинг', 'Статус']}>
            {tours.data?.items.map((tour) => (
              <tr key={tour.id}>
                <td className="py-3 pr-4">
                  <Link href={`/tours/${tour.id}`} className="text-ink-900 hover:text-terra-600 font-semibold">
                    {tour.title}
                  </Link>
                </td>
                <td className="text-bark-600 py-3 pr-4 text-xs">{tour.slug}</td>
                <td className="py-3 pr-4 font-semibold whitespace-nowrap">
                  {formatPrice(tour.price)}
                  <span className="text-bark-500 ml-1 text-xs font-normal">
                    {tour.priceType === 'per_person' ? '/чел' : '/группа'}
                  </span>
                </td>
                <td className="text-bark-700 py-3 pr-4 whitespace-nowrap">
                  {formatDuration(tour.durationMinutes)}
                </td>
                <td className="text-bark-700 py-3 pr-4">
                  {tour.ratingCount > 0 ? `${tour.ratingAvg.toFixed(1)} (${tour.ratingCount})` : '—'}
                </td>
                <td className="py-3">
                  <TourStatusPill status={tour.status} />
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
