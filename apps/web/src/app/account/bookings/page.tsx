'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BOOKING_STATUS_LABELS, type BookingStatus, type Paginated } from '@tver/shared';
import { useState } from 'react';
import { ClockIcon, UsersIcon } from '@/components/ui/icons';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { ApiRequestError } from '@/lib/api';
import { authFetch } from '@/lib/auth';
import { formatDateTime, formatPrice } from '@/lib/format';
import type { MyBookingDto } from '@/lib/types';

type Tab = 'upcoming' | 'past' | 'all';

const tabs: { key: Tab; label: string }[] = [
  { key: 'upcoming', label: 'Предстоящие' },
  { key: 'past', label: 'Прошедшие' },
  { key: 'all', label: 'Все' },
];

const statusStyles: Record<BookingStatus, string> = {
  pending: 'bg-sand-200 text-bark-800',
  confirmed: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-cream-200 text-bark-600',
  completed: 'bg-bark-600/10 text-bark-800',
};

function queryFor(tab: Tab): string {
  if (tab === 'upcoming') return '&upcoming=true';
  if (tab === 'past') return '&upcoming=false';
  return '';
}

export default function BookingsPage() {
  const [tab, setTab] = useState<Tab>('upcoming');
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const bookings = useQuery({
    queryKey: ['bookings', tab],
    queryFn: () => authFetch<Paginated<MyBookingDto>>(`/bookings/my?limit=50${queryFor(tab)}`),
  });

  const cancel = useMutation({
    mutationFn: ({ id, why }: { id: string; why: string }) =>
      authFetch(`/bookings/${id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: why || undefined }),
      }),
    onSuccess: () => {
      setCancelId(null);
      setReason('');
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (err) =>
      setError(err instanceof ApiRequestError ? err.message : 'Не удалось отменить бронирование'),
  });

  const canCancel = (b: MyBookingDto) =>
    (b.status === 'pending' || b.status === 'confirmed') &&
    (!b.startsAt || new Date(b.startsAt).getTime() > Date.now());

  return (
    <div>
      <SegmentedTabs
        className="mb-6"
        ariaLabel="Фильтр броней"
        value={tab}
        onChange={setTab}
        options={tabs.map((t) => ({ value: t.key, label: t.label }))}
      />

      {bookings.isLoading ? (
        <p className="text-bark-600 animate-pulse py-10 text-center">Загружаем брони…</p>
      ) : (bookings.data?.items.length ?? 0) === 0 ? (
        <div className="glass rounded-3xl p-10 text-center">
          <p className="text-ink-900 text-lg font-semibold">Здесь пока пусто</p>
          <p className="text-bark-700 mt-2 text-sm">
            {tab === 'upcoming' ? 'Нет предстоящих экскурсий — самое время выбрать!' : 'Броней не найдено.'}
          </p>
          <Link
            href="/excursions"
            className="bg-terra-500 hover:bg-terra-600 mt-6 inline-block rounded-full px-7 py-3 text-sm font-semibold text-white transition"
          >
            К экскурсиям
          </Link>
        </div>
      ) : (
        <ul className="space-y-4">
          {bookings.data?.items.map((booking) => (
            <li key={booking.id} className="shadow-card rounded-3xl bg-white p-6 md:p-7">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <span
                    className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${statusStyles[booking.status]}`}
                  >
                    {BOOKING_STATUS_LABELS[booking.status]}
                  </span>
                  <h3 className="text-ink-900 mt-3 text-lg font-bold">
                    {booking.tour ? (
                      <Link href={`/excursions/${booking.tour.slug}`} className="hover:text-terra-600">
                        {booking.tour.title}
                      </Link>
                    ) : (
                      'Экскурсия недоступна'
                    )}
                  </h3>
                  <div className="text-bark-700 mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                    <span className="flex items-center gap-1.5">
                      <ClockIcon className="h-4 w-4" />
                      {booking.startsAt ? formatDateTime(booking.startsAt) : 'дата согласовывается'}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <UsersIcon className="h-4 w-4" /> {booking.peopleCount} чел.
                    </span>
                  </div>
                  {booking.cancelReason ? (
                    <p className="text-bark-500 mt-2 text-xs">Причина отмены: {booking.cancelReason}</p>
                  ) : null}
                </div>
                <p className="text-ink-900 font-display text-xl font-semibold">
                  {formatPrice(booking.totalPrice)}
                </p>
              </div>

              <div className="border-cream-200 mt-4 flex flex-wrap items-center gap-3 border-t pt-4">
                {canCancel(booking) ? (
                  cancelId === booking.id ? (
                    <div className="w-full space-y-3">
                      <label htmlFor={`reason-${booking.id}`} className="text-bark-700 block text-sm font-medium">
                        Почему отменяете? (необязательно)
                      </label>
                      <textarea
                        id={`reason-${booking.id}`}
                        rows={2}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        className="border-sand-300 text-ink-900 focus:border-terra-500 w-full rounded-2xl border bg-white px-4 py-3 text-sm focus:outline-none"
                        placeholder="Изменились планы…"
                      />
                      {error ? <p className="text-terra-700 text-xs font-medium">{error}</p> : null}
                      <div className="flex gap-3">
                        <button
                          onClick={() => cancel.mutate({ id: booking.id, why: reason })}
                          disabled={cancel.isPending}
                          className="bg-terra-500 hover:bg-terra-600 rounded-full px-6 py-2.5 text-sm font-semibold text-white transition disabled:opacity-60"
                        >
                          {cancel.isPending ? 'Отменяем…' : 'Подтвердить отмену'}
                        </button>
                        <button
                          onClick={() => {
                            setCancelId(null);
                            setError(null);
                          }}
                          className="text-bark-600 px-4 py-2.5 text-sm font-semibold"
                        >
                          Передумал
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setCancelId(booking.id)}
                      className="border-bark-600/30 text-bark-800 hover:border-terra-500 hover:text-terra-600 rounded-full border px-5 py-2 text-sm font-semibold transition"
                    >
                      Отменить
                    </button>
                  )
                ) : null}
                {booking.tour && (booking.status === 'cancelled' || booking.status === 'completed') ? (
                  <Link
                    href={`/excursions/${booking.tour.slug}#booking`}
                    className="bg-terra-500 hover:bg-terra-600 rounded-full px-5 py-2 text-sm font-semibold text-white transition"
                  >
                    Забронировать снова
                  </Link>
                ) : null}
                <span className="text-bark-500 ml-auto text-xs">
                  Заявка от {formatDateTime(booking.createdAt)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
